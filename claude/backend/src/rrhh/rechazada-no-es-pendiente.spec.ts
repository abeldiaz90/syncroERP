/**
 * ============================================================================
 * Rechazada no es pendiente
 * ----------------------------------------------------------------------------
 * Medido el 30-sep-2026 por pantalla, sesión de Gerencia, /rrhh/incidencias:
 *
 *   · «PENDIENTES DE APROBAR ........ 1»
 *   · la fila ofrecía el botón «Aprobar»
 *   · pulsarlo → 409 «La incidencia está en estado CANCELADA y no puede
 *     aprobarse.»
 *
 * La pantalla decidía TODO con `!aprobada`, que es un booleano, mientras el
 * dominio tiene cuatro estados resueltos. Así que una incidencia cancelada o
 * rechazada:
 *
 *   · se contaba como pendiente,
 *   · sumaba sus días en «DÍAS NO PAGADOS» —días de sueldo que ya nadie iba a
 *     descontar—,
 *   · y ofrecía un botón que sólo podía fallar.
 *
 * El cálculo de nómina, que es quien mueve el dinero, ya lo hacía bien:
 * `estadoAprobacion NOT IN (resueltas)` para bloquear y `aprobada = true` para
 * aplicar. O sea que la pantalla y la nómina daban números distintos sobre lo
 * mismo, y quien lee la pantalla antes de correr la nómina persigue un
 * pendiente que no existe.
 *
 * Esta prueba extrae los predicados del fuente que se despliega y los ejecuta.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ESTADOS_INCIDENCIA_RESUELTA } from './entities/rrhh.entity';

const RUTA = join(
  __dirname, '..', '..', '..',
  'frontend', 'app', 'dashboard', 'rrhh', 'incidencias', 'page.tsx',
);
const fuente = readFileSync(RUTA, 'utf8');
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

type Fila = { aprobada: boolean; pagada?: boolean; dias?: number; horas?: number; tipo?: string; estadoAprobacion?: string };

function listaDelFuente(): string[] {
  const m = codigo.match(/const ESTADOS_RESUELTA = \[([\s\S]*?)\];/);
  if (!m) throw new Error('No se encontró ESTADOS_RESUELTA en la pantalla de incidencias');
  return new Function(`return [${m[1]}]`)() as string[];
}

function predicado(nombre: string): (i: Fila) => boolean {
  const m = codigo.match(new RegExp(`const ${nombre} = \\(i: Incidencia\\): boolean =>([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`No se encontró el predicado ${nombre}`);
  return new Function(
    'ESTADOS_RESUELTA',
    `return function (i) { return (${m[1].trim()}); };`,
  )(listaDelFuente()) as (i: Fila) => boolean;
}

const ESTADOS_RESUELTA = listaDelFuente();
const estaPendiente = predicado('estaPendiente');
const fueDesechada = predicado('fueDesechada');

describe('estaPendiente · sólo lo que de verdad falta por resolver', () => {
  it.each(ESTADOS_RESUELTA)('%s NO está pendiente', (estado) => {
    expect(estaPendiente({ aprobada: false, estadoAprobacion: estado })).toBe(false);
  });

  it('PENDIENTE sí lo está', () => {
    expect(estaPendiente({ aprobada: false, estadoAprobacion: 'PENDIENTE' })).toBe(true);
  });

  it('una aprobada tampoco está pendiente aunque el estado no viaje', () => {
    expect(estaPendiente({ aprobada: true })).toBe(false);
  });

  it('sin estado, se cae al booleano viejo y no se rompe', () => {
    expect(estaPendiente({ aprobada: false })).toBe(true);
  });
});

describe('fueDesechada · lo resuelto EN CONTRA no descuenta nada', () => {
  it.each(['RECHAZADA', 'CANCELADA'])('%s está desechada', (estado) => {
    expect(fueDesechada({ aprobada: false, estadoAprobacion: estado })).toBe(true);
  });

  it.each(['APROBADA', 'APLICADA', 'PENDIENTE'])('%s NO está desechada', (estado) => {
    expect(fueDesechada({ aprobada: true, estadoAprobacion: estado })).toBe(false);
  });

  it('sin estado no se desecha nada: no hay con qué afirmarlo', () => {
    expect(fueDesechada({ aprobada: false })).toBe(false);
  });
});

describe('La pantalla y la nómina cuentan lo mismo', () => {
  it('la lista de estados resueltos es la misma que la del backend', () => {
    expect([...ESTADOS_RESUELTA].sort()).toEqual([...ESTADOS_INCIDENCIA_RESUELTA].sort());
  });

  it('los indicadores ya no se calculan con !aprobada', () => {
    expect(codigo).toMatch(/porAprobar: lista\.filter\(estaPendiente\)\.length/);
    expect(codigo).not.toMatch(/filter\(\(i\) => !i\.aprobada\)/);
  });

  it('los días no pagados excluyen lo desechado', () => {
    expect(codigo).toMatch(/!i\.pagada && !fueDesechada\(i\)/);
  });

  it('las horas extra también', () => {
    expect(codigo).toMatch(/i\.tipo === 'HORAS_EXTRA' && !fueDesechada\(i\)/);
  });

  it('el botón Aprobar sólo aparece sobre lo pendiente', () => {
    expect(codigo).toMatch(/\{estaPendiente\(i\) \? \(/);
    expect(codigo).not.toMatch(/\{i\.aprobada \? \(/);
  });

  it('cada estado resuelto se nombra por lo que es, no todos «Aprobada»', () => {
    for (const estado of ESTADOS_INCIDENCIA_RESUELTA) {
      expect(codigo).toMatch(new RegExp(`${estado}:\\s*\\{ texto:`));
    }
  });
});
