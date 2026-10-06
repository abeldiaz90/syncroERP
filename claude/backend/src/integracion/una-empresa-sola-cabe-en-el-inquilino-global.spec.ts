import { readFileSync } from 'fs';
import { join } from 'path';

import { ContextoInquilinoService } from './services/contexto-inquilino.service';

/**
 * ============================================================================
 * NO ES CUÁNTAS NO TIENEN INQUILINO: ES CUÁNTAS ACABAN EN EL MISMO
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
 * Dos empresas dentro del mismo inquilino comparten cartera y mayor, y el core
 * no da error: escribir en el inquilino de otro es una escritura perfectamente
 * válida. Nadie se entera hasta que alguien ve en su cartera un crédito que no
 * es suyo.
 *
 * LA PRIMERA VERSIÓN DE ESTE CONTROL MIRABA LO QUE NO ERA
 *
 * Contaba las empresas con la integración encendida y **sin** inquilino propio,
 * y se negaba con dos o más. Cubría el caso que yo tenía en la cabeza —dos
 * empresas cayendo al global por respaldo— y dejaba fuera el que de verdad está
 * montado hoy.
 *
 * Lo enseñó **la pantalla**, en cuanto el espejo contable empezó a decir el
 * inquilino: la casilla puso «fineract · institución «default»» **sin la
 * palabra «compartida»**, que es como esa pantalla dice que el inquilino está
 * asignado a la empresa, no heredado. O sea: la empresa que opera tiene
 * `default` asignado explícitamente, y `default` es también el inquilino
 * global. Una segunda empresa sin inquilino caería al global… que es el libro
 * de la primera. **Ninguna de las dos habría aparecido dos veces en la lista de
 * «sin inquilino», y el control no se habría disparado.**
 *
 * La condición correcta no es cuántas carecen de inquilino, sino cuántas acaban
 * en el mismo. El inquilino efectivo de una empresa es el suyo si lo tiene y el
 * global si no; con eso, los dos casos son el mismo caso, y aparece un tercero
 * que antes tampoco se veía: dos empresas con el mismo inquilino asignado a
 * mano.
 *
 * NO SE ENCIENDE EL INTERRUPTOR
 *
 * `FINERACT_TENANT_POR_EMPRESA` sigue apagado: encenderlo deja fuera del core a
 * toda empresa sin inquilino, incluida la que opera hoy. Eso es una decisión de
 * despliegue. Esto es la comprobación que hace falta mientras esté apagado.
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

const GLOBAL = 'default';

describe('quién acaba escribiendo en un inquilino', () => {
  it('la que no tiene el suyo cae en el global', async () => {
    const c = configuracionCon([empresa('e1')]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual(['e1']);
  });

  it('la que tiene el suyo no cae en el global', async () => {
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: 'cliente_uno' } }),
    ]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual([]);
    expect(await c.empresasQueCaenEn('cliente_uno', GLOBAL)).toEqual(['e1']);
  });

  it('EL CASO DE HOY: una con «default» asignado y otra sin inquilino', async () => {
    /*
     * ÉSTE ES EL QUE SE ESCAPABA, Y ES LA CONFIGURACIÓN REAL. La empresa que
     * opera tiene `default` asignado a mano —lo dijo la pantalla de espejo
     * contable—, y `default` es el global. La segunda, sin inquilino, cae
     * exactamente en su libro.
     *
     * Con el control anterior, la lista de «sin inquilino» tenía UN elemento y
     * no se disparaba nada.
     */
    const c = configuracionCon([
      empresa('la-que-opera', { parametrosProveedor: { tenant: 'default' } }),
      empresa('la-nueva'),
    ]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual([
      'la-que-opera',
      'la-nueva',
    ]);
  });

  it('y el que ya cubría: dos sin inquilino', async () => {
    const c = configuracionCon([empresa('e1'), empresa('e2')]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual(['e1', 'e2']);
  });

  it('y uno que tampoco veía: dos con el MISMO inquilino asignado a mano', async () => {
    /*
     * Un dedazo en la consola de SUMA, o un identificador reusado de la
     * reserva. Ninguna de las dos está «sin inquilino», y se mezclan igual.
     */
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: 'cliente_uno' } }),
      empresa('e2', { parametrosProveedor: { tenant: 'cliente_uno' } }),
    ]);
    expect(await c.empresasQueCaenEn('cliente_uno', GLOBAL)).toEqual(['e1', 'e2']);
  });

  it('dos empresas en inquilinos distintos no se tocan', async () => {
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: 'cliente_uno' } }),
      empresa('e2', { parametrosProveedor: { tenant: 'cliente_dos' } }),
    ]);
    expect(await c.empresasQueCaenEn('cliente_uno', GLOBAL)).toEqual(['e1']);
    expect(await c.empresasQueCaenEn('cliente_dos', GLOBAL)).toEqual(['e2']);
  });

  it('un inquilino en blanco cuenta como no tenerlo', async () => {
    /*
     * `'   '` llegaría a la cabecera como cadena vacía y el core caería en su
     * inquilino por omisión. Un espacio no es una asignación.
     */
    const c = configuracionCon([
      empresa('e1', { parametrosProveedor: { tenant: '   ' } }),
    ]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual(['e1']);
  });

  it('con la integración apagada no cuenta: no habla con el core', async () => {
    const c = configuracionCon([
      empresa('e1', { modo: 'APAGADO', modoContabilidad: 'APAGADO' }),
    ]);
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual([]);
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
    expect(await c.empresasQueCaenEn(GLOBAL, GLOBAL)).toEqual(['e1']);
  });

  it('preguntar por un inquilino vacío no devuelve a todo el mundo', async () => {
    /*
     * Si la configuración global llegara sin inquilino, comparar contra cadena
     * vacía metería en el mismo saco a todas las empresas sin asignación y
     * detendría el sistema entero con un mensaje que no es el problema.
     */
    const c = configuracionCon([empresa('e1'), empresa('e2')]);
    expect(await c.empresasQueCaenEn('', '')).toEqual([]);
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

  it('comprueba quién más escribe en el inquilino', () => {
    expect(cuerpo).toMatch(/empresasQueCaenEn\(/);
    expect(cuerpo).toMatch(/comparten\.length > 1/);
  });

  it('LOS DOS CAMINOS pasan por la comprobación, no sólo el respaldo', () => {
    /*
     * Es el defecto que se corrige: la comprobación estaba sólo antes de
     * devolver el global, y `if (suyo) return suyo` salía antes. Dos empresas
     * con el mismo inquilino asignado nunca llegaban a mirarse.
     */
    expect(cuerpo).toMatch(/if \(suyo\) return this\.nadieMasEscribeAhi\(suyo\);/);
    expect(cuerpo).toMatch(/return this\.nadieMasEscribeAhi\(this\.cfg\.tenant\);/);
  });

  it('y no queda ningún camino que devuelva el inquilino sin comprobarlo', () => {
    /*
     * En negativo sobre el método entero, sin comentarios: un `return` nuevo que
     * se salte la comprobación es exactamente cómo esto vuelve.
     *
     * El único que se perdona es el inquilino EXPLÍCITO, que lo pasa una tarea
     * de mantenimiento que sabe a qué libro va y por qué.
     */
    const sinComentarios = cuerpo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const metodo = sinComentarios.slice(
      0,
      sinComentarios.indexOf('private async nadieMasEscribeAhi('),
    );
    const retornos = [...metodo.matchAll(/return ([^;]+);/g)].map((m) => m[1].trim());
    for (const r of retornos) {
      expect(r === 'explicito' || r.startsWith('this.nadieMasEscribeAhi(')).toBe(true);
    }
    expect(retornos.length).toBeGreaterThanOrEqual(3);
  });

  it('el mensaje nombra a las empresas, el inquilino y las dos salidas', () => {
    /*
     * Quien lo lea estará en medio de un alta. Un «error de inquilino» a secas
     * le hace abrir el código; esto le dice qué hacer.
     */
    expect(cuerpo).toMatch(/comparten\.join\(', '\)/);
    expect(cuerpo).toMatch(/\$\{inquilino\}/);
    expect(cuerpo).toMatch(/consola de SUMA/);
    expect(cuerpo).toMatch(/una sola empresa/);
  });

  it('con UNA sola empresa en el inquilino todo sigue funcionando', () => {
    /*
     * La instalación de hoy. Si el control fuera `>= 1` el core dejaría de
     * funcionar al desplegar esto, que es peor que el defecto.
     */
    expect(cuerpo).not.toMatch(/comparten\.length >= 1/);
    expect(cuerpo).not.toMatch(/comparten\.length > 0/);
  });

  it('y el orden de preferencia no cambió: explícito, el suyo, y al final el global', () => {
    const explicito = cuerpo.indexOf('if (explicito) return explicito;');
    const suyo = cuerpo.indexOf('if (suyo) return');
    const global = cuerpo.lastIndexOf('this.cfg.tenant)');
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
