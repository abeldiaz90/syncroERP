import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';

/**
 * ============================================================================
 * El controlador de sesión
 * ----------------------------------------------------------------------------
 * Esta especificación simulaba `registrarEmpresa`, que ya no existe: el alta
 * pública se retiró cuando quedó claro que una empresa podía nacer sin pasar por
 * la consola de SUMA —sin plan contratado, sin inquilino y sin identidad en el
 * directorio—. Además le faltaba `ConfigService`, así que el módulo de pruebas
 * ni siquiera arrancaba.
 *
 * Lo que se prueba ahora es lo que de verdad decide este controlador: que con
 * identidad delegada en Keycloak **no** se atienda ninguna autenticación local.
 * Es la puerta que impide que sobreviva un camino de contraseñas paralelo al
 * directorio.
 * ============================================================================
 */
describe('AuthController', () => {
  const construir = async (authMode: string) => {
    const modulo: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(async () => ({
              access_token: 'token-simulado',
              usuario: { id: '1', rol: 'admin', empresaId: 'emp-1' },
            })),
          },
        },
        {
          provide: PermisosDinamicosService,
          useValue: {
            obtenerPermisosPorRolParaFrontend: jest.fn(),
            obtenerMenuParaRol: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: (_clave: string, pd?: string) => authMode ?? pd },
        },
      ],
    }).compile();
    return modulo.get<AuthController>(AuthController);
  };

  it('existe', async () => {
    expect(await construir('local')).toBeDefined();
  });

  it('en modo local atiende el inicio de sesión', async () => {
    const controlador = await construir('local');
    const r = await controlador.login({
      email: 'alguien@sumamexico.com',
      password: 'lo-que-sea',
    } as never);
    expect((r as { access_token: string }).access_token).toBe('token-simulado');
  });

  it('con identidad en Keycloak NO atiende el inicio de sesión local', async () => {
    /*
     * Si esto dejara de cumplirse, existiría un segundo camino de entrada con
     * contraseñas guardadas aquí, en paralelo al directorio — y las bajas de
     * personal que se hicieran en SUMA no cerrarían ese camino.
     */
    const controlador = await construir('keycloak');
    await expect(
      controlador.login({ email: 'a@b.com', password: 'x' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
