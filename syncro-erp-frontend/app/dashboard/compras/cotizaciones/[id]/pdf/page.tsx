"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Printer, FileText, ChevronLeft, Building2, Calendar, FileBox } from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IDetalleCotizacion {
  id: string;
  producto?: { nombre: string };
  productoId?: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ICotizacion {
  id: string;
  fechaCotizacion: string;
  proveedor?: { 
    nombre: string; 
    rfc?: string;
    contactoNombre?: string;
    telefono?: string;
  };
  notas: string;
  subtotal: number;
  impuestoTotal: number;
  total: number;
  detalles: IDetalleCotizacion[];
  requisicion?: { id: string };
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function PdfCotizacionPage() {
  const params = useParams();
  const id = params?.id;
  const cotizacionId = Array.isArray(id) ? id[0] : id;
  
  const [cotizacion, setCotizacion] = useState<ICotizacion | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    if (!cotizacionId) return;
    const fetchCotizacion = async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/compras/cotizaciones/${cotizacionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setCotizacion(await res.json());
        }
      } catch (error) {
        console.error("Error al cargar la cotización para impresión", error);
      }
    };
    
    fetchCotizacion();
  }, [cotizacionId, apiUrl]);

  if (!cotizacion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <FileText className="w-10 h-10 text-indigo-500 animate-pulse mb-4" />
        <p className="text-slate-500 font-medium text-lg">Preparando documento comercial...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans print:bg-white print:py-0 print:px-0">
      
      {/* Barra de Controles (Visible solo en pantalla) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden">
        <Link 
          href={`/dashboard/compras/cotizaciones`}
          className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-lg hover:bg-slate-50 hover:text-indigo-600 font-medium transition-colors border border-slate-200 shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a Cotizaciones
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-all shadow-md shadow-indigo-200 active:scale-95"
        >
          <Printer className="w-5 h-5" />
          Imprimir / Exportar a PDF
        </button>
      </div>

      {/* Hoja del Documento (Formato A4 aproximado) */}
      <div className="max-w-4xl mx-auto bg-white p-10 md:p-14 shadow-2xl rounded-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
        
        {/* Encabezado del Documento */}
        <div className="flex flex-col md:flex-row justify-between items-start border-b-2 border-slate-900 pb-8 mb-8">
          <div>
            {/* Aquí puedes colocar el logo de tu empresa en el futuro */}
            <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 print:bg-slate-900">
              <FileBox className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Cotización</h1>
            <p className="text-slate-500 font-medium mt-1">Documento comercial interno</p>
          </div>
          
          <div className="text-right mt-6 md:mt-0">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Folio</p>
            <p className="text-3xl font-black text-indigo-600 print:text-slate-900">
              COT-{cotizacion.id.substring(0, 8).toUpperCase()}
            </p>
            <div className="flex items-center justify-end gap-2 text-slate-600 mt-2 font-medium">
              <Calendar className="w-4 h-4" />
              <span>{new Date(cotizacion.fechaCotizacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Bloque de Información Cruzada */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          
          {/* Datos del Proveedor */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 print:border-slate-300 print:bg-transparent">
            <h4 className="text-xs font-bold text-indigo-600 print:text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Proveedor Seleccionado
            </h4>
            <p className="font-bold text-slate-900 text-xl leading-tight mb-2">
              {cotizacion.proveedor?.nombre || 'Proveedor no especificado'}
            </p>
            <div className="space-y-1 text-sm text-slate-600">
              {cotizacion.proveedor?.rfc && <p><strong className="text-slate-800">RFC:</strong> {cotizacion.proveedor.rfc}</p>}
              {cotizacion.proveedor?.contactoNombre && <p><strong className="text-slate-800">Atención a:</strong> {cotizacion.proveedor.contactoNombre}</p>}
              {cotizacion.proveedor?.telefono && <p><strong className="text-slate-800">Teléfono:</strong> {cotizacion.proveedor.telefono}</p>}
            </div>
          </div>
          
          {/* Datos de Referencia Interna */}
          <div className="flex flex-col justify-center items-end text-right p-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Documento Origen</h4>
            {cotizacion.requisicion ? (
              <>
                <p className="font-medium text-slate-600">Basado en Requisición:</p>
                <p className="font-black text-2xl text-slate-800 mt-1">REQ-{cotizacion.requisicion.id.substring(0,6).toUpperCase()}</p>
              </>
            ) : (
              <p className="font-bold text-slate-500 italic bg-slate-100 px-4 py-2 rounded-lg print:bg-transparent print:border">
                Cotización directa (Sin Requisición)
              </p>
            )}
          </div>
        </div>

        {/* Tabla de Partidas */}
        <div className="mb-8 rounded-xl overflow-hidden border border-slate-200 print:border-slate-400">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white print:bg-slate-200 print:text-slate-900 print:border-b-2 print:border-slate-900">
                <th className="p-4 font-bold uppercase text-xs tracking-wider">Descripción</th>
                <th className="p-4 text-center font-bold uppercase text-xs tracking-wider w-24">Cant.</th>
                <th className="p-4 text-right font-bold uppercase text-xs tracking-wider w-32">Precio Unit.</th>
                <th className="p-4 text-right font-bold uppercase text-xs tracking-wider w-40">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cotizacion.detalles?.length > 0 ? (
                cotizacion.detalles.map((det) => (
                  <tr key={det.id} className="odd:bg-slate-50/50 print:odd:bg-transparent">
                    <td className="p-4 text-slate-800 font-semibold">{det.producto?.nombre || det.productoId}</td>
                    <td className="p-4 text-center font-bold text-slate-600">{det.cantidad}</td>
                    <td className="p-4 text-right text-slate-600 font-mono">
                      ${det.precioUnitario?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right font-black text-slate-900 font-mono text-lg">
                      ${det.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                    No hay partidas registradas en esta cotización.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sección Inferior: Notas y Totales */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mt-10">
          
          {/* Notas Comerciales (Ocupa 7 columnas) */}
          <div className="md:col-span-7">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">
              Condiciones y Notas
            </h4>
            <div className="text-sm text-slate-600 italic bg-slate-50 p-5 rounded-xl border border-slate-100 print:bg-transparent print:border-slate-300 min-h-[100px]">
              {cotizacion.notas ? (
                <p className="whitespace-pre-wrap">{cotizacion.notas}</p>
              ) : (
                <p className="text-slate-400">No se adjuntaron condiciones adicionales a esta cotización.</p>
              )}
            </div>
          </div>

          {/* Resumen Financiero (Ocupa 5 columnas) */}
          <div className="md:col-span-5">
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 print:bg-transparent print:border-slate-400">
              <div className="space-y-3">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Subtotal</span>
                  <span className="font-mono">${cotizacion.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>I.V.A. (16%)</span>
                  <span className="font-mono">${cotizacion.impuestoTotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pt-4 border-t-2 border-slate-200 print:border-slate-400 flex justify-between items-center mt-2">
                  <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Total Final</span>
                  <span className="text-2xl font-black text-indigo-600 print:text-slate-900">
                    ${cotizacion.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* Bloque de Firmas para Impresión */}
        <div className="mt-32 grid grid-cols-2 gap-16 px-8 print:mt-40 break-inside-avoid">
          <div className="text-center border-t border-slate-400 pt-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Aprobación de Compras</p>
            <p className="text-xs text-slate-500 mt-1">Nombre y Firma</p>
          </div>
          <div className="text-center border-t border-slate-400 pt-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Aprobación de Finanzas</p>
            <p className="text-xs text-slate-500 mt-1">Nombre y Firma</p>
          </div>
        </div>

      </div>
    </div>
  );
}