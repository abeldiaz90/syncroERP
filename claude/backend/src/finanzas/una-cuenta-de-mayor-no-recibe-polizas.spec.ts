/**
 * ============================================================================
 * Una cuenta de mayor no recibe pólizas, así que no se ofrece
 * ----------------------------------------------------------------------------
 * EL CASO, medido en vivo el 7-oct-2026
 *
 * El plan contable de esta instalación tiene 1083 cuentas. De ellas, **153 son
 * cuentas de MAYOR** (`esAfectable: false`): «100 · Activo», «101 · Caja»,
 * «600 · Gastos». Agrupan a sus hijas y no se les asienta nada;
 * `polizas.service` lo rechaza, y con razón.
 *
 * Tres pantallas que eligen la cuenta contra la que se registra un movimiento
 * las ofrecían TODAS en su desplegable:
 *
 *   · Caja, corte y arqueo — entrada o retiro manual
 *   · Tesorería — movimientos
 *   · Finanzas — póliza nueva
 *
 * El único filtro que aplicaban era `permiteMovimientoManual !== false`, y las
 * 153 lo pasan: ninguna quedaba fuera. Elegir cualquiera de ellas era elegir un
 * rechazo del servidor después de capturar el importe, el concepto y la
 * referencia. Un botón que lleva a un no.
 *
 * Y LA PIEZA BUENA YA EXISTÍA
 *
 * `GET /finanzas/cuentas-contables?soloAfectables=true` hace exactamente esa
 * distinción —y además descarta las inactivas—. Cuatro pantallas ya se lo
 * pedían; estas tres, no. El camino real no usaba la pieza buena.
 *
 * Esta prueba barre el árbol vivo: toda pantalla que lea ese catálogo pide
 * `soloAfectables`, salvo las que tienen una razón escrita para no hacerlo.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/**
 * Las dos excepciones, con su motivo. No es una lista para ir engordando: una
 * pantalla que elige una cuenta para asentar algo no pertenece aquí.
 */
const CON_MOTIVO = new Map<string, string>([
  [
    'app/dashboard/finanzas/cuentas-contables/page.tsx',
    'Es el catálogo mismo: administra las cuentas de mayor, así que tiene que verlas.',
  ],
  [
    'app/dashboard/finanzas/saldos-iniciales/page.tsx',
    'Filtra `c.activo && c.esAfectable` en el cliente, y además necesita ver la cuenta puente para excluirla por número.',
  ],
]);

function archivos(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acc);
    else if (/\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

describe('Quien elige una cuenta para asentar algo sólo ve cuentas de detalle', () => {
  const hay = Boolean(FRONTEND);

  it('el árbol que se mide es el que está vivo', () => {
    // Sin esto, un árbol que no se resuelve dejaría la prueba de abajo midiendo cero.
    expect(hay).toBe(true);
  });

  const todos = hay ? archivos(join(FRONTEND!, 'app')) : [];
  const rel = (ruta: string) => relative(FRONTEND!, ruta).split(sep).join('/');
  const llaman = todos.filter((ruta) =>
    readFileSync(ruta, 'utf8').includes('/finanzas/cuentas-contables'),
  );

  it('el barrido encuentra de verdad las pantallas que leen el catálogo', () => {
    /*
     * La prueba de la prueba. Si el endpoint se renombra o el árbol se mueve,
     * `llaman` queda vacío y todo lo de abajo pasaría sin medir nada.
     */
    expect(llaman.length).toBeGreaterThanOrEqual(8);
    for (const esperada of CON_MOTIVO.keys()) {
      expect(llaman.map(rel)).toContain(esperada);
    }
  });

  it('todas piden soloAfectables, salvo las dos que tienen motivo escrito', () => {
    const sinFiltro: string[] = [];
    for (const ruta of llaman) {
      const nombre = rel(ruta);
      if (CON_MOTIVO.has(nombre)) continue;
      const texto = readFileSync(ruta, 'utf8');
      // Sólo las líneas que de verdad llaman al catálogo; una ruta de menú no cuenta.
      const lineas = texto
        .split('\n')
        .filter((l) => /\/finanzas\/cuentas-contables/.test(l))
        .filter((l) => /api\.get|fetch\(/.test(l));
      if (!lineas.length) continue;
      if (!/soloAfectables/.test(texto)) sinFiltro.push(nombre);
    }
    expect(sinFiltro).toEqual([]);
  });

  it('y el servidor sigue sabiendo hacer la distinción que la pantalla le pide', () => {
    /*
     * La pantalla delega en el servidor. Si alguien quitara el parámetro del
     * controlador, las tres pantallas volverían a ofrecer las 153 sin que
     * ninguna prueba de frontend se enterara.
     */
    const servicio = readFileSync(
      join(__dirname, 'services', 'cuentas-contables.service.ts'),
      'utf8',
    );
    expect(servicio).toMatch(/if \(soloAfectables\) whereClause\.esAfectable = true;/);
    // Y que `activo: true` siga ahí: una cuenta dada de baja tampoco recibe nada.
    expect(servicio).toMatch(/whereClause: any = \{ empresaId, activo: true \}/);

    const controlador = readFileSync(
      join(__dirname, 'controllers', 'cuentas-contables.controller.ts'),
      'utf8',
    );
    expect(controlador).toMatch(/@Query\('soloAfectables'\)/);
    expect(controlador).toMatch(/soloAfectables === 'true'/);
  });

  it('y la póliza sigue rechazando una cuenta de mayor, por si una pantalla se cuela', () => {
    /*
     * El filtro de la pantalla es cortesía; esto es el control. Las dos capas
     * se fijan juntas: quitar una «porque la otra ya lo mira» no es inocente.
     */
    const polizas = readFileSync(join(__dirname, 'services', 'polizas.service.ts'), 'utf8');
    expect(polizas).toMatch(/const noAfectables = cuentas\.filter\(\(c\) => c\.esAfectable === false\);/);
  });
});
