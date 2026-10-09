import { createServer, Server } from 'net';
import { AddressInfo } from 'net';
import { Ticket, aBytesDeImpresora } from './escpos';
import { armarTicket, DatosTicket } from './ticket-escpos';
import { ImpresoraTermicaService } from './impresora-termica.service';

/**
 * ============================================================================
 * El ticket sale en papel
 * ----------------------------------------------------------------------------
 * CÓMO SE COMPRUEBA ALGO QUE ACABA EN UN APARATO
 *
 * Una impresora térmica de red no es más que alguien escuchando en el puerto
 * 9100 que se traga los bytes que le lleguen. Eso se puede levantar en estas
 * mismas pruebas: aquí se abre un servidor TCP que hace de impresora, se manda
 * un ticket de verdad y se comprueba **lo que recibió**, byte a byte.
 *
 * No es una imitación del servicio: es el servicio entero, con su socket, su
 * plazo y sus errores. Lo único que no es real es el papel.
 *
 * Y se comprueban los dos finales que de verdad ocurren en un mostrador: la
 * impresora que contesta, y la que está apagada. El segundo importa más, porque
 * es el que no puede tumbar una venta ya cobrada.
 * ============================================================================
 */

/** Levanta una impresora de mentira y recoge lo que le manden. */
function impresoraDePruebas(): Promise<{
  puerto: number;
  recibido: () => Buffer;
  cerrar: () => Promise<void>;
  servidor: Server;
}> {
  return new Promise((resolver) => {
    const trozos: Buffer[] = [];
    const servidor = createServer((socket) => {
      socket.on('data', (d) => trozos.push(d));
    });
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as AddressInfo;
      resolver({
        puerto: port,
        recibido: () => Buffer.concat(trozos),
        cerrar: () =>
          new Promise<void>((r) => {
            servidor.close(() => r());
          }),
        servidor,
      });
    });
  });
}

const VENTA: DatosTicket = {
  empresa: {
    nombreComercial: 'Ferretería La Esquina',
    rfc: 'XAXX010101000',
    direccion: 'Av. Juárez 120',
    ciudad: 'Playa del Carmen',
    estado: 'Quintana Roo',
    codigoPostal: '77710',
  },
  folio: 10452,
  fecha: new Date('2026-10-09T14:35:00'),
  cajero: 'María Ñúñez',
  cliente: { nombre: 'José Pérez Gómez', rfc: 'PEGJ800101AAA' },
  renglones: [
    {
      nombre: 'Tornillo hexagonal 3/8 x 2" galvanizado cabeza redonda',
      sku: 'TOR-038',
      cantidad: 12,
      precioUnitario: 4.5,
      subtotal: 54,
    },
    { nombre: 'Taladro', sku: 'TAL-001', cantidad: 1, precioUnitario: 1899, descuento: 100, subtotal: 1799 },
  ],
  subtotal: 1853,
  descuento: 100,
  impuestoTotal: 280.48,
  total: 2033.48,
  metodoPago: 'EFECTIVO',
  montoRecibido: 2100,
  cambio: 66.52,
};

