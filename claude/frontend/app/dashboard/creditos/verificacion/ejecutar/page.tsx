"use client";

/**
 * ============================================================================
 * Crédito → Verificación → Ejecutar
 * ----------------------------------------------------------------------------
 * La pantalla hermana de la que diseña el flujo. Aquí se CORRE sobre una
 * persona concreta y sale un veredicto con su expediente.
 *
 * El motor y sus tres rutas —`ejecutar`, `simular`, `expedientes`— llevaban
 * tiempo construidos y no tenían un solo consumidor: se podía diseñar el flujo
 * y no había forma de usarlo sin abrir una consola. Ésta es esa cara.
 *
 * Cuatro cosas gobiernan el diseño, y todas salen de cómo se comporta el motor:
 *
 *  1. UN VEREDICTO NO ES UNA AUTORIZACIÓN. El flujo produce un expediente y
 *     una recomendación; la línea la sigue otorgando el flujo de aprobaciones.
 *     Se dice en la pantalla para que nadie crea que aquí se presta dinero.
 *
 *  2. UNA SIMULACIÓN NO DESBLOQUEA NADA. El candado que exige expediente
 *     favorable antes de autorizar ignora a propósito los expedientes
 *     simulados. Sin avisarlo, alguien simula un camino perfecto y luego no
 *     entiende por qué la aprobación lo rechaza. Se avisa dos veces: antes de
 *     simular y en el resultado.
 *
 *  3. «NO HAY PROVEEDOR» NO ES «EL PROVEEDOR DIJO NO». El motor distingue
 *     NO_DISPONIBLE de RECHAZADO, y la pantalla también: en gris lo que no se
 *     pudo averiguar, en rojo lo que se averiguó y salió mal. Confundirlos es
 *     la forma más fácil de negarle crédito a alguien por un contrato que la
 *     empresa no ha firmado.
 *
 *  4. EL PUNTAJE NO MANDA SOLO. Un expediente puede sacar 100 y quedar en
 *     revisión humana porque el tope automático del flujo es cero. Por eso el
 *     veredicto se explica contra las dos reglas —puntaje mínimo y tope—, no
 *     como un número suelto.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck, Play, FlaskConical, Loader2, AlertCircle, CheckCircle2,
  XCircle, HelpCircle, UserSearch, ArrowLeft, FileText, Info, MinusCircle,
} from 'lucide-react';
import { api, ApiError, intentar } from '@/lib/api';

type TipoPaso =
  | 'IDENTIDAD_INE' | 'BURO_CREDITO' | 'CIRCULO_CREDITO' | 'HISTORIAL_INTERNO'
  | 'LISTA_BLOQUEO' | 'POLITICA_INTERNA' | 'REVISION_MANUAL';

type Resultado =
  | 'APROBADO' | 'RECHAZADO' | 'INDETERMINADO' | 'NO_DISPONIBLE' | 'OMITIDO' | 'ERROR';

type Politica = 'BLOQUEANTE' | 'DERIVA_A_REVISION' | 'INFORMATIVO';

type Estado =
  | 'EN_PROCESO' | 'APROBADA' | 'APROBADA_CON_AJUSTE' | 'RECHAZADA' | 'REVISION_MANUAL';

interface IPasoEjecutado {
  orden: number;
  tipo: TipoPaso;
  etiqueta: string;
  politica: Politica;
  resultado: Resultado;
  puntaje?: number | null;
  puntosAportados: number;
  proveedor?: string | null;
  detalle?: string | null;
}

interface IEjecucion {
  id: string;
  clienteId: string;
  flujoNombre: string;
  flujoVersion: number;
  limiteSolicitado: string | number;
  limiteSugerido: string | number;
  puntaje: number;
  estado: Estado;
  motivos?: string[] | null;
  simulacion: boolean;
  fechaCreacion?: string;
}

interface IRespuesta {
  ejecucion: IEjecucion;
  pasos: IPasoEjecutado[];
}

interface IFlujo {
  id: string;
  nombre: string;
  activo?: boolean;
  topeAutomatico?: number | string;
  puntajeMinimo?: number;
  pasos?: { tipo: TipoPaso; etiqueta: string; politica?: Politica; peso?: number }[];
}

interface ICliente {
  id: string;
  nombre: string;
  rfc?: string | null;
  limiteCredito?: number | string | null;
  estadoCredito?: string | null;
}

/** Cómo se lee cada resultado de paso. El gris es deliberado: no es un fallo. */
const RESULTADOS: Record<Resultado, { nombre: string; clase: string; Icono: typeof CheckCircle2 }> = {
  APROBADO:      { nombre: 'Aprobado',      clase: 'text-green-700 bg-green-50 border-green-200',    Icono: CheckCircle2 },
  RECHAZADO:     { nombre: 'Rechazado',     clase: 'text-red-700 bg-red-50 border-red-200',          Icono: XCircle },
  INDETERMINADO: { nombre: 'Sin concluir',  clase: 'text-amber-700 bg-amber-50 border-amber-200',    Icono: HelpCircle },
  NO_DISPONIBLE: { nombre: 'Sin proveedor', clase: 'text-gray-600 bg-gray-50 border-gray-200',       Icono: MinusCircle },
  OMITIDO:       { nombre: 'No aplicaba',   clase: 'text-gray-600 bg-gray-50 border-gray-200',       Icono: MinusCircle },
  ERROR:         { nombre: 'Falló la consulta', clase: 'text-red-700 bg-red-50 border-red-200',      Icono: AlertCircle },
};

