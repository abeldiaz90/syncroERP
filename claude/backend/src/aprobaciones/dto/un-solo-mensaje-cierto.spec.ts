/**
 * ============================================================================
 * Rechazar sin motivo tiene que decir UNA cosa, y que sea cierta
 * ----------------------------------------------------------------------------
 * Medido el 25-sep-2026 contra la instalacion, con la sesion de gerencia:
 *
 *   PATCH /api/aprobaciones/<id>/resolver  {"estado":"RECHAZADA"}
 *   → 400 [
 *       "comentario: comentario must be shorter than or equal to 500 characters",
 *       "comentario: Al rechazar hay que decir por que: escribe el motivo...",
 *       "comentario: comentario must be a string"
 *     ]
 *
 * Dos de los tres son falsos. La regla estaba bien escrita; lo que estaba mal
 * era lo que la persona leia. Un error que dice tres cosas y dos no son verdad
 * entrena a no leer los errores, que es como se pierden los que si importan.
 * ============================================================================
 */

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ResolverAprobacionDocumentoDto } from './resolver-aprobacion-documento.dto';
import { ResolverAprobacionRequisicionDto } from '../../compras/dto/resolver-aprobacion.dto';

const mensajes = (dto: object) =>
  validateSync(dto as never).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('Resolver una aprobacion · el motivo del rechazo', () => {
  it('rechazar sin motivo devuelve un unico mensaje, y es el verdadero', () => {
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'RECHAZADA',
    });

    const errores = mensajes(dto);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/escribe el motivo/i);
    // Lo que ya no puede volver a aparecer:
    expect(errores.join(' ')).not.toMatch(/must be a string/);
    expect(errores.join(' ')).not.toMatch(/shorter than or equal/);
  });

  it('lo mismo en la ruta de compras, que comparte la regla', () => {
    const dto = plainToInstance(ResolverAprobacionRequisicionDto, {
      estado: 'RECHAZADO',
    });

    const errores = mensajes(dto);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/escribe el motivo/i);
  });

  it('rechazar con cadena vacia dice lo mismo, no otra cosa', () => {
    // Es lo que manda el navegador cuando el campo existe y esta en blanco.
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'RECHAZADA',
      comentario: '   ',
    });

    const errores = mensajes(dto);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/escribe el motivo/i);
  });

  it('aprobar sin comentario no exige nada', () => {
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'APROBADA',
    });

    expect(mensajes(dto)).toEqual([]);
  });

  it('rechazar con motivo pasa', () => {
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'RECHAZADA',
      comentario: '  Falta el estado de cuenta del banco.  ',
    });

    expect(mensajes(dto)).toEqual([]);
    expect(dto.comentario).toBe('Falta el estado de cuenta del banco.');
  });

  it('un motivo kilometrico se rechaza en castellano', () => {
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'RECHAZADA',
      comentario: 'x'.repeat(501),
    });

    const errores = mensajes(dto);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/500 caracteres/);
  });

  it('el motivo que llega como numero sigue siendo un tipo equivocado', () => {
    /*
     * La conversion de «ausente» a «vacio» es solo para la ausencia. Un cuerpo
     * con `comentario: 7` es un cliente mal escrito y tiene que decirse.
     */
    const dto = plainToInstance(ResolverAprobacionDocumentoDto, {
      estado: 'RECHAZADA',
      comentario: 7,
    });

    const errores = mensajes(dto);

    expect(errores).toHaveLength(1);
    expect(errores[0]).toBe('El motivo debe ser texto.');
  });
});
