import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UN CERO QUE NO SE PREGUNTÓ NO ES UN CERO
 * ----------------------------------------------------------------------------
 * La frase es del corte de caja, que lo aprendió el 21-oct-2026: una consulta
 * negada dejaba las ventas en `[]` y la pantalla firmaba «TOTAL COBRADO $0.00»
 * en un día con ventas.
 *
 * El 22-oct-2026, recorriendo el front con «Ver el ERP como otra persona» y
 * leyendo el código de respuesta real de cada consulta de cada pantalla para
 * los trece roles, aparecieron cuatro más de la misma forma. En todas, un 403
 * perfectamente correcto —esa mitad no es de ese perfil— se convertía en una
 * afirmación sobre el mundo:
 *
 *  1. CONTROL DE VERIFICACIONES. `intentar(..., null)` y `?? 0` abajo: el
 *     tablero se pintaba entero con «Clientes verificados 0 · 0% de la cartera
 *     activa» y «Sin verificar 0 · nunca pasaron por el flujo». Va también
 *     dentro de la cartera de clientes, así que lo veían `empleado`,
 *     `finanzas`, `gerencia` y `hoteleria`, que no alcanzan las validaciones.
 *
 *  2. ASIGNACIONES DE NÓMINA. «No hay asignaciones» sobre una lista que nunca
 *     se leyó, y el panel «Asignar a empleado» pintado con el buscador vacío,
 *     para `contador`, `direccion`, `finanzas` y `gerencia`.
 *
 *  3. AVISOS DEL CORE. «Nada pendiente · Todo lo recibido fue el eco de
 *     operaciones que el ERP mismo originó» con la mitad de los huérfanos sin
 *     consultar, para `contador` y `direccion`.
 *
 *  4. FACTURAS DE PROVEEDOR. `vedado.proveedores` se guardaba y no se pintaba
 *     en ningún sitio: el `contador` —que registra las facturas sin orden, luz
 *     y honorarios— veía un desplegable de proveedor con «Elige…» y nada.
 *
 * QUÉ CUIDA ESTA PRUEBA. Que cada una de las cuatro distinga la negativa del
 * dato, y que las frases exactas que afirmaban de más no vuelvan al JSX.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

const leer = (...p: string[]) => readFileSync(join(FRONTEND!, ...p), 'utf8');

/** El JSX sin comentarios: una frase explicada no es una frase pintada. */
const sinComentarios = (fuente: string) =>
  fuente
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\*|\/\/|\{\/\*)/.test(l))
    .join('\n');

