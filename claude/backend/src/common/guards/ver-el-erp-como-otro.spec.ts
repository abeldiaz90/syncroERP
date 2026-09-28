import { SuplantacionGuard } from './suplantacion.guard';
import { CABECERA_SUPLANTACION } from '../../iam/suplantacion/suplantacion.constants';

/**
 * ============================================================================
 * Ver el ERP como otro, sin dejar de ser uno mismo
 * ----------------------------------------------------------------------------
 * Trece roles y una sola sesión no se llevan bien. La mitad de lo que hay que
 * comprobar en este ERP sólo ocurre cuando quien pulsa el botón NO es el
 * administrador —que atraviesa los tres controles de autorización por diseño—,
 * y comprobarlo obligaba a trece inicios de sesión cada vez que se tocaba un
 * permiso. En la práctica significaba que no se comprobaba.
 *
 * Esta prueba mide los límites de la salida, que es lo único que importa aquí:
 * una función así o está acotada del todo o es un agujero.
 *
 *   · Apagada por defecto, y apagada SIEMPRE en producción, aunque alguien
 *     ponga la variable.
 *   · Sólo el administrador.
 *   · Sólo hacia abajo: nunca a otro administrador.
 *   · Nunca fuera de la propia empresa.
 *   · Nunca encadenada.
 *   · Y nunca callada: lo que se escribe suplantando queda a nombre de quien
 *     lo hizo de verdad.
 *
 * Lo que NO se emite: ningún token, ninguna contraseña, ninguna sesión nueva.
 * Keycloak sigue siendo el único que dice quién eres; esto sólo decide con qué
 * autoridad se te atiende durante una petición.
 * ============================================================================
 */

const ADMIN = {
  id: 'admin-1',
  email: 'admin@suma.mx',
  rol: 'ADMINISTRADOR',
  empresaId: 'emp-1',
};

const ALMACENISTA = {
  id: 'alm-1',
  email: 'almacen@suma.mx',
  nombreCompleto: 'Rosa Almacén',
  rol: 'ALMACENISTA',
  empresaId: 'emp-1',
  activo: true,
  empresa: { activo: true },
};

function contexto(peticion: any) {
  return {
    switchToHttp: () => ({ getRequest: () => peticion }),
  } as any;
}

function peticionDe(objetivoId: string, user: any = { ...ADMIN }, extra: any = {}) {
  return {
    headers: { [CABECERA_SUPLANTACION]: objetivoId },
    method: 'GET',
    url: '/api/catalogo/productos',
    user,
    ...extra,
  };
}

function guardiaCon(
  entorno: Record<string, string | undefined>,
  usuarioEncontrado: any = ALMACENISTA,
) {
  const usuarios = { findOne: jest.fn().mockResolvedValue(usuarioEncontrado) };
  const config = { get: (clave: string) => entorno[clave] } as any;
  return {
    guardia: new SuplantacionGuard(config, usuarios as any),
    usuarios,
  };
}

const DESARROLLO = { NODE_ENV: 'development', SUPLANTACION_HABILITADA: 'true' };

