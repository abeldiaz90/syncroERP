/*
 * ============================================================================
 * EL CATÁLOGO DE PASOS: VOCABULARIO ABIERTO, VEREDICTO CERRADO
 * ----------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 *
 * `TipoPasoValidacion` es una unión de siete valores en el código fuente. El
 * motor de flujos es genérico —ejecuta en orden, pondera, aplica política— pero
 * su vocabulario no lo es: **dar de alta una validación nueva significa editar
 * un enum y volver a desplegar**.
 *
 * Es el mismo defecto que el ERP ya corrigió en los productos de crédito, y vale
 * la pena citar su razonamiento porque aquí aplica palabra por palabra: «los
 * tipos de crédito eran cinco valores fijos en el código […] eso tenía tres
 * consecuencias: agregar un plazo requería desplegar, todas las empresas del
 * servidor vendían lo mismo, y una empresa nueva podía vender a crédito sin que
 * nada cruzara a Fineract».
 *
 * Y es el mismo que el barrido de la suite encontró del otro lado:
 * `TypeStepsOnboarding` con dos pasos, `TypeFlowOnboarding` con tres flujos
 * escritos a mano, y once booleanos fijos contra un catálogo de 37 tipos
 * contratables. Las dos mitades del camino tienen el vocabulario cerrado, y de
 * nada sirve abrir una sola.
 *
 * LA REGLA QUE NO SE NEGOCIA
 *
 * Abrir el vocabulario **no** puede abrir el veredicto. Un paso cuyo tipo este
 * portal no conoce devuelve `NO_DISPONIBLE`, nunca `APROBADO`. Es la misma regla
 * que ya gobierna los evaluadores sin proveedor, y por el mismo motivo escrito
 * en su puerto: «un evaluador permisivo por omisión es la clase de decisión que
 * se olvida y termina otorgando crédito sin validar a nadie».
 *
 * Con eso, abrir el catálogo es seguro: un tipo nuevo se puede configurar hoy y
 * el flujo lo reporta como no disponible hasta que alguien escriba su evaluador.
 * Lo que se gana es que **la configuración no espera al despliegue**, y que el
 * expediente dice «esto no se pudo validar» en vez de no mencionarlo.
 *
 * LAS TRES CLASES DE TIPO
 *
 *   conocido      el enum de siempre, con evaluador escrito o por escribir
 *   contratado    lo declara el catálogo de la empresa y el portal no lo conoce
 *   desconocido   nadie lo declaró: es una errata de configuración
 *
 * La distinción importa para el mensaje. «No disponible todavía» y «ese tipo no
 * existe» mandan a quien configura a dos sitios distintos, y confundirlos le
 * hace perder la tarde buscando un proveedor que nunca se contrató.
 * ============================================================================
 */

import { ResultadoPaso, TipoPasoValidacion } from '../validacion.constants';

/** Los tipos que este portal conoce, derivados del enum: una sola fuente. */
export const TIPOS_CONOCIDOS: readonly string[] = Object.values(TipoPasoValidacion);

/** Forma de un código de tipo de paso. Igual de laxa que el core con los permisos. */
const CODIGO_DE_TIPO = /^[A-Za-z][A-Za-z0-9_]{2,39}$/;

export type ClaseDeTipo = 'conocido' | 'contratado' | 'desconocido';

export type TipoResuelto = {
  codigo: string;
  clase: ClaseDeTipo;
  /** Qué debe hacer el motor con un paso de este tipo, antes de evaluarlo. */
  resultadoPorOmision: ResultadoPaso | null;
  /** Qué decirle a quien configura. Vacío cuando el tipo es conocido. */
  explicacion: string;
};

