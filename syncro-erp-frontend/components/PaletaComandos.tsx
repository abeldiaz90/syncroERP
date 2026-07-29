"use client";
/**
 * ============================================================================
 * SyncroERP · Paleta de comandos (Ctrl/⌘ + K)
 * ----------------------------------------------------------------------------
 * Con 80+ pantallas, ningún menú jerárquico alcanza. Esta es la vía rápida:
 * escribes tres letras y saltas. Sólo lista pantallas que el usuario tiene
 * permiso de ver.
 * ============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { INDICE_PANTALLAS, type EntradaBusqueda } from '@/app/dashboard/module-config';
import { puedeVerEnlace } from '@/lib/session';

/** Coincidencia por subsecuencia: "cocaj" encuentra "Corte de caja". */
function puntuar(texto: string, consulta: string): number {
  const t = texto.toLowerCase();
  const c = consulta.toLowerCase().trim();
  if (!c) return 0;
  if (t.startsWith(c)) return 1000 - t.length;
  const idx = t.indexOf(c);
  if (idx >= 0) return 800 - idx - t.length;

  let ti = 0, aciertos = 0, ultimo = -1, bonus = 0;
  for (const ch of c) {
    const p = t.indexOf(ch, ti);
    if (p === -1) return -1;
    if (ultimo >= 0 && p === ultimo + 1) bonus += 5;
    ultimo = p; ti = p + 1; aciertos++;
  }
  return aciertos * 10 + bonus - t.length;
}

export default function PaletaComandos({
  permisos,
}: {
  permisos: string[] | null;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [cursor, setCursor] = useState(0);
  const entradaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierta((v) => !v);
      }
      if (e.key === 'Escape') setAbierta(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  useEffect(() => {
    if (abierta) {
      setConsulta('');
      setCursor(0);
      setTimeout(() => entradaRef.current?.focus(), 20);
    }
  }, [abierta]);

  const visibles = useMemo(
    () => INDICE_PANTALLAS.filter((p) => puedeVerEnlace(permisos, p.href)),
    [permisos],
  );

  const resultados = useMemo(() => {
    if (!consulta.trim()) return visibles.slice(0, 12);
    return visibles
      .map((p) => ({ p, s: Math.max(puntuar(p.label, consulta), puntuar(p.modulo, consulta) - 200) }))
      .filter((x) => x.s > -1)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.p);
  }, [consulta, visibles]);

  const ir = (p: EntradaBusqueda) => {
    setAbierta(false);
    router.push(p.href);
  };

  if (!abierta) return null;

  return (
    <div
      className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4 no-imprimir"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierta(false); }}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar pantalla"
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center gap-2.5 px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={entradaRef}
            value={consulta}
            onChange={(e) => { setConsulta(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, resultados.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === 'Enter' && resultados[cursor]) { e.preventDefault(); ir(resultados[cursor]); }
            }}
            placeholder="Buscar pantalla…"
            className="flex-1 h-12 bg-transparent outline-none text-[14px] text-slate-800 placeholder:text-slate-400"
          />
          <kbd className="text-[10px] font-semibold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {resultados.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">
              Nada coincide con «{consulta}».
            </p>
          ) : (
            resultados.map((p, i) => (
              <button
                key={p.href}
                onClick={() => ir(p)}
                onMouseEnter={() => setCursor(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === cursor ? 'bg-slate-100' : ''
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-[13px] text-slate-800 font-medium truncate">{p.label}</span>
                <span className="text-[11px] text-slate-400 ml-auto shrink-0">
                  {p.modulo}{p.grupo ? ` · ${p.grupo}` : ''}
                </span>
                {i === cursor && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
          <span><kbd className="font-semibold">↑↓</kbd> moverse</span>
          <span><kbd className="font-semibold">↵</kbd> abrir</span>
          <span className="ml-auto">{visibles.length} pantallas disponibles</span>
        </div>
      </div>
    </div>
  );
}
