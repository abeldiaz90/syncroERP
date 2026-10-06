import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * DOS FUGAS PEQUEÑAS DEL BARRIDO MULTIEMPRESA
 * ----------------------------------------------------------------------------
 * Del barrido de aislamiento del 6-oct-2026. Ninguna de las dos filtra nada hoy
 * por sí sola; las dos son la forma de fuga que no se ve venir, así que se
 * cierran y se dejan atadas.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

describe('contar pendientes de una tabla sin columna de empresa', () => {
  /*
   * EL CASO. `contar()` devuelve `null` —«no se pudo medir»— cuando falta la
   * tabla o falta la columna de estado. Pero cuando faltaba la columna de
   * EMPRESA no devolvía `null`: armaba el `WHERE` sin ella y contaba **todas
   * las filas de todas las empresas**, devolviéndoselas al que preguntaba como
   * pendientes suyos.
   *
   * Hoy no filtra nada: las diez tablas de `DEFINICIONES_PENDIENTES` tienen
   * `empresaId`. Es una trampa armada para la próxima definición que alguien
   * añada sobre una tabla hija — y las tablas hijas sin `empresaId` abundan en
   * este esquema, así que la próxima llega sola.
   *
   * Y es el mismo defecto que motivó ese archivo, por el otro lado: allí se
   * reportaba un pendiente que no existía; aquí se reportarían los de otros.
   */
  const servicio = readFileSync(
    join(SRC, 'configuracion', 'services', 'operaciones-pendientes.service.ts'),
    'utf8',
  );

  it('se dice NO MEDIBLE en vez de contar lo de todas', () => {
    expect(servicio).toMatch(
      /const tieneEmpresa = columnas\.has\('empresaid'\);\s*\n\s*if \(!tieneEmpresa\) return null;/,
    );
  });

  it('y la salida va ANTES de armar la consulta', () => {
    /*
     * Dejar la comprobación después del `SELECT` sería el mismo defecto con un
     * `if` de adorno: la consulta ya estaría escrita y alguien la movería.
     */
    const salida = servicio.indexOf('if (!tieneEmpresa) return null;');
    const consulta = servicio.indexOf('SELECT COUNT(1) total FROM');
    expect(salida).toBeGreaterThan(0);
    expect(consulta).toBeGreaterThan(salida);
  });

  it('las tres imposibilidades se tratan igual: null', () => {
    /*
     * Tabla ausente, columna de estado ausente, columna de empresa ausente. Las
     * tres significan lo mismo —no se puede medir— y el llamador ya sabe tratar
     * `null`. Que una de las tres se comportara distinto es lo que hacía el
     * agujero.
     */
    const cuerpo = servicio.slice(
      servicio.indexOf('private async contar('),
      servicio.indexOf('SELECT COUNT(1) total FROM'),
    );
    expect((cuerpo.match(/return null;/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('el 409 de hotelería no nombra lo de otra empresa', () => {
  /*
   * EL CASO. `tipoHabitacionId` viene del DTO de reservación. Con el id de otra
   * empresa no hay habitaciones, así que `capacidadUtil` sale 0, `disponibles`
   * sale 0, y el flujo cae justo en la rama del error… que cargaba el tipo de
   * habitación SIN acotar por empresa y ponía **su nombre** en el mensaje.
   *
   * Un 409 que confirma que ese id existe y cómo se llama. Es poco, y es
   * exactamente la clase de cosa con la que se mapea un sistema ajeno: un
   * oráculo de existencia más un dato por intento.
   */
  const servicio = readFileSync(
    join(SRC, 'hoteleria', 'services', 'disponibilidad.service.ts'),
    'utf8',
  );

  it('la consulta del nombre va acotada por empresa', () => {
    expect(servicio).toMatch(
      /findOne\(TipoHabitacion, \{\s*\n\s*where: \{ id: datos\.tipoHabitacionId, empresaId \},\s*\n\s*\}\)/,
    );
  });

  it('y no queda ninguna lectura de TipoHabitacion sin acotar', () => {
    /*
     * En negativo sobre el archivo entero: arreglar la que se encontró y dejar
     * otra igual dos métodos más abajo es cómo esto vuelve.
     */
    const sinComentarios = servicio
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const lecturas = [
      ...sinComentarios.matchAll(/findOne\(\s*TipoHabitacion,\s*\{[\s\S]{0,200}?\}\s*\)/g),
    ].map((m) => m[0]);
    expect(lecturas.length).toBeGreaterThan(0);
    for (const lectura of lecturas) {
      expect(lectura).toMatch(/empresaId/);
    }
  });
});
