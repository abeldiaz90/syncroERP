/**
 * ============================================================================
 * SyncroERP · Recursos humanos — servicio
 * ----------------------------------------------------------------------------
 * Decisiones deliberadas:
 *
 * · Las tarifas de ISR y las cuotas del IMSS NO están escritas en el código.
 *   Cambian cada año por publicación en el DOF; si van fijas, el módulo nace
 *   caducado. Viven en `data/tarifas-fiscales.ts` con el ejercicio como llave,
 *   y el cálculo falla con un mensaje claro si no hay tarifa cargada para el
 *   año en curso, en lugar de calcular mal en silencio.
 *
 * · Todo en centavos enteros. Una nómina de 200 empleados con redondeo por
 *   flotante acumula pesos de diferencia contra el pago real del banco.
 *
 * · El cálculo del periodo es idempotente y transaccional: recalcular borra
 *   los recibos previos del periodo y los rehace. Nunca quedan duplicados ni
 *   un periodo a medio calcular.
 *
 * · Un periodo CERRADO no se puede recalcular. Es el punto sin retorno.
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
  Asistencia,
  ConceptoNomina,
  Empleado,
  EstadoEmpleado,
  EstadoPeriodo,
  Incidencia,
  NaturalezaConcepto,
  PartidaRecibo,
  PeriodoNomina,
  Puesto,
  ReciboNomina,
  RegimenPago,
  TipoIncidencia,
} from '../entities/rrhh.entity';
import { obtenerTarifas } from '../data/tarifas-fiscales';

const aCent = (v: number | string) => Math.round(Number(v ?? 0) * 100);
const aPesos = (c: number) => Math.round(c) / 100;

/** Días naturales que cubre cada régimen de pago. */
const DIAS_POR_REGIMEN: Record<RegimenPago, number> = {
  [RegimenPago.SEMANAL]: 7,
  [RegimenPago.CATORCENAL]: 14,
  [RegimenPago.QUINCENAL]: 15,
  [RegimenPago.MENSUAL]: 30,
};

export interface ResultadoCalculo {
  periodoId: string;
  empleadosCalculados: number;
  totalPercepciones: number;
  totalDeducciones: number;
  totalNeto: number;
  advertencias: string[];
}

