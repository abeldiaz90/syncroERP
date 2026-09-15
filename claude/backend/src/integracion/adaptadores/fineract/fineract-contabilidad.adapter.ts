import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VinculoIntegracion } from '../../entities/vinculo-integracion.entity';
import { TipoVinculo } from '../../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../../entities/configuracion-integracion-empresa.entity';
import { ErrorIntegracionExterna } from '../../ports/cartera-externa.port';
import {
  AsientoConsultado,
  AltaCuentaExterna,
  AsientoExterno,
  AvisoConfiguracion,
  ClaseCuenta,
  CuentaExterna,
  PuertoContabilidadExterna,
} from '../../ports/contabilidad-externa.port';
import { FineractConfig } from './fineract.config';
import { ErrorFineract, FineractHttpService } from './fineract-http.service';

/** accountingRule = 1 significa «sin contabilidad» en Fineract. */
const CONTABILIDAD_NINGUNA = 1;
/** `repaymentRescheduleType` 1 = no recorrer el vencimiento a día hábil. */
const RECHAZO_SIN_RECORRER = 1;

/** Tipos de cuenta de Fineract. */
const TIPO_FINERACT: Record<ClaseCuenta, number> = {
  [ClaseCuenta.ACTIVO]: 1,
  [ClaseCuenta.PASIVO]: 2,
  [ClaseCuenta.CAPITAL]: 3,
  [ClaseCuenta.INGRESO]: 4,
  [ClaseCuenta.GASTO]: 5,
};
const CLASE_DESDE_FINERACT: Record<number, ClaseCuenta> = {
  1: ClaseCuenta.ACTIVO,
  2: ClaseCuenta.PASIVO,
  3: ClaseCuenta.CAPITAL,
  4: ClaseCuenta.INGRESO,
  5: ClaseCuenta.GASTO,
};
/** usage = 1 es cuenta de detalle; 2 es de agrupación. */
const USO_DETALLE = 1;

interface ParametrosFineract {
  productoCreditoSimpleId?: number;
  productoMensualidadesId?: number;
  productoMsiId?: number;
}

/**
 * Mayor contable de Fineract.
 *
 * El ERP le manda asientos manuales ya calculados. Fineract no decide nada
 * contable aquí: no conoce el IVA mexicano, no genera la póliza fiscal y no
 * cierra el periodo. Sirve como libro principal —completo y consolidable— y el
 * ERP conserva el libro fiscal.
 *
 * Ver `verificarConfiguracion`: es la comprobación que impide el error más caro
 * de todo esto.
 */
@Injectable()
export class FineractContabilidadAdapter implements PuertoContabilidadExterna {
  readonly proveedor = 'fineract';
  private readonly logger = new Logger(FineractContabilidadAdapter.name);

  constructor(
    private readonly http: FineractHttpService,
    private readonly cfg: FineractConfig,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
    @InjectRepository(VinculoIntegracion)
    private readonly vinculos: Repository<VinculoIntegracion>,
  ) {}

  configurado(): boolean {
    return this.cfg.habilitado;
  }

  disponible(): boolean {
    return this.http.disponible;
  }

