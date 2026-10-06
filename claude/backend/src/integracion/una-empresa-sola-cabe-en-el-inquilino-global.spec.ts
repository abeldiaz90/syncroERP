import { readFileSync } from 'fs';
import { join } from 'path';

import { ContextoInquilinoService } from './services/contexto-inquilino.service';

/**
 * ============================================================================
 * EL RESPALDO AL INQUILINO GLOBAL VALE PARA UNA EMPRESA, NO PARA DOS
 * ----------------------------------------------------------------------------
 * EL CASO, Y DÓNDE ESTABA ESCRITO
 *
 * En Fineract el inquilino es la frontera de verdad: clientes, créditos y mayor
 * viven dentro de uno. El ERP resuelve a qué inquilino va cada llamada en
 * `FineractHttpService.inquilinoDeLaOperacion`, y el orden es:
 *
 *   1. el que se pase explícito (tareas de mantenimiento),
 *   2. el asignado a la empresa del contexto,
 *   3. y si no tiene, **el global**.
 *
 * El paso 3 es correcto mientras haya UNA empresa operando: el inquilino global
 * es el suyo. Deja de serlo en el instante en que una segunda enciende la
 * integración sin inquilino asignado — sus clientes y su cartera caen en el
 * MISMO inquilino que los de la primera.
 *
 * Y no da error. Escribir en el inquilino de otro es, para el core, una
 * escritura perfectamente válida. Nadie se entera hasta que alguien ve en su
 * cartera un crédito que no es suyo, y para entonces hay dos carteras
 * entreveradas en una base que no sabe separarlas.
 *
 * Lo más llamativo: el sistema YA LO SABÍA. La cabecera de
 * `alta-empresas.service.ts` lo dice con todas sus letras —«hasta que cada
 * empresa tenga su realm, sólo UNA empresa puede operar con el core»— y la de
 * `contexto-inquilino.service.ts` explica que el interruptor
 * `FINERACT_TENANT_POR_EMPRESA` existe para eso y está apagado.
 *
 * Una advertencia en un comentario no detiene una escritura.
 *
 * EL ARREGLO
 *
 * No se enciende el interruptor —esa es una decisión de despliegue, y encenderlo
 * deja fuera del core a toda empresa sin inquilino, incluida la que opera hoy—.
 * Lo que se hace es comprobar la condición exacta que vuelve peligroso el
 * respaldo: que haya MÁS DE UNA empresa con la integración encendida y sin
 * inquilino propio. Con una, todo sigue igual. Con dos, se niega y las nombra.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

const configuracionCon = (
  filas: Array<Record<string, unknown>>,
): ContextoInquilinoService => {
  const s = Object.create(ContextoInquilinoService.prototype) as Record<
    string,
    unknown
  >;
  s.configEmpresa = { find: async () => filas };
  return s as unknown as ContextoInquilinoService;
};

const empresa = (
  empresaId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  empresaId,
  modo: 'ESPEJO',
  modoContabilidad: 'APAGADO',
  parametrosProveedor: {},
  ...extra,
});

describe('quién está hablando con el core sin inquilino propio', () => {
  it('una empresa con la integración encendida y sin inquilino: sale en la lista', async () => {
    const c = configuracionCon([empresa('e1')]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual(['e1']);
  });

  it('con inquilino asignado NO sale: ésa ya opera en su casa', async () => {
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: 'cliente_uno' } }),
    ]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual([]);
  });

  it('un inquilino en blanco cuenta como no tenerlo', async () => {
    /*
     * `'   '` llegaría a la cabecera como cadena vacía y el core caería en su
     * inquilino por omisión. Un espacio no es una asignación.
     */
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: '   ' } }),
    ]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual(['e1']);
  });

  it('con la integración apagada no cuenta: no habla con el core', async () => {
    const c = configuracionCon([
      empresa('e1', { modo: 'APAGADO', modoContabilidad: 'APAGADO' }),
    ]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual([]);
  });

  it('basta con que esté encendida la contabilidad, aunque la cartera no', async () => {
    /*
     * Son dos interruptores distintos y cualquiera de los dos manda asientos o
     * cartera al core. Mirar sólo `modo` dejaría fuera a quien replica el mayor,
     * que es precisamente lo que se mezcla entre empresas.
     */
    const c = configuracionCon([
      empresa('e1', { modo: 'APAGADO', modoContabilidad: 'ESPEJO' }),
    ]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual(['e1']);
  });

  it('dos empresas así son el caso que no puede pasar', async () => {
    const c = configuracionCon([empresa('e1'), empresa('e2')]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual([
      'e1',
      'e2',
    ]);
  });

  it('y una con inquilino junto a otra sin él deja sólo a la segunda', async () => {
    /*
     * El caso de la migración: la primera ya tiene su inquilino, la nueva
     * todavía no. Una sola sin inquilino sigue siendo seguro —el global es
     * suyo—, así que esto NO debe bloquear.
     */
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: 'cliente_uno' } }),
      empresa('e2'),
    ]);
    expect(await c.empresasSinInquilinoConIntegracionActiva()).toEqual(['e2']);
  });
});

