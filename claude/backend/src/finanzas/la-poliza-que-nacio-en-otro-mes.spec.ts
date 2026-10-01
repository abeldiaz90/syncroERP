/**
 * ============================================================================
 * La póliza que nació en otro mes
 * ----------------------------------------------------------------------------
 * Medido en vivo el 1-oct-2026, recorriendo el ciclo de compras completo con
 * Abel sobre la base recién limpiada:
 *
 *   Recepción de mercancía OC-DF8F995F   30 de septiembre, 18:13 (México)
 *   Póliza EG-2026-00001                  1 de octubre
 *
 * El mismo hecho, dos fechas, dos MESES. El almacén recibió en septiembre y la
 * contabilidad asentó el costo y el pasivo en octubre. La póliza cuadraba
 * ($96,152.40 al debe y al haber) y por eso nada se puso rojo: el error no es
 * de importes, es de período, y ésos no los caza un balance.
 *
 * La causa: quien encola el asiento ponía `fecha: new Date()`, el proceso del
 * servidor corre en UTC, y la columna `fecha` de la póliza es de tipo `date`,
 * que TypeORM escribe con los captadores LOCALES del proceso. En UTC-6 eso
 * significa que todo lo que ocurre después de las 18:00 se contabiliza al día
 * siguiente — seis horas de cada día— y el último día del mes esas seis horas
 * se van al mes que viene.
 *
 * Es la diferencia entre que un cierre cuadre contra el inventario y que no.
 *
 * El arreglo no es un parche en compras: la misma línea estaba en ocho
 * generadores —ventas, anulación, CFDI, tesorería, inventario, WMS,
 * productos—, así que la regla vive en `fechaContableNegocio()` y estas
 * pruebas cuidan las dos mitades: que la función diga el día correcto, y que
 * ningún generador se quede fuera.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  fechaCalendarioNegocio,
  fechaContableNegocio,
} from '../common/utils/business-time.util';

const SRC = join(__dirname, '..');

describe('La fecha contable es el día del hecho, en la zona de la empresa', () => {
  it('a las 18:13 del 30 de septiembre en México, la fecha contable es el 30', () => {
    /*
     * El instante exacto de la recepción que destapó esto: 30-sep-2026 18:13
     * hora de México son las 00:13 UTC del 1 de octubre.
     */
    const instante = new Date('2026-10-01T00:13:00Z');
    const fecha = fechaContableNegocio(instante, 'America/Mexico_City');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth() + 1).toBe(9);
    expect(fecha.getDate()).toBe(30);
  });

  it('y el mes que la póliza va a archivar es septiembre, no octubre', () => {
    /*
     * `mes` y `anio` de la póliza salen de esta misma fecha con `getMonth()` y
     * `getFullYear()`. Si la fecha se corre un día, el período se corre un mes
     * justo en el día que más importa.
     */
    const fecha = fechaContableNegocio(
      new Date('2026-10-01T00:13:00Z'),
      'America/Mexico_City',
    );
    expect(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`).toBe('2026-9');
  });

  it('antes de las 18:00 no cambia nada (no se corrige de más)', () => {
    const fecha = fechaContableNegocio(
      new Date('2026-09-30T17:00:00Z'), // 11:00 en México
      'America/Mexico_City',
    );
    expect(fecha.getDate()).toBe(30);
    expect(fecha.getMonth() + 1).toBe(9);
  });

  it('nace a medianoche: es un día del calendario, no un instante', () => {
    /*
     * La columna es `date`. Devolver la hora del hecho invitaría a que alguien
     * comparara pólizas por hora y a que un `>=` de rango dejara fuera la del
     * propio día.
     */
    const fecha = fechaContableNegocio(
      new Date('2026-10-01T00:13:00Z'),
      'America/Mexico_City',
    );
    expect([
      fecha.getHours(),
      fecha.getMinutes(),
      fecha.getSeconds(),
      fecha.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it('dice el mismo día que `fechaCalendarioNegocio`, que ya existía', () => {
    /*
     * Las dos tienen que contestar lo mismo o el sistema se contradice consigo
     * mismo: una resuelve «¿qué día es hoy?» para los listados y la otra para
     * los asientos.
     */
    for (const iso of [
      '2026-10-01T00:13:00Z',
      '2026-09-30T17:00:00Z',
      '2026-01-01T05:59:00Z',
      '2026-06-15T23:30:00Z',
    ]) {
      const instante = new Date(iso);
      const texto = fechaCalendarioNegocio(instante, 'America/Mexico_City');
      const fecha = fechaContableNegocio(instante, 'America/Mexico_City');
      const rendido = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
      expect(rendido).toBe(texto);
    }
  });

  it('respeta la zona que se le pida, no una fija en el código', () => {
    const instante = new Date('2026-10-01T00:13:00Z');
    expect(
      fechaContableNegocio(instante, 'America/Mexico_City').getDate(),
    ).toBe(30);
    /* En Madrid ese mismo instante ya es 1 de octubre, y así debe asentarse. */
    expect(fechaContableNegocio(instante, 'Europe/Madrid').getDate()).toBe(1);
  });
});

describe('Ningún generador de asientos se quedó con la fecha cruda', () => {
  /*
   * Ocho servicios encolan asientos contables. Arreglar sólo el de compras
   * —el que apareció en la demo— habría dejado los otros siete con el mismo
   * defecto, esperando a que alguien los encontrara de uno en uno.
   */
  const GENERADORES = [
    'compras/services/ordenes-compra.service.ts',
    'ventas/services/ventas.service.ts',
    'ventas/services/anulacion-ventas.service.ts',
    'cfdi/cfdi.service.ts',
    'tesoreria/services/tesoreria.service.ts',
    'catalogo/services/inventario.service.ts',
    'catalogo/services/wms.service.ts',
    'catalogo/services/productos.service.ts',
  ];

  const sinComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(GENERADORES)('%s usa la fecha de negocio', (relativa) => {
    const codigo = sinComentarios(readFileSync(join(SRC, relativa), 'utf8'));
    expect(codigo).toMatch(/fecha: fechaContableNegocio\(\)/);
    expect(codigo).toMatch(/fechaContableNegocio[\s\S]*business-time\.util/);
  });

  it.each(GENERADORES)('%s ya no encola con `new Date()`', (relativa) => {
    /*
     * Escrito en negativo a propósito: lo que no puede volver a aparecer es la
     * línea vieja. Comprobar sólo que la nueva está deja pasar un archivo que
     * tenga las dos, con un segundo asiento todavía mal fechado.
     */
    const codigo = sinComentarios(readFileSync(join(SRC, relativa), 'utf8'));
    expect(codigo).not.toMatch(/fecha: new Date\(\),/);
  });

  it('no hay un noveno generador suelto que la lista no cubra', () => {
    /*
     * Esta es la prueba que importa dentro de un año: si alguien añade un
     * generador nuevo y lo encola con `new Date()`, aquí se pone roja aunque
     * nadie se acuerde de este archivo.
     */
    const { execSync } = require('child_process') as typeof import('child_process');
    const salida = execSync(
      `grep -rln "encolarEnTransaccion\\|asientos.encolar" --include=*.ts ${SRC} || true`,
      { encoding: 'utf8' },
    );
    const sospechosos = salida
      .split('\n')
      .filter((f) => f && !f.includes('.spec.') && !f.includes('asientos-pendientes.service.ts'))
      .filter((f) => /fecha: new Date\(\),/.test(readFileSync(f, 'utf8')));
    expect(sospechosos).toEqual([]);
  });
});
