import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * ============================================================================
 * Una pantalla no manda el trabajo a un puesto que no existe
 * ----------------------------------------------------------------------------
 * MEDIDO EL 29-SEP-2026, preguntado por quien lee la pantalla: «¿existe un rol
 * de Ventas?».
 *
 * La pantalla de listas de precio ofrecía dos formas de fijar el precio, y a
 * la primera la llamaba **«Lo captura Ventas»**.
 *
 * No existe ningún puesto llamado «Ventas». Los de esta instalación son
 * mostrador, almacén, compras, finanzas, contabilidad, tesorería, crédito,
 * cobranza, hotelería, RRHH, gerencia, dirección y gobierno.
 *
 * Y el que más se le parece —el mostrador— es justamente el que NO puede: el
 * módulo `precios` lo tiene en CONSULTA. Quien escribe listas de precio es
 * FINANZAS, y es el único. Así que la etiqueta mandaba a pedirle el precio a
 * un departamento inexistente, y si existiera se habría llevado un 403.
 *
 * No es una errata: es una instrucción. Quien configura una lista lee ahí a
 * quién tiene que ir a buscar, y esa frase le hacía perder el viaje. Es la
 * misma familia que el resto de este proyecto —algo que suena a decisión y no
 * lo es—, sólo que escrita en prosa en vez de en código.
 *
 * LA REGLA: si una pantalla nombra al puesto que hace algo, ese puesto tiene
 * que existir Y tener concedido lo que se le está encargando. Esta prueba ata
 * la frase al modelo de permisos: el día que las listas de precio cambien de
 * dueño, la etiqueta se cae aquí y hay que actualizarla, en vez de quedarse
 * mintiendo durante años.
 * ============================================================================
 */

const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  // src/iam/data → src/iam → src → backend → claude
  .map((nombre) => join(__dirname, '..', '..', '..', '..', nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const PANTALLA = 'app/dashboard/listas-precio/page.tsx';

/** Quita comentarios: la cabecera de la pantalla CITA la frase vieja. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function pantalla(): string {
  return sinComentarios(readFileSync(join(FRONTEND as string, PANTALLA), 'utf8'));
}

/** Los puestos que pueden ESCRIBIR listas de precio. */
const duenos = PLANTILLAS_PERMISOS.filter((p) => p.modulos.includes('precios'));

describe('Listas de precio · la pantalla nombra a quien de verdad puede', () => {
  it('encuentra la pantalla', () => {
    expect(FRONTEND).toBeDefined();
    expect(existsSync(join(FRONTEND as string, PANTALLA))).toBe(true);
  });

  it('hay exactamente un puesto que administra las listas de precio', () => {
    /*
     * Si mañana son dos, la regla de abajo sigue valiendo pero la frase de la
     * pantalla hay que revisarla a mano: nombra a uno.
     */
    expect(duenos.map((p) => p.rol)).toEqual(['finanzas']);
  });

  it('el mostrador NO puede: sólo lee precios', () => {
    /*
     * Esto es lo que volvía falsa la etiqueta vieja. Y desde el 29-sep tampoco
     * elige con qué lista cobra, justo para que no pueda rebajar una venta sin
     * dejar rastro de descuento.
     */
    const mostrador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'empleado');

    expect(mostrador?.modulos).not.toContain('precios');
    expect(mostrador?.modulosConsulta ?? []).toContain('precios');
  });

  it('la pantalla ya no manda el precio a «Ventas»', () => {
    expect(pantalla()).not.toMatch(/captura\s+Ventas/i);
  });

  it('y nombra al puesto que sí lo administra', () => {
    const texto = pantalla();
    const etiquetas = duenos.map((p) => p.etiqueta);

    expect(etiquetas.some((etiqueta) => texto.includes(etiqueta))).toBe(true);
  });
});
