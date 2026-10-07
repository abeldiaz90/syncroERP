/**
 * ============================================================================
 * Tres cajeros a la vez, y un solo cajón con registro
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El punto de venta propone la caja marcada «por omisión» de la empresa. Es LA
 * MISMA en las tres terminales del mostrador. Y nada en pantalla decía que ese
 * turno lo había abierto otra persona, ni en qué cajón físico estaba el
 * efectivo: `GET /caja/turnos/abiertos` devolvía `usuarioAperturaId`, un
 * identificador que ninguna pantalla usaba.
 *
 * Con una caja eso da igual. Con tres cajeros cobrando a la vez:
 *
 *   · Los tres cobran contra el mismo turno.
 *   · Los otros dos cajones acumulan efectivo sin registro.
 *   · Y sale de noche, en el arqueo, como un faltante que nadie puede
 *     explicar —el peor error de caja, porque se descubre cuando ya no se
 *     puede reconstruir—.
 *
 * LO QUE SE ARREGLA, SIN INVENTAR REGLAS QUE EL SERVIDOR NO TENGA
 *
 *   1. La caja la recuerda ESTA terminal. El cajón es del mostrador físico, no
 *      de la empresa. La de omisión sigue siendo la primera propuesta, pero
 *      sólo en una terminal que no ha elegido nunca.
 *   2. Se dice quién abrió el turno y a qué hora, y se avisa cuando no eres
 *      tú. NO se bloquea: hay mostradores donde se relevan en el mismo cajón.
 *      Se dice, que es lo que permite darse cuenta antes de cobrar.
 *
 * Un número sin nombre no se puede arreglar.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CajaService } from './services/caja.service';
import { EstadoTurnoCaja } from './entities/turno-caja.entity';

function servicioCon(
  turnos: unknown[],
  usuarios: unknown[],
  cuentas: unknown[],
) {
  const repoTurnos = { find: jest.fn(async () => turnos) } as any;
  const repoUsuarios = { find: jest.fn(async () => usuarios) } as any;
  const repoCuentas = { find: jest.fn(async () => cuentas) } as any;
  const servicio = new CajaService(
    {} as any,
    repoTurnos,
    {} as any,
    repoUsuarios,
    repoCuentas,
    { registrarEnTransaccion: jest.fn() } as any,
    { encolarEnTransaccion: jest.fn() } as any,
  );
  return { servicio, repoTurnos, repoUsuarios, repoCuentas };
}

describe('Un turno abierto dice de quién es', () => {
  it('devuelve el nombre de quien lo abrió y el de la caja', async () => {
    const { servicio } = servicioCon(
      [
        { id: 't1', cuentaCajaId: 'c1', usuarioAperturaId: 'u1', estado: EstadoTurnoCaja.ABIERTO },
        { id: 't2', cuentaCajaId: 'c2', usuarioAperturaId: 'u2', estado: EstadoTurnoCaja.ABIERTO },
      ],
      [
        { id: 'u1', nombreCompleto: 'Ana Mostrador' },
        { id: 'u2', nombreCompleto: 'Beto Mostrador' },
      ],
      [
        { id: 'c1', nombre: 'Caja 1' },
        { id: 'c2', nombre: 'Caja 2' },
      ],
    );
    const abiertos: any[] = await servicio.turnosAbiertos('empresa');
    expect(abiertos.map((t) => [t.usuarioAperturaNombre, t.cuentaCajaNombre])).toEqual([
      ['Ana Mostrador', 'Caja 1'],
      ['Beto Mostrador', 'Caja 2'],
    ]);
  });

  it('y `null` —nunca el uuid en crudo— cuando no se puede resolver', async () => {
    /*
     * Un identificador en pantalla no le dice a nadie de quién es el cajón, y
     * además se lee como un dato: el hueco honesto es mejor.
     */
    const { servicio } = servicioCon(
      [{ id: 't1', cuentaCajaId: 'c1', usuarioAperturaId: 'borrado', estado: EstadoTurnoCaja.ABIERTO }],
      [],
      [],
    );
    const [turno] = (await servicio.turnosAbiertos('empresa')) as any[];
    expect(turno.usuarioAperturaNombre).toBeNull();
    expect(turno.cuentaCajaNombre).toBeNull();
  });

  it('no consulta nada cuando no hay turnos abiertos', async () => {
    // Dos consultas de catálogo por una lista vacía es trabajo que nadie pidió.
    const { servicio, repoUsuarios, repoCuentas } = servicioCon([], [], []);
    expect(await servicio.turnosAbiertos('empresa')).toEqual([]);
    expect(repoUsuarios.find).not.toHaveBeenCalled();
    expect(repoCuentas.find).not.toHaveBeenCalled();
  });

  it('los catálogos se piden acotados a la empresa', async () => {
    /*
     * Un nombre de otra empresa en la pantalla de caja es una fuga, no un
     * detalle estético.
     */
    const { servicio, repoUsuarios, repoCuentas } = servicioCon(
      [{ id: 't1', cuentaCajaId: 'c1', usuarioAperturaId: 'u1', estado: EstadoTurnoCaja.ABIERTO }],
      [{ id: 'u1', nombreCompleto: 'Ana' }],
      [{ id: 'c1', nombre: 'Caja 1' }],
    );
    await servicio.turnosAbiertos('empresa-a');
    expect(repoUsuarios.find.mock.calls[0][0].where.empresaId).toBe('empresa-a');
    expect(repoCuentas.find.mock.calls[0][0].where.empresaId).toBe('empresa-a');
  });
});

