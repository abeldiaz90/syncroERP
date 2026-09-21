"use client";

/**
 * ============================================================================
 * Qué ha hecho este cliente, y qué puede hacer hoy
 * ----------------------------------------------------------------------------
 * El expediente contaba quién es y qué se le verificó. Faltaba lo que un
 * vendedor pregunta de verdad antes de dejar pasar una venta: cuánto debe,
 * cuánto le queda de línea, si trae algo vencido y qué compró la última vez.
 *
 * Todo sale de endpoints que ya existían y que hasta ahora solo consultaba el
 * punto de venta —`/credito/creditos/cliente/:id/politica` es literalmente la
 * misma pregunta que se hace la caja al elegir cliente—. Que la respuesta viva
 * solo dentro del POS obligaba a abrir una venta para saber si alguien podía
 * comprar a crédito.
 *
 * Los dos bloques fallan por separado a propósito: si el servicio de crédito no
 * contesta, la actividad comercial se sigue viendo, y al revés. Un expediente
 * que se cae entero porque un endpoint tardó no sirve en un mostrador.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard, TrendingUp, AlertTriangle, Loader2, ShoppingBag,
  ArrowUpRight, Wallet, CalendarClock,
} from 'lucide-react';
import { api, intentar } from '@/lib/api';

interface IPolitica {
  limite: number; utilizado: number; disponible: number;
  vencido: number; diasCredito: number;
  estadoCredito?: string; nivelRiesgo?: string;
  puedeComprarCredito: boolean; razonBloqueo?: string | null;
}
interface IVenta {
  id: string; folio?: number | string; fecha?: string; fechaVenta?: string;
  total?: number | string; estado?: string; metodoPago?: string;
}
interface ICreditoVigente {
  id: string; estado?: string; saldoPendiente?: number | string;
  montoTotal?: number | string; proximoVencimiento?: string;
  fechaProximoPago?: string; numeroCredito?: string | number;
}

const dinero = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fecha = (f?: string) =>
  f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX',
    { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

/** Una barra que se lee sin leer los números. */
function BarraLinea({ limite, utilizado, vencido }: { limite: number; utilizado: number; vencido: number }) {
  if (limite <= 0) return null;
  const usado = Math.min(100, (utilizado / limite) * 100);
  const enMora = Math.min(usado, (vencido / limite) * 100);
  return (
    <div className="mt-2.5">
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
        {enMora > 0 && <div className="h-full bg-rose-500" style={{ width: `${enMora}%` }} />}
        <div className="h-full bg-indigo-500" style={{ width: `${usado - enMora}%` }} />
      </div>
      <div className="flex justify-between text-[10.5px] text-slate-400 mt-1 tabular-nums">
        <span>{Math.round(usado)}% usado</span>
        <span>límite {dinero(limite)}</span>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, tono = 'normal', pie }: {
  etiqueta: string; valor: string; tono?: 'normal' | 'bien' | 'mal'; pie?: string;
}) {
  const color = tono === 'mal' ? 'text-rose-600' : tono === 'bien' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <p className={`text-[15px] font-bold tabular-nums mt-0.5 ${color}`}>{valor}</p>
      {pie && <p className="text-[10.5px] text-slate-400">{pie}</p>}
    </div>
  );
}

