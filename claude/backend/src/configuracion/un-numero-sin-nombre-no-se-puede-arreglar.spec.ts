import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UN CONTROL QUE DICE «HAY 1» Y NO DICE CUÁL
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * Verificando por pantalla, después de reiniciar el ERP: *Configuración →
 * Integridad de datos* decía **«Stock consolidado distinto al localizado · 1»**
 * con una flecha. La flecha lleva a Ubicaciones internas, que enseña las tres
 * posiciones del almacén y ni una palabra del problema.
 *
 * O sea: el control sabe que hay un descuadre, y quien lo lee no tiene forma de
 * saber de qué producto. Para averiguarlo hay que entrar a la base de datos.
 *
 * POR QUÉ ES UN DEFECTO Y NO UNA FALTA DE LUJO
 *
 * Un número sin nombre no se puede arreglar, y lo que no se puede arreglar se
 * acaba ignorando. Un tablero con un «1» en rojo que lleva meses ahí es peor
 * que no medir nada, porque da la impresión de que está vigilado.
 *
 * Es, palabra por palabra, el mismo defecto que tenía el reporte de excepciones
 * antes del 5-oct.
 *
 * QUÉ SE HIZO
 *
 * Cada comprobación puede traer hasta cinco EJEMPLOS: filas que identifican a
 * los culpables, con el mismo acotado por empresa que la cuenta. Las cuatro de
 * inventario ya los traen. La pantalla los pinta, y dice «se muestran 5 de N»
 * cuando hay más, para que nadie lea cinco filas como si fueran todas.
 *
 * LO QUE ESTA PRUEBA VIGILA DE VERDAD
 *
 * Que los ejemplos midan LO MISMO que la cuenta. Dos consultas que responden a
 * preguntas parecidas son la forma más fácil de que una pantalla cuente una
 * cosa y enseñe otra — y entonces el control deja de ser creíble, que es la
 * única cosa que un control no se puede permitir.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const servicio = readFileSync(
  join(SRC, 'configuracion', 'services', 'diagnostico-configuracion.service.ts'),
  'utf8',
);

/** El archivo sin comentarios: aquí se mide código, no explicaciones. */
const sinComentarios = servicio
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** El cuerpo de una consulta SQL, normalizado para poder compararlo. */
const normalizar = (sql: string) =>
  sql
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),=])\s*/g, '$1')
    .trim()
    .toLowerCase();

