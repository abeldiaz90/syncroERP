/**
 * ============================================================================
 * «cafe» sin acento también es café
 * ----------------------------------------------------------------------------
 * Medido en la caja el 1-oct-2026, vendiendo de verdad con Abel delante:
 *
 *     «cafe»  →  Sin resultados para "cafe"
 *     «Café»  →  Café tostado en grano 1 kg · $320.00 · 120 kg
 *
 * Nadie teclea la tilde con un cliente enfrente. Y lo que ve el cajero no es
 * «me faltó el acento»: es que el producto NO EXISTE. Manda a buscarlo al
 * anaquel, o lo captura a mano, o pierde la venta.
 *
 * Es el mismo final que ya nos costó una corrección por las mayúsculas —de ahí
 * salió el `ILike`—, entrando ahora por la tilde. Y en un catálogo mexicano no
 * es un caso raro: café, azúcar, lámina, jabón, atún, champú, limpión,
 * cigüeñal, niple.
 *
 * `ILike` resolvió las mayúsculas porque Postgres sabe de mayúsculas. De
 * acentos no sabe sin ayuda, así que la ayuda se pone en los dos lados de la
 * comparación.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  columnaSinAcentos,
  patronDeBusqueda,
  sinAcentos,
} from '../common/utils/texto-busqueda.util';

describe('El texto se normaliza como lo teclea quien cobra', () => {
  it.each([
    ['Café tostado en grano 1 kg', 'cafe tostado en grano 1 kg'],
    ['Azúcar estándar 1 kg', 'azucar estandar 1 kg'],
    ['Lámina de acero calibre 18', 'lamina de acero calibre 18'],
    ['Jabón líquido', 'jabon liquido'],
    ['Atún en agua', 'atun en agua'],
    ['Cigüeñal', 'cigueñal'.replace('ñ', 'n')],
    ['Niple de 1/2"', 'niple de 1/2"'],
  ])('«%s» se compara como «%s»', (entrada, esperado) => {
    expect(sinAcentos(entrada)).toBe(esperado);
  });

  it('la eñe también pierde la virgulilla: nadie la escribe con prisa', () => {
    expect(sinAcentos('Niño')).toBe('nino');
    expect(sinAcentos('CIGÜEÑAL')).toBe('cigueñal'.replace('ñ', 'n'));
  });

  it('un acento combinado del copiar y pegar cuenta igual', () => {
    /*
     * «é» puede venir como una sola letra o como «e» + marca. A la vista son
     * idénticas y como texto no lo son. NFD las iguala.
     */
    const precompuesto = 'Café';
    const combinado = 'Café';
    expect(precompuesto).not.toBe(combinado);
    expect(sinAcentos(combinado)).toBe(sinAcentos(precompuesto));
  });

  it('lo que no lleva marca no se toca', () => {
    expect(sinAcentos('Casco de seguridad')).toBe('casco de seguridad');
    expect(sinAcentos('FER-CAB-12')).toBe('fer-cab-12');
  });

  it('un texto vacío o nulo no revienta la búsqueda', () => {
    expect(sinAcentos('')).toBe('');
    expect(sinAcentos(undefined as any)).toBe('');
    expect(sinAcentos(null as any)).toBe('');
  });

  it('el patrón envuelve en comodines y recorta los espacios', () => {
    expect(patronDeBusqueda('  Café ')).toBe('%cafe%');
    expect(patronDeBusqueda('')).toBe('%%');
  });
});

