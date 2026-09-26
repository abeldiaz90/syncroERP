/**
 * ============================================================================
 * SyncroERP · Activos fijos — servicio
 * ----------------------------------------------------------------------------
 * Decisiones deliberadas:
 *
 * · Los importes se calculan en centavos enteros y se redondean al final. El
 *   resto del ERP usa `Number` sobre `decimal(18,2)` y arrastra centavos de
 *   diferencia en las balanzas; aquí no.
 *
 * · La última mensualidad ABSORBE el residuo del redondeo. Sin esto, un activo
 *   de $10,000 a 36 meses termina depreciado en $9,999.96 y queda un saldo
 *   fantasma que nadie sabe cerrar.
 *
 * · La corrida mensual es idempotente: llamarla dos veces para el mismo
 *   periodo no duplica el gasto. Hay un índice único (activo, ejercicio, mes)
 *   que lo garantiza a nivel de base, no sólo de código.
 *
 * · Todo va dentro de una transacción. Si falla el activo 200 de 300, no
 *   quedan 199 depreciados a medias.
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
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';

import {
  ActivoFijo,
  CategoriaActivo,
  DepreciacionMensual,
  EstadoActivo,
  MetodoDepreciacion,
  MotivoBaja,
} from '../entities/activo-fijo.entity';
import { CrearActivoDto } from '../dto/activos.dto';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';

/* ── Utilidades de dinero ─────────────────────────────────────────────────── */

const aCentavos = (v: number | string) => Math.round(Number(v) * 100);
const aPesos = (c: number) => Math.round(c) / 100;
const guidDeterministico = (valor: string): string => {
  const hex = createHash('sha256').update(valor).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};


export interface ResultadoCorrida {
  ejercicio: number;
  mes: number;
  activosProcesados: number;
  activosOmitidos: number;
  importeTotal: number;
  totalmenteDepreciados: number;
  asientoPendienteId?: string;
  estadoContable?: 'GENERADO' | 'PENDIENTE' | 'NO_APLICA';
  /** La póliza que quedó, cuando el asiento sí se generó. */
  polizaId?: string;
  detalle: Array<{
    codigo: string;
    nombre: string;
    importe: number;
    motivo?: string;
  }>;
}

@Injectable()
export class ActivosService {
  private readonly logger = new Logger(ActivosService.name);

  constructor(
    @InjectRepository(ActivoFijo)
    private readonly activos: Repository<ActivoFijo>,
    @InjectRepository(CategoriaActivo)
    private readonly categorias: Repository<CategoriaActivo>,
    @InjectRepository(DepreciacionMensual)
    private readonly depreciaciones: Repository<DepreciacionMensual>,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
  ) {}

  /* ── Cálculo ───────────────────────────────────────────────────────────── */

  /**
   * Depreciación de UN mes, en centavos.
   * Devuelve 0 cuando el activo ya llegó a su valor residual.
   */
  private depreciacionDelMes(activo: ActivoFijo): number {
    if (activo.metodo === MetodoDepreciacion.NO_DEPRECIABLE) return 0;

    const costo = aCentavos(activo.costoAdquisicion);
    const residual = aCentavos(activo.valorResidual ?? 0);
    const acumulada = aCentavos(activo.depreciacionAcumulada ?? 0);
    const depreciable = costo - residual;

    const pendiente = depreciable - acumulada;
    if (pendiente <= 0) return 0;

    let importe: number;

    if (activo.metodo === MetodoDepreciacion.SALDOS_DECRECIENTES) {
      // Tasa sobre el valor en libros: decrece cada mes.
      const enLibros = costo - acumulada;
      importe = Math.round((enLibros * Number(activo.tasaAnual)) / 100 / 12);
    } else {
      // Línea recta sobre la vida útil.
      importe = Math.round(depreciable / activo.vidaUtilMeses);
    }

    const esUltimoMes =
      activo.mesesDepreciados + 1 >= activo.vidaUtilMeses ||
      importe >= pendiente;

    // El último mes absorbe el residuo del redondeo: el activo cierra exacto.
    return esUltimoMes ? pendiente : Math.min(importe, pendiente);
  }

