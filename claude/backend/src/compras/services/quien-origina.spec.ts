/**
 * ============================================================================
 * La lista de quien puede pedir no se escribe a mano
 * ----------------------------------------------------------------------------
 * El diagnostico de la matriz necesita saber que roles pueden ORIGINAR cada
 * documento. Esa lista ya existe —es el modulo con escritura en las plantillas
 * de permisos, la misma fuente que decide el 403— y escribirla otra vez seria
 * la quinta lista de roles del sistema, que es exactamente como nacieron los
 * defectos que este proyecto lleva semanas quitando.
 *
 * Estas pruebas fijan que se derive, y que derive lo correcto.
 * ============================================================================
 */

import {
  MODULO_QUE_ORIGINA,
  rolesQueOriginan,
} from './configuraciones-aprobacion.service';
import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';

describe('Quien puede originar cada proceso', () => {
  it('CREDITO_CLIENTE lo origina quien escribe en clientes', () => {
    const roles = rolesQueOriginan('CREDITO_CLIENTE');

    expect(roles).toBeDefined();
    // El mostrador y credito son los dos que dan de alta un cliente con linea.
    expect(roles).toContain('empleado');
    expect(roles).toContain('credito');
    // Gerencia solo consulta clientes: aprueba, no pide.
    expect(roles).not.toContain('gerencia');
    expect(roles).not.toContain('admin');
  });

  it('un proceso sin modulo mapeado devuelve indefinido, no una lista vacia', () => {
    /*
     * La diferencia importa: `undefined` significa «no se quien origina, avisa
     * igual»; una lista vacia significaria «nadie origina», y apagaria todos
     * los avisos de ese proceso sin que nadie lo decidiera.
     */
    expect(rolesQueOriginan('PROCESO_QUE_NO_EXISTE')).toBeUndefined();
  });

  it('cada modulo del mapa existe en alguna plantilla', () => {
    // Un modulo mal escrito produciria una lista vacia y silenciaria los avisos.
    const modulosReales = new Set(
      PLANTILLAS_PERMISOS.flatMap((plantilla) => plantilla.modulos),
    );
    const huerfanos = Object.entries(MODULO_QUE_ORIGINA)
      .filter(([, modulo]) => !modulosReales.has(modulo))
      .map(([proceso, modulo]) => `${proceso} → ${modulo}`);

    expect(huerfanos).toEqual([]);
  });

  it('ningun proceso mapeado se queda sin roles que lo originen', () => {
    for (const proceso of Object.keys(MODULO_QUE_ORIGINA)) {
      expect(rolesQueOriginan(proceso)?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
