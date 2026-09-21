'use client';

import { useCallback, useEffect, useState } from 'react';
import { IdCard, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';

/**
 * ============================================================================
 * Identificaciones del expediente
 * ----------------------------------------------------------------------------
 * Sólo existe sobre un cliente ya guardado. Capturar documentos de alguien que
 * todavía no tiene expediente obligaría a sostenerlos en memoria y a escribirlos
 * después del alta, con el caso de «se guardó el cliente pero no sus
 * documentos» esperando a que falle la segunda llamada. Se dice y se espera.
 *
 * El RFC y la CURP NO se capturan aquí: viven en la pestaña de identidad porque
 * son claves fiscales, una por persona, que medio sistema lee. Esta pantalla es
 * para lo que sí es un documento —tiene folio, puede vencer, y una persona puede
 * tener varios—.
 * ============================================================================
 */

const TIPOS: Array<{ id: string; txt: string; soloMoral?: boolean; soloFisica?: boolean }> = [
  { id: 'INE', txt: 'Credencial para votar (INE)', soloFisica: true },
  { id: 'PASAPORTE', txt: 'Pasaporte', soloFisica: true },
  { id: 'CEDULA_PROFESIONAL', txt: 'Cédula profesional', soloFisica: true },
  { id: 'LICENCIA_CONDUCIR', txt: 'Licencia de conducir', soloFisica: true },
  { id: 'COMPROBANTE_DOMICILIO', txt: 'Comprobante de domicilio' },
  { id: 'ACTA_CONSTITUTIVA', txt: 'Acta constitutiva', soloMoral: true },
  { id: 'PODER_NOTARIAL', txt: 'Poder notarial', soloMoral: true },
  { id: 'OTRO', txt: 'Otro documento' },
];

interface Identificacion {
  id: string;
  tipo: string;
  folio: string;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  emisor?: string | null;
  notas?: string | null;
  activo: boolean;
  vencida?: boolean;
}

const etiqueta = (tipo: string) => TIPOS.find(t => t.id === tipo)?.txt ?? tipo;
const soloFecha = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export default function IdentificacionesCliente({
  clienteId,
  tipoPersona,
  api,
  heads,
}: {
  clienteId: string | null;
  tipoPersona: 'FISICA' | 'MORAL';
  api: string;
  heads: () => Record<string, string>;
}) {
  const [filas, setFilas] = useState<Identificacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({
    tipo: '',
    folio: '',
    vigenciaDesde: '',
    vigenciaHasta: '',
    emisor: '',
  });

  const disponibles = TIPOS.filter(t =>
    tipoPersona === 'MORAL' ? !t.soloFisica : !t.soloMoral,
  );

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`${api}/clientes/${clienteId}/identificaciones`, { headers: heads() });
      if (!r.ok) throw new Error('No fue posible leer las identificaciones.');
      setFilas(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer las identificaciones.');
    } finally {
      setCargando(false);
    }
  }, [clienteId, api, heads]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    if (!clienteId) return;
    setError('');
    if (!form.tipo) return setError('Elige el tipo de documento.');
    if (form.folio.trim().length < 3) return setError('Captura el folio del documento.');
    if (form.vigenciaDesde && form.vigenciaHasta && form.vigenciaHasta < form.vigenciaDesde) {
      return setError('La vigencia no puede terminar antes de empezar.');
    }
    setGuardando(true);
    try {
      const r = await fetch(`${api}/clientes/${clienteId}/identificaciones`, {
        method: 'POST',
        headers: { ...heads(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          folio: form.folio.trim(),
          vigenciaDesde: form.vigenciaDesde || undefined,
          vigenciaHasta: form.vigenciaHasta || undefined,
          emisor: form.emisor.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message ?? 'No fue posible guardar el documento.');
      setForm({ tipo: '', folio: '', vigenciaDesde: '', vigenciaHasta: '', emisor: '' });
      setAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar el documento.');
    } finally {
      setGuardando(false);
    }
  }

  async function retirar(id: string) {
    if (!clienteId) return;
    setError('');
    try {
      const r = await fetch(`${api}/clientes/${clienteId}/identificaciones/${id}`, {
        method: 'DELETE',
        headers: heads(),
      });
      if (!r.ok) throw new Error('No fue posible retirar el documento.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible retirar el documento.');
    }
  }

  if (!clienteId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <IdCard className="mx-auto mb-2 h-6 w-6 text-slate-400" />
        <p className="text-[13px] font-semibold text-slate-700">
          Guarda el cliente para capturar sus documentos
        </p>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Las identificaciones cuelgan del expediente. Guardando primero, un documento no se
          puede perder porque falle la segunda operación.
        </p>
      </div>
    );
  }

  const activas = filas.filter(f => f.activo);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
          {error}
        </div>
      )}

      {cargando && !filas.length ? (
        <p className="text-[12.5px] text-slate-500">Consultando documentos…</p>
      ) : activas.length === 0 ? (
        <p className="text-[12.5px] text-slate-500">
          Sin documentos capturados. El RFC y la CURP se registran en la pestaña de identidad.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {activas.map(f => (
            <li key={f.id} className="flex items-start gap-3 px-3.5 py-2.5">
              <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-800">{etiqueta(f.tipo)}</p>
                <p className="font-mono text-[12.5px] text-slate-600">{f.folio}</p>
                {(f.vigenciaHasta || f.emisor) && (
                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    {f.emisor ? `${f.emisor}` : ''}
                    {f.emisor && f.vigenciaHasta ? ' · ' : ''}
                    {f.vigenciaHasta ? `vence ${soloFecha(f.vigenciaHasta)}` : ''}
                  </p>
                )}
              </div>
              {f.vencida ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  <AlertTriangle className="h-3 w-3" /> Vencida
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3 w-3" /> Vigente
                </span>
              )}
              <button
                type="button"
                onClick={() => void retirar(f.id)}
                title="Retirar del expediente"
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Tipo de documento
              </span>
              <select
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
              >
                <option value="">— Elige el tipo —</option>
                {disponibles.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.txt}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Folio o número
              </span>
              <input
                value={form.folio}
                onChange={e => setForm({ ...form, folio: e.target.value })}
                placeholder="Como aparece en el documento"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Vigencia desde
              </span>
              <input
                type="date"
                value={form.vigenciaDesde}
                onChange={e => setForm({ ...form, vigenciaDesde: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Vigencia hasta
              </span>
              <input
                type="date"
                value={form.vigenciaHasta}
                onChange={e => setForm({ ...form, vigenciaHasta: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Emisor <span className="font-medium normal-case text-slate-400">(opcional)</span>
              </span>
              <input
                value={form.emisor}
                onChange={e => setForm({ ...form, emisor: e.target.value })}
                placeholder="Notaría, dependencia o entidad que lo expidió"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setError('');
              }}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={() => void guardar()}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Agregar al expediente'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar documento
        </button>
      )}

      <p className="text-[11.5px] leading-relaxed text-slate-500">
        Retirar un documento lo desactiva, no lo borra: una identificación que estuvo en el
        expediente cuando se autorizó un crédito es parte de por qué se autorizó.
      </p>
    </div>
  );
}
