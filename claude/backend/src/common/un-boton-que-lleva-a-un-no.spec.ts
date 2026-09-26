import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Un botón que lleva a una negativa
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Con sesión de Gerencia se abrió Hotelería → Reservaciones, se pulsó «Nueva
 * reserva», se buscó el cliente, se eligieron fechas y tipo de habitación, se
 * pulsó «Crear reserva» — y el servidor contestó **403**: ningún rol del
 * sistema tiene concedido crear reservaciones salvo el de Hotelería, que no
 * existe como usuario en esta instalación.
 *
 * El formulario entero, llenado, para llegar a un no.
 *
 * La regla ya existía y ya tenía prueba, pero sólo para los botones del MENÚ
 * —`ModuleAction.accion`, que nació del mismo defecto con «Nueva requisición» y
 * el almacenista—. Los botones que viven DENTRO de una pantalla no pasaban por
 * ahí. Para ésos está `<PuedeCrear>`, que ya se usa en otras pantallas y que
 * aquí faltaba.
 *
 * Y el hueco que deja ocultar: el estado vacío seguía diciendo «crea la primera
 * con "Nueva reserva"» después de esconder ese botón. Se añadió `alternativa`
 * al componente para decir en su lugar quién sí puede hacerlo.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el botón de crear reservaciones siga protegido, que el vacío no mande a
 * pulsar lo que no está, y que el componente conserve la salida `alternativa`,
 * que es lo que hace que ocultar no deje huecos que mienten.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Pantallas · un botón que lleva a una negativa es peor que no tenerlo', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('crear una reservación está detrás del permiso de crearla', () => {
    const pantalla = join(
      FRONTEND,
      'app/dashboard/hoteleria/reservaciones/page.tsx',
    );
    if (!existsSync(pantalla)) return;
    const texto = readFileSync(pantalla, 'utf8');
    expect(texto).toMatch(
      /<PuedeCrear[\s\S]{0,120}ruta="\/hoteleria\/operacion\/reservaciones"/,
    );
    /* Y el vacío no manda a un botón que puede no estar. */
    const i = texto.indexOf('Sin reservaciones');
    expect(i).toBeGreaterThan(-1);
    const bloque = texto.slice(i, i + 800);
    expect(bloque).toMatch(/<PuedeCrear/);
  });

  it('el componente conserva la salida para cuando no hay permiso', () => {
    const componente = join(FRONTEND, 'app/components/ProtectedElement.tsx');
    if (!existsSync(componente)) return;
    const texto = readFileSync(componente, 'utf8');
    expect(texto).toMatch(/alternativa\?/);
    expect(texto).toMatch(/return <>\{alternativa\}<\/>;/);
  });
});

/**
 * ============================================================================
 * Un ejemplo que el sistema rechaza no es un ejemplo
 * ----------------------------------------------------------------------------
 * La pantalla de póliza manual traía tres ejemplos de asientos: «Dr. 610-01
 * Gastos Admin / Cr. 110-01 Caja» y dos más por el estilo. Ninguna de esas
 * cuentas existe en este catálogo —es el del SAT, usa 601.xx y 101, con punto
 * y no con guion—, y dos de los tres eran además imposibles de capturar: Caja
 * y Bancos las lleva un auxiliar y el servidor rechaza la póliza manual contra
 * ellas, con un mensaje que lo explica bien.
 *
 * Un contador que abre la pantalla, lee tres ejemplos con códigos que no
 * encuentra en su catálogo y comprueba que dos no se pueden capturar, deja de
 * creerle al resto de la pantalla.
 * ============================================================================
 */
describe('Pantallas · los ejemplos de la póliza manual se pueden capturar', () => {
  const RAIZ2 = join(__dirname, '..', '..', '..');
  const FRONT2 = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
    .map((nombre) => join(RAIZ2, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

  it('los ejemplos no usan cuentas inventadas ni controladas por un auxiliar', () => {
    if (!FRONT2) return;
    const pantalla = join(FRONT2, 'app/dashboard/finanzas/polizas/nueva/page.tsx');
    if (!existsSync(pantalla)) return;
    const texto = readFileSync(pantalla, 'utf8');
    const i = texto.indexOf('Ejemplos de asientos comunes');
    expect(i).toBeGreaterThan(-1);
    const bloque = texto.slice(i, i + 2200);
    /* Nada de códigos con guion: este catálogo usa punto. */
    expect(bloque).not.toMatch(/\b\d{3}-\d{2}\b/);
    /* Ni Caja ni Bancos, que no admiten póliza manual. */
    expect(bloque).not.toMatch(/Cr\.\s*10[12]/);
    /* Y se dice por qué. */
    expect(bloque).toMatch(/no admiten p[oó]liza manual/i);
  });
});
