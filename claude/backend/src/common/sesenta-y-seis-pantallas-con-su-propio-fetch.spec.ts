import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * 66 pantallas con su propio fetch
 * ----------------------------------------------------------------------------
 * `lib/api.ts` existe con un propósito escrito en su propia cabecera:
 * «Reemplaza los ~242 fetch() sueltos y las 79 copias de tok()/h()». Resuelve
 * en un solo sitio la URL base, el `Authorization`, el 401 → renovar → repetir
 * una vez, el tiempo de espera, y la normalización de los errores de NestJS.
 *
 * Quedaron 66 pantallas que no pasan por ahí. Arman su propio
 * `fetch()` con `localStorage.getItem('syncro_token')`, y eso significa tres
 * cosas concretas:
 *
 *  1. NO renuevan el token antes de salir. `api` llama a `asegurarSesion()`
 *     justo para evitar el 401 en lugar de reaccionar a él —es lo que tumbaba
 *     una venta a medio cobrar—. Estas cincuenta lo reciben.
 *  2. NO reintentan tras renovar. `api` da una segunda oportunidad al 401; sin
 *     ella, un reloj adelantado o un token invalidado del lado de Keycloak se
 *     ve como «no pasó nada».
 *  3. NO llevan las cabeceras que `api` añade. Desde el 28-sep-2026 eso
 *     incluye `X-Suplantar-Usuario`, así que «Ver el ERP como otra persona»
 *     NO surte efecto en ninguna de las cincuenta: se atienden con el rol
 *     real. Una pantalla que se prueba creyendo estar viendo el ERP como
 *     almacenista y en realidad se atiende como administrador devuelve un «sí
 *     funciona» que no vale nada, que es justo el fallo que la suplantación
 *     está pensada para no cometer.
 *
 * Y entre ellas están sitios que deciden dinero: pagos a proveedor,
 * pólizas, declaración de IVA, cobranza, cartera vencida, el punto de venta.
 *
 * ESTA PRUEBA NO LAS ARREGLA —es una barrida mecánica que merece su
 * propio cambio, con el frontend compilando—. Lo que hace es dejarlas
 * inventariadas y que NO CREZCAN: cualquier pantalla nueva que se escriba con
 * su propio `fetch` hace fallar esto y se entera quien la escribió, no quien
 * audite dentro de seis meses.
 *
 * Al arreglar una, se borra de la lista. La prueba también avisa si una de la
 * lista ya no existe o ya no tiene el defecto: una excepción que sobra es
 * ruido, y el ruido es cómo estas listas dejan de leerse.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** El rastro inequívoco: token crudo sacado del almacén del navegador. */
