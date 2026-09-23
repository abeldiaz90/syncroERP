import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';

import {
  ConceptoNomina,
  Empleado,
  EstadoPeriodo,
  Incidencia,
  JornadaLaboral,
  NaturalezaConcepto,
  PartidaRecibo,
  PeriodoNomina,
  ReciboNomina,
  TipoContrato,
  TipoIncidencia,
  TipoSalario,
} from '../entities/rrhh.entity';
import {
  AplicacionObligacionNomina,
  AprobacionNomina,
  CfdiNomina,
  CierreNomina,
  ConceptoEmpleado,
  ConfiguracionPatronal,
  DispersionNomina,
  EstadoMovimientoNomina,
  EstadoPrestamo,
  EventoNomina,
  MovimientoPrestamoNomina,
  ObligacionEmpleado,
  PagoNomina,
  PrestamoEmpleado,
  TipoObligacionEmpleado,
} from '../advanced/nomina-avanzada.entity';
import {
  calcularSubsidioPeriodo,
  obtenerPorcentajeCesantiaPatronal,
  obtenerTarifaIsr,
  obtenerTarifas,
} from '../data/tarifas-fiscales';
import { FIRMAS_NOMINA } from '../advanced/matriz-de-firmas';

const MOTOR_VERSION = 'SYNCRO-NOMINA-MX-2.0.0';
const MS_DIA = 86_400_000;

const cents = (value: number | string | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100);
const pesos = (value: number): number => Math.round(value) / 100;
const money = (value: number): number =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

interface PartidaCalculada {
  clave: string;
  concepto: string;
  naturaleza: NaturalezaConcepto;
  cantidad: number;
  importeGravado: number;
  importeExento: number;
  importe: number;
  conceptoId?: string;
  cuentaContableId?: string;
  origenTipo?: string;
  origenId?: string;
  prioridad?: number;
}

interface ResultadoImss {
  obrero: number;
  patronal: number;
  infonavitPatronal: number;
  desglose: Record<string, number>;
}

interface ResultadoEmpleado {
  empleado: Empleado;
  diasPagados: number;
  diasCotizados: number;
  partidas: PartidaCalculada[];
  percepciones: number;
  deducciones: number;
  neto: number;
  baseGravable: number;
  isr: number;
  subsidio: number;
  imssObrero: number;
  imssPatronal: number;
  infonavitPatronal: number;
  isn: number;
  costoEmpresa: number;
  alertas: string[];
  prestamos: Array<{
    prestamo: PrestamoEmpleado;
    importe: number;
    saldoAntes: number;
    saldoDespues: number;
  }>;
  obligaciones: Array<{
    obligacion: ObligacionEmpleado;
    importe: number;
    saldoAntes: number;
    saldoDespues: number;
  }>;
}

export interface ResultadoCalculoNomina {
  periodoId: string;
  versionCalculo: number;
  hashCalculo: string;
  empleadosCalculados: number;
  totalPercepciones: number;
  totalDeducciones: number;
  totalNeto: number;
  totalCostoEmpresa: number;
  advertencias: string[];
  estado: EstadoPeriodo;
}

@Injectable()
export class NominaCalculoService {
  private readonly logger = new Logger(NominaCalculoService.name);

  constructor(private readonly dataSource: DataSource) {}

  async calcular(
    periodoId: string,
    empresaId: string,
    usuarioId?: string,
  ): Promise<ResultadoCalculoNomina> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      await this.obtenerCandado(queryRunner.manager, empresaId, periodoId);
      const periodo = await queryRunner.manager.findOne(PeriodoNomina, {
        where: { id: periodoId, empresaId },
      });
      if (!periodo) throw new NotFoundException('El periodo de nómina no existe.');

      await this.validarPuedeCalcular(queryRunner.manager, periodo, empresaId);
      const estadoAnterior = periodo.estado;
      periodo.estado = EstadoPeriodo.CALCULANDO;
      periodo.bloqueado = true;
      periodo.motivoBloqueo = 'Cálculo transaccional en curso.';
      await queryRunner.manager.save(periodo);

      const tarifas = obtenerTarifas(periodo.ejercicio);
      const configuracion = await queryRunner.manager.findOne(
        ConfiguracionPatronal,
        { where: { empresaId } },
      );
      /*
       * Quien calcula la nomina es Recursos humanos, y quien define la
       * configuracion patronal es Finanzas o Contabilidad. Decirle «configura»
       * a quien no puede configurarla lo deja dando vueltas: el mensaje nombra
       * al dueno de la firma, que es el mismo que declara la matriz.
       */
      const duenoConfiguracion = FIRMAS_NOMINA.configuracionPatronal.dueño;
      if (!configuracion) {
        throw new ConflictException(
          `Falta la configuración patronal de la empresa, y sin ella no se puede calcular. La define ${duenoConfiguracion}.`,
        );
      }
      if (!configuracion.registroPatronal) {
        throw new ConflictException(
          `La configuración patronal no tiene registro patronal IMSS. Lo captura ${duenoConfiguracion} en «Configuración patronal».`,
        );
      }

      const empleados = await this.obtenerPlantilla(
        queryRunner.manager,
        periodo,
        empresaId,
      );
      if (!empleados.length) {
        throw new ConflictException(
          `No existen empleados del régimen ${periodo.regimen} vigentes dentro del periodo.`,
        );
      }

      const incidencias = await this.obtenerIncidencias(
        queryRunner.manager,
        periodo,
        empresaId,
      );
      const conceptosEmpleado = await this.obtenerConceptosEmpleado(
        queryRunner.manager,
        periodo,
        empresaId,
      );
      const prestamos = await this.obtenerPrestamos(
        queryRunner.manager,
        periodo,
        empresaId,
      );
      const obligaciones = await this.obtenerObligaciones(
        queryRunner.manager,
        periodo,
        empresaId,
      );
      const catalogoConceptos = await queryRunner.manager.find(ConceptoNomina, {
        where: { empresaId, activo: true },
      });
      const conceptoPorId = new Map<string, ConceptoNomina>(catalogoConceptos.map((c) => [c.id, c]));
      const conceptoPorClave = new Map<string, ConceptoNomina>(
        catalogoConceptos.map((c) => [c.clave.toUpperCase(), c]),
      );

      await this.eliminarCalculoAnterior(
        queryRunner.manager,
        periodo.id,
        empresaId,
      );

      const incidenciasPorEmpleado = this.agruparPorEmpleado(incidencias);
      const conceptosPorEmpleado = this.agruparPorEmpleado(conceptosEmpleado);
      const prestamosPorEmpleado = this.agruparPorEmpleado(prestamos);
      const obligacionesPorEmpleado = this.agruparPorEmpleado(obligaciones);

