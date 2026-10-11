'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, RefreshCw, ScanSearch, Ban, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { fechaNumerica, hoyISO } from '@/lib/fechas';
import { FOLIO, folioDe } from '@/lib/folios';

/**
 * ============================================================================
 * Facturas de proveedor y el cotejo de tres vías
 * ----------------------------------------------------------------------------
 * El documento que faltaba. El ERP sabía lo que PIDIÓ (la orden) y lo que
 * LLEGÓ (la recepción), pero no lo que le COBRAN: el CFDI del proveedor no
 * existía en ninguna pantalla. Sin él, el pago se validaba sólo contra lo
 * recibido, y pagar por encima de lo facturado es pagar sin comprobante —y
 * acreditar un IVA que ningún CFDI respalda—.
 *
 * Dos decisiones que se ven en la pantalla y conviene no deshacer:
 *
 *   1. **Las diferencias no impiden capturar.** Una factura con diferencias se
 *      guarda igual, marcada. Rechazarla dejaría al sistema sin rastro del
 *      papel que de verdad llegó, mientras el proveedor sigue reclamando su
 *      cobro. Lo que se bloquea es el pago.
 *   2. **Capturar la factura no es obligatorio para pagar.** Quien no las
 *      captura queda como estaba; quien empieza a capturarlas gana el tope
 *      desde la primera. Un documento nuevo no puede apagar la operación.
 *
 * Y el botón de volver a cotejar existe porque el cotejo es una FOTO: una
 * factura que llegó antes que la mercancía nace con diferencias y se concilia
 * sola en cuanto entra la remesa.
 * ============================================================================
 */

type Orden = {
  id: string;
  folio?: string | null;
  estado: string;
  total: number;
  proveedorId?: string;
  proveedor?: { nombre?: string };
  detalles?: Array<{
    id: string;
    productoId: string;
    cantidad: number;
    cantidadRecibidaOk: number;
    precioUnitario: number;
    tasaIva: number;
    producto?: { nombre?: string; sku?: string };
  }>;
};
type Proveedor = { id: string; nombre: string };
type Diferencia = { tipo: string; detalle: string };
type Renglon = {
  detalleOrdenId: string | null;
  descripcion: string | null;
  ordenado: number;
  recibido: number;
  facturado: number;
  precioPactado: number;
  precioFacturado: number;
  diferencias: Diferencia[];
};
type Cotejo = { conciliado: boolean; renglones: Renglon[]; resumen: string };
type Factura = {
  id: string;
  folio?: string | null;
  folioProveedor?: string | null;
  uuidFiscal?: string | null;
  proveedorId: string;
  ordenCompraId?: string | null;
  fechaEmision: string;
  total: number;
  impuestos: number;
  estado: 'REGISTRADA' | 'CONCILIADA' | 'CON_DIFERENCIAS' | 'CANCELADA';
};

const dinero = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);

const COLOR: Record<string, string> = {
  CONCILIADA: 'bg-emerald-100 text-emerald-800',
  CON_DIFERENCIAS: 'bg-amber-100 text-amber-900',
  REGISTRADA: 'bg-slate-100 text-slate-700',
  CANCELADA: 'bg-slate-200 text-slate-500 line-through',
};