const ESTADOS: Record<Estado, { nombre: string; que: string; clase: string; Icono: typeof CheckCircle2 }> = {
  APROBADA: {
    nombre: 'Aprobada',
    que: 'El expediente sale favorable y el monto cabe en el tope automático del flujo.',
    clase: 'bg-green-50 border-green-200 text-green-900', Icono: CheckCircle2,
  },
  APROBADA_CON_AJUSTE: {
    nombre: 'Aprobada con ajuste',
    que: 'Favorable, pero por menos de lo que se pidió. El límite sugerido es el que cabe.',
    clase: 'bg-emerald-50 border-emerald-200 text-emerald-900', Icono: CheckCircle2,
  },
  REVISION_MANUAL: {
    nombre: 'A revisión humana',
    que: 'Nada lo rechaza, pero el flujo no lo aprueba solo. Alguien tiene que mirarlo.',
    clase: 'bg-amber-50 border-amber-200 text-amber-900', Icono: HelpCircle,
  },
  RECHAZADA: {
    nombre: 'Rechazada',
    que: 'Un paso bloqueante salió mal. No se puede autorizar la línea con este expediente.',
    clase: 'bg-red-50 border-red-200 text-red-900', Icono: XCircle,
  },
  EN_PROCESO: {
    nombre: 'En proceso',
    que: 'El flujo no terminó.',
    clase: 'bg-gray-50 border-gray-200 text-gray-900', Icono: Loader2,
  },
};

const RESULTADOS_FORZABLES: Resultado[] =
  ['APROBADO', 'RECHAZADO', 'INDETERMINADO', 'NO_DISPONIBLE'];

