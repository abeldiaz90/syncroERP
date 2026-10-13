/**
 * ============================================================================
 * PANTALLA DINÁMICA · la forma, del lado que la dibuja
 * ----------------------------------------------------------------------------
 * El contrato vive en el backend
 * —`integracion/validacion/contrato/pantalla-dinamica.ts`— y es quien manda:
 * ahí está la validación y ahí se decide qué se acepta. Esto es lo que el
 * navegador necesita para PINTARLO, y nada más.
 *
 * ── POR QUÉ HAY DOS COPIAS, Y POR QUÉ NO SE SEPARAN ────────────────────────
 * El backend no publica sus tipos al navegador, así que la lista de componentes
 * tiene que estar también aquí. Dos copias de una regla es exactamente la
 * avería que este proyecto lleva semanas persiguiendo —la pantalla contaba días
 * naturales y el servidor laborables— así que no se deja a la buena fe:
 * `el-portal-dibuja-lo-que-el-contrato-declara.spec.ts` compara las dos listas
 * y se pone roja si alguien agrega un componente en un lado y no en el otro.
 *
 * Lo que NO se copia es la validación. El contrato la hace entera en el
 * servidor; aquí sólo se dibuja lo que ya pasó por ahí.
 * ============================================================================
 */

/**
 * Los componentes que este portal sabe dibujar.
 *
 * Tiene que decir exactamente lo mismo que `COMPONENTES_SOPORTADOS` del
 * contrato. Si aquí sobra uno, el esquema pasaría la validación del servidor y
 * la pantalla quedaría con un hueco; si falta, se rechazaría un esquema que sí
 * se podía dibujar.
 */
export const COMPONENTES_QUE_SE_DIBUJAN = [
  'texto',
  'texto-largo',
  'numero',
  'moneda',
  'fecha',
  'seleccion',
  'seleccion-multiple',
  'booleano',
  'curp',
  'rfc',
  'telefono',
  'correo',
  'codigo-postal',
  'documento',
  'firma',
  'foto',
  'aviso',
] as const;

export type ComponenteDibujable = (typeof COMPONENTES_QUE_SE_DIBUJAN)[number];

export type CondicionDeVisibilidad = {
  campo: string;
  igualA: Array<string | number | boolean>;
};

export type CampoDinamico = {
  nombre: string;
  componente: ComponenteDibujable;
  etiqueta: string;
  requerido?: boolean;
  ayuda?: string;
  opciones?: Array<{ valor: string; etiqueta: string }>;
  props?: Record<string, string | number | boolean>;
  visibleSi?: CondicionDeVisibilidad;
};

export type PasoDinamico = {
  id: string;
  titulo: string;
  descripcion?: string;
  campos: CampoDinamico[];
};

export type EsquemaDePantalla = {
  contrato: number;
  emisor?: string;
  pasos: PasoDinamico[];
};

/** Lo capturado: un objeto plano con los `nombre` de los campos. */
export type ValoresDinamicos = Record<string, unknown>;

/**
 * ¿Se muestra este campo con los valores que hay ahora?
 *
 * La regla 3 del contrato: el esquema trae DESCRIPCIÓN, no lógica. Aquí se
 * compara un valor con una lista de constantes y se acabó. Nada de evaluar
 * expresiones: en cuanto el esquema pueda ejecutar algo, el portal se convierte
 * en un intérprete de código de terceros.
 *
 * Sin condición, se muestra. Una condición que apunta a un campo que no existe
 * NO se muestra: una condición que no se puede evaluar no se da por cumplida,
 * porque enseñar de más es enseñarle a alguien un campo que su flujo no pedía.
 */
export function campoVisible(
  campo: CampoDinamico,
  valores: ValoresDinamicos,
): boolean {
  if (!campo.visibleSi) return true;
  const { campo: deQuien, igualA } = campo.visibleSi;
  if (!Array.isArray(igualA) || igualA.length === 0) return false;
  if (!Object.prototype.hasOwnProperty.call(valores, deQuien)) return false;
  return igualA.includes(valores[deQuien] as string | number | boolean);
}

/**
 * Los campos que de verdad hay que capturar ahora mismo.
 *
 * Un campo obligatorio que está oculto NO es obligatorio: exigirlo dejaría el
 * formulario sin poder enviarse y sin decir por qué, que es la peor de las dos
 * faltas.
 */
export function camposExigibles(
  paso: PasoDinamico,
  valores: ValoresDinamicos,
): CampoDinamico[] {
  return paso.campos.filter(
    (c) => c.requerido && c.componente !== 'aviso' && campoVisible(c, valores),
  );
}

/** Vacío de verdad: null, undefined, cadena en blanco o lista sin nada. */
export function estaVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

/**
 * Qué falta por capturar en este paso. Lista de `nombre`, nunca un booleano:
 * quien llama necesita poder decir CUÁLES, no cuántos.
 */
export function loQueFalta(
  paso: PasoDinamico,
  valores: ValoresDinamicos,
): string[] {
  return camposExigibles(paso, valores)
    .filter((c) => estaVacio(valores[c.nombre]))
    .map((c) => c.nombre);
}
