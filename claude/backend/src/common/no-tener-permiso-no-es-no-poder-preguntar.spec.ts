import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * «No tienes permiso» y «no pude preguntar» son dos respuestas distintas
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Mientras se recorría la interfaz, el backend se reinició un momento. En ese
 * instante, la pantalla de Balance general —que el rol de Finanzas sí tiene—
 * contestó «Esta sección no está en tu perfil», con el menú lateral vacío.
 *
 * El layout pedía las rutas del perfil así:
 *
 *   intentar(api.get('/admin/permisos/mis-rutas'), { rutas: [] })
 *
 * y ante cualquier fallo se quedaba con la lista VACÍA, que es exactamente lo
 * mismo que responde el servidor cuando alguien de verdad no tiene nada
 * concedido. Un corte de red de dos segundos y el usuario ve un ERP que le
 * quitó todos los permisos.
 *
 * Es la misma familia que ya corregimos en el motor contable —«una consulta
 * que falló no vale cero»— y en el diagnóstico de integridad, donde un control
 * que no pudo medir dice «no se pudo medir» en vez de contestar cero. Aquí el
 * cero era la lista vacía.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el fallo de la consulta no se confunda con la ausencia de permisos: que
 * haya un estado propio para «no se pudo preguntar», que la pantalla lo diga
 * con esas palabras y ofrezca reintentar, y que el defecto no vuelva por donde
 * entró —envolviendo la consulta en un valor por omisión vacío—.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Permisos · no tener permiso no es lo mismo que no poder preguntar', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const layout = readFileSync(join(FRONTEND, 'app/dashboard/layout.tsx'), 'utf8');
  const sinComentarios = layout
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('la consulta del perfil no cae en una lista vacía', () => {
    expect(sinComentarios).not.toMatch(
      /intentar\([\s\S]{0,120}mis-rutas[\s\S]{0,120}rutas:\s*\[\s*\]/,
    );
  });

  it('el fallo tiene su propio estado', () => {
    expect(sinComentarios).toMatch(/fallaPermisos/);
    /* Y se enciende en el catch de esa consulta, no en cualquier otro sitio. */
    const i = sinComentarios.indexOf('mis-rutas');
    expect(i).toBeGreaterThan(-1);
    const bloque = sinComentarios.slice(i, i + 700);
    expect(bloque).toMatch(/catch[\s\S]{0,200}setFallaPermisos\(true\)/);
  });

  it('la pantalla lo dice con esas palabras y deja reintentar', () => {
    expect(layout).toMatch(/No pudimos consultar tu perfil/);
    expect(layout).toMatch(/no se pudo preguntar al servidor/i);
    expect(layout).toMatch(/Reintentar/);
  });

  it('y sigue distinguiéndose de la pantalla de acceso denegado', () => {
    /*
     * Las dos tienen que existir: si alguien las funde en una, se pierde
     * justamente la distinción que esta prueba cuida.
     */
    expect(layout).toMatch(/function SinAcceso\(/);
    expect(layout).toMatch(/function PermisosNoConsultados\(/);
    expect(layout).toMatch(/Esta sección no está en tu perfil/);
  });

  it('las otras tres puertas al perfil tampoco lo confunden', () => {
    /*
     * El layout no es la única que pregunta por el perfil. Lo hacen también el
     * panel principal, el centro de trabajo y la caja —y esta última es la
     * peor: le decía al cajero «tu perfil no incluye la caja», con el cliente
     * enfrente, cuando lo único que había pasado es que no se pudo preguntar—.
     * Ninguna de las cuatro puede volver a caer en una lista vacía.
     */
    const puertas = [
      'app/dashboard/page.tsx',
      'app/dashboard/centros/[modulo]/page.tsx',
      'app/pos/layout.tsx',
    ];
    const culpables: string[] = [];
    for (const relativa of puertas) {
      const ruta = join(FRONTEND!, relativa);
      if (!existsSync(ruta)) continue;
      const texto = readFileSync(ruta, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/intentar\([\s\S]{0,120}mis-rutas[\s\S]{0,120}rutas:\s*\[\s*\]/.test(texto)) {
        culpables.push(relativa);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('la caja distingue las dos negativas', () => {
    const ruta = join(FRONTEND!, 'app/pos/layout.tsx');
    if (!existsSync(ruta)) return;
    const texto = readFileSync(ruta, 'utf8');
    expect(texto).toMatch(/'sin-respuesta'/);
    expect(texto).toMatch(/No pudimos consultar tu perfil/);
    /* Y la negativa de verdad sigue existiendo. */
    expect(texto).toMatch(/Tu perfil no incluye la caja/);
  });
});
