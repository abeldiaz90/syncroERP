/**
 * ============================================================================
 * La caja avisa antes de cobrar, no después
 * ----------------------------------------------------------------------------
 * Medido el 1-oct-2026 vendiendo de verdad en el mostrador: la terminal dejó
 * buscar tres productos, armar el carrito, elegir efectivo y capturar los $800
 * que daba el cliente — y al pulsar «Cobrar» contestó:
 *
 *     «No existe un turno abierto para la caja seleccionada.
 *      Abre la caja antes de cobrar o reembolsar efectivo.»
 *
 * El servidor hace bien en negarse: sin turno no hay dónde registrar el
 * efectivo, y un cobro sin turno es dinero que entra sin arqueo posible. Lo
 * que estaba mal es CUÁNDO se enteraba el cajero: con el trabajo hecho y el
 * cliente esperando.
 *
 * Es el defecto que este proyecto lleva corrigiendo desde el primer día —un
 * botón que lleva a una negativa— pero en la pantalla donde más caro sale,
 * porque aquí el que espera no es un usuario: es un cliente en el mostrador.
 *
 * El arreglo no toca el servidor. La terminal pregunta por los turnos al
 * cargar, como ya hacía con el almacén, las cajas y el tope de descuento.
 * ============================================================================
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const ruta = FRONTEND ? join(FRONTEND, 'app/pos/terminal.tsx') : '';
const hay = Boolean(ruta && existsSync(ruta));
const terminal = hay ? readFileSync(ruta, 'utf8') : '';

describe('El turno se pregunta al abrir la terminal', () => {
  it('la consulta viaja con las demás de la carga inicial', () => {
    if (!hay) return;
    /*
     * El tipo dejó de ser `{ cuentaCajaId:string }[]` el 7-oct: la respuesta
     * trae además quién abrió el turno y en qué caja, para que el mostrador
     * pueda decirlo con varios cajeros a la vez. Lo que esta prueba protege no
     * es el tipo, es que la consulta siga en la carga inicial.
     */
    expect(terminal).toMatch(/api\.get<ITurnoAbierto\[\]>\('\/caja\/turnos\/abiertos'\)/);
  });

  it('va dentro de `intentar`, como el resto', () => {
    /*
     * La terminal se traga los 403 y sigue viva a propósito: un mostrador que
     * se cae porque una consulta accesoria falló no puede cobrar nada. Esta
     * consulta no es una excepción.
     */
    if (!hay) return;
    expect(terminal).toMatch(
      /intentar\(api\.get<ITurnoAbierto\[\]>\('\/caja\/turnos\/abiertos'\), null\)/,
    );
  });

  it('se vuelve a preguntar al cerrar una venta', () => {
    /*
     * Un turno puede cerrarse desde Tesorería mientras la caja sigue abierta
     * —es lo normal al terminar el día— y el cajero no tiene por qué
     * enterarse en la venta siguiente con el carrito ya armado.
     */
    if (!hay) return;
    const tras = terminal.slice(terminal.indexOf('setVentaExitosa({'));
    expect(tras).toMatch(/\/caja\/turnos\/abiertos/);
  });
});

