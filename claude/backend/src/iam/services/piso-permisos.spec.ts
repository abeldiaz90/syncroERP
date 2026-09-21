import { PLANTILLAS_PERMISOS } from '../data/plantillas-permisos';
import { MODULOS_NEGOCIO, MODULO_OTROS } from '../data/modulos-catalogo';

/**
 * ============================================================================
 * El piso de permisos de cada rol
 * ----------------------------------------------------------------------------
 * Estas pruebas no tocan la base: comprueban la REGLA que decide el piso, que
 * es donde se puede meter la pata sin que nadie lo note. Si un rol del catálogo
 * se quedara sin piso, la pantalla dejaría apagarlo entero y esas personas no
 * podrían trabajar — y eso no se ve al guardar, se ve al día siguiente.
 * ============================================================================
 */

describe('el piso de los roles del catálogo', () => {
  it('todos los roles con plantilla tienen al menos un módulo propio', () => {
    // Un rol sin módulos propios no tiene piso, y entonces el candado no lo
    // protege de nada. Si alguien agrega una plantilla vacía, esto lo detiene.
    for (const p of PLANTILLAS_PERMISOS) {
      expect(p.modulos.length > 0).toBe(true);
    }
  });

  it('los módulos de las plantillas existen en el catálogo', () => {
    /*
     * Un identificador mal escrito en una plantilla no falla en ninguna parte:
     * simplemente no concede nada, y el rol nace más pobre de lo que dice su
     * descripción. Ya pasó con la correspondencia de plantillas por mayúsculas.
     */
    const conocidos = new Set(MODULOS_NEGOCIO.map((m) => m.id));
    conocidos.add(MODULO_OTROS);
    for (const p of PLANTILLAS_PERMISOS) {
      for (const m of [...p.modulos, ...(p.modulosConsulta ?? [])]) {
        expect(conocidos.has(m)).toBe(true);
      }
    }
  });

  it('ningún módulo está a la vez como propio y como consulta', () => {
    // Si estuviera en los dos, el orden de aplicación decidiría el resultado.
    for (const p of PLANTILLAS_PERMISOS) {
      for (const m of p.modulosConsulta ?? []) {
        expect(p.modulos.includes(m)).toBe(false);
      }
    }
  });

  it('el almacenista tiene el almacén como módulo propio', () => {
    // La frase con la que se pidió: «un almacenista, todo lo del almacén».
    const a = PLANTILLAS_PERMISOS.find((p) => p.rol === 'almacenista');
    expect(!!a).toBe(true);
    expect(a!.modulos.includes('inventario')).toBe(true);
  });

  it('recursos humanos no alcanza el almacén, y el almacén no alcanza a recursos humanos', () => {
    const rrhh = PLANTILLAS_PERMISOS.find((p) => p.rol === 'rrhh')!;
    const alm = PLANTILLAS_PERMISOS.find((p) => p.rol === 'almacenista')!;
    const todo = (p: typeof rrhh) => [...p.modulos, ...(p.modulosConsulta ?? [])];
    expect(todo(rrhh).includes('inventario')).toBe(false);
    expect(todo(alm).includes('rrhh')).toBe(false);
  });

  it('ningún rol que no sea de administración trae el módulo de administración', () => {
    /*
     * `administracion` son usuarios, permisos y auditoría. Que un rol operativo
     * lo traiga por descuido significa que esa persona puede darse a sí misma
     * cualquier otro permiso, y entonces el resto del catálogo no significa
     * nada.
     */
    for (const p of PLANTILLAS_PERMISOS) {
      const todo = [...p.modulos, ...(p.modulosConsulta ?? [])];
      if (todo.includes('administracion')) {
        expect(['direccion', 'gerencia'].includes(p.rol)).toBe(true);
      }
    }
  });

  it('los roles no se repiten', () => {
    const vistos = new Set<string>();
    for (const p of PLANTILLAS_PERMISOS) {
      expect(vistos.has(p.rol)).toBe(false);
      vistos.add(p.rol);
    }
  });

  it('cada rol tiene etiqueta y descripción para la pantalla', () => {
    for (const p of PLANTILLAS_PERMISOS) {
      expect(p.etiqueta.length > 0).toBe(true);
      expect(p.descripcion.length > 0).toBe(true);
    }
  });
});
