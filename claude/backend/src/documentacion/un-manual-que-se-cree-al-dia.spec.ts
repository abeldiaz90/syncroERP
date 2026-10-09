import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

/**
 * ============================================================================
 * Un manual que se cree al dia
 * ----------------------------------------------------------------------------
 * QUE PASO
 *
 * `03-manual-por-rol.md` abre diciendo que el alcance de cada rol esta «medido
 * contra el sistema corriendo, no copiado de un diseno». Lo estaba: el 28 de
 * septiembre. Diez dias despues seguia con los mismos numeros, y en esos diez
 * dias se repartieron permisos nuevos —la doble firma, el mostrador, el
 * gobierno de aprobaciones—.
 *
 * Un manual desactualizado no se lee como viejo: se lee como la verdad. Quien
 * capacita ensena esa tabla, y quien configura permisos la usa para decidir. La
 * promesa de «medido» es justo lo que lo vuelve peligroso cuando deja de serlo.
 *
 * Es la familia de «un control que se cree puesto», aplicada a la
 * documentacion: algo que afirma estar medido y hace diez dias que no se mide.
 *
 * QUE CUIDA ESTA PRUEBA
 *
 * Que la tabla de alcance del manual diga lo que dicen las plantillas. No
 * comprueba la redaccion ni el resto del documento: comprueba el unico numero
 * que el manual promete haber medido. Si alguien cambia un permiso y no toca la
 * tabla, esto se pone rojo antes de que el manual mienta.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const CANDIDATOS = [
  join(RAIZ, 'docs'),
  join(RAIZ, '..', 'docs'),
  join(__dirname, '..', '..', '..', 'docs'),
];
const CARPETA = CANDIDATOS.find((c) => existsSync(join(c, '03-manual-por-rol.md')));

/** El nombre del rol tal como se escribe en el manual, con acentos. */
const COMO_SE_ESCRIBE: Record<string, string> = {
  direccion: 'direcci\u00f3n',
  gerencia: 'gerencia',
  finanzas: 'finanzas',
  contador: 'contador',
  tesoreria: 'tesorer\u00eda',
  empleado: 'empleado',
  hoteleria: 'hoteler\u00eda',
  credito: 'cr\u00e9dito',
  cobranza: 'cobranza',
  comprador: 'comprador',
  almacenista: 'almacenista',
  rrhh: 'rrhh',
  gobierno: 'gobierno',
};

describe('Documentacion · el manual por rol dice lo que dicen las plantillas', () => {
  if (!CARPETA) {
    it('sin la carpeta de documentos, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const manual = readFileSync(join(CARPETA, '03-manual-por-rol.md'), 'utf8');

  it('el manual es el que creo que es', () => {
    expect(manual).toMatch(/## Lo que cada rol alcanza, medido/);
    expect(manual).toMatch(/\| Rol \| Escribe \| Consulta \| Total \|/);
  });

  it('cada rol del catalogo esta en la tabla, y ninguno de mas', () => {
    /*
     * El fallo que esto caza primero: la tabla del 28-sep omitia a empleado,
     * hoteleria y direccion. Tres puestos que existen y que quien capacita no
     * encontraba.
     */
    const enLaTabla = [...manual.matchAll(/^\| ([a-z\u00e1-\u00fa]+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)].map(
      (m) => m[1],
    );
    const esperados = PLANTILLAS_PERMISOS.map((p) => COMO_SE_ESCRIBE[p.rol] ?? p.rol);
    expect(enLaTabla.sort()).toEqual(esperados.sort());
  });

  it('los numeros son los de la plantilla', () => {
    const desajustes: string[] = [];
    for (const plantilla of PLANTILLAS_PERMISOS) {
      const nombre = COMO_SE_ESCRIBE[plantilla.rol] ?? plantilla.rol;
      const escribe = (plantilla.modulos ?? []).length;
      const consulta = (plantilla.modulosConsulta ?? []).length;

      const fila = new RegExp(`^\\| ${nombre} \\| (\\d+) \\| (\\d+) \\| (\\d+) \\|$`, 'm').exec(
        manual,
      );
      if (!fila) {
        desajustes.push(`${nombre}: no esta en la tabla`);
        continue;
      }
      const dice = [Number(fila[1]), Number(fila[2]), Number(fila[3])];
      const es = [escribe, consulta, escribe + consulta];
      if (JSON.stringify(dice) !== JSON.stringify(es)) {
        desajustes.push(`${nombre}: el manual dice ${dice.join('/')} y la plantilla da ${es.join('/')}`);
      }
    }
    expect(desajustes.sort()).toEqual([]);
  });

  it('y la suma total del catalogo tambien', () => {
    /*
     * «De 24 modulos en el catalogo». Si manana son 26, la frase pasa a ser
     * falsa sin que nadie la toque.
     */
    const dicho = /De (\d+) m\u00f3dulos en el cat\u00e1logo/.exec(manual);
    expect(dicho).not.toBeNull();

    const catalogo = readFileSync(
      join(__dirname, '..', 'iam', 'data', 'modulos-catalogo.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const cuantos = new Set(
      [...catalogo.matchAll(/^\s*id:\s*'([a-z-]+)'/gm)].map((m) => m[1]),
    ).size;
    expect(Number(dicho![1])).toBe(cuantos);
  });

  it('el manual nombra la herramienta de ver el ERP como otro, y su interruptor', () => {
    /*
     * Quien capacita la necesita —es como se ensena un puesto sin pedir su
     * contrasena— y quien instala necesita saber que en produccion se apaga.
     * El manual no la mencionaba.
     */
    expect(manual).toMatch(/Ver el ERP como otra persona/);
    expect(manual).toMatch(/SUPLANTACION_HABILITADA/);
    /* Y lo que mas importa de esa herramienta: a nombre de quien queda. */
    expect(manual).toMatch(/queda registrado a nombre de esa persona/i);
  });
});
