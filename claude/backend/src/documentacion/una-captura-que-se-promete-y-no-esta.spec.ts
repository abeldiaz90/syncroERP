import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { DOCUMENTOS_PUBLICADOS } from './documentacion.catalogo';
import { capturasQueNombra, esNombreDeCaptura, renderizar } from './markdown';

/**
 * ============================================================================
 * Una captura que se promete y no está
 * ----------------------------------------------------------------------------
 * QUÉ PASA SIN ESTO
 *
 * Hasta hoy el renderizador no sabía nada de imágenes. Un `![La caja de
 * cobro](img/caja.png)` caía en el reconocedor de ENLACES —la sintaxis es la
 * misma más un signo de admiración—, el destino no era ninguno de los
 * documentos conocidos ni empezaba por `http`, y la regla de «un destino que no
 * sabemos a dónde lleva no se convierte en enlace» hacía lo suyo: salía
 * publicada la palabra «!La caja de cobro». Sin error, sin aviso, sin figura.
 *
 * Es «un control que se cree puesto» aplicado al manual: el documento afirma
 * tener una captura, el autor la escribió, y el lector ve una frase rara.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Tres cosas, y ninguna es la redacción:
 *
 *   1 · Que cada captura que un documento NOMBRA exista de verdad en
 *       `docs/img/`. Es lo que se rompe solo: alguien renombra un archivo, o
 *       escribe la referencia antes de tener la captura.
 *   2 · Que ninguna pese de más. Las capturas van incrustadas en el HTML —el
 *       porqué está en `documentacion.service.ts`— así que su peso ES el peso
 *       del manual. Un manual que tarda en abrir no se lee.
 *   3 · Que el renderizador pinte una figura cuando el archivo está y un aviso
 *       visible cuando no. Se comprueba por el HTML que sale, no por el texto
 *       del archivo: es la diferencia entre probar la conducta y probar la
 *       ortografía.
 *
 * Y una cuarta de higiene: que no haya capturas en la carpeta que ningún
 * documento enseñe. Un archivo de 300 KB que nadie ve es peso en el
 * repositorio y, peor, parece documentación que existe.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const CANDIDATOS = [
  join(RAIZ, 'docs'),
  join(RAIZ, '..', 'docs'),
  join(__dirname, '..', '..', '..', 'docs'),
];
const CARPETA = CANDIDATOS.find((c) => existsSync(join(c, DOCUMENTOS_PUBLICADOS[0].archivo)));

/**
 * Los techos. Están aquí, con el porqué, y no en una constante lejana:
 * el día que alguien tenga que subirlos, lo que necesita leer es esto.
 *
 * 400 KB alcanza de sobra para una pantalla del ERP a 1440 px de ancho en PNG.
 * Si una captura se pasa, casi siempre es que se guardó la pantalla completa a
 * tamaño de monitor en vez de la parte que explica algo.
 *
 * 4 MB por documento es el tope de lo que se puede mandar en una respuesta sin
 * que abrir el manual se note. Un documento que lo pase no necesita un techo
 * más alto: necesita partirse en dos.
 */
const TECHO_POR_CAPTURA = 400 * 1024;
const TECHO_POR_DOCUMENTO = 4 * 1024 * 1024;

