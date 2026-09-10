import { RegimenPago } from '../entities/rrhh.entity';
import {
  calcularSubsidioPeriodo,
  obtenerPorcentajeCesantiaPatronal,
  obtenerTarifaIsr,
  obtenerTarifas,
} from './tarifas-fiscales';

describe('tarifas fiscales 2026', () => {
  it('conserva UMA y salarios mínimos 2026 verificados', () => {
    const tarifas = obtenerTarifas(2026);
    expect(tarifas.umaDiaria).toBe(117.31);
    expect(tarifas.umaMensual).toBe(3566.22);
    expect(tarifas.salarioMinimoGeneral).toBe(315.04);
    expect(tarifas.salarioMinimoFronteraNorte).toBe(440.87);
  });

  it('usa tarifa quincenal 2026 y no la mensual 2025', () => {
    const tabla = obtenerTarifaIsr(2026, RegimenPago.QUINCENAL);
    expect(tabla[0]).toEqual({
      limiteInferior: 0.01,
      limiteSuperior: 416.7,
      cuotaFija: 0,
      porcentaje: 1.92,
    });
  });

  it('no otorga subsidio cuando rebasa el límite proporcional', () => {
    const subsidio = calcularSubsidioPeriodo({
      ejercicio: 2026,
      baseGravable: 7000,
      diasPeriodo: 15,
      fechaPago: new Date('2026-02-15T00:00:00'),
    });
    expect(subsidio).toBe(0);
  });

  it('aplica el rango de salario mínimo antes de los rangos UMA', () => {
    const porcentaje = obtenerPorcentajeCesantiaPatronal(
      2026,
      117.31 * 2.25,
      'GENERAL',
    );
    // 2.25 UMA todavía es menor al salario mínimo general 2026; el primer
    // rango se determina por salario mínimo, tal como exige la tabla.
    expect(porcentaje).toBe(3.15);
  });
});
