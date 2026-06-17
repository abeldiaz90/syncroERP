"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ShoppingCart, Search, Loader2, FileText, 
  Eye, Printer, PackageSearch
} from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IOrdenCompra {
  id: string;
  proveedor?: { nombre: string };
  total: number;
  estado: 'PENDIENTE' | 'ENVIADA' | 'RECIBIDA' | 'CANCELADA' | string;
  fechaCreacion: string;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<IOrdenCompra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    const fetchOrdenes = async () => {
      setCargando(true);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/compras/ordenes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setOrdenes(await res.json());
        }
      } catch (error) {
        console.error("Error al cargar las órdenes", error);
      } finally {
        setCargando(false);
      }
    };
    fetchOrdenes();
  }, [apiUrl]);

  // Helpers Visuales
  const getBadgeEstado = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'ENVIADA': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'RECIBIDA': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'CANCELADA': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Filtrado en tiempo real
  const ordenesFiltradas = ordenes.filter(oc => 
    oc.id.toLowerCase().includes(busqueda.toLowerCase()) || 
    (oc.proveedor?.nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
              <ShoppingCart className="w-7 h-7 text-indigo-600" />
            </div>
            <span className="bg-gradient-to-r from-slate-900 to-slate-700 text-transparent bg-clip-text">
              Órdenes de Compra
            </span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            Historial de documentos oficiales enviados a proveedores.
          </p>
        </div>
      </div>

      {/* Buscador */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por folio o proveedor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-transparent text-slate-700 focus:outline-none placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="font-medium">Cargando directorio de órdenes...</p>
          </div>
        ) : ordenesFiltradas.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
              <PackageSearch className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-lg font-bold text-slate-700">No se encontraron resultados</p>
            <p className="text-sm mt-1">Intenta con otros términos de búsqueda o genera una nueva desde las cotizaciones.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Folio / Fecha</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4 text-right">Importe Total</th>
                  <th className="px-6 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordenesFiltradas.map((oc) => (
                  <tr key={oc.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-indigo-600 tracking-tight">OC-{oc.id.substring(0, 8).toUpperCase()}</span>
                        <span className="text-xs text-slate-500 font-medium mt-0.5">
                          {new Date(oc.fechaCreacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {oc.proveedor?.nombre || 'No especificado'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-slate-900">
                        ${oc.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getBadgeEstado(oc.estado)}`}>
                        {oc.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/dashboard/compras/ordenes/${oc.id}`}
                          className="flex items-center justify-center w-9 h-9 bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm"
                          title="Ver Detalles y Gestionar"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/dashboard/compras/ordenes/${oc.id}/pdf`}
                          target="_blank"
                          className="flex items-center justify-center w-9 h-9 bg-white text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-lg transition-all shadow-sm"
                          title="Imprimir Documento PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
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