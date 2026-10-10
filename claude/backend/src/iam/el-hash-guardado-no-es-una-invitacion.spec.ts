/**
 * ============================================================================
 * El hash guardado no es, él mismo, una invitación
 * ----------------------------------------------------------------------------
 * La columna `tokenVerificacion` guarda `sha256(token)` precisamente para que
 * quien vea la base no pueda activar cuentas ajenas. Pero las dos consultas que
 * resuelven una invitación buscaban con:
 *
 *     tokenVerificacion: In([this.hashToken(token), token])
 *
 * La segunda rama compara el valor CRUDO contra la columna. Presentar el hash
 * almacenado —el que ve cualquiera con lectura a la tabla, un respaldo, un
 * volcado de soporte o un log de consultas— encontraba la fila y activaba la
 * cuenta con la contraseña que el atacante quisiera. El hash dejaba de proteger
 * y pasaba a ser una credencial en claro.
 *
 * Esta prueba ejecuta el servicio con un repositorio doble que se comporta como
 * la base: devuelve la fila sólo cuando lo que se consulta es igual a lo que
 * está guardado.
 * ============================================================================
 */
import * as crypto from 'crypto';
import { NotFoundException } from '@nestjs/common';

import { UsuariosService } from './services/usuarios.service';

const TOKEN = 'a'.repeat(64);
const GUARDADO = crypto.createHash('sha256').update(TOKEN).digest('hex');

function armar() {
  const fila: any = {
    id: 'u1',
    nombre: 'Ana',
    email: 'ana@ejemplo.mx',
    rol: 'empleado',
    tokenVerificacion: GUARDADO,
    tokenExpira: new Date(Date.now() + 3_600_000),
  };
  const usuarioRepo: any = {
    findOne: async ({ where }: any) =>
      where?.tokenVerificacion === fila.tokenVerificacion ? fila : null,
    save: async (x: unknown) => x,
  };
  /*
   * `AUTH_MODE` se lee con `get('AUTH_MODE', 'keycloak')`: un doble que
   * devuelva «el valor por omisión» devuelve keycloak, y entonces
   * `aceptarInvitacion` se detiene antes de mirar el token —las contraseñas
   * las administra SUMA— y la prueba pasaba por la razón equivocada. Aquí se
   * fija `local`, que es el único modo en el que esta puerta existe.
   */
  const config: any = {
    get: (clave: string, d?: string) => (clave === 'AUTH_MODE' ? 'local' : d),
  };
  const servicio = new UsuariosService(
    usuarioRepo, {} as any, config, {} as any, {} as any, {} as any,
  );
  return { servicio, fila };
}

describe('Invitación · lo que abre la cuenta es el token, no lo que guarda la base', () => {
  it('el token que recibió la persona resuelve su invitación', async () => {
    const { servicio } = armar();
    const datos: any = await servicio.obtenerInvitacion(TOKEN);
    expect(datos.email).toBe('ana@ejemplo.mx');
  });

  it('el valor GUARDADO en la columna no resuelve nada', async () => {
    /*
     * Éste es el defecto, escrito como no puede volver. Si alguien reintroduce
     * el `In([hash, token])`, esta llamada deja de fallar.
     */
    const { servicio } = armar();
    await expect(servicio.obtenerInvitacion(GUARDADO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('y tampoco activa la cuenta', async () => {
    const { servicio, fila } = armar();
    await expect(
      servicio.aceptarInvitacion(GUARDADO, 'Contrasena-Larga-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fila.activo).toBeUndefined();
    expect(fila.tokenVerificacion).toBe(GUARDADO);
  });
});
