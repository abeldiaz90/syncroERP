import {
  ROLES_CON_DATOS_DE_NOMINA,
  sinDatosDeNomina,
  verDatosDeNomina,
} from './datos-de-nomina.util';
import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';

/**
 * Quien ve cuanto gana la gente.
 *
 * La prueba EJECUTA la regla en vez de leer el codigo, y no es un detalle: la
 * lista de roles con traza completa de aprobaciones estaba escrita, comentada
 * y cubierta por una prueba que miraba el texto... y no acertaba nunca, porque
 * comparaba minusculas contra el rol normalizado en MAYUSCULAS.
 */
describe('quien ve los datos de nomina', () => {
  it('rrhh si, en cualquier grafia', () => {
    for (const v of ['rrhh', 'RRHH', 'Rrhh', ' rrhh ']) {
      expect(verDatosDeNomina(v)).toBe(true);
    }
  });

  it('el administrador si, con cualquiera de sus alias', () => {
    for (const v of ['admin', 'ADMIN', 'administrador', 'super_admin']) {
      expect(verDatosDeNomina(v)).toBe(true);
    }
  });

  /*
   * El hallazgo que motivo esto: `gerencia` y `direccion` tienen `rrhh` en
   * consulta y leian `salarioDiario` de la plantilla completa.
   */
  it('gerencia y direccion no, aunque tengan el modulo en consulta', () => {
    for (const rol of ['gerencia', 'direccion', 'contador', 'comprador', 'empleado']) {
      expect(verDatosDeNomina(rol)).toBe(false);
    }
  });

  it('sin rol no', () => {
    expect(verDatosDeNomina(undefined)).toBe(false);
    expect(verDatosDeNomina('')).toBe(false);
  });

  it('quita el sueldo sin tocar el resto ni el objeto original', () => {
    const original = {
      id: 'e1',
      nombreCompleto: 'Persona',
      salarioDiario: 500,
      salarioDiarioIntegrado: 560,
      puesto: { nombre: 'Almacenista' },
    };
    const recortado = sinDatosDeNomina(original);

    expect(recortado.salarioDiario).toBeUndefined();
    expect(recortado.salarioDiarioIntegrado).toBeUndefined();
    expect(recortado.nombreCompleto).toBe('Persona');
    expect(recortado.puesto).toEqual({ nombre: 'Almacenista' });
    // El original no se toca: puede ser una entidad de TypeORM, y borrarle
    // columnas en sitio es como se acaba guardando un salario en cero.
    expect(original.salarioDiario).toBe(500);
  });

  /*
   * El invariante: todo rol que NO ve datos de nomina y tiene `rrhh` en
   * consulta tiene que tener vedados los endpoints que traen la compensacion
   * por otra puerta. Recortar el listado y dejar abiertos los recibos seria
   * arreglar el sintoma.
   */
  it('a quien no ve sueldos se le vedan tambien los recibos y la dispersion', () => {
    const conRrhhEnConsulta = PLANTILLAS_PERMISOS.filter(
      (p) =>
        (p.modulosConsulta ?? []).includes('rrhh') && !verDatosDeNomina(p.rol),
    );
    expect(conRrhhEnConsulta.length).toBeGreaterThan(0);
    for (const plantilla of conRrhhEnConsulta) {
      const vedadas = plantilla.accionesVedadas ?? [];
      expect(vedadas).toContain('GET /rrhh/nomina/recibos');
      expect(vedadas).toContain('GET /rrhh/nomina-avanzada/cuentas-bancarias');
      expect(vedadas).toContain('GET /rrhh/nomina-avanzada/periodos/:id/dispersion');
      expect(vedadas).toContain('GET /rrhh/empleados/:id/finiquito');
    }
  });

  it('el modulo completo de rrhh solo lo tiene quien ve nomina', () => {
    const conModuloCompleto = PLANTILLAS_PERMISOS.filter((p) =>
      (p.modulos ?? []).includes('rrhh'),
    ).map((p) => p.rol);
    expect(conModuloCompleto).toEqual([...ROLES_CON_DATOS_DE_NOMINA]);
  });
});
