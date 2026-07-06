"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, XCircle, Eye, Clock, Package, User,
  Calendar, MessageSquare, AlertTriangle, RefreshCw,
  Flag, ChevronDown, ChevronUp, Bell, Inbox
} from 'lucide-react';
import { ProtectedElement } from '@/app/components/ProtectedElement';

interface IProducto { nombre: string; sku?: string; }
interface IDetalle { productoId: string; cantidadSolicitada: number; producto?: IProducto; }
interface IRequisicion {
  id: string; fechaSolicitud: string; estado: string; notas?: string; prioridad?: string;
  usuarioSolicitante?: { nombreCompleto?: string; nombre?: string };
  detalles?: IDetalle[];
}
interface IAprobacion {
  id: string; orden: number; estado: string;
  requisicion: IRequisicion;
  usuario?: { nombreCompleto?: string };
}

const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  URGENTE: { label: 'URGENTE', cls: 'bg-red-100 text-red-700 border-red-300',     dot: 'bg-red-500' },
  ALTA:    { label: 'Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
  NORMAL:  { label: 'Normal',  cls: 'bg-slate-100 text-slate-500 border-slate-200',    dot: 'bg-slate-400' },
  BAJA:    { label: 'Baja',    cls: 'bg-green-100 text-green-700 border-green-200',    dot: 'bg-green-400' },
};

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AprobacionesPage() {
  const [aprobaciones, setAprobaciones] = useState<IAprobacion[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [comentarios, setComentarios]   = useState<Record<string, string>>({});
  const [expandidos, setExpandidos]     = useState<Record<string, boolean>>({});
  const [procesando, setProcesando]     = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });
  const toast$ = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch(`${api}/compras/requisiciones/aprobaciones/pendientes`, { headers: h() });
    if (r.ok) setAprobaciones(await r.json());
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const resolver = async (id: string, estado: 'APROBADO' | 'RECHAZADO') => {
    if (estado === 'RECHAZADO' && !comentarios[id]?.trim()) {
      toast$('Escribe un motivo de rechazo', false); return;
    }
    setProcesando(id);
    const r = await fetch(`${api}/compras/requisiciones/aprobaciones/${id}`, {
      method: 'PATCH', headers: { ...h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, comentario: comentarios[id] ?? '' }),
    });
    setProcesando(null);
    if (r.ok) {
      toast$(estado === 'APROBADO' ? '✓ Requisición aprobada' : '✗ Requisición rechazada', estado === 'APROBADO');
      setAprobaciones(prev => prev.filter(a => a.id !== id));
    } else toast$('Error al procesar', false);
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Compras</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Bell className="w-8 h-8 text-indigo-500"/>
            Aprobaciones Pendientes
            {aprobaciones.length > 0 && (
              <span className="text-sm font-bold bg-rose-500 text-white px-2.5 py-1 rounded-full">
                {aprobaciones.length}
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Revisa y autoriza las requisiciones de compra de tu equipo.</p>
        </div>
        <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
          <RefreshCw className="w-4 h-4"/>
        </button>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando aprobaciones...</p>
        </div>
      ) : aprobaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <Inbox className="w-16 h-16 text-slate-200 mx-auto mb-4"/>
          <p className="font-bold text-xl text-slate-700">Todo al día</p>
          <p className="text-slate-400 text-sm mt-1">No tienes requisiciones pendientes de aprobar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {aprobaciones
            .sort((a, b) => {
              const orden = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAJA: 3 };
              const pA = orden[(a.requisicion.prioridad ?? 'NORMAL') as keyof typeof orden] ?? 2;
              const pB = orden[(b.requisicion.prioridad ?? 'NORMAL') as keyof typeof orden] ?? 2;
              return pA - pB;
            })
            .map(ap => {
              const req = ap.requisicion;
              const prioridadCfg = PRIORIDAD_CONFIG[req.prioridad ?? 'NORMAL'];
              const isExpanded = expandidos[ap.id];
              const isProcessing = procesando === ap.id;

              return (
                <div key={ap.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${
                  req.prioridad === 'URGENTE' ? 'border-red-300' : 'border-slate-200'
                }`}>
                  {/* Banda de prioridad */}
                  {req.prioridad === 'URGENTE' && (
                    <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest text-center py-1 flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3 h-3"/> Requiere atención urgente
                    </div>
                  )}

                  <div className="p-5">
                    {/* Header de la card */}
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono font-black text-indigo-600">
                            REQ-{req.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prioridadCfg.cls}`}>
                            {prioridadCfg.label}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3"/> {fmtFecha(req.fechaSolicitud)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <User className="w-4 h-4 text-slate-400"/>
                            <span className="font-medium">{req.usuarioSolicitante?.nombreCompleto ?? '—'}</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Package className="w-4 h-4 text-slate-400"/>
                            <span className="font-medium">{req.detalles?.length ?? 0} producto(s)</span>
                          </span>
                        </div>

                        {req.notas && (
                          <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            "{req.notas}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                          <Link href={`/dashboard/compras/requisiciones/${req.id}`}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Ver detalle">
                            <Eye className="w-4 h-4"/>
                          </Link>
                        </ProtectedElement>
                        <button onClick={() => setExpandidos(prev => ({ ...prev, [ap.id]: !isExpanded }))}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                      </div>
                    </div>

                    {/* Productos expandidos */}
                    {isExpanded && req.detalles && req.detalles.length > 0 && (
                      <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                          <p className="text-xs font-bold uppercase text-slate-500">Detalle de productos</p>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-2 text-left font-bold text-slate-500">Producto</th>
                              <th className="px-4 py-2 text-center font-bold text-slate-500">Cantidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {req.detalles.map((d, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-slate-800">{d.producto?.nombre ?? d.productoId}</p>
                                  {d.producto?.sku && <p className="text-[9px] font-mono text-slate-400">{d.producto.sku}</p>}
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-slate-700">{d.cantidadSolicitada}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Zona de decisión */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
                          <input type="text"
                            value={comentarios[ap.id] ?? ''}
                            onChange={e => setComentarios(prev => ({ ...prev, [ap.id]: e.target.value }))}
                            placeholder="Comentario (obligatorio si rechazas)..."
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                        </div>
                        <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/aprobaciones/:id">
                          <div className="flex gap-2">
                            <button onClick={() => resolver(ap.id, 'APROBADO')} disabled={isProcessing}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                              {isProcessing
                                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                : <CheckCircle2 className="w-4 h-4"/>}
                              Aprobar
                            </button>
                            <button onClick={() => resolver(ap.id, 'RECHAZADO')} disabled={isProcessing}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm">
                              <XCircle className="w-4 h-4"/> Rechazar
                            </button>
                          </div>
                        </ProtectedElement>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
