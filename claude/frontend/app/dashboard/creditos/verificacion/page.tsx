"use client";

/**
 * ============================================================================
 * Crédito → Flujo de verificación
 * ----------------------------------------------------------------------------
 * Qué se le exige a una persona ANTES de otorgarle crédito: identidad, burós,
 * listas de bloqueo, historial propio, política interna, revisión humana.
 *
 * El motor lleva tiempo construido —siete evaluadores, expedientes, simulación—
 * y no había dónde configurarlo, así que era una capacidad invisible. Esta
 * pantalla es esa cara.
 *
 * Dos decisiones gobiernan el diseño:
 *
 *  1. La POLÍTICA de cada paso es lo importante, no el paso. Que un flujo
 *     consulte buró no dice nada; lo que decide el negocio es qué pasa cuando
 *     el buró sale bajo: se rechaza, lo ve una persona, o sólo resta puntos.
 *     Por eso la política se elige en el mismo renglón, no escondida.
 *
 *  2. Un flujo nuevo NACE INACTIVO y hay que activarlo aparte. Cambiar lo que
 *     se le exige a un solicitante es cambiar a quién se le presta; que eso
 *     ocurra por guardar un formulario sería demasiado fácil.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Plus, X, Play, Power, PauseCircle, Loader2, AlertCircle,
  CheckCircle2, GripVertical, FlaskConical, ChevronDown, ChevronRight, Pencil, Save,
} from 'lucide-react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { confirmarElegante } from '@/components/ui/dialogos';
import { TableroVerificaciones } from '@/components/verificaciones/tablero-verificaciones';

type TipoPaso =
  | 'IDENTIDAD_INE' | 'BURO_CREDITO' | 'CIRCULO_CREDITO' | 'HISTORIAL_INTERNO'
  | 'LISTA_BLOQUEO' | 'POLITICA_INTERNA' | 'REVISION_MANUAL';

type Politica = 'BLOQUEANTE' | 'DERIVA_A_REVISION' | 'INFORMATIVO';

interface IPaso {
  tipo: TipoPaso;
  etiqueta: string;
  politica?: Politica;
  peso?: number;
  umbralMinimo?: number | null;
  parametros?: Record<string, unknown>;
}

interface IFlujo {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  topeAutomatico?: number;
  puntajeMinimo?: number;
  pasos?: IPaso[];
}

/**
 * Qué significa cada paso en términos del negocio, no del sistema.
 * `exigeAutorizacion` marca los que legalmente requieren consentimiento
 * firmado del titular: consultar un buró sin él no es una falla técnica, es
 * una infracción.
 */
const CATALOGO: Record<TipoPaso, { nombre: string; que: string; exigeAutorizacion?: boolean }> = {
  IDENTIDAD_INE: {
    nombre: 'Identidad (INE)',
    que: 'Comprueba que la persona es quien dice. Con prueba de vida si el proveedor la ofrece.',
  },
  BURO_CREDITO: {
    nombre: 'Buró de Crédito',
    que: 'Historial crediticio en el sistema financiero.',
    exigeAutorizacion: true,
  },
  CIRCULO_CREDITO: {
    nombre: 'Círculo de Crédito',
    que: 'La otra sociedad de información crediticia. Cubre emisores distintos.',
    exigeAutorizacion: true,
  },
  HISTORIAL_INTERNO: {
    nombre: 'Historial en cartera propia',
    que: 'Cómo se ha portado este cliente contigo. No cuesta y suele predecir mejor.',
  },
  LISTA_BLOQUEO: {
    nombre: 'Listas de bloqueo',
    que: 'Listas internas o de terceros que impiden operar con la persona.',
  },
  POLITICA_INTERNA: {
    nombre: 'Política interna',
    que: 'Tu propia regla sobre el monto solicitado, sin consultar a nadie.',
  },
  REVISION_MANUAL: {
    nombre: 'Revisión humana',
    que: 'Una persona debe mirar el expediente. Nunca aprueba sola.',
  },
};

const POLITICAS: { valor: Politica; nombre: string; que: string; color: string }[] = [
  { valor: 'BLOQUEANTE', nombre: 'Bloquea', que: 'Si no aprueba, el crédito se rechaza y el flujo se detiene.', color: '#b91c1c' },
  { valor: 'DERIVA_A_REVISION', nombre: 'Manda a revisión', que: 'Si no aprueba, lo mira una persona antes de decidir.', color: '#b45309' },
  { valor: 'INFORMATIVO', nombre: 'Sólo informa', que: 'Suma o resta puntos. Nunca detiene nada.', color: '#6b7280' },
];

const PASO_VACIO: IPaso = {
  tipo: 'IDENTIDAD_INE',
  etiqueta: '',
  politica: 'BLOQUEANTE',
  peso: 20,
};

