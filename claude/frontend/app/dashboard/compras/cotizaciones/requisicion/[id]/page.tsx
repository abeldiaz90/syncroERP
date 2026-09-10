"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, CheckCircle2, Building2, DollarSign, Eye,
  Receipt, AlertCircle, Loader2, Calendar, FileText,
  CheckCircle, Package, TrendingDown, Award
} from 'lucide-react';
import { PuedeCrear, ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO
import { confirmarElegante, solicitarTexto } from '@/components/ui/dialogos';

export interface ICotizacion {
  id: string; fechaCotizacion: string;
  proveedor?: { nombre: string }; notas: string;
  estado: 'PENDIENTE' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'SELECCIONADA' | 'RECHAZADA' | string;
  motivoSeleccion?: string; comentarioAprobacion?: string; ordenesCompra?: any[];
  subtotal: number; impuestoTotal: number; total: number; detalles: any[];
}

export interface IRequisicion {
  id: string; fechaSolicitud: string;
  usuarioSolicitante?: { nombreCompleto?: string; nombre?: string };
  detalles: any[];
}

export default function CotizacionesRequisicionPage() {
  const params = useParams();
  const id = params?.id;
  const requisicionId = Array.isArray(id) ? id[0] : id;

  const [cotizaciones, setCotizaciones] = useState<ICotizacion[]>([]);
  const [requisicion, setRequisicion] = useState<IRequisicion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!requisicionId) return;
    const fetchData = async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        const [reqRes, cotRes] = await Promise.all([
          fetch(`${apiUrl}/compras/requisiciones/${requisicionId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/compras/cotizaciones/requisicion/${requisicionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (reqRes.ok) setRequisicion(await reqRes.json());
        if (cotRes.ok) { const payload = await cotRes.json(); setCotizaciones(Array.isArray(payload) ? payload : (payload?.data ?? [])); }
      } catch (error) { console.error(error); }
      finally { setCargando(false); }
    };
    fetchData();
  }, [requisicionId, apiUrl]);

  const recargarCotizaciones = async (token: string | null) => {
    const updated = await fetch(`${apiUrl}/compras/cotizaciones/requisicion/${requisicionId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (updated.ok) {
      const payload = await updated.json();
      setCotizaciones(Array.isArray(payload) ? payload : (payload?.data ?? []));
    }
  };

  const ejecutarDecision = async (cot: ICotizacion, accion: 'solicitar-aprobacion' | 'aprobar' | 'rechazar', titulo: string, label: string) => {
    const comentario = await solicitarTexto(label, { titulo, obligatorio: accion === 'solicitar-aprobacion' || accion === 'rechazar' });
    if (comentario === null || ((accion === 'solicitar-aprobacion' || accion === 'rechazar') && !comentario.trim())) return;
    setProcesandoId(cot.id);
    const token = localStorage.getItem('syncro_token');
    try {
      const body = accion === 'solicitar-aprobacion' ? { motivoSeleccion: comentario } : { comentario };
      const res = await fetch(`${apiUrl}/compras/cotizaciones/${cot.id}/${accion}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : (data?.message || 'No fue posible completar la acción'));
      mostrarToast(accion === 'solicitar-aprobacion' ? 'Adjudicación enviada a aprobación' : accion === 'aprobar' ? 'Adjudicación aprobada' : 'Adjudicación rechazada', 'exito');
      await recargarCotizaciones(token);
    } catch (e: any) { mostrarToast(e?.message || 'Error de conexión', 'error'); }
    finally { setProcesandoId(null); }
  };

  const handleGenerarOrden = async (cot: ICotizacion) => {
    if (!await confirmarElegante(`Elegirás a ${cot.proveedor?.nombre} por $${cot.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. Esta acción es definitiva.`, { titulo: 'Generar orden de compra' })) return;

    setProcesandoId(cot.id);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/ordenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cotizacionId: cot.id }),
      });
      if (res.ok) {
        mostrarToast('La orden de compra se creó correctamente.', 'exito');
        await recargarCotizaciones(token);
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${data?.message || 'No se pudo generar la Orden de Compra'}`, 'error');
      }
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setProcesandoId(null); }
  };

  // La cotización de menor precio para resaltarla
  const menorPrecio = cotizaciones.length > 0
    ? Math.min(...cotizaciones.map(c => c.total))
    : null;

  if (!requisicionId) {
    return (
      <div className="p-12 text-center text-rose-500 bg-rose-50 m-8 rounded-2xl border border-rose-100 max-w-2xl mx-auto">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-rose-400" />
        <p className="text-xl font-bold">No se encontró la requisición</p>
        <Link href="/dashboard/compras/cotizaciones" className="text-indigo-600 font-medium hover:underline mt-4 inline-block">&larr; Volver</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-2xl shadow-2xl font-semibold text-white animate-in slide-in-from-top-2 duration-300 ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      {/* Navegación */}
      <div className="mb-6">
        <Link href="/dashboard/compras/cotizaciones" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 rounded-xl font-medium transition-colors shadow-sm">
          <ChevronLeft className="w-4 h-4" /> Volver a Requisiciones
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 mb-8">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-indigo-100 rounded-2xl">
                <Receipt className="w-7 h-7 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Propuestas Recibidas</h1>
                <p className="text-slate-500 font-medium mt-0.5">
                  Referencia: <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-lg">REQ-{requisicionId.substring(0,8).toUpperCase()}</span>
                </p>
              </div>
            </div>
          </div>

          {requisicion && (
            <div className="flex flex-wrap gap-4">
              {[
                { label: 'Solicitante', value: requisicion.usuarioSolicitante?.nombreCompleto || 'N/A', icon: null },
                { label: 'Fecha Emisión', value: new Date(requisicion.fechaSolicitud).toLocaleDateString('es-MX'), icon: <Calendar className="w-3.5 h-3.5" /> },
                { label: 'Partidas', value: `${requisicion.detalles?.length || 0} productos`, icon: <Package className="w-3.5 h-3.5" /> },
                { label: 'Propuestas', value: `${cotizaciones.length} recibidas`, icon: <Receipt className="w-3.5 h-3.5" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">{icon}{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista de cotizaciones */}
      {cargando ? (
        <div className="p-20 text-center flex flex-col items-center text-slate-400 bg-white rounded-3xl border border-slate-200">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <p className="font-medium">Cargando propuestas comerciales...</p>
        </div>
      ) : cotizaciones.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
            <FileText className="w-10 h-10 text-slate-300" />
          </div>
          <p className="text-xl font-bold text-slate-700">Aún no hay cotizaciones capturadas</p>
          <p className="mt-2 text-slate-500 text-sm">Regresa a la pantalla anterior para registrar la primera propuesta.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {cotizaciones.map((cot, idx) => {
            const isSeleccionada = cot.estado === 'SELECCIONADA';
            const esMenorPrecio = menorPrecio !== null && cot.total === menorPrecio && !isSeleccionada;

            return (
              <div key={cot.id} className={`bg-white rounded-3xl overflow-hidden transition-all duration-300 ${
                isSeleccionada
                  ? 'border-2 border-emerald-500 shadow-xl shadow-emerald-100'
                  : esMenorPrecio
                  ? 'border-2 border-indigo-300 shadow-lg shadow-indigo-100'
                  : 'border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
              }`}>

                {/* Badge superior */}
                {(isSeleccionada || esMenorPrecio) && (
                  <div className={`px-6 py-2.5 flex items-center gap-2 text-sm font-black ${isSeleccionada ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {isSeleccionada
                      ? <><Award className="w-4 h-4" /> PROVEEDOR SELECCIONADO — ORDEN DE COMPRA GENERADA</>
                      : <><TrendingDown className="w-4 h-4" /> OFERTA MÁS COMPETITIVA</>
                    }
                  </div>
                )}

                {/* Header de la propuesta */}
                <div className={`p-6 md:p-8 flex flex-col md:flex-row justify-between items-start gap-6 ${isSeleccionada ? 'bg-emerald-50/40' : esMenorPrecio ? 'bg-indigo-50/30' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl ${isSeleccionada ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {(cot.proveedor?.nombre || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">{cot.proveedor?.nombre || 'Proveedor no especificado'}</h3>
                      <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Recibida el {new Date(cot.fechaCotizacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {cot.notas && (
                        <p className="text-sm text-slate-600 mt-3 italic bg-white px-4 py-2.5 rounded-xl border border-slate-200 max-w-lg">
                          "{cot.notas}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Resumen financiero */}
                  <div className={`text-right flex-shrink-0 p-5 rounded-2xl ${isSeleccionada ? 'bg-emerald-100/60' : 'bg-slate-50 border border-slate-100'}`}>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Total Ofertado</p>
                    <p className={`text-4xl font-black tracking-tighter ${isSeleccionada ? 'text-emerald-700' : 'text-slate-900'}`}>
                      ${cot.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                    <div className="flex justify-end gap-4 text-xs font-medium text-slate-400 mt-2">
                      <span>Subtotal: ${cot.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      <span>IVA: ${cot.impuestoTotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Tabla de partidas */}
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider">Producto</th>
                        <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-center w-24">Cant.</th>
                        <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-right w-40">Precio Unit.</th>
                        <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-right w-40">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cot.detalles?.map((det: any) => (
                        <tr key={det.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800">{det.producto?.nombre || det.productoId}</td>
                          <td className="px-6 py-4 text-center font-bold text-slate-500">{det.cantidad}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-600">${det.precioUnitario?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-right font-black text-slate-900">${det.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer acciones */}
                <div className={`px-6 md:px-8 py-5 border-t flex justify-between items-center gap-4 ${isSeleccionada ? 'bg-emerald-50/40 border-emerald-100' : 'bg-slate-50/50 border-slate-100'}`}>
                  <Link
                    href={`/dashboard/compras/cotizaciones/${cot.id}/pdf`}
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 hover:text-indigo-600 rounded-xl font-semibold transition-all shadow-sm text-sm"
                  >
                    <Eye className="w-4 h-4" /> Ver Propuesta PDF
                  </Link>

                  {isSeleccionada || (cot.ordenesCompra?.length ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-sm border border-emerald-200">
                      <CheckCircle className="w-4 h-4" /> Orden de Compra Generada
                    </span>
                  ) : cot.estado === 'PENDIENTE' ? (
                    <ProtectedElement metodo="PATCH" ruta="/api/compras/cotizaciones/:id/solicitar-aprobacion">
                      <button onClick={() => ejecutarDecision(cot, 'solicitar-aprobacion', 'Solicitar aprobación de adjudicación', '¿Por qué debe elegirse esta propuesta?')} disabled={procesandoId === cot.id}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-bold shadow-lg text-sm">
                        <Award className="w-4 h-4" /> Enviar a aprobación
                      </button>
                    </ProtectedElement>
                  ) : cot.estado === 'PENDIENTE_APROBACION' ? (
                    <div className="flex gap-2">
                      <ProtectedElement metodo="PATCH" ruta="/api/compras/cotizaciones/:id/rechazar">
                        <button onClick={() => ejecutarDecision(cot, 'rechazar', 'Rechazar adjudicación', 'Comentario de rechazo')} disabled={procesandoId === cot.id}
                          className="px-5 py-2.5 bg-rose-100 text-rose-700 rounded-xl font-bold text-sm">Rechazar</button>
                      </ProtectedElement>
                      <ProtectedElement metodo="PATCH" ruta="/api/compras/cotizaciones/:id/aprobar">
                        <button onClick={() => ejecutarDecision(cot, 'aprobar', 'Aprobar adjudicación', 'Comentario de aprobación')} disabled={procesandoId === cot.id}
                          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm">Aprobar</button>
                      </ProtectedElement>
                    </div>
                  ) : cot.estado === 'APROBADA' ? (
                    <PuedeCrear ruta="/api/compras/ordenes">
                      <button onClick={() => handleGenerarOrden(cot)} disabled={procesandoId === cot.id}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all font-bold shadow-lg shadow-emerald-200 active:scale-95 text-sm">
                        {procesandoId === cot.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando OC...</> : <><DollarSign className="w-4 h-4" /> Generar Orden de Compra</>}
                      </button>
                    </PuedeCrear>
                  ) : (
                    <span className="px-4 py-2 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm">{cot.estado}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
