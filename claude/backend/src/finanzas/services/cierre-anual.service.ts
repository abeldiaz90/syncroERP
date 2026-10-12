import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  CuentaContable,
  RolCuentaSistema,
} from '../entities/cuenta-contable.entity';
import {
  armarTraspaso,
  CENTAVO,
  SaldoDeCuenta,
  TIPOS_DE_RESULTADO,
} from '../utils/el-resultado-del-ejercicio';
import { PolizasService } from './polizas.service';

/**
 * ============================================================================
 * EL CIERRE DEL EJERCICIO
 * ----------------------------------------------------------------------------
 * El ERP cerraba meses desde hacía tiempo. No cerraba AÑOS, y son dos cosas
 * distintas: cerrar un mes impide registrar más pólizas en él; cerrar el año
 * además **traspasa el resultado**, dejando en cero las cuentas de ingreso,
 * costo y gasto.
 *
 * Sin ese traspaso, el 2 de enero el estado de resultados sigue enseñando las
 * ventas del año pasado y el balance no cuadra contra el capital contable. No
 * es un reporte feo: a partir de ese día los dos estados financieros dicen
 * cosas distintas, y eso se descubre en la declaración anual.
 *
 * ── CUÁNDO SE HACE, Y POR QUÉ ASÍ ─────────────────────────────────────────
 *
 * Con **diciembre todavía abierto**. La puerta de pólizas rechaza cualquier
 * asiento en un período cerrado, y eso está bien: es el candado que sostiene
 * todo el cierre mensual. Abrirle una excepción al candado para meter la
 * póliza del año habría sido cambiar un control de verdad por la comodidad de
 * un orden distinto.
 *
 * Así que el orden es: cerrar enero a noviembre → traspasar el resultado →
 * cerrar diciembre. Cerrar diciembre es lo que sella el ejercicio.
 *
 * ── POR QUÉ NO HAY TABLA DE «EJERCICIOS CERRADOS» ─────────────────────────
 *
 * Porque ya existe la que contesta la pregunta: un ejercicio está cerrado
 * cuando sus doce meses lo están. Una segunda tabla que dijera lo mismo podría
 * decirlo distinto, y entonces habría que decidir cuál de las dos manda.
 * ============================================================================
 */
