/**
 * ============================================================================
 * Dos negativas que no son la misma
 * ----------------------------------------------------------------------------
 * Generar la orden de compra es lo que ADJUDICA: la cotización ganadora queda
 * SELECCIONADA y las demás de la misma requisición pasan a RECHAZADA. El diseño
 * es correcto —se midió el 28-sep con dos proveedores compitiendo por la misma
 * requisición: la orden de la ganadora se creó y la de la perdedora se negó, así
 * que no hay doble compra—.
 *
 * Lo que engañaba era el MOTIVO. Al intentar generar la orden de la perdedora,
 * su estado ya no es APROBADA y el mensaje contestaba «la adjudicación debe
 * estar APROBADA antes de generar la orden de compra». Literalmente cierto y
 * prácticamente falso: se lee como «ve a conseguir la firma», cuando la firma
 * existió —gerencia la dio— y lo que pasó es que otro proveedor ganó. Mandar a
 * alguien a buscar una aprobación que ya tuvo cuesta más que el propio rechazo.
 *
 * Ahora hay tres respuestas: descartada por adjudicación a otro, ya adjudicada
 * con su orden, o sin aprobar todavía.
 * ============================================================================
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const fuente = () =>
  readFileSync(
    join(__dirname, 'services', 'ordenes-compra.service.ts'),
    'utf8',
  );

describe('dos negativas que no son la misma', () => {
  it('una cotización descartada se dice descartada, no «sin aprobar»', () => {
    const t = fuente();
    const i = t.indexOf("cotizacion.estado === 'RECHAZADA'");
    expect(i).toBeGreaterThan(0);
    const mensaje = t.slice(i, i + 400);
    expect(mensaje).toMatch(/descartada/i);
    // Y dice qué hacer si de verdad hay que cambiar de proveedor.
    expect(mensaje).toMatch(/cancela/i);
  });

  it('una ya adjudicada dice que su orden existe', () => {
    const t = fuente();
    const i = t.indexOf("cotizacion.estado === 'SELECCIONADA'");
    expect(i).toBeGreaterThan(0);
    expect(t.slice(i, i + 300)).toMatch(/ya esta adjudicada|ya está adjudicada/i);
  });

  it('las tres negativas salen antes de crear nada', () => {
    /*
     * Las tres viven dentro del mismo `if (estado !== 'APROBADA')`, o sea antes
     * de tocar la orden. Si alguien mueve una de ellas más abajo, la orden se
     * crearía y el mensaje llegaría tarde.
     */
    const t = fuente();
    const guardia = t.indexOf("if (cotizacion.estado !== 'APROBADA')");
    const rechazada = t.indexOf("cotizacion.estado === 'RECHAZADA'");
    const seleccionada = t.indexOf("cotizacion.estado === 'SELECCIONADA'");
    const generica = t.indexOf('La adjudicación debe estar APROBADA');
    expect(guardia).toBeGreaterThan(0);
    for (const sitio of [rechazada, seleccionada, generica]) {
      expect(sitio).toBeGreaterThan(guardia);
    }
  });
});
