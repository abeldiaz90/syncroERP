'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Undo2, RefreshCw, PackageMinus } from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { fechaNumerica, hoyISO } from '@/lib/fechas';
import { FOLIO, folioDe } from '@/lib/folios';

/**
 * ============================================================================
 * Devoluciones a proveedor
 * ----------------------------------------------------------------------------
 * La pantalla del circuito que faltaba. Hasta el 26-sep-2026, al intentar
 * cancelar una orden ya recibida el sistema mandaba a «registrar la devolución
 * al proveedor» y no había dónde: ni endpoint, ni pantalla, ni asiento. Lo
 * único a mano era un ajuste de inventario, que dice otra cosa —un ajuste es
 * una merma nuestra; una devolución cambia lo que le debemos al proveedor—.
 *
 * La pantalla sólo ofrece lo que el servidor acepta: se parte de una orden
 * RECIBIDA y cada partida trae su tope, que es lo recibido menos lo ya
 * devuelto. Un formulario que ofrece más de lo que el servidor admite termina
 * siempre en un 400 con todo capturado.
 * ============================================================================
 */

/* El proveedor se llama `nombre` en la entidad; `nombreComercial` no existe y
   pintaba «Proveedor» en todos los renglones. */
type Orden = { id: string; folio?: string | null; estado: string; total: number; proveedor?: { nombre?: string } };
type Partida = {
  detalleOrdenId: string; productoId: string; producto: string | null; sku: string | null;
  recibido: number; devuelto: number; disponible: number; costoUnitario: number; tasaIva: number;
};
type Devolvible = {
  folio: string;
  proveedor: string | null;
  estadoPago: string;
  partidas: Partida[];
  /** Dónde entró la mercancía: de ahí tiene que salir. */
  almacenesRecepcion?: Array<{ id: string; nombre: string }>;
};
type Devolucion = {
  id: string; folio: string; fecha: string; motivo: string; total: number; estado: string;
  notaCreditoProveedor?: string | null; almacen?: { nombre?: string };
  detalles?: Array<{ cantidad: number; producto?: { nombre?: string; sku?: string } }>;
};
type Almacen = { id: string; nombre: string };

/*
 * `hoyISO()` arma la fecha con las partes locales del reloj.
 *
 * Aquí decía `new Date().toISOString().slice(0, 10)`, que convierte a UTC
 * antes de recortar: en México (UTC-6), a partir de las 18:00 eso devuelve EL
 * DÍA SIGUIENTE. Es el mismo defecto que ya costó una corrección en las fechas
 * de las pólizas —medido el 30-sep-2026: una compra de las 18:13 quedó
 * fechada el 1-oct—, ahora del lado del navegador y proponiendo la fecha por
 * omisión de un documento que alguien va a aceptar sin mirar.
 */
const hoy = () => hoyISO();
const dinero = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

