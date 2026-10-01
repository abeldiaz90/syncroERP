/**
 * ============================================================================
 * Un vacío que afirmaba sobre el mundo
 * ----------------------------------------------------------------------------
 * Tres pantallas distintas decían que no había nada cuando sólo sabían que SU
 * consulta no devolvió nada. Medido el 30-sep-2026, recorriendo el ciclo de
 * compras con cada rol:
 *
 *   · Cotizaciones (contador)   «El área de compras está al día»
 *                               — había una requisición esperando.
 *   · Requisiciones (contador)  «Sin requisiciones · Crea tu primera»
 *                               — había 12 en la empresa.
 *   · Recepciones (almacenista) «No hay entregas pendientes · Todo está al día»
 *                               — había tres órdenes a un paso.
 *
 * Ninguna causaba daño y las tres eran el mismo tic. Y tenían dos causas
 * distintas, que se arreglan distinto:
 *
 *  1. UN RECORTE INVISIBLE. `obtenerTodas` devuelve sólo las requisiciones de
 *     quien pregunta salvo que sea Compras o administrador. La regla es
 *     correcta; lo que fallaba es que viajaba escondida, así que la pantalla
 *     no podía distinguir «no hay» de «no tienes». Ahora el servidor lo dice
 *     en la cabecera `X-Alcance` y la pantalla repite eso.
 *
 *  2. FILTROS PROPIOS. Recepciones apila el filtro logístico, la pestaña y la
 *     búsqueda sobre una lista que sí recibió entera. Ahí no hace falta que
 *     nadie le diga nada: le basta con contar lo que ella misma escondió.
 *
 * La regla que queda escrita: **un estado vacío dice qué miró, no qué hay.**
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { alcanceDeRequisiciones } from './services/requisiciones.service';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const leer = (relativa: string): string | null => {
  if (!FRONTEND) return null;
  const ruta = join(FRONTEND, relativa);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
};

const REQUISICIONES = leer('app/dashboard/compras/requisiciones/page.tsx');
const COTIZACIONES = leer('app/dashboard/compras/cotizaciones/page.tsx');
const RECEPCIONES = leer('app/dashboard/inventario/recepciones/page.tsx');

describe('El servidor dice cuánto listado devolvió', () => {
  it('Compras y el administrador ven la empresa entera', () => {
    expect(alcanceDeRequisiciones('comprador')).toBe('todas');
    expect(alcanceDeRequisiciones('COMPRAS')).toBe('todas');
    expect(alcanceDeRequisiciones('administrador')).toBe('todas');
    expect(alcanceDeRequisiciones('super-admin')).toBe('todas');
  });

  it('los demás ven lo suyo y lo que firmaron, no la empresa entera', () => {
    expect(alcanceDeRequisiciones('contador')).toBe('propias-y-firmadas');
    expect(alcanceDeRequisiciones('almacenista')).toBe('propias-y-firmadas');
    expect(alcanceDeRequisiciones('gerencia')).toBe('propias-y-firmadas');
    expect(alcanceDeRequisiciones('empleado')).toBe('propias-y-firmadas');
  });

  it('gerencia NO recibe el listado completo por ser quien firma', () => {
    /*
     * El arreglo de «quien firma también mira» tenía una salida fácil y mala:
     * dar 'todas' a gerencia y dirección. Eso concede las requisiciones de
     * áreas que esa persona no firma, y encima obliga a mantener a mano una
     * lista de roles aprobadores que la matriz de aprobación ya define. Se
     * resuelve con el dato, no con el rol.
     */
    expect(alcanceDeRequisiciones('gerencia')).not.toBe('todas');
    expect(alcanceDeRequisiciones('direccion')).not.toBe('todas');
  });

  it('sin rol se asume lo más estrecho, no lo más ancho', () => {
    expect(alcanceDeRequisiciones(undefined)).toBe('propias-y-firmadas');
    expect(alcanceDeRequisiciones('')).toBe('propias-y-firmadas');
  });

  it('el alcance y el recorte de la consulta salen de la MISMA función', () => {
    /*
     * Si el controlador anuncia un alcance y el servicio aplica otro, la
     * pantalla dice una cosa y los datos son otra: es peor que el silencio.
     */
    const servicio = readFileSync(
      join(__dirname, 'services', 'requisiciones.service.ts'),
      'utf8',
    );
    expect(servicio).toMatch(
      /if \(alcanceDeRequisiciones\(rol\) !== 'todas' && usuarioId\) \{/,
    );
    /*
     * Y el recorte acotado incluye lo firmado. Medido el 1-oct-2026: gerencia
     * autorizó una requisición de $84,400 y al entrar al listado leyó «No
     * tienes requisiciones a tu nombre». Quien pone la firma que compromete
     * el dinero tiene que poder volver a ver en qué acabó.
     */
    expect(servicio).toMatch(/this\.aprobacionRepo\.find\(\{\s*where: \{ usuarioId \}/);
    expect(servicio).toMatch(/\{ empresaId, id: In\(ids\) \}/);
    expect(servicio).toMatch(/\{ empresaId, usuarioSolicitanteId: usuarioId \}/);
    /* Y la regla no está escrita dos veces en el servicio. */
    const vecesQueSeDecide = servicio.match(/'COMPRADOR', 'COMPRAS'/g) ?? [];
    expect(vecesQueSeDecide.length).toBeLessThanOrEqual(3);
  });

  it('el controlador publica la cabecera, y la expone para el navegador', () => {
    const controlador = readFileSync(
      join(__dirname, 'controllers', 'requisiciones.controller.ts'),
      'utf8',
    );
    expect(controlador).toMatch(
      /setHeader\('X-Alcance', alcanceDeRequisiciones\(usuario\.rol\)\)/,
    );
    expect(controlador).toMatch(
      /Access-Control-Expose-Headers', 'X-Alcance'/,
    );
  });
});

describe('Ninguna de las tres pantallas concluye sobre el mundo', () => {
  it('«El área de compras está al día» ya no se afirma', () => {
    if (!COTIZACIONES) return;
    const sinComentarios = COTIZACIONES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sinComentarios).not.toMatch(/El área de compras está al día/);
  });

  it('«Todo está al día» ya no se afirma en recepciones', () => {
    if (!RECEPCIONES) return;
    const sinComentarios = RECEPCIONES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sinComentarios).not.toMatch(/Todo está al día/);
  });

  it('«Crea tu primera requisición» sólo se dice si se vieron todas', () => {
    if (!REQUISICIONES) return;
    const sinComentarios = REQUISICIONES.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sinComentarios).not.toMatch(/'Crea tu primera requisición'/);
    expect(sinComentarios).toMatch(/alcance === 'propias-y-firmadas'/);
    expect(sinComentarios).toMatch(/No tienes requisiciones a tu nombre/);
    /* Y el texto ya no promete menos de lo que la consulta trae. */
    expect(sinComentarios).toMatch(/las que te tocó firmar/);
  });

  it('las dos pantallas que consultan requisiciones leen la cabecera', () => {
    for (const pantalla of [REQUISICIONES, COTIZACIONES]) {
      if (!pantalla) continue;
      expect(pantalla).toMatch(/res\.headers\.get\('X-Alcance'\)/);
      /* Una cabecera ausente no se interpreta como «todas». */
      expect(pantalla).toMatch(
        /cabecera === 'todas' \|\| cabecera === 'propias-y-firmadas'/,
      );
      expect(pantalla).toMatch(/: null,?\s*\)/);
    }
  });
});

