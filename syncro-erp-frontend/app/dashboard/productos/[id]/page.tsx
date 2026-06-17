"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, History, Package, ArrowUpRight, ArrowDownRight, 
  Warehouse, Download, TrendingUp, TrendingDown, Layers, Globe,
  Search, Calendar, Filter, XCircle
} from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IMovimiento {
  id: string;
  fechaMovimiento: string;
  tipo: 'COMPRA' | 'ENTRADA' | 'SALIDA' | 'VENTA' | 'AJUSTE' | string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  motivo: string;
  almacen?: { nombre: string };
  saldoGlobal?: number;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function KardexPage() {
  const params = useParams();
  const id = params?.id as string;
  
  const [movimientos, setMovimientos] = useState<IMovimiento[]>([]);
  const [cargando, setCargando] = useState(true);

  // ESTADOS DE LOS FILTROS
  const [busqueda, setBusqueda] = useState('');
  const [filtroAlmacen, setFiltroAlmacen] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    const fetchMovimientos = async () => {
      setCargando(true);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/catalogo/inventario/productos/${id}/movimientos`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMovimientos(data);
        }
      } catch (error) {
        console.error("Error al cargar kardex", error);
      } finally {
        setCargando(false);
      }
    };
    if (id) fetchMovimientos();
  }, [id, apiUrl]);

  // ==========================================
  // LÓGICA DE NEGOCIO Y SALDOS (INTOCABLE)
  // ==========================================
  const esMovimientoEntrada = (m: IMovimiento) => {
    const tipo = m.tipo.toUpperCase();
    if (['SALIDA', 'VENTA', 'MERMA', 'DESCARGO'].includes(tipo)) return false;
    if (['ENTRADA', 'COMPRA', 'INGRESO'].includes(tipo)) return true;
    return m.stockNuevo > (m.stockAnterior || 0);
  };

  // Calculamos la historia matemática ANTES de los filtros
  const movimientosProcesados = useMemo(() => {
    if (!movimientos.length) return [];
    let acumuladoGlobal = 0;
    const clon = [...movimientos].reverse();
    const resultado = clon.map(m => {
      const cant = Math.abs(m.cantidad);
      if (esMovimientoEntrada(m)) acumuladoGlobal += cant;
      else acumuladoGlobal -= cant;
      return { ...m, saldoGlobal: acumuladoGlobal };
    });
    return resultado.reverse();
  }, [movimientos]);

  // ==========================================
  // MOTOR DE FILTROS AVANZADOS
  // ==========================================
  const almacenesUnicos = Array.from(new Set(movimientos.map(m => m.almacen?.nombre).filter(Boolean)));
  const tiposUnicos = Array.from(new Set(movimientos.map(m => m.tipo).filter(Boolean)));

  const movimientosFiltrados = useMemo(() => {
    return movimientosProcesados.filter(m => {
      const matchBuscador = busqueda === '' || 
        m.motivo?.toLowerCase().includes(busqueda.toLowerCase()) || 
        m.id.toLowerCase().includes(busqueda.toLowerCase());
      
      const matchAlmacen = filtroAlmacen === '' || m.almacen?.nombre === filtroAlmacen;
      const matchTipo = filtroTipo === '' || m.tipo === filtroTipo;
      
      const matchFechaInicio = fechaInicio === '' || new Date(m.fechaMovimiento) >= new Date(fechaInicio + 'T00:00:00');
      const matchFechaFin = fechaFin === '' || new Date(m.fechaMovimiento) <= new Date(fechaFin + 'T23:59:59');

      return matchBuscador && matchAlmacen && matchTipo && matchFechaInicio && matchFechaFin;
    });
  }, [movimientosProcesados, busqueda, filtroAlmacen, filtroTipo, fechaInicio, fechaFin]);

  // ==========================================
  // KPIs DINÁMICOS (Basados en lo que ves)
  // ==========================================
  let totalEntradas = 0;
  let totalSalidas = 0;
  movimientosFiltrados.forEach(m => {
    const cant = Math.abs(m.cantidad);
    if (esMovimientoEntrada(m)) totalEntradas += cant;
    else totalSalidas += cant;
  });

  const saldoGlobalActual = movimientosProcesados.length > 0 ? movimientosProcesados[0].saldoGlobal : 0;

  const limpiarFiltros = () => {
    setBusqueda(''); setFiltroAlmacen(''); setFiltroTipo(''); setFechaInicio(''); setFechaFin('');
  };

  // ==========================================
  // EXPORTACIÓN A EXCEL (Contextual)
  // ==========================================
  const exportarExcel = () => {
    if (movimientosFiltrados.length === 0) return;
    const encabezados = ['ID Movimiento', 'Fecha', 'Hora', 'Tipo', 'Almacén', 'Entrada (+)', 'Salida (-)', 'Saldo Local (Almacén)', 'Saldo Global (Empresa)', 'Motivo'];
    const filas = movimientosFiltrados.map(m => {
      const fecha = new Date(m.fechaMovimiento).toLocaleDateString('es-MX');
      const hora = new Date(m.fechaMovimiento).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const entrada = esMovimientoEntrada(m) ? Math.abs(m.cantidad) : 0;
      const salida = !esMovimientoEntrada(m) ? Math.abs(m.cantidad) : 0;
      const motivoEscapado = `"${m.motivo ? m.motivo.replace(/"/g, '""') : ''}"`;
      
      return [m.id, fecha, hora, m.tipo, m.almacen?.nombre || 'General', entrada, salida, m.stockNuevo, m.saldoGlobal, motivoEscapado].join(',');
    });

    const csvContent = "\uFEFF" + [encabezados.join(','), ...filas].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Kardex_Filtrado_${id}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 animate-in fade-in duration-500">
      
      {/* HEADER EMPRESARIAL */}
      <header className="bg-white px-6 py-5 border-b border-slate-200 shadow-sm shrink-0 flex flex-col md:flex-row md:justify-between md:items-center gap-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 leading-tight">Auditoría de Kardex</h1>
            <p className="text-sm font-medium text-slate-500 mt-0.5">Libro mayor de movimientos de inventario</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportarExcel} disabled={movimientosFiltrados.length === 0 || cargando} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95">
            <Download className="w-4 h-4" /> Excel ({movimientosFiltrados.length})
          </button>
          <Link href="/dashboard/productos" className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm">
            <ArrowLeft className="w-4 h-4" /> Volver
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full custom-scrollbar">
        
        {/* BARRA DE FILTROS INTELIGENTES */}
        {!cargando && movimientos.length > 0 && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Buscador libre */}
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Buscar Motivo o Ref.</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Daño, OC #123..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700" />
                </div>
              </div>

              {/* Filtro Almacén */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Almacén</label>
                <div className="relative">
                  <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select value={filtroAlmacen} onChange={(e) => setFiltroAlmacen(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 appearance-none">
                    <option value="">Todos los almacenes</option>
                    {almacenesUnicos.map(alm => <option key={alm as string} value={alm as string}>{alm as string}</option>)}
                  </select>
                </div>
              </div>

              {/* Filtro Fechas */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Desde</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hasta</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                </div>
              </div>
            </div>

            {/* Botón Limpiar */}
            {(busqueda || filtroAlmacen || filtroTipo || fechaInicio || fechaFin) && (
              <button onClick={limpiarFiltros} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors h-[38px] shrink-0">
                <XCircle className="w-4 h-4" /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* KPI CARDS (Dinámicas) */}
        {!cargando && movimientosFiltrados.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-colors">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Entradas Filtradas</p>
                <p className="text-2xl font-black text-slate-800">{totalEntradas}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <ArrowUpRight className="w-6 h-6" />
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-colors">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Salidas Filtradas</p>
                <p className="text-2xl font-black text-slate-800">{totalSalidas}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform">
                <ArrowDownRight className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-md flex items-center justify-between bg-gradient-to-br from-white to-indigo-50/50">
              <div>
                <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Stock Histórico Global</p>
                <p className="text-3xl font-black text-indigo-700">{saldoGlobalActual}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Globe className="w-6 h-6" />
              </div>
            </div>
          </div>
        )}

        {/* TABLA DE MOVIMIENTOS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {cargando ? (
            <div className="p-16 text-center flex flex-col items-center justify-center text-slate-400">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-bold">Calculando saldos históricos...</p>
            </div>
          ) : movimientos.length === 0 ? (
            <div className="p-16 text-center text-slate-500 flex flex-col items-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Package className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-xl font-black text-slate-800 mb-1">Sin historial de movimientos</p>
              <p className="text-sm font-medium text-slate-500">Este producto aún no tiene entradas o salidas registradas en el almacén.</p>
            </div>
          ) : movimientosFiltrados.length === 0 ? (
            <div className="p-16 text-center text-slate-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Filter className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-lg font-black text-slate-700 mb-1">Cero resultados con estos filtros</p>
              <button onClick={limpiarFiltros} className="text-indigo-600 font-bold hover:underline mt-2">Restablecer filtros</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200">
                    <th colSpan={4} className="p-2 border-r border-slate-200 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Información del Documento</th>
                    <th colSpan={2} className="p-2 border-r border-slate-200 text-center text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50/30">Cantidades Físicas</th>
                    <th colSpan={2} className="p-2 border-r border-slate-200 text-center text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-100">Saldos de Inventario</th>
                    <th colSpan={1} className="p-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Referencia</th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider">
                    <th className="px-5 py-4 font-bold border-r border-slate-200">Fecha / Hora</th>
                    <th className="px-5 py-4 font-bold">Tipo</th>
                    <th className="px-5 py-4 font-bold">Concepto</th>
                    <th className="px-5 py-4 font-bold border-r border-slate-200">Almacén</th>
                    
                    <th className="px-5 py-4 font-bold text-center text-emerald-700 bg-emerald-50/30">Entradas</th>
                    <th className="px-5 py-4 font-bold text-center text-rose-700 bg-rose-50/30 border-r border-slate-200">Salidas</th>
                    
                    <th className="px-5 py-4 font-bold text-center text-slate-700 bg-slate-100/50" title="Lo que quedó físicamente en ese almacén">Saldo Local</th>
                    <th className="px-5 py-4 font-bold text-center text-indigo-700 bg-indigo-50/30 border-r border-slate-200" title="La suma total de todos los almacenes">Saldo Global</th>
                    
                    <th className="px-5 py-4 font-bold">Comentarios</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimientosFiltrados.map((m) => {
                    const esEntrada = esMovimientoEntrada(m);
                    const cantidadLimpia = Math.abs(m.cantidad);

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                        <td className="px-5 py-3 border-r border-slate-100">
                          <span className="font-bold text-slate-700 block">{new Date(m.fechaMovimiento).toLocaleDateString('es-MX')}</span>
                          <span className="text-slate-400 text-[11px] font-medium">{new Date(m.fechaMovimiento).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                            esEntrada ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {esEntrada ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-slate-600 font-semibold text-xs">{esEntrada ? 'Ingreso a inventario' : 'Descargo de inventario'}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-600 font-medium flex items-center gap-2 border-r border-slate-100">
                          <Warehouse className="w-4 h-4 text-slate-400" />
                          {m.almacen?.nombre || 'General'}
                        </td>
                        
                        <td className="px-5 py-3 text-center bg-emerald-50/10 font-mono">
                          {esEntrada ? <span className="font-bold text-emerald-600">+{cantidadLimpia}</span> : <span className="text-slate-300">-</span>}
                        </td>
                        
                        <td className="px-5 py-3 text-center bg-rose-50/10 border-r border-slate-100 font-mono">
                          {!esEntrada ? <span className="font-bold text-rose-600">{cantidadLimpia}</span> : <span className="text-slate-300">-</span>}
                        </td>
                        
                        <td className="px-5 py-3 text-center bg-slate-50 font-mono">
                          <span className="font-semibold text-slate-600">{m.stockNuevo}</span>
                        </td>

                        <td className="px-5 py-3 text-center bg-indigo-50/10 border-r border-slate-100 font-mono">
                          <span className="font-black text-indigo-700">{m.saldoGlobal}</span>
                        </td>
                        
                        <td className="px-5 py-3 text-slate-500 italic text-xs max-w-xs truncate" title={m.motivo}>
                          {m.motivo || 'Sin comentarios'}
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
    </div>
  );
}