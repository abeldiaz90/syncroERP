/**
 * ============================================================================
 * Una nota que no cabe no puede tirar la operación que la escribe
 * ----------------------------------------------------------------------------
 * `CreditoCliente.notas` es varchar(500) y tres caminos le concatenaban una
 * línea sin medir. El `save` que revienta es el ÚLTIMO paso de la anulación y
 * de la devolución: para cuando Postgres rechaza la fila, el inventario ya se
 * devolvió y la tesorería ya se movió. La transacción revierte, pero la
 * operación legítima queda imposible: se reintenta y vuelve a fallar, porque el
 * campo sigue lleno.
 * ============================================================================
 */
import {
  anotarEnElCredito,
  LIMITE_NOTAS_CREDITO,
} from './anotar-en-el-credito.util';

describe('Bitácora del crédito · recortar, no reventar', () => {
  it('una nota corta se acumula tal cual', () => {
    expect(anotarEnElCredito('Primera', 'Segunda')).toBe('Primera\nSegunda');
  });

  it('sin notas previas, queda sólo la línea nueva', () => {
    expect(anotarEnElCredito(null, 'Cancelado por anulación')).toBe(
      'Cancelado por anulación',
    );
  });

  it('nunca supera lo que admite la columna', () => {
    let notas = '';
    for (let i = 0; i < 200; i++) {
      notas = anotarEnElCredito(notas, `Ajuste DEV-${i}: -1,234.56. Devolución de mercancía`);
      expect(notas.length).toBeLessThanOrEqual(LIMITE_NOTAS_CREDITO);
    }
  });

  it('lo que se conserva es lo ÚLTIMO, que es lo que explica el estado de hoy', () => {
    /*
     * Hacen falta bastantes: con cincuenta renglones cortos no se llega a 500 y
     * no hay recorte que medir. La primera versión de esta prueba pasaba por
     * eso —medía un caso que no desbordaba— y se corrigió aquí.
     */
    let notas = '';
    for (let i = 0; i < 200; i++) notas = anotarEnElCredito(notas, `Línea ${i}`);
    expect(notas.length).toBeLessThanOrEqual(LIMITE_NOTAS_CREDITO);
    expect(notas).toContain('Línea 199');
    expect(notas).not.toContain('Línea 0\n');
    expect(notas.startsWith('…')).toBe(true);
  });

  it('una sola línea más larga que la columna tampoco la desborda', () => {
    const enorme = 'X'.repeat(LIMITE_NOTAS_CREDITO * 3);
    expect(anotarEnElCredito('previo', enorme).length).toBeLessThanOrEqual(
      LIMITE_NOTAS_CREDITO,
    );
  });

  it('no parte un renglón por la mitad', () => {
    let notas = '';
    for (let i = 0; i < 40; i++) notas = anotarEnElCredito(notas, `Ajuste número ${i} por devolución`);
    const renglones = notas.split('\n').slice(1);
    for (const r of renglones) {
      expect(r).toMatch(/^Ajuste número \d+ por devolución$/);
    }
  });
});
