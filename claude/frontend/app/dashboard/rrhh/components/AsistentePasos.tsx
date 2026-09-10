'use client';

import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, X } from 'lucide-react';

export type PasoAsistente = {
  id: string;
  titulo: string;
  descripcion: string;
  icono?: ReactNode;
  completo?: boolean;
  error?: boolean;
};

export function AsistentePasos({
  abierto,
  titulo,
  descripcion,
  pasos,
  pasoActual,
  children,
  procesando = false,
  textoFinal = 'Finalizar',
  puedeContinuar = true,
  onCambiarPaso,
  onCerrar,
  onFinalizar,
}: {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  pasos: PasoAsistente[];
  pasoActual: number;
  children: ReactNode;
  procesando?: boolean;
  textoFinal?: string;
  puedeContinuar?: boolean;
  onCambiarPaso: (paso: number) => void;
  onCerrar: () => void;
  onFinalizar: () => void;
}) {
  if (!abierto) return null;
  const ultimo = pasoActual === pasos.length - 1;
  const progreso = Math.round(((pasoActual + 1) / pasos.length) * 100);

  return (
    <div className="fixed inset-0 z-[350] flex bg-slate-950/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="m-auto flex h-[min(880px,94vh)] w-[min(1180px,96vw)] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <aside className="hidden w-[292px] shrink-0 flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 p-6 text-white md:flex">
          <div className="mb-8">
            <div className="mb-3 inline-flex rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-200">SyncroERP · RH</div>
            <h2 className="text-xl font-bold leading-tight">{titulo}</h2>
            {descripcion && <p className="mt-2 text-xs leading-relaxed text-slate-300">{descripcion}</p>}
          </div>

          <nav className="space-y-1.5" aria-label="Pasos del asistente">
            {pasos.map((paso, indice) => {
              const activo = indice === pasoActual;
              const terminado = indice < pasoActual || paso.completo;
              return (
                <button
                  type="button"
                  key={paso.id}
                  onClick={() => indice <= pasoActual && onCambiarPaso(indice)}
                  className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${activo ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/5'} ${indice > pasoActual ? 'cursor-default opacity-60' : ''}`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${activo ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : terminado ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300' : paso.error ? 'border-rose-400/40 text-rose-300' : 'border-white/15'}`}>
                    {terminado ? <Check className="h-3.5 w-3.5" /> : paso.error ? <CircleAlert className="h-3.5 w-3.5" /> : indice + 1}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold">{paso.titulo}</span>
                    <span className={`mt-0.5 block text-[11px] leading-snug ${activo ? 'text-slate-500' : 'text-slate-400'}`}>{paso.descripcion}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex justify-between text-[11px] text-slate-300"><span>Avance</span><b>{progreso}%</b></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${progreso}%` }} /></div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Puedes regresar a los pasos anteriores sin perder la información capturada.</p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-7">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-indigo-600">Paso {pasoActual + 1} de {pasos.length}</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{pasos[pasoActual]?.titulo}</h3>
              <p className="text-xs text-slate-500">{pasos[pasoActual]?.descripcion}</p>
            </div>
            <button type="button" onClick={onCerrar} className="btn btn-fantasma btn-icono" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </header>

          <div className="h-1 bg-slate-100 md:hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progreso}%` }} /></div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/55 p-5 md:p-7">{children}</div>

          <footer className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-4 md:px-7">
            <button type="button" className="btn btn-neutro" disabled={pasoActual === 0 || procesando} onClick={() => onCambiarPaso(pasoActual - 1)}><ChevronLeft className="h-4 w-4" />Anterior</button>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-fantasma" disabled={procesando} onClick={onCerrar}>Guardar y salir</button>
              {ultimo ? (
                <button type="button" className="btn btn-primario min-w-32" disabled={!puedeContinuar || procesando} onClick={onFinalizar}>{procesando ? 'Guardando…' : textoFinal}</button>
              ) : (
                <button type="button" className="btn btn-primario" disabled={!puedeContinuar || procesando} onClick={() => onCambiarPaso(pasoActual + 1)}>Continuar<ChevronRight className="h-4 w-4" /></button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function TarjetaOpcion({
  titulo, descripcion, icono, activo, onClick,
}: { titulo: string; descripcion: string; icono: ReactNode; activo?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`group flex min-h-28 w-full items-start gap-4 rounded-xl border p-4 text-left transition ${activo ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activo ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>{icono}</span>
      <span><b className="block text-sm text-slate-900">{titulo}</b><span className="mt-1 block text-xs leading-relaxed text-slate-500">{descripcion}</span></span>
    </button>
  );
}
