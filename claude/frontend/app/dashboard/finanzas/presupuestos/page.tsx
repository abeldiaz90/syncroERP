"use client";
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Target } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

/*
 * ============================================================================
 * Presupuestos · y el comparativo contra el real
 * ----------------------------------------------------------------------------
 * Dos cosas que esta pantalla dice y que el usuario no puede adivinar:
 *
 *  · **Aprobar congela.** A partir de ahí no se edita, porque un presupuesto
 *    que se ajusta al real no tiene desviaciones nunca. La salida cuando las
 *    cifras cambian es crear una revisión, y eso se dice ANTES de aprobar, no
 *    en el error que sale después.
 *
 *  · **Lo ejercido sin presupuestar se cuenta aparte.** No es una desviación:
 *    es un plan incompleto, y se lee distinto.
 * ============================================================================
 */

interface IPresupuesto {
  id: string;
  ejercicio: number;
  nombre: string;
  estado: 'BORRADOR' | 'APROBADO' | 'CERRADO';
  notas: string | null;
}
interface IRenglon {
  cuentaContableId: string;
  numeroCuenta: string | null;
  cuenta: string | null;
  tipo: string | null;
  centro: string | null;
  presupuesto: number;
  real: number;
  diferencia: number;
  favorable: boolean;
  porcentajeEjercido: number | null;
}
interface IComparativo {
  presupuesto: { nombre: string; ejercicio: number; estado: string };
  periodo: { mesDesde: number; mesHasta: number };
  renglones: IRenglon[];
  totales: Record<string, { presupuesto: number; real: number }>;
  sinPresupuesto: number;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function PresupuestosPage() {
  const [lista, setLista] = useState<IPresupuesto[]>([]);
  const [elegido, setElegido] = useState<string>('');
  const [comparativo, setComparativo] = useState<IComparativo | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mesDesde, setMesDesde] = useState(1);
  const [mesHasta, setMesHasta] = useState(new Date().getMonth() + 1);
  const [form, setForm] = useState({ ejercicio: new Date().getFullYear(), nombre: '' });

  const consultarLista = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await api.get<IPresupuesto[]>('/finanzas/presupuestos');
      setLista(datos);
      setError('');
      if (!elegido && datos.length) setElegido(datos[0].id);
    } catch (e) {
      setLista([]);
      setError(
        e instanceof ApiError && e.status === 403
          ? 'Tu perfil no incluye los presupuestos.'
          : 'No se pudo consultar la lista de presupuestos.',
      );
    } finally {
      setCargando(false);
    }
  }, [elegido]);

  const consultarComparativo = useCallback(
    async (id: string, d = mesDesde, h = mesHasta) => {
      if (!id) return;
      try {
        setComparativo(
          await api.get<IComparativo>(`/finanzas/presupuestos/${id}/comparativo`, {
            query: { mesDesde: String(d), mesHasta: String(h) },
          }),
        );
        setError('');
      } catch (e) {
        /* Se vacía: una tabla vieja bajo un período nuevo se lee como la verdad. */
        setComparativo(null);
        setError(e instanceof ApiError ? e.message : 'No se pudo consultar el comparativo.');
      }
    },
    [mesDesde, mesHasta],
  );

  useEffect(() => {
    consultarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (elegido) consultarComparativo(elegido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido]);

  const crear = async () => {
    try {
      const nuevo = await api.post<IPresupuesto>('/finanzas/presupuestos', form);
      setForm({ ...form, nombre: '' });
      await consultarLista();
      setElegido(nuevo.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el presupuesto.');
    }
  };

  const aprobar = async (id: string) => {
    try {
      await api.post(`/finanzas/presupuestos/${id}/aprobar`);
      await consultarLista();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo aprobar.');
    }
  };

  const actual = lista.find((p) => p.id === elegido);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center gap-3">
        <Target className="h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Presupuestos</h1>
          <p className="text-sm text-slate-500">
            La segunda cifra. Un reporte por centro dice cuánto se gastó; esto dice
            si estaba previsto.
          </p>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-600">
          Ejercicio
          <input
            type="number"
            value={form.ejercicio}
            onChange={(e) => setForm({ ...form, ejercicio: Number(e.target.value) })}
            className="ml-2 w-24 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <input
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Nombre — «Original 2027», «Revisión de junio»"
          className="min-w-64 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        />
        <button
          onClick={crear}
          disabled={!form.nombre.trim()}
          className="flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Nuevo presupuesto
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          <option value="">Elige un presupuesto</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ejercicio} · {p.nombre} ({p.estado})
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">de</span>
        <select
          value={mesDesde}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMesDesde(v);
            consultarComparativo(elegido, v, mesHasta);
          }}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">a</span>
        <select
          value={mesHasta}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMesHasta(v);
            consultarComparativo(elegido, mesDesde, v);
          }}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        {actual?.estado === 'BORRADOR' && (
          <button
            onClick={() => aprobar(actual.id)}
            title="Aprobar lo congela: a partir de ahí no se edita, porque un presupuesto que se ajusta al real no tiene desviaciones nunca. Si las cifras cambian, se crea una revisión."
            className="ml-auto flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4" /> Aprobar — después ya no se edita
          </button>
        )}
      </div>

      {comparativo && comparativo.sinPresupuesto > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {comparativo.sinPresupuesto} cuenta(s) con gasto ejercido y sin presupuesto.
          Eso no es una desviación: es que el plan no las contempló.
        </div>
      )}

      {comparativo && (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 font-medium">Centro</th>
                <th className="px-4 py-2 text-right font-medium">Presupuesto</th>
                <th className="px-4 py-2 text-right font-medium">Real</th>
                <th className="px-4 py-2 text-right font-medium">Diferencia</th>
                <th className="px-4 py-2 text-right font-medium">Ejercido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparativo.renglones.map((r) => (
                <tr key={`${r.cuentaContableId}-${r.centro}`}>
                  <td className="px-4 py-2">
                    <span className="mr-2 font-mono text-xs text-slate-500">
                      {r.numeroCuenta}
                    </span>
                    {r.cuenta}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{r.centro ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{fmt$(r.presupuesto)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(r.real)}</td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${
                      r.favorable ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {fmt$(r.diferencia)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {r.porcentajeEjercido === null ? '—' : `${r.porcentajeEjercido}%`}
                  </td>
                </tr>
              ))}
              {comparativo.renglones.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Sin movimientos ni presupuesto en el período elegido.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && lista.length === 0 && !error && (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Todavía no hay presupuestos. Crea uno arriba, captura sus líneas por cuenta,
          centro y mes, y apruébalo cuando esté listo.
        </div>
      )}
    </div>
  );
}