export function ActividadCliente({ clienteId }: { clienteId: string }) {
  const [politica, setPolitica] = useState<IPolitica | null | undefined>(undefined);
  const [creditos, setCreditos] = useState<ICreditoVigente[]>([]);
  const [ventas, setVentas] = useState<IVenta[]>([]);
  const [saldoFavor, setSaldoFavor] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setPolitica(undefined);
    setCreditos([]);
    setVentas([]);
    setSaldoFavor(0);

    (async () => {
      const [pol, cred, vtas, favor] = await Promise.all([
        intentar<IPolitica | null>(api.get<IPolitica>(`/credito/creditos/cliente/${clienteId}/politica`), null),
        intentar<any>(api.get<any>(`/credito/creditos/cliente/${clienteId}`), []),
        intentar<any>(api.get<any>(`/ventas?clienteId=${clienteId}&limite=5&pagina=1`), null),
        intentar<{ saldo: number } | null>(api.get<{ saldo: number }>(`/ventas/clientes/${clienteId}/saldo-favor`), null),
      ]);
      if (!vivo) return;
      setPolitica(pol);
      setCreditos(Array.isArray(cred) ? cred : (cred?.datos ?? cred?.items ?? []));
      // El listado de ventas viene paginado unas veces y plano otras según el
      // endpoint; se aceptan las dos formas en vez de romperse por la envoltura.
      const lista = Array.isArray(vtas) ? vtas : (vtas?.datos ?? vtas?.items ?? vtas?.ventas ?? []);
      setVentas(Array.isArray(lista) ? lista.slice(0, 5) : []);
      setSaldoFavor(Number(favor?.saldo ?? 0));
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [clienteId]);

  if (cargando) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 flex justify-center">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const conLinea = Number(politica?.limite ?? 0) > 0;
  const vigentes = creditos.filter((c) => String(c.estado ?? '').toUpperCase() !== 'LIQUIDADO');
  const proximo = vigentes
    .map((c) => c.proximoVencimiento ?? c.fechaProximoPago)
    .filter(Boolean)
    .sort()[0];

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* ── Crédito ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          <h3 className="text-[13px] font-bold text-slate-900">Su crédito hoy</h3>
          {politica && !politica.puedeComprarCredito && conLinea && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" /> no puede comprar
            </span>
          )}
          {politica?.puedeComprarCredito && conLinea && (
            <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              puede comprar
            </span>
          )}
        </div>

        {politica === null ? (
          <p className="text-[12.5px] text-slate-400">
            No se pudo consultar su política de crédito ahora mismo.
          </p>
        ) : !conLinea ? (
          <div className="text-[12.5px] text-slate-500 leading-relaxed">
            Compra de contado. No todo cliente necesita línea; la de crédito se abre cuando
            la solicita y su verificación sale favorable.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Dato etiqueta="Disponible" valor={dinero(politica!.disponible)} tono="bien"
                pie={`${politica!.diasCredito} días de plazo`} />
              <Dato etiqueta="Utilizado" valor={dinero(politica!.utilizado)} />
              <Dato etiqueta="Vencido" valor={dinero(politica!.vencido)}
                tono={Number(politica!.vencido) > 0 ? 'mal' : 'normal'}
                pie={Number(politica!.vencido) > 0 ? 'en mora' : 'al corriente'} />
            </div>

            <BarraLinea limite={Number(politica!.limite)} utilizado={Number(politica!.utilizado)}
              vencido={Number(politica!.vencido)} />

            {!politica!.puedeComprarCredito && politica!.razonBloqueo && (
              <p className="mt-3 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed">
                {politica!.razonBloqueo}
              </p>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-[11.5px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                {vigentes.length} {vigentes.length === 1 ? 'crédito vigente' : 'créditos vigentes'}
              </span>
              {proximo && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                  próximo vencimiento {fecha(proximo)}
                </span>
              )}
              <Link href={`/dashboard/creditos/creditos?clienteId=${clienteId}`}
                className="ml-auto text-indigo-600 font-semibold inline-flex items-center gap-1">
                Ver cartera <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ── Actividad comercial ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-4 h-4 text-slate-500" />
          <h3 className="text-[13px] font-bold text-slate-900">Lo que ha comprado</h3>
          {saldoFavor > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-full px-2 py-0.5">
              <Wallet className="w-3 h-3" /> saldo a favor {dinero(saldoFavor)}
            </span>
          )}
        </div>

        {ventas.length === 0 ? (
          <p className="text-[12.5px] text-slate-400">
            Todavía no tiene compras registradas.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 -mx-1">
            {ventas.map((v) => (
              /* Al ticket, no a `/dashboard/ventas/{id}`: esa ruta no tiene
               pantalla —sólo `facturar/` y `ticket/`— y el clic caía en el 404
               de Next dentro del área de trabajo, sin menú ni forma de volver.
               El ticket ya muestra la venta entera: renglones, impuestos,
               forma de pago y, si fue a crédito, su plan de cuotas. */
            <Link key={v.id} href={`/dashboard/ventas/${v.id}/ticket`}
                className="flex items-center gap-3 px-1 py-2 hover:bg-slate-50 rounded transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-slate-800 truncate">
                    Venta #{v.folio ?? '—'}
                    {v.metodoPago && (
                      <span className="ml-2 text-[10.5px] font-medium text-slate-400 uppercase">
                        {String(v.metodoPago).replace(/_/g, ' ').toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400">{fecha(v.fecha ?? v.fechaVenta)}</p>
                </div>
                <span className="text-[12.5px] font-bold text-slate-900 tabular-nums shrink-0">
                  {dinero(v.total)}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-100">
          <Link href={`/dashboard/ventas/historial?clienteId=${clienteId}`}
            className="text-[11.5px] text-indigo-600 font-semibold inline-flex items-center gap-1">
            Todo su historial <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </section>
    </div>
  );
}