export default function FacturasProveedorPage() {
  const { avisar } = useAvisos();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [vedado, setVedado] = useState({ facturas: false, ordenes: false, proveedores: false });

  const [ordenId, setOrdenId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [uuidFiscal, setUuid] = useState('');
  const [folioProveedor, setFolioProveedor] = useState('');
  const [fechaEmision, setFechaEmision] = useState(hoyISO());
  const [fechaVencimiento, setVence] = useState('');
  const [notas, setNotas] = useState('');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [lineas, setLineas] = useState<
    Array<{ detalleOrdenId: string | null; productoId?: string; descripcion: string; cantidad: string; precioUnitario: string; tasaIva: number }>
  >([]);
  const [detalle, setDetalle] = useState<{ factura: Factura; cotejo: Cotejo | null } | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      /* Cada lectura con su propia red: un 403 en proveedores no puede dejar
         la lista de facturas en blanco, que se leería como «no hay». */
      const [fs, oc, pr] = await Promise.all([
        conPermiso(api.get<Factura[]>('/compras/facturas-proveedor')),
        conPermiso(api.get<any>('/compras/ordenes')),
        conPermiso(api.get<any>('/proveedores')),
      ]);
      setFacturas(Array.isArray(fs.valor) ? fs.valor : []);
      const listaOC = Array.isArray(oc.valor) ? oc.valor : (oc.valor?.data ?? []);
      setOrdenes(listaOC.filter((o: Orden) => o.estado !== 'CANCELADA'));
      const listaPr = Array.isArray(pr.valor) ? pr.valor : (pr.valor?.data ?? []);
      setProveedores(listaPr);
      setVedado({ facturas: fs.vedado, ordenes: oc.vedado, proveedores: pr.vedado });
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cargar.', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  /* Al elegir la orden se traen sus partidas y se proponen como renglones de
     la factura, con lo que FALTA por facturar y el precio pactado. Teclear la
     factura entera a mano es la forma segura de que las diferencias que el
     cotejo busca las produzca quien captura. */
  useEffect(() => {
    setOrden(null);
    if (!ordenId) {
      setLineas([]);
      return;
    }
    api
      .get<Orden>(`/compras/ordenes/${ordenId}`)
      .then((o) => {
        setOrden(o);
        if (o.proveedorId) setProveedorId(o.proveedorId);
        setLineas(
          (o.detalles ?? []).map((d) => ({
            detalleOrdenId: d.id,
            productoId: d.productoId,
            descripcion: d.producto?.nombre ?? '',
            cantidad: String(Number(d.cantidadRecibidaOk ?? 0) || 0),
            precioUnitario: String(Number(d.precioUnitario ?? 0)),
            tasaIva: Number(d.tasaIva ?? 0),
          })),
        );
      })
      .catch((e) =>
        avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo leer la orden.', 'error'),
      );
  }, [ordenId]);

  const totales = useMemo(() => {
    let subtotal = 0;
    let impuestos = 0;
    for (const l of lineas) {
      const neto = Math.round(Number(l.cantidad || 0) * Number(l.precioUnitario || 0) * 100) / 100;
      subtotal += neto;
      impuestos += Math.round(neto * Number(l.tasaIva || 0) * 100) / 100;
    }
    return { subtotal, impuestos, total: Math.round((subtotal + impuestos) * 100) / 100 };
  }, [lineas]);

  const cambiar = (i: number, campo: 'cantidad' | 'precioUnitario' | 'descripcion', valor: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const agregarLinea = () =>
    setLineas((ls) => [
      ...ls,
      { detalleOrdenId: null, descripcion: '', cantidad: '1', precioUnitario: '0', tasaIva: 0.16 },
    ]);

  const registrar = async () => {
    if (!proveedorId) return avisar('Elige el proveedor que emite la factura.', 'alerta');
    const utiles = lineas.filter((l) => Number(l.cantidad) > 0);
    if (!utiles.length) return avisar('La factura necesita al menos una partida con cantidad.', 'alerta');
    setGuardando(true);
    try {
      const r = await api.post<any>('/compras/facturas-proveedor', {
        proveedorId,
        ordenCompraId: ordenId || undefined,
        uuidFiscal: uuidFiscal.trim() || undefined,
        folioProveedor: folioProveedor.trim() || undefined,
        fechaEmision,
        fechaVencimiento: fechaVencimiento || undefined,
        notas: notas.trim() || undefined,
        detalles: utiles.map((l) => ({
          detalleOrdenId: l.detalleOrdenId ?? undefined,
          productoId: l.productoId,
          descripcion: l.descripcion || undefined,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
          tasaIva: l.tasaIva,
        })),
      });
      avisar(
        r.cotejo
          ? r.cotejo.conciliado
            ? `Factura ${r.folio} registrada y conciliada: ${r.cotejo.resumen}`
            : `Factura ${r.folio} registrada CON DIFERENCIAS: ${r.cotejo.resumen}`
          : `Factura ${r.folio} registrada. Sin orden de compra, no hay contra qué cotejarla.`,
        r.cotejo && !r.cotejo.conciliado ? 'alerta' : 'exito',
      );
      setUuid('');
      setFolioProveedor('');
      setNotas('');
      setOrdenId('');
      setLineas([]);
      await cargar();
    } catch (e) {
      avisar(
        e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo registrar la factura.',
        'error',
      );
    } finally {
      setGuardando(false);
    }
  };

  const ver = async (id: string) => {
    try {
      const f = await api.get<any>(`/compras/facturas-proveedor/${id}`);
      setDetalle({ factura: f, cotejo: f.cotejo ?? null });
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo abrir la factura.', 'error');
    }
  };

  const recotejar = async (id: string) => {
    try {
      const r = await api.patch<any>(`/compras/facturas-proveedor/${id}/recotejar`, {});
      avisar(
        r.cotejo?.conciliado
          ? 'Ya coincide: la factura quedó conciliada.'
          : `Sigue habiendo diferencias: ${r.cotejo?.resumen ?? ''}`,
        r.cotejo?.conciliado ? 'exito' : 'alerta',
      );
      await cargar();
      await ver(id);
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cotejar.', 'error');
    }
  };

  const cancelar = async (id: string) => {
    const motivo = window.prompt('¿Por qué se cancela esta factura? (queda en la bitácora)');
    if (motivo === null) return;
    if (motivo.trim().length < 5) return avisar('El motivo necesita al menos cinco caracteres.', 'alerta');
    try {
      const r = await api.patch<any>(`/compras/facturas-proveedor/${id}/cancelar`, { motivo: motivo.trim() });
      avisar(r.mensaje ?? 'Factura cancelada.', 'exito');
      setDetalle(null);
      await cargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cancelar.', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <FileText />
            Facturas de proveedor
          </h1>
          <p className="text-slate-500">
            El tercer lado del triángulo: lo que pedí, lo que llegó y lo que me cobran. Al guardar se
            coteja partida por partida, y el pago no puede pasar de lo facturado.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/compras/ordenes" className="px-4 py-2 rounded-xl border font-semibold">
            Órdenes de compra
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
        <h2 className="font-bold text-lg">Capturar la factura que llegó</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="font-semibold">Orden de compra</span>
            <select
              className="w-full border rounded-xl p-2 mt-1"
              value={ordenId}
              onChange={(e) => setOrdenId(e.target.value)}
            >
              <option value="">Sin orden (luz, honorarios, renta…)</option>
              {ordenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {folioDe(o, FOLIO.ORDEN_COMPRA)} · {o.proveedor?.nombre ?? 'Proveedor'} · {dinero(o.total)}
                </option>
              ))}
            </select>
            {vedado.ordenes && (
              <span className="text-xs text-amber-700">No puedes leer las órdenes con tu rol.</span>
            )}
          </label>
          <label className="text-sm">
            <span className="font-semibold">Proveedor</span>
            <select
              className="w-full border rounded-xl p-2 mt-1"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={!!ordenId}
            >
              <option value="">Elige…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {!!ordenId && (
              <span className="text-xs text-slate-500">Lo fija la orden: la factura es de quien entregó.</span>
            )}
          </label>
          <label className="text-sm">
            <span className="font-semibold">UUID fiscal (CFDI)</span>
            <input
              className="w-full border rounded-xl p-2 mt-1 font-mono text-xs"
              placeholder="8-4-4-4-12"
              value={uuidFiscal}
              onChange={(e) => setUuid(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Folio del proveedor</span>
            <input
              className="w-full border rounded-xl p-2 mt-1"
              value={folioProveedor}
              onChange={(e) => setFolioProveedor(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Fecha de emisión</span>
            <input
              type="date"
              className="w-full border rounded-xl p-2 mt-1"
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Vence</span>
            <input
              type="date"
              className="w-full border rounded-xl p-2 mt-1"
              value={fechaVencimiento}
              onChange={(e) => setVence(e.target.value)}
            />
          </label>
        </div>

        {!!lineas.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Concepto</th>
                  <th className="p-2 text-right">Pedido</th>
                  <th className="p-2 text-right">Recibido</th>
                  <th className="p-2 text-right">Se factura</th>
                  <th className="p-2 text-right">Precio</th>
                  <th className="p-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const d = (orden?.detalles ?? []).find((x) => x.id === l.detalleOrdenId);
                  const neto = Number(l.cantidad || 0) * Number(l.precioUnitario || 0);
                  return (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <input
                          className="w-full border rounded-lg p-1"
                          value={l.descripcion}
                          onChange={(e) => cambiar(i, 'descripcion', e.target.value)}
                          placeholder="Concepto"
                        />
                      </td>
                      <td className="p-2 text-right text-slate-500">{d ? d.cantidad : '—'}</td>
                      <td className="p-2 text-right text-slate-500">{d ? d.cantidadRecibidaOk : '—'}</td>
                      <td className="p-2 text-right">
                        <input
                          className="w-24 border rounded-lg p-1 text-right"
                          value={l.cantidad}
                          onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          className="w-28 border rounded-lg p-1 text-right"
                          value={l.precioUnitario}
                          onChange={(e) => cambiar(i, 'precioUnitario', e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-right font-semibold">{dinero(neto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={agregarLinea} className="px-3 py-2 rounded-xl border text-sm font-semibold">
            + Partida que no está en la orden
          </button>
          <div className="text-right text-sm">
            <div>Subtotal: <b>{dinero(totales.subtotal)}</b></div>
            <div>Impuestos: <b>{dinero(totales.impuestos)}</b></div>
            <div className="text-lg">Total: <b>{dinero(totales.total)}</b></div>
          </div>
        </div>

        <textarea
          className="w-full border rounded-xl p-2 text-sm"
          rows={2}
          placeholder="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />

        <button
          onClick={() => void registrar()}
          disabled={guardando}
          className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Registrar y cotejar'}
        </button>
      </section>

      <section className="border rounded-2xl bg-white overflow-hidden">
        <h2 className="font-bold text-lg p-4 pb-2">Capturadas</h2>
        {vedado.facturas ? (
          <p className="p-4 text-amber-700 text-sm">
            Tu rol no puede leer las facturas de proveedor. No es que no haya: es que no se te muestran.
          </p>
        ) : !facturas.length ? (
          <p className="p-4 text-slate-500 text-sm">Todavía no hay facturas capturadas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="p-3">Folio</th>
                <th className="p-3">Del proveedor</th>
                <th className="p-3">Emitida</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="p-3 font-mono">{folioDe(f, FOLIO.FACTURA_PROVEEDOR)}</td>
                  <td className="p-3">{f.folioProveedor ?? f.uuidFiscal ?? '—'}</td>
                  <td className="p-3">{fechaNumerica(f.fechaEmision)}</td>
                  <td className="p-3 text-right">{dinero(f.total)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${COLOR[f.estado] ?? ''}`}>
                      {f.estado.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => void ver(f.id)} className="px-2 py-1 border rounded-lg mr-1" title="Ver el cotejo">
                      <ScanSearch className="inline w-4 h-4" />
                    </button>
                    {f.estado === 'CON_DIFERENCIAS' && (
                      <button onClick={() => void recotejar(f.id)} className="px-2 py-1 border rounded-lg mr-1" title="Volver a cotejar">
                        <RefreshCw className="inline w-4 h-4" />
                      </button>
                    )}
                    {f.estado !== 'CANCELADA' && (
                      <button onClick={() => void cancelar(f.id)} className="px-2 py-1 border rounded-lg" title="Cancelar">
                        <Ban className="inline w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-black">
                {folioDe(detalle.factura, FOLIO.FACTURA_PROVEEDOR)} · {dinero(detalle.factura.total)}
              </h3>
              {/* Un modal sin salida visible es un modal del que la gente sale recargando. */}
              <button onClick={() => setDetalle(null)} className="px-3 py-1 border rounded-xl font-semibold">
                Cerrar
              </button>
            </div>
            {!detalle.cotejo ? (
              <p className="text-slate-500 text-sm">
                Esta factura no tiene orden de compra: no hay contra qué cotejarla y se revisa a mano.
              </p>
            ) : (
              <>
                <p className={`flex items-center gap-2 font-semibold ${detalle.cotejo.conciliado ? 'text-emerald-700' : 'text-amber-800'}`}>
                  {detalle.cotejo.conciliado ? <CheckCircle2 /> : <AlertTriangle />}
                  {detalle.cotejo.resumen}
                </p>
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="p-2">Concepto</th>
                      <th className="p-2 text-right">Pedido</th>
                      <th className="p-2 text-right">Recibido</th>
                      <th className="p-2 text-right">Facturado</th>
                      <th className="p-2 text-right">Pactado</th>
                      <th className="p-2 text-right">Cobran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.cotejo.renglones.map((r, i) => (
                      <tr key={i} className={`border-t align-top ${r.diferencias.length ? 'bg-amber-50' : ''}`}>
                        <td className="p-2">
                          {r.descripcion ?? '—'}
                          {r.diferencias.map((d, j) => (
                            <div key={j} className="text-xs text-amber-900 mt-1">
                              · {d.detalle}
                            </div>
                          ))}
                        </td>
                        <td className="p-2 text-right">{r.ordenado}</td>
                        <td className="p-2 text-right">{r.recibido}</td>
                        <td className="p-2 text-right font-semibold">{r.facturado}</td>
                        <td className="p-2 text-right">{dinero(r.precioPactado)}</td>
                        <td className="p-2 text-right">{dinero(r.precioFacturado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
