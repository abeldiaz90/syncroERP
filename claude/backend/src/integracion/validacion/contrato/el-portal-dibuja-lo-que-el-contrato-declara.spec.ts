import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { COMPONENTES_SOPORTADOS } from './pantalla-dinamica';

/**
 * ============================================================================
 * EL PORTAL DIBUJA LO QUE EL CONTRATO DECLARA
 * ----------------------------------------------------------------------------
 * DE DONDE SALE
 *
 * De la promesa escrita en la cabecera de `frontend/lib/pantalla-dinamica.ts`:
 * "no se deja a la buena fe: esta prueba compara las dos listas y se pone roja
 * si alguien agrega un componente en un lado y no en el otro". Una promesa de
 * cabecera que nadie ejecuta es exactamente la averia que vuelve: la pantalla
 * contaba dias naturales y el servidor laborables, y las dos copias de la regla
 * se creian de acuerdo porque nadie las habia puesto una al lado de la otra.
 *
 * POR QUE HAY DOS COPIAS
 *
 * El backend no publica sus tipos al navegador. El contrato
 * —`COMPONENTES_SOPORTADOS`, aqui mismo— es quien manda: valida y decide que
 * se acepta. El navegador necesita la lista para pintar, asi que la tiene
 * repetida en `COMPONENTES_QUE_SE_DIBUJAN`. No se separan; se vigilan.
 *
 * LAS TRES MANERAS DE ROMPERSE, Y QUE PASA EN CADA UNA
 *
 *  1. Sobra en el navegador: el contrato RECHAZA un esquema que el portal si
 *     sabia dibujar. Se pierde una pantalla que existia.
 *  2. Falta en el navegador: el contrato ACEPTA el esquema y la pantalla queda
 *     con un hueco donde iba el campo. Peor que el caso 1, porque pasa
 *     inadvertido hasta que alguien mira la pantalla.
 *  3. Esta en las dos listas pero no en `REGISTRO`: mismo hueco del caso 2,
 *     un paso mas adentro. `REGISTRO` es un `Record<ComponenteDibujable, ...>`,
 *     asi que `tsc` ya lo atrapa —pero `tsc` del front no corre en esta suite,
 *     y la promesa de la cabecera habla de este archivo.
 *
 * LA PRUEBA DE LA PRUEBA
 *
 * Esta prueba lee archivos de OTRO proyecto por ruta. Si la ruta deja de
 * resolver —se mueve el front, se renombra la carpeta— lo honesto es ponerse
 * roja, no pasar en verde sin haber comparado nada. De ahi el primer bloque:
 * falla nombrando las rutas que intento.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const CANDIDATAS = ['claude/frontend', 'frontend', '../claude/frontend'].map(
  (nombre) => join(RAIZ, nombre),
);
const FRONTEND = CANDIDATAS.find((ruta) =>
  existsSync(join(ruta, 'lib/pantalla-dinamica.ts')),
);

const RUTA_LISTA = 'lib/pantalla-dinamica.ts';
const RUTA_REGISTRO = 'components/pantalla-dinamica.tsx';

/** Lee el archivo del front o explica por que no pudo. */
function leer(relativa: string): string {
  if (!FRONTEND) {
    throw new Error(
      'No se encontro el frontend. Rutas intentadas:\n  ' +
        CANDIDATAS.join('\n  ') +
        '\nSi el front se movio, actualiza CANDIDATAS; no borres esta prueba.',
    );
  }
  return readFileSync(join(FRONTEND, relativa), 'utf8');
}

