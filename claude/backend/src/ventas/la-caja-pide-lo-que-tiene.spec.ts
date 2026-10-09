import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

/**
 * ============================================================================
 * La caja sólo pide lo que el mostrador tiene
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El botón «Cobrar» del punto de venta estaba apagado. Siempre. Con el carrito
 * lleno, con el monto recibido capturado, con la caja seleccionada: apagado, y
 * sin una sola línea en pantalla que dijera por qué.
 *
 * La causa estaba tres pasos atrás. Al abrir, la caja pide cinco cosas, y una
 * de ellas era `GET /catalogo/almacenes`, que pertenece a Inventario y que el
 * mostrador no tiene. La pantalla envuelve esas peticiones en `intentar(..., [])`,
 * que ante un fallo devuelve lista vacía — así que el 403 se convertía en
 * «no hay almacenes», sin almacén no hay venta, y el botón se apagaba.
 *
 * El único rol que puede vender era el único que no podía cerrar una venta
 * desde la pantalla. Por API funcionaba: las pruebas de permisos daban 200
 * porque preguntaban por `POST /ventas`, no por lo que la pantalla necesita
 * ANTES de poder llamarlo.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que todo lo que la caja consulta esté declarado como irrenunciable para el
 * mostrador. Declarado, no heredado: que hoy funcione porque la ruta cae en un
 * módulo que el rol trae es una coincidencia que un veto futuro deshace en
 * silencio, y el síntoma —un botón apagado— no señala a la causa.
 *
 * La prueba lee la pantalla, no una lista escrita a mano: si alguien añade una
 * consulta nueva a la caja y no la declara, esto falla antes que el cajero.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Punto de venta · la caja sólo pide lo que el mostrador tiene', () => {
  const mostrador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'empleado');

  it('el mostrador existe como plantilla', () => {
    expect(mostrador).toBeDefined();
  });

  it('todo lo que la caja consulta está declarado para el mostrador', () => {
    if (!FRONTEND) return;
    const terminal = join(FRONTEND, 'app/pos/terminal.tsx');
    if (!existsSync(terminal)) return;

    const texto = readFileSync(terminal, 'utf8')
      /* Sin comentarios: una ruta citada en una explicación no es una llamada. */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    /*
     * ── El detector no veía las rutas con parámetro ───────────────────────
     * Hasta el 7-oct-2026 sólo leía `api.get('…')` entre comillas simples.
     * Una consulta con parámetro se escribe con acento grave —no hay otra
     * forma—, así que las tres de la caja que lo llevan nunca pasaron por
     * aquí: un control que se creía puesto sobre la mitad de lo que mira.
     *
     * Ahora se leen las dos formas y se comparan normalizadas: una
     * interpolación de la pantalla y un `:loQueSea` de la plantilla son el
     * mismo hueco, y el nombre del parámetro lo decide el controlador.
     */
    const hueco = (r: string) =>
      r.replace(/\$\{[^}]*\}/g, ':_').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':_');

    /*
     * ── Y tampoco veía lo que la caja ESCRIBE ─────────────────────────────
     * Hasta el 9-oct-2026 sólo miraba los `api.get`. Las llamadas que cambian
     * algo —crear el cliente, simular el crédito, cobrar, mandar el ticket a
     * la impresora— quedaban fuera, y son justo las que el cajero no puede
     * suplir de otra manera: una lectura que falla deja un desplegable vacío,
     * una escritura que falla deja la venta sin hacer.
     *
     * Y hay dos detalles de forma que costaron encontrar, los dos del mismo
     * tipo —el detector mirando una escritura más estrecha que la real—:
     *
     *   · el genérico de `api.post<{…}>` ocupa varias líneas en esta pantalla,
     *     así que el `[^>]*` de antes no habría casado ni añadiendo el verbo;
     *   · y una llamada encadenada se parte como `api` + salto + `.post(`, con
     *     lo que un `api\.post` literal no la ve.
     *
     * Por eso el genérico se lee perezoso y a varias líneas, y el punto admite
     * espacios alrededor.
     */
    const llamadas = [
      ...texto.matchAll(
        /api\s*\.\s*(get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*['`]([^'`]+)['`]/g,
      ),
    ]
      .map((m) => ({ verbo: m[1].toUpperCase(), ruta: m[2] }))
      .filter((c) => c.ruta.startsWith('/'))
      /* `/catalogo/productos/buscar` y `/clientes` llevan query, no parámetro. */
      .map((c) => ({ ...c, ruta: c.ruta.replace(/\/$/, '') }));

    /*
     * Un trinquete sobre el propio detector: si una refactorización cambia la
     * forma de llamar y deja de reconocerse, esto baja y la prueba se pone
     * roja, en vez de pasar mirando tres consultas de catorce.
     */
    expect(llamadas.filter((c) => c.verbo === 'GET').length).toBeGreaterThanOrEqual(11);
    expect(llamadas.filter((c) => c.verbo !== 'GET').length).toBeGreaterThanOrEqual(4);

    const declaradas = new Set(
      (mostrador?.accionesIrrenunciables ?? []).map(hueco),
    );
    const sinDeclarar = [
      ...new Set(llamadas.map((c) => hueco(`${c.verbo} ${c.ruta}`))),
    ].filter((accion) => !declaradas.has(accion));

    expect(sinDeclarar.sort()).toEqual([]);
  });

  it('la caja no pide el almacén completo, sino la lista corta', () => {
    /*
     * El caso concreto. `GET /catalogo/almacenes` trae dirección, responsable
     * y configuración de cada bodega: no es del mostrador y no debe volver.
     */
    if (!FRONTEND) return;
    const terminal = join(FRONTEND, 'app/pos/terminal.tsx');
    if (!existsSync(terminal)) return;
    const texto = readFileSync(terminal, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(texto).toContain("'/catalogo/almacenes/para-venta'");
    expect(texto).not.toMatch(/'\/catalogo\/almacenes'/);
  });

  it('cuando la caja no puede vender, la pantalla dice qué le falta', () => {
    /*
     * Un botón apagado sin explicación obliga al cajero a adivinar delante del
     * cliente. Cada condición de `contextoCompleto` —almacén, lista de
     * precios, cuenta de cobro— tiene su propio aviso.
     */
    if (!FRONTEND) return;
    const terminal = join(FRONTEND, 'app/pos/terminal.tsx');
    if (!existsSync(terminal)) return;
    const texto = readFileSync(terminal, 'utf8');
    expect(texto).toMatch(/No hay almac[eé]n disponible para vender/);
    expect(texto).toMatch(/No existe una lista de precios configurada/);
    expect(texto).toMatch(/cuenta de cobro/);
  });

  it('la caja de tesorería distingue «no hay» de «no puedo leerlo»', () => {
    /*
     * La misma familia, otra pantalla. El desplegable de «¿contra qué cuenta se
     * registra?» se llenaba con `.catch(() => [])`: si el catálogo de cuentas
     * contables no se podía leer —es de Contabilidad y esta pantalla también la
     * abre el mostrador— el desplegable salía vacío y la entrada o el retiro
     * manual no se podían registrar, sin una palabra que lo explicara.
     */
    if (!FRONTEND) return;
    const pantalla = join(FRONTEND, 'app/dashboard/tesoreria/caja/page.tsx');
    if (!existsSync(pantalla)) return;
    const texto = readFileSync(pantalla, 'utf8');
    expect(texto).not.toMatch(/cuentas-contables'\)\.catch\(\(\) => \[\]\)/);
    /*
     * Desde el 7-oct la consulta lleva además `soloAfectables`: el catálogo
     * traía las 1083 cuentas del plan, incluidas las 153 de mayor, que el
     * servidor rechaza al asentar. Lo que esta prueba protege no es la forma
     * exacta de la llamada, sino que siga pasando por `conPermiso` —que es lo
     * que distingue «no hay» de «no puedo leerlo»—.
     */
    expect(texto).toMatch(
      /conPermiso\(\s*api\.get<CuentaContable\[\]>\('\/finanzas\/cuentas-contables',\s*\{\s*query:\s*\{\s*soloAfectables:\s*true\s*\},?\s*\}\s*,?\s*\)\s*,?\s*\)/,
    );
    expect(texto).toMatch(/no está en tu perfil, así que no hay contra qué registrar/);
  });
});