const dinero = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EjecutarVerificacionPage() {
  const parametros = useSearchParams();
  const [flujo, setFlujo] = useState<IFlujo | null>(null);
  const [clientes, setClientes] = useState<ICliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState<ICliente | null>(null);
  const [limite, setLimite] = useState('5000');
  const [folio, setFolio] = useState('');
  const [forzados, setForzados] = useState<Partial<Record<TipoPaso, Resultado>>>({});
  const [resultado, setResultado] = useState<IRespuesta | null>(null);
  const [historial, setHistorial] = useState<IEjecucion[]>([]);
  const [corriendo, setCorriendo] = useState<'real' | 'simulacion' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    void (async () => {
      const activo = await intentar<IFlujo | null>(
        api.get<IFlujo>('/integracion/validacion/flujos/activo'), null);
      setFlujo(activo);
      setCargando(false);
    })();
  }, []);

  /* Búsqueda de cliente. Se pide por filtro para no traer el padrón entero. */
  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const p = new URLSearchParams({ activos: 'true' });
        if (busqueda.trim()) p.set('filtro', busqueda.trim());
        const lista = await intentar<ICliente[]>(
          api.get<ICliente[]>(`/clientes?${p.toString()}`), []);
        setClientes(Array.isArray(lista) ? lista.slice(0, 8) : []);
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargarHistorial = useCallback(async (clienteId: string) => {
    const h = await intentar<IEjecucion[]>(
      api.get<IEjecucion[]>(`/integracion/validacion/expedientes?clienteId=${clienteId}`), []);
    setHistorial(Array.isArray(h) ? h : []);
  }, []);

  /*
   * Llegar aquí desde la bandeja de aprobaciones con el cliente y el importe
   * puestos.
   *
   * El importe importa tanto como el cliente: el expediente vale sólo hasta la
   * cifra por la que se hizo, y el valor por omisión de esta pantalla son
   * 5.000. Traer a alguien a verificar una línea de 20.000 y dejarle el campo
   * en 5.000 es fabricar el mismo bloqueo otra vez, un paso más adelante.
   */
  useEffect(() => {
    const clienteId = parametros.get('cliente');
    const importe = parametros.get('limite');
    if (importe && Number(importe) > 0) setLimite(String(Number(importe)));
    if (!clienteId) return;
    void (async () => {
      const encontrado = await intentar<ICliente | null>(
        api.get<ICliente>(`/clientes/${clienteId}`), null);
      if (!encontrado) return;
      setCliente(encontrado);
      void cargarHistorial(encontrado.id);
    })();
  }, [parametros, cargarHistorial]);

  const elegir = (c: ICliente) => {
    setCliente(c);
    setClientes([]);
    setBusqueda('');
    setResultado(null);
    void cargarHistorial(c.id);
  };

  const correr = async (modo: 'real' | 'simulacion') => {
    if (!cliente) return;
    setError(null);
    setCorriendo(modo);
    setResultado(null);
    try {
      const cuerpo: Record<string, unknown> = {
        clienteId: cliente.id,
        limiteSolicitado: Number(limite) || 0,
      };
      if (folio.trim()) cuerpo.folioAutorizacionBuro = folio.trim();
      if (modo === 'simulacion' && Object.keys(forzados).length) cuerpo.simulado = forzados;

      const r = await api.post<IRespuesta>(
        `/integracion/validacion/${modo === 'real' ? 'ejecutar' : 'simular'}`, cuerpo);
      setResultado(r);
      await cargarHistorial(cliente.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo correr la verificación.');
    } finally {
      setCorriendo(null);
    }
  };

  const pasosDelFlujo = flujo?.pasos ?? [];
  const tope = Number(flujo?.topeAutomatico ?? 0);
  const minimo = Number(flujo?.puntajeMinimo ?? 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/dashboard/creditos/verificacion"
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver al diseño del flujo
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          Verificar a un cliente
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Corre el flujo activo sobre una persona y produce su expediente. El veredicto es una
          recomendación: la línea la sigue otorgando el flujo de aprobaciones.
        </p>
      </div>

      {cargando && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando el flujo activo…
        </div>
      )}

      {!cargando && !flujo && (
        <div className="p-4 rounded-lg border bg-amber-50 border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">No hay ningún flujo activo</p>
            <p className="text-sm text-gray-600">
              Sin flujo no hay nada que correr, y la línea de crédito se autoriza sólo con la
              política general. Diséñalo y actívalo primero.
            </p>
            <Link href="/dashboard/creditos/verificacion"
              className="inline-block mt-2 text-sm text-emerald-700 hover:underline">
              Ir al diseño del flujo →
            </Link>
          </div>
        </div>
      )}

      {!cargando && flujo && (
        <>
          <div className="mb-6 p-4 rounded-lg border bg-gray-50 border-gray-200">
            <p className="font-medium text-gray-900">{flujo.nombre}</p>
            <p className="text-sm text-gray-600 mt-0.5">
              {pasosDelFlujo.length} paso(s) · puntaje mínimo {minimo} ·{' '}
              {tope > 0
                ? <>aprobación automática hasta {dinero(tope)}</>
                : <><strong>sin aprobación automática</strong>: todo pasa por revisión humana, saque el puntaje que saque</>}
            </p>
          </div>

          {/* ── Cliente ─────────────────────────────────────────────── */}
          <div className="bg-white border rounded-lg p-5 mb-4">
            <label className="block text-sm text-gray-700 mb-1">Cliente o prospecto</label>
            {cliente ? (
              <div className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900">{cliente.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {cliente.rfc || 'sin RFC'} ·{' '}
                    {Number(cliente.limiteCredito ?? 0) > 0
                      ? `línea vigente ${dinero(cliente.limiteCredito)}`
                      : 'sin línea vigente'}
                  </p>
                </div>
                <button onClick={() => { setCliente(null); setResultado(null); setHistorial([]); }}
                  className="text-sm text-gray-500 hover:text-gray-700">Cambiar</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <UserSearch className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Busca por nombre o RFC…"
                    className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
                </div>
                {clientes.length > 0 && (
                  <div className="mt-2 border rounded-lg divide-y max-h-64 overflow-auto">
                    {clientes.map((c) => (
                      <button key={c.id} onClick={() => elegir(c)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {c.rfc || 'sin RFC'} ·{' '}
                          {Number(c.limiteCredito ?? 0) > 0
                            ? `línea ${dinero(c.limiteCredito)}`
                            : 'sin línea'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {cliente && (
            <div className="bg-white border rounded-lg p-5 mb-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Límite solicitado</label>
                  <input type="number" min="0" step="0.01" value={limite}
                    onChange={(e) => setLimite(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-500 mt-1">
                    El expediente queda atado a este importe. Autorizar más que esto obliga a
                    verificar de nuevo, para que nadie valide barato una vez y autorice caro después.
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Folio de autorización de buró <span className="text-gray-400">(si aplica)</span>
                  </label>
                  <input value={folio} onChange={(e) => setFolio(e.target.value)}
                    placeholder="Folio del consentimiento firmado"
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-500 mt-1">
                    Consultar un buró sin consentimiento del titular no es una falla técnica:
                    es una infracción. Sin folio, esos pasos no consultan.
                  </p>
                </div>
              </div>

              {/* ── Simulación ────────────────────────────────────── */}
              <div className="mt-5 pt-5 border-t">
                <div className="flex items-center gap-2 mb-1">
                  <FlaskConical className="w-4 h-4 text-indigo-600" />
                  <p className="text-sm font-medium text-gray-900">Forzar respuestas (simulación)</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Para ver cómo se comporta el flujo ante un buró bajo o una identidad rechazada sin
                  provocarlo de verdad. <strong>Un expediente simulado no habilita la autorización
                  de la línea</strong>: el candado los ignora a propósito.
                </p>
                <div className="space-y-2">
                  {pasosDelFlujo.map((p) => (
                    <div key={p.tipo} className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-gray-700 w-56 shrink-0">{p.etiqueta}</span>
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => setForzados(({ [p.tipo]: _, ...resto }) => resto)}
                          className={`px-2 py-1 text-xs rounded border ${
                            forzados[p.tipo] === undefined
                              ? 'bg-gray-800 text-white border-gray-800'
                              : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          real
                        </button>
                        {RESULTADOS_FORZABLES.map((r) => (
                          <button key={r}
                            onClick={() => setForzados((f) => ({ ...f, [p.tipo]: r }))}
                            className={`px-2 py-1 text-xs rounded border ${
                              forzados[p.tipo] === r
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            {RESULTADOS[r].nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => void correr('real')} disabled={corriendo !== null}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                  {corriendo === 'real'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Play className="w-4 h-4" />}
                  Verificar de verdad
                </button>
                <button onClick={() => void correr('simulacion')} disabled={corriendo !== null}
                  className="px-4 py-2 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center gap-2">
                  {corriendo === 'simulacion'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FlaskConical className="w-4 h-4" />}
                  Simular
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* ── Veredicto ───────────────────────────────────────────── */}
          {resultado && (() => {
            const e = resultado.ejecucion;
            const meta = ESTADOS[e.estado] ?? ESTADOS.EN_PROCESO;
            const { Icono } = meta;
            return (
              <div className="mb-4">
                <div className={`p-4 rounded-lg border ${meta.clase}`}>
                  <div className="flex items-start gap-3">
                    <Icono className="w-6 h-6 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-lg font-semibold">{meta.nombre}</p>
                        {e.simulacion && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            simulación
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5">{meta.que}</p>

                      <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
                        <div>
                          <p className="text-xs opacity-70">Puntaje</p>
                          <p className="font-semibold">
                            {e.puntaje} <span className="font-normal opacity-70">de mínimo {minimo}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs opacity-70">Solicitado</p>
                          <p className="font-semibold">{dinero(e.limiteSolicitado)}</p>
                        </div>
                        <div>
                          <p className="text-xs opacity-70">Sugerido por el flujo</p>
                          <p className="font-semibold">{dinero(e.limiteSugerido)}</p>
                        </div>
                      </div>

                      {e.simulacion && (
                        <p className="text-xs mt-3 flex items-start gap-1.5 opacity-90">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          Este expediente está marcado como simulación, así que
                          <strong className="mx-1">no habilita la autorización de la línea</strong>.
                          Para eso hay que correr «Verificar de verdad».
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {(e.motivos ?? []).length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {(e.motivos ?? []).map((m, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-gray-300 mt-1">•</span>{m}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 border rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Paso</th>
                        <th className="text-left px-3 py-2 font-medium">Si no aprueba</th>
                        <th className="text-left px-3 py-2 font-medium">Resultado</th>
                        <th className="text-right px-3 py-2 font-medium">Puntos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resultado.pasos.map((p) => {
                        const r = RESULTADOS[p.resultado] ?? RESULTADOS.INDETERMINADO;
                        const { Icono: Ir } = r;
                        return (
                          <tr key={`${p.orden}-${p.tipo}`}>
                            <td className="px-3 py-2">
                              <p className="text-gray-900">{p.orden}. {p.etiqueta}</p>
                              {p.detalle && <p className="text-xs text-gray-500">{p.detalle}</p>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {p.politica === 'BLOQUEANTE' && 'se rechaza'}
                              {p.politica === 'DERIVA_A_REVISION' && 'lo ve una persona'}
                              {p.politica === 'INFORMATIVO' && 'sólo resta puntos'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${r.clase}`}>
                                <Ir className="w-3 h-3" /> {r.nombre}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                              {p.puntosAportados > 0 ? `+${p.puntosAportados}` : p.puntosAportados}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {resultado.pasos.length < pasosDelFlujo.length && (
                    <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                      El flujo se detuvo en el paso {resultado.pasos.length}: un paso bloqueante que
                      no aprueba no deja seguir, así que los siguientes no se consultaron.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Historial ───────────────────────────────────────────── */}
          {cliente && historial.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <p className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-gray-400" />
                Expedientes de este cliente
              </p>
              <div className="divide-y">
                {historial.map((h) => {
                  const meta = ESTADOS[h.estado] ?? ESTADOS.EN_PROCESO;
                  return (
                    <div key={h.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm text-gray-900">
                          {meta.nombre}
                          {h.simulacion && <span className="ml-2 text-xs text-indigo-700">(simulación)</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {h.flujoNombre} v{h.flujoVersion} · solicitado {dinero(h.limiteSolicitado)} ·
                          puntaje {h.puntaje}
                          {h.fechaCreacion && ` · ${new Date(h.fechaCreacion).toLocaleString('es-MX')}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                El candado de aprobación busca el expediente más reciente <strong>no simulado</strong>.
                Si está RECHAZADA, o se hizo por menos de lo que se quiere autorizar, la autorización
                se niega y dice por qué.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