function parsear(relativa: string): ts.SourceFile {
  return ts.createSourceFile(
    relativa,
    leer(relativa),
    ts.ScriptTarget.Latest,
    true,
    relativa.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** El inicializador de `export const <nombre> = ...` del archivo dado. */
function inicializadorDe(
  fuente: ts.SourceFile,
  nombre: string,
): ts.Expression {
  let encontrado: ts.Expression | undefined;
  fuente.forEachChild((nodo) => {
    if (!ts.isVariableStatement(nodo)) return;
    for (const dec of nodo.declarationList.declarations) {
      if (ts.isIdentifier(dec.name) && dec.name.text === nombre && dec.initializer) {
        encontrado = dec.initializer;
      }
    }
  });
  if (!encontrado) {
    throw new Error(
      `No existe \`export const ${nombre}\` en ${fuente.fileName}. ` +
        'Si se renombro, actualiza esta prueba; el renombre no es motivo para dejar de comparar.',
    );
  }
  return encontrado;
}

/** Los literales de cadena de un arreglo, en orden. */
function cadenasDelArreglo(expresion: ts.Expression): string[] {
  const nucleo = ts.isAsExpression(expresion) ? expresion.expression : expresion;
  if (!ts.isArrayLiteralExpression(nucleo)) {
    throw new Error('Se esperaba un arreglo literal y no lo es.');
  }
  return nucleo.elements.map((elemento) => {
    if (!ts.isStringLiteral(elemento)) {
      throw new Error(
        'Un elemento de la lista no es un literal de cadena: ' +
          elemento.getText(),
      );
    }
    return elemento.text;
  });
}

/** Las llaves de un objeto literal, con o sin comillas. */
function llavesDelObjeto(expresion: ts.Expression): string[] {
  if (!ts.isObjectLiteralExpression(expresion)) {
    throw new Error('Se esperaba un objeto literal y no lo es.');
  }
  return expresion.properties.map((propiedad) => {
    const nombre = propiedad.name;
    if (!nombre) throw new Error('Propiedad sin nombre en REGISTRO.');
    if (ts.isIdentifier(nombre) || ts.isStringLiteral(nombre)) return nombre.text;
    throw new Error('Llave calculada en REGISTRO: ' + nombre.getText());
  });
}

describe('el portal dibuja lo que el contrato declara', () => {
  it('encuentra el frontend; si no, lo dice en vez de pasar en verde', () => {
    expect(FRONTEND).toBeDefined();
    expect(existsSync(join(FRONTEND as string, RUTA_LISTA))).toBe(true);
    expect(existsSync(join(FRONTEND as string, RUTA_REGISTRO))).toBe(true);
  });

  it('las dos listas dicen exactamente lo mismo', () => {
    const dibuja = cadenasDelArreglo(
      inicializadorDe(parsear(RUTA_LISTA), 'COMPONENTES_QUE_SE_DIBUJAN'),
    );
    const contrato = [...COMPONENTES_SOPORTADOS];

    const sobranEnElFront = dibuja.filter((c) => !contrato.includes(c as never));
    const faltanEnElFront = contrato.filter((c) => !dibuja.includes(c));

    expect({ sobranEnElFront, faltanEnElFront }).toEqual({
      sobranEnElFront: [],
      faltanEnElFront: [],
    });
    expect(dibuja).toEqual(contrato);
  });

  it('ninguna de las dos listas repite un componente', () => {
    const dibuja = cadenasDelArreglo(
      inicializadorDe(parsear(RUTA_LISTA), 'COMPONENTES_QUE_SE_DIBUJAN'),
    );
    expect(new Set(dibuja).size).toBe(dibuja.length);
    expect(new Set(COMPONENTES_SOPORTADOS).size).toBe(
      COMPONENTES_SOPORTADOS.length,
    );
  });

  it('REGISTRO tiene un dibujante por cada componente declarado', () => {
    const llaves = llavesDelObjeto(
      inicializadorDe(parsear(RUTA_REGISTRO), 'REGISTRO'),
    );
    const sinDibujante = COMPONENTES_SOPORTADOS.filter(
      (c) => !llaves.includes(c),
    );
    const dibujanteSinComponente = llaves.filter(
      (k) => !(COMPONENTES_SOPORTADOS as readonly string[]).includes(k),
    );
    expect({ sinDibujante, dibujanteSinComponente }).toEqual({
      sinDibujante: [],
      dibujanteSinComponente: [],
    });
  });

  it('la lista no puede quedar vacia para cumplir la regla', () => {
    // Dos listas vacias son iguales. Sin esto, borrar las dos pondria verde.
    expect(COMPONENTES_SOPORTADOS.length).toBeGreaterThan(10);
    const dibuja = cadenasDelArreglo(
      inicializadorDe(parsear(RUTA_LISTA), 'COMPONENTES_QUE_SE_DIBUJAN'),
    );
    expect(dibuja.length).toBeGreaterThan(10);
    for (const imprescindible of ['texto', 'numero', 'fecha', 'seleccion']) {
      expect(dibuja).toContain(imprescindible);
    }
  });

  it('la cabecera del front sigue nombrando esta prueba', () => {
    // Si alguien quita la promesa, que lo haga a sabiendas de que aqui hay algo.
    expect(leer(RUTA_LISTA)).toContain(
      'el-portal-dibuja-lo-que-el-contrato-declara.spec.ts',
    );
  });
});
