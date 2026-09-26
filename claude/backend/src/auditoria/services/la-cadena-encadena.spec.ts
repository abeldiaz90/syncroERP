/**
 * ============================================================================
 * La bitácora de auditoría nunca estuvo encadenada
 * ----------------------------------------------------------------------------
 * `SELECT hashRegistro` — sin comillas. PostgreSQL pliega a minúsculas todo
 * identificador que no venga entrecomillado, así que la fila llegaba como
 * `{ hashregistro: '…' }` y `anteriores[0].hashRegistro` era `undefined`. El
 * `?? null` lo convertía en `null`, y **cada** registro de auditoría se
 * guardaba con `hashAnterior = null`.
 *
 * Qué significa: la bitácora dejaba de ser una cadena y era una pila de
 * registros sueltos. Se puede borrar uno de en medio y nada lo delata, que es
 * lo único que un hash encadenado viene a impedir. Todo el andamiaje estaba
 * ahí —el `SERIALIZABLE`, el `advisory lock`, el `FOR UPDATE`, el SHA-256— y
 * no encadenaba nada.
 *
 * Y de rebote `verificarIntegridad` acusaba: a partir del SEGUNDO registro
 * contestaba «integra: false · La referencia al hash anterior no coincide»,
 * siempre, en cualquier instalación, sobre una bitácora intacta.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTAS PRUEBAS SIMULAN POSTGRES Y NO UN REPOSITORIO
 *
 * El defecto no está en la lógica: está en la frontera con la base. Un doble
 * que devuelva `{ hashRegistro: 'abc' }` —en camelCase, como uno escribiría a
 * mano— deja la prueba en verde con el código roto, porque reproduce lo que el
 * programador creía que pasaba en vez de lo que pasa.
 *
 * Así que el doble de aquí hace lo que PostgreSQL hace: devuelve las llaves
 * tal como salen del servidor, en minúsculas, salvo las que la consulta pidió
 * entrecomilladas.
 * ============================================================================
 */

import { AuditoriaService } from './auditoria.service';

/** Un PostgreSQL de mentira que pliega los identificadores como el de verdad. */
function postgresDeVerdad(filaGuardada: Record<string, unknown> | null) {
  return async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [{ resultado: 0 }];
    if (sql.includes('FROM registros_auditoria')) {
      if (!filaGuardada) return [];
      /*
       * Ésta es toda la prueba. Se leen los alias de la consulta: los que
       * vienen entre comillas conservan su forma, los demás llegan en
       * minúsculas. Es lo que hace el servidor.
       */
      const salida: Record<string, unknown> = {};
      for (const [columna, valor] of Object.entries(filaGuardada)) {
        const entrecomillado = new RegExp(`AS\\s+"${columna}"`).test(sql);
        salida[entrecomillado ? columna : columna.toLowerCase()] = valor;
      }
      return [salida];
    }
    return [];
  };
}

function servicio(hashPrevio: string | null) {
  const guardados: any[] = [];
  const repoRegistro = {
    create: (datos: any) => datos,
    save: async (datos: any) => {
      guardados.push(datos);
      return datos;
    },
  };
  const manager = {
    query: postgresDeVerdad(hashPrevio ? { hashRegistro: hashPrevio } : null),
    getRepository: () => repoRegistro,
  };
  const dataSource = {
    transaction: async (_nivel: string, fn: any) => fn(manager),
  };
  // (repo, dataSource) — en ese orden, que es como los pide el constructor.
  const svc = new AuditoriaService({} as any, dataSource as any);
  // `registrar` se traga cualquier error a proposito, para no tumbar la
  // operacion de negocio. En una prueba eso esconde el fallo, asi que se
  // hace visible.
  const errores: string[] = [];
  (svc as any).logger = {
    error: (m: string) => errores.push(m),
    warn: () => undefined,
    log: () => undefined,
  };
  return { svc, guardados, errores };
}

const EVENTO = {
  empresaId: 'emp-1',
  usuarioId: 'u-1',
  accion: 'ACTUALIZAR',
  entidad: 'clientes',
  registroId: 'c-1',
};

describe('Auditoría · la cadena encadena', () => {
  it('el registro nuevo apunta al hash del anterior', async () => {
    const { svc, guardados, errores } = servicio('hash-del-anterior');

    await svc.registrar(EVENTO as any);

    expect(errores).toEqual([]);
    expect(guardados).toHaveLength(1);
    expect(guardados[0].hashAnterior).toBe('hash-del-anterior');
  });

  it('el primero de todos apunta a nada, que es correcto', async () => {
    const { svc, guardados, errores } = servicio(null);

    await svc.registrar(EVENTO as any);

    expect(errores).toEqual([]);
    expect(guardados[0].hashAnterior).toBeNull();
  });

  it('el hash del registro depende del anterior, o la cadena no ata', async () => {
    /*
     * Si el hash se calculara ignorando el eslabón previo, encadenar sería
     * decorativo: dos registros idénticos en dos cadenas distintas darían el
     * mismo hash y se podrían trasplantar de una a otra.
     */
    const conCadena = servicio('hash-del-anterior');
    const sinCadena = servicio(null);

    await conCadena.svc.registrar(EVENTO as any);
    await sinCadena.svc.registrar(EVENTO as any);

    expect(conCadena.guardados[0].hashRegistro).not.toBe(
      sinCadena.guardados[0].hashRegistro,
    );
  });

  it('el hash es un SHA-256 de verdad', async () => {
    const { svc, guardados, errores } = servicio(null);

    await svc.registrar(EVENTO as any);

    expect(errores).toEqual([]);
    expect(guardados[0].hashRegistro).toMatch(/^[0-9a-f]{64}$/);
  });
});
