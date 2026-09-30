import { descansosEnRango, descansosObligatorios } from './descanso-obligatorio';

/**
 * ============================================================================
 * Unas vacaciones que se comían el 16 de septiembre
 * ----------------------------------------------------------------------------
 * MEDIDO EL 30-SEP-2026, por pantalla, con la sesión de `rrhh`
 *
 * Se pidieron vacaciones del viernes 2 al martes 6 de octubre y el sistema
 * descontó 4 días laborables de 5 naturales. El cálculo era coherente con su
 * regla —«laborable = no es domingo»— y esa regla cubre el art. 69 de la LFT,
 * un descanso a la semana. Correcto hasta ahí.
 *
 * Lo que faltaba era el art. 74: los días de descanso OBLIGATORIO. El ERP no
 * los conocía. Existía `rrhh_calendario_laboral` para excepciones y **ningún
 * endpoint ni pantalla que la llenara**, así que nadie podía cargarlos.
 *
 * Consecuencia, y es del trabajador: unas vacaciones que cruzaran el 16 de
 * septiembre le consumían un día que la ley le reserva. Igual el 1 de enero,
 * el 1 de mayo, el 25 de diciembre.
 *
 * LO QUE VIGILA ESTA PRUEBA
 *
 *  · Que los siete días fijos estén, con su fecha correcta.
 *  · Que los tres MOVIDOS A LUNES por el decreto de 2006 se calculen, no se
 *    escriban: el 5 de febrero, el 21 de marzo y el 20 de noviembre dejaron de
 *    ser las fechas de descanso, y ése es el detalle que se olvida al
 *    teclearlos cada enero.
 *  · Que el 1 de octubre aparezca SÓLO en los años de transmisión del Ejecutivo.
 *  · Que NO se regalen días que la ley no concede —10 de mayo, 2 de noviembre,
 *    12 de diciembre— porque no están en el art. 74.
 * ============================================================================
 */

const fechas = (anio: number) => descansosObligatorios(anio).map((d) => d.fecha);

describe('LFT art. 74 · los días fijos', () => {
  it('año nuevo, día del trabajo, independencia y navidad no se mueven', () => {
    expect(fechas(2026)).toEqual(
      expect.arrayContaining(['2026-01-01', '2026-05-01', '2026-09-16', '2026-12-25']),
    );
  });

  it('cada día dice qué fracción lo ordena', () => {
    const anio = descansosObligatorios(2026);
    expect(anio.find((d) => d.fecha === '2026-09-16')?.fraccion).toBe('V');
    expect(anio.find((d) => d.fecha === '2026-01-01')?.fraccion).toBe('I');
  });

  it('salen en orden de calendario', () => {
    const f = fechas(2026);
    expect([...f].sort()).toEqual(f);
  });
});

describe('LFT art. 74 · los tres que el decreto de 2006 movió a lunes', () => {
  /*
   * Comprobados contra el calendario real. Si alguien «corrige» esto poniendo
   * las fechas nominales —5 de febrero, 21 de marzo, 20 de noviembre— las
   * tres pruebas se caen.
   */
  it('2026: primer lunes de febrero es el 2, no el 5', () => {
    expect(fechas(2026)).toContain('2026-02-02');
    expect(fechas(2026)).not.toContain('2026-02-05');
  });

  it('2026: tercer lunes de marzo es el 16, no el 21', () => {
    expect(fechas(2026)).toContain('2026-03-16');
    expect(fechas(2026)).not.toContain('2026-03-21');
  });

  it('2026: tercer lunes de noviembre es el 16, no el 20', () => {
    expect(fechas(2026)).toContain('2026-11-16');
    expect(fechas(2026)).not.toContain('2026-11-20');
  });

  it('2027: los tres caen donde toca', () => {
    // 1-feb-2027 es lunes; 15-mar-2027 es lunes; 15-nov-2027 es lunes.
    expect(fechas(2027)).toContain('2027-02-01');
    expect(fechas(2027)).toContain('2027-03-15');
    expect(fechas(2027)).toContain('2027-11-15');
  });

  it('todos los lunes calculados caen de verdad en lunes, año por año', () => {
    /*
     * La comprobación que no depende de que yo haya mirado bien el calendario:
     * se recorren veinte años y se exige que los tres movibles sean lunes.
     */
    for (let anio = 2024; anio <= 2044; anio += 1) {
      const dias = descansosObligatorios(anio);
      const movibles = dias.filter((d) =>
        /Constitución|Juárez|Revolución/.test(d.descripcion),
      );
      expect(movibles).toHaveLength(3);
      for (const dia of movibles) {
        const [a, m, d] = dia.fecha.split('-').map(Number);
        expect(new Date(a, m - 1, d).getDay()).toBe(1);
      }
    }
  });
});

describe('LFT art. 74 fr. VIII · la transmisión del Ejecutivo', () => {
  it('2024 sí, porque hubo transmisión', () => {
    expect(fechas(2024)).toContain('2024-10-01');
  });

  it('2026 no', () => {
    expect(fechas(2026)).not.toContain('2026-10-01');
  });

  it('2030 y 2036 sí: la regla se calcula, no se teclea cada seis años', () => {
    expect(fechas(2030)).toContain('2030-10-01');
    expect(fechas(2036)).toContain('2036-10-01');
    expect(fechas(2031)).not.toContain('2031-10-01');
  });

  it('antes de 2024 no se inventa', () => {
    expect(fechas(2018)).not.toContain('2018-10-01');
  });
});

describe('LFT art. 74 · lo que NO es descanso obligatorio', () => {
  it('no regala el 10 de mayo, el 2 de noviembre ni el 12 de diciembre', () => {
    /*
     * Son días de costumbre, no del art. 74. Darlos por descanso le quitaría al
     * patrón días que la ley no le quita, y el ERP no está para inventar
     * prestaciones.
     */
    const f = fechas(2026);
    expect(f).not.toContain('2026-05-10');
    expect(f).not.toContain('2026-11-02');
    expect(f).not.toContain('2026-12-12');
  });

  it('en un año sin transmisión son exactamente siete', () => {
    expect(fechas(2026)).toHaveLength(7);
  });
});

describe('Rango · un periodo que cruza de un año a otro', () => {
  it('trae los descansos de los dos años', () => {
    const mapa = descansosEnRango(
      new Date(2026, 11, 20),
      new Date(2027, 0, 10),
    );

    expect(mapa.get('2026-12-25')).toMatch(/Navidad/);
    expect(mapa.get('2027-01-01')).toMatch(/Año nuevo/);
  });

  it('el rango del hallazgo —2 al 6 de octubre de 2026— no trae ninguno', () => {
    /*
     * Es el caso medido: ahí los 4 laborables de 5 naturales eran correctos,
     * porque el único no laborable era el domingo 4. La ley no cambia ese
     * número; lo que cambia son los rangos que cruzan un día del art. 74.
     */
    const mapa = descansosEnRango(new Date(2026, 9, 2), new Date(2026, 9, 6));

    expect(mapa.size).toBe(0);
  });
});
