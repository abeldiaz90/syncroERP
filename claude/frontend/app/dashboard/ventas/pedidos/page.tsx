'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  RefreshCw,
  PackageCheck,
  Ban,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { fechaNumerica, hoyISO } from '@/lib/fechas';
import { FOLIO, folioDe } from '@/lib/folios';
import { useCerrarConEscape } from '@/hooks/use-cerrar-con-escape';

/**
 * ============================================================================
 * Pedidos de venta
 * ----------------------------------------------------------------------------
 * El documento que faltaba del lado de la venta. Hasta hoy el ERP sólo sabía
 * de la venta de mostrador, que cobra y descarga inventario en el mismo acto;
 * todo lo anterior —«apártame diez», «quiero cincuenta y tienes treinta»,
 * «mándame la mitad ahora»— vivía en una libreta.
 *
 * La pantalla enseña los tres números del renglón porque son tres cosas
 * distintas y confundirlas es lo que hace que alguien prometa mercancía que no
 * hay: lo PEDIDO, lo APARTADO en el almacén y lo que está EN ESPERA de que
 * entre remesa. El tercero es el que no existía en ningún lado.
 * ============================================================================
 */

type Renglon = {
  id: string;
  productoId: string;
  producto?: { nombre?: string; sku?: string };
  cantidad: number;
  cantidadSurtida: number;
  cantidadReservada: number;
  pendiente: number;
  reservado: number;
  enEspera: number;
  precioUnitario: number;
};
type Pedido = {
  id: string;
  folio?: string | null;
  estado: 'BORRADOR' | 'CONFIRMADO' | 'SURTIDO_PARCIAL' | 'SURTIDO' | 'CANCELADO';
  clienteId?: string | null;
  cliente?: { nombre?: string };
  almacenId?: string | null;
  fechaPedido: string;
  fechaCompromiso?: string | null;
  total: number;
  notas?: string | null;
  detalles?: Renglon[];
  backorder?: boolean;
};
type EnEspera = {
  id: string;
  folio?: string | null;
  fechaCompromiso?: string | null;
  cliente?: string | null;
  producto?: string | null;
  enEspera: number;
};
type Cliente = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };
type Producto = { id: string; nombre: string; sku?: string };

const dinero = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);

const COLOR: Record<string, string> = {
  BORRADOR: 'bg-slate-100 text-slate-700',
  CONFIRMADO: 'bg-sky-100 text-sky-800',
  SURTIDO_PARCIAL: 'bg-amber-100 text-amber-900',
  SURTIDO: 'bg-emerald-100 text-emerald-800',
  CANCELADO: 'bg-slate-200 text-slate-500 line-through',
};

