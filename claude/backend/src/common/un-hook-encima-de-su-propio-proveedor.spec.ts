import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un hook consultado encima de su propio proveedor
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El enlace al core en el menú lateral tenía dos condiciones, las dos
 * correctas: que la empresa haya contratado el registro externo, y que quien
 * mira tenga algo que hacer allí. **No aparecía para nadie, nunca.**
 *
 * El motivo no estaba en las condiciones sino en dónde se preguntaban.
 * `DashboardLayout` llamaba a `usePermiso()` y, unas líneas más abajo, era él
 * mismo quien montaba `<PermisosProvider>`. Un provider de React no sirve a su
 * propio componente: el hook resolvía contra el contexto por omisión —
 * `{ permisos: {}, cargando: true }`— y `tienePermiso` devolvía `false` para
 * todo, para siempre.
 *
 * Medido el 27-sep con la sesión de dirección: plan `usaRegistroExterno: true`,
 * `GET /integracion/estado` concedido y `true` en el mapa que contesta el
 * servidor… y ni un solo `<a>` al core en el DOM.
 *
 * POR QUÉ NO LO VIO NADIE
 *
 * Porque el resto del menú no usa ese hook: se filtra con `puedeVerEnlace()`
 * contra la lista de RUTAS que el propio layout pide aparte. Así que el defecto
 * quedó reducido a lo único que dependía de `tienePermiso` ahí arriba, y un
 * enlace que no está se lee como una decisión de diseño —«parece que a este
 * perfil no le toca»— y no como una avería. Era un hook contestando desde el
 * vacío.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ningún componente consuma un contexto que él mismo monta. Es un error de
 * los que no fallan: no hay excepción, no hay consola en rojo, sólo un `false`
 * educado y permanente.
 *
 * El criterio es estrecho a propósito: sólo salta cuando en el MISMO archivo
 * aparecen el `<Proveedor>` y el hook que lee ese contexto. Un provider montado
 * en un archivo y consumido en otro es lo normal y correcto.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/**
 * Los pares que hay que vigilar: quién monta el contexto y qué hook lo lee.
 *
 * Se declaran a mano —son dos— en vez de deducirlos: deducir «qué hook lee qué
 * contexto» con expresiones regulares es justo la clase de prueba que grita en
 * falso, y una que grita en falso se acaba borrando.
 */
const PARES = [
  { proveedor: 'PermisosProvider', hooks: ['usePermiso', 'usePermisosContext'] },
];

/**
 * El texto sin comentarios.
 *
 * Hace falta por las dos puntas, y lo aprendió en su primera ejecución: señaló
 * `layout.tsx`, que sólo nombra el hook en un comentario JSX explicando por qué
 * ya no lo llama, y `enlace-al-core.tsx`, que nombra `<PermisosProvider>` en su
 * cabecera explicando el defecto. Una prueba que se dispara con lo que alguien
 * escribió PARA EXPLICARLA es una prueba que se acaba borrando.
 */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

function fuentes(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

describe('un hook consultado encima de su propio proveedor', () => {
  if (!FRONTEND) {
    it('se salta: el frontend no está junto al backend', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const archivos = [
    ...fuentes(join(FRONTEND, 'app')),
    ...fuentes(join(FRONTEND, 'components')),
  ];

  it('hay archivos que revisar (si no, la prueba no prueba nada)', () => {
    expect(archivos.length).toBeGreaterThan(50);
  });

  it.each(PARES.map((p) => [p.proveedor, p]))(
    'nadie monta %s y consume su contexto en el mismo archivo',
    (_nombre, par) => {
      const { proveedor, hooks } = par as (typeof PARES)[number];
      const culpables: string[] = [];

      for (const archivo of archivos) {
        const texto = sinComentarios(readFileSync(archivo, 'utf8'));
        // Montarlo: aparece como etiqueta JSX, no sólo en un import.
        if (!new RegExp(`<${proveedor}[\\s>]`).test(texto)) continue;
        // Consumirlo: una llamada al hook.
        const llama = hooks.some((h) =>
          new RegExp(`(^|[^.\\w])${h}\\s*\\(`, 'm').test(texto),
        );
        if (llama) culpables.push(archivo.slice(FRONTEND.length + 1));
      }

      if (culpables.length) {
        throw new Error(
          `${culpables.join(', ')}: monta <${proveedor}> y además llama a ` +
            `${hooks.join(' / ')}. React no sirve un contexto al componente ` +
            `que lo monta: el hook lee el valor por omisión y contesta lo ` +
            `mismo para siempre, sin fallar. Mueve la pregunta a un componente ` +
            `hijo, como hace components/navigation/enlace-al-core.tsx.`,
        );
      }
    },
  );
});
