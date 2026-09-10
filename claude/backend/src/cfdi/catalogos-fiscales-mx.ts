export type TipoPersonaFiscal = 'FISICA' | 'MORAL';
export type PerfilImpuestosMx =
  | 'GENERAL'
  | 'MIXTO'
  | 'EXENTO'
  | 'FRONTERA';

export interface RegimenFiscalMx {
  clave: string;
  nombre: string;
  personas: TipoPersonaFiscal[];
  comun?: boolean;
}

/**
 * Catálogo c_RegimenFiscal utilizado por CFDI 4.0.
 * La selección definitiva debe coincidir con la Constancia de Situación
 * Fiscal; el wizard sólo filtra opciones incompatibles por tipo de persona.
 */
export const REGIMENES_FISCALES_MX: RegimenFiscalMx[] = [
  {
    clave: '601',
    nombre: 'General de Ley Personas Morales',
    personas: ['MORAL'],
    comun: true,
  },
  {
    clave: '603',
    nombre: 'Personas Morales con Fines no Lucrativos',
    personas: ['MORAL'],
  },
  {
    clave: '605',
    nombre: 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    personas: ['FISICA'],
  },
  { clave: '606', nombre: 'Arrendamiento', personas: ['FISICA'] },
  {
    clave: '607',
    nombre: 'Régimen de Enajenación o Adquisición de Bienes',
    personas: ['FISICA'],
  },
  { clave: '608', nombre: 'Demás ingresos', personas: ['FISICA'] },
  {
    clave: '610',
    nombre: 'Residentes en el Extranjero sin Establecimiento Permanente en México',
    personas: ['FISICA', 'MORAL'],
  },
  {
    clave: '611',
    nombre: 'Ingresos por Dividendos (socios y accionistas)',
    personas: ['FISICA'],
  },
  {
    clave: '612',
    nombre: 'Personas Físicas con Actividades Empresariales y Profesionales',
    personas: ['FISICA'],
    comun: true,
  },
  {
    clave: '614',
    nombre: 'Ingresos por intereses',
    personas: ['FISICA'],
  },
  { clave: '615', nombre: 'Régimen de los ingresos por obtención de premios', personas: ['FISICA'] },
  { clave: '616', nombre: 'Sin obligaciones fiscales', personas: ['FISICA'] },
  {
    clave: '620',
    nombre: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
    personas: ['MORAL'],
  },
  {
    clave: '621',
    nombre: 'Incorporación Fiscal',
    personas: ['FISICA'],
  },
  {
    clave: '622',
    nombre: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
    personas: ['MORAL'],
  },
  {
    clave: '623',
    nombre: 'Opcional para Grupos de Sociedades',
    personas: ['MORAL'],
  },
  { clave: '624', nombre: 'Coordinados', personas: ['MORAL'] },
  {
    clave: '625',
    nombre: 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
    personas: ['FISICA'],
  },
  {
    clave: '626',
    nombre: 'Régimen Simplificado de Confianza',
    personas: ['FISICA', 'MORAL'],
    comun: true,
  },
];

export const PERFILES_IMPUESTOS_MX = [
  {
    clave: 'GENERAL',
    nombre: 'Principalmente IVA 16%',
    descripcion:
      'Comercio y servicios que normalmente trasladan IVA a la tasa general.',
  },
  {
    clave: 'MIXTO',
    nombre: 'Manejo operaciones de distintos tratamientos',
    descripcion:
      'Habilita IVA 16%, tasa 0%, exento y no objeto para clasificarlos por producto.',
  },
  {
    clave: 'EXENTO',
    nombre: 'Principalmente exento o no objeto',
    descripcion:
      'Para actividades cuyo tratamiento debe confirmar un contador; no convierte automáticamente todos los productos.',
  },
  {
    clave: 'FRONTERA',
    nombre: 'Estímulo de región fronteriza',
    descripcion:
      'Habilita IVA 8% sólo después de confirmar que el contribuyente cumple los requisitos del estímulo.',
  },
] as const;

