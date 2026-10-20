/**
 * ============================================================================
 * Las pantallas que llamaban a la API por su cuenta
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * MEDIDO el 20-oct-2026: **sesenta y cinco archivos de pantalla** armaban sus
 * peticiones a mano —`fetch` con el token sacado de `localStorage` y la
 * cabecera escrita ahí mismo— en lugar de pasar por `lib/api`. No eran
 * pantallas de segunda: productos, usuarios, proveedores, almacenes,
 * recepciones, stock inicial, compras entero, finanzas entero, hotelería
 * entero, reportes, créditos, permisos y auditoría.
 *
 * Funciona, y pierde las tres cosas que esa capa hace en TODAS las llamadas:
 *
 *  1. LA CABECERA DE «VER EL ERP COMO OTRA PERSONA». La pone `lib/api`; un
 *     `fetch` a mano no la manda. Esas pantallas se atendían con el alcance de
 *     quien mira de verdad. Y lo grave no es que la suplantación no funcione:
 *     es que PARECE que sí, porque la banda naranja sigue arriba diciendo a
 *     quién se está viendo mientras los datos son los del administrador. Quien
 *     revisa permisos ahí saca una conclusión falsa —y se sacó: parte de la
 *     medición de roles del 15-oct está hecha sobre pantallas así—.
 *
 *  2. LA RENOVACIÓN DE LA SESIÓN. `request` empieza por `asegurarSesion()`,
 *     que renueva el token antes de que caduque. Sin ella, a los quince
 *     minutos la pantalla contesta «Error al cargar» y ahí se queda. Estaba
 *     anotado como «la sesión se cae a los ~15 min, sin demostrar que sea
 *     defecto». Ésta es la demostración: no se cae la sesión, se caen esas
 *     pantallas.
 *
 *  3. EL 401 CON SU SEGUNDA OPORTUNIDAD Y EL TIEMPO LÍMITE. A dónde mandar a
 *     quien ya no tiene sesión, y qué hacer con una petición que no vuelve.
 *
 * LO QUE SE HIZO, Y POR QUÉ ASÍ
 *
 * Reescribir sesenta y cinco pantallas a `api.get`/`api.post`, cada una con su
 * manejo de `res.ok`, sus mensajes y sus ramas, son sesenta y cinco
 * oportunidades de cambiar algo más sin querer, y no hay forma de probarlas
 * todas. Así que nació `peticion()`: la misma puerta —sesión, identidad,
 * suplantación, 401, tiempo límite— devolviendo la `Response` en crudo. Cada
 * pantalla cambió UNA palabra y su flujo quedó idéntico.
 *
 * Pasar después de `peticion()` a `api.get` —con sus mensajes normalizados—
 * es una mejora aparte, pantalla por pantalla, que se puede ver.
 * ============================================================================
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'lib/api.ts')));

/**
 * La única pantalla a la que se le permite llamar por su cuenta, y por qué.
 *
 * Se abre ANTES de que exista una sesión: quien llega trae un enlace de
 * invitación y todavía no es nadie. `peticion()` empieza por `asegurarSesion()`,
 * que renovaría una sesión que no hay y acabaría mandando a la puerta de acceso
 * a quien justamente viene a crear su contraseña.
 *
 * Si algún día hiciera falta otra excepción, se escribe aquí con su motivo. Una
 * lista de excepciones que crece sin explicación es una regla que se está
 * desarmando en silencio.
 */
const EXCEPCIONES = ['app/aceptar-invitacion/page.tsx'];

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next') continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) salida.push(...fuentes(p));
    else if (/\.tsx?$/.test(entrada)) salida.push(p);
  }
  return salida;
}

describe('ninguna pantalla llama a la API por su cuenta', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('la puerta existe y lleva lo que tiene que llevar', () => {
    const api = readFileSync(join(FRONTEND!, 'lib/api.ts'), 'utf8');
    expect(api).toMatch(/export async function peticion\(/);
    /* Las tres cosas que se perdían. Si alguna se cae, esto deja de servir. */
    const cuerpo = api.slice(api.indexOf('export async function peticion('));
    expect(cuerpo).toMatch(/await asegurarSesion\(\)/);
    expect(cuerpo).toMatch(/CABECERA_SUPLANTACION/);
    expect(cuerpo).toMatch(/respuesta\.status === 401/);
    expect(cuerpo).toMatch(/controlador\.abort\(\)/);
  });

  it('la identidad la decide la puerta, no quien la cruza', () => {
    /*
     * Las pantallas migradas traen todavía su `Authorization` escrita a mano.
     * Si sus cabeceras se mezclaran AL FINAL, pisarían la de la puerta y la
     * petición saldría con el token que la pantalla leyó, no con el que la
     * sesión acaba de renovar. El orden es la regla.
     */
    const api = readFileSync(join(FRONTEND!, 'lib/api.ts'), 'utf8');
    const cuerpo = api.slice(api.indexOf('export async function peticion('));
    const posHeaders = cuerpo.indexOf('...((headers ?? {})');
    const posAuth = cuerpo.indexOf('Authorization: `Bearer ${jwt}`');
    const posVerComo = cuerpo.indexOf('CABECERA_SUPLANTACION');
    expect(posHeaders).toBeGreaterThan(0);
    expect(posAuth).toBeGreaterThan(posHeaders);
    expect(posVerComo).toBeGreaterThan(posHeaders);
  });

  it('y ninguna pantalla se salta la puerta', () => {
    const sueltas: string[] = [];
    for (const archivo of fuentes(join(FRONTEND!, 'app'))) {
      const relativo = archivo.slice(FRONTEND!.length + 1).replace(/\\/g, '/');
      if (EXCEPCIONES.includes(relativo)) continue;
      const texto = readFileSync(archivo, 'utf8');
      /*
       * Sólo las que salen a la API del ERP. `fetch('/api/…')` de Next, o una
       * descarga de un recurso estático, no tienen nada que ver con esto.
       */
      if (/\bfetch\(\s*`?\$\{(?:api|apiUrl|API_URL|API|BASE_URL)\}/.test(texto)) {
        sueltas.push(relativo);
      }
    }
    expect(sueltas).toEqual([]);
  });

  it('LA PRUEBA DE LA PRUEBA: la excepción declarada sigue siendo una excepción de verdad', () => {
    /*
     * Si alguien «arregla» esta prueba metiendo pantallas en EXCEPCIONES, la
     * lista crece y la regla desaparece sin que nada se ponga rojo. Que la
     * lista sea corta es parte de la regla.
     *
     * Y que el archivo exista: una excepción que apunta a un archivo borrado
     * es una excepción que ya no protege nada y que nadie va a quitar.
     */
    expect(EXCEPCIONES.length).toBeLessThanOrEqual(2);
    for (const e of EXCEPCIONES) {
      expect(existsSync(join(FRONTEND!, e))).toBe(true);
      expect(readFileSync(join(FRONTEND!, e), 'utf8')).toMatch(/ANTES de que exista una sesión/);
    }
  });
});
