/**
 * ============================================================================
 * El buscador dejaba de obedecer a los filtros
 * ----------------------------------------------------------------------------
 * La pantalla de productos tenía dos caminos. Sin texto llamaba al listado
 * —que filtra por categoría, marca y existencia, y pagina— y en cuanto se
 * escribía una letra se iba a `/catalogo/productos/buscar`, que no conoce
 * ninguna de esas cosas.
 *
 * Lo que se veía desde fuera: el chip de «Categoría: Ferretería» seguía
 * pintado arriba, los resultados no lo respetaban, y «cargar más» repetía la
 * misma lista porque ese endpoint tampoco pagina.
 *
 * Nada fallaba. No había error, ni 403, ni lista vacía. El catálogo
 * simplemente contestaba otra pregunta, y la pantalla seguía afirmando —con
 * sus chips— que había contestado la que se le hizo. Es el modo de fallo más
 * caro de todos: el que se lee como un resultado.
 *
 * El arreglo no es ampliar `/buscar`: es que el listado acepte el texto, para
 * que buscar y filtrar sean la misma consulta. `/buscar` se queda como está
 * —es el de la caja, devuelve otra forma, y ahí se busca sin filtros a
 * propósito—.
 * ============================================================================
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const servicio = readFileSync(
  join(__dirname, 'services', 'productos.service.ts'),
  'utf8',
);
const controlador = readFileSync(
  join(__dirname, 'controllers', 'productos.controller.ts'),
  'utf8',
);
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const listado = (() => {
  const codigo = sinComentarios(servicio);
  const inicio = codigo.indexOf('soloConStock?: boolean,');
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = codigo.slice(inicio).search(/\n  (async |private )/);
  return siguiente > -1
    ? codigo.slice(inicio, inicio + siguiente)
    : codigo.slice(inicio);
})();

describe('El listado busca y filtra en la misma consulta', () => {
  it('acepta el texto', () => {
    expect(listado).toMatch(/q\?: string,/);
    expect(sinComentarios(controlador)).toMatch(/@Query\('q'\) q\?: string,/);
  });

  it('el controlador se lo pasa al servicio', () => {
    const codigo = sinComentarios(controlador);
    const llamada = codigo.slice(
      codigo.indexOf('obtenerProductos('),
      codigo.indexOf('@Get(\':id\')'),
    );
    expect(llamada).toMatch(/soloConStock === 'true',\s*q,/);
  });

  it('busca en los cuatro campos, no sólo en el nombre', () => {
    for (const campo of ['nombre', 'sku', 'codigoBarras', 'codigoBarras2']) {
      expect(listado).toContain(`'${campo}'`);
    }
  });

  it('y sin acentos, como la caja', () => {
    /*
     * «cafe» tiene que encontrar «Café» aquí igual que en el punto de venta.
     * Dos buscadores del mismo catálogo que no se comportan igual enseñan a
     * desconfiar de los dos.
     */
    expect(listado).toMatch(/patronDeBusqueda\(texto\)/);
    expect(listado).toMatch(/columnaSinAcentos\(alias\)/);
  });

  it('CADA rama del OR lleva los filtros base', () => {
    /*
     * Esto es lo que impide que buscar desactive los filtros… y algo peor:
     * en TypeORM un arreglo de condiciones es un OR, así que una rama sin
     * `empresaId` devolvería productos de OTRA EMPRESA en cuanto alguien
     * escribiera una letra. El aislamiento no puede depender de acordarse.
     */
    expect(listado).toMatch(/\.map\(\(campo\) => \(\{\s*\.\.\.whereClause,/);
  });

  it('sin texto, la condición es la de siempre', () => {
    /*
     * Construir cuatro ramas con un patrón `%%` para una búsqueda vacía
     * multiplicaría por cuatro el trabajo de la consulta más usada del
     * catálogo.
     */
    expect(listado).toMatch(/const condiciones = texto\s*\?/);
    expect(listado).toMatch(/:\s*whereClause;/);
  });

  it('el `where` que se ejecuta es el compuesto', () => {
    expect(listado).toMatch(/where: condiciones,/);
    expect(listado).not.toMatch(/where: whereClause,/);
  });
});

describe('La pantalla ya no cambia de puerta al escribir', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/productos/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';
  const codigo = hay ? sinComentarios(pantalla) : '';

  it('ya no llama a `/buscar`', () => {
    if (!hay) return;
    expect(codigo).not.toMatch(/catalogo\/productos\/buscar/);
  });

  it('manda el texto como un parámetro más', () => {
    if (!hay) return;
    expect(codigo).toMatch(/params\.append\('q', cb\.trim\(\)\)/);
  });

  it('y la URL es una sola, constante', () => {
    if (!hay) return;
    expect(codigo).toMatch(/const url = `\$\{apiUrl\}\/catalogo\/productos\?\$\{params\}`/);
  });
});

describe('La caja conserva su propio buscador', () => {
  it('`/productos/buscar` sigue existiendo', () => {
    /*
     * Devuelve otra forma —lista plana con existencia por almacén— y la
     * terminal depende de ella. Unificar por unificar habría roto el
     * mostrador para arreglar una pantalla de catálogo.
     */
    expect(sinComentarios(controlador)).toMatch(/@Get\('buscar'\)/);
    expect(sinComentarios(servicio)).toMatch(/async buscarProductos\(/);
  });
});
