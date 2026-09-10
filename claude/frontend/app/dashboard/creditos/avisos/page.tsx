"use client";

/**
 * ============================================================================
 * Crédito → Avisos del core
 * ----------------------------------------------------------------------------
 * Lo que el registro externo le cuenta al ERP. Hasta hace poco la integración
 * hablaba en un solo sentido —el ERP publicaba y el core aplicaba— y nada
 * volvía: un cobro capturado directamente en el portal del core no llegaba
 * nunca aquí, ni ese día ni después, y las dos carteras se separaban sin que
 * ningún reporte lo dijera.
 *
 * Esta pantalla existe para una sola pregunta: «¿qué pasó allá que aquí no
 * está?». Por eso lo primero que se ve son los PENDIENTES, y el eco —la
 * mayoría de los avisos, que son la confirmación de lo que el ERP mismo
 * originó— queda detrás de un filtro.
 *
 * Aquí NO se aplica nada. Cerrar un aviso registra que alguien lo miró y qué
 * decidió; el reflejo real se hace con la operación del ERP que corresponda,
 * con sus validaciones. Aplicar un cobro desde aquí exigiría inventar la cuenta
 * de caja, el método y el asiento, que el aviso no trae.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, RefreshCw, AlertCircle, CheckCircle2, Archive, Loader2,
  ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { confirmarElegante } from '@/components/ui/dialogos';

type Estado = 'PENDIENTE' | 'PROCESADO' | 'IGNORADO' | 'FALLIDO' | 'DESCARTADO';

interface IAviso {
  id: string;
  entidad: string;
  accion: string;
  tenant: string | null;
  idExterno: string | null;
  entidadId: string | null;
  tipoVinculo: string | null;
  cuerpo: Record<string, unknown> | null;
  cuerpoTexto: string | null;
  estado: Estado;
  diagnostico: string | null;
  error: string | null;
  resueltoEn: string | null;
  recibidoEn: string;
}

interface IRespuesta {
  resumen: { estado: string; total: number }[];
  avisos: IAviso[];
}

/*
 * Los HUÉRFANOS son los avisos que no se pudieron atribuir a ninguna empresa,
 * porque hablan de un recurso que el ERP no conoce. Vienen por su propia ruta
 * —no tienen empresa por la cual filtrarlos— y hay que enseñarlos aparte.
 *
 * Son los más importantes de la pantalla: significan que en el core existe algo
 * que aquí nunca se creó. La primera versión no los mostraba, así que decía
 * «Nada pendiente» mientras había avisos esperando. Un tablero que calla es
 * peor que no tener tablero.
 */
interface IHuerfanos { avisos: IAviso[] }

/**
 * El orden no es alfabético ni por volumen: es por cuánto pide de quien mira.
 * Lo que exige una decisión va primero.
 */
const ESTADOS: { clave: Estado; etiqueta: string; color: string; fondo: string }[] = [
  { clave: 'PENDIENTE',  etiqueta: 'Piden algo',   color: '#b45309', fondo: '#fffbeb' },
  { clave: 'FALLIDO',    etiqueta: 'Fallaron',     color: '#b91c1c', fondo: '#fef2f2' },
  { clave: 'PROCESADO',  etiqueta: 'Resueltos',    color: '#15803d', fondo: '#f0fdf4' },
  { clave: 'DESCARTADO', etiqueta: 'Descartados',  color: '#6b7280', fondo: '#f9fafb' },
  { clave: 'IGNORADO',   etiqueta: 'Eco del ERP',  color: '#6b7280', fondo: '#f9fafb' },
];