@Injectable()
export class CierreAnualService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly polizas: PolizasService,
  ) {}

  /** La clave que hace el traspaso idempotente: dos clics son una póliza. */
  private claveDeOrigen(empresaId: string, ejercicio: number) {
    return `CIERRE-ANUAL:${empresaId}:${ejercicio}`;
  }

  /**
   * Qué falta para poder cerrar el año, y cuánto se va a traspasar.
   *
   * Se contesta ANTES de tocar nada. Un botón que sólo dice «no se pudo» al
   * pulsarlo obliga a adivinar; esto dice qué meses faltan por nombre.
   */
  async diagnosticar(empresaId: string, ejercicio: number) {
    this.validarEjercicio(ejercicio);

    const cerrados = (await this.dataSource.query(
      `SELECT mes FROM cierres_contables
        WHERE empresaid = $1 AND anio = $2
        ORDER BY mes`,
      [empresaId, ejercicio],
    )) as Array<{ mes: number }>;
    const mesesCerrados = new Set(cerrados.map((c) => Number(c.mes)));

    const faltantes = [];
    for (let mes = 1; mes <= 11; mes++) {
      if (!mesesCerrados.has(mes)) faltantes.push(mes);
    }

    const cuentas = await this.cuentasDeResultado(empresaId);
    const saldos = await this.saldosDelEjercicio(empresaId, ejercicio);
    const traspaso = armarTraspaso(
      saldos,
      { utilidadId: cuentas.utilidadId ?? 'sin-cuenta', perdidaId: cuentas.perdidaId },
      `Cierre ${ejercicio}`,
    );

    const yaAsentada = await this.polizaDeCierre(empresaId, ejercicio);

    return {
      ejercicio,
      mesesCerrados: [...mesesCerrados].sort((a, b) => a - b),
      mesesQueFaltan: faltantes,
      diciembreAbierto: !mesesCerrados.has(12),
      cuentaUtilidad: cuentas.utilidadNombre,
      cuentaPerdida: cuentas.perdidaNombre,
      resultado: traspaso.resultado,
      totalIngresos: traspaso.totalIngresos,
      totalCostos: traspaso.totalCostos,
      totalGastos: traspaso.totalGastos,
      cuentasPorSaldar: traspaso.cuentasSaldadas,
      yaAsentado: yaAsentada ? { folio: yaAsentada.folio, id: yaAsentada.id } : null,
      /* La lista de lo que impide cerrar, en palabras. Vacía = se puede. */
      impedimentos: this.impedimentos({
        faltantes,
        diciembreCerrado: mesesCerrados.has(12),
        sinCuenta: !cuentas.utilidadId,
        nadaQueSaldar: traspaso.cuentasSaldadas === 0,
        yaAsentado: !!yaAsentada,
      }),
    };
  }

  private impedimentos(e: {
    faltantes: number[];
    diciembreCerrado: boolean;
    sinCuenta: boolean;
    nadaQueSaldar: boolean;
    yaAsentado: boolean;
  }): string[] {
    const lista: string[] = [];
    if (e.yaAsentado) {
      lista.push(
        'El resultado de este ejercicio ya se traspasó. Volver a hacerlo lo contaría dos veces.',
      );
      return lista;
    }
    if (e.faltantes.length) {
      lista.push(
        `Faltan por cerrar los meses ${e.faltantes.join(', ')}. El resultado del año se arma con ` +
          'los doce, y un mes abierto todavía puede cambiarlo.',
      );
    }
    if (e.diciembreCerrado) {
      lista.push(
        'Diciembre ya está cerrado y la póliza de traspaso lleva fecha de diciembre. ' +
          'Reábrelo con su motivo, asienta el traspaso y vuelve a cerrarlo: ése es el acto que sella el ejercicio.',
      );
    }
    if (e.sinCuenta) {
      lista.push(
        'No hay cuenta marcada como «Resultado del ejercicio» (SAT 305.01). ' +
          'Asígnale ese rol de sistema a la cuenta de capital correspondiente en el catálogo contable.',
      );
    }
    if (e.nadaQueSaldar) {
      lista.push(
        'No hay saldos de ingreso, costo ni gasto en el ejercicio: no hay nada que traspasar.',
      );
    }
    return lista;
  }

  /**
   * Asienta la póliza de traspaso.
   *
   * Va por `crearPolizaManualEnTransaccion`, la misma puerta que usa el resto
   * del sistema: con su candado de período, su folio, su validación de cuentas
   * afectables y su cuadre. El cierre del año no merece una puerta propia —y
   * una puerta propia es como se pierden esas cuatro cosas de golpe—.
   */
  async traspasarResultado(
    empresaId: string,
    ejercicio: number,
    usuarioId?: string,
  ) {
    const diagnostico = await this.diagnosticar(empresaId, ejercicio);
    if (diagnostico.impedimentos.length) {
      throw new ConflictException(diagnostico.impedimentos.join(' '));
    }

    const cuentas = await this.cuentasDeResultado(empresaId);
    const saldos = await this.saldosDelEjercicio(empresaId, ejercicio);
    const traspaso = armarTraspaso(
      saldos,
      { utilidadId: cuentas.utilidadId!, perdidaId: cuentas.perdidaId },
      `Cierre ${ejercicio}`,
    );

    if (!traspaso.partidas.length) {
      throw new BadRequestException('No hay nada que traspasar en este ejercicio.');
    }

    /*
     * La póliza se asienta el 31 de diciembre, que es el último día del
     * ejercicio que se cierra. Con la fecha de hoy quedaría en el año
     * siguiente y el resultado del año nuevo nacería con el del anterior
     * dentro, que es exactamente lo que este traspaso viene a evitar.
     */
    const poliza = await this.dataSource.transaction((em) =>
      this.polizas.crearPolizaManualEnTransaccion(em, {
        empresaId,
        tipo: 'DIARIO',
        fecha: new Date(ejercicio, 11, 31),
        concepto:
          `Cierre del ejercicio ${ejercicio} · traspaso de resultado · ` +
          (traspaso.resultado >= 0
            ? `utilidad de ${traspaso.resultado.toFixed(2)}`
            : `pérdida de ${Math.abs(traspaso.resultado).toFixed(2)}`),
        origenClave: this.claveDeOrigen(empresaId, ejercicio),
        origenTipo: 'CIERRE_ANUAL',
        partidas: traspaso.partidas,
      }),
    );

    return {
      poliza: { id: poliza.id, folio: (poliza as any).folio },
      resultado: traspaso.resultado,
      esUtilidad: traspaso.resultado >= 0,
      cuentasSaldadas: traspaso.cuentasSaldadas,
      totalIngresos: traspaso.totalIngresos,
      totalCostos: traspaso.totalCostos,
      totalGastos: traspaso.totalGastos,
      siguientePaso:
        `Revisa la póliza y cierra diciembre de ${ejercicio}: ese cierre es el que sella el ejercicio.`,
      registradoPor: usuarioId ?? null,
    };
  }

  /** Las dos cuentas de capital donde aterriza el resultado. */
  private async cuentasDeResultado(empresaId: string) {
    const cuentas = await this.dataSource.getRepository(CuentaContable).find({
      where: [
        { empresaId, rolSistema: RolCuentaSistema.RESULTADO_EJERCICIO_UTILIDAD },
        { empresaId, rolSistema: RolCuentaSistema.RESULTADO_EJERCICIO_PERDIDA },
      ],
    });
    const utilidad = cuentas.find(
      (c) => c.rolSistema === RolCuentaSistema.RESULTADO_EJERCICIO_UTILIDAD,
    );
    const perdida = cuentas.find(
      (c) => c.rolSistema === RolCuentaSistema.RESULTADO_EJERCICIO_PERDIDA,
    );
    return {
      utilidadId: utilidad?.id ?? null,
      utilidadNombre: utilidad ? `${utilidad.numeroCuenta} ${utilidad.nombre}` : null,
      perdidaId: perdida?.id ?? null,
      perdidaNombre: perdida ? `${perdida.numeroCuenta} ${perdida.nombre}` : null,
    };
  }

  /**
   * Los saldos del ejercicio, por cuenta Y POR CENTRO.
   *
   * Se excluye la propia póliza de cierre si existiera —no debería, porque la
   * clave de origen lo impide, pero un reporte que se cuenta a sí mismo es un
   * defecto que sólo se ve con el año ya cerrado—. Y se excluyen las pólizas
   * canceladas, que por definición no afectan saldos.
   */
  private async saldosDelEjercicio(
    empresaId: string,
    ejercicio: number,
  ): Promise<SaldoDeCuenta[]> {
    const filas = (await this.dataSource.query(
      `SELECT c.id              AS "cuentaContableId",
              c.numerocuenta    AS "numeroCuenta",
              c.nombre          AS "nombre",
              c.tipo            AS "tipo",
              pp.centrocostoid  AS "centroCostoId",
              COALESCE(SUM(pp.cargo), 0)::float AS "cargos",
              COALESCE(SUM(pp.abono), 0)::float AS "abonos"
         FROM partidas_poliza pp
         JOIN polizas pol ON pol.id = pp.polizaid
         JOIN cuentas_contables c ON c.id = pp.cuentacontableid
        WHERE pol.empresaid = $1
          AND pol.anio = $2
          AND pol.estatus <> 'CANCELADA'
          AND COALESCE(pol.origentipo, '') <> 'CIERRE_ANUAL'
          AND c.tipo = ANY($3::text[])
        GROUP BY c.id, c.numerocuenta, c.nombre, c.tipo, pp.centrocostoid
        ORDER BY c.numerocuenta`,
      [empresaId, ejercicio, [...TIPOS_DE_RESULTADO]],
    )) as SaldoDeCuenta[];
    return filas.filter(
      (f) => Math.abs(Number(f.cargos) - Number(f.abonos)) >= CENTAVO,
    );
  }

  /** La póliza de cierre del ejercicio, si ya se asentó. */
  private async polizaDeCierre(empresaId: string, ejercicio: number) {
    const filas = (await this.dataSource.query(
      `SELECT id, folio FROM polizas
        WHERE empresaid = $1 AND origenclave = $2 AND estatus <> 'CANCELADA'
        LIMIT 1`,
      [empresaId, this.claveDeOrigen(empresaId, ejercicio)],
    )) as Array<{ id: string; folio: string }>;
    return filas?.[0] ?? null;
  }

  private validarEjercicio(ejercicio: number) {
    if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2999) {
      throw new BadRequestException(
        'El ejercicio tiene que ser un año de cuatro dígitos.',
      );
    }
    const actual = new Date().getFullYear();
    if (ejercicio > actual) {
      /* Cerrar un año que todavía no termina no es un cierre: es inventar un
         resultado que va a cambiar mañana. */
      throw new BadRequestException(
        `El ejercicio ${ejercicio} todavía no termina: no se puede traspasar su resultado.`,
      );
    }
  }
}
