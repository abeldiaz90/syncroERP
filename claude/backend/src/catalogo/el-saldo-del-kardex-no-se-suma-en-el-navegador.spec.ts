/**
 * ============================================================================
 * El saldo del kardex no se suma en el navegador
 * ----------------------------------------------------------------------------
 * La ficha del producto pintaba una tarjeta titulada «Stock Histórico Global»
 * sumando y restando **los movimientos que había recibido** — la primera
 * página, cincuenta renglones. Con un producto de rotación normal el número
 * deja de ser el inventario en una semana, y nadie lo nota: no sale vacío ni
 * da error, sale un número verosímil al lado de los otros tres.
 *
 * La columna de saldo corrido arrastraba el mismo error por el otro extremo:
 * sumaba hacia adelante desde cero, así que en la página dos arrancaba en cero
 * en el movimiento número cincuenta, como si antes no hubiera pasado nada.
 *
 * El arreglo tiene dos mitades y ninguna sirve sola:
 *   · el servidor manda la existencia REAL —la que suma `stock_por_almacen`,
 *     la misma que cuadra contra la cuenta contable—, respetando el almacén
 *     filtrado;
 *   · la pantalla pinta la columna HACIA ATRÁS desde ese saldo: el movimiento
 *     más reciente dejó la existencia de hoy, y el anterior se deduce
 *     deshaciéndolo.
 *
 * Y una tercera cosa, que es la que evita cambiar un número falso por otro: si
 * el servidor no manda el saldo, `null` significa «no se sabe» y la pantalla no
 * inventa ni enseña cero. Un cero en un kardex se lee como «no hay existencia»,
 * que es una afirmación, no una ausencia de dato.
 * ============================================================================
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const servicio = sinComentarios(
  readFileSync(join(__dirname, 'services', 'inventario.service.ts'), 'utf8'),
);

/** El cuerpo de `obtenerMovimientosPorProducto`, que es quien pagina el kardex. */
const kardex = (() => {
  const inicio = servicio.indexOf('async obtenerMovimientosPorProducto(');
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = servicio.slice(inicio + 1).search(/\n  (async |private )/);
  return siguiente > -1
    ? servicio.slice(inicio, inicio + 1 + siguiente)
    : servicio.slice(inicio);
})();

describe('El servidor manda la existencia real, no la de una página', () => {
  it('la respuesta incluye `saldoActual`', () => {
    expect(kardex).toMatch(/saldoActual: Number\(existencia\?\.total \?\? 0\),/);
  });

  it('se consulta `stock_por_almacen`, no se suman los movimientos', () => {
    /*
     * Sumar los movimientos de la tabla sería caer en el mismo error un piso
     * más abajo: el kardex tiene borrados lógicos y ajustes que no cuadran
     * contra la existencia. La fuente de verdad del inventario es el stock.
     */
    expect(kardex).toMatch(/this\.stockRepository\s*\n?\s*\.createQueryBuilder\('s'\)/);
    expect(kardex).toMatch(/COALESCE\(SUM\(s\.cantidad\), 0\)/);
  });

  it('se suma por producto y por empresa', () => {
    /*
     * Sin el filtro de empresa el saldo traería la existencia de otra
     * oficina, que es peor que no traer nada: cuadra con algo y no con esto.
     */
    expect(kardex).toMatch(/\.where\('s\.productoId = :productoId', \{ productoId \}\)/);
    expect(kardex).toMatch(/\.andWhere\('s\.empresaId = :empresaId', \{ empresaId \}\)/);
  });

  it('respeta el almacén filtrado', () => {
    /*
     * Si se mira el kardex de una sucursal, el saldo que corresponde es el de
     * esa sucursal. Mandar el de la empresa haría que la tarjeta no cuadrara
     * con la columna de abajo, y entre dos números que no coinciden el
     * almacenista le cree al más grande.
     */
    expect(kardex).toMatch(
      /\.andWhere\(almacenId \? 's\.almacenId = :almacenId' : '1=1', \{ almacenId \}\)/,
    );
  });

  it('las páginas siguen contándose sobre el total de movimientos', () => {
    /* El saldo es un dato nuevo; no cambia la paginación que ya existía. */
    expect(kardex).toMatch(/paginas: Math\.ceil\(total \/ take\)/);
  });
});