describe('Y el punto de venta usa ese nombre, y recuerda su propia caja', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND ? join(FRONTEND, 'app/pos/terminal.tsx') : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pos = hay ? readFileSync(ruta, 'utf8') : '';

  it('la terminal que se mide es la que está viva', () => {
    // Si esta ruta se mueve, las pruebas de abajo medirían la nada.
    expect(hay).toBe(true);
  });

  it('la caja elegida se recuerda en ESTA terminal, y se lee al arrancar', () => {
    expect(pos).toMatch(/localStorage\.setItem\('syncro_pos_caja'/);
    expect(pos).toMatch(/localStorage\.getItem\('syncro_pos_caja'\)/);
  });

  it('y la recordada manda sobre la marcada por omisión de la empresa', () => {
    /*
     * Al revés, cada recarga volvería a proponer la caja de la empresa y el
     * cajero tendría que acordarse de corregirlo siempre. El día que se le
     * olvide, cobra en el cajón de otro.
     */
    const iSuya = pos.indexOf('if (suya) setCuentaBancariaId(suya.id);');
    const iDef = pos.indexOf('else if (def) setCuentaBancariaId(def.id);');
    expect(iSuya).toBeGreaterThan(-1);
    expect(iDef).toBeGreaterThan(iSuya);
  });

  it('una terminal en modo privado no se queda sin vender por no poder recordar', () => {
    // `localStorage` lanza en modo privado; una caja no se cae por eso.
    const trozo = pos.slice(pos.indexOf("localStorage.setItem('syncro_pos_caja'") - 200);
    expect(trozo.slice(0, 600)).toMatch(/catch/);
  });

  it('la auto-selección por método de pago no pisa la caja ya elegida', () => {
    /*
     * MEDIDO POR PANTALLA con dos cajas abiertas: se elegía «Caja 2», se
     * recargaba, y volvía sola a la de omisión de la empresa. Lo mismo sin
     * recargar, en mitad de una venta, con sólo tocar el método de pago.
     *
     * La auto-selección sirve para cuando NO hay nada puesto que sirva. Si lo
     * que hay ya es del tipo que el método necesita, lo eligió una persona o lo
     * recuerda esta terminal, y los dos saben más que una marca de la empresa.
     */
    expect(pos).toMatch(/const actual = cuentasBancarias\.find\(c => c\.id === cuentaBancariaId\);/);
    expect(pos).toMatch(/if \(actual\?\.tipo === tipo\) return;/);
    // Y cuando sí hay que elegir, la de esta terminal va primero.
    const trozo = pos.slice(pos.indexOf('if (actual?.tipo === tipo) return;'));
    const iRecordada = trozo.indexOf("c.id===recordada && c.tipo===tipo");
    const iDefecto = trozo.indexOf('c.tipo===tipo && c.esPorDefecto');
    expect(iRecordada).toBeGreaterThan(-1);
    expect(iDefecto).toBeGreaterThan(iRecordada);
  });

  it('dice quién abrió el turno de la caja elegida', () => {
    expect(pos).toMatch(/Turno abierto por \{turnoDeLaCaja\.usuarioAperturaNombre/);
    expect(pos).toMatch(/alguien que no se pudo identificar/);
  });

  it('avisa cuando el turno es de otra persona, y sólo cuando se sabe', () => {
    /*
     * Sin el `yoId &&`, una sesión sin identidad resuelta marcaría en ámbar
     * todos los turnos. Un aviso que siempre está encendido se aprende a
     * ignorar, y deja de servir el día que es cierto.
     */
    expect(pos).toMatch(
      /usuarioAperturaId && yoId && turnoDeLaCaja\.usuarioAperturaId !== yoId/,
    );
  });

  it('pero NO lo bloquea: el relevo en el mismo cajón es legítimo', () => {
    /*
     * Lo único que apaga «Cobrar» por caja sigue siendo que no haya turno
     * abierto. Si `turnoDeOtro` entrara en `puedeVender`, el sistema estaría
     * inventando una regla que el servidor no tiene.
     */
    const linea = pos.split('\n').find((l) => l.includes('const puedeVender')) ?? '';
    expect(linea).toContain('sinTurnoAbierto');
    expect(linea).not.toContain('turnoDeOtro');
  });
});

describe('La lectura de caja desde el mostrador', () => {
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Para saber cuánto debería haber en el cajón a media jornada había que salir
   * del mostrador y abrir Tesorería. El dato ya viajaba en la misma respuesta
   * que dice si la caja tiene turno abierto: no hacía falta pedir nada nuevo,
   * sólo enseñarlo.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const RAIZ_POS = join(__dirname, '..', '..', '..');
  const FRONT_POS = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ_POS, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const terminal = FRONT_POS
    ? readFileSync(join(FRONT_POS, 'app/pos/terminal.tsx'), 'utf8')
    : '';

  it('la terminal que se mide es la que está viva', () => {
    expect(terminal.length).toBeGreaterThan(1000);
  });

  it('enseña fondo, entradas, salidas y lo que debería haber', () => {
    for (const rotulo of ['Fondo inicial', 'Entradas', 'Salidas', 'Debería haber']) {
      expect(terminal).toContain(rotulo);
    }
  });

  it('va APAGADA por omisión: la pantalla del mostrador la ve el cliente', () => {
    /*
     * El total del cajón no es un dato que deba estar a la vista todo el día,
     * con un cliente al otro lado del mostrador. Se pide, se mira y se guarda.
     */
    expect(terminal).toMatch(
      /const \[verLecturaCaja,\s*setVerLecturaCaja\]\s*=\s*useState\(false\)/,
    );
    expect(terminal).toContain('Ver cuánto debería haber en el cajón');
    expect(terminal).toContain('Ocultar');
  });

  it('y no dice «cuadra»: eso sólo lo sabe quien cuenta', () => {
    /*
     * Es lo que el sistema lleva registrado, no lo que hay en el cajón. Decir
     * aquí que cuadra sin haber contado nada sería la peor frase de esta
     * pantalla.
     */
    expect(terminal).toContain('Lectura de caja · no cierra el turno');
    expect(terminal).toContain('Es lo que el sistema lleva registrado');
  });
});
