"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { 
  ChevronLeft, CheckCircle2, Building2, ShoppingCart, 
  AlertCircle, Loader2, Send, Printer, Calendar, Clock
} from 'lucide-react';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export default function DetalleOCPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  
  const [oc, setOC] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('syncro_token');
    fetch(`${apiUrl}/compras/ordenes/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => { if (res.ok) setOC(await res.json()); })
      .catch(() => mostrarToast("Error de conexión", "error"))
      .finally(() => setCargando(false));
  }, [id, apiUrl]);

  const handleCambiarEstado = async (nuevoEstado: string) => {
    const result = await Swal.fire({
      title: '¿Confirmar Envío a Proveedor?',
      text: "Se notificará al proveedor y el documento pasará a estado ENVIADA.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, confirmar envío',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold' }
    });

    if (!result.isConfirmed) return;

    setProcesando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/ordenes/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (res.ok) {
        mostrarToast('Orden actualizada exitosamente', 'exito');
        const reloadRes = await fetch(`${apiUrl}/compras/ordenes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (reloadRes.ok) setOC(await reloadRes.json());
      } else throw new Error();
    } catch { mostrarToast('Error al actualizar el estado', 'error'); }
    finally { setProcesando(false); }
  };

  if (cargando) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /></div>;
  if (!oc) return <div className="text-center p-20 text-rose-500 font-bold">Documento no encontrado</div>;

  const subtotalOC = oc.subtotal ?? (oc.total / 1.16);
  const impuestoOC = oc.impuestoTotal ?? (oc.total - subtotalOC);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800 space-y-6">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl font-bold text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.mensaje}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Link href="/dashboard/compras/ordenes" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors">
          <ChevronLeft className="w-4 h-4" /> Volver a Órdenes
        </Link>

        {/* ✅ Solo aparece si tiene GET /api/compras/ordenes/:id (PDF usa la misma ruta) */}
        <ProtectedElement metodo="GET" ruta="/api/compras/ordenes/:id">
          <Link href={`/dashboard/compras/ordenes/${oc.id}/pdf`} target="_blank" className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 font-bold transition-colors shadow-lg">
            <Printer className="w-4 h-4" /> Imprimir OC
          </Link>
        </ProtectedElement>
      </div>

      {/* ENCABEZADO */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
        <div className="flex justify-between items-start border-b border-slate-100 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-2xl"><ShoppingCart className="w-6 h-6 text-indigo-600" /></div>
              Orden de Compra Financiera
            </h1>
            <p className="text-slate-500 mt-2 font-bold font-mono">Folio: OC-{oc.id.substring(0,8).toUpperCase()}</p>
          </div>
          <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
            oc.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' :
            oc.estado === 'ENVIADA'   ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            Estado: {oc.estado}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <Building2 className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Proveedor Comercial</p>
              <p className="font-bold text-slate-800 text-lg">{oc.proveedor?.nombre}</p>
              {oc.proveedor?.rfc && <p className="text-xs text-slate-500">RFC: {oc.proveedor.rfc}</p>}
            </div>
          </div>
          <div className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <Calendar className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Fecha de Emisión</p>
              <p className="font-bold text-slate-800 text-lg">{new Date(oc.fechaCreacion).toLocaleDateString('es-MX')}</p>
            </div>
          </div>
        </div>

        {/* TABLA DE COSTOS */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden mb-8">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-6 py-4 text-sm font-bold">Producto / SKU</th>
                <th className="px-6 py-4 text-sm font-bold text-center">Cant.</th>
                <th className="px-6 py-4 text-sm font-bold text-right">Precio Unit.</th>
                <th className="px-6 py-4 text-sm font-bold text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {oc.detalles?.map((det: any) => (
                <tr key={det.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800">{det.producto?.nombre}</p>
                    <p className="text-xs text-slate-400">{det.producto?.sku}</p>
                  </td>
                  <td className="px-6 py-4 text-center font-bold">{det.cantidad}</td>
                  <td className="px-6 py-4 text-right text-slate-500 font-mono">${det.precioUnitario?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-800">${det.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bg-slate-50 p-6 flex justify-end border-t border-slate-200">
            <div className="w-64 space-y-2">
              <div className="flex justify-between font-bold text-slate-500"><span>Subtotal</span><span>${subtotalOC.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between font-bold text-slate-500"><span>I.V.A. (16%)</span><span>${impuestoOC.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center mt-3">
                <span className="text-sm font-black uppercase text-slate-900">Total</span>
                <span className="text-2xl font-black text-indigo-600">${oc.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLES DE COMPRA */}
        {oc.estado === 'PENDIENTE' && (
          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h3 className="font-black text-indigo-900">Acción Requerida</h3>
              <p className="text-sm text-indigo-700 font-medium">Revisa los costos y envía esta orden para iniciar el proceso logístico.</p>
            </div>
            {/* ✅ Solo aparece si tiene PATCH /api/compras/ordenes/:id/estado */}
            <ProtectedElement metodo="PATCH" ruta="/api/compras/ordenes/:id/estado">
              <button
                onClick={() => handleCambiarEstado('ENVIADA')}
                disabled={procesando}
                className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-all flex gap-2 shadow-lg shadow-indigo-200 w-full md:w-auto justify-center disabled:opacity-50"
              >
                {procesando ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
                Confirmar Envío a Proveedor
              </button>
            </ProtectedElement>
          </div>
        )}

        {oc.estado === 'ENVIADA' && (
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-center gap-4 text-blue-800">
            <Clock className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-black text-lg">En tránsito logístico</p>
              <p className="text-sm font-medium">El equipo de Almacén registrará la entrada física en el módulo de Recepciones cuando la mercancía llegue a sucursal.</p>
            </div>
          </div>
        )}

        {oc.estado === 'RECIBIDA' && (
          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 flex items-center gap-4 text-emerald-800">
            <CheckCircle2 className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-black text-lg">Proceso Completado</p>
              <p className="text-sm font-medium">Almacén ha registrado y validado la entrada física de este documento.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
