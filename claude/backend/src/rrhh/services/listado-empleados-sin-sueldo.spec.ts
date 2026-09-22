import { RrhhService } from './rrhh.service';

/**
 * El listado de empleados y el sueldo.
 *
 * Esta prueba EJECUTA el recorte en vez de comprobar que este escrito, porque
 * el fallo que motivo todo esto era justamente una regla escrita que no
 * corria. Cubre el cableado completo: rol -> servicio -> filas devueltas.
 */
describe('listado de empleados: el sueldo depende del rol', () => {
  const EMPLEADO = {
    id: 'e1',
    numeroEmpleado: '00001',
    nombres: 'Ana',
    apellidoPaterno: 'Robles',
    apellidoMaterno: 'Diaz',
    curp: 'ROAM880412MDFXXX09',
    rfc: 'ROAM880412H24',
    nss: '12345678901',
    clabe: '002180700123456789',
    salarioDiario: 500,
    salarioDiarioIntegrado: 560,
    fechaIngreso: new Date('2024-01-15'),
    puesto: { nombre: 'Almacenista' },
  };

  function servicio() {
    const qb: Record<string, unknown> = {};
    for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getMany = jest.fn(async () => [{ ...EMPLEADO }]);
    const empleados = { createQueryBuilder: jest.fn(() => qb) };
    // Dieciseis dependencias mas que este camino no toca.
    const Servicio = RrhhService as unknown as new (...args: unknown[]) => RrhhService;
    return new Servicio(empleados, ...new Array(16).fill({}));
  }

  it('rrhh ve el sueldo', async () => {
    const [fila] = await servicio().listarEmpleados('emp', {}, 'rrhh');

    expect((fila as unknown as Record<string, unknown>).salarioDiario).toBe(500);
    expect((fila as unknown as Record<string, unknown>).salarioDiarioIntegrado).toBe(560);
  });

  /*
   * El hallazgo del 22-sep: `gerencia` tiene `rrhh` en consulta y leia
   * `salarioDiario` de la plantilla entera de un tiron, porque el rol no
   * llegaba al listado —solo a la ficha individual—.
   */
  it('gerencia y direccion no lo ven, y siguen viendo al empleado', async () => {
    for (const rol of ['gerencia', 'direccion', 'GERENCIA']) {
      const [fila] = await servicio().listarEmpleados('emp', {}, rol);
      const f = fila as unknown as Record<string, unknown>;

      expect(f.salarioDiario).toBeUndefined();
      expect(f.salarioDiarioIntegrado).toBeUndefined();
      // Lo que si necesitan para su trabajo sigue ahi.
      expect(f.numeroEmpleado).toBe('00001');
      expect(f.nombreCompleto).toBe('Ana Robles Diaz');
      expect(f.puesto).toEqual({ nombre: 'Almacenista' });
    }
  });

  it('sin rol tampoco', async () => {
    const [fila] = await servicio().listarEmpleados('emp', {});
    expect((fila as unknown as Record<string, unknown>).salarioDiario).toBeUndefined();
  });

  /*
   * El enmascarado de datos personales ya existia y estaba bien: se comprueba
   * para que el recorte nuevo no lo haya desarmado al copiar el objeto.
   */
  /*
   * El agregado que reconstruye el dato recortado.
   *
   * Comprobado en vivo el 22-sep con UN empleado dado de alta: a Gerencia se
   * le recortaba el sueldo de la tabla y el encabezado se lo devolvia entero
   * —«nomina mensual estimada $13,500», «salario diario promedio $450»—. Con
   * la plantilla pequena el promedio ES el sueldo de una persona, asi que
   * recortar el detalle y publicar el agregado es recortar de mentira.
   *
   * Y va `null`, no 0: cero es una cifra, y en la pantalla se leia como que a
   * esa persona le pagan nada.
   */
  describe('los indicadores de coste', () => {
    function servicioResumen() {
      const empleados = {
        find: jest.fn(async () => [
          { ...EMPLEADO, estado: 'ACTIVO' },
          { ...EMPLEADO, id: 'e2', estado: 'ACTIVO', salarioDiario: 550 },
        ]),
      };
      const incidencias = { count: jest.fn(async () => 0) };
      const Servicio = RrhhService as unknown as new (...a: unknown[]) => RrhhService;
      return new Servicio(empleados, {}, {}, incidencias, ...new Array(13).fill({}));
    }

    it('rrhh ve la nomina mensual y el promedio', async () => {
      const r = (await servicioResumen().resumen('emp', 'rrhh')) as Record<string, unknown>;

      // 500 + 550 = 1050 diarios; por 30 dias, 31 500 al mes.
      expect(r.nominaMensualEstimada).toBe(31500);
      expect(r.salarioPromedioDiario).toBe(525);
    });

    it('gerencia no los ve, y sigue viendo la plantilla', async () => {
      const r = (await servicioResumen().resumen('emp', 'gerencia')) as Record<string, unknown>;

      expect(r.nominaMensualEstimada).toBeNull();
      expect(r.salarioPromedioDiario).toBeNull();
      // Lo que si es suyo: cuanta gente tiene.
      expect(r.totalEmpleados).toBe(2);
    });

    it('nunca devuelve cero en lugar de «sin acceso»', async () => {
      const r = (await servicioResumen().resumen('emp', 'direccion')) as Record<string, unknown>;

      expect(r.nominaMensualEstimada).not.toBe(0);
      expect(r.salarioPromedioDiario).not.toBe(0);
    });
  });

  it('sigue enmascarando CURP, RFC, NSS y CLABE', async () => {
    const [fila] = await servicio().listarEmpleados('emp', {}, 'gerencia');
    const f = fila as unknown as Record<string, string>;

    expect(f.clabe).toBe('**************6789');
    expect(f.rfc.endsWith('2H24')).toBe(true);
    expect(f.rfc.startsWith('*')).toBe(true);
    expect(f.curp.startsWith('*')).toBe(true);
    expect(f.nss.startsWith('*')).toBe(true);
  });
});
