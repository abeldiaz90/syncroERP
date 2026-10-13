/**
 * ============================================================================
 * LOS TRES MODOS ABREN EXACTAMENTE LAS PUERTAS QUE LES TOCAN
 * ----------------------------------------------------------------------------
 * `contratado()` decide, pantalla por pantalla, si una empresa ve un modulo del
 * core. Es la funcion que convierte «que contrato esta empresa» en «que ve esta
 * persona», y gobierna dos mapas de navegacion a la vez.
 *
 * Y NO TENIA NINGUNA PRUEBA, por una razon de fontaneria: vive en
 * `frontend/lib/contratacion.ts`, el frontend no tiene corredor de pruebas
 * propio, y ninguna prueba del backend importa modulos del frontend —la
 * resolucion de `@/...` y el `"use client"` no cruzan—. La prueba vecina
 * (`una-pantalla-que-vive-del-core-lo-declara`) comprueba que las pantallas
 * DECLAREN que necesitan el core; nadie comprobaba que la decision fuera la
 * correcta.
 *
 * ── COMO SE PRUEBA SIN PODER IMPORTARLA ────────────────────────────────────
 * Se extrae el texto de la funcion con el compilador de TypeScript y se evalua.
 * No es un apaño: `contratado()` es deliberadamente pura —no usa ningun import
 * del archivo— y esto ejecuta SU codigo, no una copia. Si alguien le mete una
 * dependencia, esta prueba deja de poder construirla y se pone roja diciendolo,
 * que es exactamente cuando hay que enterarse.
 *
 * Lo que se fija aqui es la regla entera, incluido el caso que mas facil se
 * rompe: mientras el plan NO SE SABE se esconde. Ensenar de menos molesta;
 * ensenar de mas manda a alguien a una pantalla que va a contestarle que no le
 * corresponde.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const RAIZ = join(__dirname, '..', '..', '..');
const CANDIDATAS = ['claude/frontend', 'frontend', '../claude/frontend'].map((n) =>
  join(RAIZ, n),
);
const FRONTEND = CANDIDATAS.find((ruta) =>
  existsSync(join(ruta, 'lib/contratacion.ts')),
);

type Plan = {
  usaRegistroExterno: boolean;
  cartera: string;
  contabilidad: string;
  validacion: boolean;
};
type Contratado = (
  plan: Plan | undefined | null,
  item: { requiereCore?: string },
) => boolean;

/** Saca `contratado` del archivo del frontend y la hace ejecutable aqui. */
function traerLaFuncion(): Contratado {
  if (!FRONTEND) {
    throw new Error(
      'No se encontro el frontend. Rutas intentadas:\n  ' + CANDIDATAS.join('\n  '),
    );
  }
  const ruta = join(FRONTEND, 'lib/contratacion.ts');
  const fuente = ts.createSourceFile(
    'contratacion.ts',
    readFileSync(ruta, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  let declaracion: ts.FunctionDeclaration | undefined;
  fuente.forEachChild((nodo) => {
    if (ts.isFunctionDeclaration(nodo) && nodo.name?.text === 'contratado') {
      declaracion = nodo;
    }
  });
  if (!declaracion) {
    throw new Error(
      'No existe `export function contratado` en lib/contratacion.ts. ' +
        'Si se renombro o se movio, actualiza esta prueba: la regla sigue ' +
        'necesitando quien la vigile.',
    );
  }

  // `export` sobrevive al transpilado y `new Function` no lo admite: se quita
  // la palabra, que es lo unico de la declaracion que no es la funcion.
  const texto = declaracion.getText(fuente).replace(/^export\s+/, '');
  const sinTipos = ts.transpileModule(texto, {
    compilerOptions: { target: ts.ScriptTarget.ES2021 },
  }).outputText;

  // Si la funcion dejara de ser pura, esto lanzaria al construirse o al
  // llamarse, y la prueba lo dira con su propio mensaje.
  const fabrica = new Function(`${sinTipos}; return contratado;`) as () => Contratado;
  return fabrica();
}

const SIN_CORE: Plan = {
  usaRegistroExterno: false,
  cartera: 'APAGADO',
  contabilidad: 'APAGADO',
  validacion: false,
};
const CON_CORE: Plan = {
  usaRegistroExterno: true,
  cartera: 'SOMBRA',
  contabilidad: 'ESPEJO',
  validacion: true,
};

describe('los tres modos abren las mismas puertas', () => {
  const contratado = traerLaFuncion();

  it('una pantalla que no pide nada se ve siempre, incluso sin plan', () => {
    // La inmensa mayoria del ERP. Si esto fallara, el ERP entero desapareceria
    // para una empresa que solo contrato el ERP.
    expect(contratado(SIN_CORE, {})).toBe(true);
    expect(contratado(CON_CORE, {})).toBe(true);
    expect(contratado(undefined, {})).toBe(true);
    expect(contratado(null, {})).toBe(true);
  });

  describe('modo SOLO ERP', () => {
    it.each([['cualquiera'], ['cartera'], ['contabilidad'], ['validacion']])(
      'no ve lo que pide %s del core',
      (eje) => {
        expect(contratado(SIN_CORE, { requiereCore: eje })).toBe(false);
      },
    );
  });

  describe('modo ERP + core', () => {
    it.each([['cualquiera'], ['cartera'], ['contabilidad'], ['validacion']])(
      've lo que pide %s del core',
      (eje) => {
        expect(contratado(CON_CORE, { requiereCore: eje })).toBe(true);
      },
    );
  });

  it('cada eje se mira por separado, no en bloque', () => {
    // Un plan a medias es lo normal mientras se enciende la integracion. Si la
    // regla mirara «usaRegistroExterno» para todo, una empresa con la cartera
    // encendida y la contabilidad apagada veria el espejo contable vacio.
    const aMedias: Plan = {
      usaRegistroExterno: true,
      cartera: 'SOMBRA',
      contabilidad: 'APAGADO',
      validacion: false,
    };
    expect(contratado(aMedias, { requiereCore: 'cartera' })).toBe(true);
    expect(contratado(aMedias, { requiereCore: 'contabilidad' })).toBe(false);
    expect(contratado(aMedias, { requiereCore: 'validacion' })).toBe(false);
    expect(contratado(aMedias, { requiereCore: 'cualquiera' })).toBe(true);
  });

  it('mientras no se sabe, se esconde', () => {
    // El caso que mas facil se rompe al refactorizar, y el mas caro: ensenar de
    // mas manda a alguien a una pantalla que va a contestarle que no.
    for (const eje of ['cualquiera', 'cartera', 'contabilidad', 'validacion']) {
      expect(contratado(undefined, { requiereCore: eje })).toBe(false);
      expect(contratado(null, { requiereCore: eje })).toBe(false);
    }
  });

  it('APAGADO es la unica palabra que cierra la puerta', () => {
    // El servidor manda SOMBRA, ESPEJO, AUTORIDAD y APAGADO. Cualquier grado de
    // encendido abre; la prueba lo fija para que anadir un grado nuevo no
    // apague pantallas sin querer.
    for (const grado of ['SOMBRA', 'ESPEJO', 'AUTORIDAD']) {
      expect(contratado({ ...SIN_CORE, cartera: grado }, { requiereCore: 'cartera' })).toBe(true);
    }
    expect(contratado({ ...CON_CORE, cartera: 'APAGADO' }, { requiereCore: 'cartera' })).toBe(false);
  });
});
