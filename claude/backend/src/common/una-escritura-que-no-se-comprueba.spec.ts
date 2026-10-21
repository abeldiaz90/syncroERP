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
 * Toda escritura mira su respuesta: `r.ok`, el `status`, o al menos un `catch`
 * que avise. Una escritura que se manda y no se comprueba no es una escritura:
 * es una esperanza.
 *
 * AL DÍA, 21-OCT-2026
 *
 * Esta prueba nació mirando `await fetch(`, que era como escribían las
 * pantallas. Al migrarlas a `peticion('/...')` —la puerta única, la que renueva
 * la sesión y lleva la suplantación— la regla se quedó mirando un árbol casi
 * vacío: de más de veinte archivos con escritura pasó a UNO. No se rompió, que
 * es lo peor que puede pasarle a una prueba: siguió pasando sin medir nada, y
 * fue su propia prueba de la prueba la que lo dijo.
 *
 * `peticion` tiene exactamente el mismo filo que `fetch`: devuelve la
 * `Response`, un 403 no lanza, y una escritura sin comprobar sigue siendo una
 * esperanza. Así que la regla mira las dos.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ninguna escritura del frontend —con `fetch` o con `peticion`— vuelva a
 * quedarse sin comprobar.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
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
/** Las dos puertas que devuelven la `Response` sin lanzar. */
const LLAMADA = /await\s+(?:fetch|peticion)\s*\(/g;
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
      LLAMADA.lastIndex = 0;
      for (;;) {
        const m = LLAMADA.exec(texto);
        if (!m) break;
        const i = m.index;

        /* La llamada: hasta 700 caracteres, que cubren cabeceras y cuerpo. */
        if (!ESCRITURA.test(texto.slice(i, i + 700))) continue;
        /* Y lo que se hace con ella: la propia llamada y lo que sigue. */
        if (COMPROBADA.test(texto.slice(i, i + 1200))) continue;

        culpables.push(`${ruta}:${texto.slice(0, i).split('\n').length}`);
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('hay escrituras en el árbol (si no, esto no mide nada)', () => {
    const conEscritura = archivos.filter((a) =>
      /await\s+(?:fetch|peticion)\s*\([\s\S]{0,700}?method:\s*["'](?:POST|PATCH|PUT|DELETE)/i.test(
        a.texto,
      ),
    );
    expect(conEscritura.length).toBeGreaterThan(5);
  });

  it('y la regla mira las dos puertas, no sólo una', () => {
    /*
     * El 21 de octubre esto valía 1 porque la regla seguía buscando `fetch`
     * después de la migración. Que haya pantallas que escriben con cada una de
     * las dos puertas es lo que hace que la regla de arriba signifique algo.
     */
    const conFetch = archivos.filter((a) =>
      /await\s+fetch\s*\([\s\S]{0,700}?method:\s*["'](?:POST|PATCH|PUT|DELETE)/i.test(
        a.texto,
      ),
    ).length;
    const conPeticion = archivos.filter((a) =>
      /await\s+peticion\s*\([\s\S]{0,700}?method:\s*["'](?:POST|PATCH|PUT|DELETE)/i.test(
        a.texto,
      ),
    ).length;
    /*
     * 21-oct-2026: 45 archivos escriben con `peticion` y 1 queda con `fetch`
     * —el de aceptar la invitación, que corre ANTES de que exista una sesión y
     * por eso no puede usar la puerta. El suelo se pone por debajo de lo medido
     * para que la cifra pueda bajar un poco sin falsas alarmas, pero no al
     * punto de que la regla se quede mirando nada: 1 archivo, que es donde
     * estaba cuando la prueba dejó de medir, no pasa de aquí.
     */
    expect(conPeticion).toBeGreaterThanOrEqual(30);
    expect(conFetch).toBeLessThanOrEqual(3);
  });
});
