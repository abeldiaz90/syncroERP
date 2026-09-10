"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { confirmarElegante } from '@/components/ui/dialogos';
import Link from 'next/link';
import {
  Plus, Edit2, X, AlertCircle, CheckCircle2, ClipboardList,
  Search, Trash2, Send, Eye, FileText, ShoppingCart, Info,
  Clock, XCircle, ChevronDown, Filter, RefreshCw,
  Calendar, Flag, Package
} from 'lucide-react';
import { PuedeCrear, ProtectedElement } from '@/app/components/ProtectedElement';

interface IProducto { id: string; nombre: string; sku: string; }
interface IDetalle { productoId: string; nombre: string; cantidadSolicitada: number; notas?: string; }
interface IRequisicion {
  id: string; fechaSolicitud: string; estado: string; prioridad?: string;
  notas?: string;
  usuarioSolicitante?: { nombre?: string; nombreCompleto?: string };
  detalles?: any[];
}

const ESTADO_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  PENDIENTE:      { label: 'Pendiente',       cls: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  COTIZANDO:      { label: 'En cotización',   cls: 'bg-blue-50 text-blue-700 border-blue-200',       icon: ShoppingCart },
  ORDEN_GENERADA: { label: 'OC Generada',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: FileText },
  RECIBIDA:       { label: 'Recibida',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  RECHAZADA:      { label: 'Rechazada',       cls: 'bg-rose-50 text-rose-700 border-rose-200',       icon: XCircle },
  CANCELADA:      { label: 'Cancelada',       cls: 'bg-slate-100 text-slate-500 border-slate-200',   icon: X },
};

const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string }> = {
  URGENTE: { label: 'Urgente', cls: 'bg-red-100 text-red-700 border-red-200' },
  ALTA:    { label: 'Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  NORMAL:  { label: 'Normal',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  BAJA:    { label: 'Baja',    cls: 'bg-green-100 text-green-700 border-green-200' },
};

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

export default function RequisicionesPage() {
  const [requisiciones, setRequisiciones] = useState<IRequisicion[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  // Form nueva requisición
  const [detalles, setDetalles]   = useState<IDetalle[]>([]);
  const [notas, setNotas]         = useState('');
  const [prioridad, setPrioridad] = useState('NORMAL');
  const [fechaRequerida, setFechaRequerida] = useState('');
  const [busqueda, setBusqueda]   = useState('');
  const [sugerencias, setSugerencias] = useState<IProducto[]>([]);
  const [prodSeleccionado, setProdSeleccionado] = useState<IProducto | null>(null);
  const [cantidad, setCantidad]   = useState(1);
  const [editIdx, setEditIdx]     = useState<number | null>(null);
  const [editCant, setEditCant]   = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });
  const toast$ = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await fetch(`${api}/compras/requisiciones`, { headers: h() });
    if (res.ok) setRequisiciones(await res.json());
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Buscador de productos
  useEffect(() => {
    if (busqueda.length < 2) { setSugerencias([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/catalogo/productos/buscar?q=${encodeURIComponent(busqueda)}`, { headers: h() });
      if (r.ok) setSugerencias(await r.json());
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const agregarDetalle = () => {
    if (!prodSeleccionado || cantidad <= 0) return;
    const idx = detalles.findIndex(d => d.productoId === prodSeleccionado.id);
    if (idx >= 0) {
      setDetalles(prev => prev.map((d, i) => i === idx ? { ...d, cantidadSolicitada: cantidad } : d));
      toast$('Cantidad actualizada');
    } else {
      setDetalles(prev => [...prev, { productoId: prodSeleccionado.id, nombre: prodSeleccionado.nombre, cantidadSolicitada: cantidad }]);
    }
    setProdSeleccionado(null); setBusqueda(''); setCantidad(1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detalles.length) { toast$('Agrega al menos un producto', false); return; }
    setGuardando(true);
    const res = await fetch(`${api}/compras/requisiciones`, {
      method: 'POST', headers: { ...h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notas, prioridad, fechaRequerida: fechaRequerida || null,
        detalles: detalles.map(d => ({ productoId: d.productoId, cantidadSolicitada: d.cantidadSolicitada })),
      }),
    });
    setGuardando(false);
    if (res.ok) {
      setModalOpen(false); setDetalles([]); setNotas(''); setPrioridad('NORMAL'); setFechaRequerida('');
      cargar(); toast$('Requisición creada');
    } else {
      const e = await res.json().catch(() => ({}));
      toast$(e.message ?? 'Error al guardar', false);
    }
  };

  const cancelarReq = async (id: string) => {
    if (!await confirmarElegante('¿Cancelar esta requisición?', { peligroso: true })) return;
    const res = await fetch(`${api}/compras/requisiciones/${id}/cancelar`, { method: 'PATCH', headers: h() });
    if (res.ok) { cargar(); toast$('Requisición cancelada'); }
    else toast$('Error al cancelar', false);
  };

  const filtradas = filtroEstado ? requisiciones.filter(r => r.estado === filtroEstado) : requisiciones;

  const stats = {
    total:     requisiciones.length,
    pendiente: requisiciones.filter(r => r.estado === 'PENDIENTE').length,
    cotizando: requisiciones.filter(r => r.estado === 'COTIZANDO').length,
    recibida:  requisiciones.filter(r => r.estado === 'RECIBIDA').length,
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Compras</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-indigo-500"/> Requisiciones
          </h1>
          <p className="text-slate-500 text-sm mt-1">Solicita materiales y supervisa el estado de tus pedidos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4"/>
          </button>
          <PuedeCrear ruta="/api/compras/requisiciones">
            <button onClick={() => { setDetalles([]); setNotas(''); setPrioridad('NORMAL'); setFechaRequerida(''); setModalOpen(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-md">
              <Plus className="w-4 h-4"/> Nueva Requisición
            </button>
          </PuedeCrear>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',      val: stats.total,     color: 'slate',   filter: '' },
          { label: 'Pendientes', val: stats.pendiente, color: 'amber',   filter: 'PENDIENTE' },
          { label: 'Cotizando',  val: stats.cotizando, color: 'blue',    filter: 'COTIZANDO' },
          { label: 'Recibidas',  val: stats.recibida,  color: 'emerald', filter: 'RECIBIDA' },
        ].map(k => (
          <button key={k.label} onClick={() => setFiltroEstado(filtroEstado === k.filter ? '' : k.filter)}
            className={`bg-white rounded-2xl border-2 p-4 text-left transition-all shadow-sm hover:shadow-md ${filtroEstado === k.filter ? `border-${k.color}-400` : 'border-slate-200'}`}>
            <p className="text-xs font-bold uppercase text-slate-400 mb-1">{k.label}</p>
            <p className={`text-3xl font-black text-${k.color}-600`}>{k.val}</p>
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Registro de Requisiciones</p>
          <p className="text-xs text-slate-400">{filtradas.length} registros</p>
        </div>

        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">Cargando...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="p-16 text-center">
            <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3"/>
            <p className="font-semibold text-slate-600">Sin requisiciones</p>
            <p className="text-sm text-slate-400 mt-1">
              {filtroEstado ? `No hay requisiciones en estado "${filtroEstado}"` : 'Crea tu primera requisición'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="px-5 py-3 text-left">Folio / Fecha</th>
                  <th className="px-5 py-3 text-left">Solicitante</th>
                  <th className="px-5 py-3 text-center">Prioridad</th>
                  <th className="px-5 py-3 text-center">Productos</th>
                  <th className="px-5 py-3 text-center">Fecha Requerida</th>
                  <th className="px-5 py-3 text-center">Estado</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map(req => {
                  const cfg = ESTADO_CONFIG[req.estado] ?? ESTADO_CONFIG.PENDIENTE;
                  const CfgIcon = cfg.icon;
                  const prioridadCfg = PRIORIDAD_CONFIG[req.prioridad ?? 'NORMAL'];
                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-mono font-bold text-indigo-600">REQ-{req.id.slice(0,6).toUpperCase()}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtFecha(req.fechaSolicitud)}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-700 font-medium">
                        {req.usuarioSolicitante?.nombreCompleto ?? req.usuarioSolicitante?.nombre ?? '—'}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prioridadCfg.cls}`}>
                          {prioridadCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                          <Package className="w-3 h-3"/> {req.detalles?.length ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-xs text-slate-500">
                        {(req as any).fechaRequerida ? fmtFecha((req as any).fechaRequerida) : '—'}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                          <CfgIcon className="w-3 h-3"/> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                            <Link href={`/dashboard/compras/requisiciones/${req.id}`}
                              className="p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors" title="Ver detalle">
                              <Eye className="w-4 h-4"/>
                            </Link>
                          </ProtectedElement>
                          {req.estado === 'PENDIENTE' && (
                            <>
                              <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/:id/estado">
                                <button onClick={async () => {
                                  if (!await confirmarElegante('¿Enviar a cotizar?')) return;
                                  const r = await fetch(`${api}/compras/requisiciones/${req.id}/estado`, {
                                    method:'PATCH', headers:{...h(),'Content-Type':'application/json'},
                                    body: JSON.stringify({ estado: 'COTIZANDO' }),
                                  });
                                  if (r.ok) { cargar(); toast$('Enviada a cotización'); }
                                }}
                                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Enviar a cotizar">
                                  <Send className="w-4 h-4"/>
                                </button>
                              </ProtectedElement>
                              <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/:id/cancelar">
                                <button onClick={() => cancelarReq(req.id)}
                                  className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors" title="Cancelar">
                                  <XCircle className="w-4 h-4"/>
                                </button>
                              </ProtectedElement>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nueva requisición */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border-t-4 border-indigo-500">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-500"/> Nueva Requisición de Compra
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Prioridad + Fecha requerida */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    <Flag className="w-3 h-3 inline mr-1"/> Prioridad
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Object.entries(PRIORIDAD_CONFIG).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => setPrioridad(k)}
                        className={`py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${prioridad === k ? v.cls : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    <Calendar className="w-3 h-3 inline mr-1"/> Fecha requerida
                  </label>
                  <input type="date" value={fechaRequerida} onChange={e => setFechaRequerida(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>

              {/* Buscador de productos */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                  <Search className="w-3 h-3 inline mr-1"/> Agregar productos
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                  <input ref={inputRef} type="text" value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setProdSeleccionado(null); }}
                    placeholder="Busca por nombre o SKU..."
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  {sugerencias.length > 0 && busqueda.length >= 2 && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-auto">
                      {sugerencias.map(p => (
                        <li key={p.id} onMouseDown={() => { setProdSeleccionado(p); setBusqueda(p.nombre); setSugerencias([]); }}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                          <span className="font-medium text-slate-800 text-sm">{p.nombre}</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{p.sku}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {prodSeleccionado && (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm font-medium text-slate-700 truncate">
                      {prodSeleccionado.nombre}
                    </div>
                    <input type="number" min="1" value={cantidad} onChange={e => setCantidad(Number(e.target.value))}
                      className="w-20 px-2 py-2 bg-white border border-indigo-200 rounded-xl text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                    <button type="button" onClick={agregarDetalle}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                      {detalles.some(d => d.productoId === prodSeleccionado.id) ? 'Actualizar' : 'Agregar'}
                    </button>
                  </div>
                )}
              </div>

              {/* Lista de productos agregados */}
              {detalles.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Partidas ({detalles.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {detalles.map((d, idx) => (
                      <li key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800 text-sm">{d.nombre}</p>
                        </div>
                        {editIdx === idx ? (
                          <div className="flex items-center gap-2">
                            <input type="number" min="1" value={editCant} onChange={e => setEditCant(Number(e.target.value))}
                              className="w-16 px-2 py-1 border border-indigo-300 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" autoFocus/>
                            <button onClick={() => { setDetalles(prev => prev.map((d,i)=>i===idx?{...d,cantidadSolicitada:editCant}:d)); setEditIdx(null); }}
                              className="text-emerald-600 hover:text-emerald-700 p-1"><CheckCircle2 className="w-4 h-4"/></button>
                            <button onClick={() => setEditIdx(null)} className="text-slate-400 p-1"><X className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">×{d.cantidadSolicitada}</span>
                            <button onClick={() => { setEditIdx(idx); setEditCant(d.cantidadSolicitada); }}
                              className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit2 className="w-3.5 h-3.5"/></button>
                            <button onClick={() => setDetalles(prev => prev.filter((_,i)=>i!==idx))}
                              className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Justificación / Notas</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                  placeholder="Motivo de la compra, especificaciones adicionales..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>

              <div className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-xs">
                <Info className="w-4 h-4 mt-0.5 shrink-0"/>
                Los aprobadores se asignan automáticamente según tu departamento.
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !detalles.length}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Plus className="w-4 h-4"/>}
                {guardando ? 'Guardando...' : 'Crear Requisición'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
