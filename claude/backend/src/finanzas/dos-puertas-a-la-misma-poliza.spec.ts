import { BadRequestException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { PolizasService } from './services/polizas.service';

/**
 * ============================================================================
 * DOS PUERTAS A LA MISMA PÓLIZA, Y UNA SIN CONTROL
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `validarCuentasAfectables` existe para una sola cosa, y su propio comentario
 * la dice:
 *
 *     «Cualquiera con acceso a Finanzas podía cargar o abonar a mano Bancos,
 *      Clientes CxC o Inventario: el auxiliar no cambiaba, el mayor sí, y la
 *      conciliación cuadraba. Es el mecanismo con el que se disimula un
 *      faltante.»
 *
 * `crearPolizaManual` lo aplica. `crearPoliza` —el método de al lado, en la
 * misma clase— no, y era lo que atendía `POST /finanzas/polizas`.
 *
 * POR QUÉ NO SE VEÍA
 *
 * El comentario del validador justifica la excepción: «Los asientos que genera
 * el motor contable NO pasan por aquí: usan `crearPoliza`». Es verdad, pero de
 * **`MotorContableService.crearPoliza`**, que es otro método, de otra clase, con
 * el mismo nombre. El de `PolizasService` tenía **un solo llamador en todo el
 * sistema: el endpoint HTTP**. Leída de corrido, esa frase hacía pasar una
 * puerta humana por una vía interna del motor.
 *
 * Y había un segundo enredo encima. En `endpoints-navegables`, la llave de la
 * pantalla «Nueva póliza» era `POST /finanzas/polizas`, pero esa pantalla manda
 * a `/manual`. Como cada ruta es un permiso aparte, conceder «Nueva póliza»
 * abría el endpoint SIN control y la pantalla seguía dando 403 al guardar.
 *
 * EL ARREGLO, Y POR QUÉ NO FUE AÑADIRLE EL CONTROL
 *
 * El endpoint se quitó. Lo viejo no era sólo más laxo en las cuentas: también
 * aceptaba `cuentaContableId` sin forma de GUID, importes con decimales sin
 * tope, una sola partida y conceptos de cualquier largo, y no era idempotente.
 * Seis cosas, todas peores. Dos puertas humanas a lo mismo con reglas distintas
 * ES la forma del defecto; ponerle el control a la segunda la habría dejado
 * viva para divergir otra vez.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

const servicio = readFileSync(
  join(__dirname, 'services', 'polizas.service.ts'),
  'utf8',
);
const controlador = readFileSync(
  join(__dirname, 'controllers', 'polizas.controller.ts'),
  'utf8',
);

describe('ya no hay una segunda puerta sin control', () => {
  it('el endpoint sin validación no existe', () => {
    /*
     * `@Post()` pelado es el de la raíz del controlador. Los demás llevan ruta
     * —'manual', ':id/cancelar'— y siguen en su sitio.
     */
    expect(controlador).not.toMatch(/@Post\(\)\s*\n\s*async crear\(/);
    expect(controlador).toMatch(/@Post\('manual'\)/);
  });

  it('y su método tampoco, para que nadie lo vuelva a enchufar', () => {
    /*
     * Dejar el método vivo y sin llamador es dejar la mitad del defecto: el
     * siguiente que necesite crear una póliza desde otro sitio lo encuentra, ve
     * que compila y lo usa, sin enterarse de que se salta el control.
     */
    expect(servicio).not.toMatch(/async crearPoliza\(/);
    expect(existsSync(join(__dirname, 'dto', 'crear-poliza.dto.ts'))).toBe(
      false,
    );
  });

  it('la que queda valida las cuentas ANTES de escribir nada', () => {
    /*
     * El orden importa y no es cosmético: validar después de abrir la
     * transacción y guardar la póliza deja filas escritas que hay que deshacer,
     * y el folio ya consumido.
     */
    const cuerpo = servicio.slice(
      servicio.indexOf('async crearPolizaManual('),
      servicio.indexOf('async crearPolizaManualEnTransaccion('),
    );
    const validacion = cuerpo.indexOf('await this.validarCuentasAfectables(');
    const transaccion = cuerpo.indexOf('await qr.startTransaction()');
    expect(validacion).toBeGreaterThan(0);
    expect(transaccion).toBeGreaterThan(validacion);

    /*
     * MUTANTE SUPERVIVIENTE, Y EL PEOR DE LOS CINCO. Añadir
     * `{ procesoAutomatico: true }` a ESTA llamada pasaba las once pruebas en
     * verde y reabría exactamente el agujero que este archivo cierra: la puerta
     * humana volvía a admitir Bancos y Clientes CxC a mano.
     *
     * Sobrevivía porque la prueba de abajo ejercita el validador directamente,
     * con la bandera que ella misma le pasa, y nunca mira CON QUÉ lo llama la
     * puerta humana. El permiso es de quien llama, así que ahí es donde hay que
     * medirlo.
     */
    expect(cuerpo).toMatch(
      /await this\.validarCuentasAfectables\(datos\.empresaId, datos\.partidas\);/,
    );
    expect(cuerpo).not.toMatch(/procesoAutomatico/);
  });

  it('y la tercera puerta, la de los procesos, no se queda sin ningún control', () => {
    /*
     * HALLAZGO DE ESTA PRUEBA. Se escribió esperando que `crearPolizaManualEn-
     * Transaccion` —la que usa nómina— ya validara, y se puso roja: no validaba
     * nada. Eran tres puertas, no dos.
     *
     * Aquí el control va a medias Y ESO ES LO CORRECTO. Una corrida de nómina
     * abona Bancos de pleno derecho: tiene su propio auxiliar, igual que el
     * motor contable. Aplicarle `permiteMovimientoManual` rompería el pago de la
     * nómina, que es una operación legítima.
     *
     * Lo que sí vale para todos es `esAfectable`: una cuenta de mayor es la suma
     * de sus hijas, y cargarle algo propio descuadra el balance al sumar. Eso no
     * depende de quién escriba.
     *
     * Y la consulta va con el `manager` del llamador, no por fuera: por fuera no
     * vería lo que esa transacción todavía no confirmó.
     */
    const cuerpo = servicio.slice(
      servicio.indexOf('async crearPolizaManualEnTransaccion('),
    );
    expect(cuerpo.slice(0, 4000)).toMatch(
      /validarCuentasAfectables\(datos\.empresaId, datos\.partidas, \{\s*\n\s*manager,\s*\n\s*procesoAutomatico: true,/,
    );
  });

  it('y el modo proceso perdona el auxiliar pero NUNCA la cuenta de mayor', async () => {
    /*
     * La distinción, ejercida. Un mutante que pusiera `procesoAutomatico` en la
     * puerta humana, o que hiciera que el modo proceso se saltara las dos
     * mitades, deja esto rojo.
     */
    const mayor = {
      id: 'c1',
      numeroCuenta: '100',
      nombre: 'Activo circulante',
      permiteMovimientoManual: true,
      esAfectable: false,
    };
    const bancos = {
      id: 'c2',
      numeroCuenta: '102-01',
      nombre: 'Bancos BBVA',
      permiteMovimientoManual: false,
      esAfectable: true,
    };
    const partidasDos = [{ cuentaContableId: 'c1' }, { cuentaContableId: 'c2' }];

    const conBancos = Object.create(PolizasService.prototype) as Record<
      string,
      unknown
    >;
    conBancos.dataSource = { getRepository: () => ({ find: async () => [bancos] }) };
    const proceso = conBancos as unknown as {
      validarCuentasAfectables: (
        e: string,
        p: Array<{ cuentaContableId: string }>,
        o?: { procesoAutomatico?: boolean },
      ) => Promise<void>;
    };
    /* Nómina abonando Bancos: pasa. */
    await expect(
      proceso.validarCuentasAfectables('e1', partidasDos, {
        procesoAutomatico: true,
      }),
    ).resolves.toBeUndefined();
    /* La misma cuenta por la puerta humana: no pasa. */
    await expect(
      proceso.validarCuentasAfectables('e1', partidasDos),
    ).rejects.toBeInstanceOf(BadRequestException);

    const conMayor = Object.create(PolizasService.prototype) as Record<
      string,
      unknown
    >;
    conMayor.dataSource = { getRepository: () => ({ find: async () => [mayor] }) };
    const procesoMayor = conMayor as unknown as {
      validarCuentasAfectables: (
        e: string,
        p: Array<{ cuentaContableId: string }>,
        o?: { procesoAutomatico?: boolean },
      ) => Promise<void>;
    };
    /* Una cuenta de mayor no la salva ser un proceso. */
    await expect(
      procesoMayor.validarCuentasAfectables('e1', partidasDos, {
        procesoAutomatico: true,
      }),
    ).rejects.toThrow(/subcuenta de detalle/i);
  });
});

describe('el control, ejercido', () => {
  /*
   * No sólo leído: las dos negativas son el valor entero de este control, y una
   * de ellas —`esAfectable`— no la nombra ningún comentario del código.
   */
  function servicioCon(cuentas: Array<Record<string, unknown>>) {
    const s = Object.create(PolizasService.prototype) as Record<string, unknown>;
    s.dataSource = {
      getRepository: () => ({ find: async () => cuentas }),
    };
    return s as unknown as {
      validarCuentasAfectables: (
        empresaId: string,
        partidas: Array<{ cuentaContableId: string }>,
      ) => Promise<void>;
    };
  }

  const partidas = [{ cuentaContableId: 'c1' }, { cuentaContableId: 'c2' }];

  it('una cuenta con auxiliar no admite póliza a mano, y el «no» dice dónde sí', async () => {
    const s = servicioCon([
      {
        id: 'c1',
        numeroCuenta: '102-01',
        nombre: 'Bancos BBVA',
        permiteMovimientoManual: false,
        esAfectable: true,
      },
    ]);

    const error = await s
      .validarCuentasAfectables('e1', partidas)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/102-01 Bancos BBVA/);
    expect(String((error as Error).message)).toMatch(/tesorería/i);
  });

  it('una cuenta de mayor tampoco recibe movimientos directos', async () => {
    const s = servicioCon([
      {
        id: 'c1',
        numeroCuenta: '100',
        nombre: 'Activo circulante',
        permiteMovimientoManual: true,
        esAfectable: false,
      },
    ]);

    const error = await s
      .validarCuentasAfectables('e1', partidas)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/subcuenta de detalle/i);
  });

  it('una cuenta de detalle normal pasa', async () => {
    const s = servicioCon([
      {
        id: 'c1',
        numeroCuenta: '601-05',
        nombre: 'Papelería',
        permiteMovimientoManual: true,
        esAfectable: true,
      },
    ]);

    await expect(s.validarCuentasAfectables('e1', partidas)).resolves.toBeUndefined();
  });

  it('sin partidas no consulta nada ni se queja', async () => {
    const s = servicioCon([]);
    await expect(s.validarCuentasAfectables('e1', [])).resolves.toBeUndefined();
  });
});

