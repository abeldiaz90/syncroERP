'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

type Pendiente = {
  codigo: string;
  modulo: string;
  titulo: string;
  cantidad: number;
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  responsable: string;
  accion: string;
  ruta: string;
};

type Respuesta = { total: number; altaPrioridad: number; pendientes: Pendiente[]; noVerificados: string[]; fecha: string };

export default function OperacionesPendientesPage() {
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true); setError('');
    try { setData(await api.get<Respuesta>('/configuracion/pendientes')); }
    catch (e: any) { setError(e?.message || 'No fue posible consultar las operaciones pendientes.'); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Operaciones pendientes</h1><p className="text-sm text-slate-500">Qué está pendiente, quién debe actuar y cuál es el siguiente paso.</p></div>
      <button onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={16}/>Actualizar</button>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    {cargando && <div className="rounded-xl border p-8 text-center text-slate-500">Consultando pendientes…</div>}
    {!cargando && data && <>
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi titulo="Pendientes" valor={data.total} icono={<ClipboardList/>}/>
        <Kpi titulo="Alta prioridad" valor={data.altaPrioridad} icono={<AlertTriangle/>}/>
        <Kpi titulo="No verificadas" valor={data.noVerificados.length} icono={<AlertTriangle/>}/>
      </div>
      {data.pendientes.length === 0 ? <div className="rounded-xl border bg-white p-10 text-center"><CheckCircle2 className="mx-auto mb-3 text-emerald-600"/><div className="font-medium">No hay operaciones pendientes detectadas</div></div> :
      <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Prioridad</th><th className="p-3">Módulo</th><th className="p-3">Pendiente</th><th className="p-3">Responsable</th><th className="p-3">Siguiente acción</th></tr></thead><tbody>{data.pendientes.map(p=><tr key={p.codigo} className="border-t"><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${p.prioridad==='ALTA'?'bg-red-100 text-red-700':p.prioridad==='MEDIA'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{p.prioridad}</span></td><td className="p-3">{p.modulo}</td><td className="p-3"><div className="font-medium">{p.titulo}</div><div className="text-slate-500">{p.cantidad} registro(s)</div></td><td className="p-3">{p.responsable}</td><td className="p-3"><Link href={p.ruta} className="font-medium text-indigo-600 hover:underline">{p.accion}</Link></td></tr>)}</tbody></table></div>}
      {data.noVerificados.length>0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No fue posible verificar: {data.noVerificados.join(', ')}. Ejecuta la verificación de esquema.</div>}
    </>}
  </div>;
}

function Kpi({titulo,valor,icono}:{titulo:string;valor:number;icono:ReactNode}) { return <div className="rounded-xl border bg-white p-4"><div className="flex items-center justify-between text-slate-500"><span>{titulo}</span>{icono}</div><div className="mt-2 text-3xl font-semibold">{valor}</div></div> }
