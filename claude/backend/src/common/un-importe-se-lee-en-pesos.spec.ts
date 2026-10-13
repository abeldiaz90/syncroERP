/**
 * ============================================================================
 * UN IMPORTE QUE UNA PERSONA LEE VA EN PESOS
 * ----------------------------------------------------------------------------
 * MEDIDO el 13-oct-2026 en la pantalla de conciliacion de cartera:
 *
 *     Diferencia de -6150.00 sobre una tolerancia de 1.
 *     ERP $0.00 · core $6,150.00
 *
 * Dos lineas seguidas, el mismo dinero, dos formatos. La de arriba la escribe
 * el servidor dentro del mensaje; la de abajo la formatea la pantalla. Y la de
 * arriba se lee mal a la primera: `-6150.00` puede ser seis mil o seiscientos
 * quince hasta que uno cuenta los digitos, y `1` sin unidad se lee como un
 * conteo, no como un peso.
 *
 * El barrido encontro la misma forma en sesenta y seis sitios mas del servidor,
 * y no son mensajes de adorno: «El cliente tiene 6150.00 vencidos», «el maximo
 * a pagar ahora es 23400.00», «Facturan a 1250.00 y lo pactado fue 1180.00».
 * Se leen en el momento de decidir si se paga, si se aprueba o si se cancela.
 *
 * ESTO ES UN TRINQUETE, NO UNA LINEA DE META
 *
 * Migrarlos todos de golpe son sesenta y seis cirugias a dias de produccion, y
 * muchos de esos textos estan fijados letra por letra en las pruebas. Asi que
 * se hizo lo que se puede hacer bien: la pieza compartida
 * (`common/utils/pesos.util.ts`), el sitio que se encontro roto, y un numero
 * que SOLO PUEDE BAJAR.
 *
 * LO QUE EL NUMERO NO DICE
 *
 * No todos los `toFixed(2)` interpolados son dinero: algunos son cantidades de
 * inventario o porcentajes, y esos estan bien donde estan. El numero no mide
 * «defectos pendientes»: impide que la cuenta CREZCA, que es lo que pasa cuando
 * alguien escribe el siguiente importe a mano sin saber que hay una pieza para
 * eso. Quien arregle uno, baja el numero y lo deja fijado para siempre.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pesos } from './utils/pesos.util';

const RAIZ = join(__dirname, '..');

/**
 * CUANTOS IMPORTES SE SIGUEN ESCRIBIENDO A MANO. Este numero solo puede bajar.
 *
 * 85 cuando se midio. 80 al cerrar: los cinco de la conciliacion de cartera,
 * que es donde se vio el defecto con los ojos. Los tres sitios con mas deuda
 * son el calculo de nomina (11), las ordenes de compra (8) y tesoreria (8).
 */
const DEUDA_MAXIMA = 80;

/** `${algo.toFixed(2)}` dentro de una plantilla: un importe escrito a mano. */
const A_MANO = /\$\{[^}]*\.toFixed\(2\)[^}]*\}/g;

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) acc.push(ruta);
  }
  return acc;
}

function cuenta(): { total: number; porArchivo: Record<string, number> } {
  const porArchivo: Record<string, number> = {};
  let total = 0;
  for (const ruta of fuentes(RAIZ)) {
    const encontrados = readFileSync(ruta, 'utf8').match(A_MANO)?.length ?? 0;
    if (encontrados) {
      porArchivo[relative(RAIZ, ruta)] = encontrados;
      total += encontrados;
    }
  }
  return { total, porArchivo };
}

describe('un importe que una persona lee va en pesos', () => {
  it('la pieza compartida existe y formatea como la pantalla', () => {
    // Una prueba que prohibe sin ofrecer alternativa la borra el siguiente.
    expect(pesos(6150)).toBe('$6,150.00');
    expect(pesos(0)).toBe('$0.00');
    expect(pesos(-6150)).toBe('-$6,150.00');
    expect(pesos(1)).toBe('$1.00');
  });

  it('un valor que no es numero no se convierte en $NaN', () => {
    // En un mensaje, «NaN» no informa de nada y asusta.
    expect(pesos(null)).toBe('$0.00');
    expect(pesos(undefined)).toBe('$0.00');
    expect(pesos('no es un numero')).toBe('$0.00');
    expect(pesos('6150.5')).toBe('$6,150.50');
  });

  it('la conciliacion de cartera ya no escribe importes a mano', () => {
    // El sitio donde se vio el defecto. Si vuelve, esto lo dice por su nombre.
    const { porArchivo } = cuenta();
    expect(porArchivo['integracion/services/cartera-conciliacion.service.ts']).toBeUndefined();
  });

  it('la cuenta de importes escritos a mano no crece', () => {
    const { total, porArchivo } = cuenta();
    if (total > DEUDA_MAXIMA) {
      throw new Error(
        `Hay ${total} importes escritos a mano y el tope es ${DEUDA_MAXIMA}. ` +
          'Usa `pesos()` de common/utils/pesos.util en el que acabas de escribir. ' +
          'Por archivo:\n' +
          Object.entries(porArchivo)
            .sort((a, b) => b[1] - a[1])
            .map(([archivo, n]) => `  ${n}  ${archivo}`)
            .join('\n'),
      );
    }
    expect(total).toBeLessThanOrEqual(DEUDA_MAXIMA);
  });

  it('la prueba sabe contar (si no, el trinquete no sujeta nada)', () => {
    // La prueba de la prueba: el patron tiene que ver lo que dice ver.
    const ejemplos = [
      'const m = `Diferencia de ${d.toFixed(2)} pesos.`;',
      '`${Number(x.total).toFixed(2)} y sus partidas suman ${t.toFixed(2)}.`',
    ];
    expect(ejemplos[0].match(A_MANO)?.length).toBe(1);
    expect(ejemplos[1].match(A_MANO)?.length).toBe(2);
    // Y no debe contar lo que no es una plantilla.
    expect('const s = valor.toFixed(2);'.match(A_MANO)).toBeNull();
    expect('`${pesos(valor)}`'.match(A_MANO)).toBeNull();
    // Y debe quedar algo que contar: un tope de cero con cero encontrados
    // seria un trinquete que no sujeta nada.
    expect(cuenta().total).toBeGreaterThan(0);
  });
});