const fecha = (v: string | null) =>
  v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AvisosDelCorePage() {
  const [datos, setDatos] = useState<IRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Estado | 'TODOS'>('PENDIENTE');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [huerfanos, setHuerfanos] = useState<IAviso[]>([]);

  const cargar = useCallback(async (estado: Estado | 'TODOS') => {
    setCargando(true);
    setError(null);
    try {
      const q = estado === 'TODOS' ? '' : `?estado=${estado}`;
      const [propios, sinEmpresa] = await Promise.all([
        api.get<IRespuesta>(`/integracion/avisos${q}`),
        // Si el rol no alcanza para verlos, la pantalla sigue funcionando.
        api.get<IHuerfanos>('/integracion/avisos/huerfanos').catch(() => ({ avisos: [] })),
      ]);
      setDatos(propios);
      setHuerfanos(sinEmpresa.avisos ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible leer el buzón.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(filtro); }, [cargar, filtro]);

  const resolver = async (aviso: IAviso, decision: 'PROCESADO' | 'DESCARTADO') => {
    const texto =
      decision === 'PROCESADO'
        ? '¿Ya reflejaste este hecho en el ERP? El aviso deja de señalarse, pero esta pantalla no aplica nada por su cuenta.'
        : '¿Descartar este aviso? Queda registrado que se decidió no aplicarlo.';
    if (!(await confirmarElegante(texto, { titulo: 'Cerrar aviso' }))) return;

    setTrabajando(aviso.id);
    try {
      await api.patch(`/integracion/avisos/${aviso.id}/resolver`, { decision });
      await cargar(filtro);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible cerrar el aviso.');
    } finally {
      setTrabajando(null);
    }
  };

  const totalDe = (clave: string) =>
    datos?.resumen.find((r) => r.estado === clave)?.total ?? 0;

  const pendientes = totalDe('PENDIENTE') + totalDe('FALLIDO');
  const huerfanosPendientes = huerfanos.filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'FALLIDO',
  );
  // El titular cuenta las dos cosas: un huérfano pendiente también pide algo.
  const pidenAlgo = pendientes + huerfanosPendientes.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-amber-600" />
            Avisos del core
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lo que pasó en el registro externo. Aquí sólo se revisa y se cierra: el reflejo se hace
            con la operación del ERP que corresponda.
          </p>
        </div>
        <button
          onClick={() => void cargar(filtro)}
          className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/*
        El titular no es «cuántos avisos llegaron» sino «cuántos piden algo».
        Un buzón con mil ecos y cero pendientes está sano, y un contador total
        lo haría parecer un problema.
      */}
      <div className={`mb-6 p-4 rounded-lg border ${pidenAlgo > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-3">
          {pidenAlgo > 0
            ? <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            : <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
          <div>
            <p className="font-medium text-gray-900">
              {pidenAlgo > 0
                ? `${pidenAlgo} aviso(s) piden una decisión`
                : 'Nada pendiente'}
            </p>
            <p className="text-sm text-gray-600">
              {pidenAlgo > 0
                ? `Son hechos que ocurrieron en el core y que el ERP no tiene registrados${
                    huerfanosPendientes.length
                      ? `, ${huerfanosPendientes.length} de ellos sobre recursos que este ERP no conoce`
                      : ''
                  }.`
                : 'Todo lo recibido fue el eco de operaciones que el ERP mismo originó.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFiltro('TODOS')}
          className={`px-3 py-1.5 text-sm rounded-full border ${filtro === 'TODOS' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}
        >
          Todos
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e.clave}
            onClick={() => setFiltro(e.clave)}
            className={`px-3 py-1.5 text-sm rounded-full border ${filtro === e.clave ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}
          >
            {e.etiqueta} · {totalDe(e.clave)}
          </button>
        ))}
      </div>

      {huerfanos.length > 0 && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Sin correspondencia en el ERP
            </h2>
            <span className="text-xs text-gray-500">
              {huerfanos.length} aviso(s) sobre recursos que este ERP no conoce
            </span>
          </div>
          {/*
            Van arriba y aparte del filtro por estado: no se pueden atribuir a
            ninguna empresa, así que ningún filtro de esta pantalla los
            alcanzaría, y son justamente los que dicen que en el core existe
            algo que aquí nunca se creó.
          */}
          <div className="bg-white border border-amber-200 rounded-lg divide-y">
            {huerfanos.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full border font-medium border-amber-500 text-amber-700 bg-amber-50">
                    {a.estado}
                  </span>
                  <span className="font-mono text-sm text-gray-900">
                    {a.entidad}/{a.accion}
                  </span>
                  {a.idExterno && (
                    <span className="text-sm text-gray-500">recurso {a.idExterno}</span>
                  )}
                  <span className="text-sm text-gray-400 ml-auto">{fecha(a.recibidoEn)}</span>
                </div>
                {a.diagnostico && (
                  <p className="text-sm text-gray-700 mt-1.5">{a.diagnostico}</p>
                )}
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer">
                    Lo que mandó el core, tal cual
                  </summary>
                  <pre className="text-xs bg-gray-50 border rounded p-2 overflow-x-auto max-h-64 mt-1">
{JSON.stringify(a.cuerpo ?? a.cuerpoTexto ?? null, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            No se pueden cerrar desde aquí: sin empresa a la cual pertenecer, no hay a quién
            atribuir la decisión. Se resuelven dando de alta el recurso en el ERP, o aceptando que
            vive sólo en el core.
          </p>
        </div>
      )}

      <div className="bg-white border rounded-lg divide-y">
        {cargando && (
          <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Consultando el buzón…
          </div>
        )}

        {!cargando && (datos?.avisos.length ?? 0) === 0 && (
          <div className="p-8 text-center text-gray-500">
            <p>No hay avisos en este estado.</p>
            {filtro === 'PENDIENTE' && (
              <p className="text-sm mt-1">
                Si el hook está dado de alta y nunca llega nada, revisa que el core pueda alcanzar
                la dirección del ERP.
              </p>
            )}
          </div>
        )}

        {!cargando && datos?.avisos.map((a) => {
          const meta = ESTADOS.find((e) => e.clave === a.estado);
          const expandido = abierto === a.id;
          const pideAlgo = a.estado === 'PENDIENTE' || a.estado === 'FALLIDO';
          return (
            <div key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setAbierto(expandido ? null : a.id)}
                  className="mt-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label={expandido ? 'Ocultar el detalle' : 'Ver el detalle'}
                >
                  {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="px-2 py-0.5 text-xs rounded-full border font-medium"
                      style={{ color: meta?.color, background: meta?.fondo, borderColor: meta?.color }}
                    >
                      {meta?.etiqueta ?? a.estado}
                    </span>
                    <span className="font-mono text-sm text-gray-900">
                      {a.entidad}/{a.accion}
                    </span>
                    {a.idExterno && (
                      <span className="text-sm text-gray-500">recurso {a.idExterno}</span>
                    )}
                    <span className="text-sm text-gray-400 ml-auto">{fecha(a.recibidoEn)}</span>
                  </div>

                  {a.diagnostico && (
                    <p className="text-sm text-gray-700 mt-1.5">{a.diagnostico}</p>
                  )}
                  {a.error && (
                    <p className="text-sm text-red-700 mt-1">{a.error}</p>
                  )}

                  {expandido && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>Entidad del ERP: <span className="font-mono">{a.entidadId ?? '—'}</span></div>
                        <div>Tipo de vínculo: <span className="font-mono">{a.tipoVinculo ?? '—'}</span></div>
                        <div>Inquilino: <span className="font-mono">{a.tenant ?? '—'}</span></div>
                        <div>Resuelto: {fecha(a.resueltoEn)}</div>
                      </div>
                      {/*
                        El cuerpo tal como llegó. Cuando algo no cuadre, la pregunta va a ser
                        «¿qué mandó exactamente el core?», y una versión ya interpretada por
                        nosotros no puede contestarla.
                      */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Lo que mandó el core, tal cual:</p>
                        <pre className="text-xs bg-gray-50 border rounded p-2 overflow-x-auto max-h-64">
{JSON.stringify(a.cuerpo ?? a.cuerpoTexto ?? null, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {pideAlgo && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        disabled={trabajando === a.id}
                        onClick={() => void resolver(a, 'PROCESADO')}
                        className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ya lo reflejé
                      </button>
                      <button
                        disabled={trabajando === a.id}
                        onClick={() => void resolver(a, 'DESCARTADO')}
                        className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        No aplica
                      </button>
                      {a.entidad === 'LOAN' && a.entidadId && (
                        <a
                          href={`/dashboard/creditos/creditos?credito=${a.entidadId}`}
                          className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir el crédito
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-4">
        «Ya lo reflejé» no aplica nada: registra que una persona lo revisó. El movimiento se captura
        con la operación del ERP que corresponda, porque un cobro necesita cuenta de caja, método y
        asiento, y el aviso no los trae.
      </p>
    </div>
  );
}
