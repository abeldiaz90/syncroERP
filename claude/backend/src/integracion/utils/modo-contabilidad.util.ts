import { ModoContabilidad } from '../integracion.constants';

/**
 * ============================================================================
 * SyncroERP · El espejo contable, encendido o apagado, en una sola regla
 * ----------------------------------------------------------------------------
 * `IntegracionModoService` ya respondia esto, pero solo para quien pudiera
 * inyectarlo. El cierre contable vive en el modulo de finanzas, que no importa
 * el de integracion, y la alternativa —copiar la regla alla— es como nacieron
 * la mitad de los defectos de este sistema: cuatro listas de roles que no
 * coincidian, tres DTO que decian cosas distintas de la misma regla.
 *
 * Asi que la regla se saca aqui, sin dependencias, y el servicio la usa. Una
 * sola implementacion, dos consumidores.
 *
 * LA REGLA: el global es un TECHO, no un valor por omision. Una empresa sin
 * decision explicita queda apagada; encender el techo no arrastra a nadie que
 * no lo haya pedido.
 * ============================================================================
 */

/** Techo global, tal como viene en el entorno. */
export function modoContabilidadGlobal(bruto?: string | null): ModoContabilidad {
  return (bruto ?? '').trim().toUpperCase() === ModoContabilidad.ESPEJO
    ? ModoContabilidad.ESPEJO
    : ModoContabilidad.APAGADO;
}

/** El modo efectivo de una empresa: lo que pidio, limitado por el techo. */
export function combinarContabilidad(
  global: ModoContabilidad,
  modoEmpresa?: ModoContabilidad | string | null,
): ModoContabilidad {
  if (global === ModoContabilidad.APAGADO) return ModoContabilidad.APAGADO;
  return (modoEmpresa ?? '').toString().trim().toUpperCase() ===
    ModoContabilidad.ESPEJO
    ? ModoContabilidad.ESPEJO
    : ModoContabilidad.APAGADO;
}

/** ¿El mayor externo es el espejo de esta empresa, aqui y ahora? */
export function espejoEncendido(
  brutoGlobal: string | null | undefined,
  modoEmpresa: string | null | undefined,
): boolean {
  return (
    combinarContabilidad(modoContabilidadGlobal(brutoGlobal), modoEmpresa) ===
    ModoContabilidad.ESPEJO
  );
}
