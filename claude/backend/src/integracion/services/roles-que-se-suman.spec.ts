import { RolesExternosService } from './roles-externos.service';

/**
 * ============================================================================
 * Un botón del ERP no reparte autoridad dentro del core
 * ----------------------------------------------------------------------------
 * El PUT de Fineract REEMPLAZA la lista entera de roles. Eso ya costó una vez:
 * al «corregir roles» sobre un administrador que operaba bien, el core se
 * quedó contestando «User has no authority to READ roles». La lección se
 * escribió en `aprovisionar` —con su cicatriz en el comentario— y su hermana
 * `aprovisionarCuentaServicio` siguió mandando el PUT crudo: la misma decisión
 * escrita dos veces, y sólo una copia aprendió.
 *
 * Importa más allá de aquel susto. Hay instalaciones donde Fineract es el
 * sistema de registro y su administrador reparte allí la autoridad; un botón
 * del ERP que reemplaza la lista se lleva por delante lo que concedieron en un
 * sistema que no es suyo, y sin dejar constancia.
 * ============================================================================
 */
describe('Los roles del core se suman, no se reemplazan', () => {
  function arnes(rolesActuales: string[]) {
    const asignados: string[][] = [];
    const externos = {
      proveedor: 'fineract',
      usuarioDeServicio: async () => 'service-account-syncro-erp-service',
      buscarUsuario: async () => ({
        id: '77',
        roles: rolesActuales.map((id) => ({ id })),
      }),
      asignarRoles: async (_id: string, roles: string[]) => {
        asignados.push(roles);
      },
    };
    const servicio = Object.create(
      RolesExternosService.prototype,
    ) as RolesExternosService;
    const campos = servicio as unknown as Record<string, unknown>;
    campos.externos = externos;
    campos.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    campos.exigirContratado = async () => undefined;
    return { servicio, asignados };
  }

  it('la cuenta de servicio conserva lo que ya tenía en el core', async () => {
    // 9 es un rol que alguien concedió del lado de Fineract; el mapa del ERP
    // no lo conoce y no tiene por qué quitarlo.
    const { servicio, asignados } = arnes(['9']);
    const r = await servicio.aprovisionarCuentaServicio('e1', ['4']);

    expect(asignados).toHaveLength(1);
    expect([...asignados[0]].sort()).toEqual(['4', '9']);
    expect(r.accion).toBe('ROLES_ACTUALIZADOS');
    expect(r.rolesAgregados).toEqual(['4']);
  });

  /*
   * Y no toca nada cuando no hay nada que agregar: un PUT que no cambia la
   * lista es una escritura en un sistema ajeno a cambio de cero.
   */
  it('no escribe en el core si los roles del mapa ya están', async () => {
    const { servicio, asignados } = arnes(['4', '9']);
    const r = await servicio.aprovisionarCuentaServicio('e1', ['4']);

    expect(asignados).toHaveLength(0);
    expect(r.accion).toBe('YA_ESTABA');
  });
});