      const advertencias: string[] = [];
      const resultados: ResultadoEmpleado[] = [];
      const erroresBloqueantes: string[] = [];

      for (const empleado of empleados) {
        try {
          const resultado = await this.calcularEmpleado({
            manager: queryRunner.manager,
            periodo,
            empleado,
            configuracion,
            incidencias: incidenciasPorEmpleado.get(empleado.id) ?? [],
            conceptosEmpleado: conceptosPorEmpleado.get(empleado.id) ?? [],
            prestamos: prestamosPorEmpleado.get(empleado.id) ?? [],
            obligaciones: obligacionesPorEmpleado.get(empleado.id) ?? [],
            conceptoPorId,
          });
          resultados.push(resultado);
          advertencias.push(
            ...resultado.alertas.map(
              (a) => `${empleado.numeroEmpleado} · ${this.nombre(empleado)}: ${a}`,
            ),
          );
        } catch (error: any) {
          erroresBloqueantes.push(
            `${empleado.numeroEmpleado} · ${this.nombre(empleado)}: ${error.message}`,
          );
        }
      }

      if (erroresBloqueantes.length) {
        throw new BadRequestException({
          message: 'La nómina no se calculó porque existen errores bloqueantes.',
          errores: erroresBloqueantes,
        });
      }

      if (!resultados.length) {
        throw new ConflictException('No se generó ningún recibo de nómina.');
      }

      const versionCalculo = Number(periodo.versionCalculo ?? 0) + 1;
      const hashRecibos: string[] = [];
      let totalPercepciones = 0;
      let totalDeducciones = 0;
      let totalNeto = 0;
      let totalCostoEmpresa = 0;

      for (const resultado of resultados) {
        const snapshot = this.snapshotEmpleado(periodo, resultado, versionCalculo);
        const hashRecibo = this.hash(snapshot);
        hashRecibos.push(hashRecibo);

        const recibo = await queryRunner.manager.save(
          queryRunner.manager.create(ReciboNomina, {
            empresaId,
            periodoId: periodo.id,
            empleadoId: resultado.empleado.id,
            nombreEmpleado: this.nombre(resultado.empleado),
            diasPagados: resultado.diasPagados,
            diasCotizados: resultado.diasCotizados,
            salarioDiario: Number(resultado.empleado.salarioDiario),
            totalPercepciones: resultado.percepciones,
            totalDeducciones: resultado.deducciones,
            neto: resultado.neto,
            baseGravable: resultado.baseGravable,
            isrRetenido: resultado.isr,
            imssRetenido: resultado.imssObrero,
            subsidioEmpleo: resultado.subsidio,
            imssPatronal: resultado.imssPatronal,
            infonavitPatronal: resultado.infonavitPatronal,
            isn: resultado.isn,
            costoEmpresa: resultado.costoEmpresa,
            versionCalculo,
            hashRecibo,
            snapshotJson: JSON.stringify(snapshot),
          }),
        );

        await queryRunner.manager.save(
          PartidaRecibo,
          resultado.partidas.map((p) =>
            queryRunner.manager.create(PartidaRecibo, {
              ...p,
              reciboId: recibo.id,
              conceptoId:
                p.conceptoId ?? conceptoPorClave.get(p.clave.toUpperCase())?.id,
              cuentaContableId:
                p.cuentaContableId ??
                conceptoPorClave.get(p.clave.toUpperCase())?.cuentaContableId,
              prioridad: p.prioridad ?? 100,
            }),
          ),
        );

        if (resultado.prestamos.length) {
          await queryRunner.manager.save(
            MovimientoPrestamoNomina,
            resultado.prestamos.map((m) =>
              queryRunner.manager.create(MovimientoPrestamoNomina, {
                empresaId,
                periodoId: periodo.id,
                reciboId: recibo.id,
                empleadoId: resultado.empleado.id,
                prestamoId: m.prestamo.id,
                importe: m.importe,
                saldoAntes: m.saldoAntes,
                saldoDespues: m.saldoDespues,
                estado: EstadoMovimientoNomina.CALCULADO,
              }),
            ),
          );
        }

        if (resultado.obligaciones.length) {
          await queryRunner.manager.save(
            AplicacionObligacionNomina,
            resultado.obligaciones.map((m) =>
              queryRunner.manager.create(AplicacionObligacionNomina, {
                empresaId,
                periodoId: periodo.id,
                reciboId: recibo.id,
                empleadoId: resultado.empleado.id,
                obligacionId: m.obligacion.id,
                importe: m.importe,
                saldoAntes: m.saldoAntes,
                saldoDespues: m.saldoDespues,
                estado: EstadoMovimientoNomina.CALCULADO,
              }),
            ),
          );
        }

        totalPercepciones += resultado.percepciones;
        totalDeducciones += resultado.deducciones;
        totalNeto += resultado.neto;
        totalCostoEmpresa += resultado.costoEmpresa;
      }

      const hashCalculo = this.hash({
        empresaId,
        periodoId,
        versionCalculo,
        motor: MOTOR_VERSION,
        hashes: hashRecibos.sort(),
      });

      periodo.versionCalculo = versionCalculo;
      periodo.hashCalculo = hashCalculo;
      periodo.motorVersion = MOTOR_VERSION;
      periodo.fechaCalculo = new Date();
      periodo.empleadosCalculados = resultados.length;
      periodo.totalPercepciones = money(totalPercepciones);
      periodo.totalDeducciones = money(totalDeducciones);
      periodo.totalNeto = money(totalNeto);
      periodo.estado = advertencias.length
        ? EstadoPeriodo.CON_ALERTAS
        : EstadoPeriodo.CALCULADO;
      periodo.bloqueado = false;
      periodo.motivoBloqueo = undefined;
      await queryRunner.manager.save(periodo);

      await queryRunner.manager.save(
        queryRunner.manager.create(EventoNomina, {
          empresaId,
          periodoId: periodo.id,
          tipo: 'CALCULO_COMPLETADO',
          estadoAnterior,
          estadoNuevo: periodo.estado,
          usuarioId,
          detalleJson: JSON.stringify({
            versionCalculo,
            hashCalculo,
            empleados: resultados.length,
            totalPercepciones: money(totalPercepciones),
            totalDeducciones: money(totalDeducciones),
            totalNeto: money(totalNeto),
            totalCostoEmpresa: money(totalCostoEmpresa),
            advertencias,
          }),
        }),
      );

      await queryRunner.commitTransaction();
      this.logger.log(
        `Nómina ${periodo.numero}/${periodo.ejercicio} calculada ` +
          `v${versionCalculo}; ${resultados.length} empleados; hash ${hashCalculo.slice(0, 12)}.`,
      );

