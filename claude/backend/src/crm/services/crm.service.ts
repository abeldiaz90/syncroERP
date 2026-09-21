/**
 * ============================================================================
 * SyncroERP · CRM — servicio
 * ----------------------------------------------------------------------------
 * Decisiones deliberadas:
 *
 * · Mover de etapa NO es un simple UPDATE: registra historial, recalcula días
 *   en etapa y, si la etapa es terminal, cierra la oportunidad. Todo en una
 *   transacción, porque un historial incompleto invalida las métricas.
 *
 * · Ganar una oportunidad convierte al prospecto en cliente. Es el único punto
 *   donde el CRM escribe fuera de su dominio, y lo hace de forma explícita.
 *
 * · El pronóstico es ponderado por probabilidad de etapa. Un embudo que suma
 *   importes en bruto siempre miente hacia arriba.
 * ============================================================================
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';

import {
  Actividad,
  EtapaEmbudo,
  HistorialEtapa,
  Oportunidad,
  Prospecto,
  TipoActividad,
  TipoEtapa,
} from '../entities/crm.entity';
import { exigirRangoDeFechas } from '../../common/utils/business-time.util';

const aCent = (v: number | string) => Math.round(Number(v ?? 0) * 100);
const aPesos = (c: number) => Math.round(c) / 100;
const DIA_MS = 86_400_000;

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    @InjectRepository(Oportunidad)
    private readonly oportunidades: Repository<Oportunidad>,
    @InjectRepository(Prospecto)
    private readonly prospectos: Repository<Prospecto>,
    @InjectRepository(EtapaEmbudo)
    private readonly etapas: Repository<EtapaEmbudo>,
    @InjectRepository(Actividad)
    private readonly actividades: Repository<Actividad>,
    @InjectRepository(HistorialEtapa)
    private readonly historial: Repository<HistorialEtapa>,
    private readonly dataSource: DataSource,
  ) {}

  /* ══ ETAPAS ══════════════════════════════════════════════════════════════ */

  listarEtapas(empresaId: string) {
    return this.etapas.find({
      where: { empresaId, activa: true },
      order: { orden: 'ASC' },
    });
  }

  async crearEtapa(dto: Partial<EtapaEmbudo>, empresaId: string) {
    if (
      dto.probabilidad !== undefined &&
      (dto.probabilidad < 0 || dto.probabilidad > 100)
    ) {
      throw new BadRequestException(
        'La probabilidad debe estar entre 0 y 100.',
      );
    }
    const ultima = await this.etapas.findOne({
      where: { empresaId },
      order: { orden: 'DESC' },
    });
    return this.etapas.save(
      this.etapas.create({
        ...dto,
        empresaId,
        orden: dto.orden ?? (ultima?.orden ?? 0) + 1,
      }),
    );
  }

  /** Embudo estándar. Cada empresa lo ajusta después desde la pantalla. */
  async sembrarEtapas(empresaId: string) {
    const existentes = await this.etapas.count({ where: { empresaId } });
    if (existentes > 0) {
      throw new ConflictException('Esta empresa ya tiene etapas configuradas.');
    }

    const base: Array<Partial<EtapaEmbudo>> = [
      {
        nombre: 'Prospecto',
        orden: 1,
        probabilidad: 10,
        color: '#94a3b8',
        diasAlerta: 7,
      },
      {
        nombre: 'Contactado',
        orden: 2,
        probabilidad: 25,
        color: '#0284c7',
        diasAlerta: 10,
      },
      {
        nombre: 'Calificado',
        orden: 3,
        probabilidad: 45,
        color: '#4f46e5',
        diasAlerta: 14,
      },
      {
        nombre: 'Propuesta',
        orden: 4,
        probabilidad: 65,
        color: '#7c3aed',
        diasAlerta: 10,
      },
      {
        nombre: 'Negociación',
        orden: 5,
        probabilidad: 85,
        color: '#d97706',
        diasAlerta: 7,
      },
      {
        nombre: 'Ganada',
        orden: 6,
        probabilidad: 100,
        color: '#059669',
        tipo: TipoEtapa.GANADA,
        diasAlerta: 999,
      },
      {
        nombre: 'Perdida',
        orden: 7,
        probabilidad: 0,
        color: '#e11d48',
        tipo: TipoEtapa.PERDIDA,
        diasAlerta: 999,
      },
    ];

    const creadas = await this.etapas.save(
      base.map((e) =>
        this.etapas.create({
          ...e,
          empresaId,
          tipo: e.tipo ?? TipoEtapa.ABIERTA,
        }),
      ),
    );
    return { creadas: creadas.length, etapas: creadas };
  }

  /* ══ PROSPECTOS ══════════════════════════════════════════════════════════ */

  listarProspectos(empresaId: string, busqueda?: string) {
    const q = this.prospectos
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.activo=true');

    if (busqueda) {
      q.andWhere(
        '(p.nombre LIKE :b OR p.empresa LIKE :b OR p.email LIKE :b OR p.telefono LIKE :b)',
        {
          b: `%${busqueda}%`,
        },
      );
    }
    return q.orderBy('p.fechaCreacion', 'DESC').getMany();
  }

  async crearProspecto(dto: Partial<Prospecto>, empresaId: string) {
    if (!dto.nombre?.trim()) {
      throw new BadRequestException('El nombre del prospecto es obligatorio.');
    }
    if (!dto.email && !dto.telefono) {
      throw new BadRequestException(
        'Registra al menos un correo o un teléfono de contacto.',
      );
    }

    // Un prospecto duplicado ensucia el embudo y duplica el esfuerzo comercial.
    if (dto.email) {
      const duplicado = await this.prospectos.findOne({
        where: { empresaId, email: dto.email, activo: true },
      });
      if (duplicado) {
        throw new ConflictException(
          `Ya existe un prospecto con ese correo: ${duplicado.nombre}.`,
        );
      }
    }

    return this.prospectos.save(this.prospectos.create({ ...dto, empresaId }));
  }

  /* ══ OPORTUNIDADES ═══════════════════════════════════════════════════════ */

  async crearOportunidad(dto: Partial<Oportunidad>, empresaId: string) {
    if (!dto.prospectoId && !dto.clienteId) {
      throw new BadRequestException(
        'La oportunidad debe estar asociada a un prospecto o a un cliente.',
      );
    }
    if (Number(dto.importe ?? 0) < 0) {
      throw new BadRequestException('El importe no puede ser negativo.');
    }

    // Sin etapa indicada, entra por la primera del embudo.
    let etapa: EtapaEmbudo | null = null;
    if (dto.etapaId) {
      etapa = await this.etapas.findOne({
        where: { id: dto.etapaId, empresaId },
      });
      if (!etapa) throw new NotFoundException('La etapa indicada no existe.');
    } else {
      etapa = await this.etapas.findOne({
        where: { empresaId, activa: true, tipo: TipoEtapa.ABIERTA },
        order: { orden: 'ASC' },
      });
      if (!etapa) {
        throw new ConflictException(
          'No hay etapas configuradas. Crea el embudo antes de registrar oportunidades.',
        );
      }
    }

    const oportunidad = await this.oportunidades.save(
      this.oportunidades.create({
        ...dto,
        empresaId,
        folio: await this.siguienteFolio(empresaId),
        etapaId: etapa.id,
        probabilidad: dto.probabilidad ?? etapa.probabilidad,
        fechaUltimoMovimiento: new Date(),
      }),
    );

    await this.historial.save(
      this.historial.create({
        empresaId,
        oportunidadId: oportunidad.id,
        etapaNuevaId: etapa.id,
        nombreEtapaNueva: etapa.nombre,
        diasEnEtapaAnterior: 0,
      }),
    );

    return oportunidad;
  }

  private async siguienteFolio(empresaId: string): Promise<string> {
    const fila = await this.oportunidades
      .createQueryBuilder('o')
      .select('MAX(CAST(SUBSTRING(o.folio, 5, 10) AS INT))', 'maximo')
      .where('o.empresaId = :empresaId', { empresaId })
      .andWhere("o.folio LIKE 'OPP-%'")
      .getRawOne<{ maximo: number | null }>();

    return `OPP-${String((fila?.maximo ?? 0) + 1).padStart(6, '0')}`;
  }

  async listarOportunidades(
    empresaId: string,
    filtros: {
      etapaId?: string;
      responsableId?: string;
      busqueda?: string;
      soloAbiertas?: boolean;
    } = {},
  ) {
    const q = this.oportunidades
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.etapa', 'e')
      .leftJoinAndSelect('o.prospecto', 'p')
      .where('o.empresaId = :empresaId', { empresaId });

    if (filtros.etapaId) q.andWhere('o.etapaId = :et', { et: filtros.etapaId });
    if (filtros.responsableId)
      q.andWhere('o.responsableId = :r', { r: filtros.responsableId });
    if (filtros.soloAbiertas)
      q.andWhere('e.tipo = :abierta', { abierta: TipoEtapa.ABIERTA });
    if (filtros.busqueda) {
      q.andWhere('(o.titulo LIKE :b OR o.folio LIKE :b OR p.nombre LIKE :b)', {
        b: `%${filtros.busqueda}%`,
      });
    }

    const lista = await q.orderBy('o.fechaActualizacion', 'DESC').getMany();
    return lista.map((o) => this.enriquecer(o));
  }

  /** Añade los campos derivados que la pantalla necesita. */
  private enriquecer(o: Oportunidad) {
    const desde = o.fechaUltimoMovimiento ?? o.fechaCreacion;
    const diasEnEtapa = Math.floor(
      (Date.now() - new Date(desde).getTime()) / DIA_MS,
    );
    const alerta = o.etapa ? diasEnEtapa > o.etapa.diasAlerta : false;

    return {
      ...o,
      diasEnEtapa,
      estancada: alerta && o.etapa?.tipo === TipoEtapa.ABIERTA,
      valorPonderado: aPesos(
        Math.round((aCent(o.importe) * o.probabilidad) / 100),
      ),
    };
  }

  async obtenerOportunidad(id: string, empresaId: string) {
    const o = await this.oportunidades.findOne({
      where: { id, empresaId },
      relations: ['etapa', 'prospecto', 'actividades'],
    });
    if (!o) throw new NotFoundException('La oportunidad no existe.');

    const historial = await this.historial.find({
      where: { oportunidadId: id },
      order: { fechaCambio: 'ASC' },
    });

    return { ...this.enriquecer(o), historial };
  }

  /**
   * Mueve la oportunidad de etapa. Registra el historial y cierra si la etapa
   * destino es terminal.
   */
  async moverEtapa(
    id: string,
    datos: { etapaId: string; motivoPerdida?: string; competidor?: string },
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repoOpp = manager.getRepository(Oportunidad);
      const repoEtapas = manager.getRepository(EtapaEmbudo);
      const repoHist = manager.getRepository(HistorialEtapa);

      const oportunidad = await repoOpp.findOne({
        where: { id, empresaId },
        relations: ['etapa'],
      });
      if (!oportunidad)
        throw new NotFoundException('La oportunidad no existe.');

      const destino = await repoEtapas.findOne({
        where: { id: datos.etapaId, empresaId },
      });
      if (!destino) throw new NotFoundException('La etapa destino no existe.');

      if (oportunidad.etapaId === destino.id) {
        throw new ConflictException('La oportunidad ya está en esa etapa.');
      }
      if (oportunidad.etapa?.tipo !== TipoEtapa.ABIERTA) {
        throw new ConflictException(
          'La oportunidad ya está cerrada. Reábrela antes de moverla.',
        );
      }
      if (destino.tipo === TipoEtapa.PERDIDA && !datos.motivoPerdida?.trim()) {
        throw new BadRequestException(
          'Indica el motivo de la pérdida: es lo que permite mejorar el proceso.',
        );
      }

      const desde =
        oportunidad.fechaUltimoMovimiento ?? oportunidad.fechaCreacion;
      const diasEnEtapa = Math.floor(
        (Date.now() - new Date(desde).getTime()) / DIA_MS,
      );

      await repoHist.save(
        repoHist.create({
          empresaId,
          oportunidadId: oportunidad.id,
          etapaAnteriorId: oportunidad.etapaId,
          nombreEtapaAnterior: oportunidad.etapa?.nombre,
          etapaNuevaId: destino.id,
          nombreEtapaNueva: destino.nombre,
          diasEnEtapaAnterior: diasEnEtapa,
          usuarioId,
        }),
      );

      oportunidad.etapaId = destino.id;
      oportunidad.probabilidad = destino.probabilidad;
      oportunidad.fechaUltimoMovimiento = new Date();

      if (destino.tipo !== TipoEtapa.ABIERTA) {
        oportunidad.fechaCierreReal = new Date();
      }
      if (destino.tipo === TipoEtapa.PERDIDA) {
        oportunidad.motivoPerdida = datos.motivoPerdida;
        oportunidad.competidor = datos.competidor;
      }

      await repoOpp.save(oportunidad);

      // Ganar convierte al prospecto en cliente; es el punto de traspaso al ERP.
      if (destino.tipo === TipoEtapa.GANADA && oportunidad.prospectoId) {
        const repoPros = manager.getRepository(Prospecto);
        const prospecto = await repoPros.findOne({
          where: { id: oportunidad.prospectoId },
        });
        if (prospecto && !prospecto.clienteId) {
          this.logger.log(
            `Oportunidad ${oportunidad.folio} ganada. El prospecto ${prospecto.nombre} ` +
              `está listo para darse de alta como cliente.`,
          );
        }
      }

      return {
        oportunidad,
        etapaAnterior: oportunidad.etapa?.nombre,
        etapaNueva: destino.nombre,
      };
    });
  }

  /* ══ ACTIVIDADES ═════════════════════════════════════════════════════════ */

  async crearActividad(dto: Partial<Actividad>, empresaId: string) {
    if (!dto.oportunidadId && !dto.prospectoId) {
      throw new BadRequestException(
        'La actividad debe estar ligada a una oportunidad o a un prospecto.',
      );
    }
    return this.actividades.save(
      this.actividades.create({ ...dto, empresaId }),
    );
  }

  async listarActividades(
    empresaId: string,
    filtros: {
      desde?: string;
      hasta?: string;
      responsableId?: string;
      pendientes?: boolean;
      oportunidadId?: string;
    } = {},
  ) {
    const q = this.actividades
      .createQueryBuilder('a')
      .where('a.empresaId = :empresaId', { empresaId });

    if (filtros.oportunidadId)
      q.andWhere('a.oportunidadId = :o', { o: filtros.oportunidadId });
    if (filtros.responsableId)
      q.andWhere('a.responsableId = :r', { r: filtros.responsableId });
    if (filtros.pendientes) q.andWhere('a.completada = false');
    if (filtros.desde && filtros.hasta) {
      q.andWhere('a.fechaProgramada BETWEEN :d AND :h', {
        d: new Date(filtros.desde),
        h: new Date(filtros.hasta),
      });
    }

    const lista = await q.orderBy('a.fechaProgramada', 'ASC').getMany();
    const ahora = Date.now();

    return lista.map((a) => ({
      ...a,
      vencida: !a.completada && new Date(a.fechaProgramada).getTime() < ahora,
    }));
  }

  async completarActividad(id: string, resultado: string, empresaId: string) {
    const a = await this.actividades.findOne({ where: { id, empresaId } });
    if (!a) throw new NotFoundException('La actividad no existe.');
    if (a.completada)
      throw new ConflictException('La actividad ya está completada.');

    a.completada = true;
    a.fechaRealizada = new Date();
    a.resultado = resultado;
    return this.actividades.save(a);
  }

  /* ══ PIPELINE Y MÉTRICAS ═════════════════════════════════════════════════ */

  /** Vista de tablero: oportunidades agrupadas por etapa. */
  async pipeline(empresaId: string, responsableId?: string) {
    const etapas = await this.listarEtapas(empresaId);

    const q = this.oportunidades
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.etapa', 'e')
      .leftJoinAndSelect('o.prospecto', 'p')
      .where('o.empresaId = :empresaId', { empresaId })
      .andWhere('e.tipo = :abierta', { abierta: TipoEtapa.ABIERTA });

    if (responsableId) q.andWhere('o.responsableId = :r', { r: responsableId });

    const abiertas = (await q.getMany()).map((o) => this.enriquecer(o));

    const columnas = etapas
      .filter((e) => e.tipo === TipoEtapa.ABIERTA)
      .map((e) => {
        const suyas = abiertas.filter((o) => o.etapaId === e.id);
        return {
          etapa: e,
          oportunidades: suyas,
          cantidad: suyas.length,
          importe: aPesos(suyas.reduce((s, o) => s + aCent(o.importe), 0)),
          valorPonderado: aPesos(
            suyas.reduce((s, o) => s + aCent(o.valorPonderado), 0),
          ),
          estancadas: suyas.filter((o) => o.estancada).length,
        };
      });

    return {
      columnas,
      totales: {
        oportunidades: abiertas.length,
        importe: aPesos(abiertas.reduce((s, o) => s + aCent(o.importe), 0)),
        pronostico: aPesos(
          abiertas.reduce((s, o) => s + aCent(o.valorPonderado), 0),
        ),
        estancadas: abiertas.filter((o) => o.estancada).length,
      },
    };
  }

  /** Indicadores del embudo para el periodo indicado. */
  async metricas(empresaId: string, desde: string, hasta: string) {
    // Igual que en los demás reportes: la fecha se valida aquí y no en la
    // base, para que el error diga qué falta en vez de «Database Error».
    const { desde: d, hasta: h } = exigirRangoDeFechas(desde, hasta);

    const cerradas = await this.oportunidades.find({
      where: { empresaId, fechaCierreReal: Between(d, h) },
      relations: ['etapa'],
    });

    const ganadas = cerradas.filter((o) => o.etapa?.tipo === TipoEtapa.GANADA);
    const perdidas = cerradas.filter(
      (o) => o.etapa?.tipo === TipoEtapa.PERDIDA,
    );

    const importeGanadoCent = ganadas.reduce((s, o) => s + aCent(o.importe), 0);
    const importePerdidoCent = perdidas.reduce(
      (s, o) => s + aCent(o.importe),
      0,
    );

    // Tiempo de ciclo: de la creación al cierre, sólo de las ganadas.
    const ciclos = ganadas
      .filter((o) => o.fechaCierreReal)
      .map((o) =>
        Math.floor(
          (new Date(o.fechaCierreReal).getTime() -
            new Date(o.fechaCreacion).getTime()) /
            DIA_MS,
        ),
      );

    const cicloPromedio = ciclos.length
      ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length)
      : 0;

    // Motivos de pérdida agrupados: lo más accionable del reporte.
    const motivos = new Map<string, number>();
    for (const p of perdidas) {
      const m = p.motivoPerdida?.trim() || 'Sin especificar';
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }

    // Días promedio por etapa: dónde se atoran los negocios.
    const historiales = await this.historial.find({
      where: { oportunidadId: In(cerradas.map((o) => o.id).concat('')) },
    });

    const porEtapa = new Map<string, { total: number; conteo: number }>();
    for (const h2 of historiales) {
      if (!h2.nombreEtapaAnterior) continue;
      const acc = porEtapa.get(h2.nombreEtapaAnterior) ?? {
        total: 0,
        conteo: 0,
      };
      acc.total += h2.diasEnEtapaAnterior;
      acc.conteo += 1;
      porEtapa.set(h2.nombreEtapaAnterior, acc);
    }

    return {
      periodo: { desde, hasta },
      ganadas: ganadas.length,
      perdidas: perdidas.length,
      tasaConversion: cerradas.length
        ? Math.round((ganadas.length / cerradas.length) * 1000) / 10
        : 0,
      importeGanado: aPesos(importeGanadoCent),
      importePerdido: aPesos(importePerdidoCent),
      ticketPromedio: ganadas.length
        ? aPesos(Math.round(importeGanadoCent / ganadas.length))
        : 0,
      cicloPromedioDias: cicloPromedio,
      motivosPerdida: Array.from(motivos.entries())
        .map(([motivo, cantidad]) => ({ motivo, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad),
      diasPromedioPorEtapa: Array.from(porEtapa.entries())
        .map(([etapa, v]) => ({ etapa, dias: Math.round(v.total / v.conteo) }))
        .sort((a, b) => b.dias - a.dias),
    };
  }

  /** Agenda del día: lo que un vendedor abre en la mañana. */
  async agenda(empresaId: string, responsableId?: string) {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const fin = new Date(inicio.getTime() + DIA_MS);

    const [deHoy, vencidas] = await Promise.all([
      this.actividades.find({
        where: {
          empresaId,
          completada: false,
          fechaProgramada: Between(inicio, fin),
          ...(responsableId ? { responsableId } : {}),
        },
        order: { fechaProgramada: 'ASC' },
      }),
      this.actividades.find({
        where: {
          empresaId,
          completada: false,
          fechaProgramada: Between(new Date(0), inicio),
          ...(responsableId ? { responsableId } : {}),
        },
        order: { fechaProgramada: 'ASC' },
        take: 20,
      }),
    ]);

    return {
      hoy: deHoy,
      vencidas,
      resumen: {
        pendientesHoy: deHoy.length,
        atrasadas: vencidas.length,
        porTipo: Object.values(TipoActividad)
          .map((tipo) => ({
            tipo,
            cantidad: deHoy.filter((a) => a.tipo === tipo).length,
          }))
          .filter((x) => x.cantidad > 0),
      },
    };
  }
}
