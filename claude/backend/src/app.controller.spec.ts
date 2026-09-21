import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Lo que se prueba aquí no es que el endpoint devuelva algo, sino que
 * distinga viveza de disponibilidad: un proceso vivo con la base caída tiene
 * que responder 503, no 200. Es la diferencia entre que el orquestador deje de
 * mandarle tráfico y que le siga mandando peticiones que van a fallar.
 */
async function construir(consulta: () => Promise<unknown>) {
  const modulo: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      AppService,
      { provide: getDataSourceToken(), useValue: { query: consulta } as unknown as DataSource },
    ],
  }).compile();
  return modulo.get<AppController>(AppController);
}

describe('AppController', () => {
  it('la viveza no consulta la base', async () => {
    const consulta = jest.fn();
    const controlador = await construir(consulta);

    const respuesta = controlador.viveza();

    expect(respuesta.estado).toBe('vivo');
    expect(typeof respuesta.segundosEnPie).toBe('number');
    expect(consulta).not.toHaveBeenCalled();
  });

  it('con la base arriba, la disponibilidad responde listo', async () => {
    const controlador = await construir(async () => [{ '?column?': 1 }]);
    await expect(controlador.disponibilidad()).resolves.toEqual({
      listo: true,
      base: 'arriba',
    });
  });

  it('con la base caída responde 503, no 200', async () => {
    const controlador = await construir(async () => {
      throw new Error('connection refused');
    });
    await expect(controlador.disponibilidad()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no filtra el error de la base a una ruta pública', async () => {
    const controlador = await construir(async () => {
      throw new Error('password authentication failed for user "postgres"');
    });

    const error = await controlador.disponibilidad().catch((e) => e);
    expect(JSON.stringify(error.getResponse())).not.toContain('password');
  });
});