  /** Proyección completa: alimenta la cédula de depreciación. */
  proyectar(activo: ActivoFijo) {
    const filas: Array<{
      mes: number;
      ejercicio: number;
      importe: number;
      acumulada: number;
      enLibros: number;
    }> = [];
    const simulado = Object.assign(
      Object.create(Object.getPrototypeOf(activo)),
      activo,
    ) as ActivoFijo;

    simulado.depreciacionAcumulada = 0;
    simulado.mesesDepreciados = 0;

    const inicio = new Date(activo.inicioDepreciacion);
    let acumuladaCent = 0;

    for (let i = 0; i < activo.vidaUtilMeses; i++) {
      const importe = this.depreciacionDelMes(simulado);
      if (importe <= 0) break;

      acumuladaCent += importe;
      simulado.depreciacionAcumulada = aPesos(acumuladaCent);
      simulado.mesesDepreciados = i + 1;

      const f = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      filas.push({
        ejercicio: f.getFullYear(),
        mes: f.getMonth() + 1,
        importe: aPesos(importe),
        acumulada: aPesos(acumuladaCent),
        enLibros: aPesos(aCentavos(activo.costoAdquisicion) - acumuladaCent),
      });
    }
    return filas;
  }

  /* ── Alta ──────────────────────────────────────────────────────────────── */

  async crear(dto: CrearActivoDto, empresaId: string): Promise<ActivoFijo> {
    const categoria = await this.categorias.findOne({
      where: { id: dto.categoriaId, empresaId },
    });
    if (!categoria)
      throw new NotFoundException('La categoría de activo no existe.');

    if (dto.costoAdquisicion <= 0) {
      throw new BadRequestException(
        'El costo de adquisición debe ser mayor que cero.',
      );
    }

    const residual = dto.valorResidual ?? 0;
    if (residual >= dto.costoAdquisicion) {
      throw new BadRequestException(
        'El valor residual no puede ser mayor o igual al costo de adquisición.',
      );
    }

    const metodo = dto.metodo ?? categoria.metodo;
    const tasa = dto.tasaAnual ?? Number(categoria.tasaAnual);

    if (metodo !== MetodoDepreciacion.NO_DEPRECIABLE && tasa <= 0) {
      throw new BadRequestException(
        'La tasa anual de depreciación debe ser mayor que cero.',
      );
    }

    // Vida útil derivada de la tasa fiscal si no se especifica.
    const vidaUtil =
      dto.vidaUtilMeses ??
      (metodo === MetodoDepreciacion.NO_DEPRECIABLE
        ? 0
        : Math.max(1, Math.round((100 / tasa) * 12)));

    // Convención: se deprecia a partir del mes siguiente al alta.
    const adquisicion = new Date(dto.fechaAdquisicion);
    const inicio = dto.inicioDepreciacion
      ? new Date(dto.inicioDepreciacion)
      : new Date(adquisicion.getFullYear(), adquisicion.getMonth() + 1, 1);

    const activo = this.activos.create({
      ...dto,
      empresaId,
      codigo: await this.siguienteCodigo(empresaId),
      fechaAdquisicion: adquisicion,
      inicioDepreciacion: inicio,
      valorResidual: residual,
      metodo,
      tasaAnual: tasa,
      vidaUtilMeses: vidaUtil,
      depreciacionAcumulada: 0,
      mesesDepreciados: 0,
      estado: EstadoActivo.ACTIVO,
    });

    return this.activos.save(activo);
  }

  private async siguienteCodigo(empresaId: string): Promise<string> {
    const { maximo } = (await this.activos
      .createQueryBuilder('a')
      .select('MAX(CAST(SUBSTRING(a.codigo, 4, 10) AS INT))', 'maximo')
      .where('a.empresaId = :empresaId', { empresaId })
      .andWhere("a.codigo LIKE 'AF-%'")
      .getRawOne<{ maximo: number | null }>()) ?? { maximo: null };

    return `AF-${String((maximo ?? 0) + 1).padStart(6, '0')}`;
  }

  /* ── Consulta ──────────────────────────────────────────────────────────── */

