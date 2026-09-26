/**
 * ============================================================================
 * Una lectura que falló no es una lista vacía
 * ----------------------------------------------------------------------------
 * `sincronizarExpediente` lee del core lo que ya existe —identificadores y
 * domicilios— para decidir si corrige lo que hay o crea algo nuevo. Esa
 * lectura terminaba en `.catch(() => [])`.
 *
 * El comentario que acompaña al bloque de domicilios lo dice con todas sus
 * letras: «un POST repetido crea un segundo domicilio, no reemplaza el
 * primero». La lectura previa existe exactamente para evitarlo. Y el `catch`
 * la anulaba en el único momento en que importaba: si el core no responde esa
 * consulta, la respuesta era «no hay nada allá», y el adaptador creaba el
 * duplicado que la lectura estaba puesta a impedir. Con los identificadores
 * pasa lo mismo: se reintenta dar de alta un documento que ya está.
 *
 * La regla es la misma de siempre: una consulta que falló no vale cero, ni
 * vale lista vacía. Si no se pudo mirar, no se escribe, y se dice por qué.
 * ============================================================================
 */
import { FineractCarteraAdapter } from './fineract-cartera.adapter';

describe('sincronizarExpediente no escribe sobre lo que no pudo leer', () => {
  function crear() {
    const get = jest.fn();
    const post = jest.fn().mockResolvedValue({});
    const put = jest.fn().mockResolvedValue({});
    const del = jest.fn().mockResolvedValue({});
    const adapter = new FineractCarteraAdapter(
      { get, post, put, delete: del } as any,
      { timeoutPosMs: 2000 } as any,
      {} as any,
      {} as any,
    );
    return { get, post, put, del, adapter };
  }

  const cliente = {
    clienteId: 'c1',
    idExterno: '7',
    rfc: 'XAXX010101000',
    identificaciones: [],
    domicilio: null,
  } as any;

  it('no da de alta un identificador cuando no pudo leer los que ya existen', async () => {
    const { get, post, adapter } = crear();
    // Plantilla de tipos de documento: sí responde.
    get.mockImplementation((ruta: string) => {
      if (ruta.includes('/identifiers/template')) {
        return Promise.resolve({
          allowedDocumentTypes: [{ id: 3, name: 'RFC' }],
        });
      }
      if (ruta.endsWith('/identifiers')) {
        return Promise.reject(new Error('Fineract no disponible'));
      }
      return Promise.resolve(null);
    });

    const resultado = await adapter.sincronizarExpediente(cliente);

    expect(post).not.toHaveBeenCalled();
    expect(resultado.aplicados).toEqual([]);
    expect(resultado.omitidos.join(' · ')).toMatch(/no se pudieron leer|no respondió/i);
  });

  it('no crea un domicilio cuando no pudo leer los domicilios existentes', async () => {
    const { get, post, adapter } = crear();
    const conDomicilio = {
      ...cliente,
      rfc: null,
      domicilio: {
        calle: 'Reforma 1',
        colonia: 'Centro',
        ciudad: 'CDMX',
        estado: 'Ciudad de México',
        codigoPostal: '06000',
        pais: 'México',
      },
    };
    get.mockImplementation((ruta: string) => {
      if (ruta.includes('/addresses/template')) {
        return Promise.resolve({
          addressTypeIdOptions: [{ id: 1, name: 'Domicilio particular' }],
          countryIdOptions: [{ id: 2, name: 'México' }],
          stateProvinceIdOptions: [{ id: 9, name: 'Ciudad de México' }],
        });
      }
      if (ruta.includes('/addresses')) {
        return Promise.reject(new Error('Fineract no disponible'));
      }
      return Promise.resolve(null);
    });

    const resultado = await adapter.sincronizarExpediente(conDomicilio);

    expect(post).not.toHaveBeenCalled();
    expect(resultado.omitidos.join(' · ')).toMatch(/no se pudieron leer|no respondió/i);
  });

  it('sigue creando cuando la lectura sí respondió y venía vacía', async () => {
    const { get, post, adapter } = crear();
    get.mockImplementation((ruta: string) => {
      if (ruta.includes('/identifiers/template')) {
        return Promise.resolve({
          allowedDocumentTypes: [{ id: 3, name: 'RFC' }],
        });
      }
      if (ruta.endsWith('/identifiers')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const resultado = await adapter.sincronizarExpediente(cliente);

    expect(post).toHaveBeenCalled();
    expect(resultado.aplicados).toContain('RFC');
  });
});
