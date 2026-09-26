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
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
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

    const consultas = [
      ...texto.matchAll(/api\.get<[^>]*>\(\s*'([^']+)'|api\.get\(\s*'([^']+)'/g),
    ]
      .map((m) => m[1] ?? m[2])
      .filter((r) => r.startsWith('/'))
      /* `/catalogo/productos/buscar` y `/clientes` llevan query, no parámetro. */
      .map((r) => r.replace(/\/$/, ''));

    expect(consultas.length).toBeGreaterThanOrEqual(4);

    const declaradas = new Set(mostrador?.accionesIrrenunciables ?? []);
    const sinDeclarar = [...new Set(consultas)]
      .map((r) => `GET ${r}`)
      .filter((accion) => !declaradas.has(accion));

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
    expect(texto).toMatch(/conPermiso\(api\.get<CuentaContable\[\]>\('\/finanzas\/cuentas-contables'\)\)/);
    expect(texto).toMatch(/no está en tu perfil, así que no hay contra qué registrar/);
  });
});
