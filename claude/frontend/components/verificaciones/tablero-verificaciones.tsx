"use client";

/**
 * ============================================================================
 * Tablero de verificaciones · el expediente de la empresa
 * ----------------------------------------------------------------------------
 * Hasta ahora las verificaciones sólo se podían mirar de una en una: abrir un
 * cliente y ver sus corridas. Eso contesta «¿a éste lo revisaron?» y deja sin
 * contestar la pregunta que hace un comité de crédito, un auditor o un cliente
 * que evalúa comprar el sistema: **cuánto se verifica, de qué, y con qué
 * resultado**.
 *
 * Tres decisiones, y las tres son sobre no mentir con los números:
 *
 *  1. LAS SIMULACIONES NO SE SUMAN. Se cuentan aparte y se dicen. Sumarlas
 *     haría ver un control muy ejercitado cuando en realidad nunca corrió
 *     sobre una persona real; esconderlas haría pensar que no se ensayó.
 *
 *  2. UN CONTROL QUE NUNCA CORRIÓ SE VE VACÍO, NO EN CERO. «0 aprobados» y
 *     «nunca se ha ejecutado» son cosas distintas y se confunden a simple
 *     vista. La tarjeta lo dice con palabras.
 *
 *  3. LO QUE NO ESTÁ INSTALADO SE DECLARA. La consulta de CURP vive en otro
 *     módulo y hoy su tabla no existe —faltan migraciones—. Aparece igual, con
 *     su estado, porque un control ausente del tablero es un control del que
 *     nadie se acuerda.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Play, Loader2, FlaskConical, IdCard, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { api, intentar } from '@/lib/api';
import { Indicador } from '@/components/ui';
import {
  CONTROLES, RES, EST, fechaLarga, dinero,
  type TipoPaso, type Resultado, type EstadoExp,
} from '@/components/clientes/expediente-cliente';

interface IControl {
  tipo: TipoPaso;
  corridasReales: number;
  simulaciones: number;
  porResultado: Partial<Record<Resultado, number>>;
  ultima: string | null;
  proveedores: string[];
}

interface ITablero {
  ventanaDias: number;
  corridas: { reales: number; simulaciones: number; porEstado: Partial<Record<EstadoExp, number>> };
  controles: IControl[];
  cobertura: { clientesActivos: number; conVerificacionReal: number; sinVerificacion: number };
  recientes: Array<{
    id: string; fecha: string; clienteId: string; cliente: string; flujoNombre: string;
    estado: EstadoExp; puntaje: number; limiteSolicitado: number; simulacion: boolean;
  }>;
}

const VENTANAS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
  { dias: 365, etiqueta: '1 año' },
];

/* El orden en que se leen los resultados: primero lo que decidió, después lo
   que no pudo decidir. Así la barra se lee de bueno a malo sin leyenda. */
const ORDEN_RESULTADO: Resultado[] = [
  'APROBADO', 'RECHAZADO', 'INDETERMINADO', 'ERROR', 'NO_DISPONIBLE', 'OMITIDO',
];

const BARRA: Record<Resultado, string> = {
  APROBADO: 'bg-emerald-500',
  RECHAZADO: 'bg-rose-500',
  INDETERMINADO: 'bg-amber-500',
  ERROR: 'bg-rose-400',
  NO_DISPONIBLE: 'bg-slate-300',
  OMITIDO: 'bg-slate-200',
};

