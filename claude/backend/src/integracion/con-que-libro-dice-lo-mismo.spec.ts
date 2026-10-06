import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { IntegracionController } from './controllers/integracion.controller';

/**
 * ============================================================================
 * LA PANTALLA AFIRMABA QUE LAS DOS CONTABILIDADES COINCIDEN, SIN DECIR CON CUÁL
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * Probando el enlace por pantalla: el portal de Fineract dice arriba «Tenant
 * default» y la pantalla de espejo contable del ERP decía «En línea ·
 * fineract». Parecían dos datos contradictorios, y no lo eran: `fineract` es el
 * nombre del PROVEEDOR —`readonly proveedor = 'fineract'` en el adaptador—, no
 * el del inquilino.
 *
 * No había contradicción, pero sí un hueco: la pantalla que termina diciendo
 * «Coinciden en las 5 póliza(s) espejadas» no decía con cuál de las
 * instituciones del core coincide. Y el inquilino es precisamente la frontera que decide a qué
 * libro llegaron los asientos: desde el ERP cada empresa ve sólo lo suyo, y es
 * el core quien las tendría juntas si dos cayeran en el mismo inquilino.
 *
 * Lo peor es que el dato ya estaba a mano: `estado()` devuelve
 * `detalle.tenant`, y el controlador lo tiraba.
 *
 * QUÉ SE DEVUELVE, Y POR QUÉ EL «EFECTIVO» Y NO EL CONFIGURADO
 *
 * `detalle.tenant` es el inquilino GLOBAL, el del entorno. Pero una empresa con
 * inquilino asignado no escribe ahí: `inquilinoDeLaOperacion` prefiere el suyo.
 * Pintar el global para esa empresa sería un dato falso en la casilla que la
 * gente usa para saber dónde buscar.
 *
 * Así que se devuelve el EFECTIVO —el de la empresa si lo tiene, el global si
 * no— y, junto a él, cuál de los dos es. Esa segunda parte es la que convierte
 * la casilla en información útil para quien administra: «compartido» es seguro
 * mientras sea UNA sola empresa la que cae ahí, que es exactamente la condición
 * que vigila `una-empresa-sola-cabe-en-el-inquilino-global.spec.ts`.
 * ============================================================================
 */

const controladorCon = (
  detalle: Record<string, unknown>,
  propio: string | null,
): IntegracionController => {
  const c = Object.create(IntegracionController.prototype) as Record<
    string,
    unknown
  >;
  c.disponibilidad = {
    estado: () => ({
      proveedor: 'fineract',
      configurado: true,
      disponible: true,
      detalle,
    }),
  };
  c.inquilinos = { inquilinoDe: async () => propio };
  return c as unknown as IntegracionController;
};

/** El ayudante es privado a propósito: nadie fuera del controlador lo arma. */
const enlaceDe = (c: IntegracionController) =>
  (
    c as unknown as {
      enlaceConInquilino(id: string): Promise<{
        proveedor: string;
        inquilino: { efectivo: string | null; propioDeLaEmpresa: boolean };
      }>;
    }
  ).enlaceConInquilino('e1');