export default function FlujoVerificacionPage() {
  const [flujos, setFlujos] = useState<IFlujo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ nombre: string; descripcion: string; topeAutomatico: string; puntajeMinimo: string; pasos: IPaso[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  /*
   * Corregir un flujo ya creado, sin rediseñarlo.
   *
   * Un flujo nace con el nombre que alguien teclea de prisa y se queda con él
   * a la vista de todos, y hasta ahora sólo se podía arreglar en la base de
   * datos. Se editan su identificación y sus umbrales; los pasos no, porque
   * los expedientes ya ejecutados apuntan a ellos y cambiarlos reescribiría en
   * retrospectiva con qué reglas se aprobó un crédito ya otorgado. Para eso
   * está «Nuevo flujo», que crea otra versión.
   */
  const [edicion, setEdicion] = useState<
    { id: string; nombre: string; descripcion: string; topeAutomatico: string; puntajeMinimo: string } | null
  >(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFlujos(await api.get<IFlujo[]>('/integracion/validacion/flujos'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible leer los flujos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Parte de la plantilla del servidor: nadie debería empezar con una hoja en blanco. */
  const nuevoDesdePlantilla = async () => {
    try {
      const p = await api.get<{ nombre: string; descripcion: string; topeAutomatico: number; puntajeMinimo: number; pasos: IPaso[] }>(
        '/integracion/validacion/flujos/plantilla',
      );
      setEditor({
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        topeAutomatico: String(p.topeAutomatico ?? 0),
        puntajeMinimo: String(p.puntajeMinimo ?? 60),
        pasos: p.pasos ?? [],
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo leer la plantilla.');
    }
  };

  const guardar = async () => {
    if (!editor) return;
    if (!editor.pasos.length) { setError('Un flujo sin pasos no verifica nada.'); return; }
    if (editor.pasos.some((p) => !p.etiqueta.trim())) { setError('Cada paso necesita un nombre visible.'); return; }

    setGuardando(true);
    setError(null);
    try {
      await api.post('/integracion/validacion/flujos', {
        nombre: editor.nombre.trim(),
        descripcion: editor.descripcion.trim() || undefined,
        topeAutomatico: Number(editor.topeAutomatico) || 0,
        puntajeMinimo: Number(editor.puntajeMinimo) || 0,
        pasos: editor.pasos.map((p) => ({
          tipo: p.tipo,
          etiqueta: p.etiqueta.trim(),
          politica: p.politica,
          peso: Number(p.peso ?? 0),
          ...(p.umbralMinimo !== undefined && p.umbralMinimo !== null && String(p.umbralMinimo) !== ''
            ? { umbralMinimo: Number(p.umbralMinimo) }
            : {}),
        })),
      });
      setEditor(null);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el flujo.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async () => {
    if (!edicion) return;
    const nombre = edicion.nombre.trim();
    if (!nombre) {
      setError('El nombre del flujo no puede quedar vacío.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/integracion/validacion/flujos/${edicion.id}`, {
        nombre,
        descripcion: edicion.descripcion.trim(),
        topeAutomatico: Number(edicion.topeAutomatico || 0),
        puntajeMinimo: Number(edicion.puntajeMinimo || 0),
      });
      setEdicion(null);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (f: IFlujo) => {
    const activar = !f.activo;
    const mensaje = activar
      ? `Al activar «${f.nombre}», todas las solicitudes de crédito nuevas van a pasar por estos pasos. ¿Continuar?`
      : `Al desactivar «${f.nombre}», las solicitudes dejan de verificarse con él. ¿Continuar?`;
    if (!(await confirmarElegante(mensaje, { titulo: activar ? 'Activar flujo' : 'Desactivar flujo' }))) return;
    try {
      await api.patch(`/integracion/validacion/flujos/${f.id}/${activar ? 'activar' : 'desactivar'}`);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  const activo = flujos.find((f) => f.activo);

  return (
    <div className="p-6 lg:p-8 max-w-[1280px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-[20px] h-[20px] text-emerald-600" />
            Verificación de clientes
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Qué se comprueba antes de otorgar un crédito, cuánto se ha comprobado y qué pasa
            cuando algo no sale bien.
          </p>
        </div>
        {!editor && (
          <div className="flex items-center gap-2">
            {/* Disenar el flujo y correrlo son dos oficios distintos: quien lo
                disena lo hace una vez, quien lo corre lo hace cada dia. */}
            <Link href="/dashboard/creditos/verificacion/ejecutar"
              className="px-3 py-2 text-sm rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2">
              <Play className="w-4 h-4" /> Verificar a un cliente
            </Link>
            <button onClick={() => void nuevoDesdePlantilla()}
              className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nuevo flujo
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/*
        * El registro de lo que se ha verificado va ANTES del diseño del flujo.
        *
        * Esta pantalla enseñaba sólo la configuración —los pasos, el tope, el
        * puntaje— y eso es lo que se toca una vez al año. Lo que se consulta a
        * diario, y lo que pregunta cualquiera que audite, es cuánto se está
        * verificando de verdad y con qué resultado. El diseño del flujo queda
        * abajo, que es donde vive lo que casi nunca se cambia.
        */}
      {!editor && (
        <div className="mb-7">
          <TableroVerificaciones />
        </div>
      )}

      {!cargando && !editor && (
        <div className={`mb-6 p-4 rounded-lg border ${activo ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            {activo ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                    : <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />}
            <div>
              <p className="font-medium text-gray-900">
                {activo ? `Flujo activo: ${activo.nombre}` : 'Ningún flujo activo'}
              </p>
              <p className="text-sm text-gray-600">
                {activo
                  ? 'Toda solicitud de crédito nueva pasa por estos pasos.'
                  : 'Las solicitudes se otorgan sólo con la política de crédito general: no se verifica identidad, ni burós, ni listas.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor ────────────────────────────────────────────────────── */}
      {editor && (
        <div className="bg-white border rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Nuevo flujo</h2>
            <button onClick={() => setEditor(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Nombre</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editor.nombre} onChange={(e) => setEditor({ ...editor, nombre: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Descripción</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editor.descripcion} onChange={(e) => setEditor({ ...editor, descripcion: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Aprobación automática hasta</label>
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editor.topeAutomatico} onChange={(e) => setEditor({ ...editor, topeAutomatico: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">
                Cero significa que <strong>todo</strong> pasa por autorización humana, sin importar el puntaje.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Puntaje mínimo para aprobar</label>
              <input type="number" min="0" max="100" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editor.puntajeMinimo} onChange={(e) => setEditor({ ...editor, puntajeMinimo: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">Sobre 100. Cada paso aporta su peso si aprueba.</p>
            </div>
          </div>

          <div className="space-y-3">
            {editor.pasos.map((paso, i) => {
              const meta = CATALOGO[paso.tipo];
              return (
                <div key={i} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-gray-300 mt-2 shrink-0" />
                    <div className="flex-1 grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Paso {i + 1}</label>
                        <select className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                          value={paso.tipo}
                          onChange={(e) => {
                            const tipo = e.target.value as TipoPaso;
                            const copia = [...editor.pasos];
                            copia[i] = { ...paso, tipo, etiqueta: paso.etiqueta || CATALOGO[tipo].nombre };
                            setEditor({ ...editor, pasos: copia });
                          }}>
                          {(Object.keys(CATALOGO) as TipoPaso[]).map((t) => (
                            <option key={t} value={t}>{CATALOGO[t].nombre}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">{meta.que}</p>
                        {meta.exigeAutorizacion && (
                          <p className="text-xs text-amber-700 mt-1">
                            Requiere autorización firmada del titular. Sin folio, el paso no consulta.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Si no aprueba…</label>
                          <select className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                            value={paso.politica ?? 'BLOQUEANTE'}
                            onChange={(e) => {
                              const copia = [...editor.pasos];
                              copia[i] = { ...paso, politica: e.target.value as Politica };
                              setEditor({ ...editor, pasos: copia });
                            }}>
                            {POLITICAS.map((p) => <option key={p.valor} value={p.valor}>{p.nombre}</option>)}
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            {POLITICAS.find((p) => p.valor === (paso.politica ?? 'BLOQUEANTE'))?.que}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Peso</label>
                          <input type="number" min="-100" max="100" className="w-full border rounded-lg px-2 py-1.5 text-sm"
                            value={paso.peso ?? 0}
                            onChange={(e) => {
                              const copia = [...editor.pasos];
                              copia[i] = { ...paso, peso: Number(e.target.value) };
                              setEditor({ ...editor, pasos: copia });
                            }} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Umbral mínimo</label>
                          <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm"
                            placeholder="—"
                            value={paso.umbralMinimo ?? ''}
                            onChange={(e) => {
                              const copia = [...editor.pasos];
                              copia[i] = { ...paso, umbralMinimo: e.target.value === '' ? null : Number(e.target.value) };
                              setEditor({ ...editor, pasos: copia });
                            }} />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditor({ ...editor, pasos: editor.pasos.filter((_, j) => j !== i) })}
                      className="text-gray-400 hover:text-red-600 mt-2" aria-label="Quitar el paso">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={() => setEditor({ ...editor, pasos: [...editor.pasos, { ...PASO_VACIO }] })}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Agregar paso
            </button>
            <div className="flex-1" />
            <button onClick={() => setEditor(null)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={() => void guardar()} disabled={guardando}
              className="px-4 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Guardar como borrador
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Se guarda <strong>inactivo</strong>. Activarlo cambia a quién se le presta, y eso es un paso aparte.
          </p>
        </div>
      )}

      {/* ── Lista ─────────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg divide-y">
        {cargando && (
          <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        )}

        {!cargando && flujos.length === 0 && !editor && (
          <div className="p-8 text-center text-gray-500">
            <p>No hay ningún flujo definido.</p>
            <p className="text-sm mt-1">
              El motor existe —identidad, burós, listas, historial— pero sin flujo no se ejecuta nada.
            </p>
          </div>
        )}

        {!cargando && flujos.map((f) => {
          const expandido = abierto === f.id;
          return (
            <div key={f.id} className="p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => setAbierto(expandido ? null : f.id)}
                  className="mt-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label={expandido ? 'Ocultar los pasos' : 'Ver los pasos'}>
                  {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{f.nombre}</span>
                    {f.activo
                      ? <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700 border border-green-300">activo</span>
                      : <span className="px-2 py-0.5 text-xs rounded-full bg-gray-50 text-gray-600 border">borrador</span>}
                    <span className="text-xs text-gray-500">{f.pasos?.length ?? 0} paso(s)</span>
                  </div>
                  {f.descripcion && <p className="text-sm text-gray-600 mt-1">{f.descripcion}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    Aprobación automática hasta {Number(f.topeAutomatico ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                    {' · '}puntaje mínimo {f.puntajeMinimo ?? 0}
                  </p>

                  {expandido && (
                    <ol className="mt-3 space-y-1.5">
                      {(f.pasos ?? []).map((p, i) => {
                        const pol = POLITICAS.find((x) => x.valor === (p.politica ?? 'BLOQUEANTE'));
                        return (
                          <li key={i} className="text-sm flex flex-wrap items-center gap-2">
                            <span className="text-gray-400">{i + 1}.</span>
                            <span className="text-gray-900">{p.etiqueta}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded border"
                              style={{ color: pol?.color, borderColor: pol?.color }}>{pol?.nombre}</span>
                            <span className="text-xs text-gray-500">peso {p.peso ?? 0}</span>
                            {p.umbralMinimo != null && (
                              <span className="text-xs text-gray-500">umbral {p.umbralMinimo}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {edicion?.id === f.id ? (
                    <div className="mt-3 rounded-lg border bg-gray-50 p-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                        <input
                          value={edicion.nombre}
                          onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                          maxLength={120}
                          className="w-full px-2.5 py-1.5 text-sm border rounded-lg"
                          placeholder="Originación de crédito"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Descripción <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <input
                          value={edicion.descripcion}
                          onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })}
                          maxLength={500}
                          className="w-full px-2.5 py-1.5 text-sm border rounded-lg"
                          placeholder="Qué comprueba este flujo y para quién"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Aprobación automática hasta
                          </label>
                          <input
                            type="number" min={0} step="0.01"
                            value={edicion.topeAutomatico}
                            onChange={(e) => setEdicion({ ...edicion, topeAutomatico: e.target.value })}
                            className="w-full px-2.5 py-1.5 text-sm border rounded-lg text-right"
                          />
                          <p className="text-[11px] text-gray-500 mt-1">
                            El techo de la instalación manda: si aquí se pone más, se recorta.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Puntaje mínimo</label>
                          <input
                            type="number" min={0} max={100}
                            value={edicion.puntajeMinimo}
                            onChange={(e) => setEdicion({ ...edicion, puntajeMinimo: e.target.value })}
                            className="w-full px-2.5 py-1.5 text-sm border rounded-lg text-right"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Los pasos no se editan aquí: los expedientes ya ejecutados apuntan a ellos.
                        Para cambiarlos, crea un flujo nuevo y actívalo.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void guardarEdicion()}
                          disabled={guardando}
                          className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Guardar
                        </button>
                        <button
                          onClick={() => setEdicion(null)}
                          className="px-3 py-1.5 text-sm rounded-lg border hover:bg-white flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => void cambiarEstado(f)}
                        className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${
                          f.activo ? 'border hover:bg-gray-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                        {f.activo ? <PauseCircle className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        {f.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => setEdicion({
                          id: f.id,
                          nombre: f.nombre ?? '',
                          descripcion: f.descripcion ?? '',
                          topeAutomatico: String(f.topeAutomatico ?? 0),
                          puntajeMinimo: String(f.puntajeMinimo ?? 0),
                        })}
                        className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 flex items-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Este flujo produce un veredicto y un expediente; no otorga el crédito. La autorización sigue
        pasando por el flujo de aprobaciones de siempre.
      </p>
    </div>
  );
}
