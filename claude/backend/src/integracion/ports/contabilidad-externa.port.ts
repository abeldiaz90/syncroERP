import { ErrorIntegracionExterna } from './cartera-externa.port';

/**
 * Puerto del mayor contable externo.
 *
 * El contrato es deliberadamente estrecho: **registrar un asiento ya calculado**
 * y **leer un saldo para conciliar**. No hay «calcular», no hay «cerrar
 * periodo», no hay «generar la póliza». Todo eso lo hace el motor contable del
 * ERP, que es el único que conoce el IVA mexicano, el catálogo del SAT y el
 * amarre con el CFDI.
 *
 * El externo recibe el espejo del asiento, no la responsabilidad de producirlo.
 * Es la diferencia entre dos libros que nacen del mismo asiento —y por tanto no
 * pueden divergir— y dos motores calculando en paralelo, que divergen siempre.
 */

export interface MovimientoAsientoExterno {
  /** Id de la cuenta en el mayor externo, ya resuelto por el mapeo. */
  cuentaIdExterna: string;
  /** Código de la cuenta del ERP, para el mensaje de error si algo falla. */
  codigoCuentaErp: string;
  cargo: number;
  abono: number;
}

export interface AsientoExterno {
  empresaId: string;
  /** Póliza del ERP que origina el espejo. */
  polizaId: string;
  /** Folio de la póliza. Viaja como referencia legible en el externo. */
  folio: string;
  fecha: string;
  concepto: string;
  moneda: string;
  /** Oficina del externo a la que se carga. */
  oficinaIdExterna: string;
  movimientos: MovimientoAsientoExterno[];
}

/** Cuenta del mayor externo, en vocabulario neutral. */
export interface CuentaExterna {
  id: string;
  codigo: string;
  nombre: string;
  /** ACTIVO · PASIVO · CAPITAL · INGRESO · GASTO, ya traducido por el adaptador. */
  clase: ClaseCuenta;
  admiteAsientoManual: boolean;
}

export enum ClaseCuenta {
  ACTIVO = 'ACTIVO',
  PASIVO = 'PASIVO',
  CAPITAL = 'CAPITAL',
  INGRESO = 'INGRESO',
  GASTO = 'GASTO',
}

export interface AltaCuentaExterna {
  codigo: string;
  nombre: string;
  clase: ClaseCuenta;
  descripcion?: string | null;
}

export interface SaldoCuentaExterna {
  cuentaIdExterna: string;
  saldo: number;
}

export interface PuertoContabilidadExterna {
  readonly proveedor: string;

  configurado(): boolean;
  disponible(): boolean;

  /**
   * Registra el asiento espejo y devuelve su identificador externo.
   *
   * Advertencia de idempotencia: a diferencia de clientes y créditos, un
   * asiento manual no siempre admite una clave de idempotencia del lado del
   * proveedor. El despachador protege esto marcando el vínculo EN_VUELO antes
   * de llamar; ver `IntegracionDespachadorService`.
   */
  registrarAsiento(asiento: AsientoExterno): Promise<string>;

  /**
   * Busca un asiento ya registrado por la referencia que le puso el ERP.
   *
   * Existe para resolver la única ambigüedad real del espejo contable: si un
   * envío se pierde en vuelo, nadie sabe si el asiento se aplicó. La respuesta
   * la tiene el mayor externo, y preguntársela es mejor que pedirle a una
   * persona que abra dos pantallas y compare. Devuelve el identificador si lo
   * encuentra, o null si no existe.
   */
  buscarAsientoPorReferencia(input: {
    referencia: string;
    oficinaIdExterna: string;
    fecha: string;
  }): Promise<string | null>;

  /** Catálogo de cuentas del mayor externo. */
  cuentasDisponibles(): Promise<CuentaExterna[]>;

  /**
   * Crea una cuenta en el mayor externo. Idempotente por código: si ya existe
   * una con ese código, devuelve la existente en vez de duplicarla.
   */
  crearCuenta(datos: AltaCuentaExterna): Promise<CuentaExterna>;

  /** Saldo de una cuenta a una fecha. Lo usa la conciliación contable. */
  saldoCuenta(
    cuentaIdExterna: string,
    empresaId: string,
    hasta: string,
  ): Promise<number>;

  /**
   * Verifica que la configuración del proveedor no vaya a duplicar asientos.
   *
   * Es la comprobación que evita el error más caro de esta integración: si los
   * productos de crédito del externo tienen contabilidad automática, el externo
   * asienta el préstamo por su cuenta **y además** recibe el espejo de la
   * póliza del ERP, y las cuentas por cobrar quedan al doble.
   */
  verificarConfiguracion(empresaId: string): Promise<AvisoConfiguracion[]>;
}

export interface AvisoConfiguracion {
  gravedad: 'ERROR' | 'ADVERTENCIA';
  clave: string;
  mensaje: string;
}

export class ContabilidadExternaNoConfigurada
  implements PuertoContabilidadExterna
{
  readonly proveedor = 'ninguno';

  configurado(): boolean {
    return false;
  }
  disponible(): boolean {
    return false;
  }
  async registrarAsiento(): Promise<string> {
    throw new ErrorIntegracionExterna(
      'No hay un mayor contable externo configurado.',
      false,
    );
  }
  async saldoCuenta(): Promise<number> {
    throw new ErrorIntegracionExterna(
      'No hay un mayor contable externo configurado.',
      false,
    );
  }
  async buscarAsientoPorReferencia(): Promise<string | null> {
    return null;
  }
  async cuentasDisponibles(): Promise<CuentaExterna[]> {
    return [];
  }
  async crearCuenta(): Promise<CuentaExterna> {
    throw new ErrorIntegracionExterna(
      'No hay un mayor contable externo configurado.',
      false,
    );
  }
  async verificarConfiguracion(): Promise<AvisoConfiguracion[]> {
    return [];
  }
}
