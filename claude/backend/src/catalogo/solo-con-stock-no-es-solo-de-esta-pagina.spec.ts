/**
 * ============================================================================
 * «Sólo con stock» no es «sólo de esta página»
 * ----------------------------------------------------------------------------
 * El filtro traía la página —veinte productos— y recién entonces descartaba
 * los que no tenían existencia. Con el catálogo de la demo, veinticinco
 * artículos y las existencias repartidas entre las dos páginas, la pantalla
 * enseñaba los de la primera y anunciaba «total: 3 · 1 página».
 *
 * Lo que convierte esto en un defecto y no en una incomodidad es el total: se
 * calculaba sobre lo que sobrevivió a UNA página. La pantalla no decía «hay
 * más»; decía que ésos eran todos los artículos con existencia de la empresa.
 * Para quien abre esa casilla —que es quien quiere saber qué puede vender
 * hoy— eso es inventario que no se ofrece porque el sistema afirma que no
 * está.
 *
 * Y es de los que no se notan: la lista no sale vacía ni da error. Sale corta,
 * y una lista corta parece una respuesta.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const servicio = readFileSync(
  join(__dirname, 'services', 'productos.service.ts'),
  'utf8',
);
const sinComentarios = servicio
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** El cuerpo de `obtenerTodos`, que es quien pagina el catálogo. */
const listado = (() => {
  const inicio = sinComentarios.indexOf('soloConStock?: boolean,');
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = sinComentarios.slice(inicio).search(/\n  (async |private )/);
  return siguiente > -1
    ? sinComentarios.slice(inicio, inicio + siguiente)
    : sinComentarios.slice(inicio);
})();

describe('La base decide quién tiene existencia, antes de paginar', () => {
  it('el filtro entra en el `where`, no después del `take`', () => {
    expect(listado).toMatch(/whereClause\.id = In\(/);
  });

  it('se consulta la existencia sumando por producto', () => {
    expect(listado).toMatch(/getRepository\(StockPorAlmacen\)/);
    expect(listado).toMatch(/\.groupBy\('s\.productoId'\)/);
  });

  it('suma, no «alguna fila»: un almacén en negativo no da existencia', () => {
    /*
     * Con `where cantidad > 0` bastaría una sola fila positiva para que un
     * producto con saldo neto cero —o negativo, que pasa tras un ajuste mal
     * capturado— apareciera como vendible.
     */
    expect(listado).toMatch(/having\('COALESCE\(SUM\(s\.cantidad\), 0\) > 0'\)/);
  });

  it('se respeta la empresa en la consulta de existencias', () => {
    /*
     * Sin esto, el filtro de una empresa dejaría pasar productos por tener
     * existencia en otra. El `where` del listado acota después, pero el
     * conjunto de ids ya vendría contaminado y el total saldría inflado.
     */
    expect(listado).toMatch(/\.where\('s\.empresaId = :empresaId', \{ empresaId \}\)/);
  });

  it('sin ninguna existencia se contesta vacío de una vez', () => {
    /*
     * Y no con un `In([])`, que en TypeORM genera una condición que algunos
     * motores resuelven como «todos».
     */
    expect(listado).toMatch(
      /if \(conExistencia\.length === 0\) \{\s*return \{ productos: \[\], total: 0/,
    );
  });
});

describe('El total deja de medir una página', () => {
  it('no se recalcula a partir de lo filtrado en memoria', () => {
    expect(listado).not.toMatch(/total: soloConStock \?/);
    expect(listado).not.toMatch(/productosMapeados\.length/);
  });

  it('las páginas se cuentan sobre el total de la base', () => {
    expect(listado).toMatch(/totalPaginas: Math\.ceil\(total \/ limite\)/);
  });

  it('ya no queda el filtro en memoria', () => {
    /*
     * La prueba en negativo: si alguien lo vuelve a añadir «por si acaso», la
     * página volvería a recortarse después de contar y el total mentiría otra
     * vez, ahora sin que nada lo delate.
     */
    expect(listado).not.toMatch(/\.filter\(\(p\) => p\.stockActual > 0\)/);
  });

  it('la lista mapeada ya no necesita ser reasignable', () => {
    /*
     * Pequeño, pero dice algo: era `let` porque se reasignaba al filtrar. Que
     * sea `const` deja escrito que después de mapear ya no se toca.
     */
    expect(listado).toMatch(/const productosMapeados = productos\.map/);
  });
});

describe('Y un mensaje de carga ya no nombra un parche interno', () => {
  /*
   * En la pantalla de stock inicial, cuando un archivo terminaba sin filas
   * procesadas: «vuelve a cargarlo después de aplicar el hotfix». El cliente
   * no sabe qué es un hotfix, ni tiene uno que aplicar, ni debería enterarse
   * de que existía.
   */
  const { existsSync } = require('fs') as typeof import('fs');
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/inventario/stock-inicial/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('la palabra «hotfix» no aparece', () => {
    if (!hay) return;
    expect(pantalla).not.toMatch(/hotfix/i);
  });

  it('y en su lugar se dice qué hacer', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/Revisa los errores de abajo, corrige el archivo/);
  });
});
