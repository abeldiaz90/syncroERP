"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Truck, Search, PackageCheck, Clock, CheckCircle2, 
  AlertCircle, Loader2, ChevronRight, Building2, Calendar
} from 'lucide-react';

// ==========================================
// INTERFACES
// ==========================================
export interface IDetalleOC {
  id: string;
  cantidad: number;
  producto?: { nombre: string; sku?: string };
}

export interface IOrdenCompra {
  id: string;
  fechaCreacion: string;
  estado: string;
  proveedor?: { nombre: string };
  detalles: IDetalleOC[];
}

export default function ListaRecepcionesPage() {
  const [recepciones, setRecepciones] = useState<IOrdenCompra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'ENVIADA' | 'RECIBIDA'>('ENVIADA');
  const [toast, setToast] = useState<{ mensaje: string; tipo: 'error' | 'info' } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  useEffect(() => {
    const fetchRecepciones = async () => {
      setCargando(true);
      const token = localStorage.getItem('syncro_token');
      
      try {
        // En un futuro, puedes pedirle a tu backend un endpoint exclusivo como /inventario/recepciones
        // Por ahora, reutilizamos la lista de órdenes, pero ocultamos los precios en el frontend.
        const res = await fetch(`${apiUrl}/compras/ordenes`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          // Filtramos para que almacén solo vea lo que ya fue enviado o ya se recibió
          const logisticaData = data.filter((oc: IOrdenCompra) => oc.estado === 'ENVIADA' || oc.estado === 'RECIBIDA');
          setRecepciones(logisticaData);
        } else {
          setToast({ mensaje: 'Error al cargar los documentos de tránsito', tipo: 'error' });
        }
      } catch (error) {
        setToast({ mensaje: 'Error de conexión con el servidor', tipo: 'error' });
      } finally {
        setCargando(false);
      }
    };

    fetchRecepciones();
  }, [apiUrl]);

  // Filtrado local
  const recepcionesFiltradas = recepciones.filter(oc => {
    const coincideEstado = oc.estado === filtroEstado;
    const coincideBusqueda = 
      oc.id.toLowerCase().includes(busqueda.toLowerCase()) || 
      (oc.proveedor?.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    
    return coincideEstado && coincideBusqueda;
  });

  const conteoEnTransito = recepciones.filter(oc => oc.estado === 'ENVIADA').length;
  const conteoRecibidas = recepciones.filter(oc => oc.estado === 'RECIBIDA').length;

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto text-slate-800 animate-in fade-in duration-500">
      
      {/* Toast Notificaciones */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-bold text-white transition-all ${toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          <AlertCircle className="w-5 h-5" /> {toast.mensaje}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><Truck className="w-6 h-6" /></div>
            Recepción de Mercancía
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Control logístico de entradas al inventario físico.</p>
        </div>
        
        {/* Estadísticas Rápidas */}
        <div className="flex gap-4">
          <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Clock className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">En Tránsito</p>
              <p className="text-xl font-black text-slate-800">{conteoEnTransito}</p>
            </div>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recibidas</p>
              <p className="text-xl font-black text-slate-800">{conteoRecibidas}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLES DE FILTRADO Y BÚSQUEDA */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        
        {/* Selector de Estado (Tabs) */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => setFiltroEstado('ENVIADA')}
            className={`flex-1 md:w-48 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${filtroEstado === 'ENVIADA' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock className="w-4 h-4" /> Por Recibir
          </button>
          <button 
            onClick={() => setFiltroEstado('RECIBIDA')}
            className={`flex-1 md:w-48 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${filtroEstado === 'RECIBIDA' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <CheckCircle2 className="w-4 h-4" /> Historial Completo
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full md:w-[350px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar folio o proveedor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition-all"
          />
        </div>
      </div>

      {/* LISTADO DE RECEPCIONES */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="font-bold">Buscando manifiestos de carga...</p>
          </div>
        ) : recepcionesFiltradas.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <PackageCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-xl font-bold text-slate-700">No hay entregas pendientes</p>
            <p className="mt-1">Todo está al día o no hay coincidencias con tu búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-widest font-black">
                <tr>
                  <th className="px-6 py-5">Folio / Fecha</th>
                  <th className="px-6 py-5">Proveedor Origen</th>
                  <th className="px-6 py-5 text-center">Volumen Esperado</th>
                  <th className="px-6 py-5 text-center">Estado</th>
                  <th className="px-6 py-5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recepcionesFiltradas.map((oc) => {
                  // Calcular cuántos artículos en total vienen en este camión
                  const totalArticulos = oc.detalles?.reduce((acc, det) => acc + det.cantidad, 0) || 0;

                  return (
                    <tr key={oc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
                            <Truck className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 font-mono">OC-{oc.id.substring(0,8).toUpperCase()}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> {new Date(oc.fechaCreacion).toLocaleDateString('es-MX')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span className="font-bold text-slate-700">{oc.proveedor?.nombre || 'Proveedor Desconocido'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-black">
                          {totalArticulos} <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">PZAS</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-3 py-1.5 rounded-xl text-xs font-black tracking-widest uppercase border ${
                          oc.estado === 'ENVIADA' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        }`}>
                          {oc.estado === 'ENVIADA' ? 'En Tránsito' : 'Recibida'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={`/dashboard/inventario/recepciones/${oc.id}`}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 ${
                            oc.estado === 'ENVIADA' 
                              ? 'bg-slate-900 text-white hover:bg-emerald-600' 
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {oc.estado === 'ENVIADA' ? 'Procesar Entrada' : 'Ver Detalle'}
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}