export default function DevolucionesProveedorPage() {
  const { avisar } = useAvisos();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [ordenId, setOrdenId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [devolvible, setDevolvible] = useState<Devolvible | null>(null);
  /*
   * Qué de lo que esta pantalla necesita no es del rol de quien mira. No es lo
   * mismo que esté vacío a que no se pueda ver, y la pantalla tiene que poder
   * decir cuál de las dos es.
   */
  const [vedado, setVedado] = useState({
    ordenes: false,
    almacenes: false,
    devoluciones: false,
  });
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  const cargar = async () => {
    setCargando(true);
    try {
      /*
       * Cada lectura con su propia red: son módulos distintos y el 403 de uno
       * no puede dejar la pantalla en blanco sobre lo que el rol sí tiene.
       *
       * Y con `conPermiso`, no con `.catch(() => [])`. La diferencia no es de
       * estilo: un `.catch` que devuelve lista vacía SÍ evita que la pantalla
       * se caiga, pero convierte «no puedo leerlo» en «no hay», que es la
       * mentira más cara de las dos. Esta pantalla decía «No hay órdenes
       * recibidas: sólo se puede devolver lo que ya entró» y «Todavía no hay
       * devoluciones» a un rol que simplemente no podía leerlas, y las dos
       * frases suenan a buena noticia.
       */
      const [oc, alm, devs] = await Promise.all([
        conPermiso(api.get<any>('/compras/ordenes')),
        /*
          La lista CORTA de almacenes —id y nombre—, no el módulo entero.
          `/catalogo/almacenes` pertenece a «almacenes» —dirección,
          responsable y configuración de cada bodega— y el comprador no lo
          tiene: contestaba 403 y el desplegable del almacén de salida quedaba
          vacío, así que esta pantalla no se podía usar desde el rol que la
          necesita. Medido el 27-sep-2026 barriendo rol por rol.
        */
        conPermiso(api.get<any>('/catalogo/almacenes/para-venta')),
        conPermiso(api.get<Devolucion[]>('/compras/devoluciones')),
      ]);
      const lista = Array.isArray(oc.valor) ? oc.valor : (oc.valor?.data ?? []);
      setOrdenes(lista.filter((o: Orden) => o.estado === 'RECIBIDA' || o.estado === 'PAGADA'));
      setAlmacenes(
        Array.isArray(alm.valor) ? alm.valor : (alm.valor?.almacenes ?? []),
      );
      setDevoluciones(Array.isArray(devs.valor) ? devs.valor : []);
      setVedado({
        ordenes: oc.vedado,
        almacenes: alm.vedado,
        devoluciones: devs.vedado,
      });
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cargar.', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { void cargar(); }, []);

  useEffect(() => {
    setDevolvible(null);
    setCantidades({});
    if (!ordenId) return;
    api
      .get<Devolvible>('/compras/devoluciones/devolvible', { query: { ordenCompraId: ordenId } })
      .then((d) => {
        setDevolvible(d);
        /*
          La mercancía sale de donde entró. La orden sabe en qué almacén se
          recibió, así que si hay uno solo se elige solo y si hay varios se
          ofrecen únicamente ésos. Antes se ofrecían TODOS los almacenes de la
          empresa sin decir en cuál está la mercancía: elegir el equivocado
          llenaba el formulario entero para recibir, al final, «No existe
          resumen de stock para el producto y almacén».
        */
        const donde = d?.almacenesRecepcion ?? [];
        setAlmacenId(donde.length === 1 ? donde[0].id : '');
      })
      .catch((e) => avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo leer la orden.', 'error'));
  }, [ordenId]);

  const lineas = useMemo(
    () => (devolvible?.partidas ?? []).map((p) => {
      const cant = Number(cantidades[p.detalleOrdenId] ?? 0);
      const neto = Math.round(cant * p.costoUnitario * 100) / 100;
      return { ...p, cant, neto, iva: Math.round(neto * p.tasaIva * 100) / 100 };
    }),
    [devolvible, cantidades],
  );
  const subtotal = lineas.reduce((s, l) => s + l.neto, 0);
  const impuestos = lineas.reduce((s, l) => s + l.iva, 0);
  const hayCantidades = lineas.some((l) => l.cant > 0);
  const excedida = lineas.find((l) => l.cant > l.disponible + 0.0001);

  const registrar = async () => {
    if (!ordenId) return avisar('Elige la orden de compra que se devuelve.', 'alerta');
    if (!almacenId) return avisar('Elige el almacén del que sale la mercancía.', 'alerta');
    if (motivo.trim().length < 5) return avisar('Captura el motivo: mínimo cinco caracteres.', 'alerta');
    if (!hayCantidades) return avisar('Indica cuánto se devuelve de al menos una partida.', 'alerta');
    if (excedida) {
      return avisar(
        `${excedida.producto ?? 'Una partida'}: como mucho se pueden devolver ${excedida.disponible}.`,
        'alerta',
      );
    }
    setGuardando(true);
    try {
      const r = await api.post<any>('/compras/devoluciones', {
        ordenCompraId: ordenId,
        almacenId,
        fecha,
        motivo: motivo.trim(),
        notaCreditoProveedor: nota.trim() || undefined,
        partidas: lineas.filter((l) => l.cant > 0).map((l) => ({ detalleOrdenId: l.detalleOrdenId, cantidad: l.cant })),
      });
      avisar(
        r.estadoContable === 'GENERADO'
          ? `Devolución ${r.folio} registrada y contabilizada.`
          : `Devolución ${r.folio} registrada. La póliza quedó pendiente: ${r.mensajeContable ?? 'revisa asientos pendientes'}.`,
        r.estadoContable === 'GENERADO' ? 'exito' : 'alerta',
      );
      setOrdenId(''); setMotivo(''); setNota(''); setCantidades({});
      await cargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo registrar la devolución.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3"><Undo2 />Devoluciones a proveedor</h1>
          <p className="text-slate-500">
            La mercancía sale del almacén y baja lo que se le debe al proveedor. No es un ajuste de inventario:
            un ajuste es una merma nuestra; esto cambia la cuenta por pagar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/compras/ordenes" className="px-4 py-2 rounded-xl border font-semibold">Órdenes de compra</Link>
          <button aria-label="Volver a cargar" title="Volver a cargar" onClick={() => void cargar()} className="p-2 border rounded-xl"><RefreshCw className={cargando ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="bg-white border rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="grid md:grid-cols-4 gap-4">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-bold">Orden de compra *</span>
            <select value={ordenId} onChange={(e) => setOrdenId(e.target.value)} className="w-full p-3 border rounded-xl">
              <option value="">Elige la orden recibida…</option>
              {ordenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {folioDe(o, FOLIO.ORDEN_COMPRA)} · {o.proveedor?.nombre ?? 'Proveedor'} · {dinero(Number(o.total))} · {o.estado}
                </option>
              ))}
            </select>
            {ordenes.length === 0 && !cargando && (
              <p className="text-xs text-slate-500">
                {vedado.ordenes
                  ? 'Las órdenes de compra no están en tu perfil, así que aquí no hay de dónde elegir. No significa que no haya.'
                  : 'No hay órdenes recibidas: sólo se puede devolver lo que ya entró.'}
              </p>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-sm font-bold">Almacén de salida *</span>
            <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className="w-full p-3 border rounded-xl">
              <option value="">Elige…</option>
              {(devolvible?.almacenesRecepcion?.length
                ? devolvible.almacenesRecepcion
                : almacenes
              ).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            {vedado.almacenes && !devolvible?.almacenesRecepcion?.length && (
              <span className="text-xs text-amber-700">
                El catálogo de almacenes no está en tu perfil, así que el
                desplegable sale vacío. No es que no haya almacenes: es que no
                se pueden leer desde este rol.
              </span>
            )}
            {devolvible && !devolvible.almacenesRecepcion?.length && (
              <span className="text-xs text-amber-700">
                Esta orden no tiene recepción registrada, así que no se sabe en
                qué almacén entró la mercancía. Elige con cuidado: si ahí no hay
                existencia, la devolución se va a rechazar.
              </span>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-sm font-bold">Fecha *</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full p-3 border rounded-xl" />
          </label>
          <label className="space-y-1 md:col-span-3">
            <span className="text-sm font-bold">Motivo *</span>
            <input
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Mercancía dañada en tránsito, modelo equivocado, caducidad corta…"
              className="w-full p-3 border rounded-xl"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-bold">Nota de crédito del proveedor</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Folio, si ya la emitió" className="w-full p-3 border rounded-xl" />
          </label>
        </div>

        {devolvible && (
          <div className="border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest flex justify-between">
              <span>{devolvible.folio} · {devolvible.proveedor ?? 'Proveedor'}</span>
              <span className="text-slate-400">
                {devolvible.estadoPago === 'PAGADA'
                  ? 'Orden pagada: el IVA se devuelve de acreditable pagado'
                  : 'Orden por pagar: el IVA se devuelve de pendiente de pago'}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Producto</th>
                  <th className="text-center">Recibido</th>
                  <th className="text-center">Ya devuelto</th>
                  <th className="text-center">Se puede devolver</th>
                  <th className="text-right">Costo</th>
                  <th className="text-center w-36">Devolver</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.detalleOrdenId} className="border-t">
                    <td className="p-3">
                      <span className="font-semibold">{l.producto ?? l.productoId}</span>
                      {l.sku && <span className="ml-2 text-xs font-mono text-slate-500">{l.sku}</span>}
                    </td>
                    <td className="text-center">{l.recibido}</td>
                    <td className="text-center text-slate-500">{l.devuelto}</td>
                    <td className="text-center font-bold">{l.disponible}</td>
                    <td className="text-right font-mono">{dinero(l.costoUnitario)}</td>
                    <td className="text-center">
                      <input
                        type="number" min="0" max={l.disponible} step="0.0001"
                        disabled={l.disponible <= 0}
                        value={cantidades[l.detalleOrdenId] ?? ''}
                        onChange={(e) => setCantidades((p) => ({ ...p, [l.detalleOrdenId]: e.target.value }))}
                        placeholder={l.disponible <= 0 ? 'Nada pendiente' : '0'}
                        className={`w-28 p-2 border rounded-lg text-right ${l.cant > l.disponible + 0.0001 ? 'border-rose-400 bg-rose-50' : ''}`}
                      />
                    </td>
                    <td className="text-right font-mono">{l.cant > 0 ? dinero(l.neto + l.iva) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hayCantidades && (
              <div className="p-4 bg-slate-50 border-t flex flex-wrap justify-end gap-6 text-sm">
                <span>Subtotal <b className="font-mono">{dinero(subtotal)}</b></span>
                <span>IVA <b className="font-mono">{dinero(impuestos)}</b></span>
                <span>Total a cargo del proveedor <b className="font-mono">{dinero(subtotal + impuestos)}</b></span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => void registrar()}
          disabled={guardando || !devolvible}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <PackageMinus className="w-4 h-4" />
          {guardando ? 'Registrando…' : 'Registrar devolución'}
        </button>
      </div>

      <div className="bg-white border rounded-3xl overflow-hidden">
        <div className="p-5 border-b font-black">Devoluciones registradas</div>
        {devoluciones.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {vedado.devoluciones
              ? 'No puedes leer el registro de devoluciones con tu perfil. Esto no quiere decir que no haya ninguna.'
              : 'Todavía no hay devoluciones. Aquí quedará el rastro de cada mercancía que se le regresó a un proveedor.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Folio</th>
                  <th className="p-3 text-left">Fecha</th>
                  <th className="p-3 text-left">Almacén</th>
                  <th className="p-3 text-left">Motivo</th>
                  <th className="p-3 text-left">Nota de crédito</th>
                  <th className="text-right p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {devoluciones.map((d) => (
                  <tr key={d.id} className="border-t align-top">
                    <td className="p-3 font-mono font-bold text-indigo-600">{d.folio}</td>
                    <td className="p-3">{fechaNumerica(d.fecha)}</td>
                    <td className="p-3">{d.almacen?.nombre ?? ''}</td>
                    <td className="p-3">
                      {d.motivo}
                      {d.detalles?.length ? (
                        <p className="text-xs text-slate-500 mt-1">
                          {d.detalles.map((x) => `${x.producto?.nombre ?? ''} ×${Number(x.cantidad)}`).join(' · ')}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-slate-500">{d.notaCreditoProveedor ?? '—'}</td>
                    <td className="p-3 text-right font-mono">{dinero(Number(d.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
