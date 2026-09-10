/**
 * Tipos del importador masivo de inventario.
 * SyncroERP · módulo catalogo
 */

/** Un error o advertencia asociado a una fila concreta del Excel. */
export interface ErrorFila {
  fila: number; // número de fila en el Excel (base 1, tal como lo ve el usuario)
  sku?: string;
  campo?: string; // campo que falló, si aplica
  mensaje: string; // "unidad de medida 'CJA' no existe en el catálogo"
}

/**
 * Mensaje generado antes de conocer el número de fila (p. ej. dentro de la
 * resolución de relaciones). El campo `fila` y `sku` se completan después,
 * cuando el resultado vuelve al orquestador.
 */
export type MensajeParcial = Omit<ErrorFila, 'fila'>;

/** Resultado devuelto por el importador, tanto en modo validar como aplicar. */
export interface ResultadoImportacion {
  modo: 'validar' | 'aplicar';
  totalFilas: number;
  creados: number;
  actualizados: number;
  conError: number;
  errores: ErrorFila[];
  advertencias: ErrorFila[]; // p. ej. relación creada al vuelo
}

/** Catálogos precargados en memoria (nombre normalizado → id) para resolución rápida. */
export interface CatalogosCache {
  unidades: Map<string, string>;
  marcas: Map<string, string>;
  categorias: Map<string, string>;
  impuestos: Map<string, string>;
}
