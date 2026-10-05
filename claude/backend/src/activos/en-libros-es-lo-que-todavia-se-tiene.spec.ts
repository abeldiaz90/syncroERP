import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { EstadoActivo } from './entities/activo-fijo.entity';

/**
 * ============================================================================
 * «En libros» es lo que la empresa todavía tiene
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, por pantalla, con la sesión de `contador`
 *
 * En el Registro de activos, la tarjeta de arriba decía:
 *
 *     VALOR EN LIBROS   $35,400.00   · neto contable
 *
 * y el pie de la MISMA tabla, dos centímetros más abajo:
 *
 *     3 activos · $586,600.00 en libros
 *
 * La tarjeta tenía razón. Los otros dos activos —la camioneta AF-000001 y el
 * servidor AF-000002— estaban VENDIDOS, y `resumen()` los excluye a propósito:
 * un activo vendido ya no es de la empresa y no tiene valor en libros. El pie
 * sumaba la columna entera y la etiquetaba con el término contable.
 *
 * No es un detalle de redacción. «Valor en libros» es la primera cifra que
 * alguien copia a un estado financiero, y ahí la diferencia era de $551,200
 * sobre un neto real de $35,400: dieciséis veces el número bueno.
 *
 * De paso: la interfaz `Activo` de esa pantalla declaraba `depreciacionAcumulada`
 * DOS VECES.
 *
 * LA REGLA: lo retirado no cuenta en libros. Sumarlo aparte es útil —filtrar
 * por «Vendido» y ver cuánto se dio de baja es legítimo— pero con su nombre.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Activos · qué estados dejan de contar en libros', () => {
  it('BAJA y VENDIDO existen como estados', () => {
    expect(EstadoActivo.BAJA).toBe('BAJA');
    expect(EstadoActivo.VENDIDO).toBe('VENDIDO');
  });

  it('el resumen del servidor los excluye', () => {
    const fuente = readFileSync(
      join(__dirname, 'services/activos.service.ts'),
      'utf8',
    );
    const desde = fuente.indexOf('async resumen(');
    expect(desde).toBeGreaterThan(-1);
    const bloque = fuente.slice(desde, desde + 700);

    expect(bloque).toMatch(/EstadoActivo\.BAJA/);
    expect(bloque).toMatch(/EstadoActivo\.VENDIDO/);
  });
});

const describeSiHayFrontend = FRONTEND ? describe : describe.skip;

describeSiHayFrontend('Registro de activos · el pie no miente sobre el neto', () => {
  const pagina = () =>
    readFileSync(
      join(FRONTEND!, 'app/dashboard/activos/registro/page.tsx'),
      'utf8',
    );

  it('la suma etiquetada «en libros» deja fuera lo retirado', () => {
    /*
     * Se mide la RAMA, no que las palabras aparezcan. Una prueba que sólo
     * busca 'BAJA' y 'VENDIDO' en el archivo sobrevive a que la condición se
     * cambie por `if (false)`, y una prueba que sobrevive al mutante no está
     * midiendo nada. Aquí se exige que el reparto dependa del estado de CADA
     * fila.
     */
    const texto = pagina();
    expect(texto).toMatch(/RETIRADOS\s*=\s*\['BAJA',\s*'VENDIDO'\]/);
    expect(texto).toMatch(
      /RETIRADOS\.includes\([\s\S]{0,40}\ba\.estado\b[\s\S]{0,40}\)/,
    );
  });

  it('lo retirado se muestra aparte y con su nombre', () => {
    expect(pagina()).toMatch(/vendidos o dados de baja/);
  });

  it('ya no se suma la columna entera bajo la etiqueta contable', () => {
    /*
     * El defecto exacto: un `reduce` sobre TODAS las filas visibles cuyo
     * resultado se imprimía como «en libros».
     */
    const texto = pagina();
    expect(texto).not.toMatch(
      /const totalFiltrado[\s\S]{0,200}reduce\([\s\S]{0,120}valorEnLibros/,
    );
  });

  it('la interfaz no declara dos veces la depreciación acumulada', () => {
    const texto = pagina();
    const inicio = texto.indexOf('interface Activo');
    const bloque = texto.slice(inicio, texto.indexOf('}', texto.indexOf('estado: string', inicio)));
    const veces = (bloque.match(/depreciacionAcumulada:/g) ?? []).length;
    expect(veces).toBe(1);
  });
});
