import { ValueTransformer } from 'typeorm';

/**
 * SQL Server puede entregar DECIMAL/NUMERIC como cadena para conservar
 * precisión. Las entidades del ERP declaran esos campos como `number`, por lo
 * que la conversión debe ocurrir en un único punto y no mediante Number(...)
 * dispersos en cada servicio.
 */
export const decimalNumberTransformer: ValueTransformer = {
  to: (valor: number | null | undefined) => valor,
  from: (valor: string | number | null | undefined) => {
    if (valor === null || valor === undefined) return valor;
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      throw new TypeError(`Valor DECIMAL inválido recibido desde SQL Server: ${String(valor)}`);
    }
    return numero;
  },
};
