import { normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * SyncroERP · Una matriz verde que no deja pasar un solo documento
 * ----------------------------------------------------------------------------
 * POR QUE EXISTE ESTO
 *
 * La matriz de CREDITO_CLIENTE de esta instalacion estaba bien escrita:
 * nivel 1 al rol `credito` hasta 50 000, nivel 2 por encima. Se ve impecable en
 * la pantalla de gobierno. Y sin embargo NINGUNA solicitud de credito podia
 * levantarse, porque:
 *
 *   · los unicos roles que pueden dar de alta un cliente con linea de credito
 *     son `empleado` y `credito`;
 *   · la empresa tenia una sola persona con rol `credito`;
 *   · quien pide no puede firmar (autoaprobacion apagada, y bien apagada).
 *
 * Entonces la unica persona que podia originar la solicitud era tambien la
 * unica que podia firmar el nivel 1, y el sistema —con razon— rechazaba la
 * solicitud al guardarla. El control no era estricto: era imposible.
 *
 * El guardado de la matriz ya comprueba una cosa parecida pero distinta: que
 * los NIVELES ENTRE SI puedan cubrirse con personas diferentes. Eso se cumplia
 * (una persona de credito y una de admin son dos personas). Lo que nadie
 * miraba es al SOLICITANTE, que no existe todavia cuando se guarda la matriz.
 *
 * ----------------------------------------------------------------------------
 * POR QUE AVISA Y NO PROHIBE
 *
 * Un nivel con un solo firmante no esta mal por si mismo: si quien origina es
 * siempre otra persona, funciona perfectamente. Prohibirlo dejaria fuera
 * configuraciones legitimas de empresas pequenas.
 *
 * Lo que no puede seguir pasando es que el problema se descubra el dia que
 * alguien intenta trabajar. Asi que se dice antes, donde se decide: en la
 * pantalla de quien gobierna la matriz, con el nombre del rol y el numero de
 * personas que lo tienen.
 * ============================================================================
 */

export type NivelParaDiagnostico = {
  orden: number;
  rolAprobador?: string | null;
  usuarioId?: string | null;
  permiteAutoaprobacion?: boolean | null;
};

export type PersonaActiva = {
  id: string;
  rol?: string | null;
  nombre?: string | null;
};

export type EstadoSalud = 'SIN_FIRMANTE' | 'FIRMANTE_UNICO' | 'CORRECTO';

export type SaludNivel = {
  orden: number;
  firmantesActivos: number;
  estado: EstadoSalud;
  /** Texto para la persona que gobierna la matriz. `null` cuando no hay nada que decir. */
  mensaje: string | null;
};

/**
 * Cuantas personas activas podrian firmar ESTE nivel, y que significa ese
 * numero. No consulta nada: recibe la foto de los usuarios activos y decide.
 */
export function diagnosticarNivel(
  nivel: NivelParaDiagnostico,
  activos: PersonaActiva[],
  rolesQueOriginan?: string[],
): SaludNivel {
  const firmantes = nivel.usuarioId
    ? activos.filter((persona) => persona.id === nivel.usuarioId)
    : activos.filter(
        (persona) =>
          normalizarRol(persona.rol ?? '') ===
          normalizarRol(nivel.rolAprobador ?? ''),
      );

  const cuantos = firmantes.length;

  if (cuantos === 0) {
    return {
      orden: nivel.orden,
      firmantesActivos: 0,
      estado: 'SIN_FIRMANTE',
      mensaje: nivel.usuarioId
        ? `El nivel ${nivel.orden} esta asignado a una persona que ya no esta activa. Ningun documento pasara de aqui.`
        : `Ninguna persona activa tiene el rol «${nivel.rolAprobador ?? '—'}». Los documentos que lleguen al nivel ${nivel.orden} se quedaran parados.`,
    };
  }

  /*
   * La autoaprobacion encendida convierte al firmante unico en una situacion
   * sin consecuencia: puede firmar lo suyo. Es una decision de la empresa, no
   * un defecto, y aqui no se opina sobre ella.
   */
  /*
   * Un firmante unico solo es un problema cuando esa misma persona puede
   * ORIGINAR el documento. Si el nivel esta enrutado a `gerencia` y gerencia no
   * puede dar de alta un cliente, que haya un solo gerente no impide nada: sus
   * solicitudes no existen.
   *
   * Sin esta distincion el aviso saltaria en casi todos los niveles de casi
   * todas las empresas pequenas, y un aviso que salta siempre se deja de leer.
   * Ese es el mismo defecto que este diagnostico vino a corregir, un paso mas
   * adelante.
   *
   * Cuando no se dice quien puede originar —porque el proceso no lo tiene
   * mapeado— se avisa igual: preferimos el aviso de mas al silencio.
   */
  const puedeOriginar =
    rolesQueOriginan === undefined ||
    (!!nivel.rolAprobador &&
      rolesQueOriginan
        .map(normalizarRol)
        .includes(normalizarRol(nivel.rolAprobador))) ||
    (!!nivel.usuarioId &&
      rolesQueOriginan
        .map(normalizarRol)
        .includes(normalizarRol(firmantes[0]?.rol ?? '')));

  if (cuantos === 1 && !nivel.permiteAutoaprobacion && puedeOriginar) {
    const quien = firmantes[0]?.nombre?.trim();
    return {
      orden: nivel.orden,
      firmantesActivos: 1,
      estado: 'FIRMANTE_UNICO',
      mensaje:
        `Solo una persona${quien ? ` (${quien})` : ''} puede firmar el nivel ${nivel.orden}. ` +
        'Toda solicitud que esa misma persona origine sera rechazada al guardarse, porque quien pide no puede firmar. ' +
        'Da de alta a otra persona con ese rol, o enruta el nivel a un rol distinto del que origina el documento.',
    };
  }

  return {
    orden: nivel.orden,
    firmantesActivos: cuantos,
    estado: 'CORRECTO',
    mensaje: null,
  };
}

/** El diagnostico de una matriz entera, nivel por nivel. */
export function diagnosticarMatriz(
  niveles: NivelParaDiagnostico[],
  activos: PersonaActiva[],
  rolesQueOriginan?: string[],
): SaludNivel[] {
  return [...niveles]
    .sort((a, b) => a.orden - b.orden)
    .map((nivel) => diagnosticarNivel(nivel, activos, rolesQueOriginan));
}

/** ¿Hay algo que esta matriz deba enseñar en rojo? */
export function matrizTieneAdvertencias(salud: SaludNivel[]): boolean {
  return salud.some((nivel) => nivel.estado !== 'CORRECTO');
}
