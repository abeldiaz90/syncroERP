export const METODOS_PAGO_VENTA = [
  'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'MSI_BANCO',
  'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES', 'OTRO',
] as const;
export type MetodoPagoVenta = (typeof METODOS_PAGO_VENTA)[number];
export const METODOS_CREDITO = new Set<MetodoPagoVenta>([
  'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES',
]);
