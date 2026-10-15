import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { DOCUMENTOS_PUBLICADOS } from './documentacion.catalogo';

/**
 * ============================================================================
 * UN INVENTARIO CONTADO A MANO ENVEJECE
 * ----------------------------------------------------------------------------
 * `00-ESTADO-DE-LA-DOCUMENTACION.md` nació el 15-oct para contestar «¿cómo
 * vamos con la documentación?» con números en vez de con una impresión. Su
 * propia última línea decía lo que le faltaba: los números se contaron a mano,
 * y un documento que afirma haber contado y hace semanas que no cuenta es
 * exactamente el defecto que ese documento denuncia en los demás —*un control
 * que se cree puesto*, aplicado a sí mismo—.
 *
 * Esta prueba ata las dos cifras que se pueden medir sin interpretar nada:
 *
 *   · cuántas pantallas tiene el ERP bajo `/dashboard`;
 *   · que todo documento de `docs/` esté en la tabla del 00 y en el catálogo
 *     que publica el ERP.
 *
 * Lo que NO mide es la columna «Estado» de §3, que es un juicio: si un flujo
 * está documentado o sólo mencionado no lo decide un conteo. Esa sigue siendo
 * de quien escribe, y está bien que así sea; lo que no puede pasar es que el
 * número de pantallas se quede viejo sin que nadie se entere.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const CANDIDATOS = [
  join(RAIZ, 'docs'),
  join(RAIZ, '..', 'docs'),
  join(__dirname, '..', '..', '..', 'docs'),
];
const DOCS = CANDIDATOS.find((c) =>
  existsSync(join(c, '00-ESTADO-DE-LA-DOCUMENTACION.md')),
);

const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

function pantallas(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.next')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) pantallas(ruta, acumulado);
    else if (nombre === 'page.tsx') acumulado.push(ruta);
  }
  return acumulado;
}

describe('Documentación · un inventario contado a mano envejece', () => {
  it('encuentra las dos carpetas, o no mide nada', () => {
    expect(DOCS).toBeDefined();
    expect(FRONTEND).toBeDefined();
  });

  it('el número de pantallas que citan el 00 y el README es el que hay', () => {
    const reales = pantallas(join(FRONTEND!, 'app/dashboard')).length;
    /*
     * El número vive en dos sitios: el §3 del 00 y la ficha del 00 dentro del
     * README. Se exigen los dos, porque corregir uno y olvidar el otro deja la
     * documentación diciendo dos cosas distintas sobre sí misma.
     */
    const citados: { donde: string; citado: number }[] = [];
    for (const archivo of ['00-ESTADO-DE-LA-DOCUMENTACION.md', 'README.md']) {
      const texto = readFileSync(join(DOCS!, archivo), 'utf8');
      /*
       * Tres cifras o más: el total del ERP está en las centenas, y así un
       * «las siete pantallas de reportes» de otro renglón no se confunde con
       * este número. Si algún día el ERP baja de cien pantallas, esto hay que
       * mirarlo —y bajar de cien pantallas también merece mirarse—.
       */
      for (const m of texto.matchAll(/(\d{3,4}) pantallas/g)) {
        citados.push({ donde: archivo, citado: Number(m[1]) });
      }
    }
    expect(citados.length).toBeGreaterThanOrEqual(2);
    expect(citados.filter((c) => c.citado !== reales)).toEqual([]);
  });

  it('todo documento de docs/ está en la tabla del 00', () => {
    const texto = readFileSync(join(DOCS!, '00-ESTADO-DE-LA-DOCUMENTACION.md'), 'utf8');
    const archivos = readdirSync(DOCS!).filter(
      (n) => /^\d\d-.+\.md$/.test(n) && n !== '00-ESTADO-DE-LA-DOCUMENTACION.md',
    );
    expect(archivos.length).toBeGreaterThan(5);
    const fuera = archivos.filter((n) => !texto.includes(n));
    expect(fuera).toEqual([]);
  });

  it('y está publicado dentro del ERP, o no lo lee nadie', () => {
    const archivos = readdirSync(DOCS!).filter((n) => /^\d\d-.+\.md$/.test(n));
    const publicados = new Set(DOCUMENTOS_PUBLICADOS.map((d) => d.archivo));
    /*
     * Escribir un manual y no registrarlo aquí es dejarlo donde sólo lo
     * encuentra quien ya sabe que existe. Pasó con el 07, que vivió cuatro
     * días fuera del índice.
     */
    expect(archivos.filter((n) => !publicados.has(n))).toEqual([]);
  });

  it('y todo documento publicado existe de verdad', () => {
    for (const doc of DOCUMENTOS_PUBLICADOS) {
      expect({ [doc.archivo]: existsSync(join(DOCS!, doc.archivo)) }).toEqual({
        [doc.archivo]: true,
      });
    }
  });
});