export default function PedidosVentaPage() {
  const { avisar } = useAvisos();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [vedado, setVedado] = useState({ pedidos: false, clientes: false, almacenes: false });

  const [clienteId, setClienteId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [fechaCompromiso, setCompromiso] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Array<{ productoId: string; cantidad: string }>>([
    { productoId: '', cantidad: '1' },
  ]);
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [espera, setEspera] = useState<EnEspera[]>([]);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');

  const cargar = async () => {
    setCargando(true);
    try {
      /* Cada lectura con su propia red y con `conPermiso`: un 403 en clientes
         no puede convertirse en «no hay pedidos», que suena a buena noticia. */
      const [ps, es, cs, als, prs] = await Promise.all([
        conPermiso(api.get<Pedido[]>('/ventas/pedidos')),
        /* El reporte de lo comprometido sin mercancía lo arma el servidor en
           una sola consulta: sumarlo en el navegador obligaría a traer todos
           los renglones de todos los pedidos para contar unos pocos. */
        conPermiso(api.get<EnEspera[]>('/ventas/pedidos/en-espera')),
        conPermiso(api.get<any>('/clientes')),
        conPermiso(api.get<any>('/catalogo/almacenes/para-venta')),
        conPermiso(api.get<any>('/catalogo/productos', { query: { limite: 500 } })),
      ]);
      setPedidos(Array.isArray(ps.valor) ? ps.valor : []);
      setEspera(Array.isArray(es.valor) ? es.valor : []);
      setClientes(Array.isArray(cs.valor) ? cs.valor : (cs.valor?.data ?? []));
      setAlmacenes(Array.isArray(als.valor) ? als.valor : (als.valor?.almacenes ?? []));
      const lp = Array.isArray(prs.valor) ? prs.valor : (prs.valor?.data ?? []);
      setProductos(lp);
      setVedado({ pedidos: ps.vedado, clientes: cs.vedado, almacenes: als.vedado });
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cargar.', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  const cambiar = (i: number, campo: 'productoId' | 'cantidad', valor: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const crear = async () => {
    const utiles = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0);
    if (!utiles.length) return avisar('Elige al menos un producto con cantidad.', 'alerta');
    setGuardando(true);
    try {
      const r = await api.post<any>('/ventas/pedidos', {
        clienteId: clienteId || undefined,
        almacenId: almacenId || undefined,
        fechaPedido: hoyISO(),
        fechaCompromiso: fechaCompromiso || undefined,
        notas: notas.trim() || undefined,
        detalles: utiles.map((l) => ({
          productoId: l.productoId,
          cantidad: Number(l.cantidad),
        })),
      });
      avisar(
        `Pedido ${r.folio ?? ''} capturado como borrador. Confírmalo para apartar la mercancía.`,
        'exito',
      );
      setLineas([{ productoId: '', cantidad: '1' }]);
      setNotas('');
      await cargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo crear el pedido.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const ver = async (id: string) => {
    try {
      setDetalle(await api.get<Pedido>(`/ventas/pedidos/${id}`));
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo abrir el pedido.', 'error');
    }
  };

  const confirmar = async (id: string) => {
    try {
      const r = await api.patch<Pedido>(`/ventas/pedidos/${id}/confirmar`, {});
      avisar(
        r.backorder
          ? 'Pedido confirmado. Parte de la mercancía quedó en espera: míralo en el detalle.'
          : 'Pedido confirmado y mercancía apartada.',
        r.backorder ? 'alerta' : 'exito',
      );
      await cargar();
      await ver(id);
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo confirmar.', 'error');
    }
  };

  const reintentar = async (id: string) => {
    try {
      const r = await api.patch<Pedido>(`/ventas/pedidos/${id}/reintentar-apartado`, {});
      avisar(
        r.backorder ? 'Todavía falta mercancía por apartar.' : 'Ya quedó todo apartado.',
        r.backorder ? 'alerta' : 'exito',
      );
      await cargar();
      await ver(id);
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo apartar.', 'error');
    }
  };

  const surtir = async (id: string, aceptarPrecioVigente = false) => {
    try {
      const r = await api.post<any>(`/ventas/pedidos/${id}/surtir`, {
        metodoPago,
        aceptarPrecioVigente,
      });
      avisar(`Entrega registrada. Venta ${r.venta?.folio ?? r.venta?.id ?? ''}.`, 'exito');
      await cargar();
      await ver(id);
    } catch (e) {
      const mensaje =
        e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo surtir el pedido.';
      /*
       * La negativa por precio movido trae los dos números. No se reintenta
       * sola: la pantalla repite el mensaje del servidor y pregunta, porque
       * cobrar otro precio del pactado es una decisión de una persona.
       */
      if (/precio cambió/i.test(mensaje)) {
        if (window.confirm(`${mensaje}\n\n¿Cobrar el precio de hoy?`)) {
          return surtir(id, true);
        }
        return;
      }
      avisar(mensaje, 'error');
    }
  };

  const cancelar = async (id: string) => {
    const motivo = window.prompt('¿Por qué se cancela el pedido? (queda en la bitácora)');
    if (motivo === null) return;
    if (motivo.trim().length < 5) return avisar('El motivo necesita al menos cinco caracteres.', 'alerta');
    try {
      await api.patch(`/ventas/pedidos/${id}/cancelar`, { motivo: motivo.trim() });
      avisar('Pedido cancelado y mercancía liberada.', 'exito');
      setDetalle(null);
      await cargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cancelar.', 'error');
    }
  };

  /* Un modal sin salida es un modal del que la gente sale recargando, y
     recargar a media captura pierde lo tecleado. */
  useCerrarConEscape(!!detalle, () => setDetalle(null));

  const enEspera = useMemo(() => new Set(espera.map((e) => e.id)).size, [espera]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <ClipboardList />
            Pedidos de venta
          </h1>
          <p className="text-slate-500">
            Lo que el cliente ya pidió y todavía no se lleva. Confirmar aparta la mercancía que
            hay; lo que falta queda anotado en espera, no se pierde.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/ventas/historial" className="px-4 py-2 rounded-xl border font-semibold">
            Historial de ventas
          </Link>
          <button
            aria-label="Volver a cargar"
            title="Volver a cargar"
            onClick={() => void cargar()}
            className="p-2 border rounded-xl"
          >
            <RefreshCw className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <section className="border rounded-2xl p-4 space-y-4 bg-white">
        <h2 className="font-bold text-lg">Capturar un pedido</h2>
        <p className="text-sm text-slate-500">
          Nace como borrador y no aparta nada: mientras se teclea, la mercancía sigue disponible
          para quien llegue al mostrador.
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="font-semibold">Cliente</span>
            <select
              className="w-full border rounded-xl p-2 mt-1"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Público general</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">Almacén que compromete</span>
            <select
              className="w-full border rounded-xl p-2 mt-1"
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
            >
              <option value="">Elige…</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-semibold">Se le prometió para</span>
            <input
              type="date"
              className="w-full border rounded-xl p-2 mt-1"
              value={fechaCompromiso}
              onChange={(e) => setCompromiso(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select
                className="flex-1 border rounded-xl p-2"
                value={l.productoId}
                onChange={(e) => cambiar(i, 'productoId', e.target.value)}
              >
                <option value="">Producto…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku ? `${p.sku} · ` : ''}
                    {p.nombre}
                  </option>
                ))}
              </select>
              <input
                className="w-28 border rounded-xl p-2 text-right"
                value={l.cantidad}
                onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
              />
            </div>
          ))}
          <button
            onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '1' }])}
            className="px-3 py-2 rounded-xl border text-sm font-semibold"
          >
            + Otra partida
          </button>
        </div>

        <textarea
          className="w-full border rounded-xl p-2 text-sm"
          rows={2}
          placeholder="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          El precio lo pone el servidor con la lista vigente, igual que en la caja.
        </p>
        <button
          onClick={() => void crear()}
          disabled={guardando}
          className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Capturar pedido'}
        </button>
      </section>

      {!!espera.length && (
        <section className="border border-amber-300 rounded-2xl bg-amber-50 overflow-hidden">
          <h2 className="font-bold text-lg p-4 pb-2 flex items-center gap-2 text-amber-900">
            <Clock className="w-5 h-5" />
            Comprometido sin mercancía
          </h2>
          <p className="px-4 pb-2 text-sm text-amber-900">
            Esto es lo que alguien está esperando y el almacén no tiene. Ordenado por la fecha que
            se le prometió: el primero de la lista es por el que van a llamar hoy.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-amber-900/70">
              <tr>
                <th className="p-3">Pedido</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Producto</th>
                <th className="p-3">Prometido</th>
                <th className="p-3 text-right">Faltan</th>
              </tr>
            </thead>
            <tbody>
              {espera.map((e, i) => (
                <tr key={`${e.id}-${i}`} className="border-t border-amber-200">
                  <td className="p-3 font-mono">{e.folio ?? '—'}</td>
                  <td className="p-3">{e.cliente ?? 'Público general'}</td>
                  <td className="p-3">{e.producto ?? '—'}</td>
                  <td className="p-3">
                    {e.fechaCompromiso ? fechaNumerica(e.fechaCompromiso) : 'sin fecha'}
                  </td>
                  <td className="p-3 text-right font-bold">{e.enEspera}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="border rounded-2xl bg-white overflow-hidden">
        <div className="p-4 pb-2 flex items-center justify-between">
          <h2 className="font-bold text-lg">Pedidos</h2>
          {enEspera > 0 && (
            <span className="text-sm text-amber-800 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {enEspera} con mercancía en espera
            </span>
          )}
        </div>
        {vedado.pedidos ? (
          <p className="p-4 text-amber-700 text-sm">
            Tu rol no puede leer los pedidos de venta. No es que no haya: es que no se te muestran.
          </p>
        ) : !pedidos.length ? (
          <p className="p-4 text-slate-500 text-sm">Todavía no hay pedidos capturados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="p-3">Folio</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Prometido</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-mono">{folioDe(p, FOLIO.PEDIDO_VENTA)}</td>
                  <td className="p-3">{p.cliente?.nombre ?? 'Público general'}</td>
                  <td className="p-3">{fechaNumerica(p.fechaPedido)}</td>
                  <td className="p-3">
                    {p.fechaCompromiso ? fechaNumerica(p.fechaCompromiso) : '—'}
                  </td>
                  <td className="p-3 text-right">{dinero(p.total)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${COLOR[p.estado] ?? ''}`}>
                      {p.estado.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => void ver(p.id)} className="px-3 py-1 border rounded-lg">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detalle && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black">
                  {folioDe(detalle, FOLIO.PEDIDO_VENTA)} · {detalle.cliente?.nombre ?? 'Público general'}
                </h3>
                <p className="text-sm text-slate-500">
                  {detalle.estado.replace('_', ' ')}
                  {detalle.backorder ? ' · hay mercancía en espera' : ''}
                </p>
              </div>
              {/* Un modal sin salida visible es un modal del que la gente sale recargando. */}
              <button onClick={() => setDetalle(null)} className="px-3 py-1 border rounded-xl font-semibold">
                Cerrar
              </button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Producto</th>
                  <th className="p-2 text-right">Pedido</th>
                  <th className="p-2 text-right">Entregado</th>
                  <th className="p-2 text-right">Apartado</th>
                  <th className="p-2 text-right">En espera</th>
                  <th className="p-2 text-right">Precio</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.detalles ?? []).map((d) => (
                  <tr key={d.id} className={`border-t ${d.enEspera > 0 ? 'bg-amber-50' : ''}`}>
                    <td className="p-2">{d.producto?.nombre ?? d.productoId}</td>
                    <td className="p-2 text-right">{d.cantidad}</td>
                    <td className="p-2 text-right">{d.cantidadSurtida}</td>
                    <td className="p-2 text-right font-semibold">{d.reservado}</td>
                    <td className="p-2 text-right text-amber-900 font-semibold">
                      {d.enEspera > 0 ? d.enEspera : '—'}
                    </td>
                    <td className="p-2 text-right">{dinero(d.precioUnitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {detalle.estado === 'BORRADOR' && (
                <button
                  onClick={() => void confirmar(detalle.id)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold"
                >
                  <CheckCircle2 className="inline w-4 h-4 mr-1" />
                  Confirmar y apartar
                </button>
              )}
              {(detalle.estado === 'CONFIRMADO' || detalle.estado === 'SURTIDO_PARCIAL') && (
                <>
                  <select
                    className="border rounded-xl p-2 text-sm"
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                  <button
                    onClick={() => void surtir(detalle.id)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold"
                  >
                    <PackageCheck className="inline w-4 h-4 mr-1" />
                    Surtir lo apartado
                  </button>
                  {detalle.backorder && (
                    <button
                      onClick={() => void reintentar(detalle.id)}
                      className="px-4 py-2 rounded-xl border font-semibold"
                    >
                      <RefreshCw className="inline w-4 h-4 mr-1" />
                      Volver a intentar el apartado
                    </button>
                  )}
                </>
              )}
              {detalle.estado !== 'CANCELADO' && detalle.estado !== 'SURTIDO' && (
                <button
                  onClick={() => void cancelar(detalle.id)}
                  className="px-4 py-2 rounded-xl border font-semibold text-red-700"
                >
                  <Ban className="inline w-4 h-4 mr-1" />
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
