import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CierreContable } from '../entities/cierre-contable.entity';
import { EventoCierreContable } from '../entities/evento-cierre-contable.entity';
import { Poliza } from '../entities/poliza.entity';
import { RevisionCierreMensual } from '../entities/revision-cierre-mensual.entity';
import {
  CerrarPeriodoGuiadoDto,
  IniciarRevisionCierreDto,
  PrepararCierreDto,
} from '../dto/cierre-mensual.dto';
import { ActivacionFinancieraService } from './activacion-financiera.service';
import {
  RespaldoCierreService,
  type RespaldoGenerado,
} from './respaldo-cierre.service';
import { espejoEncendido } from '../../integracion/utils/modo-contabilidad.util';

type Consultar = (sql: string, parametros?: unknown[]) => Promise<any[]>;

export interface DiagnosticoCierre {
  periodo: {
    mes: number;
    anio: number;
    nombre: string;
    fechaDesde: string;
    fechaHasta: string;
  };
  generadoEn: string;
  contabilidad: {
    totalPolizas: number;
    totalPartidas: number;
    totalDebe: number;
    totalHaber: number;
    diferencia: number;
    polizasDescuadradas: number;
    polizasSinPartidas: number;
  };
  asientosPendientes: {
    total: number;
    detalle: Array<{
      id: string;
      tipo: string;
      folio: string | null;
      estado: string;
      error: string | null;
    }>;
  };
  iva: {
    trasladado: number;
    acreditable: number;
    trasladadoNoCobrado: number;
    acreditablePendiente: number;
    ivaAPagar: number;
    saldoAFavor: number;
    movimientos: number;
  };
  bancos: {
    cuentasActivas: number;
    estadosCerrados: number;
    coberturaCompleta: boolean;
  };
  conciliacionInicial: {
    existe: boolean;
    fechaCorte: string | null;
    fechaConfirmacion: Date | null;
  };
  operaciones: {
    totalSinContabilizar: number;
    detalle: Array<{ clave: string; cantidad: number }>;
  };
  controles: Array<{
    clave: string;
    titulo: string;
    descripcion: string;
    estado: 'CORRECTO' | 'BLOQUEO' | 'ADVERTENCIA';
    bloquea: boolean;
  }>;
  bloqueos: number;
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Injectable()
export class CierreContableService {
  private readonly logger = new Logger(CierreContableService.name);

  constructor(
    @InjectRepository(CierreContable)
    private readonly cierreRepo: Repository<CierreContable>,
    @InjectRepository(RevisionCierreMensual)
    private readonly revisionRepo: Repository<RevisionCierreMensual>,
    @InjectRepository(EventoCierreContable)
    private readonly eventoRepo: Repository<EventoCierreContable>,
    private readonly dataSource: DataSource,
    private readonly activacionService: ActivacionFinancieraService,
    private readonly respaldoService: RespaldoCierreService,
  ) {}

  /**
   * ========================================================================
   * Un dato que no se pudo leer no vale cero
   * ------------------------------------------------------------------------
   * `Number(fila?.x ?? 0)` parecia defensivo y era lo contrario: cuando la
   * columna no existe —porque Postgres devolvio el alias en minusculas—
   * `fila.x` es `undefined`, el `?? 0` lo convierte en 0, y ese cero viaja
   * como si fuera un dato medido.
   *
   * Lo que costo, medido el 2026-09-24: el diagnostico del cierre de
   * septiembre informaba «totalPolizas: 0, totalDebe: 0, cuadrada: true»
   * sobre un mes con la nomina ya contabilizada, y `cuentasActivas` salia
   * siempre 0, con lo que el control de cobertura bancaria
   * —`cuentasActivas === 0 || ...`— era SIEMPRE cierto y no podia fallar.
   *
   * Asi que se distingue: si la columna falta, se dice en el log y se
   * devuelve 0 igual —el cierre no puede caerse por esto— pero queda
   * constancia de que ese cero no se midio. Un cero inventado en un control
   * contable es peor que un error: el error se corrige, el cero se cree.
   * ========================================================================
   */
  private contarColumna(fila: unknown, columna: string): number {
    const registro = (fila ?? {}) as Record<string, unknown>;
    const crudo = registro[columna];
    if (crudo === undefined) {
      this.logger.error(
        `La consulta del cierre no devolvio la columna "${columna}". ` +
          'Se asume 0, pero ese 0 NO se midio: revisa el alias del SELECT ' +
          '(Postgres devuelve en minusculas todo alias sin comillas).',
      );
      return 0;
    }
    if (crudo === null) return 0;
    const numero = Number(crudo);
    return Number.isFinite(numero) ? numero : 0;
  }

  private redondear(valor: unknown) {
    return Math.round(Number(valor ?? 0) * 100) / 100;
  }

  private json<T>(texto: string | null | undefined, respaldo: T): T {
    try {
      if (!texto) return respaldo;
      const valor: unknown = JSON.parse(texto);
      return valor as T;
    } catch {
      return respaldo;
    }
  }

  private fechasPeriodo(anio: number, mes: number) {
    const fechaDesde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const fechaHasta = `${anio}-${String(mes).padStart(2, '0')}-${String(
      new Date(anio, mes, 0).getDate(),
    ).padStart(2, '0')}`;
    return { fechaDesde, fechaHasta };
  }

