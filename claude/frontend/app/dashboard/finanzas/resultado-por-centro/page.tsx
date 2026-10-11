"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Calendar } from 'lucide-react';
import { diaISO, mesEnCurso } from '@/lib/fechas';
import { api, ApiError } from '@/lib/api';

/*
 * ============================================================================
 * El resultado, abierto por centro de costo
 * ----------------------------------------------------------------------------
 * La pantalla que contesta «cuánto costó el hotel contra cuánto costó la
 * ferretería». Hasta hoy el ERP no podía: la partida de póliza tenía cuenta,
 * cargo y abono, y nada más.
 *
 * Dos decisiones de esta pantalla, y las dos son sobre no mentir:
 *
 *  · **El renglón «Sin clasificar» se enseña siempre que exista**, y arriba, no
 *    escondido al final. Es lo que hace que la suma de los centros dé el total
 *    de la empresa. Si se ocultara, la tabla cuadraría consigo misma y no con
 *    la contabilidad — un control que siempre pasa.
 *  · **Un fallo de la consulta vacía la tabla y lo dice.** Una tabla en cero se
 *    lee como «no hubo gasto», que es la peor forma de fallar: es el defecto
 *    que ya costó una corrección en la balanza.
 * ============================================================================
 */

interface ICentro {
  centroCostoId: string | null;
  codigo: string | null;
  centro: string;
  ingresos: number;
  costos: number;
  gastos: number;
  resultado: number;
}
interface IRespuesta {
  centros: ICentro[];
  total: Omit<ICentro, 'centroCostoId' | 'codigo' | 'centro'>;
  sinClasificar: ICentro | null;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

const rangosDeHoy = () => {
  const hoy = new Date();
  const mes = mesEnCurso(hoy);
  return [
    { label: 'Este mes', desde: mes.desde, hasta: mes.hasta },
    {
      label: 'Mes anterior',
      desde: diaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: diaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    },
    {
      label: 'Este año',
      desde: diaISO(new Date(hoy.getFullYear(), 0, 1)),
      hasta: diaISO(new Date(hoy.getFullYear(), 11, 31)),
    },
    { label: 'Histórico', desde: '', hasta: '' },
  ];
};

export default function ResultadoPorCentroPage() {
  const RANGOS = useMemo(rangosDeHoy, []);
  const [datos, setDatos] = useState<IRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [desde, setDesde] = useState(() => RANGOS[0].desde);
  const [hasta, setHasta] = useState(() => RANGOS[0].hasta);
  const [rangoActivo, setRangoActivo] = useState('Este mes');

  const consultar = useCallback(
    async (d = desde, h = hasta) => {
      setCargando(true);
      try {
        /*
         * Por el cliente central, no con un `fetch` propio. Los ~242 fetch
         * sueltos que había es lo que esto vino a quitar: cada uno repetía el
         * token, el 401 y el 403 a su manera, y la pantalla que se olvidaba de
         * alguno fallaba distinto de las demás.
         */
        const query: Record<string, string> = {};
        if (d) query.fechaDesde = d;
        if (h) query.fechaHasta = h;
        setDatos(await api.get<IRespuesta>('/finanzas/polizas/resultado-por-centro', { query }));
        setError('');
      } catch (e) {
        /*
         * Y la tabla se VACÍA al fallar. Dejar los datos anteriores en pantalla
         * con un rango nuevo seleccionado es peor que no enseñar nada: se lee
         * como el resultado del período que no se pudo consultar.
         */
        setDatos(null);
        setError(
          e instanceof ApiError && e.status === 403
            ? 'Tu perfil no incluye la consulta del resultado por centro.'
            : 'No se pudo consultar el resultado por centro. Las cifras de esta pantalla no son válidas.',
        );
      } finally {
        setCargando(false);
      }
    },
    [desde, hasta],
  );

  useEffect(() => {
    consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conCentro = (datos?.centros ?? []).filter((c) => c.centroCostoId !== null);
  const sinClasificar = datos?.sinClasificar ?? null;

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Resultado por centro de costo
          </h1>
          <p className="text-sm text-slate-500">
            Ingresos, costos y gastos de cada centro. El renglón «Sin clasificar» es lo
            que todavía no se captura con centro: sin él, la suma no daría el total.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {RANGOS.map((r) => (
          <button
            key={r.label}
            onClick={() => {
              setRangoActivo(r.label);
              setDesde(r.desde);
              setHasta(r.hasta);
              consultar(r.desde, r.hasta);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              rangoActivo === r.label
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-slate-200" />
        <Calendar className="h-4 w-4 text-slate-400" />
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          onClick={() => {
            setRangoActivo('Personalizado');
            consultar(desde, hasta);
          }}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white"
        >
          Consultar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && !cargando && conCentro.length === 0 && !sinClasificar && (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No hay movimientos de resultado en el período.
        </div>
      )}

      {!error && !cargando && (conCentro.length > 0 || sinClasificar) && (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Centro</th>
                <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                <th className="px-4 py-2 text-right font-medium">Costos</th>
                <th className="px-4 py-2 text-right font-medium">Gastos</th>
                <th className="px-4 py-2 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sinClasificar && (
                <tr className="bg-amber-50/60">
                  <td className="px-4 py-2 text-amber-800">
                    Sin clasificar
                    <span className="ml-2 text-xs text-amber-700">
                      partidas sin centro — no se reparten ni se esconden
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{fmt$(sinClasificar.ingresos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(sinClasificar.costos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(sinClasificar.gastos)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {fmt$(sinClasificar.resultado)}
                  </td>
                </tr>
              )}
              {conCentro.map((c) => (
                <tr key={c.centroCostoId}>
                  <td className="px-4 py-2 text-slate-700">
                    {c.codigo && (
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {c.codigo}
                      </span>
                    )}
                    {c.centro}
                  </td>
                  <td className="px-4 py-2 text-right">{fmt$(c.ingresos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(c.costos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(c.gastos)}</td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${
                      c.resultado < 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {fmt$(c.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
            {datos && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                <tr>
                  <td className="px-4 py-2 text-slate-700">Total de la empresa</td>
                  <td className="px-4 py-2 text-right">{fmt$(datos.total.ingresos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(datos.total.costos)}</td>
                  <td className="px-4 py-2 text-right">{fmt$(datos.total.gastos)}</td>
                  <td
                    className={`px-4 py-2 text-right ${
                      datos.total.resultado < 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {fmt$(datos.total.resultado)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
