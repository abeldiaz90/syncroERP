import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * LA MISMA PREGUNTA, DOS RESPUESTAS, EN LA MISMA PANTALLA
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 6-oct, probando la consola de SUMA con las cuatro empresas de esta
 * instalación. La fila de **EMPRESA B PRUEBA AISLAMIENTO** llevaba la pastilla
 * «nadie puede entrar». Al abrirla, su lista de pendientes decía:
 *
 *     LISTO · Usuario administrador · 1 usuario(s) en el ERP.
 *
 * Las dos cosas en la misma pantalla, a dos centímetros una de otra. La
 * empresa tiene una cuenta, y está **inactiva**.
 *
 * DE DÓNDE VENÍA
 *
 * `listar` cuenta `WHERE u.activo = true` —su comentario lo dice con todas sus
 * letras: «cuántas personas pueden entrar a cada empresa»— y `estado` contaba
 * `find({ where: { empresaId } })`, o sea todas las filas, de baja incluidas.
 * Dos medidas de la misma pregunta, y la que se equivocaba era justamente la
 * del panel que existe para decir qué falta.
 *
 * POR QUÉ NO ERA COSMÉTICO
 *
 * `accionAutomatica` sólo ofrece `DAR_ADMINISTRADOR` cuando el punto está en
 * rojo. Con una cuenta dada de baja, la empresa quedaba **inalcanzable** y la
 * consola escondía el único botón que lo arregla. El operador veía todo en
 * verde y ninguna forma de entrar.
 *
 * Y DE PASO: «NO APLICA» NO ES «LISTO»
 *
 * Los cuatro puntos sólo tenían `listo`, así que a una empresa «sólo ERP» le
 * salían cuatro palomitas verdes cuando sólo se midieron dos: las otras dos
 * decían «No aplica» en el texto y verde en la etiqueta. Un panel que se lee
 * como completo sin haber comprobado la mitad es la misma avería que se
 * persigue en el ERP —un control que se cree puesto—, con el verde de otro.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const servicio = readFileSync(
  join(SRC, 'integracion', 'services', 'alta-empresas.service.ts'),
  'utf8',
);

/** El archivo sin comentarios: aquí se mide código, no explicaciones. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const codigo = sinComentarios(servicio);

/** El cuerpo de un punto de la lista, por su clave. */
function punto(clave: string): string {
  const desde = codigo.indexOf(`clave: '${clave}'`);
  expect(desde).toBeGreaterThan(0);
  const hasta = codigo.indexOf('},', codigo.indexOf('accionAutomatica', desde));
  return codigo.slice(desde, hasta);
}

describe('el punto del administrador cuenta a quien puede entrar', () => {
  it('existe una cuenta de los activos y no se usa el total', () => {
    expect(codigo).toMatch(/const puedenEntrar = cuentas\.filter\(\(u\) => u\.activo\)\.length;/);
  });

  it('el punto se marca con los activos, no con las filas', () => {
    const p = punto('usuarios');
    expect(p).toMatch(/listo: puedenEntrar > 0,/);
    /* En negativo: la forma anterior. Si vuelve, esto se pone rojo. */
    expect(p).not.toMatch(/listo: totalUsuarios > 0,/);
  });

  it('el botón de dar administrador se ofrece cuando nadie puede entrar', () => {
    /*
     * ESTE ES EL QUE IMPORTA. Si la acción vuelve a colgar de `totalUsuarios`,
     * una empresa con todas sus cuentas de baja queda inalcanzable y sin botón,
     * aunque la etiqueta ya diga «falta».
     */
    expect(punto('usuarios')).toMatch(/accionAutomatica: puedenEntrar \? null : 'DAR_ADMINISTRADOR'/);
  });

  it('cuando hay cuentas pero ninguna activa, lo dice con los dos números', () => {
    /*
     * «1 usuario(s)» a secas fue lo que escondió el caso. Decir «hay N
     * cuenta(s), ninguna activa» no se puede leer como «hay administrador».
     */
    const p = punto('usuarios');
    expect(p).toMatch(/ninguna activa/);
    expect(p).toMatch(/totalUsuarios/);
  });

  it('mide lo mismo que la lista de empresas', () => {
    /*
     * LA INVARIANTE DE VERDAD, y la que falló. Las dos pantallas contestan a
     * «¿puede entrar alguien?»: la lista filtrando `u.activo = true` y el
     * detalle filtrando `u.activo`. Si una de las dos deja de filtrar, vuelven
     * a contradecirse y nadie se entera hasta que una empresa queda encerrada.
     */
    expect(codigo).toMatch(/\.where\('u\.activo = true'\)/);
    expect(codigo).toMatch(/cuentas\.filter\(\(u\) => u\.activo\)/);
  });
});

describe('un punto que no aplica no se pinta como comprobado', () => {
  it('los cuatro puntos declaran si aplican', () => {
    for (const clave of ['catalogo', 'usuarios', 'tenant', 'conciliacion']) {
      expect(punto(clave)).toMatch(/aplica:/);
    }
  });

  it('los dos del core aplican sólo si la empresa contrató el core', () => {
    expect(punto('tenant')).toMatch(/aplica: usaFineract,/);
    expect(punto('conciliacion')).toMatch(/aplica: usaFineract,/);
  });

  it('los dos del ERP aplican siempre', () => {
    expect(punto('catalogo')).toMatch(/aplica: true,/);
    expect(punto('usuarios')).toMatch(/aplica: true,/);
  });
});

describe('y la consola lo pinta en neutro', () => {
  const RAIZ = join(SRC, '..', '..', '..', '..');
  const CONSOLA = ['suma-consola', '../suma-consola']
    .map((n) => join(RAIZ, n))
    .find((r) => existsSync(join(r, 'app/_componentes/consola.tsx')));

  it('encuentra el árbol de la consola, o truena', () => {
    expect(CONSOLA).toBeDefined();
  });

  it('hay un tercer estado y no es verde', () => {
    const tsx = readFileSync(join(CONSOLA!, 'app/_componentes/consola.tsx'), 'utf8');
    expect(tsx).toMatch(/p\.aplica === false \? 'et-no-aplica'/);
    expect(tsx).toMatch(/p\.aplica === false \? 'no aplica'/);

    const css = readFileSync(join(CONSOLA!, 'app/globals.css'), 'utf8');
    const regla = css.match(/\.et-no-aplica \{[^}]*\}/)?.[0] ?? '';
    expect(regla).toBeTruthy();
    /* Ni el verde de «listo» ni el ámbar de «falta»: los dos significan otra cosa. */
    expect(regla).not.toMatch(/--ok|--alerta|--error/);
  });

  it('un servidor que no manda `aplica` se comporta como antes', () => {
    /*
     * La consola y el ERP se despliegan por separado. `aplica === false` (y no
     * `!p.aplica`) deja que un servidor viejo, que no manda el campo, siga
     * pintando listo/falta en vez de marcar todo como «no aplica».
     */
    const tsx = readFileSync(join(CONSOLA!, 'app/_componentes/consola.tsx'), 'utf8');
    expect(tsx).toMatch(/aplica\?: boolean;/);
    expect(tsx).not.toMatch(/\{!p\.aplica \?/);
  });

  it('no se aconseja una acción sobre un punto que no aplica', () => {
    const tsx = readFileSync(join(CONSOLA!, 'app/_componentes/consola.tsx'), 'utf8');
    expect(tsx).toMatch(/p\.aplica !== false && !p\.listo && p\.accion/);
  });
});
