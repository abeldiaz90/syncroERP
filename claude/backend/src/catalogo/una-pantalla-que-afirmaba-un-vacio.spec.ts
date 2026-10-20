/**
 * ============================================================================
 * «Aún no hay plantillas» cuando lo que pasó es que no se pudo mirar
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * MEDIDO el 20-oct-2026 entrando a «Atributos y variantes» como Tesorería.
 * Siete roles alcanzan esa pantalla —cobranza, contador, crédito, finanzas,
 * gobierno, rrhh y tesorería— y el servidor les niega su ÚNICA lectura. Lo que
 * veían era esto, en este orden:
 *
 *     «No se pudieron cargar los grupos»              ← parece una avería
 *     «Aún no hay plantillas. Crea la primera abajo»  ← afirma un vacío
 *      [ campo de texto ] [ + ]                       ← e invita a crear
 *     «Precargar plantillas de ejemplo»               ← y otra vez
 *
 * Tres errores encadenados, y el del medio es el que importa: **la pantalla
 * afirmaba que no hay plantillas cuando lo que ocurrió es que no pudo mirar**.
 * Las dos cosas se ven igual en una pantalla vacía y no son la misma. Una
 * lleva a crear la primera; la otra, a pedir un permiso. Quien se cree la
 * primera puede concluir que el catálogo está sin configurar y levantar una
 * incidencia que no existe.
 *
 * Y debajo, dos invitaciones a crear algo que el servidor va a rechazar.
 *
 * LA REGLA: un vacío sólo se afirma cuando se pudo comprobar. Si la lectura se
 * negó, lo honesto es decir que no se sabe, y no ofrecer la acción que sigue.
 * ============================================================================
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/productos/atributos/page.tsx')));

const PANTALLA = FRONTEND
  ? readFileSync(join(FRONTEND, 'app/dashboard/productos/atributos/page.tsx'), 'utf8')
  : '';

describe('una pantalla no afirma un vacío que no pudo comprobar', () => {
  it('encuentra la pantalla, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
    expect(PANTALLA.length).toBeGreaterThan(1000);
  });

  it('el 403 se distingue de un fallo cualquiera', () => {
    /*
     * «No se pudieron cargar» y «no te toca» se cuentan distinto, así que se
     * guardan distinto. Mezclarlos es lo que hacía que una negativa de
     * permisos se leyera como una avería del servidor.
     */
    expect(PANTALLA).toMatch(/if \(res\.status === 403\) \{ setVedada\(true\); setGrupos\(\[\]\); return; \}/);
  });

  it('con la lectura negada, no se dice que no hay nada', () => {
    expect(PANTALLA).toMatch(/vedada \?/);
    expect(PANTALLA).toMatch(/No se puede saber qué plantillas hay/);
    /* Y la afirmación original sigue existiendo para cuando SÍ se pudo mirar. */
    expect(PANTALLA).toMatch(/Aún no hay plantillas/);
  });

  it('y no se ofrece crear lo que el servidor va a rechazar', () => {
    /* Ni el campo con su botón… */
    expect(PANTALLA).toMatch(/className=\{`flex gap-2 \$\{vedada \? 'hidden' : ''\}`\}/);
    /* …ni la precarga de ejemplos. */
    expect(PANTALLA).toMatch(/\{!vedada && \(\s*<button onClick=\{precargarEjemplos\}/);
  });

  it('se dice de quién es, no sólo que no es tuyo', () => {
    /*
     * «No tienes permiso» deja a quien lo lee sin siguiente paso. Decir quién
     * lo administra y dónde se pide convierte el muro en un camino.
     */
    expect(PANTALLA).toMatch(/Las plantillas de atributos no están en tu perfil/);
    expect(PANTALLA).toMatch(/catálogo de productos/);
    expect(PANTALLA).toMatch(/Roles y permisos/);
  });

  it('LA PRUEBA DE LA PRUEBA: el aviso depende del estado, no está escrito a secas', () => {
    /*
     * Si el aviso se pintara siempre, estas pruebas pasarían y la pantalla
     * diría a un administrador que no tiene permiso. Tiene que colgar de
     * `vedada`, que es lo único que distingue los dos casos.
     */
    const bloque = PANTALLA.slice(PANTALLA.indexOf('Las plantillas de atributos no están en tu perfil') - 400);
    expect(bloque.slice(0, 400)).toMatch(/\{vedada && \(/);
  });
});
