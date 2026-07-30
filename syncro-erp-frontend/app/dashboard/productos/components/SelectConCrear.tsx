// app/components/SelectConCrear.tsx
"use client";
import { useState } from 'react';
import { Plus, X, Loader2, Check } from 'lucide-react';

interface Opcion { id: string; nombre: string; [k: string]: any; }

interface CampoExtra {
  key: string;
  label: string;
  placeholder?: string;
  maxLength?: number;
  transform?: (v: string) => string; // ej. mayúsculas
}

interface Props {
  /** Etiqueta del campo (ej. "Marca") */
  label: string;
  /** Valor seleccionado (id) */
  value: string;
  /** Opciones actuales del dropdown */
  opciones: Opcion[];
  /** Texto de la opción vacía (ej. "— Sin marca —") */
  textoVacio?: string;
  /** name del select, para el onChange del formulario padre */
  name: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Endpoint POST para crear (ej. `${api}/catalogo/marcas`) */
  endpointCrear: string;
  /** Token bearer */
  token: string;
  /**
   * Se llama tras crear con éxito. Recibe el nuevo registro creado
   * (tal cual lo devuelve el backend). El padre debe:
   *  1) agregarlo a su lista de opciones
   *  2) (opcional) refrescar desde el backend
   */
  onCreado: (nuevo: Opcion) => void;
  /** Campos del mini-formulario. Por defecto solo "nombre". */
  campos?: CampoExtra[];
  /** Clase CSS del select para que combine con tu formulario */
  className?: string;
  disabled?: boolean;
  /** Título del mini-modal (ej. "Nueva marca") */
  tituloModal?: string;
}

export default function SelectConCrear({
  label, value, opciones, textoVacio = '— Seleccionar —',
  name, onChange, endpointCrear, token, onCreado,
  campos = [{ key: 'nombre', label: 'Nombre' }],
  className = '', disabled = false, tituloModal,
}: Props) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const abrir = () => {
    setForm({});
    setError('');
    setModal(true);
  };

  const guardar = async () => {
    const nombreCampo = campos[0].key;
    if (!form[nombreCampo]?.trim()) {
      setError(`${campos[0].label} es obligatorio`);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const payload: Record<string, string> = {};
      campos.forEach((c) => {
        const val = form[c.key]?.trim();
        if (val) payload[c.key] = val;
      });

      const res = await fetch(endpointCrear, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => null);

      if (!res.ok) {
        const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
        throw new Error(m || `Error al crear (HTTP ${res.status})`);
      }

      // Notifica al padre y selecciona el nuevo automáticamente
      onCreado(d);
      onChange({
        target: { name, value: d.id },
      } as React.ChangeEvent<HTMLSelectElement>);
      setModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    }
    setGuardando(false);
  };

  return (
    <>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <select
          name={name}
          value={value || ''}
          onChange={onChange}
          disabled={disabled}
          className={className || 'flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm'}
        >
          <option value="">{textoVacio}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
        {!disabled && (
          <button
            type="button"
            onClick={abrir}
            title={`Crear ${label.toLowerCase()}`}
            className="shrink-0 w-10 flex items-center justify-center bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mini-modal de creación rápida */}
      {modal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          onClick={() => !guardando && setModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-500" />
                {tituloModal || `Nueva ${label.toLowerCase()}`}
              </h3>
              <button
                onClick={() => !guardando && setModal(false)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}
              {campos.map((c) => (
                <div key={c.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{c.label}</label>
                  <input
                    type="text"
                    value={form[c.key] ?? ''}
                    maxLength={c.maxLength}
                    onChange={(e) => {
                      const v = c.transform ? c.transform(e.target.value) : e.target.value;
                      setForm((f) => ({ ...f, [c.key]: v }));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }}
                    placeholder={c.placeholder}
                    autoFocus={c === campos[0]}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setModal(false)}
                disabled={guardando}
                className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {guardando ? 'Creando…' : 'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
