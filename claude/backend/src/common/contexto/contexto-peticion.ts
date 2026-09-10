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
