"use client";

import { useState, useEffect } from 'react';
import {
  Package, DollarSign, Calendar, TrendingUp, Activity,
  ShoppingCart, AlertTriangle, ArrowUpRight, ArrowRight, Bell, CheckCircle2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IMetricasVentas {
  ventasHoy: number;
  totalHoy: number;
  ticketPromedio: number;
}

export interface IMetricasBase {
  totalProductos: number;
  totalCategorias: number;
}

// ==========================================
// COMPONENTES AUXILIARES
// ==========================================
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0B1121]/95 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]">
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{label}</p>
        <p className="text-white text-xl font-black flex items-center gap-2">
          {payload[0].value} <span className="text-indigo-400 text-xs font-bold uppercase">unidades</span>
        </p>
      </div>
    );
  }
  return null;
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function DashboardHome() {
  const [metricasBase, setMetricasBase] = useState<IMetricasBase>({ totalProductos: 0, totalCategorias: 0 });
  const [metricasVentas, setMetricasVentas] = useState<IMetricasVentas>({ ventasHoy: 0, totalHoy: 0, ticketPromedio: 0 });
  const [topProductos, setTopProductos] = useState<any[]>([]);
  const [stockBajo, setStockBajo] = useState<any[]>([]);
  const [ordenesPendientes, setOrdenesPendientes] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [nombreUsuario, setNombreUsuario] = useState('Usuario');
  const [fechaActual, setFechaActual] = useState('');
  const [saludo, setSaludo] = useState('Bienvenido');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  useEffect(() => {
    const ahora = new Date();
    const opcionesFecha: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setFechaActual(ahora.toLocaleDateString('es-MX', opcionesFecha));

    const hora = ahora.getHours();
    if (hora < 12) setSaludo('Buenos días');
    else if (hora < 19) setSaludo('Buenas tardes');
    else setSaludo('Buenas noches');

    const userString = localStorage.getItem('syncro_user');
    if (userString) {
      try {
        const user = JSON.parse(userString);
        setNombreUsuario(user.nombre || user.nombreCompleto || 'Usuario');
      } catch (e) {
        console.error("Error al parsear usuario:", e);
      }
    }

    const fetchDashboard = async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        // 🔥 EL SALVAVIDAS: Atrapa el 403 o errores de red para que el Dashboard no explote
        const fetchSeguro = (url: string, options: any) =>
          fetch(url, options).catch((err) => {
            console.warn(`Bloqueo o error silencioso en: ${url}`);
            // Retornamos un objeto "falso" para que el código siga fluyendo
            return { ok: false, json: async () => null } as Response;
          });

        // Ahora usamos fetchSeguro en lugar de fetch directo
        const [resMetricasBase, resMetricasVentas, resTop, resStock, resOC] = await Promise.all([
          fetchSeguro(`${apiUrl}/catalogo/productos/dashboard/metricas`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetchSeguro(`${apiUrl}/ventas/dashboard/metricas`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetchSeguro(`${apiUrl}/ventas/dashboard/top-productos?dias=30`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetchSeguro(`${apiUrl}/catalogo/productos/dashboard/stock-bajo`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetchSeguro(`${apiUrl}/compras/ordenes/dashboard/pendientes`, { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        // Procesamos solo las que el backend nos permitió ver (res.ok === true)
        if (resMetricasBase?.ok) setMetricasBase(await resMetricasBase.json());
        if (resMetricasVentas?.ok) setMetricasVentas(await resMetricasVentas.json());
        if (resTop?.ok) setTopProductos(await resTop.json() || []);
        if (resStock?.ok) setStockBajo(await resStock.json() || []);

        if (resOC?.ok) {
          const dataOC = await resOC.json();
          setOrdenesPendientes(dataOC?.pendientes || 0);
        }

      } catch (error) {
        console.error("Error grave al cargar dashboard", error);
      } finally {
        setCargando(false);
      }
    };

    fetchDashboard();
  }, [apiUrl]);

  const chartData = topProductos.map((p: any) => ({
    name: p.nombre?.length > 15 ? p.nombre.substring(0, 15) + '...' : p.nombre,
    cantidad: Number(p.cantidad),
  }));

  return (
    <div className="space-y-8 text-slate-800">

      {/* ================= HEADER / BIENVENIDA ================= */}
      <div className="relative overflow-hidden bg-white rounded-[2rem] shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-[400px] h-[400px] bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex items-center gap-6">
          <div className="hidden md:flex w-20 h-20 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] items-center justify-center text-white font-black text-3xl ring-4 ring-indigo-50">
            {nombreUsuario.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <div className="p-1.5 bg-indigo-50 rounded-md"><Activity className="w-3.5 h-3.5" /></div>
              <span className="text-[10px] font-black tracking-[0.2em] uppercase">Telemetría Activa</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">
              {saludo}, <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">{nombreUsuario}</span>
            </h1>
            <p className="text-slate-500 mt-2 text-sm font-medium max-w-xl leading-relaxed">
              Resumen de operaciones, estado del inventario y rendimiento de ventas sincronizados en tiempo real.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex-shrink-0 bg-slate-50/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-200 shadow-inner flex items-center gap-4">
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mb-0.5">Fecha de Operación</p>
            <p className="text-sm font-bold text-slate-800 capitalize">
              {fechaActual || 'Sincronizando...'}
            </p>
          </div>
        </div>
      </div>

      {/* ================= TARJETAS DE MÉTRICAS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Total Hoy */}
        <div className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-emerald-100/40 border border-slate-200/60 transition-all duration-400 hover:-translate-y-1.5 group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform duration-700 group-hover:scale-125"></div>
          <div className="relative">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3.5 bg-emerald-50/80 text-emerald-600 rounded-2xl ring-1 ring-emerald-100 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
                <DollarSign className="w-6 h-6" />
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
                <TrendingUp className="w-3 h-3" /> Hoy
              </span>
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Ingresos del Día</p>
            {cargando ? (
              <div className="h-10 w-32 bg-slate-100 animate-pulse rounded-xl mt-2"></div>
            ) : (
              <p className="text-3xl font-black text-slate-800 tracking-tight">
                <span className="text-slate-300 text-2xl mr-1 font-medium">$</span>
                {metricasVentas.totalHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>

        {/* Ventas Hoy */}
        <div className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-blue-100/40 border border-slate-200/60 transition-all duration-400 hover:-translate-y-1.5 group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform duration-700 group-hover:scale-125"></div>
          <div className="relative">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3.5 bg-blue-50/80 text-blue-600 rounded-2xl ring-1 ring-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <ShoppingCart className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Tickets Emitidos</p>
            {cargando ? (
              <div className="h-10 w-20 bg-slate-100 animate-pulse rounded-xl mt-2"></div>
            ) : (
              <p className="text-3xl font-black text-slate-800 tracking-tight">
                {metricasVentas.ventasHoy}
              </p>
            )}
          </div>
        </div>

        {/* Productos */}
        <div className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/40 border border-slate-200/60 transition-all duration-400 hover:-translate-y-1.5 group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform duration-700 group-hover:scale-125"></div>
          <div className="relative">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3.5 bg-indigo-50/80 text-indigo-600 rounded-2xl ring-1 ring-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <Package className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Catálogo Activo</p>
            {cargando ? (
              <div className="h-10 w-20 bg-slate-100 animate-pulse rounded-xl mt-2"></div>
            ) : (
              <p className="text-3xl font-black text-slate-800 tracking-tight">
                {metricasBase.totalProductos}
              </p>
            )}
          </div>
        </div>

        {/* OC Pendientes */}
        <div className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-amber-100/40 border border-slate-200/60 transition-all duration-400 hover:-translate-y-1.5 group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform duration-700 group-hover:scale-125"></div>
          <div className="relative">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3.5 bg-amber-50/80 text-amber-600 rounded-2xl ring-1 ring-amber-100 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
                <Bell className="w-6 h-6" />
              </div>
              {ordenesPendientes > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full uppercase tracking-wider animate-pulse border border-amber-200">
                  Requiere Acción
                </span>
              )}
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">OC Pendientes</p>
            {cargando ? (
              <div className="h-10 w-16 bg-slate-100 animate-pulse rounded-xl mt-2"></div>
            ) : (
              <p className="text-3xl font-black text-slate-800 tracking-tight">
                {ordenesPendientes}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* ================= CONTENIDO PRINCIPAL (GRILLA 2/3 + 1/3) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* GRÁFICO TOP PRODUCTOS */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200/60 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shadow-inner"><TrendingUp className="w-5 h-5" /></div>
                Productos Más Vendidos
              </h2>
              <p className="text-sm font-medium text-slate-500 mt-2">Volumen de desplazamiento en los últimos 30 días</p>
            </div>
            <button className="text-sm font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2 transition-all duration-300">
              Reporte Completo <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-[350px] relative z-10 mt-4">
            {cargando ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex items-end gap-4 w-full max-w-md h-48 opacity-20">
                  <div className="w-full bg-indigo-400 h-2/6 rounded-t-xl animate-pulse"></div>
                  <div className="w-full bg-indigo-400 h-4/6 rounded-t-xl animate-pulse delay-75"></div>
                  <div className="w-full bg-indigo-400 h-full rounded-t-xl animate-pulse delay-150"></div>
                  <div className="w-full bg-indigo-400 h-3/6 rounded-t-xl animate-pulse delay-200"></div>
                  <div className="w-full bg-indigo-400 h-1/6 rounded-t-xl animate-pulse delay-300"></div>
                </div>
              </div>
            ) : topProductos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', rx: 10 }} />
                  <Bar dataKey="cantidad" radius={[12, 12, 0, 0]} maxBarSize={45}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="url(#colorVentas)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-bold text-lg text-slate-600">Aún no hay datos suficientes</p>
                <p className="text-sm mt-1 text-slate-400">Las métricas aparecerán al registrar ventas.</p>
              </div>
            )}
          </div>
        </div>

        {/* STOCK BAJO */}
        <div className="lg:col-span-1 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200/60 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600 shadow-inner"><AlertTriangle className="w-5 h-5" /></div>
              Punto de Reorden
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar -mr-2">
            {cargando ? (
              <div className="space-y-4 mt-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-full h-20 bg-slate-50 rounded-2xl animate-pulse border border-slate-100"></div>
                ))}
              </div>
            ) : stockBajo.length > 0 ? (
              <div className="space-y-3 mt-2">
                {stockBajo.map((prod: any) => (
                  <div key={prod.id} className="group flex items-center justify-between p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all shadow-sm hover:shadow-md cursor-default">
                    <div className="pr-4">
                      <p className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{prod.nombre}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mt-1.5 flex items-center gap-1">
                        Min: {prod.stockMinimo}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-rose-50 text-rose-600 border border-rose-100 shadow-sm">
                        {prod.stockActual} <span className="opacity-60 font-black uppercase text-[9px] tracking-wider">PZA</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center pb-10">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-5 ring-8 ring-emerald-50/50">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <p className="font-black text-slate-700 text-xl">Inventario Sano</p>
                <p className="text-sm mt-2 text-slate-500 font-medium">Ningún producto requiere reabastecimiento urgente.</p>
              </div>
            )}
          </div>

          {stockBajo.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <button className="w-full py-3.5 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-xl flex justify-center items-center gap-2 transition-all duration-300 shadow-lg shadow-slate-300 hover:shadow-indigo-200">
                Generar Orden de Compra <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}