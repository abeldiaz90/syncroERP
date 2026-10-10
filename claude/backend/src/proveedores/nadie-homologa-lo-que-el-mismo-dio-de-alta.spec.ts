import { ForbiddenException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

/**
 * ============================================================================
 * Nadie homologa el proveedor que él mismo dio de alta
 * ----------------------------------------------------------------------------
 * EL CASO — hallazgo #11 del barrido, abierto desde el 5-oct-2026
 *
 * La homologación de un proveedor es un control: alguien distinto revisa y
 * aprueba. Sólo que no había forma de comprobar que fuera distinto, porque
 * `Proveedor` no guardaba quién lo había creado. El hallazgo quedó parado ahí
 * —«necesita migración»— y el control siguió existiendo de nombre.
 *
 * Sin esto, quien quiera meter un proveedor se lo da de alta y se lo aprueba en
 * dos clics. El expediente queda con dos firmas que son la misma persona, y
 * nada en la pantalla lo dice.
 *
 * TRES COSAS QUE SE DECIDIERON, Y POR QUÉ
 *
 *  1. **Ni siquiera el administrador.** La comprobación de rol dice quién PUEDE
 *     homologar; ésta dice sobre QUÉ no puede. Un administrador que se salta su
 *     propia separación de funciones la convierte en una sugerencia.
 *  2. **`creadoPorId` en nulo no es «no fue el mismo».** Las filas anteriores a
 *     la columna no se sabe quién las creó. Se dejan pasar —bloquear
 *     retroactivamente a todo el catálogo sería peor que el agujero— pero se
 *     anota en el comentario, para que el expediente no afirme un control que
 *     no se pudo comprobar.
 *  3. **El creador no viaja en el cuerpo.** Sale de la sesión. Un dato que el
 *     cliente pudiera elegir no controla nada.
 * ============================================================================
 */

type Fila = Record<string, unknown>;

function montar(proveedor: Fila) {
  const guardado: Fila[] = [];
  const repo = {
    create: (x: Fila) => x,
    save: async (x: Fila) => {
      guardado.push(x);
      return x;
    },
    findOne: async () => proveedor,
    createQueryBuilder: () => ({ where: () => ({ getMany: async () => [] }) }),
  };
  const servicio = new ProveedoresService(
    repo as never,
    { findOne: async () => null } as never,
    { findOne: async () => null } as never,
  );
  return { servicio, guardado };
}

const DTO = { estado: 'APROBADO' as const, nivelRiesgo: 'BAJO', comentario: 'Todo en regla' };

describe('nadie homologa el proveedor que él mismo dio de alta', () => {
  it('el creador no puede homologarlo, aunque su rol le deje homologar', async () => {
    const { servicio } = montar({
      id: 'p1',
      empresaId: 'e1',
      creadoPorId: 'ana',
      estadoHomologacion: 'EN_EVALUACION',
    });

    await expect(
      servicio.resolverHomologacion('p1', DTO as never, 'e1', 'ana', 'COMPRAS'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ni aunque sea administrador', async () => {
    /*
     * Es la decisión que más se discute y la que sostiene el control: el
     * administrador puede homologar proveedores, pero no LOS SUYOS.
     */
    const { servicio } = montar({
      id: 'p1',
      empresaId: 'e1',
      creadoPorId: 'ana',
      estadoHomologacion: 'EN_EVALUACION',
    });

    await expect(
      servicio.resolverHomologacion('p1', DTO as never, 'e1', 'ana', 'administrador'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('otra persona sí puede, que es de lo que se trata', async () => {
    const { servicio, guardado } = montar({
      id: 'p1',
      empresaId: 'e1',
      creadoPorId: 'ana',
      estadoHomologacion: 'EN_EVALUACION',
    });

    await servicio.resolverHomologacion('p1', DTO as never, 'e1', 'beto', 'COMPRAS');
    expect(guardado[0].estadoHomologacion).toBe('APROBADO');
    expect(guardado[0].homologacionResueltaPorId).toBe('beto');
  });

  it('sin saber quién lo creó, se deja pasar y se dice', async () => {
    /*
     * «No saber no es que no». Bloquear todo el catálogo heredado sería peor
     * que el agujero; callarlo sería afirmar un control que no se comprobó.
     */
    const { servicio, guardado } = montar({
      id: 'p1',
      empresaId: 'e1',
      creadoPorId: null,
      estadoHomologacion: 'EN_EVALUACION',
    });

    await servicio.resolverHomologacion('p1', DTO as never, 'e1', 'ana', 'COMPRAS');
    expect(guardado[0].estadoHomologacion).toBe('APROBADO');
    expect(String(guardado[0].comentarioHomologacion)).toContain(
      'No se pudo comprobar quién dio de alta',
    );
  });

  it('el alta guarda quién la hizo, y no lo toma del cuerpo', async () => {
    const { servicio, guardado } = montar({});
    await servicio.crear(
      { nombre: 'Tornillos SA', creadoPorId: 'el-que-yo-diga' } as never,
      'e1',
      'ana',
    );
    expect(guardado[0].creadoPorId).toBe('ana');
    expect(guardado[0].empresaId).toBe('e1');
  });

  describe('la prueba de la prueba', () => {
    it('sin el control, el creador habría podido aprobarlo', async () => {
      /*
       * Se reconstruye la condición para dejar escrito qué es lo que se mira.
       * Si alguien la relaja —por ejemplo exceptuando al administrador— esto
       * deja de describir lo que el código hace.
       */
      const prohibido = (creadoPorId: string | null, quienResuelve: string) =>
        !!creadoPorId && creadoPorId === quienResuelve;

      expect(prohibido('ana', 'ana')).toBe(true);
      expect(prohibido('ana', 'beto')).toBe(false);
      expect(prohibido(null, 'ana')).toBe(false);
    });
  });
});
