"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { 
  Calendar, User, FileText, CheckCircle2, ChevronLeft, Clock, ShieldCheck,
  ThumbsUp, ThumbsDown, MessageSquare, Receipt, ShoppingCart, 
  PackageSearch, FileBox, AlertCircle, Loader2, Search 
} from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IDetalle { 
  id: string; 
  cantidadSolicitada: number; 
  producto: { nombre: string; sku?: string } 
}

export interface IAprobacion { 
  id: string; 
  orden: number; 
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'; 
  comentario?: string; 
  fechaAprobacion?: string;
  usuario?: { nombreCompleto: string }; 
  usuarioId: string 
}

export interface ICotizacion { 
  id: string; 
  fechaCotizacion: string; 
  proveedor?: { nombre: string }; 
  total: number; 
  // 🔥 Ajustado para recibir un arreglo según tu backend
  ordenesCompra?: { 
    id: string; 
    fechaCreacion: string; 
    fechaActualizacion: string; 
    estado: string 
  }[];
}

export interface IRequisicion {
  id: string; 
  fechaSolicitud: string; 
  estado: string; 
  notas: string;
  usuarioSolicitante?: { nombreCompleto: string; nombre: string };
  detalles: IDetalle[];
  aprobaciones: IAprobacion[];
  cotizaciones?: ICotizacion[];
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function DetalleRequisicionPage() {
  const { id } = useParams();
  const requisicionId = Array.isArray(id) ? id[0] : id;
  
  const [requisicion, setRequisicion] = useState<IRequisicion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [usuarioActual, setUsuarioActual] = useState<any>(null);
  const [comentario, setComentario] = useState('');
  const [aprobando, setAprobando] = useState(false);
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    const token = localStorage.getItem('syncro_token');
    try { 
      setUsuarioActual(JSON.parse(localStorage.getItem('syncro_user') || '{}')); 
    } catch (e) {}

    fetch(`${apiUrl}/compras/requisiciones/${requisicionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setRequisicion)
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [requisicionId, apiUrl]);

  const aprobacionPendiente = requisicion?.aprobaciones?.find(
    (ap) => ap.estado === 'PENDIENTE' && ap.usuarioId === usuarioActual?.id
  );

  const handleResolver = async (estado: 'APROBADO' | 'RECHAZADO') => {
    if (!aprobacionPendiente) return;

    if (estado === 'RECHAZADO' && !comentario.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Comentario requerido',
        text: 'Debes escribir un comentario explicando el motivo del rechazo.',
        confirmButtonColor: '#ef4444',
        customClass: { popup: 'rounded-[24px]', confirmButton: 'rounded-xl font-bold px-6 py-2.5' }
      });
      return;
    }

    const result = await Swal.fire({
      title: estado === 'APROBADO' ? '¿Aprobar Requisición?' : '¿Rechazar Requisición?',
      text: estado === 'APROBADO' ? 'La solicitud avanzará al siguiente aprobador o al área de compras.' : 'La solicitud será devuelta al creador y no se podrá procesar.',
      icon: estado === 'APROBADO' ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonColor: estado === 'APROBADO' ? '#059669' : '#e11d48',
      cancelButtonColor: '#64748b',
      confirmButtonText: estado === 'APROBADO' ? 'Sí, Aprobar' : 'Sí, Rechazar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      customClass: {
        popup: 'rounded-[24px] shadow-2xl',
        confirmButton: 'px-6 py-2.5 rounded-xl font-bold shadow-lg',
        cancelButton: 'px-6 py-2.5 rounded-xl font-bold'
      }
    });

    if (!result.isConfirmed) return;

    const token = localStorage.getItem('syncro_token');
    setAprobando(true);
    
    try {
      await fetch(`${apiUrl}/compras/requisiciones/aprobaciones/${aprobacionPendiente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado, comentario }),
      });
      
      Swal.fire({
        icon: 'success',
        title: estado === 'APROBADO' ? '¡Aprobada!' : 'Rechazada',
        text: 'La acción se registró exitosamente.',
        showConfirmButton: false,
        timer: 1500,
        customClass: { popup: 'rounded-[24px]' }
      });

      const nueva = await fetch(`${apiUrl}/compras/requisiciones/${requisicionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      setRequisicion(nueva);
      setComentario('');
    } catch (error) { 
      console.error(error); 
      Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error'); 
    } finally { 
      setAprobando(false); 
    }
  };

  if (cargando) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="font-medium">Cargando expediente de la requisición...</p>
      </div>
    );
  }

  if (!requisicion) {
    return (
      <div className="p-12 text-center text-rose-500 bg-rose-50 m-8 rounded-2xl border border-rose-100 max-w-2xl mx-auto">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-rose-400" />
        <p className="text-xl font-bold">Requisición no encontrada</p>
        <p className="mt-2 text-rose-600">Es posible que el ID sea incorrecto o haya sido eliminada.</p>
        <Link href="/dashboard/compras/requisiciones" className="text-indigo-600 font-medium hover:underline mt-6 inline-block">
          &larr; Volver al listado principal
        </Link>
      </div>
    );
  }

  const getBadgeEstado = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'COTIZANDO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'APROBADA': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'ORDEN_GENERADA': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'RECIBIDA': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'CON_INCIDENCIAS': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'RECHAZADA': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // 🔥 NUEVA LÓGICA DE TRAZABILIDAD DINÁMICA
  const timelineEventos: any[] = [
    { 
      fecha: requisicion.fechaSolicitud, 
      titulo: 'Requisición Creada', 
      icono: <FileText className="w-4 h-4 text-indigo-600" />, 
      color: 'bg-indigo-100 border-indigo-200',
      detalle: `Generada por ${requisicion.usuarioSolicitante?.nombreCompleto || 'N/A'}` 
    },
    ...requisicion.aprobaciones
      .filter(ap => ap.estado !== 'PENDIENTE')
      .map(ap => ({
        fecha: ap.fechaAprobacion || requisicion.fechaSolicitud,
        titulo: ap.estado === 'APROBADO' ? 'Revisión Aprobada' : 'Revisión Rechazada',
        icono: ap.estado === 'APROBADO' ? <ThumbsUp className="w-4 h-4 text-emerald-600" /> : <ThumbsDown className="w-4 h-4 text-rose-600" />,
        color: ap.estado === 'APROBADO' ? 'bg-emerald-100 border-emerald-200' : 'bg-rose-100 border-rose-200',
        detalle: `${ap.usuario?.nombreCompleto || ap.usuarioId} ${ap.comentario ? `dejó un comentario: "${ap.comentario}"` : ''}`,
      }))
  ];

  // Recorremos las cotizaciones para extraerlas junto con sus Órdenes de Compra
  (requisicion.cotizaciones || []).forEach(cot => {
    timelineEventos.push({
      fecha: cot.fechaCotizacion,
      titulo: 'Cotización Recibida',
      icono: <Receipt className="w-4 h-4 text-blue-600" />,
      color: 'bg-blue-100 border-blue-200',
      detalle: `Propuesta de ${cot.proveedor?.nombre || 'Proveedor'}. Total Ofertado: $${cot.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    });

    // Si la cotización tiene órdenes de compra, las dibujamos
    if (cot.ordenesCompra && cot.ordenesCompra.length > 0) {
      cot.ordenesCompra.forEach(oc => {
        timelineEventos.push({
          fecha: oc.fechaCreacion || cot.fechaCotizacion, // fallback
          titulo: 'Orden de Compra Generada',
          icono: <ShoppingCart className="w-4 h-4 text-purple-600" />,
          color: 'bg-purple-100 border-purple-200',
          detalle: `OC-${oc.id.substring(0,8).toUpperCase()} emitida al proveedor ${cot.proveedor?.nombre || ''}.`,
        });

        // Si la orden ya llegó al almacén, dibujamos la recepción
        if (oc.estado === 'RECIBIDA' || oc.estado === 'CON_INCIDENCIAS') {
          const esPerfecta = oc.estado === 'RECIBIDA';
          timelineEventos.push({
            fecha: oc.fechaActualizacion || new Date().toISOString(),
            titulo: esPerfecta ? 'Recepción en Almacén' : 'Recepción con Incidencias',
            icono: <PackageSearch className={`w-4 h-4 ${esPerfecta ? 'text-emerald-600' : 'text-amber-600'}`} />,
            color: esPerfecta ? 'bg-emerald-100 border-emerald-200' : 'bg-amber-100 border-amber-200',
            detalle: esPerfecta 
              ? 'La mercancía ingresó al inventario físico sin novedades.' 
              : 'La mercancía ingresó, pero se reportaron faltantes o mermas.',
          });
        }
      });
    }
  });

  // Ordenar todo cronológicamente
  const timeline = timelineEventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  // Saber si el proceso sigue activo
  const procesoTerminado = ['RECHAZADA', 'RECIBIDA', 'CON_INCIDENCIAS'].includes(requisicion.estado);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-slate-800">
      
      <div className="mb-6">
        <Link href="/dashboard/compras/requisiciones" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 rounded-lg font-medium transition-colors shadow-sm w-max">
          <ChevronLeft className="w-4 h-4" /> Volver a Requisiciones
        </Link>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
              <FileBox className="w-7 h-7 text-indigo-600" />
            </div>
            Expediente de Requisición
          </h1>
          <p className="text-slate-500 mt-2 font-medium flex items-center gap-2 text-lg">
            Folio Oficial: <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-3 py-0.5 rounded">REQ-{requisicion.id.substring(0,8).toUpperCase()}</span>
          </p>
        </div>
        <div className="text-right w-full md:w-auto">
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-widest border ${getBadgeEstado(requisicion.estado)}`}>
            {requisicion.estado === 'PENDIENTE' && <Clock className="w-4 h-4" />}
            {requisicion.estado === 'COTIZANDO' && <Search className="w-4 h-4" />}
            {requisicion.estado === 'APROBADA' && <CheckCircle2 className="w-4 h-4" />}
            {requisicion.estado}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-8">
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <User className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-bold text-slate-800">Información del Solicitante</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Elaborado por</p>
                <p className="font-semibold text-slate-900 text-lg">{requisicion.usuarioSolicitante?.nombreCompleto || 'Usuario Desconocido'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Creación</p>
                <p className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  {new Date(requisicion.fechaSolicitud).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              {requisicion.notas && (
                <div className="md:col-span-2 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Justificación / Notas Adicionales</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 italic">
                    "{requisicion.notas}"
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <PackageSearch className="w-5 h-5 text-slate-400" /> Lista de Partidas Requeridas
              </h2>
              <span className="bg-white text-slate-700 font-bold text-xs px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                {requisicion.detalles.length} items
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold tracking-wide">Descripción del Producto</th>
                    <th className="px-6 py-4 text-sm font-semibold tracking-wide text-center">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requisicion.detalles.map((det) => (
                    <tr key={det.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">{det.producto?.nombre}</p>
                        {det.producto?.sku && <p className="text-xs font-mono text-slate-400 mt-1">SKU: {det.producto.sku}</p>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                          {det.cantidadSolicitada}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div className="space-y-8">
          
          {aprobacionPendiente && (
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl shadow-xl border border-indigo-700 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-6 text-white border-b border-indigo-800/50 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/30 rounded-full flex items-center justify-center border border-indigo-400/50 shadow-inner">
                  <ShieldCheck className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Tu Autorización es Requerida</h2>
                  <p className="text-indigo-300 text-sm">Paso {aprobacionPendiente.orden} del flujo.</p>
                </div>
              </div>
              <div className="p-6 bg-white/5 backdrop-blur-sm">
                <label className="block text-sm font-medium text-indigo-200 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Comentario u Observación
                </label>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Escribe aquí si deseas agregar notas al aprobar o rechazar..."
                  className="w-full px-4 py-3 bg-slate-900/50 border border-indigo-500/30 rounded-xl text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all resize-none mb-6"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleResolver('RECHAZADO')}
                    disabled={aprobando}
                    className="flex-1 py-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/50 rounded-xl font-bold transition-all disabled:opacity-50 active:scale-95 flex justify-center items-center gap-2"
                  >
                    <ThumbsDown className="w-4 h-4" /> Rechazar
                  </button>
                  <button
                    onClick={() => handleResolver('APROBADO')}
                    disabled={aprobando}
                    className="flex-1 py-3 bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-400 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/50 active:scale-95 flex justify-center items-center gap-2"
                  >
                    {aprobando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Aprobar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-8 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" /> Trazabilidad del Documento
            </h2>
            
            <div className="relative border-l-2 border-slate-100 ml-4 space-y-8">
              {timeline.map((evento, idx) => (
                <div key={idx} className="relative pl-8">
                  <div className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${evento.color}`}>
                    {evento.icono}
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-slate-900">{evento.titulo}</p>
                      <span className="text-xs font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {new Date(evento.fecha).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                      {evento.detalle}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Solo muestra "Esperando..." si el proceso no ha concluido en almacén o rechazo */}
              {!procesoTerminado && (
                <div className="relative pl-8 opacity-50">
                  <div className="absolute -left-[13px] top-2 w-6 h-6 rounded-full border-4 border-white bg-slate-200 animate-pulse"></div>
                  <p className="font-semibold text-slate-400 italic">Esperando siguiente acción...</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}