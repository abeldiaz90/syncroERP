"use client";
/**
 * ============================================================================
 * SyncroERP · Componentes de interfaz
 * ----------------------------------------------------------------------------
 * El proyecto tenía 85 archivos que repetían las mismas clases de Tailwind para
 * botones, tarjetas y tablas, y 19 más con estilos en línea. Estos son los
 * bloques comunes: una sola definición, un solo lugar donde ajustar.
 * ============================================================================
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, Inbox } from 'lucide-react';

/* ── Encabezado de pantalla ──────────────────────────────────────────────── */

export function EncabezadoPantalla({
  titulo, descripcion, acciones, migas,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  migas?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        {migas}
        <h1 className="text-[19px] font-bold text-slate-900 leading-tight truncate">{titulo}</h1>
        {descripcion && <p className="text-[13px] text-slate-500 mt-0.5">{descripcion}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export function Panel({
  titulo, accion, children, sinRelleno = false, className = '',
}: {
  titulo?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
  sinRelleno?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(titulo || accion) && (
        <header className="panel-cabecera">
          {titulo && <h2 className="text-[13px] font-semibold text-slate-900">{titulo}</h2>}
          {accion}
        </header>
      )}
      <div className={sinRelleno ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/* ── Botón ───────────────────────────────────────────────────────────────── */

type Variante = 'primario' | 'neutro' | 'peligro' | 'fantasma';

export function Boton({
  variante = 'neutro', cargando = false, icono, children, className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  cargando?: boolean;
  icono?: React.ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={`btn btn-${variante} ${className}`}
    >
      {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icono}
      {children}
    </button>
  );
}

/* ── Campo ───────────────────────────────────────────────────────────────── */

export function Campo({
  etiqueta, error, requerido, ayuda, children,
}: {
  etiqueta: string;
  error?: string;
  requerido?: boolean;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="etiqueta-campo">
        {etiqueta}
        {requerido && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {error
        ? <p className="mt-1 text-[11px] text-rose-600 font-medium">{error}</p>
        : ayuda && <p className="mt-1 text-[11px] text-slate-400">{ayuda}</p>}
    </div>
  );
}

export const Entrada = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(function Entrada({ error, className = '', ...props }, ref) {
  return <input ref={ref} {...props} className={`campo ${error ? 'campo-error' : ''} ${className}`} />;
});

export const Seleccion = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(function Seleccion({ error, className = '', children, ...props }, ref) {
  return (
    <select ref={ref} {...props} className={`campo ${error ? 'campo-error' : ''} ${className}`}>
      {children}
    </select>
  );
});

/* ── Distintivo ──────────────────────────────────────────────────────────── */

export function Distintivo({
  tono = 'neutro', children,
}: {
  tono?: 'exito' | 'alerta' | 'peligro' | 'info' | 'neutro';
  children: React.ReactNode;
}) {
  return <span className={`distintivo distintivo-${tono}`}>{children}</span>;
}

/* ── Estados de la pantalla ──────────────────────────────────────────────── */

export function Cargando({ filas = 6 }: { filas?: number }) {
  return (
    <div className="p-4 space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="esqueleto h-9" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}

/**
 * Una pantalla vacía es una invitación a actuar, no un mensaje de disculpa.
 */
export function SinDatos({
  titulo, descripcion, accion, icono,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  icono?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
        {icono ?? <Inbox className="w-5 h-5" />}
      </div>
      <p className="text-[14px] font-semibold text-slate-800">{titulo}</p>
      {descripcion && <p className="text-[12.5px] text-slate-500 mt-1 max-w-sm">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function ErrorPantalla({
  mensaje, onReintentar,
}: {
  mensaje: string;
  onReintentar?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center mb-3">
        <XCircle className="w-5 h-5 text-rose-500" />
      </div>
      <p className="text-[14px] font-semibold text-slate-800">No se pudo cargar la información</p>
      <p className="text-[12.5px] text-slate-500 mt-1 max-w-md">{mensaje}</p>
      {onReintentar && (
        <Boton variante="neutro" className="mt-4" onClick={onReintentar}>Reintentar</Boton>
      )}
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function Modal({
  abierto, onCerrar, titulo, descripcion, ancho = 560, pie, children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  ancho?: number;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center p-4 sm:p-8 bg-slate-900/45 backdrop-blur-[2px] overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full my-auto"
        style={{ maxWidth: ancho }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">{titulo}</h2>
            {descripcion && <p className="text-[12.5px] text-slate-500 mt-0.5">{descripcion}</p>}
          </div>
          <button onClick={onCerrar} className="btn btn-fantasma btn-icono btn-sm" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {pie && <footer className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">{pie}</footer>}
      </div>
    </div>
  );
}

/* ── Avisos (toasts) ─────────────────────────────────────────────────────── */

type Tono = 'exito' | 'error' | 'info' | 'alerta';
interface Aviso { id: number; tono: Tono; texto: string; }

const ContextoAvisos = createContext<{
  avisar: (texto: string, tono?: Tono) => void;
}>({ avisar: () => {} });

export function useAvisos() { return useContext(ContextoAvisos); }

const ICONO_TONO: Record<Tono, React.ReactNode> = {
  exito:  <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  error:  <XCircle className="w-4 h-4 text-rose-600" />,
  alerta: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  info:   <Info className="w-4 h-4 text-sky-600" />,
};

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = useCallback((texto: string, tono: Tono = 'info') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, tono, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ContextoAvisos.Provider value={{ avisar }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[400] flex flex-col gap-2 no-imprimir" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-2.5 bg-white border border-slate-200 rounded-lg shadow-lg px-3.5 py-2.5 min-w-[260px] max-w-sm"
          >
            <span className="mt-0.5 shrink-0">{ICONO_TONO[a.tono]}</span>
            <p className="text-[12.5px] text-slate-700 leading-snug">{a.texto}</p>
            <button
              onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}
              className="ml-auto text-slate-300 hover:text-slate-500 shrink-0"
              aria-label="Descartar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

/* ── Confirmación ────────────────────────────────────────────────────────── */

export function Confirmacion({
  abierto, titulo, mensaje, textoConfirmar = 'Confirmar', peligroso = false,
  onConfirmar, onCancelar, procesando = false,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  peligroso?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  procesando?: boolean;
}) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCancelar}
      titulo={titulo}
      ancho={420}
      pie={
        <>
          <Boton variante="neutro" onClick={onCancelar} disabled={procesando}>Cancelar</Boton>
          <Boton
            variante={peligroso ? 'peligro' : 'primario'}
            onClick={onConfirmar}
            cargando={procesando}
          >
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      <p className="text-[13px] text-slate-600 leading-relaxed">{mensaje}</p>
    </Modal>
  );
}

/* ── Tarjeta de indicador ────────────────────────────────────────────────── */

export function Indicador({
  etiqueta, valor, detalle, color = '#4f46e5', cargando = false, icono,
}: {
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  color?: string;
  cargando?: boolean;
  icono?: React.ReactNode;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{etiqueta}</p>
        {icono && <span style={{ color }} className="opacity-70">{icono}</span>}
      </div>
      {cargando
        ? <div className="esqueleto h-7 w-24 mt-2" />
        : <p className="text-[22px] font-bold mt-1.5 leading-none cifra" style={{ color }}>{valor}</p>}
      {detalle && <p className="text-[11.5px] text-slate-400 mt-1.5">{detalle}</p>}
    </div>
  );
}
