/**
 * ============================================================================
 * Un movimiento que no es suyo
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La pantalla de Tesorería → Movimientos ofrecía el botón de cancelar en TODOS
 * los renglones. Y `cancelar()` hace exactamente una cosa: marca el movimiento
 * y escribe una contrapartida en tesorería. No toca el documento que lo
 * originó, y nadie en el sistema mira después si ese movimiento quedó
 * cancelado —los documentos guardan `movimientoTesoreriaId` y no vuelven a
 * leerlo nunca—.
 *
 * Así que dos clics bastaban para esto: cancelar el movimiento de un pago a
 * proveedor devolvía el saldo al banco y dejaba la orden de compra diciendo que
 * está pagada. Dos subsistemas afirmando cosas contrarias, cada uno coherente
 * por dentro, y ninguna pantalla donde se vea la diferencia. Aparece meses
 * después, en una conciliación, cuando ya nadie recuerda qué pasó. Lo mismo con
 * una venta, con un cobro de cobranza o con una dispersión de nómina.
 *
 * Y el enum `EstadoContablePagoProveedor.REVERTIDO` existe desde siempre, sin
 * que ningún camino lo escriba: el sistema tenía nombre para este estado y no
 * tenía forma de llegar a él. «Un estado que nadie escribe», otra vez.
 *
 * LA REGLA
 *
 * Se cancela el DOCUMENTO, y el documento cancela su movimiento. No al revés.
 * Es lo que ya hace `CobranzaService.cancelarPago`, que deshace el reparto
 * entre cuotas y después toca tesorería. Lo que faltaba era cerrar la puerta de
 * atrás.
 *
 * Y la negativa dice DÓNDE se deshace cada documento; donde el ERP no tiene esa
 * pantalla —hoy, el pago a proveedor— lo dice también, en vez de inventar un
 * remedio. Mandar a alguien a una puerta que no está en la pared cuesta más que
 * la propia negativa, y este proyecto ya lo ha pagado varias veces.
 * ============================================================================
 */

import { ConflictException } from '@nestjs/common';
import { EstadoConciliacion } from './entities/tesoreria.entity';
import { TesoreriaService } from './services/tesoreria.service';

describe('un movimiento que no es suyo', () => {
  function servicio(movimiento: Record<string, unknown>) {
    const guardados: Record<string, unknown>[] = [];
    const s = Object.create(TesoreriaService.prototype) as Record<string, unknown>;
    s.movimientos = { findOne: () => Promise.resolve(movimiento) };
    s.dataSource = {
      transaction: (cuerpo: (m: unknown) => Promise<unknown>) =>
        cuerpo({
          getRepository: () => ({
            save: (x: Record<string, unknown>) => {
              guardados.push(x);
              return Promise.resolve(x);
            },
            create: (x: Record<string, unknown>) => x,
          }),
        }),
    };
    s.siguienteFolio = () => Promise.resolve('MOV-999');
    s.recalcularSaldos = () => Promise.resolve(undefined);
    return { s: s as unknown as TesoreriaService, guardados };
  }

  const movimiento = (extra: Record<string, unknown> = {}) => ({
    id: 'm1',
    empresaId: 'e1',
    folio: 'MOV-1',
    cuentaBancariaId: 'c1',
    fecha: new Date('2026-09-20'),
    tipo: 'EGRESO',
    origen: 'MANUAL',
    importe: 1000,
    cancelado: false,
    estadoConciliacion: EstadoConciliacion.PENDIENTE,
    ...extra,
  });

  it('el movimiento de un pago a proveedor no se cancela desde tesorería', async () => {
    const { s, guardados } = servicio(
      movimiento({ tipoDocumento: 'PAGO_PROVEEDOR', documentoId: 'p1' }),
    );
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Y no escribió NADA: ni la marca ni la contrapartida.
    expect(guardados).toHaveLength(0);
  });

  it('la negativa dice qué lo generó y qué pasaría si se cancelara', async () => {
    const { s } = servicio(movimiento({ tipoDocumento: 'PAGO_PROVEEDOR' }));
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /pago a proveedor/i,
    );
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /dinero sí se movió/i,
    );
  });

  it('cuando hay dónde deshacerlo, lo nombra', async () => {
    const { s } = servicio(movimiento({ tipoDocumento: 'VENTA' }));
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /Anula la venta/i,
    );
  });

  it('cuando NO hay dónde, lo dice en vez de inventarlo', async () => {
    /*
     * La tentación es escribir «deshazlo desde Compras». No existe: el ERP no
     * tiene reversa de pagos a proveedor. Nombrar una pantalla inexistente
     * manda a alguien a buscar media hora algo que no está.
     */
    const { s } = servicio(movimiento({ tipoDocumento: 'PAGO_PROVEEDOR' }));
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /todavía no tiene reversa de pagos a proveedor/i,
    );
  });

  it('un documento que nadie declaró tampoco se cancela, y se dice cuál es', async () => {
    /*
     * La tabla de documentos se mantiene a mano, así que puede quedarse corta
     * cuando alguien añada un origen nuevo. Quedarse corta NO puede significar
     * «entonces déjalo pasar»: el fallo seguro es negar y decir el tipo.
     */
    const { s, guardados } = servicio(movimiento({ tipoDocumento: 'ALGO_NUEVO' }));
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(/ALGO_NUEVO/);
    expect(guardados).toHaveLength(0);
  });

  it('un movimiento registrado a mano SÍ se cancela: para eso está', async () => {
    const { s, guardados } = servicio(movimiento());
    const r = (await s.cancelar('m1', 'lo capturé dos veces', 'e1', 'u1')) as unknown as {
      contrapartida: { tipo: string; importe: number };
    };
    expect(r.contrapartida.tipo).toBe('INGRESO'); // el inverso de EGRESO
    expect(r.contrapartida.importe).toBe(1000);
    // El original marcado y la contrapartida escrita.
    expect(guardados).toHaveLength(2);
    expect(guardados[0].cancelado).toBe(true);
    expect(guardados[0].motivoCancelacion).toBe('lo capturé dos veces');
  });

  it('la pantalla no ofrece el botón que el servidor va a negar', () => {
    /*
     * La otra mitad. Un botón que lleva a una negativa es la familia que más
     * veces ha aparecido en este proyecto: el servidor se defiende y la persona
     * llega hasta el final para oír que no.
     */
    const { existsSync, readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
      .map((n) => join(RAIZ, n))
      .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/tesoreria/movimientos/page.tsx'),
      'utf8',
    );
    expect(pantalla).toMatch(/m\.tipoDocumento\s*\?/);
    // Y el botón queda en la rama del movimiento capturado a mano.
    const desde = pantalla.indexOf('m.tipoDocumento ?');
    expect(pantalla.slice(desde, desde + 900)).toMatch(/setACancelar\(m\)/);
  });
});