describe('y el único punto de salida al core se niega cuando son dos', () => {
  /*
   * ESTRUCTURAL, Y EN EL SITIO QUE IMPORTA. `inquilinoDeLaOperacion` es, por
   * diseño del archivo, el ÚNICO lugar por donde salen todas las llamadas HTTP
   * al core: su cabecera explica que el contexto viaja por fuera precisamente
   * para que un camino nuevo no pueda olvidarse de él. Montar el servicio
   * entero —agente TLS, configuración, reintentos— mediría el armado del doble.
   */
  const salida = readFileSync(
    join(
      SRC,
      'integracion',
      'adaptadores',
      'fineract',
      'fineract-http.service.ts',
    ),
    'utf8',
  );
  const cuerpo = salida.slice(
    salida.indexOf('private async inquilinoDeLaOperacion('),
    salida.indexOf('private construirAgente('),
  );

  it('comprueba cuántas empresas caerían en el global', () => {
    expect(cuerpo).toMatch(/empresasSinInquilinoConIntegracionActiva\(\)/);
    expect(cuerpo).toMatch(/sinInquilino\.length > 1/);
  });

  it('y lo hace ANTES de devolver el inquilino global', () => {
    /*
     * Después del `return` no se ejecuta. Es la diferencia entre un control y un
     * comentario.
     */
    const comprobacion = cuerpo.indexOf('sinInquilino.length > 1');
    const respaldo = cuerpo.lastIndexOf('return this.cfg.tenant;');
    expect(comprobacion).toBeGreaterThan(0);
    expect(respaldo).toBeGreaterThan(comprobacion);
  });

  it('el mensaje nombra a las empresas y dice las dos salidas', () => {
    /*
     * Quien lo lea estará en medio de un alta. Un «error de inquilino» a secas
     * le hace abrir el código; esto le dice qué hacer.
     */
    expect(cuerpo).toMatch(/sinInquilino\.join\(', '\)/);
    expect(cuerpo).toMatch(/consola de SUMA/);
    expect(cuerpo).toMatch(/una sola empresa/);
  });

  it('con UNA empresa sin inquilino el respaldo sigue en pie', () => {
    /*
     * La instalación de hoy. Si el control fuera `>= 1` el core dejaría de
     * funcionar al desplegar esto, que es peor que el defecto.
     */
    expect(cuerpo).not.toMatch(/sinInquilino\.length >= 1/);
    expect(cuerpo).not.toMatch(/sinInquilino\.length > 0/);
  });

  it('y el orden de preferencia no cambió: explícito, el suyo, y al final el global', () => {
    const explicito = cuerpo.indexOf('if (explicito) return explicito;');
    const suyo = cuerpo.indexOf('if (suyo) return suyo;');
    const global = cuerpo.lastIndexOf('return this.cfg.tenant;');
    expect(explicito).toBeGreaterThan(-1);
    expect(suyo).toBeGreaterThan(explicito);
    expect(global).toBeGreaterThan(suyo);
  });
});

describe('lo que el propio código ya advertía', () => {
  it('la advertencia sigue escrita donde se da de alta una empresa', () => {
    /*
     * No se borra al arreglarlo: sigue siendo cierta como limitación de
     * despliegue —cada empresa necesita su realm— y ahora, además, hay una
     * comprobación que la hace cumplir. Si alguien quita la advertencia habrá
     * que acordarse de por qué existe el control.
     */
    const alta = readFileSync(
      join(SRC, 'integracion', 'services', 'alta-empresas.service.ts'),
      'utf8',
    );
    expect(alta).toMatch(/sólo UNA empresa puede operar con el core/);
  });
});