/**
 * Resuelve un código de tipo contra lo que el portal conoce y lo que la empresa
 * contrató.
 *
 * `contratados` es el catálogo de la empresa —en la suite de SUMA,
 * `permissionTypes` filtrado por lo que esa empresa compró—. Se recibe como
 * parámetro y no se consulta aquí a propósito: este archivo no debe saber de
 * dónde sale el catálogo, para que el día que cambie de sitio no haya que
 * tocarlo.
 */
export function resolverTipoDePaso(
  codigo: unknown,
  contratados: Iterable<string> = [],
): TipoResuelto {
  const texto = typeof codigo === 'string' ? codigo.trim() : '';

  if (!CODIGO_DE_TIPO.test(texto)) {
    return {
      codigo: texto,
      clase: 'desconocido',
      resultadoPorOmision: ResultadoPaso.ERROR,
      explicacion:
        'El tipo de paso no tiene forma de código: letras, dígitos y guion bajo, ' +
        'de 3 a 40 caracteres, empezando por letra.',
    };
  }

  if (TIPOS_CONOCIDOS.includes(texto)) {
    return { codigo: texto, clase: 'conocido', resultadoPorOmision: null, explicacion: '' };
  }

  const delCatalogo = new Set(contratados);
  if (delCatalogo.has(texto)) {
    return {
      codigo: texto,
      clase: 'contratado',
      resultadoPorOmision: ResultadoPaso.NO_DISPONIBLE,
      /*
       * NO_DISPONIBLE y no ERROR: el paso está bien configurado, lo que falta es
       * el evaluador de este portal. La diferencia la lee el flujo —`NO_DISPONIBLE`
       * con política BLOQUEANTE detiene, con DERIVA_A_REVISION manda a una
       * persona— y la lee quien configura, que necesita saber si esperar un
       * despliegue o corregir una errata.
       */
      explicacion:
        `El tipo «${texto}» está en el catálogo de la empresa pero este portal todavía no ` +
        'tiene evaluador para él. El paso se registra como no disponible: no aprueba, y ' +
        'queda en el expediente diciendo que no se pudo validar.',
    };
  }

  return {
    codigo: texto,
    clase: 'desconocido',
    resultadoPorOmision: ResultadoPaso.ERROR,
    explicacion:
      `El tipo «${texto}» no lo conoce este portal ni aparece en el catálogo contratado por ` +
      'la empresa. Revisa el código en la configuración del flujo, o el catálogo de servicios ' +
      'contratados.',
  };
}

/**
 * ¿Se puede guardar un flujo con estos tipos?
 *
 * Sí para `conocido` y `contratado`; no para `desconocido`. Un tipo contratado
 * sin evaluador **se deja guardar** a propósito: es lo que permite que la
 * configuración vaya por delante del despliegue, que es el objetivo entero. Lo
 * que no se deja guardar es una errata, porque un paso que siempre da ERROR no
 * es una validación pendiente: es un flujo roto que nadie pidió.
 */
export function tiposNoGuardables(
  codigos: Iterable<unknown>,
  contratados: Iterable<string> = [],
): TipoResuelto[] {
  const catalogo = [...contratados];
  return [...codigos]
    .map((codigo) => resolverTipoDePaso(codigo, catalogo))
    .filter((resuelto) => resuelto.clase === 'desconocido');
}

/**
 * El resultado de un paso cuyo tipo no tiene evaluador, listo para registrarse.
 *
 * Se devuelve con `detalle` escrito porque el expediente de una originación se
 * lee meses después, cuando nadie recuerda qué estaba contratado: «NO_DISPONIBLE»
 * a secas no explica si faltaba el proveedor, el contrato o el código.
 */
export function salidaDeTipoSinEvaluador(resuelto: TipoResuelto): {
  resultado: ResultadoPaso;
  puntaje: null;
  proveedor: null;
  detalle: string;
} {
  return {
    resultado: resuelto.resultadoPorOmision ?? ResultadoPaso.NO_DISPONIBLE,
    puntaje: null,
    proveedor: null,
    detalle: resuelto.explicacion,
  };
}