describe('y la llave del menú abre la puerta que la pantalla usa', () => {
  /*
   * El enredo de permisos que acompañaba al defecto. `endpoints-navegables`
   * decía que «Nueva póliza» era `POST /finanzas/polizas`; la pantalla manda a
   * `/manual`. Conceder esa acción abría el endpoint sin control y la pantalla
   * seguía en 403.
   */
  const navegables = readFileSync(
    join(SRC, 'iam', 'data', 'endpoints-navegables.ts'),
    'utf8',
  );

  it('la acción declarada es la ruta a la que la pantalla manda', () => {
    expect(navegables).toMatch(
      /'POST \/finanzas\/polizas\/manual': \{\s*\n\s*rutaFrontend: '\/dashboard\/finanzas\/polizas\/nueva'/,
    );
    expect(navegables).not.toMatch(/'POST \/finanzas\/polizas': \{/);
  });

  it('y la pantalla sigue mandando ahí', () => {
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
      .map((nombre) => join(RAIZ, nombre))
      .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/finanzas/polizas/nueva/page.tsx'),
      'utf8',
    );
    expect(pantalla).toMatch(/finanzas\/polizas\/manual/);

    const menu = readFileSync(
      join(FRONTEND, 'app/dashboard/module-config.ts'),
      'utf8',
    );
    expect(menu).toMatch(/"\/api\/finanzas\/polizas\/manual"/);
    expect(menu).not.toMatch(/"\/api\/finanzas\/polizas"/);
  });
});