describe('un cero que no se preguntó no es un cero', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  describe('1 · el control de verificaciones no se pinta en ceros', () => {
    const tablero = () => leer('components/verificaciones/tablero-verificaciones.tsx');

    it('distingue vedado, avería y dato', () => {
      const t = tablero();
      expect(t).toMatch(/conPermiso\(\s*\n?\s*api\.get<ITablero>/);
      expect(t).toMatch(/setVedado\(r\.vedado\)/);
      expect(t).toMatch(/setAveriado\(true\)/);
    });

    it('vedado no enseña cifras: calla en la cartera y lo dice en su pantalla', () => {
      const t = tablero();
      expect(t).toMatch(/if \(vedado && compacto\) return null;/);
      /* Las dos salidas van ANTES de calcular cualquier cifra. */
      const corte = t.indexOf('if (vedado && compacto)');
      expect(corte).toBeGreaterThan(0);
      expect(t.indexOf('const porTipo')).toBeGreaterThan(corte);
      expect(t.indexOf('const porcentaje')).toBeGreaterThan(corte);
    });

    it('ya no se traga el fallo con `intentar`', () => {
      /* La prueba de la prueba: ésta era la línea que producía los ceros. */
      expect(tablero()).not.toMatch(/intentar<ITablero/);
    });
  });

  describe('2 · las asignaciones de nómina', () => {
    const pantalla = () => leer('app/dashboard/rrhh/conceptos-nomina/page.tsx');

    it('guarda las dos negativas y condiciona el alta a poder asignar', () => {
      const t = pantalla();
      expect(t).toMatch(/setPadronVedado\(e\.vedado\)/);
      expect(t).toMatch(/setAsignacionesVedadas\(a\.vedado\)/);
      expect(t).toMatch(
        /puedeAsignarConcepto =\s*\n?\s*tienePermiso\('POST','\/rrhh\/nomina-avanzada\/conceptos-empleado'\) && !padronVedado/,
      );
      expect(t).toMatch(/\{puedeAsignarConcepto && <Panel titulo="Asignar a empleado">/);
    });

    it('«No hay asignaciones» sólo se dice cuando se pudo mirar', () => {
      const t = pantalla();
      expect(t).toMatch(
        /asignacionesVedadas\?<SinDatos titulo="Las asignaciones por trabajador no están en tu perfil"/,
      );
      /*
       * La prueba de la prueba: la forma vieja afirmaba sin condición. Si
       * vuelve a aparecer el `SinDatos` de «No hay asignaciones» como primera
       * rama del ternario, esto falla.
       */
      expect(t).not.toMatch(
        /titulo="Asignaciones vigentes">\{!asignaciones\.length\?<SinDatos/,
      );
    });
  });

  describe('3 · los avisos del core', () => {
    const pantalla = () => leer('app/dashboard/creditos/avisos/page.tsx');

    it('distingue vedado de avería en los huérfanos', () => {
      const t = pantalla();
      expect(t).toMatch(/setHuerfanosVedados\(sinEmpresa\.vedado\)/);
      expect(t).toMatch(/setErrorHuerfanos\(/);
      /* La prueba de la prueba: el catch que igualaba las tres cosas. */
      expect(t).not.toMatch(/huerfanos'\)\.catch\(\(\) => \(\{ avisos: \[\] \}\)\)/);
    });

    it('el titular no afirma sobre la mitad que no miró', () => {
      const t = pantalla();
      expect(t).toMatch(/huerfanosVedados\s*\n?\s*\?\s*'Nada pendiente de esta empresa'/);
      expect(t).toMatch(/son de administración y no están en tu perfil/);
    });

    it('el panel vedado no se pinta', () => {
      expect(pantalla()).toMatch(/!huerfanosVedados && huerfanos\.length > 0/);
    });
  });

  describe('4 · el padrón de proveedores en las facturas', () => {
    it('la negativa que ya se guardaba ahora se dice', () => {
      const t = sinComentarios(leer('app/dashboard/compras/facturas-proveedor/page.tsx'));
      expect(t).toMatch(/!ordenId && vedado\.proveedores/);
      expect(t).toMatch(/No puedes leer el padrón de proveedores con tu rol/);
    });
  });

  /*
   * 5 · LA CARTERA DEL CLIENTE EN SU EXPEDIENTE.
   *
   * «No se pudo consultar su política de crédito AHORA MISMO» promete que
   * mañana sí a quien nunca va a poder: `hoteleria` atiende al huésped y no
   * lleva su cartera, y las dos consultas de crédito le contestan 403.
   * Medido el 22-oct-2026.
   */
  describe('5 · la cartera del cliente en su expediente', () => {
    const comp = () => leer('components/clientes/actividad-cliente.tsx');

    it('distingue la negativa de la avería', () => {
      const t = comp();
      expect(t).toMatch(/conPermiso\(api\.get<IPolitica>/);
      expect(t).toMatch(/setCreditoVedado\(pol\.vedado\)/);
      /* La prueba de la prueba: `intentar` igualaba las dos cosas. */
      expect(t).not.toMatch(/intentar<IPolitica/);
    });

    it('vedado se dice sin invitar a reintentar', () => {
      const t = comp();
      expect(t).toMatch(/\{creditoVedado \?/);
      expect(t).toMatch(/La cartera de este cliente no está en tu perfil/);
      /*
       * Y la frase de avería se queda SÓLO para la avería: sigue existiendo,
       * detrás de la rama de vedado.
       */
      const iVedado = t.indexOf('{creditoVedado ?');
      const iAveria = t.indexOf('No se pudo consultar su política de crédito');
      expect(iVedado).toBeGreaterThan(0);
      expect(iAveria).toBeGreaterThan(iVedado);
    });
  });
});
