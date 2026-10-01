/**
 * ============================================================================
 * Una plantilla que no pedía lo obligatorio
 * ----------------------------------------------------------------------------
 * `Producto.claveSAT` es la ClaveProdServ del SAT y la entidad la declara
 * obligatoria para CFDI 4.0: sin ella no hay timbre. La plantilla de carga
 * masiva —las 25 columnas del Excel— no la pedía, el DTO no la leía y el
 * importador no la escribía.
 *
 * Consecuencia medida el 30-sep-2026: seis productos cargados por Excel que no
 * se podían facturar. Y lo peor de este defecto es cómo se lee desde fuera:
 * parece captura descuidada —«se les olvidó poner la clave»— cuando en
 * realidad nadie se la pidió nunca a quien llenó el archivo.
 *
 * Esta prueba cuida las tres piezas a la vez, porque el defecto fue que las
 * tres se separaron sin que nada se pusiera rojo: la plantilla pide, el DTO
 * lee y el importador escribe.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { FilaProductoDto } from './dto/fila-producto.dto';

const RAIZ = join(__dirname, 'services');
const plantilla = readFileSync(
  join(RAIZ, 'plantilla-inventario.service.ts'),
  'utf8',
);
const importador = readFileSync(
  join(RAIZ, 'importacion-productos.service.ts'),
  'utf8',
);
const dtoFuente = readFileSync(
  join(__dirname, 'dto', 'fila-producto.dto.ts'),
  'utf8',
);

/** Las columnas tal como las declara la plantilla, en orden. */
const columnasDePlantilla = (): string[] => {
  const bloque = plantilla.slice(
    plantilla.indexOf('private readonly columnas = ['),
    plantilla.indexOf('];', plantilla.indexOf('private readonly columnas = [')),
  );
  return [...bloque.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
};

/** Los campos que el DTO declara como venidos del Excel (los `_*` no lo son). */
const camposDelDto = (): string[] => {
  const sinComentarios = dtoFuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const cuerpo = sinComentarios.slice(
    sinComentarios.indexOf('export class FilaProductoDto {'),
  );
  return [...cuerpo.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)[?!]?:/gm)]
    .map((m) => m[1])
    .filter((c) => !c.startsWith('_'));
};

describe('La plantilla pide exactamente lo que el DTO lee', () => {
  it('ninguna columna de la plantilla se queda sin campo en el DTO', () => {
    /*
     * Una columna que el DTO no lee es una columna que el usuario llena y el
     * sistema tira a la basura, en silencio.
     */
    const delDto = new Set(camposDelDto());
    const huerfanas = columnasDePlantilla().filter((c) => !delDto.has(c));
    expect(huerfanas).toEqual([]);
  });

  it('ningún campo del DTO se queda sin columna en la plantilla', () => {
    /*
     * Y al revés: un campo que el DTO lee y la plantilla no ofrece es un dato
     * que nadie podrá cargar jamás por Excel. Es exactamente lo que pasó con
     * `claveSAT`.
     */
    const deLaPlantilla = new Set(columnasDePlantilla());
    const sinColumna = camposDelDto().filter((c) => !deLaPlantilla.has(c));
    expect(sinColumna).toEqual([]);
  });

  it('hay columnas de verdad que comparar (la prueba no se aprueba sola)', () => {
    expect(columnasDePlantilla().length).toBeGreaterThanOrEqual(25);
    expect(camposDelDto().length).toBeGreaterThanOrEqual(25);
  });
});

describe('La clave que decide si un producto se puede cobrar', () => {
  it('la plantilla la pide', () => {
    expect(columnasDePlantilla()).toContain('claveSAT');
  });

  it('el DTO la lee del Excel', () => {
    expect(camposDelDto()).toContain('claveSAT');
    expect(importador).toMatch(/claveSAT: s\('claveSAT'\)/);
  });

  it('y el importador la escribe en el producto', () => {
    expect(importador).toMatch(/claveSAT: d\.claveSAT,/);
  });

  it('la fila de ejemplo trae una clave real, no un hueco', () => {
    /*
     * El ejemplo es lo que la gente copia. Dejarlo vacío enseña a dejarlo
     * vacío.
     */
    expect(plantilla).toMatch(/claveSAT: '\d{8}'/);
  });

  it('las instrucciones dicen qué se rompe sin ella', () => {
    expect(plantilla).toMatch(/NO SE PUEDE FACTURAR/);
  });

  it('un renglón sin clave se avisa, y el aviso nombra la consecuencia', () => {
    /*
     * No se rechaza: una materia prima puede vivir sin clave mientras no se
     * venda, y tumbar la carga entera de un catálogo por eso sería peor. Pero
     * tampoco pasa callado, y el aviso dice qué se rompe —«no se podrá
     * facturar»— en lugar de nombrar el campo, que no le dice nada a nadie.
     */
    expect(importador).toMatch(/campo: 'claveSAT'/);
    expect(importador).toMatch(/NO se podrá facturar hasta que se le asigne/);
    expect(importador).not.toMatch(
      /req\('claveSAT'/,
    );
  });
});

describe('El DTO sigue siendo el contrato del Excel', () => {
  it('se puede instanciar sin campos opcionales', () => {
    const fila = new FilaProductoDto();
    expect(fila).toBeDefined();
    expect(fila.claveSAT).toBeUndefined();
  });
});