      return {
        periodoId: periodo.id,
        versionCalculo,
        hashCalculo,
        empleadosCalculados: resultados.length,
        totalPercepciones: money(totalPercepciones),
        totalDeducciones: money(totalDeducciones),
        totalNeto: money(totalNeto),
        totalCostoEmpresa: money(totalCostoEmpresa),
        advertencias,
        estado: periodo.estado,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async validarPuedeCalcular(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<void> {
    const permitidos = [
      EstadoPeriodo.ABIERTO,
      EstadoPeriodo.CALCULADO,
      EstadoPeriodo.CON_ALERTAS,
    ];
    if (!permitidos.includes(periodo.estado)) {
      throw new ConflictException(
        `El periodo está en estado ${periodo.estado} y no admite recálculo. ` +
          'Reviértelo formalmente antes de modificarlo.',
      );
    }
    if (periodo.bloqueado) {
      throw new ConflictException(
        periodo.motivoBloqueo || 'El periodo se encuentra bloqueado.',
      );
    }

    const [aprobaciones, cfdi, dispersion, pago, cierre] = await Promise.all([
      manager.count(AprobacionNomina, { where: { empresaId, periodoId: periodo.id } }),
      manager.count(CfdiNomina, { where: { empresaId, periodoId: periodo.id } }),
      manager.count(DispersionNomina, { where: { empresaId, periodoId: periodo.id } }),
      manager.count(PagoNomina, { where: { empresaId, periodoId: periodo.id } }),
      manager.count(CierreNomina, { where: { empresaId, periodoId: periodo.id } }),
    ]);
    if (aprobaciones || cfdi || dispersion || pago || cierre || periodo.polizaId) {
      throw new ConflictException(
        'El periodo ya tiene aprobaciones, CFDI, dispersión, pago o póliza. ' +
          'No puede recalcularse para evitar diferencias contra banco, SAT o contabilidad.',
      );
    }
  }

  private async obtenerPlantilla(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<Empleado[]> {
    return manager
      .getRepository(Empleado)
      .createQueryBuilder('e')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('e.regimenPago = :regimen', { regimen: periodo.regimen })
      .andWhere('e.tipoContrato <> :honorarios', {
        honorarios: TipoContrato.HONORARIOS,
      })
      .andWhere("e.estado IN ('ACTIVO','VACACIONES','INCAPACIDAD','BAJA')")
      .andWhere('e.fechaIngreso <= :fin', { fin: periodo.fechaFin })
      .andWhere('(e.fechaBaja IS NULL OR e.fechaBaja >= :inicio)', {
        inicio: periodo.fechaInicio,
      })
      .orderBy('e.numeroEmpleado', 'ASC')
      .getMany();
  }

  private async obtenerIncidencias(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<Incidencia[]> {
    const pendientes = await manager
      .getRepository(Incidencia)
      .createQueryBuilder('i')
      .where('i.empresaId = :empresaId', { empresaId })
      .andWhere('i.fechaInicio <= :fin AND i.fechaFin >= :inicio', {
        inicio: periodo.fechaInicio,
        fin: periodo.fechaFin,
      })
      .andWhere("i.estadoAprobacion NOT IN ('APROBADA','RECHAZADA','CANCELADA')")
      .getCount();
    if (pendientes > 0) {
      throw new ConflictException(
        `Hay ${pendientes} incidencias del periodo pendientes de resolución.`,
      );
    }

    return manager
      .getRepository(Incidencia)
      .createQueryBuilder('i')
      .where('i.empresaId = :empresaId', { empresaId })
      .andWhere('i.aprobada = true')
      .andWhere("i.estadoAprobacion = 'APROBADA'")
      .andWhere('i.fechaInicio <= :fin AND i.fechaFin >= :inicio', {
        inicio: periodo.fechaInicio,
        fin: periodo.fechaFin,
      })
      .getMany();
  }

  private obtenerConceptosEmpleado(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<ConceptoEmpleado[]> {
    return manager
      .getRepository(ConceptoEmpleado)
      .createQueryBuilder('c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.activo=true')
      .andWhere('c.vigenciaDesde <= :fin', { fin: periodo.fechaFin })
      .andWhere('(c.vigenciaHasta IS NULL OR c.vigenciaHasta >= :inicio)', {
        inicio: periodo.fechaInicio,
      })
      .getMany();
  }

  private obtenerPrestamos(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<PrestamoEmpleado[]> {
    return manager
      .getRepository(PrestamoEmpleado)
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.estado = :estado', { estado: EstadoPrestamo.ACTIVO })
      .andWhere('p.saldo > 0')
      .andWhere('p.fechaInicio <= :fin', { fin: periodo.fechaFin })
      .andWhere('(p.fechaFin IS NULL OR p.fechaFin >= :inicio)', {
        inicio: periodo.fechaInicio,
      })
      .getMany();
  }

  private obtenerObligaciones(
    manager: EntityManager,
    periodo: PeriodoNomina,
    empresaId: string,
  ): Promise<ObligacionEmpleado[]> {
    return manager
      .getRepository(ObligacionEmpleado)
      .createQueryBuilder('o')
      .where('o.empresaId = :empresaId', { empresaId })
      .andWhere('o.activo=true')
      .andWhere('o.vigenciaDesde <= :fin', { fin: periodo.fechaFin })
      .andWhere('(o.vigenciaHasta IS NULL OR o.vigenciaHasta >= :inicio)', {
        inicio: periodo.fechaInicio,
      })
      .orderBy('o.prioridad', 'ASC')
      .getMany();
  }

  private async eliminarCalculoAnterior(
    manager: EntityManager,
    periodoId: string,
    empresaId: string,
  ): Promise<void> {
    await manager.delete(MovimientoPrestamoNomina, { empresaId, periodoId });
    await manager.delete(AplicacionObligacionNomina, { empresaId, periodoId });
    const recibos = await manager.find(ReciboNomina, {
      where: { empresaId, periodoId },
      select: ['id'],
    });
    if (recibos.length) {
      await manager.delete(PartidaRecibo, {
        reciboId: In(recibos.map((r) => r.id)),
      });
      await manager.delete(ReciboNomina, { empresaId, periodoId });
    }
  }

  private async calcularEmpleado(params: {
    manager: EntityManager;
    periodo: PeriodoNomina;
    empleado: Empleado;
    configuracion: ConfiguracionPatronal;
    incidencias: Incidencia[];
    conceptosEmpleado: ConceptoEmpleado[];
    prestamos: PrestamoEmpleado[];
    obligaciones: ObligacionEmpleado[];
    conceptoPorId: Map<string, ConceptoNomina>;
  }): Promise<ResultadoEmpleado> {
    const {
      manager,
      periodo,
      empleado,
      configuracion,
      incidencias,
      conceptosEmpleado,
      prestamos,
      obligaciones,
      conceptoPorId,
    } = params;
    const tarifas = obtenerTarifas(periodo.ejercicio);
    const alertas: string[] = [];

    const salarioMinimo =
      empleado.zonaSalarioMinimo === 'FRONTERA_NORTE'
        ? tarifas.salarioMinimoFronteraNorte ?? tarifas.salarioMinimoGeneral
        : tarifas.salarioMinimoGeneral;
    if (Number(empleado.salarioDiario) + 0.001 < salarioMinimo) {
      throw new BadRequestException(
        `Salario diario $${Number(empleado.salarioDiario).toFixed(2)} inferior ` +
          `al mínimo aplicable $${salarioMinimo.toFixed(2)}.`,
      );
    }

    const diasBase = this.diasEfectivos(empleado, periodo);
    const diasNoPagados = incidencias
      .filter((i) => !i.pagada)
      .reduce(
        (s, i) => s + this.diasIncidenciaEnPeriodo(i, periodo),
        0,
      );
    const diasPagados = Math.max(
      0,
      money(diasBase - Math.min(diasBase, diasNoPagados)),
    );
    const diasIncapacidad = incidencias
      .filter((i) => i.tipo === TipoIncidencia.INCAPACIDAD)
      .reduce((s, i) => s + this.diasIncidenciaEnPeriodo(i, periodo), 0);
    const diasCotizados = Math.max(
      0,
      money(diasBase - Math.min(diasBase, diasIncapacidad)),
    );

    const partidas: PartidaCalculada[] = [];
    const sueldo = money(Number(empleado.salarioDiario) * diasPagados);
    partidas.push({
      clave: 'P001',
      concepto: 'Sueldos, salarios, rayas y jornales',
      naturaleza: NaturalezaConcepto.PERCEPCION,
      cantidad: diasPagados,
      importeGravado: sueldo,
      importeExento: 0,
      importe: sueldo,
      prioridad: 10,
    });

    const horasExtra = this.calcularHorasExtra(
      empleado,
      periodo,
      incidencias.filter((i) => i.tipo === TipoIncidencia.HORAS_EXTRA),
      salarioMinimo,
      tarifas.umaDiaria,
    );
    partidas.push(...horasExtra.partidas);
    alertas.push(...horasExtra.alertas);

    const diasVacaciones = incidencias
      .filter((i) => i.tipo === TipoIncidencia.VACACIONES && i.pagada)
      .reduce((s, i) => s + this.diasIncidenciaEnPeriodo(i, periodo), 0);
    if (diasVacaciones > 0) {
      const prima = money(
        Number(empleado.salarioDiario) *
          diasVacaciones *
          (Number(empleado.primaVacacional) / 100),
      );
      const exentoPrevio = await this.obtenerExentoVacacionalAcumulado(
        manager,
        empleado.id,
        periodo,
      );
      const topeAnual = money(tarifas.umaDiaria * 15);
      const exento = money(Math.max(0, Math.min(prima, topeAnual - exentoPrevio)));
      partidas.push({
        clave: 'P005',
        concepto: 'Prima vacacional',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        cantidad: diasVacaciones,
        importeGravado: money(prima - exento),
        importeExento: exento,
        importe: prima,
        prioridad: 20,
      });
    }

    for (const asignacion of conceptosEmpleado) {
      const concepto = conceptoPorId.get(asignacion.conceptoId);
      if (!concepto || !concepto.activo) continue;
      const valor = Number(asignacion.valor);
      const salarioHora = Number(empleado.salarioDiario) /
        Math.max(1, Number(empleado.horasJornada || 8));
      const importe = money(
        asignacion.tipoValor === 'PORCENTAJE'
          ? sueldo * (valor / 100)
          : asignacion.tipoValor === 'DIAS'
            ? Number(empleado.salarioDiario) * valor
            : asignacion.tipoValor === 'HORAS'
              ? salarioHora * valor
              : valor,
      );
      if (importe <= 0) continue;
      if (
        concepto.clave.toUpperCase() === 'P005' &&
        diasVacaciones > 0
      ) {
        alertas.push(
          'Se omitió la prima vacacional recurrente porque ya fue calculada desde vacaciones aprobadas.',
        );
        continue;
      }
      const tratamiento = await this.tratamientoFiscalConcepto(
        manager,
        concepto,
        importe,
        valor,
        empleado.id,
        periodo,
        tarifas.umaDiaria,
      );
      partidas.push({
        clave: concepto.clave,
        concepto: concepto.nombre,
        naturaleza: concepto.naturaleza,
        cantidad: asignacion.tipoValor === 'DIAS' || asignacion.tipoValor === 'HORAS' ? valor : 1,
        importeGravado: tratamiento.gravado,
        importeExento: tratamiento.exento,
        importe,
        conceptoId: concepto.id,
        cuentaContableId: concepto.cuentaContableId,
        origenTipo: 'CONCEPTO_EMPLEADO',
        origenId: asignacion.id,
        prioridad: 30,
      });
    }

    const percepcionesAntesImpuesto = money(
      partidas
        .filter((p) => p.naturaleza !== NaturalezaConcepto.DEDUCCION)
        .reduce((s, p) => s + p.importe, 0),
    );
    const baseGravable = money(
      partidas
        .filter((p) => p.naturaleza !== NaturalezaConcepto.DEDUCCION)
        .reduce((s, p) => s + p.importeGravado, 0),
    );

    const subsidio = calcularSubsidioPeriodo({
      ejercicio: periodo.ejercicio,
      baseGravable,
      diasPeriodo: periodo.diasPeriodo,
      fechaPago: new Date(periodo.fechaPago),
    });
    const impuestoAntesSubsidio = this.calcularIsr(
      baseGravable,
      periodo.ejercicio,
      periodo.regimen,
    );
    const isr = money(Math.max(0, impuestoAntesSubsidio - subsidio));
    const subsidioEntregado = money(Math.max(0, subsidio - impuestoAntesSubsidio));
    if (subsidioEntregado > 0) {
      partidas.push({
        clave: 'O001',
        concepto: 'Subsidio para el empleo entregado',
        naturaleza: NaturalezaConcepto.OTRO_PAGO,
        cantidad: 1,
        importeGravado: 0,
        importeExento: subsidioEntregado,
        importe: subsidioEntregado,
        cuentaContableId: configuracion.cuentaSubsidioEmpleoId,
        origenTipo: 'SUBSIDIO_EMPLEO',
        prioridad: 5,
      });
    }
    const totalIngresos = money(percepcionesAntesImpuesto + subsidioEntregado);

    const sbcDiario = this.obtenerSbc(empleado, periodo, alertas);
    const imss = this.calcularImss({
      sbcDiario,
      diasCotizados,
      ejercicio: periodo.ejercicio,
      primaRiesgo: Number(configuracion.primaRiesgo ?? 0),
      zonaSalarioMinimo: empleado.zonaSalarioMinimo ?? 'GENERAL',
    });

    if (isr > 0) {
      partidas.push({
        clave: 'D001',
        concepto: 'ISR retenido',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        cantidad: 1,
        importeGravado: 0,
        importeExento: 0,
        importe: isr,
        cuentaContableId: configuracion.cuentaIsrRetenidoId,
        origenTipo: 'ISR',
        prioridad: 1,
      });
    }
    if (imss.obrero > 0) {
      partidas.push({
        clave: 'D002',
        concepto: 'Cuotas IMSS a cargo del trabajador',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        cantidad: diasCotizados,
        importeGravado: 0,
        importeExento: 0,
        importe: imss.obrero,
        cuentaContableId: configuracion.cuentaImssObreroId,
        origenTipo: 'IMSS_OBRERO',
        prioridad: 2,
      });
    }

    let deduccionesActuales = money(isr + imss.obrero);
    const movimientosObligacion: ResultadoEmpleado['obligaciones'] = [];
    const obligacionesOrdenadas = [...obligaciones].sort(
      (a, b) => Number(a.prioridad) - Number(b.prioridad),
    );

    for (const obligacion of obligacionesOrdenadas) {
      const disponible = money(
        Math.max(0, totalIngresos - deduccionesActuales),
      );
      if (disponible <= 0) {
        alertas.push(
          `La obligación ${obligacion.tipo}/${obligacion.referencia} no pudo descontarse por falta de neto.`,
        );
        continue;
      }
      const solicitado = this.calcularImporteObligacion(
        obligacion,
        percepcionesAntesImpuesto,
        sbcDiario,
        diasCotizados,
        tarifas.umaDiaria,
      );
      const saldoAntes = money(Number(obligacion.saldo ?? 0));
      const limiteSaldo = saldoAntes > 0 ? saldoAntes : solicitado;
      const importe = money(Math.min(solicitado, limiteSaldo, disponible));
      if (importe <= 0) continue;
      if (importe + 0.001 < solicitado) {
        alertas.push(
          `La obligación ${obligacion.tipo}/${obligacion.referencia} fue topada de ` +
            `$${solicitado.toFixed(2)} a $${importe.toFixed(2)}.`,
        );
      }
      partidas.push({
        clave: this.claveObligacion(obligacion.tipo),
        concepto: `${obligacion.tipo} · ${obligacion.referencia}`,
        naturaleza: NaturalezaConcepto.DEDUCCION,
        cantidad: 1,
        importeGravado: 0,
        importeExento: 0,
        importe,
        cuentaContableId: this.cuentaObligacion(configuracion, obligacion.tipo),
        origenTipo: 'OBLIGACION',
        origenId: obligacion.id,
        prioridad: Number(obligacion.prioridad),
      });
      deduccionesActuales = money(deduccionesActuales + importe);
      movimientosObligacion.push({
        obligacion,
        importe,
        saldoAntes,
        saldoDespues: money(Math.max(0, saldoAntes - importe)),
      });
    }

    const movimientosPrestamo: ResultadoEmpleado['prestamos'] = [];
    for (const prestamo of prestamos) {
      const disponible = money(
        Math.max(0, totalIngresos - deduccionesActuales),
      );
      if (disponible <= 0) {
        alertas.push(
          `El préstamo ${prestamo.referencia ?? prestamo.id} no pudo descontarse por falta de neto.`,
        );
        continue;
      }
      const saldoAntes = money(Number(prestamo.saldo));
      const importe = money(
        Math.min(Number(prestamo.descuentoPeriodo), saldoAntes, disponible),
      );
      if (importe <= 0) continue;
      partidas.push({
        clave: 'DPRST',
        concepto: `Préstamo ${prestamo.tipo}${prestamo.referencia ? ` · ${prestamo.referencia}` : ''}`,
        naturaleza: NaturalezaConcepto.DEDUCCION,
        cantidad: 1,
        importeGravado: 0,
        importeExento: 0,
        importe,
        cuentaContableId: configuracion.cuentaPrestamosEmpleadoId,
        origenTipo: 'PRESTAMO',
        origenId: prestamo.id,
        prioridad: 90,
      });
      deduccionesActuales = money(deduccionesActuales + importe);
      movimientosPrestamo.push({
        prestamo,
        importe,
        saldoAntes,
        saldoDespues: money(Math.max(0, saldoAntes - importe)),
      });
    }

    const deduccionesConcepto = money(
      partidas
        .filter((p) => p.naturaleza === NaturalezaConcepto.DEDUCCION)
        .reduce((s, p) => s + p.importe, 0),
    );
    const neto = money(totalIngresos - deduccionesConcepto);
    if (neto < -0.001) {
      throw new BadRequestException(
        `El neto resultó negativo ($${neto.toFixed(2)}).`,
      );
    }
    if (diasPagados <= 0) alertas.push('El recibo no tiene días pagados.');

    const isn = money(
      percepcionesAntesImpuesto * (Number(configuracion.tasaIsn ?? 0) / 100),
    );
    const costoEmpresa = money(
      percepcionesAntesImpuesto +
        imss.patronal +
        imss.infonavitPatronal +
        isn,
    );

    return {
      empleado,
      diasPagados,
      diasCotizados,
      partidas,
      percepciones: totalIngresos,
      deducciones: deduccionesConcepto,
      neto,
      baseGravable,
      isr,
      subsidio,
      imssObrero: imss.obrero,
      imssPatronal: imss.patronal,
      infonavitPatronal: imss.infonavitPatronal,
      isn,
      costoEmpresa,
      alertas,
      prestamos: movimientosPrestamo,
      obligaciones: movimientosObligacion,
    };
  }

  private calcularIsr(
    baseGravable: number,
    ejercicio: number,
    regimen: PeriodoNomina['regimen'],
  ): number {
    if (baseGravable <= 0) return 0;
    const tabla = obtenerTarifaIsr(ejercicio, regimen);
    const renglon = [...tabla]
      .reverse()
      .find((r) => baseGravable >= r.limiteInferior);
    if (!renglon) return 0;
    return money(
      renglon.cuotaFija +
        (baseGravable - renglon.limiteInferior) *
          (renglon.porcentaje / 100),
    );
  }

  private calcularImss(params: {
    sbcDiario: number;
    diasCotizados: number;
    ejercicio: number;
    primaRiesgo: number;
    zonaSalarioMinimo: 'GENERAL' | 'FRONTERA_NORTE';
  }): ResultadoImss {
    const {
      sbcDiario,
      diasCotizados,
      ejercicio,
      primaRiesgo,
      zonaSalarioMinimo,
    } = params;
    if (sbcDiario <= 0 || diasCotizados <= 0) {
      return { obrero: 0, patronal: 0, infonavitPatronal: 0, desglose: {} };
    }
    const t = obtenerTarifas(ejercicio);
    const sbcTopado = Math.min(sbcDiario, t.umaDiaria * 25);
    const base = sbcTopado * diasCotizados;
    const excedente =
      sbcTopado > t.umaDiaria * 3
        ? (sbcTopado - t.umaDiaria * 3) * diasCotizados
        : 0;

    const obrero = money(
      excedente * (t.imssObrero.excedente / 100) +
        base * (t.imssObrero.prestacionesDinero / 100) +
        base * (t.imssObrero.gastosMedicos / 100) +
        base * (t.imssObrero.invalidezVida / 100) +
        base * (t.imssObrero.cesantiaVejez / 100),
    );

    const porcentajeCesantia = obtenerPorcentajeCesantiaPatronal(
      ejercicio,
      sbcTopado,
      zonaSalarioMinimo,
    );
    const desglose = {
      cuotaFija: money(
        t.umaDiaria * diasCotizados * (t.imssPatronal.cuotaFijaUma / 100),
      ),
      excedente: money(excedente * (t.imssPatronal.excedente / 100)),
      prestacionesDinero: money(
        base * (t.imssPatronal.prestacionesDinero / 100),
      ),
      gastosMedicos: money(base * (t.imssPatronal.gastosMedicos / 100)),
      invalidezVida: money(base * (t.imssPatronal.invalidezVida / 100)),
      riesgoTrabajo: money(base * (Math.max(0, primaRiesgo) / 100)),
      guarderias: money(base * (t.imssPatronal.guarderias / 100)),
      retiro: money(base * (t.imssPatronal.retiro / 100)),
      cesantiaVejez: money(base * (porcentajeCesantia / 100)),
    };
    const patronal = money(
      Object.values(desglose).reduce((s, v) => s + v, 0),
    );
    const infonavitPatronal = money(
      base * (t.imssPatronal.infonavit / 100),
    );
    return { obrero, patronal, infonavitPatronal, desglose };
  }

  private calcularHorasExtra(
    empleado: Empleado,
    periodo: PeriodoNomina,
    incidencias: Incidencia[],
    salarioMinimo: number,
    umaDiaria: number,
  ): { partidas: PartidaCalculada[]; alertas: string[] } {
    if (!incidencias.length) return { partidas: [], alertas: [] };
    const horasPorSemana = new Map<string, number>();
    const horasPorDia = new Map<string, number>();
    for (const incidencia of incidencias) {
      const dias = Math.max(1, this.diasIncidenciaEnPeriodo(incidencia, periodo));
      const horasDia = Number(incidencia.horas ?? 0) / dias;
      const inicio = this.maxFecha(
        this.soloFecha(incidencia.fechaInicio),
        this.soloFecha(periodo.fechaInicio),
      );
      const fin = this.minFecha(
        this.soloFecha(incidencia.fechaFin),
        this.soloFecha(periodo.fechaFin),
      );
      for (let fecha = inicio; fecha <= fin; fecha = new Date(fecha.getTime() + MS_DIA)) {
        const dia = this.fechaIso(fecha);
        const semana = this.fechaIso(this.inicioSemana(fecha));
        horasPorDia.set(dia, (horasPorDia.get(dia) ?? 0) + horasDia);
        horasPorSemana.set(
          semana,
          (horasPorSemana.get(semana) ?? 0) + horasDia,
        );
      }
    }

    const alertas: string[] = [];
    for (const [dia, horas] of horasPorDia) {
      if (horas > 3.0001) {
        alertas.push(
          `Horas extra por encima de 3 horas en el día ${dia}: ${horas.toFixed(2)}.`,
        );
      }
    }

    const horasJornada =
      Number(empleado.horasJornada) > 0
        ? Number(empleado.horasJornada)
        : empleado.jornada === JornadaLaboral.NOCTURNA
          ? 7
          : empleado.jornada === JornadaLaboral.MIXTA
            ? 7.5
            : 8;
    const valorHora = Number(empleado.salarioDiario) / horasJornada;
    let doblesTotal = 0;
    let triplesTotal = 0;
    let importeDoble = 0;
    let importeTriple = 0;
    let exentoDoble = 0;

    for (const [semana, horas] of horasPorSemana) {
      const dobles = Math.min(9, horas);
      const triples = Math.max(0, horas - 9);
      if (horas > 9.0001) {
        alertas.push(
          `Semana ${semana}: ${horas.toFixed(2)} horas extra; el excedente de 9 se paga triple.`,
        );
      }
      const dobleSemana = money(valorHora * dobles * 2);
      const tripleSemana = money(valorHora * triples * 3);
      const esSalarioMinimo = Number(empleado.salarioDiario) <= salarioMinimo + 0.01;
      const exentoSemana = esSalarioMinimo
        ? dobleSemana
        : Math.min(dobleSemana * 0.5, umaDiaria * 5);
      doblesTotal += dobles;
      triplesTotal += triples;
      importeDoble += dobleSemana;
      importeTriple += tripleSemana;
      exentoDoble += exentoSemana;
    }

    const partidas: PartidaCalculada[] = [];
    if (importeDoble > 0) {
      partidas.push({
        clave: 'P002D',
        concepto: 'Horas extra dobles',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        cantidad: money(doblesTotal),
        importeGravado: money(importeDoble - exentoDoble),
        importeExento: money(exentoDoble),
        importe: money(importeDoble),
        prioridad: 15,
      });
    }
    if (importeTriple > 0) {
      partidas.push({
        clave: 'P002T',
        concepto: 'Horas extra triples',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        cantidad: money(triplesTotal),
        importeGravado: money(importeTriple),
        importeExento: 0,
        importe: money(importeTriple),
        prioridad: 16,
      });
    }
    return { partidas, alertas };
  }

  private obtenerSbc(
    empleado: Empleado,
    periodo: PeriodoNomina,
    alertas: string[],
  ): number {
    const informado = Number(empleado.salarioDiarioIntegrado ?? 0);
    if (
      [TipoSalario.VARIABLE, TipoSalario.MIXTO].includes(empleado.tipoSalario) &&
      (!empleado.sbcValidado || informado <= 0)
    ) {
      throw new BadRequestException(
        `El salario ${empleado.tipoSalario} requiere un SBC validado y vigente.`,
      );
    }
    if (informado > 0 && empleado.sbcValidado) return informado;

    const antiguedad = this.antiguedadAnios(
      empleado.fechaIngreso,
      periodo.fechaFin,
    );
    const vacaciones = this.diasVacacionesLey(antiguedad);
    const factor =
      1 +
      Number(empleado.diasAguinaldo) / 365 +
      (vacaciones * (Number(empleado.primaVacacional) / 100)) / 365;
    const calculado = money(Number(empleado.salarioDiario) * factor);
    const usado = Math.max(Number(empleado.salarioDiario), calculado);

    /*
     * El aviso tiene que nombrar los dos numeros.
     *
     * Antes decia «SBC calculado automaticamente en $472.19; valida el SBC
     * antes de timbrar/SUA» y se callaba que el expediente traia $495. Quien
     * lee eso no tiene por que sospechar que hubo una cifra descartada, asi
     * que el aviso que existe para que alguien mire omitia justo el dato que
     * le haria mirar.
     *
     * La diferencia no es cosmetica. Si el SBC informado es MAYOR y es el que
     * esta registrado ante el IMSS, cotizar por el calculado entera cuotas de
     * menos, y eso se llama diferencia a cargo del patron. Si es menor, se
     * paga de mas. En los dos casos alguien tiene que decidir, y para decidir
     * necesita ver las dos cifras.
     *
     * El calculo no cambia: un SBC sin validar no se usa. Lo que cambia es
     * que deja de desaparecer en silencio.
     */
    if (informado > 0 && Math.abs(informado - usado) >= 0.01) {
      const direccion =
        informado > usado
          ? 'es MAYOR que el calculado, asi que si es el que está registrado ante el IMSS se estarían enterando cuotas de menos'
          : 'es menor que el calculado, asi que se estarían enterando cuotas de más si el expediente fuera el correcto';
      alertas.push(
        `SBC: el expediente informa $${informado.toFixed(2)} sin validar y la nómina cotiza con $${usado.toFixed(2)} (mínimo de ley). El informado ${direccion}. Valida el SBC en la ficha del empleado antes de timbrar y de enviar el SUA.`,
      );
    } else {
      alertas.push(
        `SBC calculado automáticamente en $${calculado.toFixed(2)} (mínimo de ley); valida el SBC en la ficha del empleado antes de timbrar/SUA.`,
      );
    }
    return usado;
  }

  private calcularImporteObligacion(
    obligacion: ObligacionEmpleado,
    percepciones: number,
    sbcDiario: number,
    diasCotizados: number,
    umaDiaria: number,
  ): number {
    const valor = Number(obligacion.valor ?? 0);
    switch (obligacion.modalidad) {
      case 'PORCENTAJE': {
        const base =
          obligacion.baseCalculo === 'SBC'
            ? sbcDiario * diasCotizados
            : percepciones;
        return money(base * (valor / 100));
      }
      case 'FACTOR':
        return money(valor * umaDiaria * diasCotizados);
      case 'SALDO':
        return money(Number(obligacion.saldo || valor));
      case 'CUOTA_FIJA':
      default:
        return money(valor);
    }
  }

  private claveObligacion(tipo: TipoObligacionEmpleado): string {
    return {
      [TipoObligacionEmpleado.INFONAVIT]: 'DINF',
      [TipoObligacionEmpleado.FONACOT]: 'DFON',
      [TipoObligacionEmpleado.PENSION]: 'DPEN',
      [TipoObligacionEmpleado.EMBARGO]: 'DEMB',
      [TipoObligacionEmpleado.OTRO]: 'DOTR',
    }[tipo];
  }

  private cuentaObligacion(
    configuracion: ConfiguracionPatronal,
    tipo: TipoObligacionEmpleado,
  ): string | undefined {
    if (tipo === TipoObligacionEmpleado.INFONAVIT)
      return configuracion.cuentaInfonavitId;
    if (tipo === TipoObligacionEmpleado.FONACOT)
      return configuracion.cuentaFonacotId;
    if (tipo === TipoObligacionEmpleado.PENSION)
      return configuracion.cuentaPensionId;
    if (tipo === TipoObligacionEmpleado.EMBARGO)
      return configuracion.cuentaEmbargosId;
    return configuracion.cuentaOtrasDeduccionesId;
  }

  private async tratamientoFiscalConcepto(
    manager: EntityManager,
    concepto: ConceptoNomina,
    importe: number,
    cantidad: number,
    empleadoId: string,
    periodo: PeriodoNomina,
    umaDiaria: number,
  ): Promise<{ gravado: number; exento: number }> {
    if (concepto.naturaleza === NaturalezaConcepto.DEDUCCION) {
      return { gravado: 0, exento: 0 };
    }
    if (!concepto.gravaIsr) {
      return { gravado: 0, exento: importe };
    }
    const clave = concepto.clave.toUpperCase();
    const topes: Record<string, number> = {
      P004: umaDiaria * 30,
      P005: umaDiaria * 15,
      P007: umaDiaria * 15,
    };
    if (clave === 'P003') {
      const exento = money(Math.min(importe, umaDiaria * Math.max(1, cantidad)));
      return { gravado: money(importe - exento), exento };
    }
    const tope = topes[clave];
    if (!tope) return { gravado: importe, exento: 0 };
    const acumulado = await this.obtenerExentoAnualConcepto(
      manager,
      empleadoId,
      periodo,
      clave,
    );
    const exento = money(Math.max(0, Math.min(importe, tope - acumulado)));
    return { gravado: money(importe - exento), exento };
  }

  private async obtenerExentoAnualConcepto(
    manager: EntityManager,
    empleadoId: string,
    periodo: PeriodoNomina,
    clave: string,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(SUM(pr.importeExento),0) AS total
       FROM rrhh_partidas_recibo pr
       INNER JOIN rrhh_recibos_nomina r ON r.id=pr.reciboId
       INNER JOIN rrhh_periodos_nomina p ON p.id=r.periodoId
       WHERE r.empleadoId=$1 AND p.empresaId=$2 AND p.ejercicio=$3
         AND p.id<>$4 AND pr.clave=$5`,
      [empleadoId, periodo.empresaId, periodo.ejercicio, periodo.id, clave],
    );
    return money(Number(rows?.[0]?.total ?? 0));
  }

  private async obtenerExentoVacacionalAcumulado(
    manager: EntityManager,
    empleadoId: string,
    periodo: PeriodoNomina,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(SUM(pr.importeExento),0) AS total
       FROM rrhh_partidas_recibo pr
       INNER JOIN rrhh_recibos_nomina r ON r.id=pr.reciboId
       INNER JOIN rrhh_periodos_nomina p ON p.id=r.periodoId
       WHERE r.empleadoId=$1 AND p.empresaId=$2 AND p.ejercicio=$3
         AND p.id<>$4 AND pr.clave='P005'`,
      [empleadoId, periodo.empresaId, periodo.ejercicio, periodo.id],
    );
    return money(Number(rows?.[0]?.total ?? 0));
  }

  private snapshotEmpleado(
    periodo: PeriodoNomina,
    resultado: ResultadoEmpleado,
    versionCalculo: number,
  ) {
    const e = resultado.empleado;
    return {
      motorVersion: MOTOR_VERSION,
      versionCalculo,
      periodo: {
        id: periodo.id,
        ejercicio: periodo.ejercicio,
        numero: periodo.numero,
        regimen: periodo.regimen,
        fechaInicio: this.fechaIso(periodo.fechaInicio),
        fechaFin: this.fechaIso(periodo.fechaFin),
        fechaPago: this.fechaIso(periodo.fechaPago),
      },
      empleado: {
        id: e.id,
        numeroEmpleado: e.numeroEmpleado,
        nombre: this.nombre(e),
        rfc: e.rfc,
        curp: e.curp,
        nss: e.nss,
        regimenPago: e.regimenPago,
        tipoSalario: e.tipoSalario,
        salarioDiario: Number(e.salarioDiario),
        salarioDiarioIntegrado: Number(e.salarioDiarioIntegrado),
      },
      calculo: {
        diasPagados: resultado.diasPagados,
        diasCotizados: resultado.diasCotizados,
        percepciones: resultado.percepciones,
        deducciones: resultado.deducciones,
        neto: resultado.neto,
        baseGravable: resultado.baseGravable,
        isr: resultado.isr,
        subsidio: resultado.subsidio,
        imssObrero: resultado.imssObrero,
        imssPatronal: resultado.imssPatronal,
        infonavitPatronal: resultado.infonavitPatronal,
        isn: resultado.isn,
        costoEmpresa: resultado.costoEmpresa,
      },
      partidas: [...resultado.partidas].sort((a, b) =>
        `${a.prioridad}-${a.clave}`.localeCompare(`${b.prioridad}-${b.clave}`),
      ),
      alertas: resultado.alertas,
    };
  }

  private agruparPorEmpleado<T extends { empleadoId: string }>(
    rows: T[],
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      map.set(row.empleadoId, [...(map.get(row.empleadoId) ?? []), row]);
    }
    return map;
  }

  private diasEfectivos(empleado: Empleado, periodo: PeriodoNomina): number {
    const inicio = this.maxFecha(
      this.soloFecha(empleado.fechaIngreso),
      this.soloFecha(periodo.fechaInicio),
    );
    const fin = empleado.fechaBaja
      ? this.minFecha(
          this.soloFecha(empleado.fechaBaja),
          this.soloFecha(periodo.fechaFin),
        )
      : this.soloFecha(periodo.fechaFin);
    if (inicio > fin) return 0;
    return Math.min(
      periodo.diasPeriodo,
      Math.floor((fin.getTime() - inicio.getTime()) / MS_DIA) + 1,
    );
  }

  private diasIncidenciaEnPeriodo(
    incidencia: Incidencia,
    periodo: PeriodoNomina,
  ): number {
    const inicioInc = this.soloFecha(incidencia.fechaInicio);
    const finInc = this.soloFecha(incidencia.fechaFin);
    const inicio = this.maxFecha(inicioInc, this.soloFecha(periodo.fechaInicio));
    const fin = this.minFecha(finInc, this.soloFecha(periodo.fechaFin));
    if (inicio > fin) return 0;
    const diasRango = Math.floor((finInc.getTime() - inicioInc.getTime()) / MS_DIA) + 1;
    const diasOverlap = Math.floor((fin.getTime() - inicio.getTime()) / MS_DIA) + 1;
    const capturados = Number(incidencia.dias ?? 0);
    return money(capturados > 0 ? (capturados * diasOverlap) / diasRango : diasOverlap);
  }

  private antiguedadAnios(inicio: Date, al: Date): number {
    const a = this.soloFecha(inicio);
    const b = this.soloFecha(al);
    let years = b.getFullYear() - a.getFullYear();
    const anniversary = new Date(b.getFullYear(), a.getMonth(), a.getDate());
    if (b < anniversary) years--;
    return Math.max(0, years);
  }

  /**
   * Días de vacaciones de ley (Art. 76 LFT, reforma de Vacaciones Dignas 2023).
   *
   * El primer año devolvía 0. Como esta función alimenta el factor de
   * integración del SBC (Art. 27 LSS), todo empleado con menos de un año
   * integraba SIN prima vacacional: su salario base de cotización quedaba por
   * debajo del legal y las cuotas al IMSS se enteraban de menos, que es
   * exactamente la diferencia que el Instituto liquida con recargos y
   * actualización.
   *
   * Para integración el mínimo es 12 días desde el primer día de la relación
   * laboral, aunque el derecho a disfrutarlas se genere al cumplir el año.
   */
  private diasVacacionesLey(anios: number): number {
    if (anios <= 1) return 12;
    if (anios <= 5) return 12 + (anios - 1) * 2;
    return 22 + Math.floor((anios - 6) / 5) * 2;
  }

  private nombre(e: Empleado): string {
    return [e.nombres, e.apellidoPaterno, e.apellidoMaterno]
      .filter(Boolean)
      .join(' ');
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  }

  private soloFecha(value: Date | string): Date {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    return new Date(`${String(value).slice(0, 10)}T00:00:00`);
  }

  private fechaIso(value: Date | string): string {
    const f = this.soloFecha(value);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }

  private maxFecha(a: Date, b: Date): Date {
    return a > b ? a : b;
  }

  private minFecha(a: Date, b: Date): Date {
    return a < b ? a : b;
  }

  private inicioSemana(fecha: Date): Date {
    const f = this.soloFecha(fecha);
    const day = f.getDay() || 7;
    return new Date(f.getTime() - (day - 1) * MS_DIA);
  }

  private async obtenerCandado(
    manager: EntityManager,
    empresaId: string,
    periodoId: string,
  ): Promise<void> {
    const result = await manager.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`NOMINA:${empresaId}:${periodoId}`],
    );
    if (Number(result?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException(
        'El periodo está siendo procesado por otro usuario. Intenta nuevamente.',
      );
    }
  }
}
