"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';

export default function PdfRequisicionPage() {
  const { id } = useParams();
  const [requisicion, setRequisicion] = useState<any>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    const token = localStorage.getItem('syncro_token');
    fetch(`${apiUrl}/compras/requisiciones/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setRequisicion)
      .catch(console.error);
  }, [id, apiUrl]);

  if (!requisicion) return <div className="p-8 text-center text-slate-500 font-medium">Cargando documento...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      {/* Botón de impresión (oculto en papel) */}
      <div className="max-w-4xl mx-auto mb-6 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Imprimir / Guardar como PDF
        </button>
      </div>

      {/* Hoja del documento */}
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 shadow-lg border border-slate-200 print:shadow-none print:border-none">
        
        {/* Encabezado del PDF */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Requisición</h1>
            <p className="text-slate-500 font-medium">Documento de solicitud de compra</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-500 uppercase">Folio</p>
            <p className="text-2xl font-black text-indigo-600">REQ-{requisicion.id.substring(0,6).toUpperCase()}</p>
          </div>
        </div>

        {/* Info del Documento */}
        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Solicitante</h4>
            <p className="font-bold text-slate-900">{requisicion.usuarioSolicitante?.nombreCompleto || requisicion.usuarioSolicitante?.nombre || 'No definido'}</p>
          </div>
          <div className="text-right">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha de Emisión</h4>
            <p className="font-bold text-slate-900">{new Date(requisicion.fechaSolicitud).toLocaleDateString('es-MX', { dateStyle: 'full' })}</p>
          </div>
        </div>

        {/* Tabla de Productos */}
        <table className="w-full mb-10">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="p-3 text-left font-bold uppercase text-sm">Producto</th>
              <th className="p-3 text-center font-bold uppercase text-sm w-32">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requisicion.detalles?.length > 0 ? (
              requisicion.detalles.map((det: any, index: number) => (
                <tr key={index} className="odd:bg-slate-50">
                  <td className="p-3 text-slate-800">{det.producto?.nombre || 'Producto no encontrado'}</td>
                  <td className="p-3 text-center font-bold text-slate-900">{det.cantidadSolicitada}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="p-4 text-center text-slate-500 italic">Sin productos en esta requisición</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Notas y Footer */}
        <div className="mt-8 border-t border-slate-200 pt-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notas Adicionales</h4>
          <p className="text-slate-600 italic bg-slate-50 p-4 rounded-lg border border-slate-100">
            {requisicion.notas || 'No se agregaron notas a esta requisición.'}
          </p>
        </div>

        {/* Firma ficticia para PDF */}
        <div className="mt-20 flex justify-center gap-20">
          <div className="text-center w-64 border-t border-slate-400 pt-2">
            <p className="text-xs font-bold text-slate-500 uppercase">Firma del Solicitante</p>
          </div>
          <div className="text-center w-64 border-t border-slate-400 pt-2">
            <p className="text-xs font-bold text-slate-500 uppercase">Firma de Autorización</p>
          </div>
        </div>
      </div>
    </div>
  );
}