const SENAL = /localStorage\.getItem\(\s*['"]syncro_token['"]\s*\)/;

/**
 * Las que ya estaban así el 28-sep-2026. La lista sólo puede encoger.
 */
const CON_SU_PROPIO_FETCH = [
  'app/components/AsistenteConfiguracion.tsx',
  'app/configuracion-inicial/page.tsx',
  'app/context/PermisosContext.tsx',
  'app/dashboard/almacenes/page.tsx',
  'app/dashboard/auditoria/page.tsx',
  'app/dashboard/catalogos/bancos/page.tsx',
  'app/dashboard/catalogos/estados/page.tsx',
  'app/dashboard/catalogos/formas-pago/page.tsx',
  'app/dashboard/catalogos/paises/page.tsx',
  'app/dashboard/categorias/page.tsx',
  'app/dashboard/clientes/page.tsx',
  'app/dashboard/compras/aprobaciones/page.tsx',
  'app/dashboard/compras/cotizaciones/[id]/pdf/page.tsx',
  'app/dashboard/compras/cotizaciones/page.tsx',
  'app/dashboard/compras/cotizaciones/requisicion/[id]/page.tsx',
  'app/dashboard/compras/ordenes/[id]/page.tsx',
  'app/dashboard/compras/ordenes/[id]/pdf/page.tsx',
  'app/dashboard/compras/ordenes/page.tsx',
  'app/dashboard/compras/pago-proveedores/page.tsx',
  'app/dashboard/compras/requisiciones/[id]/page.tsx',
  'app/dashboard/compras/requisiciones/[id]/pdf/page.tsx',
  'app/dashboard/compras/requisiciones/page.tsx',
  'app/dashboard/creditos/cartera-vencida/page.tsx',
  'app/dashboard/creditos/cobranza/page.tsx',
  'app/dashboard/creditos/creditos/page.tsx',
  'app/dashboard/creditos/cuentas-bancarias/page.tsx',
  'app/dashboard/departamentos/page.tsx',
  'app/dashboard/finanzas/balance-general/page.tsx',
  'app/dashboard/finanzas/balanza/page.tsx',
  'app/dashboard/finanzas/categorias-contables/page.tsx',
  'app/dashboard/finanzas/cuentas-contables/page.tsx',
  'app/dashboard/finanzas/declaracion-iva/page.tsx',
  'app/dashboard/finanzas/estado-resultados/page.tsx',
  'app/dashboard/finanzas/polizas/nueva/page.tsx',
  'app/dashboard/finanzas/polizas/page.tsx',
  'app/dashboard/hoteleria/auditoria/page.tsx',
  'app/dashboard/hoteleria/configuracion/page.tsx',
  'app/dashboard/hoteleria/housekeeping/page.tsx',
  'app/dashboard/hoteleria/rack/page.tsx',
  'app/dashboard/hoteleria/recetas/page.tsx',
  'app/dashboard/hoteleria/reservaciones/page.tsx',
  'app/dashboard/impuestos/page.tsx',
  'app/dashboard/inventario/ajustes/page.tsx',
  'app/dashboard/inventario/importar/page.tsx',
  'app/dashboard/inventario/recepciones/[id]/page.tsx',
  'app/dashboard/inventario/recepciones/page.tsx',
  'app/dashboard/inventario/stock-inicial/page.tsx',
  'app/dashboard/listas-precio/page.tsx',
  'app/dashboard/marcas/page.tsx',
  'app/dashboard/permisos/page.tsx',
  'app/dashboard/productos/[id]/page.tsx',
  'app/dashboard/productos/atributos/page.tsx',
  'app/dashboard/productos/components/ModalFichaProducto.tsx',
  'app/dashboard/productos/page.tsx',
  'app/dashboard/proveedores/page.tsx',
  'app/dashboard/reportes/corte-caja/page.tsx',
  'app/dashboard/reportes/estado-cuenta/page.tsx',
  'app/dashboard/reportes/inventario/page.tsx',
  'app/dashboard/reportes/top-productos/page.tsx',
  'app/dashboard/reportes/ventas/page.tsx',
  'app/dashboard/rpa/curp/page.tsx',
  'app/dashboard/unidades-medida/page.tsx',
  'app/dashboard/usuarios/page.tsx',
  'app/dashboard/ventas/[id]/ticket/page.tsx',
  'app/pos/layout.tsx',
  'app/pos/page.tsx',
];

function archivos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

const describeSiHayFrontend = FRONTEND ? describe : describe.skip;

describeSiHayFrontend('Frontend · toda pantalla nueva pasa por el cliente central', () => {
  const culpables = archivos(join(FRONTEND!, 'app'))
    .filter((ruta) => SENAL.test(readFileSync(ruta, 'utf8')))
    .map((ruta) => ruta.slice(FRONTEND!.length + 1).replace(/\\/g, '/'))
    .sort();

  it('la señal se encuentra (si no, la prueba no mide nada)', () => {
    expect(CON_SU_PROPIO_FETCH.length).toBeGreaterThan(0);
  });

  it('no aparecen pantallas nuevas con su propio fetch', () => {
    const nuevas = culpables.filter((r) => !CON_SU_PROPIO_FETCH.includes(r));
    expect(nuevas).toEqual([]);
  });

  it('las de la lista que ya se arreglaron se quitan de la lista', () => {
    const sobrantes = CON_SU_PROPIO_FETCH.filter((r) => !culpables.includes(r));
    expect(sobrantes).toEqual([]);
  });
});
