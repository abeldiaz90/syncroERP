/**
 * ============================================================================
 * Un estado que nadie escribe no es un filtro estricto: es un control imposible
 * ----------------------------------------------------------------------------
 * El panel de operaciones pendientes es lo que un operador mira para saber qué
 * está esperando por él. Cada control cuenta filas de una tabla por su ESTADO.
 *
 * Si el estado que nombra no es uno de los que esa tabla escribe, no pasa nada
 * visible: la consulta es válida, la tabla existe, la columna existe, y el
 * resultado es cero en cualquier base del mundo. El control no falla, no se
 * registra en ningún log, no aparece en `noVerificados` —porque sí se pudo
 * ejecutar— y el panel informa con toda confianza que no hay nada pendiente.
 *
 * Medido el 25-sep-2026 contra la instalación:
 *
 *   · «Requisiciones pendientes de aprobación» buscaba PENDIENTE_APROBACION y
 *     EN_APROBACION. El estado real es PENDIENTE. Con requisiciones pendientes
 *     de verdad en la base, el panel decía cero.
 *   · «Órdenes pendientes de envío» buscaba BORRADOR y GENERADA, que tampoco
 *     existen en `EstadoOC`.
 *   · «Órdenes pendientes de recepción» buscaba PARCIALMENTE_RECIBIDA, que
 *     tampoco.
 *   · Dos estados fantasma más, inofensivos pero igual de falsos: «EN TRÁNSITO»
 *     con espacio y acento, y «RECONTEO».
 *
 * La causa de fondo es que el vocabulario de estados vivía sólo como `type` de
 * TypeScript, y un tipo desaparece al compilar: nada podía compararse contra
 * él. Ahora cada vocabulario existe también como valor —`ESTADOS_REQUISICION`,
 * `ESTADOS_OC`, `ESTADOS_COTIZACION`…— y cada definición del panel declara
 * cuál es el suyo. Esta prueba los confronta.
 * ============================================================================
 */
import { DEFINICIONES_PENDIENTES } from './operaciones-pendientes.service';

describe('el panel de pendientes sólo cuenta estados que existen', () => {
  it('hay controles que revisar y todos declaran su vocabulario', () => {
    expect(DEFINICIONES_PENDIENTES.length).toBeGreaterThanOrEqual(10);
    const sinVocabulario = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.vocabulario?.length,
    ).map((d) => d.codigo);
    expect(sinVocabulario).toEqual([]);
  });

  it('ningún control busca un estado que su tabla no escribe', () => {
    const imposibles: string[] = [];
    for (const definicion of DEFINICIONES_PENDIENTES) {
      for (const estado of definicion.estados) {
        if (!definicion.vocabulario.includes(estado)) {
          imposibles.push(
            `${definicion.codigo} busca «${estado}» en ${definicion.tabla}, que sólo puede estar en: ${definicion.vocabulario.join(', ')}`,
          );
        }
      }
    }
    expect(imposibles.sort()).toEqual([]);
  });

  it('ningún control se queda sin estados que buscar', () => {
    // Una lista vacía cuenta cero igual que un estado inexistente, y encima
    // sin dejar rastro de que alguien la vació.
    const vacios = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.estados.length,
    ).map((d) => d.codigo);
    expect(vacios).toEqual([]);
  });

  it('cada control apunta a una pantalla, no a una tabla', () => {
    // Un pendiente sin ruta es un aviso sin salida: el operador ve el número y
    // no tiene dónde ir a resolverlo.
    const sinRuta = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.ruta?.startsWith('/dashboard/'),
    ).map((d) => `${d.codigo} → ${d.ruta}`);
    expect(sinRuta).toEqual([]);
  });
});