describe('La pantalla pinta el saldo hacia atrás, desde lo que hay hoy', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/productos/[id]/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';
  const codigo = hay ? sinComentarios(pantalla) : '';

  it('«no se sabe» es null, y no cero', () => {
    if (!hay) return;
    expect(codigo).toMatch(/useState<number \| null>\(null\)/);
    expect(codigo).toMatch(
      /typeof cuerpo\?\.saldoActual === 'number' \? cuerpo\.saldoActual : null,/,
    );
  });

  it('con null no se pinta la columna en vez de pintarla mal', () => {
    if (!hay) return;
    expect(codigo).toMatch(
      /if \(saldoReal === null\) \{\s*return movimientos\.map\(m => \(\{ \.\.\.m, saldoGlobal: undefined \}\)\);/,
    );
  });

  it('el saldo corrido arranca en la existencia real, no en cero', () => {
    /*
     * El mutante obvio —`let saldo = 0`— deja la columna exactamente como
     * estaba: creciendo desde cero en el movimiento cincuenta.
     */
    if (!hay) return;
    expect(codigo).toMatch(/let saldo = saldoReal;/);
    expect(codigo).not.toMatch(/let saldo = 0;/);
  });

  it('y se deshace cada movimiento al retroceder: una entrada RESTA', () => {
    /*
     * Ésta es la inversión que hace que el cálculo hacia atrás sea correcto, y
     * la que más fácil se escribe al revés. `movimientos` llega del más
     * reciente al más antiguo: si el último fue una entrada de 10, antes de él
     * había 10 MENOS.
     */
    if (!hay) return;
    expect(codigo).toMatch(
      /saldo = esMovimientoEntrada\(m\) \? saldo - cant : saldo \+ cant;/,
    );
  });

  it('la fila se queda con el saldo ANTES de deshacerlo', () => {
    /*
     * El orden de estas dos líneas es el defecto de desfase por uno: si se
     * descuenta primero, cada renglón enseña el saldo del renglón siguiente y
     * la tarjeta de arriba no cuadra con la primera fila.
     */
    if (!hay) return;
    const cuerpo = codigo.slice(
      codigo.indexOf('let saldo = saldoReal;'),
      codigo.indexOf('}, [movimientos, saldoReal]);'),
    );
    expect(cuerpo.indexOf('saldoGlobal: saldo')).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('saldoGlobal: saldo')).toBeLessThan(
      cuerpo.indexOf('saldo = esMovimientoEntrada(m)'),
    );
  });

  it('la tarjeta ya no se titula «Stock Histórico Global»', () => {
    /*
     * El título era parte del defecto: nombraba «global» a la suma de una
     * página. Si vuelve el título sin volver el cálculo, alguien revirtió esto
     * a medias.
     */
    if (!hay) return;
    expect(pantalla).not.toMatch(/Stock Histórico Global/);
    expect(pantalla).toMatch(/Existencia actual/);
  });

  it('la tarjeta enseña la existencia real, y «—» si no la sabe', () => {
    if (!hay) return;
    expect(codigo).toMatch(/const saldoGlobalActual = saldoReal;/);
    expect(codigo).toMatch(/saldoGlobalActual === null \? '—' : saldoGlobalActual/);
  });

  it('y la celda de cada fila tampoco enseña un hueco sin explicar', () => {
    if (!hay) return;
    expect(codigo).toMatch(/m\.saldoGlobal === undefined \? '—' : m\.saldoGlobal/);
  });

  it('ya no se calcula el saldo global sumando los movimientos recibidos', () => {
    /*
     * La prueba en negativo, que es la que cierra el agujero: si alguien
     * vuelve a derivar la tarjeta de `movimientos` —por `reduce`, por el
     * `stockNuevo` del primero o sumando entradas y salidas— el número vuelve
     * a medir una página y nada lo delata.
     */
    if (!hay) return;
    const declaracion = /saldoGlobalActual\s*=([^;=][^;]*);/.exec(codigo);
    expect(declaracion).not.toBeNull();
    expect(declaracion![1]).not.toMatch(/movimientos|totalEntradas|reduce|stockNuevo/);
  });
});