describe('cada hallazgo puede decir quién', () => {
  it('`agregar` acepta ejemplos y no los inventa', () => {
    expect(sinComentarios).toMatch(/ejemplos\?: Array<Record<string, unknown>>,/);
    /*
     * Una lista vacía no es un ejemplo: pintarla dejaría una tabla con
     * encabezados y ningún renglón, que se lee como un fallo de carga.
     */
    expect(sinComentarios).toMatch(/ejemplos: ejemplos\?\.length \? ejemplos : undefined/);
  });

  it('las cuatro comprobaciones de inventario los traen', () => {
    for (const codigo of [
      'INV_NEGATIVOS',
      'INV_DUPLICADOS',
      'INV_STOCK_UBICACION_DIFERENTE',
      'INV_STOCK_SIN_UBICACION',
    ]) {
      const desde = sinComentarios.indexOf(`'${codigo}'`);
      expect(desde).toBeGreaterThan(0);
      const llamada = sinComentarios.slice(desde, sinComentarios.indexOf(');', desde));
      /* El último argumento es la lista de ejemplos, no una ruta suelta. */
      expect(llamada).toMatch(/cuales\w+|quienesDescuadran|sinUbicar/);
    }
  });

  it('cada consulta de ejemplos acota por empresa', () => {
    /*
     * LO QUE NO PUEDE FALLAR. Una consulta de diagnóstico que olvide el
     * `empresaId` enseñaría el inventario de otra empresa en la pantalla de
     * ésta. Es la misma fuga que el barrido multiempresa del 6-oct cerró en el
     * contador de pendientes, por el otro lado: allí se contaban las filas de
     * todas; aquí se enseñarían con nombre y apellido.
     */
    const consultas = [
      ...sinComentarios.matchAll(/this\.ds\.query\(\s*`([^`]+)`\s*,\s*\[([^\]]*)\]/g),
    ];
    expect(consultas.length).toBeGreaterThan(10);
    for (const [, sql, parametros] of consultas) {
      if (!/stock_por_almacen|stock_ubicaciones|productos|almacenes/i.test(sql)) continue;
      expect(sql).toMatch(/empresaId\s*=\s*\$1/i);
      expect(parametros).toContain('empresaId');
    }
  });

  it('LIMIT 5: unas pocas filas, no la lista entera', () => {
    /*
     * Cinco bastan para entender qué pasa. Cuarenta en una pantalla de
     * diagnóstico la vuelven ilegible, y de paso cargan la consulta.
     */
    const ejemplos = [
      ...sinComentarios.matchAll(/this\.ds\.query\(\s*`([^`]+LIMIT \d+[^`]*)`/g),
    ]
      .map((m) => m[1])
      /*
       * `existeTabla` también lleva un `LIMIT 1`, y no es una consulta de
       * ejemplos: pregunta si una tabla existe. Se mide lo que trae columnas
       * para enseñar.
       */
      .filter((sql) => /SELECT\s+p\.sku/i.test(sql));
    expect(ejemplos.length).toBeGreaterThanOrEqual(4);
    for (const sql of ejemplos) expect(sql).toMatch(/LIMIT 5/);
  });
});

describe('y los ejemplos miden lo mismo que la cuenta', () => {
  /*
   * ESTA ES LA PRUEBA QUE IMPORTA DENTRO DE UN AÑO. Si la consulta que cuenta y
   * la que da ejemplos dejan de hacer la misma pregunta, la pantalla dirá «hay
   * 3» y enseñará una fila, o al revés. Un control que se contradice a sí mismo
   * se deja de mirar.
   */
  const entre = (desde: string, hasta: string) =>
    servicio.slice(servicio.indexOf(desde), servicio.indexOf(hasta));

  it('el descuadre de ubicaciones usa la misma condición en las dos', () => {
    const bloque = entre('const diferenciasUbicacion', "'INV_STOCK_UBICACION_DIFERENTE'");
    const condicion =
      /HAVING ABS\(CAST\(s\.cantidad AS float\)-CAST\(COALESCE\(SUM\(su\.cantidad\),0\) AS float\)\)>0\.0001/g;
    expect((bloque.match(condicion) ?? []).length).toBe(2);
    /* Y el mismo `LEFT JOIN`, que es lo que decide qué cuenta como localizado. */
    expect(
      (bloque.match(/LEFT JOIN stock_ubicaciones su/g) ?? []).length,
    ).toBe(2);
  });

  it('la existencia sin ubicación, también', () => {
    const bloque = entre('const stockSinUbicacion', "'INV_STOCK_SIN_UBICACION'");
    expect((bloque.match(/s\.cantidad>0 AND su\.id IS NULL/g) ?? []).length).toBe(2);
  });

  it('las existencias negativas, también', () => {
    const bloque = entre('const negativos', "'INV_NEGATIVOS'");
    const condicion =
      /cantidad < 0 OR s?\.?reservado < 0 OR s?\.?comprometido < 0 OR s?\.?bloqueado < 0 OR s?\.?enTransito < 0/g;
    expect((bloque.match(condicion) ?? []).length).toBe(2);
  });

  it('y el stock duplicado agrupa por lo mismo', () => {
    const bloque = entre('const duplicados', "'INV_DUPLICADOS'");
    expect((bloque.match(/HAVING COUNT\(1\)>1/g) ?? []).length).toBe(2);
    /*
     * La cuenta agrupa por producto y almacén; los ejemplos, por eso mismo más
     * los nombres que se pintan. Lo que no puede cambiar es la pareja que
     * define «duplicado».
     */
    expect(normalizar(bloque)).toContain('group by productoid,almacenid');
    expect(normalizar(bloque)).toContain('s.productoid,s.almacenid');
  });
});

describe('la pantalla los enseña, y dice cuántos no está enseñando', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  const pantalla = () =>
    readFileSync(join(FRONTEND!, 'app/dashboard/configuracion/integridad/page.tsx'), 'utf8');

  it('pinta una tabla con las filas de ejemplo', () => {
    const s = pantalla();
    expect(s).toMatch(/h\.ejemplos&&h\.ejemplos\.length>0/);
    expect(s).toMatch(/Object\.keys\(h\.ejemplos\[0\]\)\.map/);
  });

  it('y avisa cuando hay más de los que caben', () => {
    /*
     * Quien ve cinco filas y el contador en cuarenta tiene que saber que le
     * faltan treinta y cinco. Sin esta línea, cinco filas se leen como todas.
     */
    expect(pantalla()).toMatch(/Se muestran \{h\.ejemplos\.length\} de \{h\.cantidad\}/);
  });

  it('la tarjeta ya no es un botón gigante con cosas dentro', () => {
    /*
     * Una tabla dentro de un `<button>` es HTML inválido, y un lector de
     * pantalla lee el conjunto como un solo control sin nombre. Justo lo que se
     * barrió ayer en las 95 casillas de sólo icono.
     */
    const s = pantalla();
    expect(s).not.toMatch(/<button key=\{h\.codigo\}/);
    expect(s).toMatch(/<div key=\{h\.codigo\}/);
    expect(s).toMatch(/>\s*Abrir<ArrowRight/);
  });
});
