/**
 * ============================================================================
 * Medio traspaso cancelado
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Un traspaso entre cuentas escribe **dos** movimientos —la salida en la cuenta
 * de origen y la entrada en la de destino— y **una sola póliza** con los dos
 * lados. Eso último está bien pensado y se explica en el propio código: dos
 * pólizas independientes dejarían medio traspaso contabilizado si la segunda
 * fallara.
 *
 * Pero ninguno de los dos movimientos llevaba `tipoDocumento`. Y sin
 * `tipoDocumento`, `cancelar()` los trata como movimientos capturados a mano:
 * la pantalla ofrece el botón y el servidor lo acepta, **pierna por pierna**.
 *
 * Cancelar sólo la salida devuelve el dinero a la cuenta de origen y lo deja
 * también en la de destino: el mismo importe existe dos veces. Cancelar sólo la
 * entrada lo hace desaparecer. Y en los dos casos **la póliza del traspaso
 * queda intacta**, afirmando que el traspaso ocurrió entero.
 *
 * Es la misma avería que «un movimiento que no es suyo», una puerta más allá:
 * se arregló el caso del documento de otro módulo y quedó el del documento que
 * tesorería genera para sí misma.
 *
 * LA REGLA
 *
 * Las dos piernas nacen marcadas como `TRASPASO_TESORERIA` y enlazadas por
 * `documentoId` a la salida, que es la que lleva la póliza. Con eso entran por
 * la misma puerta que los demás documentos y la negativa dice por qué.
 *
 * Y dice la verdad: **el ERP no tiene reversa de traspasos**. Nombrar una
 * pantalla que no existe cuesta más que la propia negativa.
 * ============================================================================
 */

import { ConflictException } from '@nestjs/common';
import { EstadoConciliacion } from './entities/tesoreria.entity';
import { TesoreriaService } from './services/tesoreria.service';

describe('medio traspaso cancelado', () => {
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

  const pierna = (extra: Record<string, unknown> = {}) => ({
    id: 'm1',
    empresaId: 'e1',
    folio: 'MOV-1',
    cuentaBancariaId: 'c1',
    fecha: new Date('2026-09-20'),
    tipo: 'TRASPASO_SALIDA',
    origen: 'TRASPASO',
    importe: 5000,
    cancelado: false,
    estadoConciliacion: EstadoConciliacion.PENDIENTE,
    tipoDocumento: 'TRASPASO_TESORERIA',
    ...extra,
  });

  it('ninguna de las dos piernas se cancela por separado', async () => {
    for (const tipo of ['TRASPASO_SALIDA', 'TRASPASO_ENTRADA']) {
      const { s, guardados } = servicio(pierna({ tipo }));
      await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Y no escribió nada: ni la marca ni la contrapartida.
      expect(guardados).toHaveLength(0);
    }
  });

  it('la negativa dice que es un traspaso y qué pasaría', async () => {
    const { s } = servicio(pierna());
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /traspaso entre cuentas/i,
    );
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /otra mitad|la otra/i,
    );
  });

  it('y no inventa una pantalla de reversa que no existe', async () => {
    const { s } = servicio(pierna());
    await expect(s.cancelar('m1', 'me equivoqué', 'e1', 'u1')).rejects.toThrow(
      /no tiene reversa de traspasos/i,
    );
  });

  it('el traspaso marca sus dos piernas al escribirlas', () => {
    /*
     * La regla no sirve de nada si quien crea el traspaso no la aplica: el
     * movimiento nacería sin `tipoDocumento` y volvería a ser cancelable.
     * Se mide sobre el código de `transferir()`, que es quien las escribe.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'services', 'tesoreria.service.ts'),
      'utf8',
    ) as string;

    const desde = fuente.indexOf('async traspasar');
    expect(desde).toBeGreaterThan(-1);
    const cuerpo = fuente.slice(desde, fuente.indexOf('async saldoActual', desde));

    const marcas = cuerpo.match(/tipoDocumento:\s*'TRASPASO_TESORERIA'/g) ?? [];
    expect(marcas).toHaveLength(2); // la salida y la entrada
    // Y la entrada apunta a la salida, que es la que lleva la póliza.
    expect(cuerpo).toMatch(/documentoId:\s*salida[!?]*\.id/);
  });

  it('la migración que marca los traspasos viejos no inventa nada', () => {
    /*
     * Los traspasos que ya están en la base nacieron sin marca y seguirían
     * siendo cancelables de a una pierna. La migración copia un hecho que ya es
     * cierto —`origen = 'TRASPASO'`— y no toca ninguna otra cosa.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '..',
        'database',
        'migrations',
        'postgres',
        '1790540000000-MedioTraspasoCancelado.ts',
      ),
      'utf8',
    ) as string;
    expect(fuente).toMatch(/origen\s*=\s*'TRASPASO'/);
    expect(fuente).toMatch(/tipodocumento IS NULL/i);
    expect(fuente).toMatch(/to_regclass/);
  });
});
