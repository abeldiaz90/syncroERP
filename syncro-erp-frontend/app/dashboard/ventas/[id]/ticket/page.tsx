"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, Store, Loader2, FileWarning } from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IDetalleVenta {
  id: string;
  producto?: { nombre: string; sku?: string };
  productoId?: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
}

export interface IVenta {
  id: string;
  fechaVenta: string;
  estado: string;
  metodoPago: string;
  cliente?: { nombre: string; email?: string };
  subtotal: number;
  descuento: number;
  impuestoTotal: number;
  total: number;
  detalles: IDetalleVenta[];
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function TicketVentaPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [venta, setVenta] = useState<IVenta | null>(null);
  const [cargando, setCargando] = useState(true);
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    if (!id) return;
    const fetchVenta = async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/ventas/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setVenta(await res.json());
        }
      } catch (err) {
        console.error("Error al cargar ticket", err);
      } finally {
        setCargando(false);
      }
    };
    fetchVenta();
  }, [id, apiUrl]);

  if (cargando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Generando ticket...</p>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <FileWarning className="w-12 h-12 text-rose-400 mb-4" />
        <p className="text-xl font-bold text-slate-800">Venta no encontrada</p>
      </div>
    );
  }

  const isAnulada = venta.estado === 'ANULADA';

  return (
    <div className="min-h-screen bg-slate-100 py-8 flex flex-col items-center font-sans print:bg-white print:py-0">
      
      {/* Botón de Impresión (Solo en pantalla) */}
      <div className="mb-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95"
        >
          <Printer className="w-5 h-5" />
          Imprimir Recibo
        </button>
      </div>

      {/* Contenedor del Ticket (Ancho simulado de 80mm = ~320px) */}
      <div className="w-full max-w-[340px] bg-white p-6 shadow-2xl rounded-sm border border-slate-200 print:shadow-none print:border-none print:p-0 mx-auto relative">
        
        {/* Marca de Anulado */}
        {isAnulada && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <span className="text-6xl font-black text-red-600 -rotate-45 uppercase border-4 border-red-600 p-2">Anulada</span>
          </div>
        )}

        {/* Cabecera del Ticket */}
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center print:bg-black">
              <Store className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">Syncro ERP</h1>
          <p className="text-xs text-slate-600 font-medium">Ticket de Venta Oficial</p>
          <p className="text-xs text-slate-500 mt-2 font-mono">
            {new Date(venta.fechaVenta).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' })} 
            {' - '}
            {new Date(venta.fechaVenta).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm font-bold text-slate-800 mt-1 uppercase">Folio: #{venta.id.slice(0, 8)}</p>
        </div>

        {/* Datos del Cliente */}
        {venta.cliente && (
          <div className="text-xs mb-4 border-b-2 border-dashed border-slate-300 pb-4">
            <p className="text-slate-500 uppercase tracking-widest font-bold mb-1" style={{ fontSize: '10px' }}>Cliente</p>
            <p className="font-bold text-slate-800 uppercase">{venta.cliente.nombre}</p>
            {venta.cliente.email && <p className="text-slate-600">{venta.cliente.email}</p>}
          </div>
        )}

        {/* Tabla de Productos (Diseño Condensado) */}
        <div className="mb-4 border-b-2 border-dashed border-slate-300 pb-4">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-1 font-bold uppercase text-slate-800">Cant</th>
                <th className="py-1 font-bold uppercase text-slate-800 px-2">Descripción</th>
                <th className="py-1 font-bold uppercase text-slate-800 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {venta.detalles?.map((det) => {
                const nombreCorto = (det.producto?.nombre || det.productoId || '').substring(0, 20);
                return (
                  <tr key={det.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-bold text-slate-700">{det.cantidad}</td>
                    <td className="py-2 px-2 text-slate-800 font-medium">
                      {nombreCorto}
                      {det.descuento > 0 && (
                        <span className="block text-[10px] text-slate-500">- Desc: ${det.descuento.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900 font-mono">
                      ${det.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totales Financieros */}
        <div className="text-sm space-y-1.5 mb-6">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-mono">${venta.subtotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          
          {venta.descuento > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Descuento Extra:</span>
              <span className="font-mono">-${venta.descuento?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          
          <div className="flex justify-between text-slate-600">
            <span>I.V.A.:</span>
            <span className="font-mono">${venta.impuestoTotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          
          <div className="flex justify-between items-end border-t border-slate-800 pt-2 mt-2">
            <span className="font-black text-slate-900 uppercase">Total:</span>
            <span className="font-black text-xl text-slate-900 tracking-tighter">
              ${venta.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Método de Pago y Footer */}
        <div className="text-center text-xs text-slate-500 pt-4 border-t-2 border-dashed border-slate-300">
          <p className="uppercase font-bold text-slate-800 mb-1">Pago en {venta.metodoPago}</p>
          <p className="mt-4 mb-2">¡Gracias por su compra!</p>
          
          {/* Código de barras simulado */}
          <div className="font-mono tracking-[0.3em] text-slate-900 text-lg opacity-80 mt-4">
            |||| |||| | ||||| ||||
          </div>
          <p className="text-[10px] mt-1">{venta.id.replace(/-/g, '').substring(0, 16).toUpperCase()}</p>
        </div>

      </div>
    </div>
  );
}