describe('el ticket en ESC/POS', () => {
  describe('los acentos', () => {
    /*
     * Es lo que más se rompe y lo primero que se nota: un ticket con garabatos
     * parece una avería aunque la venta esté perfecta.
     */
    it('traduce los acentos a la tabla de la impresora, no a UTF-8', () => {
      const bytes = aBytesDeImpresora('áéíóú ñÑ ¿¡');
      /* En UTF-8 «á» son dos bytes; en CP858 es uno. */
      expect(bytes.length).toBe('áéíóú ñÑ ¿¡'.length);
      expect(bytes[0]).toBe(0xa0); // á
      expect(bytes[5]).toBe(0x20); // el espacio
      expect(bytes[6]).toBe(0xa4); // ñ
      expect(bytes[7]).toBe(0xa5); // Ñ
    });

    it('lo que no está en la tabla sale sin adorno, no como garabato', () => {
      /* Las comillas tipográficas y la raya larga llegan de copiar y pegar. */
      expect(aBytesDeImpresora('—').toString('ascii')).toBe('-');
      expect(aBytesDeImpresora('“hola”').toString('ascii')).toBe('"hola"');
      expect(aBytesDeImpresora('…').toString('ascii')).toBe('...');
    });

    it('un carácter desconocido es un espacio, nunca un byte de control', () => {
      const bytes = aBytesDeImpresora('日');
      expect(bytes.length).toBe(1);
      expect(bytes[0]).toBe(0x20);
    });
  });

  describe('las columnas', () => {
    it('un renglón ocupa exactamente el ancho del papel', () => {
      const t = new Ticket(32);
      t.renglon('Subtotal', '1,853.00');
      const texto = t.bytes().toString('latin1').replace(/\n$/, '');
      expect(texto.length).toBe(32);
      expect(texto.endsWith('1,853.00')).toBe(true);
    });

    it('cuando la etiqueta no cabe se recorta ella, nunca el importe', () => {
      const t = new Ticket(32);
      t.renglon('Una etiqueta larguísima que no cabe de ninguna manera', '9,999,999.00');
      const texto = t.bytes().toString('latin1').replace(/\n$/, '');
      expect(texto.length).toBe(32);
      expect(texto.endsWith('9,999,999.00')).toBe(true);
    });

    it('un nombre largo se parte en renglones que caben', () => {
      const t = new Ticket(32);
      t.parrafo('Tornillo hexagonal 3/8 x 2 pulgadas galvanizado cabeza redonda');
      const lineas = t.bytes().toString('latin1').split('\n').filter(Boolean);
      expect(lineas.length).toBeGreaterThan(1);
      for (const l of lineas) expect(l.length).toBeLessThanOrEqual(32);
    });

    it('un ancho imposible se rechaza al construirlo, no al imprimir', () => {
      expect(() => new Ticket(8)).toThrow(/fuera de rango/i);
      expect(() => new Ticket(200)).toThrow(/fuera de rango/i);
    });
  });

  describe('lo que dice el papel', () => {
    const texto = (d: DatosTicket) => armarTicket(d).toString('latin1');

    it('lleva el negocio, el folio, lo comprado y el total', () => {
      const t = texto(VENTA);
      expect(t).toContain('Ferreter'); // con acento traducido
      expect(t).toContain('XAXX010101000');
      expect(t).toContain('Ticket #10452');
      expect(t).toContain('TOR-038');
      expect(t).toContain('TOTAL');
      expect(t).toContain('2,033.48');
    });

    it('dice cuánto se recibió y cuánto se devuelve', () => {
      const t = texto(VENTA);
      expect(t).toContain('Recibido');
      expect(t).toContain('2,100.00');
      expect(t).toContain('Cambio');
      expect(t).toContain('66.52');
    });

    it('cuando el importe final subió, el papel dice que falta por cobrar', () => {
      const t = texto({ ...VENTA, montoRecibido: 1000, cambio: -1033.48 });
      expect(t).toContain('FALTA POR COBRAR');
      expect(t).toContain('1,033.48');
      expect(t).not.toContain('Cambio');
    });

    it('avisa que no es un comprobante fiscal', () => {
      expect(texto(VENTA)).toContain('no es un comprobante fiscal');
    });

    /*
     * El que impide cobrar dos veces una devolución con el mismo papel.
     */
    it('una reimpresión va marcada en el papel', () => {
      expect(texto(VENTA)).not.toContain('REIMPRESION');
      expect(texto({ ...VENTA, reimpresion: true })).toContain('* REIMPRESION *');
    });

    it('lleva el folio en código de barras para buscar la venta sin teclear', () => {
      const bytes = armarTicket(VENTA);
      /* GS k 4 … NUL es el CODE39 */
      const i = bytes.indexOf(Buffer.from([0x1d, 0x6b, 0x04]));
      expect(i).toBeGreaterThan(0);
      expect(bytes.subarray(i + 3, i + 8).toString('ascii')).toBe('10452');
    });

    it('termina cortando el papel', () => {
      const bytes = armarTicket(VENTA);
      expect(bytes.includes(Buffer.from([0x1d, 0x56, 66, 0]))).toBe(true);
    });
  });

  describe('el cajón de dinero', () => {
    const PULSO = Buffer.from([0x1b, 0x70, 0, 25, 250]);

    it('se abre al cobrar en efectivo', () => {
      expect(armarTicket({ ...VENTA, abrirCajon: true }).includes(PULSO)).toBe(true);
    });

    /*
     * Un cajón que se abre con cada tarjeta acaba quedándose abierto, y un
     * cajón abierto es un cajón al que cualquiera mete la mano.
     */
    it('no se abre cuando no se pidió', () => {
      expect(armarTicket({ ...VENTA, abrirCajon: false }).includes(PULSO)).toBe(false);
    });
  });

  describe('mandarlo a la impresora', () => {
    const servicio = new ImpresoraTermicaService();

    it('la impresora recibe exactamente los bytes del ticket', async () => {
      const falsa = await impresoraDePruebas();
      const bytes = armarTicket(VENTA);

      const r = await servicio.enviar('127.0.0.1', falsa.puerto, bytes);

      expect(r.impreso).toBe(true);
      expect(r.motivo).toBeUndefined();
      /* Un poco de margen: el `close` llega después del último `data`. */
      await new Promise((r2) => setTimeout(r2, 50));
      expect(falsa.recibido().equals(bytes)).toBe(true);
      await falsa.cerrar();
    });

    it('empieza reiniciando la impresora y eligiendo la tabla de códigos', async () => {
      const falsa = await impresoraDePruebas();
      await servicio.enviar('127.0.0.1', falsa.puerto, armarTicket(VENTA));
      await new Promise((r) => setTimeout(r, 50));
      const recibido = falsa.recibido();
      expect(recibido.subarray(0, 2).equals(Buffer.from([0x1b, 0x40]))).toBe(true);
      expect(recibido.subarray(2, 5).equals(Buffer.from([0x1b, 0x74, 19]))).toBe(true);
      await falsa.cerrar();
    });

    /*
     * El caso que importa: la impresora apagada. La venta ya está cobrada y
     * guardada; esto no puede lanzar nada hacia arriba.
     */
    it('una impresora que no contesta devuelve un motivo, no una excepción', async () => {
      const falsa = await impresoraDePruebas();
      const puerto = falsa.puerto;
      await falsa.cerrar(); // ahora nadie escucha ahí

      const r = await servicio.enviar('127.0.0.1', puerto, Buffer.from('x'), 1500);

      expect(r.impreso).toBe(false);
      expect(r.motivo).toBeTruthy();
      /* En castellano, no «ECONNREFUSED»: lo lee un cajero. */
      expect(r.motivo).not.toMatch(/ECONN|ENOTFOUND|EHOST/);
      expect(r.motivo).toMatch(/impresora/i);
    });

    it('una caja sin impresora configurada se contesta al instante', async () => {
      const r = await servicio.enviar('', 9100, Buffer.from('x'));
      expect(r.impreso).toBe(false);
      expect(r.motivo).toMatch(/no tiene impresora configurada/i);
      expect(r.milisegundos).toBeLessThan(50);
    });

    /*
     * Una impresora apagada no rechaza la conexión: la deja colgada. Sin plazo,
     * el cajero se queda mirando una rueda girando con el cliente enfrente.
     */
    it('hay plazo: una impresora que acepta y calla no cuelga la caja', async () => {
      /*
       * Un servidor que acepta la conexión y jamás contesta ni cierra, que es
       * como se porta una impresora encendida con la cola atascada.
       *
       * Se guarda su lado del socket para cerrarlo a mano al terminar:
       * `server.close()` espera a que no queden conexiones, y una que nadie
       * suelta dejaría estas pruebas colgadas en vez de rojas.
       */
      const abiertos: import('net').Socket[] = [];
      const mudo = createServer((s) => abiertos.push(s));
      await new Promise<void>((r) => mudo.listen(0, '127.0.0.1', () => r()));
      const { port } = mudo.address() as AddressInfo;

      const comenzo = Date.now();
      const r = await servicio.enviar('127.0.0.1', port, Buffer.from('x'), 600);

      expect(r.impreso).toBe(false);
      expect(r.motivo).toMatch(/no contest/i);
      expect(Date.now() - comenzo).toBeLessThan(3000);
      for (const s of abiertos) s.destroy();
      await new Promise<void>((res) => mudo.close(() => res()));
    });
  });
});