describe('Recepciones cuenta lo que ella misma escondió', () => {
  it('sabe cuántas órdenes hay y cuántas no ha despachado Compras', () => {
    if (!RECEPCIONES) return;
    expect(RECEPCIONES).toMatch(/setTotalOrdenes\(data\.length\)/);
    expect(RECEPCIONES).toMatch(
      /setSinDespachar\(\s*\n?\s*data\.filter\(\(oc: IOrdenCompra\) => !ESTADOS_LOGISTICOS\.includes\(oc\.estado\)\)\.length,/,
    );
  });

  it('y lo dice en el vacío, en lugar de declarar el día cerrado', () => {
    if (!RECEPCIONES) return;
    expect(RECEPCIONES).toMatch(/todavía no la despacha Compras/);
    expect(RECEPCIONES).toMatch(/fuera de esta bandeja/);
  });

  it('una consulta que falló ya no se lee como una bandeja vacía', () => {
    if (!RECEPCIONES) return;
    expect(RECEPCIONES).toMatch(/Tu perfil no incluye la consulta de órdenes de compra/);
    expect(RECEPCIONES).toMatch(/La bandeja no está vacía: no se pudo consultar/);
    /* Y el error se pregunta ANTES que el vacío, o nunca se vería. */
    const iError = RECEPCIONES.indexOf('errorCarga ? (');
    const iVacio = RECEPCIONES.indexOf('recepcionesFiltradas.length === 0 ? (');
    expect(iError).toBeGreaterThan(-1);
    expect(iError).toBeLessThan(iVacio);
  });

  it('un filtro que escondió renglones ofrece quitarse', () => {
    if (!REQUISICIONES) return;
    expect(REQUISICIONES).toMatch(/Quitar el filtro y ver las \{requisiciones\.length\}/);
  });
});