@Injectable()
export class RrhhService {
  private readonly logger = new Logger(RrhhService.name);

  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Puesto) private readonly puestos: Repository<Puesto>,
    @InjectRepository(Asistencia)
    private readonly asistencias: Repository<Asistencia>,
    @InjectRepository(Incidencia)
    private readonly incidencias: Repository<Incidencia>,
    @InjectRepository(ConceptoNomina)
    private readonly conceptos: Repository<ConceptoNomina>,
    @InjectRepository(PeriodoNomina)
    private readonly periodos: Repository<PeriodoNomina>,
    @InjectRepository(ReciboNomina)
    private readonly recibos: Repository<ReciboNomina>,
    private readonly dataSource: DataSource,
  ) {}

  /* ══ EMPLEADOS ═══════════════════════════════════════════════════════════ */

  async listarEmpleados(
    empresaId: string,
    filtros: {
      estado?: EstadoEmpleado;
      departamentoId?: string;
      busqueda?: string;
    } = {},
  ) {
    const q = this.empleados
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.puesto', 'p')
      .where('e.empresaId = :empresaId', { empresaId });

    if (filtros.estado)
      q.andWhere('e.estado = :estado', { estado: filtros.estado });
    if (filtros.departamentoId)
      q.andWhere('e.departamentoId = :d', { d: filtros.departamentoId });
    if (filtros.busqueda) {
      q.andWhere(
        '(e.nombres LIKE :b OR e.apellidoPaterno LIKE :b OR e.numeroEmpleado LIKE :b OR e.rfc LIKE :b)',
        { b: `%${filtros.busqueda}%` },
      );
    }

    const lista = await q.orderBy('e.numeroEmpleado', 'ASC').getMany();
    return lista.map((e) => ({ ...e, nombreCompleto: this.nombreCompleto(e) }));
  }

  private nombreCompleto(e: Empleado): string {
    return [e.nombres, e.apellidoPaterno, e.apellidoMaterno]
      .filter(Boolean)
      .join(' ');
  }

  async obtenerEmpleado(id: string, empresaId: string) {
    const e = await this.empleados.findOne({
      where: { id, empresaId },
      relations: ['puesto'],
    });
    if (!e) throw new NotFoundException('El empleado no existe.');

    const antiguedadDias = Math.floor(
      (Date.now() - new Date(e.fechaIngreso).getTime()) / 86_400_000,
    );

    return {
      ...e,
      nombreCompleto: this.nombreCompleto(e),
      antiguedadAnios: Math.floor(antiguedadDias / 365),
      diasVacaciones: this.diasVacacionesPorLey(
        Math.floor(antiguedadDias / 365),
      ),
    };
  }

  /**
   * Vacaciones según la reforma de 2023 a la LFT (art. 76): 12 días el primer
   * año, +2 por año hasta el quinto; después +2 cada cinco años.
   */
  private diasVacacionesPorLey(anios: number): number {
    if (anios < 1) return 0;
    if (anios <= 5) return 12 + (anios - 1) * 2;
    return 22 + Math.floor((anios - 6) / 5) * 2;
  }

  async crearEmpleado(dto: Partial<Empleado>, empresaId: string) {
    if (!dto.salarioDiario || Number(dto.salarioDiario) <= 0) {
      throw new BadRequestException(
        'El salario diario debe ser mayor que cero.',
      );
    }

    if (dto.curp) {
      const duplicado = await this.empleados.findOne({
        where: { empresaId, curp: dto.curp },
      });
      if (duplicado) {
        throw new ConflictException(
          `La CURP ya está registrada para el empleado ${duplicado.numeroEmpleado}.`,
        );
      }
    }

    // Si no se indica SBC, se estima con el factor de integración mínimo:
    // 15 días de aguinaldo + 25 % de prima sobre 12 días de vacaciones.
    const salarioDiario = Number(dto.salarioDiario);
    const sbc = dto.salarioDiarioIntegrado
      ? Number(dto.salarioDiarioIntegrado)
      : aPesos(Math.round(aCent(salarioDiario) * 1.0452));

    const empleado = this.empleados.create({
      ...dto,
      empresaId,
      numeroEmpleado:
        dto.numeroEmpleado ?? (await this.siguienteNumeroEmpleado(empresaId)),
      salarioDiarioIntegrado: sbc,
      estado: EstadoEmpleado.ACTIVO,
    });

    return this.empleados.save(empleado);
  }

  private async siguienteNumeroEmpleado(empresaId: string): Promise<string> {
    const fila = await this.empleados
      .createQueryBuilder('e')
      .select('MAX(CAST(e.numeroEmpleado AS INT))', 'maximo')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('ISNUMERIC(e.numeroEmpleado) = 1')
      .getRawOne<{ maximo: number | null }>();

    return String((fila?.maximo ?? 0) + 1).padStart(4, '0');
  }

  async actualizarEmpleado(
    id: string,
    dto: Partial<Empleado>,
    empresaId: string,
  ) {
    const e = await this.empleados.findOne({ where: { id, empresaId } });
    if (!e) throw new NotFoundException('El empleado no existe.');

    // El número de empleado y la empresa no se cambian por PATCH.
    delete (dto as Record<string, unknown>).empresaId;
    delete (dto as Record<string, unknown>).id;

    Object.assign(e, dto);
    return this.empleados.save(e);
  }

  async darDeBajaEmpleado(
    id: string,
    datos: { fecha: string; motivo: string },
    empresaId: string,
  ) {
    const e = await this.empleados.findOne({ where: { id, empresaId } });
    if (!e) throw new NotFoundException('El empleado no existe.');
    if (e.estado === EstadoEmpleado.BAJA) {
      throw new ConflictException('El empleado ya está dado de baja.');
    }

    e.estado = EstadoEmpleado.BAJA;
    e.fechaBaja = new Date(datos.fecha);
    e.motivoBaja = datos.motivo;
    await this.empleados.save(e);

    return { empleado: e, finiquito: this.calcularFiniquito(e) };
  }

  /**
   * Finiquito: partes proporcionales de aguinaldo, vacaciones y prima
   * vacacional. No incluye indemnización, que depende de la causa de la baja
   * y debe determinarla el área legal.
   */
  private calcularFiniquito(e: Empleado) {
    const ingreso = new Date(e.fechaIngreso);
    const baja = e.fechaBaja ? new Date(e.fechaBaja) : new Date();
    const salarioCent = aCent(e.salarioDiario);

    const inicioAnio = new Date(baja.getFullYear(), 0, 1);
    const desde = ingreso > inicioAnio ? ingreso : inicioAnio;
    const diasTrabajadosAnio = Math.max(
      0,
      Math.floor((baja.getTime() - desde.getTime()) / 86_400_000),
    );

    const aniosCumplidos = Math.floor(
      (baja.getTime() - ingreso.getTime()) / (365 * 86_400_000),
    );

    const aguinaldoCent = Math.round(
      (salarioCent * e.diasAguinaldo * diasTrabajadosAnio) / 365,
    );
    const diasVac = this.diasVacacionesPorLey(aniosCumplidos || 1);
    const vacacionesCent = Math.round(
      (salarioCent * diasVac * diasTrabajadosAnio) / 365,
    );
    const primaCent = Math.round(
      (vacacionesCent * Number(e.primaVacacional)) / 100,
    );

    return {
      diasTrabajadosEnElAnio: diasTrabajadosAnio,
      aguinaldoProporcional: aPesos(aguinaldoCent),
      vacacionesProporcionales: aPesos(vacacionesCent),
      primaVacacional: aPesos(primaCent),
      total: aPesos(aguinaldoCent + vacacionesCent + primaCent),
      nota: 'No incluye indemnización ni prima de antigüedad; dependen de la causa de la baja.',
    };
  }

  /* ══ PUESTOS ═════════════════════════════════════════════════════════════ */

  listarPuestos(empresaId: string) {
    return this.puestos.find({ where: { empresaId }, order: { clave: 'ASC' } });
  }

  async crearPuesto(dto: Partial<Puesto>, empresaId: string) {
    const existe = await this.puestos.findOne({
      where: { empresaId, clave: dto.clave },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe un puesto con la clave ${dto.clave}.`,
      );
    return this.puestos.save(this.puestos.create({ ...dto, empresaId }));
  }

  /* ══ ASISTENCIA ══════════════════════════════════════════════════════════ */

  async registrarAsistencia(
    dto: {
      empleadoId: string;
      fecha: string;
      entrada?: string;
      salida?: string;
      observaciones?: string;
    },
    empresaId: string,
  ) {
    const empleado = await this.empleados.findOne({
      where: { id: dto.empleadoId, empresaId },
    });
    if (!empleado) throw new NotFoundException('El empleado no existe.');

    const fecha = new Date(dto.fecha);
    let registro = await this.asistencias.findOne({
      where: { empleadoId: dto.empleadoId, fecha },
    });

    if (!registro) {
      registro = this.asistencias.create({
        empresaId,
        empleadoId: dto.empleadoId,
        fecha,
      });
    }

    if (dto.entrada) registro.entrada = new Date(dto.entrada);
    if (dto.salida) registro.salida = new Date(dto.salida);
    if (dto.observaciones) registro.observaciones = dto.observaciones;

    if (registro.entrada && registro.salida) {
      if (registro.salida <= registro.entrada) {
        throw new BadRequestException(
          'La hora de salida debe ser posterior a la de entrada.',
        );
      }
      const horas =
        (registro.salida.getTime() - registro.entrada.getTime()) / 3_600_000;
      registro.horasTrabajadas = Math.round(horas * 100) / 100;
      // Jornada legal máxima diurna: 8 horas.
      registro.horasExtra = Math.max(0, Math.round((horas - 8) * 100) / 100);
    }

    return this.asistencias.save(registro);
  }

  listarAsistencias(
    empresaId: string,
    desde: string,
    hasta: string,
    empleadoId?: string,
  ) {
    return this.asistencias.find({
      where: {
        empresaId,
        fecha: Between(new Date(desde), new Date(hasta)),
        ...(empleadoId ? { empleadoId } : {}),
      },
      order: { fecha: 'DESC' },
    });
  }

  /* ══ INCIDENCIAS ═════════════════════════════════════════════════════════ */

  async crearIncidencia(dto: Partial<Incidencia>, empresaId: string) {
    const inicio = new Date(dto.fechaInicio);
    const fin = new Date(dto.fechaFin);
    if (fin < inicio) {
      throw new BadRequestException(
        'La fecha final no puede ser anterior a la inicial.',
      );
    }

    const dias =
      Math.floor((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;

    // Traslape con otra incidencia del mismo empleado: casi siempre es un
    // error de captura y descuadra la nómina.
    const traslape = await this.incidencias
      .createQueryBuilder('i')
      .where('i.empleadoId = :emp', { emp: dto.empleadoId })
      .andWhere('i.fechaInicio <= :fin AND i.fechaFin >= :inicio', {
        inicio,
        fin,
      })
      .getCount();

    if (traslape > 0) {
      throw new ConflictException(
        'El empleado ya tiene una incidencia registrada en ese rango de fechas.',
      );
    }

    // Falta y permiso sin goce no se pagan; el resto sí.
    const noPagadas = [TipoIncidencia.FALTA, TipoIncidencia.PERMISO_SIN_GOCE];

    return this.incidencias.save(
      this.incidencias.create({
        ...dto,
        empresaId,
        dias: dto.dias ?? dias,
        pagada: dto.pagada ?? !noPagadas.includes(dto.tipo),
      }),
    );
  }

  listarIncidencias(
    empresaId: string,
    desde?: string,
    hasta?: string,
    empleadoId?: string,
  ) {
    const q = this.incidencias
      .createQueryBuilder('i')
      .where('i.empresaId = :empresaId', { empresaId });

    if (desde && hasta) {
      q.andWhere('i.fechaInicio <= :hasta AND i.fechaFin >= :desde', {
        desde: new Date(desde),
        hasta: new Date(hasta),
      });
    }
    if (empleadoId) q.andWhere('i.empleadoId = :emp', { emp: empleadoId });

    return q.orderBy('i.fechaInicio', 'DESC').getMany();
  }

  async aprobarIncidencia(id: string, usuarioId: string, empresaId: string) {
    const i = await this.incidencias.findOne({ where: { id, empresaId } });
    if (!i) throw new NotFoundException('La incidencia no existe.');
    i.aprobada = true;
    i.aprobadaPorId = usuarioId;
    i.fechaAprobacion = new Date();
    return this.incidencias.save(i);
  }

  /* ══ CONCEPTOS ═══════════════════════════════════════════════════════════ */

  listarConceptos(empresaId: string) {
    return this.conceptos.find({
      where: { empresaId },
      order: { naturaleza: 'ASC', clave: 'ASC' },
    });
  }

  /** Conceptos mínimos para operar. Se llama desde la configuración inicial. */
  async sembrarConceptos(empresaId: string) {
    const base: Array<Partial<ConceptoNomina>> = [
      {
        clave: 'P001',
        nombre: 'Sueldo',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '001',
        esFijo: true,
      },
      {
        clave: 'P002',
        nombre: 'Horas extra',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '019',
      },
      {
        clave: 'P003',
        nombre: 'Prima dominical',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '020',
      },
      {
        clave: 'P004',
        nombre: 'Aguinaldo',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '002',
      },
      {
        clave: 'P005',
        nombre: 'Prima vacacional',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '021',
      },
      {
        clave: 'P006',
        nombre: 'Bono de puntualidad',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '010',
      },
      {
        clave: 'D001',
        nombre: 'ISR retenido',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '002',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D002',
        nombre: 'IMSS obrero',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '001',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D003',
        nombre: 'Faltas',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '006',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D004',
        nombre: 'Préstamo',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '004',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'O001',
        nombre: 'Subsidio para el empleo',
        naturaleza: NaturalezaConcepto.OTRO_PAGO,
        claveSat: '002',
        gravaIsr: false,
        integraSbc: false,
      },
    ];

    let creados = 0;
    for (const c of base) {
      const existe = await this.conceptos.findOne({
        where: { empresaId, clave: c.clave },
      });
      if (!existe) {
        await this.conceptos.save(this.conceptos.create({ ...c, empresaId }));
        creados++;
      }
    }
    return { creados };
  }

  /* ══ PERIODOS Y CÁLCULO DE NÓMINA ════════════════════════════════════════ */

  async crearPeriodo(
    dto: {
      ejercicio: number;
      numero: number;
      regimen: RegimenPago;
      fechaInicio: string;
      fechaFin: string;
      fechaPago: string;
    },
    empresaId: string,
  ) {
    const existe = await this.periodos.findOne({
      where: { empresaId, ejercicio: dto.ejercicio, numero: dto.numero },
    });
    if (existe) {
      throw new ConflictException(
        `El periodo ${dto.numero} del ejercicio ${dto.ejercicio} ya existe.`,
      );
    }

    const inicio = new Date(dto.fechaInicio);
    const fin = new Date(dto.fechaFin);
    if (fin < inicio) {
      throw new BadRequestException(
        'La fecha final del periodo no puede ser anterior a la inicial.',
      );
    }

    return this.periodos.save(
      this.periodos.create({
        ...dto,
        empresaId,
        fechaInicio: inicio,
        fechaFin: fin,
        fechaPago: new Date(dto.fechaPago),
        diasPeriodo: DIAS_POR_REGIMEN[dto.regimen],
        estado: EstadoPeriodo.ABIERTO,
      }),
    );
  }

  listarPeriodos(empresaId: string, ejercicio?: number) {
    return this.periodos.find({
      where: { empresaId, ...(ejercicio ? { ejercicio } : {}) },
      order: { ejercicio: 'DESC', numero: 'DESC' },
    });
  }

  /**
   * Calcula la nómina completa del periodo.
   * Recalcular es seguro: borra los recibos anteriores del periodo y los rehace
   * dentro de la misma transacción.
   */
  async calcularNomina(
    periodoId: string,
    empresaId: string,
  ): Promise<ResultadoCalculo> {
    const periodo = await this.periodos.findOne({
      where: { id: periodoId, empresaId },
    });
    if (!periodo)
      throw new NotFoundException('El periodo de nómina no existe.');

    if (periodo.estado === EstadoPeriodo.CERRADO) {
      throw new ConflictException(
        'El periodo está cerrado. Para modificarlo hay que reabrirlo primero.',
      );
    }
    if (periodo.estado === EstadoPeriodo.CANCELADO) {
      throw new ConflictException('El periodo está cancelado.');
    }

    // Si no hay tarifa del ejercicio, es mejor fallar que calcular mal.
    const tarifas = obtenerTarifas(periodo.ejercicio);

    const advertencias: string[] = [];
    let totalPercCent = 0,
      totalDeducCent = 0,
      calculados = 0;

    await this.dataSource.transaction(async (manager) => {
      const repoRecibos = manager.getRepository(ReciboNomina);
      const repoPartidas = manager.getRepository(PartidaRecibo);
      const repoPeriodos = manager.getRepository(PeriodoNomina);

      // Recálculo limpio.
      const previos = await repoRecibos.find({ where: { periodoId } });
      if (previos.length) {
        await repoPartidas.delete({ reciboId: In(previos.map((r) => r.id)) });
        await repoRecibos.remove(previos);
      }

      const plantilla = await manager.getRepository(Empleado).find({
        where: {
          empresaId,
          estado: In([
            EstadoEmpleado.ACTIVO,
            EstadoEmpleado.VACACIONES,
            EstadoEmpleado.INCAPACIDAD,
          ]),
        },
      });

      if (!plantilla.length) {
        advertencias.push('No hay empleados activos para calcular.');
        return;
      }

      // Incidencias del periodo, en una sola consulta.
      const incidencias = await manager
        .getRepository(Incidencia)
        .createQueryBuilder('i')
        .where('i.empresaId = :empresaId', { empresaId })
        .andWhere('i.fechaInicio <= :fin AND i.fechaFin >= :inicio', {
          inicio: periodo.fechaInicio,
          fin: periodo.fechaFin,
        })
        .getMany();

      const porEmpleado = new Map<string, Incidencia[]>();
      for (const i of incidencias) {
        if (!porEmpleado.has(i.empleadoId)) porEmpleado.set(i.empleadoId, []);
        porEmpleado.get(i.empleadoId).push(i);
      }

      for (const emp of plantilla) {
        // Empleado que ingresó o salió a media quincena: días proporcionales.
        const diasBase = this.diasEfectivos(emp, periodo);
        if (diasBase <= 0) continue;

        const inc = porEmpleado.get(emp.id) ?? [];
        const diasNoPagados = inc
          .filter((i) => !i.pagada)
          .reduce((s, i) => s + Number(i.dias), 0);

        const diasPagados = Math.max(0, diasBase - diasNoPagados);
        if (diasPagados === 0) {
          advertencias.push(
            `${this.nombreCompleto(emp)} no tiene días pagados en el periodo (faltas o permisos sin goce).`,
          );
        }

        const salarioCent = aCent(emp.salarioDiario);
        const partidas: Array<Partial<PartidaRecibo>> = [];

        /* — Percepciones — */
        const sueldoCent = salarioCent * diasPagados;
        partidas.push({
          clave: 'P001',
          concepto: 'Sueldo',
          naturaleza: NaturalezaConcepto.PERCEPCION,
          cantidad: diasPagados,
          importeGravado: aPesos(sueldoCent),
          importeExento: 0,
          importe: aPesos(sueldoCent),
        });

        // Horas extra: dobles hasta 9 semanales, triples el excedente.
        const horasExtra = inc
          .filter((i) => i.tipo === TipoIncidencia.HORAS_EXTRA)
          .reduce((s, i) => s + Number(i.horas), 0);

        let extraCent = 0;
        if (horasExtra > 0) {
          const valorHoraCent = Math.round(salarioCent / 8);
          const dobles = Math.min(horasExtra, 9);
          const triples = Math.max(0, horasExtra - 9);
          extraCent = Math.round(valorHoraCent * (dobles * 2 + triples * 3));

          // Las horas dobles están exentas al 50 % hasta 5 salarios mínimos.
          const exentoCent = Math.min(
            Math.round(extraCent / 2),
            aCent(tarifas.uma * 5),
          );

          partidas.push({
            clave: 'P002',
            concepto: 'Horas extra',
            naturaleza: NaturalezaConcepto.PERCEPCION,
            cantidad: horasExtra,
            importeGravado: aPesos(extraCent - exentoCent),
            importeExento: aPesos(exentoCent),
            importe: aPesos(extraCent),
          });
        }

        const percepcionesCent = sueldoCent + extraCent;
        const gravableCent = partidas.reduce(
          (s, p) => s + aCent(p.importeGravado ?? 0),
          0,
        );

        /* — Deducciones — */
        const isrCent = this.calcularIsr(
          gravableCent,
          periodo.diasPeriodo,
          tarifas,
        );
        const imssCent = this.calcularImss(
          aCent(emp.salarioDiarioIntegrado),
          diasPagados,
          tarifas,
        );

        if (isrCent > 0) {
          partidas.push({
            clave: 'D001',
            concepto: 'ISR retenido',
            naturaleza: NaturalezaConcepto.DEDUCCION,
            cantidad: 1,
            importeGravado: 0,
            importeExento: 0,
            importe: aPesos(isrCent),
          });
        }
        if (imssCent > 0) {
          partidas.push({
            clave: 'D002',
            concepto: 'IMSS obrero',
            naturaleza: NaturalezaConcepto.DEDUCCION,
            cantidad: 1,
            importeGravado: 0,
            importeExento: 0,
            importe: aPesos(imssCent),
          });
        }

        const deduccionesCent = isrCent + imssCent;
        const netoCent = percepcionesCent - deduccionesCent;

        if (netoCent < 0) {
          advertencias.push(
            `${this.nombreCompleto(emp)} resulta con neto negativo. Revisa sus deducciones.`,
          );
        }

        const recibo = await repoRecibos.save(
          repoRecibos.create({
            empresaId,
            periodoId: periodo.id,
            empleadoId: emp.id,
            nombreEmpleado: this.nombreCompleto(emp),
            diasPagados,
            salarioDiario: Number(emp.salarioDiario),
            totalPercepciones: aPesos(percepcionesCent),
            totalDeducciones: aPesos(deduccionesCent),
            neto: aPesos(netoCent),
            baseGravable: aPesos(gravableCent),
            isrRetenido: aPesos(isrCent),
            imssRetenido: aPesos(imssCent),
          }),
        );

        await repoPartidas.save(
          partidas.map((p) =>
            repoPartidas.create({ ...p, reciboId: recibo.id }),
          ),
        );

        totalPercCent += percepcionesCent;
        totalDeducCent += deduccionesCent;
        calculados++;
      }

      periodo.estado = EstadoPeriodo.CALCULADO;
      periodo.empleadosCalculados = calculados;
      periodo.totalPercepciones = aPesos(totalPercCent);
      periodo.totalDeducciones = aPesos(totalDeducCent);
      periodo.totalNeto = aPesos(totalPercCent - totalDeducCent);
      await repoPeriodos.save(periodo);
    });

    this.logger.log(
      `Nómina ${periodo.numero}/${periodo.ejercicio} · empresa ${empresaId} · ` +
        `${calculados} empleados · neto ${aPesos(totalPercCent - totalDeducCent)}`,
    );

    return {
      periodoId: periodo.id,
      empleadosCalculados: calculados,
      totalPercepciones: aPesos(totalPercCent),
      totalDeducciones: aPesos(totalDeducCent),
      totalNeto: aPesos(totalPercCent - totalDeducCent),
      advertencias,
    };
  }

  /** Días del periodo que realmente corresponden al empleado. */
  private diasEfectivos(emp: Empleado, periodo: PeriodoNomina): number {
    const inicioPeriodo = new Date(periodo.fechaInicio);
    const finPeriodo = new Date(periodo.fechaFin);
    const ingreso = new Date(emp.fechaIngreso);
    const baja = emp.fechaBaja ? new Date(emp.fechaBaja) : null;

    if (ingreso > finPeriodo) return 0;
    if (baja && baja < inicioPeriodo) return 0;

    const desde = ingreso > inicioPeriodo ? ingreso : inicioPeriodo;
    const hasta = baja && baja < finPeriodo ? baja : finPeriodo;

    const dias =
      Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
    return Math.min(dias, periodo.diasPeriodo);
  }

  /**
   * ISR del periodo con la tarifa mensual proporcionalizada.
   * Es el método del artículo 96 de la LISR: base × porcentaje del excedente
   * del límite inferior, más la cuota fija, menos el subsidio al empleo.
   */
  private calcularIsr(
    baseCent: number,
    diasPeriodo: number,
    tarifas: ReturnType<typeof obtenerTarifas>,
  ): number {
    if (baseCent <= 0) return 0;

    const factor = diasPeriodo / 30.4;
    const baseMensualCent = Math.round(baseCent / factor);
    const baseMensual = aPesos(baseMensualCent);

    const renglon = tarifas.isrMensual
      .slice()
      .reverse()
      .find((r) => baseMensual >= r.limiteInferior);

    if (!renglon) return 0;

    const excedenteCent = baseMensualCent - aCent(renglon.limiteInferior);
    const impuestoMensualCent =
      aCent(renglon.cuotaFija) +
      Math.round((excedenteCent * renglon.porcentaje) / 100);

    const subsidio = tarifas.subsidioEmpleo
      .slice()
      .reverse()
      .find((s) => baseMensual >= s.desde);

    const subsidioCent = subsidio ? aCent(subsidio.subsidio) : 0;
    const netoMensualCent = Math.max(0, impuestoMensualCent - subsidioCent);

    return Math.round(netoMensualCent * factor);
  }

  /** Cuotas obrero del IMSS sobre el salario base de cotización. */
  private calcularImss(
    sbcCent: number,
    dias: number,
    tarifas: ReturnType<typeof obtenerTarifas>,
  ): number {
    if (sbcCent <= 0 || dias <= 0) return 0;

    const umaCent = aCent(tarifas.uma);
    const topeCent = umaCent * 25;
    const sbcTopado = Math.min(sbcCent, topeCent);
    const baseCent = sbcTopado * dias;

    let total = 0;
    const c = tarifas.imssObrero;

    // Excedente de 3 UMA en enfermedades y maternidad: sólo sobre el excedente.
    if (sbcTopado > umaCent * 3) {
      const excedente = (sbcTopado - umaCent * 3) * dias;
      total += Math.round((excedente * c.excedente) / 100);
    }

    total += Math.round((baseCent * c.prestacionesDinero) / 100);
    total += Math.round((baseCent * c.gastosMedicos) / 100);
    total += Math.round((baseCent * c.invalidezVida) / 100);
    total += Math.round((baseCent * c.cesantiaVejez) / 100);

    return total;
  }

  /* ══ RECIBOS ═════════════════════════════════════════════════════════════ */

  listarRecibos(empresaId: string, periodoId?: string, empleadoId?: string) {
    return this.recibos.find({
      where: {
        empresaId,
        ...(periodoId ? { periodoId } : {}),
        ...(empleadoId ? { empleadoId } : {}),
      },
      relations: ['partidas'],
      order: { nombreEmpleado: 'ASC' },
    });
  }

  async obtenerRecibo(id: string, empresaId: string) {
    const r = await this.recibos.findOne({
      where: { id, empresaId },
      relations: ['partidas', 'periodo'],
    });
    if (!r) throw new NotFoundException('El recibo no existe.');
    return r;
  }

  async cerrarPeriodo(periodoId: string, empresaId: string) {
    const p = await this.periodos.findOne({
      where: { id: periodoId, empresaId },
    });
    if (!p) throw new NotFoundException('El periodo no existe.');
    if (p.estado !== EstadoPeriodo.CALCULADO) {
      throw new ConflictException(
        'Sólo se puede cerrar un periodo ya calculado.',
      );
    }
    p.estado = EstadoPeriodo.CERRADO;
    return this.periodos.save(p);
  }

  /* ══ RESUMEN ═════════════════════════════════════════════════════════════ */

  async resumen(empresaId: string) {
    const plantilla = await this.empleados.find({ where: { empresaId } });
    const activos = plantilla.filter((e) => e.estado !== EstadoEmpleado.BAJA);

    const nominaMensualCent = activos.reduce(
      (s, e) => s + aCent(e.salarioDiario) * 30,
      0,
    );

    const hoy = new Date();
    const treintaDias = new Date(hoy.getTime() - 30 * 86_400_000);

    return {
      totalEmpleados: activos.length,
      bajasHistoricas: plantilla.length - activos.length,
      nominaMensualEstimada: aPesos(nominaMensualCent),
      salarioPromedioDiario: activos.length
        ? aPesos(
            Math.round(
              activos.reduce((s, e) => s + aCent(e.salarioDiario), 0) /
                activos.length,
            ),
          )
        : 0,
      porEstado: Object.values(EstadoEmpleado).map((estado) => ({
        estado,
        cantidad: plantilla.filter((e) => e.estado === estado).length,
      })),
      incidenciasRecientes: await this.incidencias.count({
        where: { empresaId, fechaInicio: Between(treintaDias, hoy) },
      }),
    };
  }
}
