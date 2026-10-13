/**
 * ============================================================================
 * Una pieza escrita que nadie llamaba
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 13-oct, probando vacaciones contra el sistema corriendo. La pantalla decía
 * «40 días naturales seleccionados» y, al enviar, el servidor contestaba
 * «Saldo insuficiente. Disponibles: 14; solicitados: 34». Los 34 no aparecían
 * en ninguna parte antes de pulsar: el usuario descubría el número que de
 * verdad importa al chocar contra la negativa.
 *
 * Al abrir el servicio estaba `explicarDiasLaborables`, entero, con pruebas de
 * borde y un comentario que describía ESTE MISMO problema:
 *
 *   «La pantalla decía “5 días naturales seleccionados” y el servidor
 *    contestaba “4 laborables”, sin decir cuál se había caído ni por qué.»
 *
 * Y no tenía ruta. Ni quien la llamara. La pieza buena existía y el camino real
 * no la usaba — el patrón de la casa, otra vez.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 *  1. Que la ruta exista y llame a esa función, y no a una copia nueva.
 *  2. Que esté registrada ANTES de `vacaciones/saldo/:empleadoId`: Nest
 *     resuelve por orden de registro y una ruta literal detrás de una
 *     paramétrica no se alcanza jamás —«dias-laborables» se leería como un
 *     `empleadoId`—. Esto ya pasó en compras con `por-pagar`.
 *  3. Que la pantalla la llame de verdad. Volver a dejarla sin llamar sería
 *     reponer el defecto entero sin tocar el servidor.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const CONTROLADOR = readFileSync(
  join(__dirname, 'controllers/rrhh.controller.ts'),
  'utf8',
);
const SERVICIO = readFileSync(join(__dirname, 'services/rrhh.service.ts'), 'utf8');

describe('el desglose de días laborables llega a la pantalla', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('la función sigue existiendo con ese nombre', () => {
    expect(SERVICIO).toContain('async explicarDiasLaborables(');
  });

  it('hay una ruta que la expone', () => {
    expect(CONTROLADOR).toContain("@Get('vacaciones/dias-laborables')");
    expect(CONTROLADOR).toContain('this.svc.explicarDiasLaborables(');
  });

  it('la ruta literal va ANTES de la paramétrica que se la comería', () => {
    const literal = CONTROLADOR.indexOf("@Get('vacaciones/dias-laborables')");
    const parametrica = CONTROLADOR.indexOf("@Get('vacaciones/saldo/:empleadoId')");
    expect(literal).toBeGreaterThan(-1);
    expect(parametrica).toBeGreaterThan(-1);
    expect(literal).toBeLessThan(parametrica);
  });

  it('la ruta se niega sin fechas, y con un rango al revés', () => {
    /* No se prueba el cuerpo entero: se prueba que las tres guardas estén. */
    expect(CONTROLADOR).toContain('Faltan las fechas: desde y hasta.');
    expect(CONTROLADOR).toContain('Las fechas no son válidas.');
    expect(CONTROLADOR).toContain(
      'La fecha final no puede ser anterior a la inicial.',
    );
  });

  it('la pantalla de vacaciones la llama', () => {
    const pantalla = readFileSync(
      join(FRONTEND!, 'app/dashboard/rrhh/vacaciones/page.tsx'),
      'utf8',
    );
    expect(pantalla).toContain('/rrhh/vacaciones/dias-laborables?desde=');
    /* Y usa el número del servidor, no el suyo, para decidir si cabe. */
    expect(pantalla).toContain('desglose?.laborables');
    expect(pantalla).toMatch(/const seExcede =/);
  });

  it('la pantalla no deja enviar lo que ya sabe que se va a negar', () => {
    const pantalla = readFileSync(
      join(FRONTEND!, 'app/dashboard/rrhh/vacaciones/page.tsx'),
      'utf8',
    );
    /*
     * Un botón que lleva a un no. El servidor sigue validando —es él quien
     * manda—, pero la pantalla ya no invita a chocar con la negativa.
     */
    expect(pantalla).toMatch(/disabled=\{[^}]*seExcede\}/);
  });

  /*
   * La prueba de la prueba: que el rango de ejemplo del comentario sea real.
   * Si `explicarDiasLaborables` dejara de contar los domingos o los descansos
   * obligatorios, laborables y naturales coincidirían y la pantalla volvería a
   * decir lo mismo que antes sin que nada se pusiera rojo.
   */
  it('la función distingue laborables de naturales: domingos y LFT art. 74', () => {
    expect(SERVICIO).toContain("motivo: 'Domingo'");
    expect(SERVICIO).toContain('(LFT art. 74)');
    expect(SERVICIO).toMatch(/noLaborables\.push\(/);
  });
});
