// catalogo/data/unidades-estandar.ts
// ═══════════════════════════════════════════════════════════════════════
// Unidades de medida comunes en México con su clave del catálogo SAT
// (c_ClaveUnidad de CFDI 4.0). Se precargan con un clic para que el usuario
// no tenga que crearlas ni conocer las claves del SAT.
// ═══════════════════════════════════════════════════════════════════════

export interface UnidadEstandar {
  nombre: string;
  abreviatura: string;
  claveSAT: string;
}

export const UNIDADES_ESTANDAR: UnidadEstandar[] = [
  { nombre: 'Pieza', abreviatura: 'pza', claveSAT: 'H87' },
  { nombre: 'Kilogramo', abreviatura: 'kg', claveSAT: 'KGM' },
  { nombre: 'Gramo', abreviatura: 'g', claveSAT: 'GRM' },
  { nombre: 'Litro', abreviatura: 'L', claveSAT: 'LTR' },
  { nombre: 'Mililitro', abreviatura: 'ml', claveSAT: 'MLT' },
  { nombre: 'Metro', abreviatura: 'm', claveSAT: 'MTR' },
  { nombre: 'Centímetro', abreviatura: 'cm', claveSAT: 'CMT' },
  { nombre: 'Caja', abreviatura: 'caja', claveSAT: 'XBX' },
  { nombre: 'Paquete', abreviatura: 'paq', claveSAT: 'XPK' },
  { nombre: 'Docena', abreviatura: 'doc', claveSAT: 'DZN' },
  { nombre: 'Par', abreviatura: 'par', claveSAT: 'PR' },
  { nombre: 'Servicio', abreviatura: 'serv', claveSAT: 'E48' },
];
