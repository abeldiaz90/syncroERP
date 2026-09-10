"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, MapPin, RefreshCw, Search } from 'lucide-react';
import { api, intentar } from '@/lib/api';

interface Stock {
  id?: string;
  cantidad?: number;
  reservado?: number;
  estado?: string;
  producto?: { id?: string; nombre?: string; sku?: string };
  almacen?: { id?: string; nombre?: string };
  ubicacion?: { id?: string; codigo?: string; zona?: string; pasillo?: string; rack?: string; nivel?: string; posicion?: string };
  lote?: { numeroLote?: string; fechaCaducidad?: string };
}

export default function ExistenciasAlmacenes() {
  const [datos, setDatos] = useState<Stock[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    const r = await intentar(api.get<Stock[] | { data?: Stock[] }>('/catalogo/wms/stock-ubicaciones'), [] as Stock[]);
    setDatos(Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
    setCargando(false);
  };
  useEffect(() => { void cargar(); }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return datos;
    return datos.filter((x) => [x.producto?.nombre, x.producto?.sku, x.almacen?.nombre, x.ubicacion?.codigo, x.lote?.numeroLote].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [datos, busqueda]);

  return (
    <div className="p-5 lg:p-8 max-w-[1500px] mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Consulta unificada</p><h1 className="text-xl font-bold text-slate-900 mt-1">Existencias por ubicación y lote</h1><p className="text-[12.5px] text-slate-500 mt-1">Localiza la mercancía y accede a la operación correcta sin cambiar de módulo.</p></div>
        <button onClick={() => void cargar()} className="btn btn-neutro btn-sm" disabled={cargando}><RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />Actualizar</button>
      </header>

      <div className="panel p-3 flex items-center gap-2"><Search className="w-4 h-4 text-slate-400" /><input className="entrada border-0 shadow-none flex-1" placeholder="Producto, SKU, almacén, ubicación o lote…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-4 py-3">Producto</th><th className="text-left px-4 py-3">Almacén</th><th className="text-left px-4 py-3">Ubicación</th><th className="text-left px-4 py-3">Lote</th><th className="text-right px-4 py-3">Físico</th><th className="text-right px-4 py-3">Reservado</th><th className="text-right px-4 py-3">Disponible</th><th className="px-4 py-3">Acciones</th></tr></thead>
            <tbody>
              {filtrados.map((x, i) => {
                const fisico=Number(x.cantidad ?? 0), reservado=Number(x.reservado ?? 0);
                return <tr key={x.id ?? i} className="border-t border-slate-100">
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{x.producto?.nombre ?? '—'}</p><p className="text-[10.5px] text-slate-400">{x.producto?.sku ?? ''}</p></td>
                  <td className="px-4 py-3">{x.almacen?.nombre ?? '—'}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-600" />{x.ubicacion?.codigo ?? 'Sin ubicación'}</span></td>
                  <td className="px-4 py-3">{x.lote?.numeroLote ?? '—'}</td><td className="px-4 py-3 text-right font-semibold">{fisico}</td><td className="px-4 py-3 text-right">{reservado}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{Math.max(0,fisico-reservado)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Link href="/dashboard/inventario/reubicaciones" className="btn btn-neutro btn-xs">Reubicar</Link><Link href="/dashboard/inventario/transferencias" className="btn btn-neutro btn-xs">Transferir</Link>{x.producto?.id && <Link href={`/dashboard/productos/${x.producto.id}`} className="btn btn-fantasma btn-xs"><ArrowRight className="w-3 h-3" /></Link>}</div></td>
                </tr>;
              })}
              {!cargando && filtrados.length===0 && <tr><td colSpan={8} className="py-16 text-center text-slate-500"><Boxes className="w-8 h-8 mx-auto mb-2 text-slate-300" />No hay existencias localizadas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