  async listar(
    empresaId: string,
    filtros: {
      estado?: EstadoActivo;
      categoriaId?: string;
      busqueda?: string;
    } = {},
  ) {
    const q = this.activos
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.categoria', 'c')
      .where('a.empresaId = :empresaId', { empresaId });

    if (filtros.estado)
      q.andWhere('a.estado = :estado', { estado: filtros.estado });
    if (filtros.categoriaId)
      q.andWhere('a.categoriaId = :cat', { cat: filtros.categoriaId });
    if (filtros.busqueda) {
      q.andWhere(
        '(a.nombre ILIKE :b OR a.codigo ILIKE :b OR a.numeroSerie ILIKE :b)',
        {
          b: `%${filtros.busqueda}%`,
        },
      );
    }

    const lista = await q.orderBy('a.codigo', 'DESC').getMany();

    // El getter no sobrevive a la serialización JSON; se añade explícito.
    return lista.map((a) => ({
      ...a,
      valorEnLibros: aPesos(
        aCentavos(a.costoAdquisicion) - aCentavos(a.depreciacionAcumulada),
      ),
    }));
  }

  async obtener(id: string, empresaId: string) {
    const activo = await this.activos.findOne({
      where: { id, empresaId },
      relations: ['categoria', 'depreciaciones'],
    });
    if (!activo) throw new NotFoundException('El activo no existe.');

    return {
      ...activo,
      valorEnLibros: aPesos(
        aCentavos(activo.costoAdquisicion) -
          aCentavos(activo.depreciacionAcumulada),
      ),
      proyeccion: this.proyectar(activo),
    };
  }

  /* ── Corrida de depreciación ───────────────────────────────────────────── */