describe('a qué libro del core van las pólizas de esta empresa', () => {
  it('con inquilino propio, el suyo, y se dice que es suyo', async () => {
    const enlace = await enlaceDe(
      controladorCon({ tenant: 'default' }, 'cliente_uno'),
    );
    expect(enlace.inquilino).toEqual({
      efectivo: 'cliente_uno',
      propioDeLaEmpresa: true,
    });
  });

  it('sin inquilino propio, el global, y se dice que NO es suyo', async () => {
    /*
     * La instalación de hoy. `propioDeLaEmpresa: false` es lo que permite a la
     * pantalla escribir «compartido» en vez de dar a entender que ese libro es
     * exclusivo de esta empresa.
     */
    const enlace = await enlaceDe(controladorCon({ tenant: 'default' }, null));
    expect(enlace.inquilino).toEqual({
      efectivo: 'default',
      propioDeLaEmpresa: false,
    });
  });

  it('el suyo gana al global: es el que de verdad recibe los asientos', async () => {
    /*
     * Es el mismo orden que `inquilinoDeLaOperacion`. Si aquí ganara el global,
     * la pantalla mandaría a buscar los asientos al libro equivocado.
     */
    const enlace = await enlaceDe(
      controladorCon({ tenant: 'global' }, 'cliente_dos'),
    );
    expect(enlace.inquilino.efectivo).toBe('cliente_dos');
  });

  it('un inquilino global en blanco no es un inquilino', async () => {
    /*
     * `'  '` pintado en la casilla deja un hueco justo donde la empresa busca
     * con qué libro coincide, y parece un fallo de carga. `null` deja la
     * casilla como estaba antes de este cambio, que es honesto.
     */
    const enlace = await enlaceDe(controladorCon({ tenant: '   ' }, null));
    expect(enlace.inquilino.efectivo).toBeNull();
  });

  it('ni uno que no es texto', async () => {
    /*
     * `detalle` es `Record<string, unknown>`: nada impide que un adaptador
     * futuro ponga ahí un objeto. Pintado sin más, la casilla diría
     * «[object Object]».
     */
    const enlace = await enlaceDe(controladorCon({ tenant: { id: 1 } }, null));
    expect(enlace.inquilino.efectivo).toBeNull();
  });

  it('y sin `tenant` en el detalle tampoco se inventa uno', async () => {
    const enlace = await enlaceDe(controladorCon({}, null));
    expect(enlace.inquilino).toEqual({
      efectivo: null,
      propioDeLaEmpresa: false,
    });
  });

  it('lo que ya decía la casilla sigue ahí', async () => {
    /*
     * El color y el «En línea» de la pantalla se calculan con `disponible` y
     * `configurado`. Añadir el inquilino quitando uno de ésos apagaría el
     * indicador entero.
     */
    const enlace = (await enlaceDe(
      controladorCon({ tenant: 'default' }, null),
    )) as unknown as Record<string, unknown>;
    expect(enlace.proveedor).toBe('fineract');
    expect(enlace.configurado).toBe(true);
    expect(enlace.disponible).toBe(true);
  });

  it('se pregunta el inquilino UNA sola vez', async () => {
    /*
     * El nombre y el «es suyo» salen de la misma respuesta. Con dos preguntas
     * —y hay un caché con vencimiento de por medio— una podría decir un
     * inquilino y la otra que no tiene ninguno: la casilla pintaría el nombre
     * del libro de la empresa y la palabra «compartido» al lado.
     */
    let veces = 0;
    const c = controladorCon({ tenant: 'default' }, null) as unknown as {
      inquilinos: { inquilinoDe: () => Promise<string | null> };
    };
    c.inquilinos.inquilinoDe = async () => {
      veces += 1;
      return veces === 1 ? 'cliente_uno' : null;
    };
    const enlace = await enlaceDe(c as unknown as IntegracionController);
    expect(veces).toBe(1);
    expect(enlace.inquilino).toEqual({
      efectivo: 'cliente_uno',
      propioDeLaEmpresa: true,
    });
  });
});

describe('y la pantalla lo pinta', () => {
  /*
   * El árbol de frontend se busca igual que en el resto de las pruebas de
   * pantalla, y se exige encontrarlo: una prueba que no encuentra qué medir y
   * se declara satisfecha es una luz verde sin nada detrás. Esto ya costó tres
   * commits escritos en el árbol congelado.
   */
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  const pantalla = () =>
    readFileSync(
      join(FRONTEND!, 'app/dashboard/finanzas/espejo-contable/page.tsx'),
      'utf8',
    );

  it('la casilla del enlace ya no pinta sólo el nombre del proveedor', () => {
    const s = pantalla();
    expect(s).toMatch(/detalle=\{\s*\n?\s*enVuelo \|\| espejoActivo \? institucionDelCore/);
    expect(s).not.toMatch(/enlace\.proveedor \?\? "—"/);
  });

  it('dice la institución, y dice cuándo es compartida', () => {
    /*
     * «Institución» es la palabra que usa el portal de Fineract. Llamarlo aquí
     * «libro» o «inquilino» obligaría a quien mira las dos pantallas a aprender
     * que son lo mismo.
     */
    const s = pantalla();
    expect(s).toMatch(/propioDeLaEmpresa\s*\n?\s*\?\s*`\$\{enlace\.proveedor\} · institución «\$\{nombre\}»`/);
    expect(s).toMatch(/institución «\$\{nombre\}», compartida/);
  });

  it('y sin el dato se queda como estaba, sin inventar una institución', () => {
    /*
     * El frontend vivo puede ir por delante del backend durante un despliegue.
     * «institución «undefined»» en la pantalla del espejo contable sería peor
     * que no decir nada.
     */
    const s = pantalla();
    expect(s).toMatch(/if \(!nombre\) return enlace\.proveedor;/);
  });
});
