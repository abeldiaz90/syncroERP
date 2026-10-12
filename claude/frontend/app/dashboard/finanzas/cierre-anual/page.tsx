'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAvisos } from '@/components/ui';

/**
 * ============================================================================
 * Cierre del ejercicio
 * ----------------------------------------------------------------------------
 * El ERP cerraba meses; no cerraba años. Son dos cosas distintas: cerrar un mes
 * impide registrar más pólizas en él; cerrar el año además **traspasa el
 * resultado**, dejando en cero las cuentas de ingreso, costo y gasto.
 *
 * Sin ese traspaso, el 2 de enero el estado de resultados sigue enseñando las
 * ventas del año pasado y el balance no cuadra contra el capital contable.
 *
 * La pantalla enseña primero los IMPEDIMENTOS y sólo después el botón. Un botón
 * que únicamente dice «no se pudo» al pulsarlo obliga a adivinar qué falta;
 * aquí los meses abiertos se nombran uno por uno antes de tocar nada.
 * ============================================================================
 */

type Diagnostico = {
  ejercicio: number;
  mesesCerrados: number[];
  mesesQueFaltan: number[];
  diciembreAbierto: boolean;
  cuentaUtilidad: string | null;
  cuentaPerdida: string | null;
  resultado: number;
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  cuentasPorSaldar: number;
  yaAsentado: { folio: string; id: string } | null;
  impedimentos: string[];
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const dinero = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);

export default function CierreAnualPage() {
  const { avisar } = useAvisos();
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear() - 1);
  const [d, setD] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [traspasando, setTraspasando] = useState(false);

  const cargar = async (anio: number) => {
    setCargando(true);
    try {
      setD(await api.get<Diagnostico>(`/finanzas/cierre-anual/${anio}`));
    } catch (e) {
      setD(null);
      avisar(
        e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo leer el ejercicio.',
        'error',
      );
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    void cargar(ejercicio);
  }, [ejercicio]);

  const traspasar = async () => {
    if (
      !window.confirm(
        `Se asentará la póliza de cierre del ${ejercicio} con fecha 31 de diciembre. ` +
          'Deja en cero las cuentas de ingreso, costo y gasto y manda el resultado al capital. ¿Continuar?',
      )
    ) {
      return;
    }
    setTraspasando(true);
    try {
      const r = await api.post<any>(`/finanzas/cierre-anual/${ejercicio}/traspasar`, {});
      avisar(
        `Póliza ${r.poliza?.folio ?? ''} asentada · ${r.esUtilidad ? 'utilidad' : 'pérdida'} de ` +
          `${dinero(Math.abs(r.resultado))}. ${r.siguientePaso}`,
        'exito',
      );
      await cargar(ejercicio);
    } catch (e) {
      avisar(
        e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo traspasar el resultado.',
        'error',
      );
    } finally {
      setTraspasando(false);
    }
  };

  const puede = !!d && d.impedimentos.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <CalendarCheck />
            Cierre del ejercicio
          </h1>
          <p className="text-slate-500">
            Deja en cero ingresos, costos y gastos, y manda el resultado del año al capital. Sin
            esto, en enero el estado de resultados sigue contando las ventas del año pasado.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            className="w-28 border rounded-xl p-2 text-center font-bold"
            value={ejercicio}
            onChange={(e) => setEjercicio(Number(e.target.value))}
          />
          <button
            aria-label="Volver a revisar"
            title="Volver a revisar"
            onClick={() => void cargar(ejercicio)}
            className="p-2 border rounded-xl"
          >
            <RefreshCw className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {d && (
        <>
          <section className="grid md:grid-cols-4 gap-3">
            {[
              { etiqueta: 'Ingresos', valor: dinero(d.totalIngresos), color: 'text-emerald-700' },
              { etiqueta: 'Costos', valor: dinero(d.totalCostos), color: 'text-slate-700' },
              { etiqueta: 'Gastos', valor: dinero(d.totalGastos), color: 'text-slate-700' },
              {
                etiqueta: d.resultado >= 0 ? 'Utilidad' : 'Pérdida',
                valor: dinero(Math.abs(d.resultado)),
                color: d.resultado >= 0 ? 'text-blue-700' : 'text-rose-700',
              },
            ].map((t) => (
              <div key={t.etiqueta} className="border rounded-2xl p-4 bg-white">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  {t.etiqueta}
                </div>
                <div className={`text-2xl font-black ${t.color}`}>{t.valor}</div>
              </div>
            ))}
          </section>

          <section className="border rounded-2xl p-4 bg-white space-y-3">
            <h2 className="font-bold text-lg">Los doce meses</h2>
            <div className="flex flex-wrap gap-2">
              {MESES.map((nombre, i) => {
                const mes = i + 1;
                const cerrado = d.mesesCerrados.includes(mes);
                return (
                  <span
                    key={mes}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      cerrado
                        ? 'bg-emerald-100 text-emerald-800'
                        : mes === 12
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {nombre}
                    {cerrado ? ' · cerrado' : mes === 12 ? ' · abierto (así debe estar)' : ' · abierto'}
                  </span>
                );
              })}
            </div>
            <p className="text-sm text-slate-500">
              El traspaso se asienta con <b>diciembre abierto</b>: la póliza lleva fecha del 31 de
              diciembre y un período cerrado no admite pólizas. Cerrar diciembre después es el acto
              que sella el ejercicio.
            </p>
            <p className="text-sm text-slate-500">
              Resultado a capital:{' '}
              <b>{d.cuentaUtilidad ?? 'sin cuenta configurada'}</b>
              {d.cuentaPerdida ? ` · pérdida a ${d.cuentaPerdida}` : ''}
            </p>
          </section>

          {d.impedimentos.length > 0 ? (
            <section className="border border-amber-300 rounded-2xl p-4 bg-amber-50 space-y-2">
              <h2 className="font-bold text-lg flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-5 h-5" />
                Todavía no se puede cerrar
              </h2>
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                {d.impedimentos.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="border border-emerald-300 rounded-2xl p-4 bg-emerald-50 space-y-3">
              <h2 className="font-bold text-lg flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="w-5 h-5" />
                Listo para traspasar
              </h2>
              <p className="text-sm text-emerald-900">
                Se saldarán <b>{d.cuentasPorSaldar}</b> cuenta(s) y se asentará{' '}
                {d.resultado >= 0 ? 'una utilidad' : 'una pérdida'} de{' '}
                <b>{dinero(Math.abs(d.resultado))}</b>.
              </p>
              <button
                onClick={() => void traspasar()}
                disabled={traspasando || !puede}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"
              >
                {traspasando ? 'Asentando…' : 'Traspasar el resultado'}
              </button>
            </section>
          )}

          {d.yaAsentado && (
            <p className="text-sm text-slate-500">
              Ya asentado en la póliza <b>{d.yaAsentado.folio}</b>.{' '}
              <Link href="/dashboard/finanzas/polizas" className="underline">
                Ver pólizas
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