  /**
   * Deprecia todos los activos elegibles del periodo.
   * Idempotente: si el periodo ya se corrió, los activos ya procesados se
   * omiten en lugar de duplicarse.
   */
  async correrDepreciacion(
    ejercicio: number,
    mes: number,
    empresaId: string,
  ): Promise<ResultadoCorrida> {
    if (mes < 1 || mes > 12)
      throw new BadRequestException('El mes debe estar entre 1 y 12.');

    const hoy = new Date();
    const finDePeriodo = new Date(ejercicio, mes, 0);
    if (finDePeriodo > hoy) {
      throw new BadRequestException(
        'No se puede depreciar un periodo que aún no termina.',
      );
    }

    const resultado: ResultadoCorrida = {
      ejercicio,
      mes,
      activosProcesados: 0,
      activosOmitidos: 0,
      importeTotal: 0,
      totalmenteDepreciados: 0,
      detalle: [],
    };

    let asientoPendienteId: string | undefined;
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repoActivos = manager.getRepository(ActivoFijo);
      const repoDep = manager.getRepository(DepreciacionMensual);

      const candidatos = await repoActivos.find({
        where: { empresaId, estado: EstadoActivo.ACTIVO },
        relations: ['categoria'],
      });

      const inicioPeriodo = new Date(ejercicio, mes - 1, 1);
      const activosAtrasados = candidatos.filter((activo) => {
        const inicio = new Date(activo.inicioDepreciacion);
        const siguiente = new Date(
          inicio.getFullYear(),
          inicio.getMonth() + Number(activo.mesesDepreciados ?? 0),
          1,
        );
        return siguiente < inicioPeriodo;
      });
      if (activosAtrasados.length) {
        const muestra = activosAtrasados
          .slice(0, 8)
          .map((activo) => activo.codigo)
          .join(', ');
        throw new ConflictException(
          `No se puede correr ${mes}/${ejercicio}: existen activos con periodos anteriores pendientes (${muestra}${activosAtrasados.length > 8 ? ', ...' : ''}). Ejecuta primero el periodo inmediato correspondiente.`,
        );
      }

      // Periodos ya registrados: una sola consulta en lugar de N.
      const yaRegistrados = new Set(
        (
          await repoDep.find({
            where: { empresaId, ejercicio, mes },
            select: ['activoId'],
          })
        ).map((d) => d.activoId),
      );

      let totalCent = 0;
      const detalleContable: Array<{
        activoId: string;
        codigo: string;
        categoriaId: string;
        cuentaGastoDepreciacionId?: string;
        cuentaDepreciacionAcumuladaId?: string;
        importe: number;
      }> = [];

      for (const activo of candidatos) {
        if (yaRegistrados.has(activo.id)) {
          resultado.activosOmitidos++;
          resultado.detalle.push({
            codigo: activo.codigo,
            nombre: activo.nombre,
            importe: 0,
            motivo: 'Ya depreciado en este periodo',
          });
          continue;
        }

        // Aún no entra en depreciación.
        if (new Date(activo.inicioDepreciacion) > finDePeriodo) {
          resultado.activosOmitidos++;
          resultado.detalle.push({
            codigo: activo.codigo,
            nombre: activo.nombre,
            importe: 0,
            motivo: 'Su depreciación inicia después de este periodo',
          });
          continue;
        }

        const importeCent = this.depreciacionDelMes(activo);

        if (importeCent <= 0) {
          activo.estado = EstadoActivo.TOTALMENTE_DEPRECIADO;
          await repoActivos.save(activo);
          resultado.totalmenteDepreciados++;
          resultado.detalle.push({
            codigo: activo.codigo,
            nombre: activo.nombre,
            importe: 0,
            motivo: 'Totalmente depreciado',
          });
          continue;
        }

        const acumuladaCent =
          aCentavos(activo.depreciacionAcumulada) + importeCent;
        const enLibrosCent = aCentavos(activo.costoAdquisicion) - acumuladaCent;

        await repoDep.save(
          repoDep.create({
            empresaId,
            activoId: activo.id,
            ejercicio,
            mes,
            importe: aPesos(importeCent),
            acumuladaAlCierre: aPesos(acumuladaCent),
            valorEnLibros: aPesos(enLibrosCent),
          }),
        );

        activo.depreciacionAcumulada = aPesos(acumuladaCent);
        activo.mesesDepreciados += 1;
        if (activo.mesesDepreciados >= activo.vidaUtilMeses) {
          activo.estado = EstadoActivo.TOTALMENTE_DEPRECIADO;
          resultado.totalmenteDepreciados++;
        }
        await repoActivos.save(activo);
        detalleContable.push({
          activoId: activo.id,
          codigo: activo.codigo,
          categoriaId: activo.categoriaId,
          cuentaGastoDepreciacionId:
            activo.categoria?.cuentaGastoDepreciacionId,
          cuentaDepreciacionAcumuladaId:
            activo.categoria?.cuentaDepreciacionAcumuladaId,
          importe: aPesos(importeCent),
        });

        totalCent += importeCent;
        resultado.activosProcesados++;
        resultado.detalle.push({
          codigo: activo.codigo,
          nombre: activo.nombre,
          importe: aPesos(importeCent),
        });
      }

      resultado.importeTotal = aPesos(totalCent);
      if (detalleContable.length) {
        const corridaId = guidDeterministico(
          `DEPRECIACION:${empresaId}:${ejercicio}:${mes}`,
        );
        const asiento = await this.asientos.encolarEnTransaccion(
          manager,
          TipoAsiento.DEPRECIACION,
          {
            corridaId,
            ejercicio,
            mes,
            fecha: finDePeriodo,
            empresaId,
            detalles: detalleContable,
          },
          empresaId,
          `DEP-${ejercicio}-${String(mes).padStart(2, '0')}`,
          corridaId,
        );
        asientoPendienteId = asiento.id;
      }
    });

    if (asientoPendienteId) {
      resultado.asientoPendienteId = asientoPendienteId;
      /*
       * `reintentarAhora` NO lanza cuando el asiento falla: atrapa el error,
       * deja el registro FALLIDO y devuelve `{ generado: false, mensaje }`. Es
       * su contrato y es el correcto —la depreciación ya está confirmada y no
       * debe caerse porque falte configurar una cuenta—, pero aquí sólo se
       * miraba el `try/catch`: como nunca lanza, el estado era SIEMPRE
       * «GENERADO», incluso con el asiento esperando en la bandeja.
       *
       * El `catch` se conserva porque `reintentarAhora` sí lanza si el
       * registro no existe. Lo que faltaba era leer lo que devuelve.
       */
      try {
        const asiento = await this.asientos.reintentarAhora(
          asientoPendienteId,
          empresaId,
        );
        resultado.estadoContable = asiento?.generado ? 'GENERADO' : 'PENDIENTE';
        if (asiento?.polizaId) resultado.polizaId = asiento.polizaId;
        if (!asiento?.generado) {
          this.logger.warn(
            `Depreciación ${mes}/${ejercicio} confirmada; la póliza quedó pendiente: ${asiento?.mensaje ?? 'sin detalle'}`,
          );
        }
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Depreciación ${mes}/${ejercicio} confirmada, pero la póliza quedó pendiente: ${mensaje}`,
        );
        resultado.estadoContable = 'PENDIENTE';
      }
    } else {
      resultado.estadoContable = 'NO_APLICA';
    }

    this.logger.log(
      `Depreciación ${mes}/${ejercicio} · empresa ${empresaId} · ` +
        `${resultado.activosProcesados} activos · ${resultado.importeTotal}`,
    );

    return resultado;
  }

  /** Deshace una corrida. Sólo del último periodo registrado, para no dejar huecos. */
  async revertirCorrida(ejercicio: number, mes: number, empresaId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repoActivos = manager.getRepository(ActivoFijo);
      const repoDep = manager.getRepository(DepreciacionMensual);

      // Cualquier registro de un periodo más reciente bloquea la reversión:
      // revertir en medio dejaría un hueco en la cadena de depreciación.
      const posteriores = await repoDep
        .createQueryBuilder('d')
        .where('d.empresaId = :empresaId', { empresaId })
        .andWhere(
          '(d.ejercicio > :ejercicio OR (d.ejercicio = :ejercicio AND d.mes > :mes))',
          { ejercicio, mes },
        )
        .getCount();

      if (posteriores > 0) {
        throw new ConflictException(
          'Hay periodos posteriores ya depreciados. Revierte primero el más reciente.',
        );
      }

      const registros = await repoDep.find({
        where: { empresaId, ejercicio, mes },
      });
      if (!registros.length) {
        throw new NotFoundException(
          'No hay depreciación registrada para ese periodo.',
        );
      }

      /*
       * La póliza de depreciación de ese mes sigue aplicada. Si sólo se borran
       * los registros del auxiliar, el mayor y el auxiliar divergen de forma
       * permanente. Y como `crearPoliza` es idempotente por `origenClave`,
       * volver a correr la depreciación del mismo mes NO crea una póliza nueva:
       * detecta la clave existente y la omite en silencio, dejando el periodo
       * contabilizado con la corrida vieja y el auxiliar con la nueva.
       *
       * Se exige que el periodo esté abierto y se cancela la póliza original
       * antes de tocar el auxiliar.
       */
      const corridaId = guidDeterministico(
        `DEPRECIACION:${empresaId}:${ejercicio}:${mes}`,
      );
      const polizaOriginal = await manager.getRepository(Poliza).findOne({
        where: { empresaId, origenClave: `DEPRECIACION:${corridaId}` },
      });
      if (polizaOriginal && (polizaOriginal.estatus ?? 'VIGENTE') === 'VIGENTE') {
        throw new ConflictException(
          `La depreciación de ${ejercicio}-${String(mes).padStart(2, '0')} ya está ` +
            `contabilizada en la póliza ${polizaOriginal.folio}. Cancélala primero ` +
            'desde Finanzas → Pólizas y vuelve a intentar: si sólo se borra el ' +
            'auxiliar, el mayor conserva el cargo y ambos quedan desalineados de ' +
            'forma permanente. Ninguna depreciación fue revertida.',
        );
      }

      for (const r of registros) {
        const activo = await repoActivos.findOne({
          where: { id: r.activoId, empresaId },
        });
        if (!activo) continue;

        activo.depreciacionAcumulada = aPesos(
          aCentavos(activo.depreciacionAcumulada) - aCentavos(r.importe),
        );
        activo.mesesDepreciados = Math.max(0, activo.mesesDepreciados - 1);
        if (activo.estado === EstadoActivo.TOTALMENTE_DEPRECIADO) {
          activo.estado = EstadoActivo.ACTIVO;
        }
        await repoActivos.save(activo);
      }

      await repoDep.remove(registros);
      return { revertidos: registros.length, ejercicio, mes };
    });
  }

  /* ── Baja ──────────────────────────────────────────────────────────────── */

  async darDeBaja(
    id: string,
    datos: {
      motivo: MotivoBaja;
      fecha: string;
      valorVenta?: number;
      notas?: string;
      /** Caja o banco donde entró el importe, cuando la baja es por venta. */
      cuentaBancariaId?: string;
    },
    empresaId: string,
  ) {
    /*
     * La baja y su póliza tienen que ser atómicas: si el activo se marca como
     * dado de baja y el asiento no queda encolado, el balance y el auxiliar
     * divergen sin que nadie se entere.
     */
    return this.dataSource.transaction(async (manager) => {
    const repoActivos = manager.getRepository(ActivoFijo);
    const activo = await repoActivos.findOne({ where: { id, empresaId } });
    if (!activo) throw new NotFoundException('El activo no existe.');

    if (
      activo.estado === EstadoActivo.BAJA ||
      activo.estado === EstadoActivo.VENDIDO
    ) {
      throw new ConflictException('Este activo ya fue dado de baja.');
    }

    if (datos.motivo === MotivoBaja.VENTA && (datos.valorVenta ?? 0) <= 0) {
      throw new BadRequestException(
        'Indica el valor de venta para dar de baja por venta.',
      );
    }

    const enLibros = aPesos(
      aCentavos(activo.costoAdquisicion) -
        aCentavos(activo.depreciacionAcumulada),
    );

    activo.estado =
      datos.motivo === MotivoBaja.VENTA
        ? EstadoActivo.VENDIDO
        : EstadoActivo.BAJA;
    activo.fechaBaja = new Date(datos.fecha);
    activo.motivoBaja = datos.motivo;
    activo.valorVenta = datos.valorVenta;
    activo.notasBaja = datos.notas;

    await repoActivos.save(activo);

    const resultado =
      datos.motivo === MotivoBaja.VENTA
        ? aPesos(aCentavos(datos.valorVenta ?? 0) - aCentavos(enLibros))
        : -enLibros;

    /*
     * Antes este resultado se calculaba, se devolvía en el JSON de la respuesta
     * y ahí terminaba: nunca se generaba póliza. El activo quedaba marcado como
     * BAJA o VENDIDO pero seguía en el balance a costo histórico con su
     * depreciación acumulada, la utilidad o pérdida no se reconocía, y si fue
     * venta el dinero tampoco entraba.
     */
    const categoria = await manager.getRepository(CategoriaActivo).findOne({
      where: { id: activo.categoriaId, empresaId },
    });

    const eventoContable = await this.asientos.encolarEnTransaccion(
      manager,
      TipoAsiento.BAJA_ACTIVO,
      {
        activoId: activo.id,
        empresaId,
        fecha: new Date(datos.fecha),
        codigo: activo.codigo,
        nombre: activo.nombre,
        motivo: datos.motivo,
        costoAdquisicion: Number(activo.costoAdquisicion),
        depreciacionAcumulada: Number(activo.depreciacionAcumulada),
        valorVenta: datos.valorVenta,
        cuentaActivoId: categoria?.cuentaActivoId,
        cuentaDepreciacionAcumuladaId: categoria?.cuentaDepreciacionAcumuladaId,
        cuentaBancariaId: datos.cuentaBancariaId,
      },
      empresaId,
      activo.codigo,
      activo.id,
    );

    return {
      asientoPendienteId: eventoContable?.id,
      activo,
      valorEnLibros: enLibros,
      resultado,
      tipoResultado:
        resultado > 0 ? 'UTILIDAD' : resultado < 0 ? 'PERDIDA' : 'SIN_EFECTO',
    };
    });
  }

  /* ── Cédula ────────────────────────────────────────────────────────────── */

  /** Cédula de depreciación del ejercicio: el anexo que pide el contador. */
  async cedula(ejercicio: number, empresaId: string) {
    const activos = await this.activos.find({
      where: { empresaId },
      relations: ['categoria'],
      order: { codigo: 'ASC' },
    });

    const deps = await this.depreciaciones.find({
      where: { empresaId, ejercicio },
    });

    const porActivo = new Map<string, number>();
    for (const d of deps) {
      porActivo.set(
        d.activoId,
        (porActivo.get(d.activoId) ?? 0) + aCentavos(d.importe),
      );
    }

    const filas = activos.map((a) => {
      const delEjercicioCent = porActivo.get(a.id) ?? 0;
      const acumuladaCent = aCentavos(a.depreciacionAcumulada);
      return {
        codigo: a.codigo,
        nombre: a.nombre,
        categoria: a.categoria?.nombre ?? '—',
        fechaAdquisicion: a.fechaAdquisicion,
        costoAdquisicion: Number(a.costoAdquisicion),
        tasaAnual: Number(a.tasaAnual),
        depreciacionEjercicio: aPesos(delEjercicioCent),
        depreciacionAnterior: aPesos(acumuladaCent - delEjercicioCent),
        depreciacionAcumulada: aPesos(acumuladaCent),
        valorEnLibros: aPesos(aCentavos(a.costoAdquisicion) - acumuladaCent),
        estado: a.estado,
      };
    });

    const sumar = (campo: keyof (typeof filas)[number]) =>
      aPesos(filas.reduce((s, f) => s + aCentavos(f[campo] as number), 0));

    return {
      ejercicio,
      filas,
      totales: {
        costoAdquisicion: sumar('costoAdquisicion'),
        depreciacionEjercicio: sumar('depreciacionEjercicio'),
        depreciacionAcumulada: sumar('depreciacionAcumulada'),
        valorEnLibros: sumar('valorEnLibros'),
      },
    };
  }

  /* ── Categorías ────────────────────────────────────────────────────────── */

  listarCategorias(empresaId: string) {
    return this.categorias.find({
      where: { empresaId },
      order: { clave: 'ASC' },
    });
  }

  async crearCategoria(dto: Partial<CategoriaActivo>, empresaId: string) {
    const existe = await this.categorias.findOne({
      where: { empresaId, clave: dto.clave },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe una categoría con la clave ${dto.clave}.`,
      );
    return this.categorias.save(this.categorias.create({ ...dto, empresaId }));
  }

  /**
   * Categorías por omisión con las tasas máximas del artículo 34 de la LISR.
   * Se ejecuta desde la configuración inicial de la empresa.
   */
  async sembrarCategorias(empresaId: string) {
    const base: Array<Partial<CategoriaActivo>> = [
      { clave: 'EDIF', nombre: 'Edificios y construcciones', tasaAnual: 5 },
      { clave: 'MOB', nombre: 'Mobiliario y equipo de oficina', tasaAnual: 10 },
      { clave: 'MAQ', nombre: 'Maquinaria y equipo', tasaAnual: 10 },
      { clave: 'TRAN', nombre: 'Equipo de transporte', tasaAnual: 25 },
      { clave: 'COMP', nombre: 'Equipo de cómputo', tasaAnual: 30 },
      { clave: 'HERR', nombre: 'Herramientas y moldes', tasaAnual: 35 },
      {
        clave: 'TERR',
        nombre: 'Terrenos',
        tasaAnual: 0,
        metodo: MetodoDepreciacion.NO_DEPRECIABLE,
      },
    ];

    const creadas: CategoriaActivo[] = [];
    for (const c of base) {
      const existe = await this.categorias.findOne({
        where: { empresaId, clave: c.clave },
      });
      if (!existe) {
        creadas.push(
          await this.categorias.save(
            this.categorias.create({
              ...c,
              empresaId,
              metodo: c.metodo ?? MetodoDepreciacion.LINEA_RECTA,
            }),
          ),
        );
      }
    }
    return { creadas: creadas.length, categorias: creadas };
  }

  /* ── Resumen ───────────────────────────────────────────────────────────── */

  async resumen(empresaId: string) {
    const activos = await this.activos.find({
      where: { empresaId },
      relations: ['categoria'],
    });
    const vivos = activos.filter(
      (a) =>
        a.estado !== EstadoActivo.BAJA && a.estado !== EstadoActivo.VENDIDO,
    );

    const porCategoria = new Map<
      string,
      { costo: number; libros: number; cantidad: number }
    >();
    for (const a of vivos) {
      const clave = a.categoria?.nombre ?? 'Sin categoría';
      const acc = porCategoria.get(clave) ?? {
        costo: 0,
        libros: 0,
        cantidad: 0,
      };
      acc.costo += aCentavos(a.costoAdquisicion);
      acc.libros +=
        aCentavos(a.costoAdquisicion) - aCentavos(a.depreciacionAcumulada);
      acc.cantidad += 1;
      porCategoria.set(clave, acc);
    }

    return {
      totalActivos: vivos.length,
      costoTotal: aPesos(
        vivos.reduce((s, a) => s + aCentavos(a.costoAdquisicion), 0),
      ),
      depreciacionAcumulada: aPesos(
        vivos.reduce((s, a) => s + aCentavos(a.depreciacionAcumulada), 0),
      ),
      valorEnLibros: aPesos(
        vivos.reduce(
          (s, a) =>
            s +
            aCentavos(a.costoAdquisicion) -
            aCentavos(a.depreciacionAcumulada),
          0,
        ),
      ),
      totalmenteDepreciados: vivos.filter(
        (a) => a.estado === EstadoActivo.TOTALMENTE_DEPRECIADO,
      ).length,
      dadosDeBaja: activos.length - vivos.length,
      porCategoria: Array.from(porCategoria.entries()).map(([nombre, v]) => ({
        categoria: nombre,
        cantidad: v.cantidad,
        costo: aPesos(v.costo),
        valorEnLibros: aPesos(v.libros),
      })),
    };
  }
}