describe('Documentación · una captura que se promete y no está', () => {
  if (!CARPETA) {
    it('sin la carpeta de documentos, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }
  const carpeta = CARPETA;
  const img = join(carpeta, 'img');

  const nombradas = new Map<string, string[]>();
  for (const doc of DOCUMENTOS_PUBLICADOS) {
    const archivo = join(carpeta, doc.archivo);
    if (!existsSync(archivo)) continue;
    for (const nombre of capturasQueNombra(readFileSync(archivo, 'utf8'))) {
      nombradas.set(nombre, [...(nombradas.get(nombre) ?? []), doc.archivo]);
    }
  }

  it('toda captura que un documento nombra existe en docs/img/', () => {
    const faltan: string[] = [];
    for (const [nombre, docs] of nombradas) {
      if (!existsSync(join(carpeta, nombre))) {
        faltan.push(`${nombre} — la nombra ${docs.join(', ')}`);
      }
    }
    expect(faltan.sort()).toEqual([]);
  });

  it('y su nombre es de los que el servicio sabe leer', () => {
    /*
     * `esNombreDeCaptura` es lo que decide si se toca el disco. Una referencia
     * con la forma equivocada —una ruta absoluta, un `..`, un `.gif`— no se
     * lee y sale el aviso; esto lo caza antes de que se publique así.
     */
    const raros = [...nombradas.keys()].filter((n) => !esNombreDeCaptura(n));
    expect(raros.sort()).toEqual([]);
  });

  it('ninguna captura pesa de más, y ningún documento suma de más', () => {
    const pesadas: string[] = [];
    for (const [nombre] of nombradas) {
      const ruta = join(carpeta, nombre);
      if (!existsSync(ruta)) continue;
      const bytes = statSync(ruta).size;
      if (bytes > TECHO_POR_CAPTURA) {
        pesadas.push(`${nombre}: ${Math.round(bytes / 1024)} KB`);
      }
    }
    expect(pesadas.sort()).toEqual([]);

    const gordos: string[] = [];
    for (const doc of DOCUMENTOS_PUBLICADOS) {
      const archivo = join(carpeta, doc.archivo);
      if (!existsSync(archivo)) continue;
      const suma = capturasQueNombra(readFileSync(archivo, 'utf8'))
        .map((n) => (existsSync(join(carpeta, n)) ? statSync(join(carpeta, n)).size : 0))
        .reduce((a, b) => a + b, 0);
      if (suma > TECHO_POR_DOCUMENTO) {
        gordos.push(`${doc.archivo}: ${Math.round(suma / 1024)} KB en capturas`);
      }
    }
    expect(gordos.sort()).toEqual([]);
  });

  it('no hay capturas en la carpeta que ningún documento enseñe', () => {
    if (!existsSync(img)) return;
    const enDisco = readdirSync(img).filter((f) => !f.startsWith('.'));
    const huerfanas = enDisco.filter((f) => !nombradas.has(`img/${f}`));
    expect(huerfanas.sort()).toEqual([]);
  });

  it('un ejemplo dentro de un bloque de código no se cuenta como captura', () => {
    /*
     * `README.md` explica la sintaxis de una captura, con un ejemplo. Si el
     * escáner lo contara, la prueba de arriba exigiría un archivo que el
     * ejemplo nunca quiso tener — y el renderizador, que consume los bloques
     * de código antes de buscar figuras, no lo cuenta. Dos lecturas del mismo
     * archivo que no coinciden.
     */
    const md = ['Así se escribe:', '', '```', '![pie](img/ejemplo.png)', '```', ''].join('\n');
    expect(capturasQueNombra(md)).toEqual([]);
    /* Y fuera del bloque sí se cuenta. */
    expect(capturasQueNombra('![pie](img/ejemplo.png)')).toEqual(['img/ejemplo.png']);
  });

  describe('lo que sale publicado', () => {
    const UNA = 'data:image/png;base64,iVBORw0KGgo=';

    it('una captura que está sale como figura, con su pie', () => {
      const { html } = renderizar('![La caja de cobro](img/caja.png)', [], {
        'img/caja.png': UNA,
      });
      expect(html).toMatch(/<figure class="captura">/);
      expect(html).toContain(`src="${UNA}"`);
      expect(html).toMatch(/alt="La caja de cobro"/);
      expect(html).toMatch(/<figcaption>La caja de cobro<\/figcaption>/);
      /* Y no queda nada del Markdown a la vista. */
      expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/!\[|\]\(/);
    });

    it('una que no está lo dice, con el nombre del archivo', () => {
      const { html } = renderizar('![La caja de cobro](img/no-existe.png)', [], {});
      expect(html).toMatch(/class="captura falta"/);
      expect(html).toMatch(/img\/no-existe\.png/);
      expect(html).toMatch(/docs\/img/);
      /* Lo que NO puede pasar: que salga el texto pelado del Markdown. */
      expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/^!La caja/m);
    });

    it('un destino que no es de docs/img tampoco se publica en silencio', () => {
      for (const destino of [
        'https://ejemplo.com/pantalla.png',
        '../../.env',
        'img/../secreto.png',
        'capturas/caja.png',
      ]) {
        const { html } = renderizar(`![x](${destino})`, [], {});
        expect(html).toMatch(/class="captura falta"/);
      }
    });

    it('una captura metida en un párrafo avisa en vez de perderse', () => {
      /*
       * Una `<figure>` no puede vivir dentro de un `<p>`, así que la figura se
       * reconoce sólo cuando la captura va sola en su línea. Escribirla a
       * media frase es un error de redacción fácil de cometer; el renderizador
       * lo dice en la página en vez de comerse la imagen.
       */
      const { html } = renderizar('Mira ![esto](img/caja.png) aquí.', [], {
        'img/caja.png': UNA,
      });
      expect(html).toMatch(/captura-mal-puesta/);
      expect(html).not.toMatch(/<img/);
      expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/!\[/);
    });

    it('el texto que rodea a una captura no se parte', () => {
      /*
       * La figura se saca del flujo de párrafos. Si eso estuviera mal hecho, el
       * texto de después se quedaría fuera del documento —y eso no se nota
       * leyendo el Markdown—.
       */
      const { html } = renderizar(
        'Antes de la figura.\n![pie](img/caja.png)\nDespués de la figura.',
        [],
        { 'img/caja.png': UNA },
      );
      expect(html).toMatch(/<p>Antes de la figura\.<\/p>/);
      expect(html).toMatch(/<p>Después de la figura\.<\/p>/);
      expect(html.indexOf('<figure')).toBeGreaterThan(html.indexOf('Antes'));
      expect(html.indexOf('Después')).toBeGreaterThan(html.indexOf('</figure>'));
    });
  });
});