describe('Lo que no se sabe no se afirma', () => {
  it('«no se pudo preguntar» es null, y no bloquea la venta', () => {
    /*
     * La distinción que hace que este arreglo no se convierta en un problema
     * peor: `null` significa que la consulta falló, y en ese caso la terminal
     * no afirma nada y deja que el servidor decida al cobrar. Sólo se bloquea
     * cuando SE SABE que no hay turno.
     */
    if (!hay) return;
    expect(terminal).toMatch(
      /const \[cajasConTurno,\s+setCajasConTurno\]\s+= useState<string\[\] \| null>\(null\)/,
    );
    expect(terminal).toMatch(/cajasConTurno !== null/);
  });

  it('se exige turno sólo cuando hay efectivo de por medio', () => {
    /*
     * Una tarjeta o una transferencia no tocan el cajón. Exigirles turno sería
     * inventar en la pantalla una regla que el servidor no tiene, y dejar sin
     * vender a quien cobra con terminal bancaria.
     */
    if (!hay) return;
    expect(terminal).toMatch(/const efectivoEnJuego = metodoPago === 'EFECTIVO'/);
    expect(terminal).toMatch(/esCredito\(metodoPago\) && n\(enganche\) > 0 && cajaElegida\?\.tipo === 'CAJA'/);
  });

  it('el bloqueo entra en `puedeVender`, que es lo que apaga el botón', () => {
    if (!hay) return;
    expect(terminal).toMatch(/const puedeVender = .*!sinTurnoAbierto/);
  });
});

describe('Y se dice qué hacer, no sólo qué falta', () => {
  it('el aviso nombra dónde se abre el turno', () => {
    /*
     * «No hay turno abierto» deja al cajero buscando. La pantalla donde se
     * abre está a dos clics y se nombra.
     */
    if (!hay) return;
    expect(terminal).toMatch(/Esta caja no tiene turno abierto/);
    expect(terminal).toMatch(/Tesorería → Caja, corte y arqueo/);
  });

  it('el aviso se dibuja aunque el carrito esté vacío', () => {
    /*
     * El punto entero del arreglo. Si se condicionara a `carrito.length > 0`
     * —como hace el aviso de la cuenta de cobro— el cajero volvería a
     * enterarse después de trabajar.
     */
    if (!hay) return;
    /*
     * Se mide la CONDICIÓN del aviso, no el bloque que sigue. La primera
     * versión de esta prueba recortaba desde `{sinTurnoAbierto&&(` y un
     * mutante que escribió `{sinTurnoAbierto&&carrito.length>0&&(` la dejó
     * verde: el ancla dejó de existir y el recorte salió vacío. Una prueba
     * que se cae del texto que vigila no vigila nada.
     */
    const condicion = /\{sinTurnoAbierto\s*&&([^(]*)\(/.exec(terminal);
    expect(condicion).not.toBeNull();
    expect(condicion![1]).not.toMatch(/carrito/);
  });
});

describe('El servidor sigue siendo el que manda', () => {
  it('la validación de turno no se quitó del backend', () => {
    /*
     * La pantalla avisa; el servidor decide. Si alguien «simplificara» esto
     * quitando la comprobación de allá porque «ya avisa la caja», bastaría un
     * cliente viejo o una llamada directa para cobrar sin turno.
     */
    const caja = readFileSync(
      join(__dirname, '..', 'caja', 'services', 'caja.service.ts'),
      'utf8',
    );
    expect(caja).toMatch(
      /No existe un turno abierto para la caja seleccionada\. Abre la caja antes de cobrar o reembolsar efectivo\./,
    );
  });
});

describe('Y una orden sola ya no son «las 1 órdenes»', () => {
  /*
   * Visto en la bandeja de recepciones con una única orden registrada: «Las 1
   * órdenes registradas están fuera de esta bandeja». Es menor, pero es de las
   * cosas que delatan que un texto se armó concatenando y nadie lo leyó.
   */
  const rutaRec = FRONTEND
    ? join(FRONTEND, 'app/dashboard/inventario/recepciones/page.tsx')
    : '';
  const hayRec = Boolean(rutaRec && existsSync(rutaRec));
  const pantalla = hayRec ? readFileSync(rutaRec, 'utf8') : '';

  it('el singular tiene su propia frase', () => {
    if (!hayRec) return;
    expect(pantalla).toMatch(/La única orden registrada está fuera de esta bandeja\./);
  });

  it('y el plural sigue existiendo', () => {
    if (!hayRec) return;
    expect(pantalla).toMatch(/Las \$\{totalOrdenes\} órdenes registradas/);
  });
});