export function TableroVerificaciones({ compacto = false }: { compacto?: boolean }) {
  const [dias, setDias] = useState(90);
  const [datos, setDatos] = useState<ITablero | null>(null);
  const [curp, setCurp] = useState<{ total: number } | 'sin-instalar' | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const d = await intentar<ITablero | null>(
      api.get<ITablero>(`/integracion/validacion/tablero?dias=${dias}`), null);
    setDatos(d);

    /* La consulta de CURP es de otro módulo y puede no estar instalada. Se
       pregunta aparte y su fallo no tumba el tablero. */
    const c = await intentar<{ total?: number } | null>(
      api.get<{ total?: number }>('/rpa/curp/historial'), null);
    setCurp(c && typeof c.total === 'number' ? { total: c.total } : 'sin-instalar');
    setCargando(false);
  }, [dias]);

  useEffect(() => { void cargar(); }, [cargar]);

  const porTipo = new Map((datos?.controles ?? []).map((c) => [c.tipo, c]));
  const totalReales = datos?.corridas.reales ?? 0;
  const cobertura = datos?.cobertura;
  const porcentaje = cobertura && cobertura.clientesActivos > 0
    ? Math.round((cobertura.conVerificacionReal / cobertura.clientesActivos) * 100)
    : 0;

  return (
    <section className="space-y-4">
      {/* ── Cabecera ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-[18px] h-[18px] text-emerald-600" />
            Control de verificaciones
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Qué se ha comprobado en toda la cartera, control por control. Las simulaciones
            se cuentan aparte: se hicieron, pero no habilitan ninguna autorización.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {compacto ? (
            <Link href="/dashboard/creditos/verificacion"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-700">
              Ver el tablero completo <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {VENTANAS.map((v) => (
                  <button key={v.dias} onClick={() => setDias(v.dias)}
                    className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                      dias === v.dias ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                    {v.etiqueta}
                  </button>
                ))}
              </div>
              <Link href="/dashboard/creditos/verificacion/ejecutar"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-[13px] font-semibold shadow-sm transition-all active:scale-95">
                <Play className="w-4 h-4" /> Verificar a un cliente
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Los cuatro números ──────────────────────────────────────────
          En la cartera de clientes no se repiten: esa pantalla ya tiene los
          suyos arriba y dos filas de cifras seguidas se anulan entre sí. */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${compacto ? 'hidden' : ''}`}>
        <Indicador etiqueta="Verificaciones reales" valor={totalReales} cargando={cargando}
          detalle={`en los últimos ${datos?.ventanaDias ?? dias} días`} color="#4f46e5" />
        <Indicador etiqueta="Ensayos simulados" valor={datos?.corridas.simulaciones ?? 0} cargando={cargando}
          detalle="no autorizan líneas" color="#64748b" icono={<FlaskConical className="w-4 h-4" />} />
        <Indicador etiqueta="Clientes verificados" valor={cobertura?.conVerificacionReal ?? 0} cargando={cargando}
          detalle={`${porcentaje}% de la cartera activa`} color="#059669" />
        <Indicador etiqueta="Sin verificar" valor={cobertura?.sinVerificacion ?? 0} cargando={cargando}
          detalle="nunca pasaron por el flujo" color={cobertura?.sinVerificacion ? '#d97706' : '#64748b'} />
      </div>

      {/* ── Control por control ───────────────────────────────────────── */}
      <div>
        <h3 className="text-[13px] font-bold text-slate-700 mb-2">Control por control</h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {CONTROLES.map(({ tipo, nombre, que, Icono }) => {
            const c = porTipo.get(tipo);
            const reales = c?.corridasReales ?? 0;
            const entradas = ORDEN_RESULTADO
              .map((r) => [r, c?.porResultado?.[r] ?? 0] as const)
              .filter(([, n]) => n > 0);
            return (
              <article key={tipo} className="panel p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icono className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{nombre}</p>
                  </div>
                  {c?.simulaciones ? (
                    <span title={`${c.simulaciones} ensayo(s) simulado(s)`}
                      className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5">
                      <FlaskConical className="w-3 h-3" /> {c.simulaciones}
                    </span>
                  ) : null}
                </div>

                <p className="text-[26px] font-bold leading-none cifra text-slate-900">{reales}</p>

                {reales === 0 ? (
                  /* «0 aprobados» y «nunca corrió» se confunden a la vista. */
                  <p className="text-[11.5px] text-slate-400">
                    Nunca se ha ejecutado sobre un cliente real. <span className="text-slate-300">{que}</span>
                  </p>
                ) : (
                  <>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                      {entradas.map(([r, n]) => (
                        <div key={r} className={BARRA[r]} style={{ width: `${(n / reales) * 100}%` }}
                          title={`${RES[r].nombre}: ${n}`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {entradas.map(([r, n]) => (
                        <span key={r}
                          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold ${RES[r].clase}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${RES[r].punto}`} />
                          {RES[r].nombre} {n}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Última: {fechaLarga(c?.ultima ?? undefined)}
                      {c?.proveedores?.length ? ` · ${c.proveedores.join(', ')}` : ''}
                    </p>
                  </>
                )}
              </article>
            );
          })}

          {/* CURP vive en el módulo de RPA, no en el flujo. Se muestra igual. */}
          <article className="panel p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <IdCard className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-[13px] font-semibold text-slate-800">Consulta de CURP</p>
            </div>
            {curp === 'sin-instalar' ? (
              <>
                <p className="text-[26px] font-bold leading-none cifra text-slate-300">—</p>
                <p className="text-[11.5px] text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  El módulo existe pero su tabla no está creada: faltan migraciones por correr.
                </p>
              </>
            ) : (
              <>
                <p className="text-[26px] font-bold leading-none cifra text-slate-900">
                  {typeof curp === 'object' && curp ? curp.total : 0}
                </p>
                <p className="text-[11.5px] text-slate-400">
                  Consultas al registro nacional. Se cuentan desde que se instaló el módulo, no
                  por ventana.
                </p>
              </>
            )}
          </article>
        </div>
      </div>

      {/* ── Últimas corridas ──────────────────────────────────────────── */}
      {!compacto && (
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-bold text-slate-700">Últimas corridas</h3>
              <p className="text-[11.5px] text-slate-500">
                De la más reciente a la más antigua, con el veredicto que produjo cada una.
              </p>
            </div>
            {cargando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {(datos?.recientes?.length ?? 0) === 0 ? (
            <div className="p-6 text-center text-[13px] text-slate-500">
              Todavía no se ha corrido ninguna verificación en esta empresa.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {datos!.recientes.map((r) => {
                const est = EST[r.estado] ?? EST.EN_PROCESO;
                return (
                  <Link key={r.id} href={`/dashboard/clientes/${r.clienteId}/expediente`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">
                        {r.cliente}
                        {r.simulacion && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 align-middle">
                            <FlaskConical className="w-3 h-3" /> ensayo
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {fechaLarga(r.fecha)} · {r.flujoNombre} · solicitó {dinero(r.limiteSolicitado)}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 hidden sm:block">
                      puntaje {r.puntaje}
                    </span>
                    <span className={`shrink-0 text-[11px] font-semibold rounded-md border px-2 py-0.5 ${est.clase}`}>
                      {est.nombre}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 group-hover:text-slate-500" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
