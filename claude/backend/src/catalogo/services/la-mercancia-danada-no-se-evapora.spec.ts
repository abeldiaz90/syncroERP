/**
 * ============================================================================
 * La mercancía dañada no se evapora
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * En la recepción de una transferencia entre almacenes, el almacenista captura
 * tres números por renglón: lo enviado, lo recibido y lo dañado. El servicio
 * guardaba los tres y daba entrada únicamente a lo recibido.
 *
 * Las unidades dañadas ya habían salido del almacén de origen en el envío. Al
 * no entrar en ninguna parte quedaban anotadas sólo en `cantidadDanada` del
 * renglón de la transferencia, que no es un movimiento de inventario ni una
 * partida contable. Consecuencias medidas sobre 100 piezas a $50 con 10
 * dañadas:
 *
 *   · El kardex del producto no muestra la pérdida: aparece una salida de 100
 *     en el origen y una entrada de 90 en el destino, y nada explica las 10.
 *   · El mayor sigue valorando el inventario en 5,000 cuando el almacén tiene
 *     4,500. El descuadre es permanente: nadie lo vuelve a tocar.
 *   · La cuenta de mermas —la que mira el contador para saber si hay un
 *     problema en el almacén— queda en cero. Un cero que se lee como buena
 *     noticia.
 *
 * QUÉ HACE AHORA
 *
 * Entra la cantidad completa que llegó y lo dañado sale enseguida como merma,
 * contra el lote que acaba de llegar, dentro de la misma transacción.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * El comportamiento, no el texto del fuente: ejecuta la recepción con dobles y
 * mide qué cantidades se movieron y con qué lote. Si alguien vuelve a dar
 * entrada sólo a `recibida`, o declara la merma sin lote, esto se pone rojo.
 * ============================================================================
 */
import { WmsService } from './wms.service';
import { EstadoTransferenciaInventario } from '../entities/transferencia-inventario.entity';
import { TransferenciaInventarioDetalle } from '../entities/transferencia-inventario-detalle.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';

const EMPRESA = 'empresa-1';
const ENVIO = 'quien-envio';
const RECIBE = 'quien-recibe';

function armar(opciones: { enviada: number; recibida?: number; danada: number }) {
  const transferencia: any = {
    id: 'trf-1',
    empresaId: EMPRESA,
    folio: 'TRF-0001',
    estado: EstadoTransferenciaInventario.EN_TRANSITO,
    enviadoPor: ENVIO,
    almacenOrigenId: 'alm-origen',
    almacenDestinoId: 'alm-destino',
  };
  const detalle: any = {
    id: 'det-1',
    transferenciaId: 'trf-1',
    productoId: 'prod-1',
    numeroLote: 'L-2026-10',
    cantidad: opciones.enviada,
    cantidadEnviada: opciones.enviada,
    cantidadRecibida: 0,
    cantidadDanada: 0,
    costoUnitario: 50,
  };
  const stockDestino: any = {
    empresaId: EMPRESA,
    productoId: 'prod-1',
    almacenId: 'alm-destino',
    cantidad: 0,
    enTransito: opciones.enviada,
  };

  const em: any = {
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({ getOne: async () => transferencia }),
      }),
    }),
    find: async (entidad: unknown) =>
      entidad === TransferenciaInventarioDetalle ? [detalle] : [],
    findOne: async (entidad: unknown) => {
      if (entidad === StockPorAlmacen) return stockDestino;
      if (entidad === LoteInventario) return { id: 'lote-recibido' };
      return null;
    },
    save: async (x: unknown) => x,
    create: (_e: unknown, x: unknown) => x,
    delete: async () => undefined,
  };

  const inventario: any = {
    registrarCompra: jest.fn(async () => ({ mensaje: 'ok' })),
    mermaEnTransaccion: jest.fn(async () => ({ mensaje: 'ok' })),
  };
  const dataSource: any = { transaction: (fn: any) => fn(em) };
  const repo: any = {};

  const servicio = new WmsService(
    dataSource, inventario, {} as any,
    repo, repo, repo, repo, repo, repo, repo, repo, repo,
  );

  return { servicio, inventario, detalle, stockDestino, transferencia, opciones };
}

