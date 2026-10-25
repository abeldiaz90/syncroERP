"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { peticion } from '@/lib/api';
import { hoyISO } from '@/lib/fechas';
import { Receipt, RefreshCw, DollarSign } from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

import { useT } from '@/components/I18nProvider';
const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
/*
 * El día se resuelve AL ABRIR la pantalla, no al cargar el módulo: a nivel de
 * módulo `new Date()` se evalúa una sola vez y el valor queda congelado —en
 * producción, horneado en el build de Next—. Aquí eso significa que el corte de
 * caja abriría con la fecha de otro día y el botón «Hoy» marcaría ese otro día
 * como si fuera hoy. Y `diaISO` arma la fecha con las partes locales del reloj,
 * sin pasar por UTC, que es donde se pierde un día en los husos al este de
 * Greenwich.
 */

const COLUMNAS_CAJA = [
  { key: 'folio',          label: 'Folio',   fmt: (v: number) => '#' + String(v).padStart(5,'0') },
  { key: 'fechaVenta',     label: 'Fecha',   fmt: (v: string) => new Date(v).toLocaleDateString('es-MX') },
  { key: 'cliente.nombre', label: 'Cliente'  },
  { key: 'metodoPago',     label: 'Método'   },
  { key: 'total',          label: 'Total',   fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function CorteCajaPage() {
  const t = useT();
  const [ventas, setVentas]   = useState<any[]>([]);
  const [pagos, setPagos]     = useState<any[]>([]);
  const HOY = useMemo(() => hoyISO(), []);
  const [fecha, setFecha]     = useState(HOY);
  const [cargando, setCargando] = useState(false);
  /*
   * Un corte de caja que no se pudo leer NO es un corte en cero.
   *
   * `if (rv.ok)` dejaba las ventas en `[]` cuando la respuesta era 403 o 500, y
   * la pantalla pintaba el reporte completo con $0.00 en todos los renglones,
   * sin decir nada. Un almacenista lo abrió por accidente —tiene el módulo de
   * reportes— y vio «TOTAL COBRADO $0.00» en un día con ventas. Con eso se
   * puede cerrar una caja mal, y es de las cosas que no se descubren hasta que
   * falta dinero.
   */
  const [problema, setProblema] = useState<string | null>(null);
  /*
    Si la cobranza del día no se pudo leer, el gran total está corto y hay que
    decirlo donde se lee el total, no en una esquina.
  */
  const [cobranzaVedada, setCobranzaVedada] = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rv, rp] = await Promise.all([
      peticion(`/ventas?fechaDesde=${fecha}&fechaHasta=${fecha}&limite=500`, { headers: h() }),
      peticion(`/credito/cobranza/pagos-del-dia?fecha=${fecha}`, { headers: h() }).catch(() => ({ ok: false })),
    ]);
    /*
      Un corte al que le falta una mitad tiene que decirlo.
      ---------------------------------------------------------------------
      La cobranza del día entra en el GRAN TOTAL. Si no se puede leer,
      `totalCobranza` vale cero y el gran total sale corto —no equivocado por
      un peso: corto por todo lo que se cobró de cartera ese día— y la pantalla
      lo presentaba como el corte del día, firmado y exportable a PDF.

      Contabilidad ve este reporte y no puede leer los pagos de cobranza.
      Medido el 21-oct-2026. Un cero que no se pudo preguntar no es un cero: es
      un dato que falta, y en un corte de caja la diferencia es el faltante.
    */
    if (rv.ok) {
      const d = await rv.json();
      setVentas(d.ventas ?? d);
      setProblema(null);
    } else {
      setVentas([]);
      setProblema(
        rv.status === 403
          ? t("Tu perfil no incluye las ventas, así que este corte no se puede calcular. Pídeselo a quien lleva la caja.")
          : rv.status === 401
            ? t("Tu sesión caducó. Vuelve a entrar para ver el corte.")
            : t("No se pudieron leer las ventas del día. El corte no está completo; vuelve a intentarlo."),
      );
    }
    if ((rp as any).ok) { setPagos(await (rp as Response).json()); setCobranzaVedada(false); }
    else { setPagos([]); setCobranzaVedada(true); }
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrar solo ventas de contado (efectivo, tarjeta, SPEI)
  const METODOS_CONTADO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MSI_BANCO'];
  const ventasContado   = ventas.filter(v => v.estado !== 'ANULADA' && METODOS_CONTADO.includes(v.metodoPago));
  const ventasCredito   = ventas.filter(v => v.estado !== 'ANULADA' && !METODOS_CONTADO.includes(v.metodoPago));
  const neto = (v: any) => Number(v.total) - Number(v.totalDevuelto ?? 0);

  const totalEfectivo     = ventasContado.filter(v => v.metodoPago === 'EFECTIVO').reduce((s, v) => s + neto(v), 0);
  const totalTarjeta      = ventasContado.filter(v => ['TARJETA','MSI_BANCO'].includes(v.metodoPago)).reduce((s, v) => s + neto(v), 0);
  const totalTransferencia = ventasContado.filter(v => v.metodoPago === 'TRANSFERENCIA').reduce((s, v) => s + neto(v), 0);
  const totalCobranza     = pagos.reduce((s: number, p: any) => s + Number(p.montoPagado ?? 0), 0);
  const totalCredito      = ventasCredito.reduce((s, v) => s + neto(v), 0);
  const granTotal         = totalEfectivo + totalTarjeta + totalTransferencia + totalCobranza;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">{t("Reportes")}</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-indigo-500"/>  {t("Corte de Caja")}
          </h1>
        </div>
        <div className="flex gap-2">
          <ExportBar
            titulo={`Corte_Caja_${fecha}`}
            subtitulo={`Fecha: ${fecha}`}
            datos={ventas.filter(v => v.estado !== 'ANULADA')}
            columnas={COLUMNAS_CAJA}
          />
          <button aria-label={t("Volver a cargar")} title={t("Volver a cargar")} onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 print:hidden">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex gap-3 items-end print:hidden">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{t("Fecha del corte")}</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <button onClick={() => setFecha(HOY)}
          className={`px-3 py-2.5 rounded-xl text-xs font-bold border ${fecha === HOY ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>
          
          {t("Hoy")}
        </button>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
        </div>
      ) : problema ? (
        /* Ningún número: un corte incompleto no se muestra como corte. */
        <div className="bg-white rounded-2xl border border-amber-200 p-10 text-center">
          <p className="text-sm font-bold text-amber-700 mb-1">{t("No se puede mostrar el corte")}</p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">{problema}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header del corte */}
          <div className="bg-slate-900 text-white rounded-2xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{t("Corte de Caja")}</p>
            <p className="text-2xl font-black">
              {new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-sm text-slate-400 mt-1">{t("Generado: {n0}", { n0: new Date().toLocaleTimeString('es-MX') })}</p>
            {cobranzaVedada && (
              <p className="mt-3 rounded-lg bg-amber-400/20 px-3 py-2 text-xs font-bold text-amber-200">
                
                {t("CORTE INCOMPLETO: no se pudieron leer los abonos de cobranza del día, así que el gran total no los incluye. No lo firmes como corte cerrado.")}
              </p>
            )}
          </div>

          {/* Ingresos por método */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-900 text-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">{t("Ingresos del día")}</p>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: t("💵 Efectivo"), val: totalEfectivo, count: ventasContado.filter(v=>v.metodoPago==='EFECTIVO').length },
                  { label: t("💳 Tarjeta / MSI"), val: totalTarjeta, count: ventasContado.filter(v=>['TARJETA','MSI_BANCO'].includes(v.metodoPago)).length },
                  { label: t("🏦 Transferencia SPEI"), val: totalTransferencia, count: ventasContado.filter(v=>v.metodoPago==='TRANSFERENCIA').length },
                  { label: t("🏦 Cobranza (abonos)"), val: totalCobranza, count: pagos.length, vedado: cobranzaVedada },
                ].map(r => (
                  <tr key={r.label} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{t(r.label)}</td>
                    <td className="px-5 py-3.5 text-center text-slate-400 text-xs">
                      {r.vedado ? t("sin dato") : `${r.count} movimientos`}
                    </td>
                    {/*
                      Un «$0.00» se lee como «no hubo cobranza hoy». Si no se
                      pudo preguntar, va una raya: el ojo no confunde una raya
                      con un cero contado.
                    */}
                    <td className={`px-5 py-3.5 text-right font-mono font-bold ${r.vedado ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {r.vedado ? '—' : fmt$(r.val)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-emerald-300 bg-emerald-50">
                <tr>
                  <td colSpan={2} className="px-5 py-4 font-black uppercase text-emerald-800">{t("TOTAL COBRADO")}</td>
                  <td className="px-5 py-4 text-right font-black font-mono text-emerald-800 text-xl">{fmt$(granTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Créditos generados (no cobrado aún) */}
          {totalCredito > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="bg-amber-900 text-white px-5 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-300">{t("Ventas a crédito (por cobrar)")}</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{t("💳 Créditos otorgados hoy")}</td>
                    <td className="px-5 py-3.5 text-center text-slate-400 text-xs">{t("{n0} ventas", { n0: ventasCredito.length })}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-amber-700">{fmt$(totalCredito)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen total */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">{t("Total ventas del día")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("{n0} transacciones", { n0: ventas.filter(v=>v.estado!=='ANULADA').length })}</p>
            </div>
            <p className="text-3xl font-black text-white">{fmt$(granTotal + totalCredito)}</p>
          </div>

          {/* Detalle de ventas */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("Detalle de ventas")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-xs uppercase text-slate-500 font-bold">
                    <th className="px-4 py-3 text-left">{t("Folio")}</th>
                    <th className="px-4 py-3 text-left">{t("Cliente")}</th>
                    <th className="px-4 py-3 text-left">{t("Método")}</th>
                    <th className="px-4 py-3 text-right">{t("Total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventas.filter(v=>v.estado!=='ANULADA').map(v => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">#{String(v.folio).padStart(5,'0')}</td>
                      <td className="px-4 py-2.5 text-slate-700">{v.cliente?.nombre ?? t("Mostrador")}</td>
                      <td className="px-4 py-2.5"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{v.metodoPago}</span></td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{fmt$(neto(v))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <style>{`@media print { @page{margin:10mm;size:80mm auto} .print\\:hidden{display:none!important} }`}</style>
    </div>
  );
}
