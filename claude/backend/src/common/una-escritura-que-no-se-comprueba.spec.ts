import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Una escritura que nadie comprueba
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Tres botones del ERP mandaban un POST o un PATCH y seguían adelante sin
 * mirar qué contestó el servidor:
 *
 *   · «Recalcular antigüedad» en cartera vencida. Si el servidor lo negaba, la
 *     pantalla se recargaba con los mismos números y el botón quedaba como si
 *     hubiera trabajado. En un reporte de morosidad eso es creer que la
 *     clasificación está al día cuando no lo está.
 *   · «Cancelar» una importación de stock inicial. La barra seguía avanzando y
 *     nadie decía por qué no se detuvo.
 *   · «Hacer principal» una ubicación de almacén. La lista se recargaba igual
 *     y la etiqueta no se movía, sin una palabra.
 *
 * Con `api.post(...)` esto no puede pasar —un fallo lanza—, pero con `fetch`
 * a pelo el error es una respuesta, no una excepción: hay que preguntarle.
 *
 * LA REGLA
 *
 * Todo `fetch` con método de escritura mira su respuesta: `r.ok`, el `status`,
 * o al menos un `catch` que avise. Una escritura que se manda y no se
 * comprueba no es una escritura: es una esperanza.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ningún `fetch` de escritura vuelva a quedarse sin comprobar en el
 * frontend.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

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

const ESCRITURA = /method:\s*["'](?:POST|PATCH|PUT|DELETE)/i;
/** `r.ok`, `res.status`, `.catch(`, o un `try` alrededor que avise. */
const COMPROBADA = /\.ok\b|\bstatus\s*[=!<>]|\.catch\s*\(/;

describe('Pantallas · una escritura que nadie comprueba', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const archivos = fuentes(join(FRONTEND, 'app')).map((ruta) => ({
    ruta: relative(FRONTEND, ruta).split(sep).join('/'),
    texto: readFileSync(ruta, 'utf8'),
  }));

  it('todo fetch que escribe mira la respuesta', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of archivos) {
      let desde = 0;
      for (;;) {
        const i = texto.indexOf('await fetch(', desde);
        if (i < 0) break;
        desde = i + 12;

        /* La llamada: hasta 700 caracteres, que cubren cabeceras y cuerpo. */
        if (!ESCRITURA.test(texto.slice(i, i + 700))) continue;
        /* Y lo que se hace con ella: la propia llamada y lo que sigue. */
        if (COMPROBADA.test(texto.slice(i, i + 1200))) continue;

        culpables.push(`${ruta}:${texto.slice(0, i).split('\n').length}`);
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('hay escrituras con fetch en el árbol (si no, esto no mide nada)', () => {
    const conEscritura = archivos.filter((a) =>
      /await fetch\([\s\S]{0,700}?method:\s*["'](?:POST|PATCH|PUT|DELETE)/i.test(
        a.texto,
      ),
    );
    expect(conEscritura.length).toBeGreaterThan(5);
  });
});
