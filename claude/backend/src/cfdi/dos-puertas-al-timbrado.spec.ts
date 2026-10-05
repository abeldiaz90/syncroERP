import { BadRequestException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { CfdiService } from './cfdi.service';

/**
 * ============================================================================
 * DOS PUERTAS AL TIMBRADO, Y LA SEGUNDA GASTABA EL CANDADO DE LA PRIMERA
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `POST /cfdi/ventas/:ventaId/timbrar` —la de la pantalla— pasa por
 * `timbrarVenta`, que comprueba tres cosas antes de llamar al motor:
 *
 *   · la venta no está ANULADA;
 *   · lo devuelto no se factura: arma las partidas con
 *     `cantidad − cantidadDevuelta` y se niega si no queda nada;
 *   · los importes y la tasa salen de la venta y del catálogo SAT.
 *
 * `POST /cfdi/timbrar` entregaba `CrearFacturaDto` tal cual al motor —partidas e
 * importes a mano, `ventaId` opcional— y sólo comprobaba que la venta existiera
 * y no tuviera ya un CFDI vigente.
 *
 * LO QUE LO HACÍA PEOR QUE UN SIMPLE HUECO
 *
 * Las dos puertas derivan la MISMA clave de idempotencia: `VENTA:<id>`. Un
 * timbrado por la puerta cruda la consumía, y el timbrado bueno que viniera
 * después encontraba esa clave en estado TIMBRADA y **devolvía el CFDI
 * equivocado dando éxito**.
 *
 * El camino correcto no fallaba: mentía. Quien facturara desde la pantalla veía
 * «timbrado» y se llevaba un comprobante que no era el de su venta. Un error
 * ruidoso se arregla; éste no se nota hasta que alguien concilia.
 *
 * EL ARREGLO
 *
 * Se quitó la puerta cruda —ninguna pantalla la usaba— y el motor comprueba por
 * su cuenta que la venta no esté anulada. Lo segundo no es redundante: la puerta
 * que se quitó existía precisamente porque el motor confiaba en que su llamador
 * se acordara.
 * ============================================================================
 */

const controlador = readFileSync(join(__dirname, 'cfdi.controller.ts'), 'utf8');
const servicio = readFileSync(join(__dirname, 'cfdi.service.ts'), 'utf8');

describe('ya no hay una segunda puerta al timbrado', () => {
  it('el endpoint crudo no existe', () => {
    expect(controlador).not.toMatch(/@Post\('timbrar'\)/);
  });

  it('y el de la venta, que es el que valida, sigue', () => {
    expect(controlador).toMatch(/@Post\('ventas\/:ventaId\/timbrar'\)/);
  });

  it('el motor sigue vivo para quien lo llama desde dentro', () => {
    /*
     * `crearYTimbrar` NO se borró: lo usan `timbrarVenta` y la nota de crédito.
     * Lo que se quitó es su exposición directa por HTTP, que es otra cosa.
     */
    expect(servicio).toMatch(/async crearYTimbrar\(/);
    const timbrarVenta = servicio.slice(servicio.indexOf('async timbrarVenta('));
    expect(timbrarVenta.slice(0, 9000)).toMatch(/return this\.crearYTimbrar\(/);
  });

  it('la pantalla de facturar sigue mandando a la puerta buena', () => {
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
      .map((nombre) => join(RAIZ, nombre))
      .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/ventas/[id]/facturar/page.tsx'),
      'utf8',
    );
    expect(pantalla).toMatch(/\/cfdi\/ventas\/\$\{venta\.id\}\/timbrar/);
  });
});

describe('las dos derivaban la misma clave, y eso NO se arregla separándolas', () => {
  /*
   * Tentación evidente al leer el defecto: darle a cada puerta una clave
   * distinta. Sería peor. La clave `VENTA:<id>` es lo único que impide timbrar
   * dos CFDI para la misma venta cuando el cajero da doble clic o la red
   * reintenta; separarlas abriría exactamente ese agujero, que es fiscal y no
   * se deshace borrando una fila.
   *
   * La clave sigue siendo una sola. Lo que se quitó es la puerta de más.
   */
  it('la clave por omisión se deriva de la venta', () => {
    expect(servicio).toMatch(/dto\.ventaId \? `VENTA:\$\{dto\.ventaId\}`/);
  });

  it('y `timbrarVenta` usa esa misma, no una propia', () => {
    expect(servicio).toMatch(/claveIdempotencia \?\? `VENTA:\$\{venta\.id\}`/);
  });
});

describe('el motor se niega solo con una venta anulada', () => {
  /*
   * Ejercido, no leído. Un CFDI de una venta anulada es un ingreso declarado al
   * SAT que no ocurrió, y deshacerlo pide cancelación fiscal, no un borrado.
   */
  function motorCon(venta: Record<string, unknown> | null) {
    const s = Object.create(CfdiService.prototype) as Record<string, unknown>;
    s.obtenerConfig = async () => ({
      facturamaUser: 'u',
      facturamaPassword: 'p',
      serie: 'A',
    });
    s.facturaRepo = { findOne: async () => null };
    s.dataSource = { getRepository: () => ({ findOne: async () => venta }) };
    return s as unknown as CfdiService;
  }

  const dto = {
    ventaId: 'v-1',
    partidas: [{ cantidad: 1, precioUnitario: 100 }],
  } as never;

  it('una venta anulada no se factura, aunque quien llame no lo haya mirado', async () => {
    const motor = motorCon({ id: 'v-1', folio: 'VTA-77', estado: 'ANULADA' });

    const error = await motor
      .crearYTimbrar(dto, 'e1', 'K-1')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/VTA-77/);
    expect(String((error as Error).message)).toMatch(/anulada/i);
  });

  it('y la comprobación va ANTES de reservar el folio fiscal', () => {
    /*
     * Un folio reservado y luego devuelto deja un hueco en la serie, y el SAT
     * pregunta por los huecos.
     */
    const cuerpo = servicio.slice(
      servicio.indexOf('async crearYTimbrar('),
      servicio.indexOf('async timbrarVenta('),
    );
    const anulada = cuerpo.indexOf("venta.estado === 'ANULADA'");
    const folio = cuerpo.indexOf('CFDI:FOLIO:');
    expect(anulada).toBeGreaterThan(0);
    expect(folio).toBeGreaterThan(anulada);
  });
});

describe('y lo devuelto sigue sin facturarse', () => {
  /*
   * La otra guardia que la puerta cruda se saltaba. No se tocó hoy; queda atada
   * aquí porque es la mitad del motivo por el que esa puerta era peligrosa.
   */
  it('las partidas se arman con lo que queda, no con lo original', () => {
    const cuerpo = servicio.slice(servicio.indexOf('async timbrarVenta('));
    expect(cuerpo.slice(0, 4000)).toMatch(
      /Number\(d\.cantidad\) - Number\(d\.cantidadDevuelta \?\? 0\) > 0\.0001/,
    );
  });

  it('y una venta devuelta entera se niega en vez de timbrar un cero', () => {
    const cuerpo = servicio.slice(servicio.indexOf('async timbrarVenta('));
    expect(cuerpo.slice(0, 4000)).toMatch(/se devolvió completa/);
  });
});