  async registrarAsiento(asiento: AsientoExterno): Promise<string> {
    const debits = asiento.movimientos
      .filter((m) => Number(m.cargo) > 0)
      .map((m) => ({
        glAccountId: Number(m.cuentaIdExterna),
        amount: this.redondear(m.cargo),
      }));
    const credits = asiento.movimientos
      .filter((m) => Number(m.abono) > 0)
      .map((m) => ({
        glAccountId: Number(m.cuentaIdExterna),
        amount: this.redondear(m.abono),
      }));

    if (debits.length === 0 || credits.length === 0) {
      throw new ErrorIntegracionExterna(
        `La póliza ${asiento.folio} no tiene cargos y abonos en el asiento espejo.`,
        false,
      );
    }

    try {
      const respuesta = await this.http.post<{
        transactionId?: string;
        resourceId?: number;
      }>('/v1/journalentries', {
        officeId: Number(asiento.oficinaIdExterna),
        transactionDate: asiento.fecha,
        currencyCode: asiento.moneda,
        // Es la única huella legible que queda del lado de Fineract para
        // rastrear un asiento hasta su póliza en el ERP.
        referenceNumber: `SYNCRO-${asiento.folio}`,
        comments: `${asiento.concepto} · póliza ${asiento.folio} (SyncroERP)`.slice(
          0,
          500,
        ),
        debits,
        credits,
        locale: this.cfg.localePorDefecto,
        dateFormat: this.cfg.formatoFecha,
      });

      const id = respuesta.transactionId ?? respuesta.resourceId;
      if (!id) {
        throw new ErrorIntegracionExterna(
          `Fineract aceptó el asiento de la póliza ${asiento.folio} pero no devolvió identificador.`,
          false,
        );
      }
      return String(id);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Busca el asiento por el `referenceNumber` que puso el ERP.
   *
   * Fineract no permite consultar por referencia, así que se pide el día de la
   * póliza en su oficina y se filtra aquí. Es una ventana estrecha —un día,
   * una oficina— y sólo se recorre cuando hubo un envío en vuelo, que es raro.
   */
  async buscarAsientoPorReferencia(input: {
    referencia: string;
    oficinaIdExterna: string;
    fecha: string;
  }): Promise<string | null> {
    try {
      const respuesta = await this.http.get<{
        pageItems?: Array<{
          referenceNumber?: string | null;
          transactionId?: string | number | null;
        }>;
      }>('/v1/journalentries', {
        params: {
          officeId: Number(input.oficinaIdExterna),
          fromDate: input.fecha,
          toDate: input.fecha,
          manualEntriesOnly: true,
          limit: 500,
          locale: this.cfg.localePorDefecto,
          dateFormat: this.cfg.formatoFecha,
        },
        timeoutMs: this.cfg.timeoutFondoMs,
      });

      const hallado = (respuesta.pageItems ?? []).find(
        (e) => String(e.referenceNumber ?? '') === input.referencia,
      );
      return hallado?.transactionId ? String(hallado.transactionId) : null;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async consultarAsiento(id: string, oficinaId: string): Promise<AsientoConsultado | null> {
    if (!id || !/^[1-9][0-9]*$/.test(oficinaId)) throw new Error('Asiento u oficina inválidos');
    type Linea = { id: number; transactionId: string; officeId: number; glAccountId: number;
      amount: number; entryType: { id: number }; reversed: boolean; referenceNumber?: string;
      currency: { code: string } };
    const lineas: Linea[] = [];
    const vistos = new Set<number>();
    try {
      for (let pagina = 0; pagina < 100; pagina++) {
        const respuesta = await this.http.get<{ totalFilteredRecords: number; pageItems: Linea[] }>('/v1/journalentries', {
          params: { transactionId: id, officeId: Number(oficinaId), limit: 200, offset: lineas.length },
          timeoutMs: this.cfg.timeoutFondoMs,
        });
        if (!Array.isArray(respuesta.pageItems) || !Number.isInteger(respuesta.totalFilteredRecords) || respuesta.totalFilteredRecords < 0) throw new Error('Respuesta contable incompleta');
        for (const m of respuesta.pageItems) {
          if (vistos.has(m.id) || String(m.transactionId) !== id || String(m.officeId) !== oficinaId ||
              !Number.isInteger(m.id) || !Number.isInteger(m.glAccountId) || ![1, 2].includes(m.entryType?.id) ||
              typeof m.amount !== 'number' || !Number.isFinite(m.amount) || m.amount < 0 ||
              typeof m.reversed !== 'boolean' || !m.currency?.code) throw new Error('Partida contable inválida o fuera de alcance');
          vistos.add(m.id); lineas.push(m);
        }
        if (lineas.length === respuesta.totalFilteredRecords) {
          if (!lineas.length) return null;
          const primera = lineas[0];
          if (lineas.some(m => m.currency.code !== primera.currency.code || m.referenceNumber !== primera.referenceNumber)) throw new Error('Cabecera contable inconsistente');
          return { id, referencia: primera.referenceNumber ?? '', moneda: primera.currency.code,
            reversado: lineas.some(m => m.reversed),
            movimientos: lineas.map(m => ({ cuentaIdExterna: String(m.glAccountId), cargo: m.entryType.id === 2 ? m.amount : 0, abono: m.entryType.id === 1 ? m.amount : 0 })) };
        }
        if (!respuesta.pageItems.length || lineas.length > respuesta.totalFilteredRecords) throw new Error('Paginación contable incompleta');
      }
      throw new Error('El asiento excede el límite de consulta');
    } catch (error) { throw this.traducir(error); }
  }

  async cuentasDisponibles(): Promise<CuentaExterna[]> {
    try {
      const cuentas = await this.http.get<
        {
          id: number;
          glCode: string;
          name: string;
          type?: { id?: number };
          usage?: { id?: number };
          manualEntriesAllowed?: boolean;
        }[]
      >('/v1/glaccounts');

      return (cuentas ?? []).map((c) => ({
        id: String(c.id),
        codigo: c.glCode,
        nombre: c.name,
        clase: CLASE_DESDE_FINERACT[c.type?.id ?? 1] ?? ClaseCuenta.ACTIVO,
        admiteAsientoManual: c.manualEntriesAllowed !== false,
      }));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async crearCuenta(datos: AltaCuentaExterna): Promise<CuentaExterna> {
    // Idempotencia por código: dos cuentas con el mismo código en el mayor es
    // un problema que después nadie sabe cuál de las dos arreglar.
    const existentes = await this.cuentasDisponibles();
    const yaEsta = existentes.find((c) => c.codigo === datos.codigo);
    if (yaEsta) {
      this.logger.log(
        `La cuenta ${datos.codigo} ya existía en Fineract; se reutiliza.`,
      );
      return yaEsta;
    }

    try {
      const respuesta = await this.http.post<{ resourceId: number }>(
        '/v1/glaccounts',
        {
          name: datos.nombre.slice(0, 200),
          glCode: datos.codigo,
          type: TIPO_FINERACT[datos.clase],
          usage: USO_DETALLE,
          manualEntriesAllowed: true,
          description: (datos.descripcion ?? 'Creada desde SyncroERP').slice(0, 500),
        },
      );
      return {
        id: String(respuesta.resourceId),
        codigo: datos.codigo,
        nombre: datos.nombre,
        clase: datos.clase,
        admiteAsientoManual: true,
      };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async saldoCuenta(
    cuentaIdExterna: string,
    empresaId: string,
    hasta: string,
  ): Promise<number> {
    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const oficina = cfg?.oficinaContableExterna;

    try {
      const respuesta = await this.http.get<{
        pageItems?: { entryType?: { id?: number }; amount?: number }[];
      }>('/v1/journalentries', {
        params: {
          glAccountId: Number(cuentaIdExterna),
          officeId: oficina ? Number(oficina) : undefined,
          toDate: hasta,
          dateFormat: this.cfg.formatoFecha,
          locale: this.cfg.localePorDefecto,
          limit: -1,
        },
      });

      // Saldo deudor: cargos menos abonos. La conciliación compara contra el
      // saldo del ERP con el mismo criterio.
      return (respuesta.pageItems ?? []).reduce((total, movimiento) => {
        // Fineract usa JournalEntryType: CREDIT=1, DEBIT=2; no publica debit.
        const tipo = movimiento.entryType?.id;
        const importe = Number(movimiento.amount);
        if ((tipo !== 1 && tipo !== 2) || !Number.isFinite(importe)) {
          throw new Error('Movimiento contable externo sin tipo o importe válido');
        }
        // Incluir original y contrapartida: juntos neutralizan una reversa.
        return total + (tipo === 2 ? importe : -importe);
      }, 0);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Comprueba que Fineract no vaya a asentar por su cuenta.
   *
   * Si un producto de préstamo tiene contabilidad automática, Fineract genera
   * el asiento del desembolso y del cobro por su lado, **y además** recibe el
   * espejo de la póliza que el ERP ya generó para esa misma venta. Las cuentas
   * por cobrar quedan al doble y el descuadre aparece semanas después, cuando
   * ya nadie recuerda qué cambió.
   *
   * Por eso los productos deben quedar en «None»: el ERP es el único motor
   * contable, y Fineract sólo recibe el espejo.
   */
  async verificarConfiguracion(empresaId: string): Promise<AvisoConfiguracion[]> {
    const avisos: AvisoConfiguracion[] = [];

    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    if (!cfg?.oficinaContableExterna) {
      avisos.push({
        gravedad: 'ERROR',
        clave: 'oficina-contable',
        mensaje:
          'Falta la oficina contable del mayor externo; ninguna póliza se podrá espejar.',
      });
    }

    const parametros = (cfg?.parametrosProveedor ?? {}) as ParametrosFineract;
    const productos = [
      ['productoCreditoSimpleId', parametros.productoCreditoSimpleId],
      ['productoMensualidadesId', parametros.productoMensualidadesId],
      ['productoMsiId', parametros.productoMsiId],
    ] as const;

    // El catálogo vigente guarda sus productos en vínculos; los parámetros
    // anteriores se conservan para instalaciones que aún los utilizan.
    const vinculados = await this.vinculos.find({
      where: { empresaId, tipo: TipoVinculo.PRODUCTO_CREDITO, proveedor: this.proveedor },
    });
    const porId = new Map<string, string>();
    for (const [nombre, id] of productos) {
      if (id) porId.set(String(id), nombre);
    }
    for (const vinculo of vinculados) {
      if (vinculo.idExterno && !porId.has(vinculo.idExterno)) {
        porId.set(vinculo.idExterno, 'producto:' + vinculo.entidadId);
      }
    }

    for (const [id, nombre] of porId) {
      try {
        const producto = await this.http.get<{
          name?: string;
          accountingRule?: { id?: number; value?: string };
        }>(`/v1/loanproducts/${encodeURIComponent(id)}`);

        const regla = producto.accountingRule?.id;
        if (regla !== undefined && regla !== CONTABILIDAD_NINGUNA) {
          avisos.push({
            gravedad: 'ERROR',
            clave: `contabilidad-duplicada:${nombre}`,
            mensaje:
              `El producto ${producto.name ?? id} tiene contabilidad automática ` +
              `(${producto.accountingRule?.value ?? regla}). Con el espejo de pólizas activo, ` +
              'esto duplica las cuentas por cobrar. Debe quedar en «None».',
          });
        }
      } catch (error) {
        avisos.push({
          gravedad: 'ADVERTENCIA',
          clave: `producto-ilegible:${nombre}`,
          mensaje: `No se pudo leer el producto ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    // ── Días hábiles ────────────────────────────────────────────────────────
    // Fineract puede recorrer al siguiente día hábil cualquier vencimiento que
    // caiga en fin de semana o día inhábil. El ERP no lo hace: la fecha que el
    // cliente firma es la que calculó el ERP. Con la regla encendida, los dos
    // sistemas discrepan en silencio y sólo se ve comparando vencimientos.
    try {
      const habiles = await this.http.get<{
        recurrence?: string;
        repaymentRescheduleType?: { id?: number; value?: string };
      }>('/v1/workingdays');

      const regla = habiles.repaymentRescheduleType?.id;
      if (regla !== undefined && regla !== RECHAZO_SIN_RECORRER) {
        avisos.push({
          gravedad: 'ERROR',
          clave: 'dias-habiles-recorren',
          mensaje:
            'Fineract está configurado para recorrer los vencimientos que caen en día ' +
            `inhábil («${habiles.repaymentRescheduleType?.value ?? regla}»). El ERP no los ` +
            'recorre, así que las dos tablas de amortización van a diferir en fechas aunque ' +
            'los importes coincidan. Ponlo en «Move to next working day» sólo si el ERP ' +
            'adopta la misma regla; si no, déjalo sin recorrer.',
        });
      }
    } catch (error) {
      avisos.push({
        gravedad: 'ADVERTENCIA',
        clave: 'dias-habiles-ilegibles',
        mensaje: `No se pudo leer la configuración de días hábiles: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }

    return avisos;
  }

  private redondear(valor: number): number {
    return Math.round(Number(valor ?? 0) * 100) / 100;
  }

  private traducir(error: unknown): ErrorIntegracionExterna {
    if (error instanceof ErrorIntegracionExterna) return error;
    if (error instanceof ErrorFineract) {
      return new ErrorIntegracionExterna(
        error.message,
        error.reintentable,
        { estadoHttp: error.estadoHttp, cuerpo: error.cuerpo },
        error.pudoAplicarse,
      );
    }
    return new ErrorIntegracionExterna(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
}
