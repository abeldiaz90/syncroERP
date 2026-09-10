"use client";

import { ReactNode, useId } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type Props = {
  label: string;
  children: ReactNode;
  required?: boolean;
  error?: string;
  touched?: boolean;
  hint?: string;
  valid?: boolean;
};

export function CampoValidado({ label, children, required, error, touched, hint, valid }: Props) {
  const id = useId();
  const mostrarError = Boolean(touched && error);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}{required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
      </label>
      <div className={mostrarError ? "rounded-xl ring-2 ring-rose-200" : ""}>{children}</div>
      <div className="min-h-5" aria-live="polite">
        {mostrarError ? (
          <p className="flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertCircle size={14}/>{error}</p>
        ) : valid ? (
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14}/>Dato válido</p>
        ) : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
