export enum MetodoPagoVenta {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  /** El banco financia al tarjetahabiente; para el comercio es una venta de contado vía TPV. */
  MSI_BANCO = 'MSI_BANCO',
  CREDITO_30D = 'CREDITO_30D',
  CREDITO_60D = 'CREDITO_60D',
  CREDITO_90D = 'CREDITO_90D',
  MENSUALIDADES = 'MENSUALIDADES',
  OTRO = 'OTRO',
}

export const METODOS_CREDITO_VENTA = new Set<MetodoPagoVenta>([
  MetodoPagoVenta.CREDITO_30D,
  MetodoPagoVenta.CREDITO_60D,
  MetodoPagoVenta.CREDITO_90D,
  MetodoPagoVenta.MENSUALIDADES,
]);

/** Todo cobro inmediato debe llegar a una caja, banco o TPV identificable. */
export const METODOS_QUE_REQUIEREN_CUENTA = new Set<MetodoPagoVenta>([
  MetodoPagoVenta.EFECTIVO,
  MetodoPagoVenta.TARJETA,
  MetodoPagoVenta.TRANSFERENCIA,
  MetodoPagoVenta.CHEQUE,
  MetodoPagoVenta.MSI_BANCO,
  MetodoPagoVenta.OTRO,
]);
