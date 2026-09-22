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
