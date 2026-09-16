"use client";

/**
 * ============================================================================
 * Expediente del cliente · panel reutilizable
 * ----------------------------------------------------------------------------
 * Lo que se ha comprobado sobre una persona y cuándo. Vive aquí, y no dentro
 * de una pantalla, porque se usa en dos sitios con la misma forma: como panel
 * derecho de la cartera de clientes y como pantalla propia del expediente.
 * Copiarlo en los dos habría garantizado que un día dijeran cosas distintas.
 *
 * Tres decisiones de diseño, y las tres vienen de cómo se usa esto de verdad:
 *
 *  1. ARRIBA EL ESTADO, ABAJO LA HISTORIA. Lo que alguien necesita saber en
 *     tres segundos es qué está comprobado HOY, no en qué orden se comprobó.
 *
 *  2. LA ÚLTIMA RESPUESTA DE CADA CONTROL PUEDE VENIR DE CORRIDAS DISTINTAS.
 *     La identidad se pudo verificar un día y el buró otro, así que la rejilla
 *     recorre todas las corridas reales y se queda con la más reciente de cada
 *     tipo. Tomar sólo la última corrida borraría comprobaciones válidas.
 *
 *  3. LAS SIMULACIONES SE VEN, MARCADAS, Y NO CUENTAN. Esconderlas haría
 *     pensar que no se hicieron; mezclarlas haría creer que valen. No
 *     alimentan la rejilla de estado.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle, HelpCircle,
  MinusCircle, FlaskConical, ChevronDown, ChevronRight, CreditCard,
  Fingerprint, Landmark, ListX, History, Scale, UserCheck, Play,
} from 'lucide-react';
import { api, intentar } from '@/lib/api';

export type TipoPaso =
  | 'IDENTIDAD_INE' | 'BURO_CREDITO' | 'CIRCULO_CREDITO' | 'HISTORIAL_INTERNO'
  | 'LISTA_BLOQUEO' | 'POLITICA_INTERNA' | 'REVISION_MANUAL';

export type Resultado =
  | 'APROBADO' | 'RECHAZADO' | 'INDETERMINADO' | 'NO_DISPONIBLE' | 'OMITIDO' | 'ERROR';

export type EstadoExp =
  | 'EN_PROCESO' | 'APROBADA' | 'APROBADA_CON_AJUSTE' | 'RECHAZADA' | 'REVISION_MANUAL';

export interface IPasoExp {
  orden: number; tipo: TipoPaso; etiqueta: string; resultado: Resultado;
  puntaje?: number | null; puntosAportados: number;
  proveedor?: string | null; detalle?: string | null;
}

export interface IEjecucionExp {
  id: string; clienteId: string; flujoNombre: string; flujoVersion: number;
  limiteSolicitado: string | number; limiteSugerido: string | number;
  puntaje: number; estado: EstadoExp; motivos?: string[] | null;
  simulacion: boolean; fechaCreacion?: string;
}

const CONTROLES: { tipo: TipoPaso; nombre: string; que: string; Icono: typeof ShieldCheck }[] = [
  { tipo: 'IDENTIDAD_INE',     nombre: 'Identidad',          que: 'Que la persona es quien dice ser.',           Icono: Fingerprint },
  { tipo: 'LISTA_BLOQUEO',     nombre: 'Listas de bloqueo',  que: 'Listas que impiden operar con la persona.',   Icono: ListX },
  { tipo: 'BURO_CREDITO',      nombre: 'Buró de Crédito',    que: 'Historial en el sistema financiero.',         Icono: Landmark },
  { tipo: 'CIRCULO_CREDITO',   nombre: 'Círculo de Crédito', que: 'La otra sociedad de información crediticia.', Icono: Landmark },
  { tipo: 'HISTORIAL_INTERNO', nombre: 'Cartera propia',     que: 'Cómo se ha portado contigo.',                 Icono: History },
  { tipo: 'POLITICA_INTERNA',  nombre: 'Política interna',   que: 'Tu propia regla sobre el monto.',             Icono: Scale },
  { tipo: 'REVISION_MANUAL',   nombre: 'Revisión humana',    que: 'Alguien miró el expediente.',                 Icono: UserCheck },
];

export const RES: Record<Resultado, { nombre: string; clase: string; punto: string }> = {
  APROBADO:      { nombre: 'Aprobado',      clase: 'text-emerald-700 bg-emerald-50 border-emerald-200', punto: 'bg-emerald-500' },
  RECHAZADO:     { nombre: 'Rechazado',     clase: 'text-rose-700 bg-rose-50 border-rose-200',          punto: 'bg-rose-500' },
  INDETERMINADO: { nombre: 'Sin concluir',  clase: 'text-amber-700 bg-amber-50 border-amber-200',       punto: 'bg-amber-500' },
  NO_DISPONIBLE: { nombre: 'Sin proveedor', clase: 'text-slate-500 bg-slate-50 border-slate-200',       punto: 'bg-slate-300' },
  OMITIDO:       { nombre: 'No aplicaba',   clase: 'text-slate-500 bg-slate-50 border-slate-200',       punto: 'bg-slate-300' },
  ERROR:         { nombre: 'Falló',         clase: 'text-rose-700 bg-rose-50 border-rose-200',          punto: 'bg-rose-500' },
};

export const EST: Record<EstadoExp, { nombre: string; clase: string }> = {
  APROBADA:            { nombre: 'Aprobada',            clase: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  APROBADA_CON_AJUSTE: { nombre: 'Aprobada con ajuste', clase: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  REVISION_MANUAL:     { nombre: 'A revisión humana',   clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  RECHAZADA:           { nombre: 'Rechazada',           clase: 'bg-rose-50 text-rose-800 border-rose-200' },
  EN_PROCESO:          { nombre: 'En proceso',          clase: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const dinero = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fechaLarga = (f?: string) =>
  f ? new Date(f).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function ExpedienteCliente({ clienteId, limiteHistoria }: {
  clienteId: string;
  /** Cuántas corridas listar. La pantalla propia las muestra todas. */
  limiteHistoria?: number;
}) {
  const [corridas, setCorridas] = useState<IEjecucionExp[]>([]);
  const [detalle, setDetalle] = useState<Record<string, IPasoExp[]>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setCorridas([]); setDetalle({}); setAbierta(null);
    void (async () => {
      const h = await intentar<IEjecucionExp[]>(
        api.get<IEjecucionExp[]>(`/integracion/validacion/expedientes?clienteId=${clienteId}`), []);
      if (!vivo) return;
      const lista = Array.isArray(h) ? h : [];
      setCorridas(lista);

      /* Los pasos de las corridas reales, para armar la rejilla de estado. Se
         limita a 15 para no encadenar cincuenta peticiones en un expediente
         largo; con eso alcanza de sobra para la última de cada control. */
      const reales = lista.filter((e) => !e.simulacion).slice(0, 15);
      const partes = await Promise.all(reales.map(async (e) => {
        const d = await intentar<{ pasos: IPasoExp[] } | null>(
          api.get<{ pasos: IPasoExp[] }>(`/integracion/validacion/expedientes/${e.id}`), null);
        return [e.id, d?.pasos ?? []] as const;
      }));
      if (!vivo) return;
      setDetalle(Object.fromEntries(partes));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [clienteId]);

  const abrir = useCallback(async (id: string) => {
    setAbierta((a) => (a === id ? null : id));
    if (detalle[id]) return;
    const d = await intentar<{ pasos: IPasoExp[] } | null>(
      api.get<{ pasos: IPasoExp[] }>(`/integracion/validacion/expedientes/${id}`), null);
    setDetalle((prev) => ({ ...prev, [id]: d?.pasos ?? [] }));
  }, [detalle]);

  const ultimoPorControl: Partial<Record<TipoPaso, { paso: IPasoExp; cuando?: string }>> = {};
  for (const c of corridas) {
    if (c.simulacion) continue;
    for (const p of detalle[c.id] ?? []) {
      if (!ultimoPorControl[p.tipo]) ultimoPorControl[p.tipo] = { paso: p, cuando: c.fechaCreacion };
    }
  }

  const listadas = limiteHistoria ? corridas.slice(0, limiteHistoria) : corridas;
  const reales = corridas.filter((c) => !c.simulacion);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Reuniendo el expediente…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Qué está comprobado hoy ────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Qué está comprobado hoy
            </h3>
            <p className="text-xs text-slate-500">
              La última respuesta de cada control. Puede venir de corridas distintas.
            </p>
          </div>
          <Link href="/dashboard/creditos/verificacion/ejecutar"
            className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 shrink-0">
            <Play className="w-4 h-4" /> Verificar
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {CONTROLES.map(({ tipo, nombre, que, Icono }) => {
            const ultimo = ultimoPorControl[tipo];
            const r = ultimo ? RES[ultimo.paso.resultado] : null;
            return (
              <div key={tipo} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Icono className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{nombre}</p>
                    {r ? (
                      <>
                        <span className={`inline-flex items-center gap-1 mt-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${r.clase}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${r.punto}`} /> {r.nombre}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {fechaLarga(ultimo?.cuando)}
                          {ultimo?.paso.proveedor && ultimo.paso.proveedor !== 'ninguno' && ` · ${ultimo.paso.proveedor}`}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Nunca se ha corrido. <span className="text-slate-300">{que}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── La historia ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Historia de verificaciones</h3>
        <p className="text-xs text-slate-500 mb-3">
          De la más reciente a la más antigua. Las simulaciones van marcadas: se hicieron, pero no
          habilitan la autorización de una línea.
        </p>

        {corridas.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Este cliente no tiene ninguna verificación. Si va a pedir crédito, hay que correrle el
            flujo antes de autorizarle una línea.
          </div>
        ) : (
          <div className="space-y-2">
            {listadas.map((c) => {
              const est = EST[c.estado] ?? EST.EN_PROCESO;
              const abiertaEsta = abierta === c.id;
              const pasos = detalle[c.id];
              return (
                <div key={c.id} className={`rounded-xl border bg-white overflow-hidden ${
                  c.simulacion ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
                  <button onClick={() => void abrir(c.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3">
                    {abiertaEsta
                      ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${est.clase}`}>
                          {est.nombre}
                        </span>
                        {c.simulacion && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                            <FlaskConical className="w-3 h-3" /> simulación
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{fechaLarga(c.fechaCreacion)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {c.flujoNombre} v{c.flujoVersion} · solicitado{' '}
                        <span className="tabular-nums">{dinero(c.limiteSolicitado)}</span> · sugerido{' '}
                        <span className="tabular-nums">{dinero(c.limiteSugerido)}</span> · puntaje {c.puntaje}
                      </p>
                    </div>
                  </button>

                  {abiertaEsta && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                      {(c.motivos ?? []).length > 0 && (
                        <ul className="mb-3 space-y-1">
                          {(c.motivos ?? []).map((m, i) => (
                            <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                              <span className="text-slate-300 mt-0.5">•</span>{m}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!pasos ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Abriendo el detalle…
                        </div>
                      ) : pasos.length === 0 ? (
                        <p className="text-xs text-slate-500">Esta corrida no registró pasos.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {pasos.map((p) => {
                            const r = RES[p.resultado] ?? RES.INDETERMINADO;
                            return (
                              <div key={`${p.orden}-${p.tipo}`}
                                className="flex items-start gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2">
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${r.punto}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800">{p.orden}. {p.etiqueta}</p>
                                  {p.detalle && <p className="text-[11px] text-slate-500">{p.detalle}</p>}
                                </div>
                                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${r.clase}`}>
                                  {r.nombre}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-slate-500 w-10 text-right">
                                  {p.puntosAportados > 0 ? `+${p.puntosAportados}` : p.puntosAportados}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {limiteHistoria && corridas.length > limiteHistoria && (
              <Link href={`/dashboard/clientes/${clienteId}/expediente`}
                className="block text-center text-xs text-indigo-600 hover:underline py-2">
                Ver las {corridas.length} verificaciones →
              </Link>
            )}
          </div>
        )}
      </section>

      {reales.length > 0 && (
        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <CreditCard className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          El candado de aprobación mira el expediente más reciente no simulado, y compara el importe
          a autorizar contra el que se verificó. Autorizar más obliga a verificar de nuevo.
        </p>
      )}
    </div>
  );
}

/** El expediente vigente: el más reciente que NO es simulación. */
export function useExpedienteVigente(clienteId?: string | null) {
  const [exp, setExp] = useState<IEjecucionExp | null | undefined>(undefined);
  useEffect(() => {
    if (!clienteId) { setExp(null); return; }
    let vivo = true;
    setExp(undefined);
    void (async () => {
      const h = await intentar<IEjecucionExp[]>(
        api.get<IEjecucionExp[]>(`/integracion/validacion/expedientes?clienteId=${clienteId}`), []);
      if (!vivo) return;
      setExp((Array.isArray(h) ? h : []).find((e) => !e.simulacion) ?? null);
    })();
    return () => { vivo = false; };
  }, [clienteId]);
  return exp;
}
