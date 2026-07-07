// app/components/ConfirmDialog.tsx
"use client";
import { AlertTriangle, X, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  /** Texto del botón de confirmación (default: "Confirmar") */
  textoConfirmar?: string;
  /** Texto del botón de cancelar (default: "Cancelar") */
  textoCancelar?: string;
  /** Estilo del botón de confirmar */
  variante?: 'indigo' | 'rose' | 'emerald';
  /** Muestra spinner y bloquea botones mientras procesa */
  procesando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const VARIANTES = {
  indigo: {
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  rose: {
    btn: 'bg-rose-600 hover:bg-rose-700',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  emerald: {
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
};

export default function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  variante = 'indigo',
  procesando = false,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  if (!abierto) return null;
  const v = VARIANTES[variante];

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-150"
      onClick={() => !procesando && onCancelar()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${v.iconBg}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">{titulo}</h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{mensaje}</p>
            </div>
            <button
              onClick={() => !procesando && onCancelar()}
              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onCancelar}
            disabled={procesando}
            className="px-5 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {textoCancelar}
          </button>
          <button
            onClick={onConfirmar}
            disabled={procesando}
            className={`px-5 py-2 text-white font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60 ${v.btn}`}
          >
            {procesando && <Loader2 className="w-4 h-4 animate-spin" />}
            {procesando ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
