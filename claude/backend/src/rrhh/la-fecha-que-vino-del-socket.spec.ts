/**
 * ============================================================================
 * La fecha que vino del socket
 * ----------------------------------------------------------------------------
 * `@Column({ type: 'date' }) fechaInicio!: Date` promete una `Date`. El driver
 * de Postgres devuelve la cadena `'2026-10-19'`. La anotación miente y
 * TypeScript no puede saberlo, porque ese valor no pasa por el compilador:
 * entra por el socket.
 *
 * Todos los que llamaban a `evaluarDerechoAVacaciones` normalizaban antes con
 * `fechaSql()` —sus fechas venían de un DTO— menos uno: `resolverVacaciones()`,
 * que pasa `solicitud.fechaInicio` recién leída de la tabla. Ahí
 * `al.getFullYear()` es «no es una función».
 *
 * Medido el 30-sep-2026: Gerencia pulsa «Aprobar nivel» sobre la solicitud de
 * Laura 19–21 oct y recibe **500 · «Ocurrió un error inesperado.»**
 *
 * Y ese camino NO SE HABÍA EJECUTADO NUNCA, porque hasta esa misma mañana la
 * ruta de aprobación por omisión apuntaba a quien capturaba y ninguna
 * solicitud llegaba a aprobarse. Arreglar aquella puerta destapó que la
 * habitación de al lado también estaba rota.
 * ============================================================================
 */
import { RrhhService } from './services/rrhh.service';

type Empleado = { id: string; fechaIngreso: unknown };

/** Sólo lo que estos dos métodos privados usan del servicio. */
const servicio = () => Object.create(RrhhService.prototype) as RrhhService;

const evaluar = (empleado: Empleado, al: unknown) =>
  (
    RrhhService.prototype as unknown as {
      evaluarDerechoAVacaciones: (e: Empleado, al: unknown) => {
        antiguedad: number;
        tieneDerecho: boolean;
        fechaIngreso: string;
        proximoAniversario: string;
      };
    }
  ).evaluarDerechoAVacaciones.call(servicio(), empleado, al);

/** Laura: alta el 15-ene-2024. Al 19-oct-2026 lleva 2 años cumplidos. */
const LAURA: Empleado = { id: 'emp-laura', fechaIngreso: '2024-01-15' };

describe('evaluarDerechoAVacaciones · la fecha puede llegar como cadena', () => {
  it('con la CADENA que devuelve Postgres no revienta', () => {
    expect(() => evaluar(LAURA, '2026-10-19')).not.toThrow();
  });

  it('y da el mismo resultado que con una Date', () => {
    const conCadena = evaluar(LAURA, '2026-10-19');
    const conFecha = evaluar(LAURA, new Date(2026, 9, 19));
    expect(conCadena).toEqual(conFecha);
  });

  it('la antigüedad sale bien: 2 años al 19-oct-2026', () => {
    expect(evaluar(LAURA, '2026-10-19').antiguedad).toBe(2);
    expect(evaluar(LAURA, '2026-10-19').tieneDerecho).toBe(true);
  });

  it('la fecha de ingreso del empleado también puede venir como cadena', () => {
    expect(() => evaluar({ id: 'x', fechaIngreso: '2024-01-15' }, '2026-10-19')).not.toThrow();
    expect(() =>
      evaluar({ id: 'x', fechaIngreso: new Date(2024, 0, 15) }, '2026-10-19'),
    ).not.toThrow();
  });

  it('justo antes del aniversario aún no hay derecho', () => {
    // Alta 15-ene-2026; al 14-ene-2027 falta un día para el primer año.
    const recien: Empleado = { id: 'y', fechaIngreso: '2026-01-15' };
    expect(evaluar(recien, '2027-01-14').tieneDerecho).toBe(false);
    expect(evaluar(recien, '2027-01-15').tieneDerecho).toBe(true);
  });

  it('el mismo día del aniversario cuenta el año completo', () => {
    expect(evaluar(LAURA, '2026-01-15').antiguedad).toBe(2);
    expect(evaluar(LAURA, '2026-01-14').antiguedad).toBe(1);
  });

  it('una cadena que no es fecha se rechaza como dato malo, no como caída', () => {
    expect(() => evaluar(LAURA, 'no-es-fecha')).toThrow(/fecha/i);
  });
});

describe('La normalización está donde se consume, no en cada llamada', () => {
  const fuente = require('fs')
    .readFileSync(require('path').join(__dirname, 'services', 'rrhh.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(['evaluarDerechoAVacaciones', 'obtenerOCrearSaldoVacaciones'])(
    '%s acepta Date | string y normaliza dentro',
    (metodo: string) => {
      const i = fuente.indexOf(`private ${metodo}`) >= 0
        ? fuente.indexOf(`private ${metodo}`)
        : fuente.indexOf(`private async ${metodo}`);
      expect(i).toBeGreaterThan(-1);
      const bloque = fuente.slice(i, i + 700);
      expect(bloque).toMatch(/alBruto: Date \| string/);
      expect(bloque).toMatch(/const al = this\.fechaSql\(alBruto\)/);
    },
  );

  it('ninguno de los dos vuelve a recibir un `al: Date` sin normalizar', () => {
    expect(fuente).not.toMatch(/evaluarDerechoAVacaciones\(empleado: Empleado, al: Date\)/);
    expect(fuente).not.toMatch(/obtenerOCrearSaldoVacaciones\([\s\S]{0,120}?al: Date,/);
  });
});
