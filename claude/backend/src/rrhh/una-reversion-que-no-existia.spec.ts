/**
 * ============================================================================
 * Una reversión que no existía
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se aprobó una incidencia de prueba —una falta de un día, sin goce— y al
 * intentar retirarla el sistema contestó, con toda razón aparente:
 *
 *     «Una incidencia aprobada debe cancelarse mediante reversión, no
 *      rechazarse.»
 *
 * Y la reversión NO EXISTÍA. Ni endpoint, ni método, ni nada: el controlador
 * sólo tenía `aprobar` y `rechazar`. El mensaje mandaba a una puerta que no
 * está en la pared.
 *
 * Es la familia de siempre vista del revés: no un botón que lleva a un no, sino
 * un no que nombra un remedio inexistente. Y aquí cuesta dinero de alguien: una
 * falta de cinco días aprobada por error le quita cinco días de sueldo a un
 * trabajador y no había forma de deshacerlo salvo entrando a la base de datos.
 *
 * QUÉ SE HIZO
 *
 * Existe la reversión, y con la misma regla que el resto del módulo:
 *
 *  · Sólo se revierte lo APROBADA. Lo capturado se rechaza; lo ya cancelado o
 *    rechazado no se toca.
 *  · Se exige motivo, y queda asentado quién y cuándo. Retirar algo que alguien
 *    aprobó no puede ser anónimo.
 *  · **No se revierte si su periodo de nómina ya se calculó.** Ahí la
 *    incidencia ya movió un recibo, y borrarla por detrás dejaría el recibo
 *    diciendo una cosa y la incidencia otra. Se dice que primero hay que
 *    revertir el periodo, que es exactamente lo que el propio cálculo contesta
 *    cuando alguien intenta recalcular un periodo aprobado.
 * ============================================================================
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoPeriodo } from './entities/rrhh.entity';
import { RrhhService } from './services/rrhh.service';

describe('una reversión que no existía', () => {
  function servicio(
    incidencia: Record<string, unknown> | null,
    periodos: Array<Record<string, unknown>> = [],
  ) {
    const guardadas: Array<Record<string, unknown>> = [];
    const s = Object.create(RrhhService.prototype) as Record<string, unknown>;
    s.incidencias = {
      findOne: () => Promise.resolve(incidencia),
      save: (x: Record<string, unknown>) => {
        guardadas.push(x);
        return Promise.resolve(x);
      },
    };
    s.periodos = {
      find: () => Promise.resolve(periodos),
    };
    return { s: s as unknown as RrhhService, guardadas };
  }

  const aprobada = () => ({
    id: 'i1',
    empresaId: 'e1',
    estadoAprobacion: 'APROBADA',
    aprobada: true,
    fechaInicio: new Date('2026-10-06'),
    fechaFin: new Date('2026-10-06'),
  });

  it('revierte una incidencia aprobada, con motivo y firma', async () => {
    const { s, guardadas } = servicio(aprobada(), [
      { estado: EstadoPeriodo.ABIERTO },
    ]);
    await s.revertirIncidencia('i1', 'Se aprobó por error', 'u9', 'e1');

    expect(guardadas).toHaveLength(1);
    const g = guardadas[0];
    expect(g.estadoAprobacion).toBe('CANCELADA');
    expect(g.aprobada).toBe(false);
    expect(g.motivoRechazo).toBe('Se aprobó por error');
    expect(g.rechazadaPorId).toBe('u9');
    expect(g.fechaRechazo).toBeInstanceOf(Date);
  });

  it('no revierte si el periodo de nómina ya se calculó', async () => {
    for (const estado of [
      EstadoPeriodo.CALCULADO,
      EstadoPeriodo.APROBADO,
      EstadoPeriodo.EN_REVISION,
    ]) {
      const { s, guardadas } = servicio(aprobada(), [{ estado }]);
      await expect(
        s.revertirIncidencia('i1', 'Se aprobó por error', 'u9', 'e1'),
      ).rejects.toBeInstanceOf(ConflictException);
      // Y sobre todo: no escribe nada.
      expect(guardadas).toHaveLength(0);
    }
  });

  it('sólo se revierte lo aprobado', async () => {
    for (const estadoAprobacion of ['CAPTURADA', 'RECHAZADA', 'CANCELADA']) {
      const { s } = servicio({ ...aprobada(), estadoAprobacion });
      await expect(
        s.revertirIncidencia('i1', 'motivo suficiente', 'u9', 'e1'),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('una incidencia que no existe se dice como tal', async () => {
    const { s } = servicio(null);
    await expect(
      s.revertirIncidencia('i1', 'motivo suficiente', 'u9', 'e1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el rechazo sigue nombrando la reversión, que ahora existe', () => {
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'services', 'rrhh.service.ts'),
      'utf8',
    ) as string;
    expect(fuente).toMatch(/debe cancelarse mediante reversión/);
    expect(fuente).toMatch(/async revertirIncidencia/);
  });
});
