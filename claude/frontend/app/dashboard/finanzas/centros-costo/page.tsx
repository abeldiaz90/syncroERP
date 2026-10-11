"use client";
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Building2, Plus, Power } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

/*
 * ============================================================================
 * Centros de costo
 * ----------------------------------------------------------------------------
 * El catálogo de la dimensión que le faltaba al mayor. Dos cosas que esta
 * pantalla dice en voz alta porque el usuario no puede adivinarlas:
 *
 *  · **Dar de alta el primero cambia la captura de pólizas.** A partir de ahí,
 *    toda partida manual de una cuenta de resultado tiene que decir su centro.
 *    No hay interruptor en ninguna parte: el catálogo ES el interruptor, igual
 *    que las posiciones de almacén. Si no se avisa aquí, la primera negativa
 *    aparece en otra pantalla y parece un error.
 *
 *  · **Un centro con hijos deja de aceptar movimientos**, y lo hace solo. Su
 *    saldo es la suma de ellos; recibir movimientos propios descuadraría el
 *    reporte contra el total.
 * ============================================================================
 */

interface ICentro {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  padreId: string | null;
  aceptaMovimientos: boolean;
  activo: boolean;
  oficinaExternaId: string | null;
  nivel?: number;
}

const TIPOS = ['DEPARTAMENTO', 'SUCURSAL', 'PROYECTO', 'LINEA_NEGOCIO', 'OTRO'];
const vacio = {
  codigo: '',
  nombre: '',
  tipo: 'DEPARTAMENTO',
  padreId: '',
  oficinaExternaId: '',
};

export default function CentrosCostoPage() {
  const [centros, setCentros] = useState<ICentro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [form, setForm] = useState({ ...vacio });
  const [guardando, setGuardando] = useState(false);

  const consultar = useCallback(
    async (inactivos = verInactivos) => {
      setCargando(true);
      try {
        setCentros(
          await api.get<ICentro[]>('/finanzas/centros-costo', {
            query: inactivos ? { incluirInactivos: 'true' } : {},
          }),
        );
        setError('');
      } catch (e) {
        /* La lista se vacía al fallar: una tabla vacía con un aviso se lee
         * como «no pude consultar»; una tabla vieja se lee como la verdad. */
        setCentros([]);
        setError(
          e instanceof ApiError && e.status === 403
            ? 'Tu perfil no incluye el catálogo de centros de costo.'
            : 'No se pudo consultar el catálogo de centros de costo.',
        );
      } finally {
        setCargando(false);
      }
    },
    [verInactivos],
  );

  useEffect(() => {
    consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await api.post('/finanzas/centros-costo', {
        codigo: form.codigo,
        nombre: form.nombre,
        tipo: form.tipo,
        padreId: form.padreId || undefined,
        oficinaExternaId: form.oficinaExternaId || undefined,
      });
      setForm({ ...vacio });
      setAviso(
        centros.length === 0
          ? 'Primer centro dado de alta. A partir de ahora, las pólizas manuales de cuentas de resultado tienen que decir a qué centro pertenecen.'
          : '',
      );
      await consultar();
    } catch (e) {
      /* El servidor explica por qué —código repetido, padre de otra empresa,
       * círculo en el árbol— y eso se enseña tal cual: es más útil que
       * «no se pudo guardar». */
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el centro de costo.');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (c: ICentro) => {
    setError('');
    try {
      await api.patch(`/finanzas/centros-costo/${c.id}`, { activo: !c.activo });
      await consultar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  const padres = centros.filter((c) => c.activo);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Centros de costo</h1>
          <p className="text-sm text-slate-500">
            La dimensión con la que el estado de resultados se abre por sucursal,
            proyecto o línea de negocio.
          </p>
        </div>
      </header>

      {centros.length === 0 && !cargando && !error && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Esta empresa todavía no lleva centros de costo, y por eso las pólizas no
          los piden. <strong>En cuanto des de alta el primero</strong>, toda partida
          manual de una cuenta de ingreso, costo o gasto tendrá que decir a cuál
          pertenece.
        </div>
      )}
      {aviso && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          {aviso}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-5">
        <input
          value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })}
          placeholder="Código"
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        />
        <input
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Nombre"
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm md:col-span-2"
        />
        <select
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select
          value={form.padreId}
          onChange={(e) => setForm({ ...form, padreId: e.target.value })}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          <option value="">Sin padre</option>
          {padres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nombre}
            </option>
          ))}
        </select>
        <input
          value={form.oficinaExternaId}
          onChange={(e) => setForm({ ...form, oficinaExternaId: e.target.value })}
          placeholder="Oficina del core (opcional)"
          title="La oficina de Fineract que corresponde a este centro. Fineract admite una sola oficina por asiento: una póliza repartida entre centros de oficinas distintas se espeja con la de la empresa."
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm md:col-span-2"
        />
        <button
          onClick={guardar}
          disabled={guardando || !form.codigo.trim() || !form.nombre.trim()}
          className="flex items-center justify-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={verInactivos}
          onChange={(e) => {
            setVerInactivos(e.target.checked);
            consultar(e.target.checked);
          }}
        />
        Ver también los desactivados
      </label>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Recibe movimientos</th>
              <th className="px-4 py-2 font-medium">Oficina del core</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {centros.map((c) => (
              <tr key={c.id} className={c.activo ? '' : 'bg-slate-50 text-slate-400'}>
                <td className="px-4 py-2 font-mono text-xs">{c.codigo}</td>
                <td className="px-4 py-2" style={{ paddingLeft: 16 + (c.nivel ?? 0) * 16 }}>
                  {c.nombre}
                </td>
                <td className="px-4 py-2 text-slate-500">{c.tipo.replace('_', ' ')}</td>
                <td className="px-4 py-2">
                  {c.aceptaMovimientos ? (
                    'Sí'
                  ) : (
                    <span title="Agrupa a otros centros: su saldo es la suma de ellos.">
                      No — agrupa
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{c.oficinaExternaId ?? '—'}</td>
                <td className="px-4 py-2">{c.activo ? 'Activo' : 'Desactivado'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => alternarActivo(c)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                    title={
                      c.activo
                        ? 'Deja de ofrecerse para capturar; su historia se conserva'
                        : 'Vuelve a ofrecerse para capturar'
                    }
                  >
                    <Power className="h-3.5 w-3.5" />
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {centros.length === 0 && !cargando && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Sin centros de costo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
