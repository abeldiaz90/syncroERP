import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Identidad de quien está haciendo la petición en curso.
 *
 * `tokenBruto` es el mismo access token de Keycloak con el que el usuario entró
 * al ERP. Se conserva porque Fineract federa contra ese mismo Keycloak: cuando
 * la operación es atribuible a una persona, se puede reenviar y el rastro de
 * auditoría del otro lado queda a nombre de quien realmente actuó, no de una
 * cuenta de servicio genérica.
 */
export interface ContextoPeticion {
  usuarioId?: string;
  empresaId?: string;
  rol?: string;
  email?: string;
  /** Sujeto de Keycloak, si la sesión vino por ahí. */
  keycloakSub?: string;
  tokenBruto?: string;
  /**
   * Quién es de verdad, cuando un administrador está viendo el ERP como otra
   * persona. `email`/`usuarioId` siguen siendo los del SUPLANTADO a propósito:
   * los controles de autorización tienen que verlo a él. Pero para ATRIBUIR un
   * cambio hace falta el otro, y no estaba.
   */
  suplantacion?: { realId?: string; realEmail?: string; realRol?: string };
}

/**
 * ============================================================================
 * A quién se le apunta lo que acaba de pasar
 * ----------------------------------------------------------------------------
 * El guardia de suplantación REEMPLAZA `request.user` por el usuario objetivo
 * —ésa es toda su gracia: los tres controles de autorización no se enteran— y
 * guarda al real en `user.suplantacion`. El contexto de la petición no leía ese
 * campo, así que lo único que podía decir era el nombre del suplantado.
 *
 * Resultado medido: un administrador que cambia el modo de cartera de una
 * empresa mientras mira el ERP como almacenista deja esta línea en la bitácora:
 *
 *     Modo de cartera de la empresa e1: ESPEJO → APAGADO, por juan@almacen
 *
 * …y juan no hizo nada. Es el peor renglón de auditoría posible: no está vacío,
 * está equivocado, y señala a una persona concreta. El guardia sí deja su
 * propio aviso de escritura, pero son dos renglones distintos en momentos
 * distintos y nadie los cruza.
 *
 * Se nombra a los dos, y en ese orden: quien es responsable primero.
 * ============================================================================
 */
export function nombreDelActor(contexto?: ContextoPeticion): string {
  if (!contexto) return 'un proceso sin sesión';
  const suplantado = contexto.email ?? contexto.usuarioId;
  const real = contexto.suplantacion?.realEmail ?? contexto.suplantacion?.realId;
  if (real) {
    return `${real} (viendo el ERP como ${suplantado ?? 'otra persona'})`;
  }
  return suplantado ?? 'un proceso sin sesión';
}

/**
 * Se usa AsyncLocalStorage y no un proveedor con ámbito de petición a
 * propósito. Un proveedor REQUEST-scoped contagia el ámbito a toda su cadena de
 * dependencias, y esa cadena incluye servicios que corren en cron —el
 * despachador del outbox, la conciliación—, donde no hay petición ninguna.
 * El resultado sería un módulo que no puede instanciarse fuera de una request.
 */
const almacen = new AsyncLocalStorage<ContextoPeticion>();

export const ContextoPeticionAlmacen = {
  ejecutarCon<T>(contexto: ContextoPeticion, fn: () => T): T {
    return almacen.run(contexto, fn);
  },

  /** Contexto actual, o undefined si esto corre fuera de una petición. */
  actual(): ContextoPeticion | undefined {
    return almacen.getStore();
  },

  /** Token del usuario en curso. undefined en tareas de fondo. */
  token(): string | undefined {
    return almacen.getStore()?.tokenBruto;
  },
};
