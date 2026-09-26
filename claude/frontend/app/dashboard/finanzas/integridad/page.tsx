'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

type Hallazgo = {
  codigo: string;
  modulo: string;
  severidad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO';
  // Una comprobación que no se pudo ejecutar no es una comprobación limpia:
  // llega marcada aparte para que la pantalla no la presente como un visto bueno.
  estado: 'CON_HALLAZGOS' | 'LIMPIA' | 'NO_MEDIBLE';
  cantidad: number;
  descripcion: string;
  accion: string;
  detalle?: string;
};
type Diagnostico = {
  generadoEn: string;
  estado: 'BLOQUEADO' | 'CON_ALERTAS' | 'INCOMPLETO' | 'SALUDABLE';
  resumen: {
    criticos: number;
    altos: number;
    hallazgosActivos: number;
    noMedibles: number;
  };
  hallazgos: Hallazgo[];
  comprobaciones: number;
};

export default function IntegridadFinancieraPage() {
  const [data, setData] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setData(await api.get<Diagnostico>('/finanzas/integridad/diagnostico'));
    } catch (e) {
      setError(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo generar el diagnóstico.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  const color = useMemo(
    () =>
      data?.estado === 'SALUDABLE'
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : data?.estado === 'CON_ALERTAS' || data?.estado === 'INCOMPLETO'
          ? 'text-amber-700 bg-amber-50 border-amber-200'
          : 'text-red-700 bg-red-50 border-red-200',
    [data],
  );
  const leyenda = useMemo(
    () =>
      data?.estado === 'INCOMPLETO'
        ? `No se detectaron descuadres, pero ${data.resumen.noMedibles} de las ${data.comprobaciones} comprobaciones no pudieron ejecutarse. El resultado está incompleto.`
        : '',
    [data],
  );

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Control transversal</p>
          <h1 className="text-3xl font-bold text-slate-900">Integridad financiera</h1>
          <p className="mt-1 text-slate-600">Detecta operaciones cerradas sin póliza, saldos incoherentes y procesos fiscales o bancarios pendientes.</p>
        </div>
        <button onClick={() => void cargar()} disabled={cargando} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          <RefreshCw size={17} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {data && (
        <>
          <section className={`rounded-2xl border p-5 ${color}`}>
            <div className="flex items-center gap-3">
              {data.estado === 'SALUDABLE' ? <ShieldCheck size={30} /> : <AlertTriangle size={30} />}
              <div><p className="text-sm font-semibold">Estado del control</p><p className="text-2xl font-bold">{data.estado.replace('_', ' ')}</p>{leyenda && <p className="mt-1 text-sm font-normal">{leyenda}</p>}</div>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              ['Comprobaciones', data.comprobaciones],
              ['Hallazgos activos', data.resumen.hallazgosActivos],
              ['Registros críticos', data.resumen.criticos],
              ['Registros altos', data.resumen.altos],
              ['Sin poder medir', data.resumen.noMedibles],
            ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold text-slate-900">{value}</p></article>)}
          </section>
          <section className="space-y-3">
            {data.hallazgos.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800"><CheckCircle2 /> Las {data.comprobaciones} comprobaciones corrieron y ninguna encontró descuadres.</div>
            ) : data.hallazgos.map((h) => (
              <article key={h.codigo} className={`rounded-2xl border bg-white p-5 shadow-sm ${h.estado === 'NO_MEDIBLE' ? 'border-dashed border-slate-300' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{h.modulo} · {h.codigo}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{h.descripcion}</h2></div>
                  {h.estado === 'NO_MEDIBLE' ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">No se pudo medir</span>
                  ) : (
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${h.severidad === 'CRITICA' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{h.severidad}: {h.cantidad}</span>
                  )}
                </div>
                {h.detalle && <p className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-600">{h.detalle}</p>}
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>Acción:</strong> {h.accion}</p>
              </article>
            ))}
          </section>
          <p className="text-xs text-slate-500">Generado: {new Date(data.generadoEn).toLocaleString('es-MX')}</p>
        </>
      )}
    </main>
  );
}
