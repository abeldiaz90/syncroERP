"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Printer, ChevronLeft, Building2, ShoppingCart, Calendar, MapPin } from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IDetalleOC {
  id: string;
  producto?: { nombre: string; sku?: string };
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface IOrdenCompra {
  id: string;
  fechaCreacion: string;
  estado: string;
  proveedor?: { 
    nombre: string; 
    rfc?: string;
    contactoNombre?: string;
    telefono?: string;
  };
  subtotal?: number;
  impuestoTotal?: number;
  total: number;
  notas?: string;
  detalles: IDetalleOC[];
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function PdfOCPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [oc, setOC] = useState<IOrdenCompra | null>(null);
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    if (!id) return;
    const fetchOC = async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/compras/ordenes/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setOC(await res.json());
        }
      } catch (error) {
        console.error("Error al cargar la Orden de Compra", error);
      }
    };
    fetchOC();
  }, [id, apiUrl]);

  if (!oc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <ShoppingCart className="w-10 h-10 text-indigo-500 animate-pulse mb-4" />
        <p className="text-slate-500 font-medium text-lg">Generando Orden de Compra...</p>
      </div>
    );
  }

  // Cálculos de respaldo en caso de que el backend solo mande el 'total'
  const subtotalOC = oc.subtotal ?? (oc.total / 1.16);
  const impuestoOC = oc.impuestoTotal ?? (oc.total - subtotalOC);

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans print:bg-white print:py-0 print:px-0">
      
      {/* Barra de Controles (Visible solo en pantalla) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden">
        <Link 
          href="/dashboard/compras/ordenes"
          className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-lg hover:bg-slate-50 hover:text-indigo-600 font-medium transition-colors border border-slate-200 shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a Órdenes
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-all shadow-md shadow-indigo-200 active:scale-95"
        >
          <Printer className="w-5 h-5" />
          Imprimir / Exportar a PDF
        </button>
      </div>

      {/* Hoja del Documento Oficial */}
      <div className="max-w-4xl mx-auto bg-white p-10 md:p-14 shadow-2xl rounded-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
        
        {/* Encabezado Principal */}
        <div className="flex flex-col md:flex-row justify-between items-start border-b-2 border-slate-900 pb-8 mb-8">
          <div>
            {/* Espacio para el Logo de tu Empresa */}
            <div className="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center mb-4 print:bg-slate-900">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Orden de Compra</h1>
            <p className="text-slate-500 font-medium mt-1">Syncro ERP</p>
          </div>
          
          <div className="text-right mt-6 md:mt-0">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Folio (PO Number)</p>
            <p className="text-3xl font-black text-indigo-600 print:text-slate-900">
              OC-{oc.id.substring(0, 8).toUpperCase()}
            </p>
            <div className="flex items-center justify-end gap-2 text-slate-600 mt-2 font-medium">
              <Calendar className="w-4 h-4" />
              <span>{new Date(oc.fechaCreacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="mt-2 inline-block px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold uppercase rounded-lg">
              Estado: {oc.estado}
            </div>
          </div>
        </div>

        {/* Direcciones y Proveedor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          
          {/* Facturar/Enviar a (Tu Empresa) */}
          <div className="flex flex-col text-left">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Facturar y Enviar a
            </h4>
            <p className="font-black text-slate-800 text-lg">Mi Empresa S.A. de C.V.</p>
            <p className="text-sm text-slate-600 mt-1">Calle Principal #123, Col. Centro</p>
            <p className="text-sm text-slate-600">Ciudad, Estado, C.P. 00000</p>
            <p className="text-sm text-slate-600 mt-1"><strong>RFC:</strong> EMP-000000-XX0</p>
          </div>

          {/* Datos del Proveedor */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 print:border-slate-300 print:bg-transparent">
            <h4 className="text-xs font-bold text-indigo-600 print:text-slate-900 uppercase tracking-widest mb-3 border-b border-indigo-100 pb-2">
              Datos del Proveedor
            </h4>
            <p className="font-bold text-slate-900 text-xl leading-tight mb-2">
              {oc.proveedor?.nombre || 'Proveedor no especificado'}
            </p>
            <div className="space-y-1 text-sm text-slate-600">
              {oc.proveedor?.rfc && <p><strong className="text-slate-800">RFC:</strong> {oc.proveedor.rfc}</p>}
              {oc.proveedor?.contactoNombre && <p><strong className="text-slate-800">Atención a:</strong> {oc.proveedor.contactoNombre}</p>}
              {oc.proveedor?.telefono && <p><strong className="text-slate-800">Teléfono:</strong> {oc.proveedor.telefono}</p>}
            </div>
          </div>

        </div>

        {/* Tabla de Artículos de la Orden */}
        <div className="mb-8 rounded-xl overflow-hidden border border-slate-200 print:border-slate-400">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white print:bg-slate-200 print:text-slate-900 print:border-b-2 print:border-slate-900">
                <th className="p-4 font-bold uppercase text-xs tracking-wider">Descripción del Artículo</th>
                <th className="p-4 text-center font-bold uppercase text-xs tracking-wider w-24">Cant.</th>
                <th className="p-4 text-right font-bold uppercase text-xs tracking-wider w-32">Precio Unit.</th>
                <th className="p-4 text-right font-bold uppercase text-xs tracking-wider w-40">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {oc.detalles?.map((det) => (
                <tr key={det.id} className="odd:bg-slate-50/50 print:odd:bg-transparent">
                  <td className="p-4">
                    <p className="text-slate-800 font-bold">{det.producto?.nombre}</p>
                    {det.producto?.sku && <p className="text-xs text-slate-400 font-mono mt-0.5">SKU: {det.producto.sku}</p>}
                  </td>
                  <td className="p-4 text-center font-bold text-slate-600">{det.cantidad}</td>
                  <td className="p-4 text-right text-slate-600 font-mono">
                    ${det.precioUnitario?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right font-black text-slate-900 font-mono text-lg">
                    ${det.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumen Financiero e Instrucciones */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mt-10">
          
          {/* Instrucciones Especiales (7 columnas) */}
          <div className="md:col-span-7">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">
              Instrucciones Especiales y Notas
            </h4>
            <div className="text-sm text-slate-600 bg-slate-50 p-5 rounded-xl border border-slate-100 print:bg-transparent print:border-slate-300 min-h-[120px]">
              {oc.notas ? (
                <p className="whitespace-pre-wrap">{oc.notas}</p>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-slate-500">
                  <li>Favor de incluir el número de Orden de Compra (Folio) en su factura.</li>
                  <li>Entregar mercancía en el horario de 9:00 AM a 5:00 PM.</li>
                  <li>Cualquier alteración en precios debe ser notificada antes del envío.</li>
                </ul>
              )}
            </div>
          </div>

          {/* Resumen de Costos (5 columnas) */}
          <div className="md:col-span-5">
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 print:bg-transparent print:border-slate-400">
              <div className="space-y-3">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Subtotal</span>
                  <span className="font-mono">${subtotalOC.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>I.V.A. (16%)</span>
                  <span className="font-mono">${impuestoOC.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pt-4 border-t-2 border-slate-200 print:border-slate-400 flex justify-between items-center mt-2">
                  <span className="text-sm font-black text-slate-900 uppercase tracking-wider">Total Final</span>
                  <span className="text-2xl font-black text-indigo-600 print:text-slate-900">
                    ${oc.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* Firmas Oficiales para la Orden de Compra */}
        <div className="mt-32 grid grid-cols-3 gap-8 px-4 print:mt-40 break-inside-avoid">
          <div className="text-center border-t border-slate-400 pt-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Elaboró (Compras)</p>
            <p className="text-xs text-slate-500 mt-1">Nombre y Firma</p>
          </div>
          <div className="text-center border-t border-slate-400 pt-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Autorizó (Finanzas)</p>
            <p className="text-xs text-slate-500 mt-1">Nombre y Firma</p>
          </div>
          <div className="text-center border-t border-slate-400 pt-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Aceptación (Proveedor)</p>
            <p className="text-xs text-slate-500 mt-1">Nombre, Firma y Fecha</p>
          </div>
        </div>

      </div>
    </div>
  );
}