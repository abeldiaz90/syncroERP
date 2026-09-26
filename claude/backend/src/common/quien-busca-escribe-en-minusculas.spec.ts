import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ============================================================================
 * Quien busca escribe en minúsculas
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * En el punto de venta, el cajero escribió `taza` y la caja contestó «Sin
 * resultados para "taza"». El producto se llama «Taza de cerámica» y existe,
 * está activo y tiene precio. Con `term` tampoco aparecía el «Termo de acero».
 *
 * En Postgres, `LIKE` distingue mayúsculas de minúsculas. La base de este ERP
 * venía de SQL Server, donde la intercalación por omisión NO las distingue y
 * `LIKE` bastaba; al mudar de motor todas las búsquedas se volvieron literales
 * sin que nadie tocara una línea, y ninguna prueba lo notó porque las pruebas
 * escriben el término con la mayúscula correcta.
 *
 * No era el buscador de productos: era el ERP entero. No había un solo `ILIKE`
 * en el código. Clientes, proveedores, empleados, usuarios, activos fijos,
 * prospectos y oportunidades de CRM, movimientos de tesorería y catálogos del
 * SAT: nueve buscadores más, todos literales. Buscar «juan» no encontraba a
 * «Juan Pérez». Delante de un cliente, eso no se lee como una búsqueda
 * quisquillosa; se lee como que el dato no está.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ningún filtro de texto escrito por una persona vuelva a compararse con
 * `LIKE`. Se distinguen dos usos:
 *
 *   · `LIKE 'AF-%'`, `LIKE $2` con un folio — comparan un prefijo que el
 *     sistema mismo generó y guardó en mayúsculas. Ésos se quedan.
 *   · `LIKE :b` con `b = %loQueEscribió%` — ésos tienen que ser `ILIKE`.
 *
 * La regla operativa: si el parámetro se arma con `%${...}%`, la comparación
 * es ILIKE. Es reconocible sin ejecutar nada y no depende de que alguien se
 * acuerde.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts'))
      acumulado.push(ruta);
  }
  return acumulado;
}

describe('Búsquedas · quien busca escribe en minúsculas', () => {
  const fuentes = archivosTs(SRC).map((ruta) => ({
    ruta: relative(SRC, ruta).split('\\').join('/'),
    texto: readFileSync(ruta, 'utf8'),
  }));

  it('ningún filtro escrito por una persona se compara con LIKE', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of fuentes) {
      /*
       * Los comandos de siembra y limpieza no los escribe nadie a mano: barren
       * por prefijos que ellos mismos pusieron.
       */
      if (ruta.startsWith('database/commands/')) continue;

      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        const m = /\bLIKE\s+:(\w+)/g;
        let n: RegExpExecArray | null;
        while ((n = m.exec(linea))) {
          const parametro = n[1];
          /*
           * El valor del parámetro suele ir en las líneas siguientes, dentro
           * del objeto de parámetros. Se mira una ventana corta.
           */
          const ventana = lineas.slice(i, i + 6).join('\n');
          const armadoConTexto = new RegExp(
            `${parametro}\\s*:\\s*\`%\\$\\{`,
          ).test(ventana);
          if (armadoConTexto) {
            culpables.push(`${ruta}:${i + 1} → LIKE :${parametro}`);
          }
        }
      });
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('el buscador del punto de venta no distingue mayúsculas', () => {
    /*
     * El caso concreto, escrito aparte: es el que se vio en pantalla y el que
     * el cliente vería el martes. TypeORM tiene `Like` e `ILike` y se
     * diferencian en una letra; la que va aquí es la segunda.
     */
    const productos = fuentes.find((f) =>
      f.ruta.endsWith('catalogo/services/productos.service.ts'),
    );
    expect(productos).toBeDefined();
    const buscador = productos!.texto.slice(
      productos!.texto.indexOf('async buscarProductos('),
    );
    const cuerpo = buscador.slice(0, buscador.indexOf('\n  }'));
    expect(cuerpo).toContain('ILike(filtro)');
    expect(cuerpo).not.toMatch(/[^I]Like\(filtro\)/);
  });
});