describe('Recepción de transferencia · la mercancía dañada', () => {
  it('entra la cantidad completa y lo dañado sale como merma del lote recibido', async () => {
    const { servicio, inventario, detalle } = armar({ enviada: 100, danada: 10 });

    await servicio.cambiarEstadoTransferencia(EMPRESA, 'trf-1', 'recibir', RECIBE, {
      detalles: [{ detalleId: 'det-1', ubicacionDestinoId: 'ub-rec', cantidadDanada: 10 }],
    });

    expect(inventario.registrarCompra).toHaveBeenCalledTimes(1);
    const entrada = inventario.registrarCompra.mock.calls[0];
    // (productoId, almacenId, cantidad, ...)
    expect(entrada[2]).toBe(100);

    expect(inventario.mermaEnTransaccion).toHaveBeenCalledTimes(1);
    const merma = inventario.mermaEnTransaccion.mock.calls[0][1];
    expect(merma.cantidad).toBe(10);
    expect(merma.almacenId).toBe('alm-destino');
    expect(merma.loteEspecificoId).toBe('lote-recibido');
    expect(merma.empresaId).toBe(EMPRESA);
    expect(merma.usuarioId).toBe(RECIBE);

    // Y el renglón conserva los tres números, que es lo que audita el almacén.
    expect(detalle.cantidadRecibida).toBe(90);
    expect(detalle.cantidadDanada).toBe(10);
  });

  it('el valor que sale del mayor es el de lo dañado, no el de otro lote', async () => {
    /*
     * El orden importa y por eso se mide: primero la entrada del lote, después
     * la merma contra ESE lote. Al revés —o sin lote— el consumo por caducidad
     * elige otro lote del almacén destino y carga a mermas un costo que no es
     * el de lo que se rompió, dejando las piezas malas en existencia.
     */
    const { servicio, inventario } = armar({ enviada: 40, danada: 5 });
    const orden: string[] = [];
    inventario.registrarCompra.mockImplementation(async () => { orden.push('entrada'); return { mensaje: 'ok' }; });
    inventario.mermaEnTransaccion.mockImplementation(async () => { orden.push('merma'); return { mensaje: 'ok' }; });

    await servicio.cambiarEstadoTransferencia(EMPRESA, 'trf-1', 'recibir', RECIBE, {
      detalles: [{ detalleId: 'det-1', ubicacionDestinoId: 'ub-rec', cantidadDanada: 5 }],
    });

    expect(orden).toEqual(['entrada', 'merma']);
    expect(inventario.registrarCompra.mock.calls[0][2]).toBe(40);
    expect(inventario.mermaEnTransaccion.mock.calls[0][1].cantidad).toBe(5);
  });

  it('sin daño no se declara ninguna merma', async () => {
    const { servicio, inventario } = armar({ enviada: 25, danada: 0 });

    await servicio.cambiarEstadoTransferencia(EMPRESA, 'trf-1', 'recibir', RECIBE, {
      detalles: [{ detalleId: 'det-1', ubicacionDestinoId: 'ub-rec', cantidadDanada: 0 }],
    });

    expect(inventario.registrarCompra.mock.calls[0][2]).toBe(25);
    expect(inventario.mermaEnTransaccion).not.toHaveBeenCalled();
  });

  it('la recepción deja nombre en la entrada del destino', async () => {
    /*
     * `registrarCompra` guarda `usuarioId` desde el 4-oct y la recepción era
     * uno de los sitios que no lo pasaba: la entrada aparecía en el kardex con
     * la columna vacía.
     */
    const { servicio, inventario } = armar({ enviada: 10, danada: 0 });

    await servicio.cambiarEstadoTransferencia(EMPRESA, 'trf-1', 'recibir', RECIBE, {
      detalles: [{ detalleId: 'det-1', ubicacionDestinoId: 'ub-rec' }],
    });

    expect(inventario.registrarCompra.mock.calls[0][12]).toBe(RECIBE);
  });

  it('quien envió no puede registrar la recepción', async () => {
    const { servicio } = armar({ enviada: 10, danada: 0 });
    await expect(
      servicio.cambiarEstadoTransferencia(EMPRESA, 'trf-1', 'recibir', ENVIO, {
        detalles: [{ detalleId: 'det-1', ubicacionDestinoId: 'ub-rec' }],
      }),
    ).rejects.toThrow(/no puede registrar su recepción/);
  });
});