describe('Suplantación · ver el ERP como otro', () => {
  describe('cuándo está disponible', () => {
    it('sin cabecera no hace nada y no consulta nada', async () => {
      const { guardia, usuarios } = guardiaCon(DESARROLLO);
      const peticion: any = { headers: {}, user: { ...ADMIN } };

      await expect(guardia.canActivate(contexto(peticion))).resolves.toBe(true);
      expect(usuarios.findOne).not.toHaveBeenCalled();
      expect(peticion.user.id).toBe('admin-1');
    });

    it('apagada por defecto: sin la variable puesta, no se atiende', async () => {
      const { guardia } = guardiaCon({ NODE_ENV: 'development' });

      await expect(
        guardia.canActivate(contexto(peticionDe('alm-1'))),
      ).rejects.toThrow(/desactivado/i);
    });

    it('en producción no se enciende ni poniendo la variable', async () => {
      const { guardia } = guardiaCon({
        NODE_ENV: 'production',
        SUPLANTACION_HABILITADA: 'true',
      });

      await expect(
        guardia.canActivate(contexto(peticionDe('alm-1'))),
      ).rejects.toThrow(/desactivado/i);
    });

    it('la negativa se dice, no se calla', async () => {
      /*
       * Ignorar la cabecera en silencio es peor que rechazarla: quien prueba
       * cree estar viendo el ERP como almacenista y lo está viendo como
       * administrador, y se lleva a casa un «sí funciona» que no vale nada.
       */
      const { guardia } = guardiaCon({ NODE_ENV: 'production' });
      const peticion = peticionDe('alm-1');

      await expect(guardia.canActivate(contexto(peticion))).rejects.toThrow();
      expect(peticion.user.id).toBe('admin-1');
    });
  });

  describe('quién puede y a quién', () => {
    it('sólo el administrador', async () => {
      const { guardia } = guardiaCon(DESARROLLO);
      const peticion = peticionDe('alm-1', {
        id: 'cont-1',
        email: 'contador@suma.mx',
        rol: 'CONTADOR',
        empresaId: 'emp-1',
      });

      await expect(guardia.canActivate(contexto(peticion))).rejects.toThrow(
        /administrador/i,
      );
    });

    it('sin sesión no hay a quién suplantar', async () => {
      const { guardia } = guardiaCon(DESARROLLO);
      const peticion = peticionDe('alm-1', null);

      await expect(guardia.canActivate(contexto(peticion))).rejects.toThrow();
    });

    it('nunca hacia otro administrador: esto sólo baja de privilegio', async () => {
      const { guardia } = guardiaCon(DESARROLLO, {
        ...ALMACENISTA,
        id: 'admin-2',
        rol: 'ADMIN',
      });

      await expect(
        guardia.canActivate(contexto(peticionDe('admin-2'))),
      ).rejects.toThrow(/administrador/i);
    });

    it('no se encadena: quien ya está suplantando no salta a otro rol', async () => {
      const { guardia } = guardiaCon(DESARROLLO);
      const peticion = peticionDe('cajero-1', {
        ...ALMACENISTA,
        suplantacion: {
          realId: 'admin-1',
          realEmail: 'admin@suma.mx',
          realRol: 'ADMINISTRADOR',
        },
      });

      await expect(guardia.canActivate(contexto(peticion))).rejects.toThrow();
    });

    it('una cuenta desactivada no se suplanta: no diría nada cierto', async () => {
      const { guardia } = guardiaCon(DESARROLLO, {
        ...ALMACENISTA,
        activo: false,
      });

      await expect(
        guardia.canActivate(contexto(peticionDe('alm-1'))),
      ).rejects.toThrow(/desactivada/i);
    });

    it('verse a uno mismo no es suplantar', async () => {
      const { guardia } = guardiaCon(DESARROLLO, {
        ...ALMACENISTA,
        id: 'admin-1',
        rol: 'ALMACENISTA',
      });

      await expect(
        guardia.canActivate(contexto(peticionDe('admin-1'))),
      ).rejects.toThrow();
    });
  });

  describe('la empresa no se cruza', () => {
    it('la empresa sale de la sesión, nunca de la cabecera', async () => {
      const { guardia, usuarios } = guardiaCon(DESARROLLO);

      await guardia.canActivate(contexto(peticionDe('alm-1')));

      expect(usuarios.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empresaId: 'emp-1' }),
        }),
      );
    });

    it('un id de otra empresa simplemente no se encuentra', async () => {
      const { guardia } = guardiaCon(DESARROLLO, null);

      await expect(
        guardia.canActivate(contexto(peticionDe('de-otra-empresa'))),
      ).rejects.toThrow(/no existe en tu empresa/i);
    });
  });

  describe('lo que los guardias de autorización ven después', () => {
    it('ven al suplantado, que es justo lo que se quiere probar', async () => {
      const { guardia } = guardiaCon(DESARROLLO);
      const peticion = peticionDe('alm-1');

      await expect(guardia.canActivate(contexto(peticion))).resolves.toBe(true);

      expect(peticion.user.id).toBe('alm-1');
      expect(peticion.user.rol).toBe('ALMACENISTA');
      expect(peticion.user.empresaId).toBe('emp-1');
      expect(peticion.user.email).toBe('almacen@suma.mx');
    });

    it('y el rastro de quién lo hizo de verdad viaja con la petición', async () => {
      const { guardia } = guardiaCon(DESARROLLO);
      const peticion = peticionDe('alm-1');

      await guardia.canActivate(contexto(peticion));

      expect(peticion.user.suplantacion).toEqual({
        realId: 'admin-1',
        realEmail: 'admin@suma.mx',
        realRol: 'ADMINISTRADOR',
      });
    });
  });
});
