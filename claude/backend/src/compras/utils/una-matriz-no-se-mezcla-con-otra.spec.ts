/**
 * ============================================================================
 * Una matriz de aprobación no se mezcla con otra
 * ----------------------------------------------------------------------------
 * La adjudicación de cotizaciones filtraba sólo por `proceso`, no por el par
 * `proceso` + `departamentoId` que identifica una matriz. Con la matriz global
 * y la de un departamento capturadas, los niveles de las dos salían juntos:
 * firmas de más, y —porque los firmantes se indexan por `orden`— firmas de
 * MENOS, con un nivel pisando a otro sin que nada lo dijera.
 * ============================================================================
 */
import {
  matrizQueAplica,
  nivelesParaElImporte,
} from './elegir-la-matriz.util';

const GLOBAL = [
  { orden: 1, departamentoId: null, montoDesde: 0, montoHasta: null, quien: 'direccion' },
];
const COMPRAS = [
  { orden: 1, departamentoId: 'dep-compras', montoDesde: 0, montoHasta: 50000, quien: 'jefe-compras' },
  { orden: 2, departamentoId: 'dep-compras', montoDesde: 0, montoHasta: null, quien: 'direccion' },
];

describe('Qué matriz aplica', () => {
  it('la del departamento gana sobre la global', () => {
    const m = matrizQueAplica([...GLOBAL, ...COMPRAS], 'dep-compras');
    expect(m.map((x) => x.quien)).toEqual(['jefe-compras', 'direccion']);
  });

  it('nunca devuelve niveles de dos matrices a la vez', () => {
    /*
     * Éste es el defecto entero: dos matrices juntas tienen dos niveles con
     * `orden: 1`, y el `Map` de firmantes se queda con uno solo.
     */
    const m = matrizQueAplica([...GLOBAL, ...COMPRAS], 'dep-compras');
    const departamentos = new Set(m.map((x) => x.departamentoId ?? null));
    expect(departamentos.size).toBe(1);
    const ordenes = m.map((x) => x.orden);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });

  it('sin matriz propia, cae a la global', () => {
    const m = matrizQueAplica([...GLOBAL, ...COMPRAS], 'dep-almacen');
    expect(m.map((x) => x.quien)).toEqual(['direccion']);
  });

  it('sin departamento tampoco mezcla', () => {
    const m = matrizQueAplica([...GLOBAL, ...COMPRAS], null);
    expect(m.map((x) => x.quien)).toEqual(['direccion']);
  });

  it('sin ninguna global y sin la propia, no inventa una', () => {
    expect(matrizQueAplica(COMPRAS, 'dep-almacen')).toEqual([]);
  });
});

describe('Qué niveles cubren el importe', () => {
  const matriz = matrizQueAplica([...GLOBAL, ...COMPRAS], 'dep-compras');

  it('un importe bajo pasa por los niveles cuya banda lo cubre', () => {
    expect(nivelesParaElImporte(matriz, 10000).map((x) => x.quien)).toEqual([
      'jefe-compras',
      'direccion',
    ]);
  });

  it('un importe por encima del tope de un nivel ya no lo incluye', () => {
    expect(nivelesParaElImporte(matriz, 90000).map((x) => x.quien)).toEqual(['direccion']);
  });

  it('salen en orden, siempre', () => {
    const desordenada = [...matriz].reverse();
    expect(nivelesParaElImporte(desordenada, 10000).map((x) => x.orden)).toEqual([1, 2]);
  });

  it('un importe fuera de todas las bandas devuelve vacío, para que el servicio lo diga', () => {
    const soloBajos = [{ orden: 1, departamentoId: null, montoDesde: 0, montoHasta: 1000 }];
    expect(nivelesParaElImporte(soloBajos, 300000)).toEqual([]);
  });
});