  private validarPeriodoCerrable(anio: number, mes: number) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new BadRequestException('El mes debe estar entre 1 y 12.');
    }
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) {
      throw new BadRequestException('El año del período no es válido.');
    }
    const hoy = new Date();
    const periodo = anio * 12 + mes;
    const actual = hoy.getFullYear() * 12 + (hoy.getMonth() + 1);
    if (periodo >= actual) {
      throw new BadRequestException(
        'Sólo puede cerrarse un mes completamente terminado. El mes actual y los futuros permanecen abiertos.',
      );
    }
  }

  private presentarRevision(revision: RevisionCierreMensual) {
    return {
      id: revision.id,
      mes: revision.mes,
      anio: revision.anio,
      estado: revision.estado,
      snapshot: this.json<DiagnosticoCierre | null>(
        revision.snapshotJson,
        null,
      ),
      confirmaciones: this.json(revision.confirmacionesJson, {}),
      notas: revision.notas,
      version: revision.version,
      fechaCreacion: revision.fechaCreacion,
      fechaRevision: revision.fechaRevision,
      cierreId: revision.cierreId,
    };
  }

  private async generarDiagnostico(
    empresaId: string,
    mes: number,
    anio: number,
    consultar: Consultar = (sql, parametros = []) =>
      this.dataSource.query(sql, parametros),
  ): Promise<DiagnosticoCierre> {
    const { fechaDesde, fechaHasta } = this.fechasPeriodo(anio, mes);

    /*
     * ========================================================================
     * Una consulta que fallo no vale cero
     * ------------------------------------------------------------------------
     * Cuatro de estas consultas terminaban en `.catch(() => [{ x: 0 }])`. Es la
     * misma trampa que `Number(fila?.x ?? 0)` —corregida ayer en
     * `contarColumna`— por otra puerta: si la consulta revienta, el diagnostico
     * se inventa un cero y sigue como si lo hubiera medido.
     *
     * Y dos de los cuatro ceros iban en la direccion peligrosa:
     *
     *   cuentasActivas: 0  -> `coberturaCompleta` se vuelve cierto, porque la
     *                         regla es `cuentasActivas === 0 || ...`, y el
     *                         control de BANCOS PASA EN VERDE.
     *   operaciones: []    -> «No se detectaron operaciones definitivas sin
     *                         poliza», y ese control tambien PASA.
     *
     * Es decir: una consulta rota hacia que el mes pareciera mas limpio, no
     * menos. Un control que aprueba porque no pudo medir es peor que uno que
     * falla: el que falla se investiga.
     *
     * Aqui se anota lo que no se pudo medir y se convierte en bloqueo propio.
     * No se puede cerrar un mes sobre numeros que nadie leyo.
     * ========================================================================
     */
    const noSeMidio: string[] = [];
    const siFalla = <T>(que: string, respaldo: T) => (error: unknown) => {
      this.logger.error(
        `El diagnostico del cierre ${mes}/${anio} no pudo medir «${que}»: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'Se continua para poder mostrar el resto, pero el periodo NO podra ' +
          'cerrarse hasta que esa consulta funcione.',
      );
      noSeMidio.push(que);
      return respaldo;
    };

    const [
      contabilidadFilas,
      pendientes,
      ivaFilas,
      cuentasBancariasFilas,
      estadosBancariosFilas,
      conciliacion,
      operacionesFilas,
      espejoFilas,
    ] = await Promise.all([
      consultar(
        `
            WITH totales AS (
              SELECT
                p.id,
                COUNT(pp.id) partidas,
                COALESCE(SUM(CAST(pp.cargo AS decimal(18,4))), 0) debe,
                COALESCE(SUM(CAST(pp.abono AS decimal(18,4))), 0) haber
              FROM polizas p
              LEFT JOIN partidas_poliza pp ON pp.polizaId = p.id
              WHERE p.empresaId = $1 AND p.anio = $2 AND p.mes = $3
              GROUP BY p.id
            )
            SELECT
              COUNT(*) AS "totalPolizas",
              COALESCE(SUM(partidas), 0) AS "totalPartidas",
              COALESCE(SUM(debe), 0) AS "totalDebe",
              COALESCE(SUM(haber), 0) AS "totalHaber",
              COALESCE(SUM(CASE WHEN partidas = 0 THEN 1 ELSE 0 END), 0) AS "polizasSinPartidas",
              COALESCE(SUM(CASE WHEN ABS(debe - haber) >= 0.01 THEN 1 ELSE 0 END), 0) AS "polizasDescuadradas"
            FROM totales
          `,
        [empresaId, anio, mes],
      ),
      consultar(
        `
            SELECT
              id, tipo, folioDocumento, estado, ultimoError
            FROM asientos_pendientes
            WHERE empresaId = $1
              AND estado IN ('PENDIENTE', 'REINTENTANDO', 'FALLIDO')
              AND COALESCE(
                CASE WHEN payload IS NOT NULL AND payload <> ''
                  THEN (payload::jsonb ->> 'fecha')::date END,
                CAST(fechaCreacion AS date)
              ) BETWEEN $2 AND $3
            ORDER BY fechaCreacion ASC
            LIMIT 100
          `,
        [empresaId, fechaDesde, fechaHasta],
      ),
      consultar(
        `
            SELECT
              COALESCE(SUM(CASE
                WHEN c.rolSistema = 'IVA_TRASLADADO_COBRADO'
                THEN CAST(pp.abono AS decimal(18,4)) - CAST(pp.cargo AS decimal(18,4))
                ELSE 0 END), 0) trasladado,
              COALESCE(SUM(CASE
                WHEN c.rolSistema = 'IVA_ACREDITABLE_PAGADO'
                THEN CAST(pp.cargo AS decimal(18,4)) - CAST(pp.abono AS decimal(18,4))
                ELSE 0 END), 0) acreditable,
              COALESCE(SUM(CASE
                WHEN c.rolSistema = 'IVA_TRASLADADO_NO_COBRADO'
                THEN CAST(pp.abono AS decimal(18,4)) - CAST(pp.cargo AS decimal(18,4))
                ELSE 0 END), 0) AS "trasladadoNoCobrado",
              COALESCE(SUM(CASE
                WHEN c.rolSistema = 'IVA_ACREDITABLE_PENDIENTE'
                THEN CAST(pp.cargo AS decimal(18,4)) - CAST(pp.abono AS decimal(18,4))
                ELSE 0 END), 0) AS "acreditablePendiente",
              COALESCE(SUM(CASE WHEN c.rolSistema IN
                ('IVA_TRASLADADO_COBRADO', 'IVA_ACREDITABLE_PAGADO',
                 'IVA_TRASLADADO_NO_COBRADO', 'IVA_ACREDITABLE_PENDIENTE')
                THEN 1 ELSE 0 END), 0)
                movimientos
            FROM partidas_poliza pp
            INNER JOIN polizas p ON p.id = pp.polizaId
            INNER JOIN cuentas_contables c ON c.id = pp.cuentaContableId
            WHERE p.empresaId = $1 AND p.anio = $2 AND p.mes = $3
          `,
        [empresaId, anio, mes],
      ),
      consultar(
        `
            SELECT COUNT(*) AS "cuentasActivas"
            FROM cuentas_bancarias
            WHERE empresaId = $1 AND activo=true AND tipo <> 'CAJA'
          `,
        [empresaId],
      ).catch(siFalla('cuentas bancarias activas', [{ cuentasActivas: 0 }])),
      consultar(
        `
            SELECT COUNT(*) AS "estadosCerrados"
            FROM tesoreria_estados_cuenta
            WHERE empresaId = $1 AND ejercicio = $2 AND mes = $3
              AND estado = 'CERRADA'
          `,
        [empresaId, anio, mes],
      ).catch(siFalla('conciliaciones bancarias cerradas', [{ estadosCerrados: 0 }])),
      consultar(
        `
            SELECT fechaCorte, fechaConfirmacion
            FROM conciliaciones_financieras
            WHERE empresaId = $1 AND estado = 'CONCILIADA'
            ORDER BY fechaConfirmacion DESC
            LIMIT 1
          `,
        [empresaId],
      ).catch(siFalla('conciliacion inicial de referencia', [])),
      consultar(
        `
          SELECT * FROM (
            SELECT 'HOTELERIA' clave, COUNT(*)::int cantidad
              FROM folios
             WHERE empresaId=$1 AND estado='CERRADO'
               AND CAST(fechaCierre AS date) BETWEEN $2 AND $3
               AND (estadoContable <> 'GENERADO' OR polizaId IS NULL)

            UNION ALL
            SELECT 'COBRANZA', COUNT(*)::int
              FROM pagos_cobranza
             WHERE empresaId=$1 AND CAST(fechaPago AS date) BETWEEN $2 AND $3
               AND (estadoContable <> 'GENERADO' OR polizaId IS NULL)

            UNION ALL
            SELECT 'PAGOS_PROVEEDOR', COUNT(*)::int
              FROM pagos_proveedor
             WHERE empresaId=$1 AND CAST(fechaPago AS date) BETWEEN $2 AND $3
               AND (estadoContable <> 'GENERADO' OR polizaId IS NULL)

            UNION ALL
            SELECT 'NOMINA', COUNT(*)::int
              FROM rrhh_periodos_nomina
             WHERE empresaId=$1 AND CAST(fechaPago AS date) BETWEEN $2 AND $3
               AND estado IN ('PAGADO','CONTABILIZADO','CERRADO')
               AND (polizaId IS NULL OR hashCalculo IS NULL)

            UNION ALL
            SELECT 'INVENTARIO_INICIAL', COUNT(*)::int
              FROM importaciones_inventario
             WHERE empresa_id=$1 AND modo='APLICAR'
               AND estado IN ('COMPLETADO','COMPLETADO_CON_ERRORES')
               AND CAST(COALESCE(fecha_fin,fecha_actualizacion) AS date) BETWEEN $2 AND $3
               AND (estado_contable <> 'GENERADO' OR poliza_id IS NULL)

          ) resultado WHERE cantidad > 0
        `,
        [empresaId, fechaDesde, fechaHasta],
      ).catch(siFalla('operaciones sin contabilizar', [])),
      /*
       * ──────────────────────────────────────────────────────────────────
       * EL ESPEJO CONTABLE, QUE NINGUN CONTROL MIRABA
       *
       * El cierre tenia ocho controles y ninguno preguntaba por la unica
       * integracion que la empresa declaro como su mayor espejo. Medido el
       * 25-sep-2026 contra la instalacion: 50 eventos en la bandeja de
       * salida, 5 FALLIDOS, tres por cuentas sin mapear —171.04, 613.04,
       * 109.05, 601.46— y dos porque Fineract rechazo la fecha.
       *
       * O sea: polizas registradas en el ERP que nunca llegaron al mayor
       * externo, y un cierre que habria certificado el mes como correcto
       * con los dos libros diferentes. Cerrar un mes es afirmar que los
       * numeros son los definitivos; en modo ESPEJO eso incluye los del
       * otro lado.
       *
       * Se cuenta lo NO entregado —pendiente, reintentable o fallido— de
       * esta empresa. No se filtra por periodo a proposito: un evento de
       * agosto sin entregar sigue siendo una divergencia viva en
       * septiembre, y esconderlo por fecha seria el mismo error de contar
       * un estado que nadie escribe.
       * ──────────────────────────────────────────────────────────────────
       */
      consultar(
        `
          SELECT
            COUNT(*) FILTER (WHERE e.estado = 'FALLIDO')::int         AS "fallidos",
            COUNT(*) FILTER (WHERE e.estado = 'REINTENTABLE')::int    AS "reintentables",
            COUNT(*) FILTER (WHERE e.estado = 'PENDIENTE')::int       AS "pendientes",
            MAX(c.modoContabilidad)                                    AS "modoEmpresa"
          FROM integracion_configuracion_empresa c
          LEFT JOIN integracion_eventos e
                 ON e.empresaId = c.empresaId
                AND e.estado IN ('FALLIDO','REINTENTABLE','PENDIENTE')
          WHERE c.empresaId = $1
        `,
        [empresaId],
      ).catch(siFalla('estado del espejo contable', [])),
    ]);

    const fila = contabilidadFilas?.[0] ?? {};
    const totalDebe = this.redondear(fila.totalDebe);
    const totalHaber = this.redondear(fila.totalHaber);
    const diferencia = this.redondear(totalDebe - totalHaber);
    const totalPolizas = Number(fila.totalPolizas ?? 0);
    const polizasSinPartidas = Number(fila.polizasSinPartidas ?? 0);
    const polizasDescuadradas = Number(fila.polizasDescuadradas ?? 0);
    const ivaTrasladado = this.redondear(ivaFilas?.[0]?.trasladado);
    const ivaAcreditable = this.redondear(ivaFilas?.[0]?.acreditable);
    const ivaTrasladadoNoCobrado = this.redondear(
      ivaFilas?.[0]?.trasladadoNoCobrado,
    );
    const ivaAcreditablePendiente = this.redondear(
      ivaFilas?.[0]?.acreditablePendiente,
    );
    const ivaDiferencia = this.redondear(ivaTrasladado - ivaAcreditable);
    const cuentasActivas = this.contarColumna(
      cuentasBancariasFilas?.[0],
      'cuentasActivas',
    );
    const estadosCerrados = this.contarColumna(
      estadosBancariosFilas?.[0],
      'estadosCerrados',
    );
    const coberturaCompleta =
      cuentasActivas === 0 || estadosCerrados >= cuentasActivas;
    const detalleOperaciones = (operacionesFilas ?? []).map((fila) => ({
      clave: String(fila.clave),
      cantidad: Number(fila.cantidad ?? 0),
    }));
    const totalSinContabilizar = detalleOperaciones.reduce(
      (total, fila) => total + fila.cantidad,
      0,
    );
    const exigirConciliacionBancaria =
      String(process.env.CIERRE_EXIGIR_CONCILIACION_BANCARIA ?? 'true')
        .trim()
        .toLowerCase() !== 'false';

    /*
     * El espejo, leido de lo que se midio. Si la consulta fallo, `espejoFilas`
     * viene vacio y el control no dice que todo esta bien: desaparece, y
     * MEDICION bloquea por su cuenta.
     */
    const espejo = (espejoFilas?.[0] ?? {}) as Record<string, unknown>;
    const espejoSeMidio = (espejoFilas?.length ?? 0) > 0;
    const espejoActivo =
      espejoSeMidio &&
      espejoEncendido(
        process.env.CONTABILIDAD_EXTERNA_MODO,
        espejo.modoEmpresa as string | null,
      );
    const espejoSinEntregar =
      Number(espejo.fallidos ?? 0) +
      Number(espejo.reintentables ?? 0) +
      Number(espejo.pendientes ?? 0);

    const controles: DiagnosticoCierre['controles'] = [
      {
        clave: 'POLIZAS',
        titulo: 'El mes tiene registros contables',
        descripcion:
          totalPolizas > 0
            ? `Se encontraron ${totalPolizas} póliza(s).`
            : 'No hay pólizas. Un mes vacío no debe cerrarse por accidente.',
        estado: totalPolizas > 0 ? 'CORRECTO' : 'BLOQUEO',
        bloquea: totalPolizas === 0,
      },
      {
        clave: 'BALANZA',
        titulo: 'Debe y Haber coinciden',
        descripcion:
          Math.abs(diferencia) < 0.01
            ? 'La balanza está cuadrada.'
            : `Existe una diferencia de ${diferencia.toFixed(2)}.`,
        estado: Math.abs(diferencia) < 0.01 ? 'CORRECTO' : 'BLOQUEO',
        bloquea: Math.abs(diferencia) >= 0.01,
      },
      {
        clave: 'INTEGRIDAD',
        titulo: 'Todas las pólizas tienen partidas y están cuadradas',
        descripcion:
          polizasSinPartidas === 0 && polizasDescuadradas === 0
            ? 'No se detectaron pólizas incompletas.'
            : `${polizasSinPartidas} sin partidas y ${polizasDescuadradas} descuadrada(s).`,
        estado:
          polizasSinPartidas === 0 && polizasDescuadradas === 0
            ? 'CORRECTO'
            : 'BLOQUEO',
        bloquea: polizasSinPartidas > 0 || polizasDescuadradas > 0,
      },
      {
        clave: 'ASIENTOS',
        titulo: 'No hay operaciones esperando póliza',
        descripcion:
          pendientes.length === 0
            ? 'Todas las operaciones del período llegaron a contabilidad.'
            : `${pendientes.length} operación(es) requieren atención en Asientos pendientes.`,
        estado: pendientes.length === 0 ? 'CORRECTO' : 'BLOQUEO',
        bloquea: pendientes.length > 0,
      },
      {
        clave: 'OPERACIONES_SIN_CONTABILIZAR',
        titulo: 'Todos los módulos llegaron al libro mayor',
        descripcion:
          totalSinContabilizar === 0
            ? 'No se detectaron operaciones definitivas sin póliza.'
            : `${totalSinContabilizar} operación(es) definitiva(s) siguen sin póliza: ${detalleOperaciones
                .map((fila) => `${fila.clave}=${fila.cantidad}`)
                .join(', ')}.`,
        estado: totalSinContabilizar === 0 ? 'CORRECTO' : 'BLOQUEO',
        bloquea: totalSinContabilizar > 0,
      },
      {
        clave: 'BANCOS',
        titulo: 'Conciliación bancaria del mes',
        descripcion: coberturaCompleta
          ? cuentasActivas === 0
            ? 'No hay cuentas bancarias activas.'
            : 'Los estados de cuenta activos aparecen conciliados y cerrados.'
          : `${estadosCerrados} de ${cuentasActivas} cuenta(s) tienen conciliación cerrada.`,
        estado: coberturaCompleta
          ? 'CORRECTO'
          : exigirConciliacionBancaria
            ? 'BLOQUEO'
            : 'ADVERTENCIA',
        bloquea: exigirConciliacionBancaria && !coberturaCompleta,
      },
      /*
       * Va el primero de los que bloquean porque explica a los demas: si esto
       * salta, los verdes de abajo no significan nada.
       */
      {
        clave: 'MEDICION',
        titulo: 'Todos los controles pudieron medirse',
        descripcion: noSeMidio.length
          ? `No se pudo medir: ${noSeMidio.join(', ')}. Los controles que dependen ` +
            'de esos datos no son de fiar; revisa el log del servidor.'
          : 'Todas las consultas del diagnóstico devolvieron datos.',
        estado: noSeMidio.length ? 'BLOQUEO' : 'CORRECTO',
        bloquea: noSeMidio.length > 0,
      },
      /*
       * Solo aplica cuando la empresa declaro el mayor externo como su espejo.
       * A quien instalo el ERP solo, este control no le dice nada y no aparece:
       * un control que no puede fallar es ruido, y el ruido tapa los que si.
       */
      ...(espejoActivo
        ? [
            {
              clave: 'ESPEJO_CONTABLE',
              titulo: 'Las pólizas llegaron al mayor externo',
              descripcion:
                espejoSinEntregar === 0
                  ? 'La bandeja de salida no tiene nada sin entregar: los dos libros dicen lo mismo.'
                  : `${espejoSinEntregar} asiento(s) no han llegado al mayor externo ` +
                    `(${Number(espejo.fallidos ?? 0)} fallido(s), ` +
                    `${Number(espejo.reintentables ?? 0)} reintentable(s), ` +
                    `${Number(espejo.pendientes ?? 0)} pendiente(s)). ` +
                    'Cerrar así deja los dos libros diferentes. Revísalo en ' +
                    'Integración › Bandeja de salida: lo más común es una cuenta ' +
                    'contable sin mapear al mayor externo.',
              estado: (espejoSinEntregar === 0
                ? 'CORRECTO'
                : 'BLOQUEO') as 'CORRECTO' | 'BLOQUEO',
              bloquea: espejoSinEntregar > 0,
            },
          ]
        : []),
      {
        clave: 'CONCILIACION_INICIAL',
        titulo: 'Existe una conciliación financiera de referencia',
        descripcion: conciliacion.length
          ? 'Hay una revisión inicial confirmada para consultar como antecedente.'
          : 'Todavía no existe una conciliación inicial confirmada.',
        estado: conciliacion.length ? 'CORRECTO' : 'ADVERTENCIA',
        bloquea: false,
      },
    ];

    return {
      periodo: {
        mes,
        anio,
        nombre: `${MESES[mes - 1]} ${anio}`,
        fechaDesde,
        fechaHasta,
      },
      generadoEn: new Date().toISOString(),
      contabilidad: {
        totalPolizas,
        totalPartidas: Number(fila.totalPartidas ?? 0),
        totalDebe,
        totalHaber,
        diferencia,
        polizasDescuadradas,
        polizasSinPartidas,
      },
      asientosPendientes: {
        total: pendientes.length,
        detalle: pendientes.map((pendiente) => ({
          id: String(pendiente.id),
          tipo: String(pendiente.tipo),
          folio: pendiente.folioDocumento
            ? String(pendiente.folioDocumento)
            : null,
          estado: String(pendiente.estado),
          error: pendiente.ultimoError ? String(pendiente.ultimoError) : null,
        })),
      },
      iva: {
        trasladado: ivaTrasladado,
        acreditable: ivaAcreditable,
        trasladadoNoCobrado: ivaTrasladadoNoCobrado,
        acreditablePendiente: ivaAcreditablePendiente,
        ivaAPagar: ivaDiferencia > 0 ? ivaDiferencia : 0,
        saldoAFavor: ivaDiferencia < 0 ? Math.abs(ivaDiferencia) : 0,
        movimientos: Number(ivaFilas?.[0]?.movimientos ?? 0),
      },
      bancos: { cuentasActivas, estadosCerrados, coberturaCompleta },
      conciliacionInicial: {
        existe: conciliacion.length > 0,
        fechaCorte: conciliacion?.[0]?.fechaCorte
          ? String(conciliacion[0].fechaCorte).substring(0, 10)
          : null,
        fechaConfirmacion: conciliacion?.[0]?.fechaConfirmacion ?? null,
      },
      operaciones: {
        totalSinContabilizar,
        detalle: detalleOperaciones,
      },
      controles,
      bloqueos: controles.filter((control) => control.bloquea).length,
    };
  }

  /*
   * ==========================================================================
   * El candado del cierre
   * --------------------------------------------------------------------------
   * Tenia DOS defectos, y entre los dos hacian que NINGUN mes pudiera cerrarse.
   *
   * 1. La consulta usaba un solo parametro y se le pasaban dos: la clave y un
   *    `modo` ('Shared' | 'Exclusive') que sobrevivio del puerto desde SQL
   *    Server, donde `sp_getapplock` si lo recibe. Postgres contestaba
   *    «bind message supplies 2 parameters, but prepared statement requires 1»
   *    y la transaccion entera se caia. El usuario veia «No se pudo completar
   *    la operacion en la base de datos», sin mas. Nunca se llego a probar
   *    porque el control de bancos bloqueaba antes: dos defectos en fila, y el
   *    primero escondia al segundo.
   *
   * 2. Aun sin eso, `pg_advisory_xact_lock` ESPERA hasta obtener el candado y
   *    no devuelve nada util; la consulta seleccionaba un `0` literal y luego
   *    se comprobaba `< 0`, que jamas podia ser cierto. El aviso «el periodo
   *    esta siendo procesado por otra operacion» era codigo muerto: existia
   *    para tranquilizar leyendolo, no para ocurrir.
   *
   * Con `pg_try_advisory_xact_lock` el candado se intenta y se contesta: si
   * otro cierre lo tiene, este falla de inmediato con un mensaje que dice la
   * verdad, en vez de quedarse esperando a que el otro termine.
   * ==========================================================================
   */
  private async adquirirCandado(
    consultar: Consultar,
    empresaId: string,
    anio: number,
    mes: number,
  ) {
    const filas = await consultar(
      `
        SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS "obtenido";
      `,
      [`CIERRE_CONTABLE:${empresaId}:${anio}:${mes}`],
    );
    if (filas?.[0]?.obtenido !== true) {
      throw new ConflictException(
        'El período está siendo procesado por otra operación. Intenta nuevamente.',
      );
    }
  }

  async isPeriodoCerrado(
    empresaId: string,
    mes: number,
    anio: number,
  ): Promise<boolean> {
    return !!(await this.cierreRepo.findOne({
      where: { empresaId, mes, anio },
    }));
  }

  async obtenerRevisionActual(empresaId: string, anio: number, mes: number) {
    const revision = await this.revisionRepo.findOne({
      where: { empresaId, anio, mes },
      order: { fechaCreacion: 'DESC' },
    });
    return revision ? this.presentarRevision(revision) : null;
  }

  async iniciarRevision(
    empresaId: string,
    usuarioId: string,
    dto: IniciarRevisionCierreDto,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    this.validarPeriodoCerrable(dto.anio, dto.mes);
    if (await this.isPeriodoCerrado(empresaId, dto.mes, dto.anio)) {
      throw new BadRequestException('El período ya está cerrado.');
    }
    const snapshot = await this.generarDiagnostico(
      empresaId,
      dto.mes,
      dto.anio,
    );
    await this.revisionRepo.update(
      {
        empresaId,
        anio: dto.anio,
        mes: dto.mes,
        estado: 'BORRADOR',
      },
      { estado: 'INVALIDADO' },
    );
    await this.revisionRepo.update(
      {
        empresaId,
        anio: dto.anio,
        mes: dto.mes,
        estado: 'LISTO',
      },
      { estado: 'INVALIDADO' },
    );
    const revision = await this.revisionRepo.save(
      this.revisionRepo.create({
        empresaId,
        mes: dto.mes,
        anio: dto.anio,
        estado: 'BORRADOR',
        snapshotJson: JSON.stringify(snapshot),
        confirmacionesJson: '{}',
        notas: null,
        creadoPor: usuarioId,
        revisadoPor: null,
        fechaRevision: null,
        cierreId: null,
        version: 1,
      }),
    );
    return this.presentarRevision(revision);
  }

  async prepararRevision(
    empresaId: string,
    usuarioId: string,
    id: string,
    dto: PrepararCierreDto,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    const revision = await this.revisionRepo.findOne({
      where: { id, empresaId },
    });
    if (!revision) throw new NotFoundException('Revisión no encontrada.');
    if (revision.estado === 'CERRADO' || revision.estado === 'INVALIDADO') {
      throw new ConflictException(
        'Esta revisión ya no puede modificarse. Toma una nueva fotografía.',
      );
    }
    /*
     * TRES, no cuatro. La cuarta era «confirmo que existe un respaldo reciente
     * de la base de datos» y ya no la firma nadie: la toma el cierre y si no
     * puede, el mes no se cierra.
     *
     * Esta comprobacion se quedo pidiendo las cuatro cuando se cambio la del
     * cierre, y el resultado era que NINGUNA revision podia confirmarse: la
     * pantalla ya no ofrecia la casilla y el servidor seguia exigiendola. Es el
     * mismo descuido del mes sin movimientos —tres puertas y se arreglaron
     * dos—, aqui cometido al arreglar el anterior.
     */
    if (
      !dto.confirmaciones.bancosRevisados ||
      !dto.confirmaciones.ivaRevisado ||
      !dto.confirmaciones.documentosCompletos
    ) {
      throw new BadRequestException(
        'Confirma las tres revisiones humanas antes de continuar.',
      );
    }
    const snapshot = await this.generarDiagnostico(
      empresaId,
      revision.mes,
      revision.anio,
    );
    revision.snapshotJson = JSON.stringify(snapshot);
    revision.version += 1;
    if (snapshot.bloqueos > 0) {
      revision.estado = 'BORRADOR';
      await this.revisionRepo.save(revision);
      throw new BadRequestException(
        'El diagnóstico cambió o conserva bloqueos. Corrige los problemas y vuelve a calcular.',
      );
    }
    revision.estado = 'LISTO';
    revision.confirmacionesJson = JSON.stringify(dto.confirmaciones);
    revision.notas = dto.notas?.trim() || null;
    revision.revisadoPor = usuarioId;
    revision.fechaRevision = new Date();
    await this.revisionRepo.save(revision);
    return this.presentarRevision(revision);
  }

  async cerrarPeriodo(
    dto: CerrarPeriodoGuiadoDto & {
      empresaId: string;
      usuarioId: string;
    },
  ) {
    await this.activacionService.exigirActiva(dto.empresaId);
    const revision = await this.revisionRepo.findOne({
      where: { id: dto.revisionId, empresaId: dto.empresaId },
    });
    if (!revision) throw new NotFoundException('Revisión no encontrada.');
    if (revision.estado !== 'LISTO') {
      throw new BadRequestException(
        'La revisión debe estar completa y sin bloqueos antes de cerrar.',
      );
    }
    this.validarPeriodoCerrable(revision.anio, revision.mes);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');
    try {
      const consultar: Consultar = (sql, parametros = []) =>
        qr.query(sql, parametros);
      await this.adquirirCandado(
        consultar,
        dto.empresaId,
        revision.anio,
        revision.mes,
      );
      const existente = await qr.manager.findOne(CierreContable, {
        where: {
          empresaId: dto.empresaId,
          mes: revision.mes,
          anio: revision.anio,
        },
      });
      if (existente) {
        throw new ConflictException('El período ya fue cerrado.');
      }
      const diagnostico = await this.generarDiagnostico(
        dto.empresaId,
        revision.mes,
        revision.anio,
        consultar,
      );
      if (diagnostico.bloqueos > 0) {
        throw new BadRequestException(
          'La información cambió después de la revisión y ahora existen bloqueos. Toma una nueva fotografía.',
        );
      }
      const confirmaciones = this.json<Record<string, boolean>>(
        revision.confirmacionesJson,
        {},
      );
      if (
        !confirmaciones.bancosRevisados ||
        !confirmaciones.ivaRevisado ||
        !confirmaciones.documentosCompletos
      ) {
        throw new BadRequestException(
          'Las confirmaciones humanas de la revisión están incompletas.',
        );
      }

      /*
       * ======================================================================
       * El respaldo se toma aqui, y si no se puede el mes no se cierra
       * ----------------------------------------------------------------------
       * Habia una cuarta casilla —«Confirmo que existe un respaldo reciente de
       * la base de datos»— y el sistema no tomaba ninguno ni enseñaba como
       * tomarlo. Un contador no sabe que es `pg_dump`. Una firma que nadie
       * puede cumplir se acaba marcando igual, y entonces la evidencia del
       * cierre deja constancia escrita de una comprobacion que no ocurrio: es
       * peor que no pedirla.
       *
       * Va DESPUES de todos los controles y ANTES de las escrituras, por dos
       * razones. Primero, no tiene sentido gastar minutos volcando la base
       * para descubrir despues que el mes tenia bloqueos. Segundo, y esta es
       * la que importa: lo que queda en el archivo es el estado PREVIO al
       * cierre, que es exactamente al que alguien querria volver.
       *
       * Si falla, lanza. El `catch` de abajo revierte la transaccion y el mes
       * sigue abierto, con el motivo en pantalla.
       * ======================================================================
       */
      const respaldo: RespaldoGenerado = await this.respaldoService.generar(
        revision.anio,
        revision.mes,
      );

      const cierre = await qr.manager.save(
        qr.manager.create(CierreContable, {
          empresaId: dto.empresaId,
          mes: revision.mes,
          anio: revision.anio,
          usuarioId: dto.usuarioId,
          notas: dto.notas?.trim() || revision.notas,
          revisionId: revision.id,
        }),
      );
      await qr.manager
        .createQueryBuilder()
        .update(Poliza)
        .set({ periodoCerrado: true })
        .where('empresaId = :empresaId AND mes = :mes AND anio = :anio', {
          empresaId: dto.empresaId,
          mes: revision.mes,
          anio: revision.anio,
        })
        .execute();
      await qr.manager.save(
        qr.manager.create(EventoCierreContable, {
          empresaId: dto.empresaId,
          mes: revision.mes,
          anio: revision.anio,
          tipo: 'CIERRE',
          usuarioId: dto.usuarioId,
          cierreId: cierre.id,
          revisionId: revision.id,
          motivo: dto.notas?.trim() || revision.notas,
          evidenciaJson: JSON.stringify({
            diagnostico,
            confirmaciones,
            respaldo,
          }),
        }),
      );
      revision.estado = 'CERRADO';
      revision.cierreId = cierre.id;
      revision.snapshotJson = JSON.stringify(diagnostico);
      revision.version += 1;
      await qr.manager.save(revision);
      await qr.commitTransaction();

      return {
        cierre,
        totalPolizas: diagnostico.contabilidad.totalPolizas,
        respaldo,
        mensaje:
          `Período ${revision.mes}/${revision.anio} cerrado con revisión completa. ` +
          `${diagnostico.contabilidad.totalPolizas} póliza(s) quedaron protegidas. ` +
          `Respaldo previo verificado: ${respaldo.archivo} (${respaldo.bytes} bytes).`,
      };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async reabrirPeriodo(dto: {
    empresaId: string;
    mes: number;
    anio: number;
    usuarioId: string;
    justificacion: string;
  }) {
    await this.activacionService.exigirActiva(dto.empresaId);
    const justificacion = dto.justificacion?.trim();
    if (!justificacion || justificacion.length < 10) {
      throw new BadRequestException(
        'Explica la reapertura con al menos 10 caracteres.',
      );
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');
    try {
      const consultar: Consultar = (sql, parametros = []) =>
        qr.query(sql, parametros);
      await this.adquirirCandado(
        consultar,
        dto.empresaId,
        dto.anio,
        dto.mes,
      );
      const cierre = await qr.manager.findOne(CierreContable, {
        where: {
          empresaId: dto.empresaId,
          mes: dto.mes,
          anio: dto.anio,
        },
      });
      if (!cierre) {
        throw new NotFoundException(
          `El período ${dto.mes}/${dto.anio} no está cerrado.`,
        );
      }
      const evidencia = {
        cierre: {
          id: cierre.id,
          fechaCierre: cierre.fechaCierre,
          usuarioId: cierre.usuarioId,
          notas: cierre.notas,
          revisionId: cierre.revisionId,
        },
        justificacion,
      };
      await qr.manager.save(
        qr.manager.create(EventoCierreContable, {
          empresaId: dto.empresaId,
          mes: dto.mes,
          anio: dto.anio,
          tipo: 'REAPERTURA',
          usuarioId: dto.usuarioId,
          cierreId: cierre.id,
          revisionId: cierre.revisionId,
          motivo: justificacion,
          evidenciaJson: JSON.stringify(evidencia),
        }),
      );
      await qr.manager
        .createQueryBuilder()
        .update(Poliza)
        .set({ periodoCerrado: false })
        .where('empresaId = :empresaId AND mes = :mes AND anio = :anio', {
          empresaId: dto.empresaId,
          mes: dto.mes,
          anio: dto.anio,
        })
        .execute();
      await qr.manager.delete(CierreContable, cierre.id);
      await qr.commitTransaction();
      return {
        mensaje: `Período ${dto.mes}/${dto.anio} reabierto. La reapertura y su justificación quedaron en la bitácora.`,
      };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async obtenerEstadoPeriodos(empresaId: string) {
    const anioActual = new Date().getFullYear();
    const anios = [anioActual - 1, anioActual];
    const [cierres, conteos] = await Promise.all([
      this.cierreRepo.find({ where: { empresaId } }),
      this.dataSource.query(
        `
          SELECT anio, mes, COUNT(*) AS "totalPolizas"
          FROM polizas
          WHERE empresaId = $1 AND anio IN ($2, $3)
          GROUP BY anio, mes
        `,
        [empresaId, anios[0], anios[1]],
      ),
    ]);
    const cierreMap = new Map(cierres.map((c) => [`${c.mes}-${c.anio}`, c]));
    const conteoMap = new Map(
      conteos.map((fila: any) => [
        `${Number(fila.mes)}-${Number(fila.anio)}`,
        Number(fila.totalPolizas),
      ]),
    );
    const hoy = new Date();
    const actual = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
    return anios.flatMap((anio) =>
      MESES.map((nombreMes, indice) => {
        const mes = indice + 1;
        const cierre = cierreMap.get(`${mes}-${anio}`);
        return {
          mes,
          anio,
          nombreMes,
          cerrado: !!cierre,
          fechaCierre: cierre?.fechaCierre ?? null,
          totalPolizas: conteoMap.get(`${mes}-${anio}`) ?? 0,
          cerrable: anio * 12 + mes < actual,
        };
      }),
    );
  }

  async obtenerHistorial(empresaId: string, anio: number, mes: number) {
    return this.eventoRepo.find({
      where: { empresaId, anio, mes },
      order: { fechaEvento: 'DESC' },
    });
  }

  async resumenPeriodo(empresaId: string, mes: number, anio: number) {
    const diagnostico = await this.generarDiagnostico(empresaId, mes, anio);
    return {
      mes,
      anio,
      ...diagnostico.contabilidad,
      cuadrada: Math.abs(diagnostico.contabilidad.diferencia) < 0.01,
      advertencia:
        diagnostico.bloqueos > 0
          ? `${diagnostico.bloqueos} control(es) bloquean el cierre.`
          : null,
      diagnostico,
    };
  }
}