describe('La columna se normaliza con la MISMA tabla', () => {
  /*
   * Si los dos lados no usan la misma tabla, la comparación falla justo en las
   * letras que uno de los dos olvidó — y falla en silencio, devolviendo cero
   * resultados como si el producto no existiera.
   */
  const expresion = columnaSinAcentos('p.nombre');

  it('baja a minúsculas y traduce, en ese orden', () => {
    expect(expresion).toMatch(/^translate\(lower\(p\.nombre\), '/);
  });

  it('las dos tablas de `translate` tienen la misma longitud', () => {
    /*
     * `translate` con tablas desparejadas BORRA los caracteres sobrantes en
     * vez de avisar: «Café» pasaría a «Caf» y dejaría de encontrarse incluso
     * escribiéndolo bien.
     */
    const [, con, sin] = /translate\(lower\([^)]+\), '([^']+)', '([^']+)'\)/.exec(
      expresion,
    )!;
    expect([...con].length).toBe([...sin].length);
  });

  it('cubre las letras que de verdad aparecen en un catálogo mexicano', () => {
    const [, con] = /translate\(lower\([^)]+\), '([^']+)'/.exec(expresion)!;
    for (const letra of 'áéíóúüñÁÉÍÓÚÜÑ') {
      expect(con).toContain(letra);
    }
  });

  it('la utilidad se niega a cargarse con las tablas desparejadas', () => {
    /*
     * La guardia vive en el módulo, no en una prueba: si alguien añade una
     * letra a un lado y no al otro, la aplicación no arranca en vez de
     * devolver búsquedas mutiladas durante meses.
     */
    const util = readFileSync(
      join(__dirname, '..', 'common', 'utils', 'texto-busqueda.util.ts'),
      'utf8',
    );
    expect(util).toMatch(
      /if \(CON_MARCA\.length !== SIN_MARCA\.length\) \{\s*throw new Error\(/,
    );
  });
});

describe('La búsqueda de productos usa la normalización, no `ILike`', () => {
  const servicio = readFileSync(
    join(__dirname, 'services', 'productos.service.ts'),
    'utf8',
  );
  const buscar = (() => {
    const inicio = servicio.indexOf('async buscarProductos(');
    expect(inicio).toBeGreaterThan(-1);
    const siguiente = servicio.slice(inicio + 1).search(/\n  (async |private )/);
    return siguiente > -1
      ? servicio.slice(inicio, inicio + 1 + siguiente)
      : servicio.slice(inicio);
  })();

  it('arma el patrón con la utilidad compartida', () => {
    expect(buscar).toMatch(/patronDeBusqueda\(String\(query \?\? ''\)\)/);
  });

  it('los CUATRO campos buscables se normalizan, no sólo el nombre', () => {
    /*
     * El SKU y los dos códigos de barras rara vez llevan acentos, pero el
     * nombre comercial de un código escaneado sí puede, y dejar un campo sin
     * normalizar es dejar una puerta por la que la búsqueda vuelve a fallar
     * sólo a veces — que es peor que fallar siempre.
     */
    for (const campo of ['p.nombre', 'p.sku', 'p.codigoBarras', 'p.codigoBarras2']) {
      expect(buscar).toContain(`sin('${campo}')`);
    }
  });

  it('ya no queda un `ILike` en la búsqueda de caja', () => {
    expect(buscar).not.toMatch(/ILike\(/);
  });

  it('las cuatro condiciones van agrupadas, no sueltas con el resto', () => {
    /*
     * Sin `Brackets`, el `OR` de los campos se mezcla con el `AND` de empresa
     * y activo: la caja empezaría a encontrar productos de otra empresa o
     * dados de baja. Un error de paréntesis en una consulta de catálogo es un
     * problema de aislamiento, no de búsqueda.
     */
    expect(buscar).toMatch(/new Brackets\(\(b\) => \{/);
    expect(buscar).toMatch(/\.where\('p\.empresaId = :empresaId'/);
    expect(buscar).toMatch(/\.andWhere\('p\.activo = true'\)/);
  });

  it('sigue trayendo precios, imágenes y equivalencias', () => {
    /*
     * El cambio de `find` a query builder es donde se pierden las relaciones
     * sin que nada falle: la caja mostraría los productos sin precio.
     */
    for (const relacion of [
      'p.imagenes',
      'p.preciosProducto',
      'preciosProducto.listaPrecio',
      'p.equivalencias',
    ]) {
      expect(buscar).toContain(relacion);
    }
  });

  it('respeta el límite y el orden por nombre', () => {
    expect(buscar).toMatch(/\.orderBy\('p\.nombre', 'ASC'\)/);
    expect(buscar).toMatch(/\.take\(Math\.min\(Math\.max\(Number\(limite\) \|\| 15, 1\), 100\)\)/);
  });
});
