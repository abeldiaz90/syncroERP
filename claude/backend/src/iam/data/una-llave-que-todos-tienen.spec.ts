import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { ENDPOINTS_NAVEGABLES } from './endpoints-navegables';

/**
 * ============================================================================
 * Una pantalla no se abre con una llave que todos tienen
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Con la sesión de Cobranza, `/configuracion-financiera` —el asistente maestro
 * financiero, donde se fija la fecha desde la que se controla la contabilidad
 * y se confirman los saldos iniciales— abría. Y lo primero que enseñaba era
 * «Tu perfil no incluye esta acción».
 *
 * La puerta la daba `GET /finanzas/activacion/acceso`, que lleva
 * `@SkipPermisos()`: no pasa por la tabla de permisos, así que nadie puede no
 * tenerlo. Como el permiso de PANTALLA se arma con las `rutaFrontend` de los
 * endpoints navegables, esa pantalla quedó en el perfil de los trece roles. Lo
 * que el asistente consulta al abrir es otra cosa —`GET /finanzas/activacion`—
 * y eso sí se niega.
 *
 * El resultado es el patrón de siempre visto del revés: un enlace que lleva a
 * un «no». Y en una pantalla de configuración contable, además, invita a
 * trastear a quien no le toca.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ninguna pantalla se conceda a través de un endpoint `@SkipPermisos()`.
 * Esos endpoints existen para preguntas que el sistema se hace a sí mismo
 * —¿hay sesión?, ¿está activada la empresa?—, no para decidir quién entra.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

function controladores(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) controladores(ruta, acumulado);
    else if (nombre.endsWith('.controller.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

const VERBOS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;

/** `GET /finanzas/activacion/acceso` para cada método con `@SkipPermisos()`. */
function accionesSinPermiso(): string[] {
  const acciones: string[] = [];
  for (const archivo of controladores(SRC)) {
    const texto = readFileSync(archivo, 'utf8');
    const prefijo = /@Controller\(\s*'([^']*)'/.exec(texto)?.[1] ?? '';
    const lineas = texto.split('\n');
    lineas.forEach((linea, i) => {
      if (!/@SkipPermisos\(\)/.test(linea)) return;
      /*
       * El decorador puede ir encima o debajo del verbo: se mira una ventana
       * corta a ambos lados y se toma el verbo más cercano.
       */
      const ventana = lineas.slice(Math.max(0, i - 4), i + 5);
      for (const l of ventana) {
        for (const verbo of VERBOS) {
          const m = new RegExp(`@${verbo}\\(\\s*(?:'([^']*)')?\\s*\\)`).exec(l);
          if (!m) continue;
          const sufijo = m[1] ?? '';
          const ruta = ['', prefijo, sufijo]
            .filter((p) => p !== '')
            .join('/')
            .replace(/\/+/g, '/')
            .replace(/\/$/, '');
          acciones.push(
            `${verbo.toUpperCase()} ${ruta.startsWith('/') ? ruta : '/' + ruta}`,
          );
        }
      }
    });
  }
  return [...new Set(acciones)];
}

/*
 * Las excepciones, una por una y con su motivo. Son catálogos de referencia
 * —bancos y formas de pago del SAT, países y estados, atributos por sector—
 * que cualquiera consulta y que nadie edita sin permiso: sus botones de alta
 * y edición van envueltos en `<PuedeCrear>` / `<PuedeEditar>`, comprobado. Que
 * estén en el menú de todos los roles es deliberado.
 *
 * Añadir algo a esta lista es una decisión, no un trámite: significa que la
 * pantalla la verán los trece roles.
 */
const PANTALLAS_DE_CONSULTA_ABIERTA = [
  'GET /catalogo/productos/atributos/:sector',
  'GET /catalogos/bancos',
  'GET /catalogos/estados',
  'GET /catalogos/formas-pago',
  'GET /catalogos/paises',
];

describe('Coherencia · una pantalla no se abre con una llave que todos tienen', () => {
  const abiertas = accionesSinPermiso();

  it('hay endpoints marcados @SkipPermisos (si no, la prueba no mide nada)', () => {
    expect(abiertas.length).toBeGreaterThan(0);
  });

  it('ninguna pantalla se concede con un endpoint @SkipPermisos', () => {
    const culpables = Object.keys(ENDPOINTS_NAVEGABLES).filter(
      (accion) =>
        abiertas.includes(accion) &&
        !PANTALLAS_DE_CONSULTA_ABIERTA.includes(accion),
    );
    expect(culpables.sort()).toEqual([]);
  });

  it('las excepciones siguen siendo excepciones de verdad', () => {
    /* Si una deja de ser abierta, sobra de la lista y hay que quitarla. */
    const sobrantes = PANTALLAS_DE_CONSULTA_ABIERTA.filter(
      (a) => !abiertas.includes(a),
    );
    expect(sobrantes).toEqual([]);
  });

  it('el asistente financiero se concede con lo que consulta', () => {
    expect(ENDPOINTS_NAVEGABLES['GET /finanzas/activacion']?.rutaFrontend).toBe(
      '/configuracion-financiera',
    );
    expect(
      ENDPOINTS_NAVEGABLES['GET /finanzas/activacion/acceso'],
    ).toBeUndefined();
  });
});
