"use client";
/**
 * ============================================================================
 * SyncroERP · CRM — actividades
 * ----------------------------------------------------------------------------
 * Esto es lo que un vendedor abre en la mañana. Por eso lo atrasado va primero
 * y en rojo: si algo se venció, importa más que lo de hoy. Completar una
 * actividad exige escribir el resultado, porque una llamada sin registro de
 * lo que se dijo no sirve de nada la próxima vez.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, FileText, Handshake, Mail,
  MapPin, Phone, Plus, StickyNote,
} from 'lucide-react';

import { api } from '@/lib/api';
import { fechaHora, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Actividad {
  id: string;
  tipo: string;
  asunto: string;
  detalle?: string;
  fechaProgramada: string;
  fechaRealizada?: string;
  duracionMinutos: number;
  completada: boolean;
  resultado?: string;
  vencida?: boolean;
  oportunidadId?: string;
}

interface Oportunidad { id: string; folio: string; titulo: string }

interface Agenda {
  hoy: Actividad[];
  vencidas: Actividad[];
  resumen: {
    pendientesHoy: number;
    atrasadas: number;
    porTipo: Array<{ tipo: string; cantidad: number }>;
  };
}

const TIPOS = [
  { valor: 'LLAMADA',   etiqueta: 'Llamada',   Icono: Phone },
  { valor: 'CORREO',    etiqueta: 'Correo',    Icono: Mail },
  { valor: 'REUNION',   etiqueta: 'Reunión',   Icono: Handshake },
  { valor: 'VISITA',    etiqueta: 'Visita',    Icono: MapPin },
  { valor: 'PROPUESTA', etiqueta: 'Propuesta', Icono: FileText },
  { valor: 'NOTA',      etiqueta: 'Nota',      Icono: StickyNote },
];

const iconoDe = (tipo: string) => TIPOS.find((t) => t.valor === tipo)?.Icono ?? StickyNote;
const etiquetaDe = (tipo: string) => TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;

export default function ActividadesPage() {
  const { avisar } = useAvisos();
  const hoy = new Date();

  const [desde, setDesde] = useState(isoCorto(new Date(hoy.getTime() - 7 * 86_400_000)));
  const [hasta, setHasta] = useState(isoCorto(new Date(hoy.getTime() + 30 * 86_400_000)));
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [aCompletar, setACompletar] = useState<Actividad | null>(null);

  const agenda = useDatos<Agenda>(() => api.get('/crm/agenda'), []);
  const oportunidades = useDatos<Oportunidad[]>(
    () => api.get('/crm/oportunidades', { query: { soloAbiertas: 'true' } }),
    [],
  );
  const actividades = useDatos<Actividad[]>(
    () => api.get('/crm/actividades', {
      query: { desde, hasta, pendientes: soloPendientes ? 'true' : undefined },
    }),
    [desde, hasta, soloPendientes],
  );

  const crear = useAccion(async (datos: Record<string, unknown>) => {
    await api.post('/crm/actividades', datos);
    avisar('Actividad agendada.', 'exito');
    setModalAbierto(false);
    void actividades.recargar();
    void agenda.recargar();
  });

  const completar = useAccion(async (id: string, resultado: string) => {
    await api.patch(`/crm/actividades/${id}/completar`, { resultado });
    avisar('Actividad completada.', 'exito');
    setACompletar(null);
    void actividades.recargar();
    void agenda.recargar();
  });

  const tituloOportunidad = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of oportunidades.datos ?? []) m.set(o.id, `${o.folio} · ${o.titulo}`);
    return m;
  }, [oportunidades.datos]);

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Actividades"
        descripcion="Llamadas, reuniones y seguimiento comercial"
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            Agendar actividad
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Atrasadas"
          color={(agenda.datos?.resumen?.atrasadas ?? 0) > 0 ? '#e11d48' : '#64748b'}
          cargando={agenda.cargando}
          icono={<CalendarClock className="w-4 h-4" />}
          valor={agenda.datos?.resumen?.atrasadas ?? 0}
          detalle="pendientes de fechas pasadas"
        />
        <Indicador
          etiqueta="Para hoy" color="#ea580c" cargando={agenda.cargando}
          valor={agenda.datos?.resumen?.pendientesHoy ?? 0}
        />
        <Indicador
          etiqueta="En el rango" color="#0f172a" cargando={actividades.cargando}
          valor={actividades.datos?.length ?? 0}
        />
        <Indicador
          etiqueta="Oportunidades abiertas" color="#4f46e5" cargando={oportunidades.cargando}
          valor={oportunidades.datos?.length ?? 0}
        />
      </div>

      {/* Lo atrasado va primero: si venció, importa más que lo de hoy */}
      {(agenda.datos?.vencidas?.length ?? 0) > 0 && (
        <Panel
          sinRelleno
          className="mb-4 border-l-[3px] border-l-rose-400"
          titulo="Atrasadas"
          accion={
            <span className="text-[11.5px] text-rose-600 font-semibold cifra">
              {agenda.datos!.vencidas.length}
            </span>
          }
        >
          <ListaActividades
            actividades={agenda.datos!.vencidas}
            tituloOportunidad={tituloOportunidad}
            onCompletar={setACompletar}
            resaltarVencidas
          />
        </Panel>
      )}

      {/* Agenda del día */}
      {(agenda.datos?.hoy?.length ?? 0) > 0 && (
        <Panel sinRelleno className="mb-4" titulo="Hoy">
          <ListaActividades
            actividades={agenda.datos!.hoy}
            tituloOportunidad={tituloOportunidad}
            onCompletar={setACompletar}
          />
        </Panel>
      )}

      {/* Rango completo */}
      <Panel sinRelleno>
        <div className="panel-cabecera flex-wrap">
          <div className="flex items-center gap-2">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" />
            <span className="text-slate-300 text-[12px]">a</span>
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
              className="accent-orange-500"
            />
            Solo pendientes
          </label>
        </div>

        {actividades.cargando ? (
          <Cargando />
        ) : actividades.error ? (
          <ErrorPantalla mensaje={actividades.error} onReintentar={actividades.recargar} />
        ) : (actividades.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo={soloPendientes ? 'Nada pendiente en este rango' : 'Sin actividades en este rango'}
            descripcion="Agenda llamadas y reuniones para no perder el seguimiento de tus oportunidades."
            icono={<CalendarClock className="w-5 h-5" />}
            accion={
              <Boton variante="primario" onClick={() => setModalAbierto(true)}>
                Agendar la primera
              </Boton>
            }
          />
        ) : (
          <ListaActividades
            actividades={actividades.datos!}
            tituloOportunidad={tituloOportunidad}
            onCompletar={setACompletar}
          />
        )}
      </Panel>

      <ModalNuevaActividad
        abierto={modalAbierto}
        oportunidades={oportunidades.datos ?? []}
        guardando={crear.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void crear.ejecutar(d)}
      />

      {aCompletar && (
        <ModalCompletar
          actividad={aCompletar}
          procesando={completar.ejecutando}
          onCerrar={() => setACompletar(null)}
          onConfirmar={(r) => void completar.ejecutar(aCompletar.id, r)}
        />
      )}
    </div>
  );
}

/* ── Lista ────────────────────────────────────────────────────────────────── */

function ListaActividades({
  actividades, tituloOportunidad, onCompletar, resaltarVencidas,
}: {
  actividades: Actividad[];
  tituloOportunidad: Map<string, string>;
  onCompletar: (a: Actividad) => void;
  resaltarVencidas?: boolean;
}) {
  return (
    <div className="divide-y divide-slate-50">
      {actividades.map((a) => {
        const Icono = iconoDe(a.tipo);
        const vencida = resaltarVencidas || a.vencida;

        return (
          <div key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
            <span
              className="w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5"
              style={{
                background: a.completada ? '#f1f5f9' : vencida ? '#fff1f2' : '#fff7ed',
                color: a.completada ? '#94a3b8' : vencida ? '#e11d48' : '#ea580c',
              }}
            >
              <Icono className="w-3.5 h-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-[13px] font-medium ${a.completada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {a.asunto}
                </p>
                <Distintivo tono="neutro">{etiquetaDe(a.tipo)}</Distintivo>
              </div>

              {a.oportunidadId && tituloOportunidad.get(a.oportunidadId) && (
                <p className="text-[11.5px] text-slate-400 mt-0.5 truncate">
                  {tituloOportunidad.get(a.oportunidadId)}
                </p>
              )}

              {a.detalle && !a.completada && (
                <p className="text-[12px] text-slate-500 mt-1 line-clamp-2">{a.detalle}</p>
              )}

              {a.resultado && (
                <p className="text-[12px] text-emerald-700 mt-1">
                  <span className="font-medium">Resultado:</span> {a.resultado}
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <p className={`text-[12px] cifra ${vencida && !a.completada ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                {fechaHora(a.fechaProgramada)}
              </p>
              <p className="text-[11px] text-slate-400">{a.duracionMinutos} min</p>

              {!a.completada && (
                <button
                  onClick={() => onCompletar(a)}
                  className="btn btn-fantasma btn-sm mt-1 text-[11.5px]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevaActividad({
  abierto, oportunidades, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  oportunidades: Oportunidad[];
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const enUnaHora = new Date(Date.now() + 3_600_000);
  const [form, setForm] = useState({
    tipo: 'LLAMADA',
    asunto: '',
    detalle: '',
    oportunidadId: '',
    fecha: isoCorto(),
    hora: `${String(enUnaHora.getHours()).padStart(2, '0')}:00`,
    duracionMinutos: '30',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.asunto.trim()) e.asunto = 'Describe qué vas a hacer.';
    if (!form.oportunidadId) e.oportunidadId = 'Liga la actividad a una oportunidad.';
    if (!form.fecha || !form.hora) e.fecha = 'Indica cuándo.';

    setErrores(e);
    if (Object.keys(e).length) return;

    const d = new Date(`${form.fecha}T${form.hora}:00`);
    const off = d.getTimezoneOffset();

    onGuardar({
      tipo: form.tipo,
      asunto: form.asunto.trim(),
      detalle: form.detalle || undefined,
      oportunidadId: form.oportunidadId,
      fechaProgramada: new Date(d.getTime() - off * 60_000).toISOString(),
      duracionMinutos: parseInt(form.duracionMinutos, 10),
    });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Agendar actividad"
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Agendar</Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta="Tipo" requerido>
            <Seleccion value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </Seleccion>
          </Campo>

          <Campo etiqueta="Duración">
            <Seleccion value={form.duracionMinutos} onChange={(e) => cambiar('duracionMinutos', e.target.value)}>
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="120">2 horas</option>
              <option value="240">Media jornada</option>
            </Seleccion>
          </Campo>
        </div>

        <Campo etiqueta="Asunto" requerido error={errores.asunto}>
          <Entrada
            value={form.asunto}
            onChange={(e) => cambiar('asunto', e.target.value)}
            error={!!errores.asunto}
            placeholder="Llamar para confirmar la propuesta"
          />
        </Campo>

        <Campo etiqueta="Oportunidad" requerido error={errores.oportunidadId}>
          <Seleccion
            value={form.oportunidadId}
            onChange={(e) => cambiar('oportunidadId', e.target.value)}
            error={!!errores.oportunidadId}
          >
            <option value="">Elige una…</option>
            {oportunidades.map((o) => (
              <option key={o.id} value={o.id}>{o.folio} · {o.titulo}</option>
            ))}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta="Fecha" requerido error={errores.fecha}>
            <Entrada
              type="date"
              value={form.fecha}
              onChange={(e) => cambiar('fecha', e.target.value)}
              error={!!errores.fecha}
            />
          </Campo>
          <Campo etiqueta="Hora" requerido>
            <Entrada type="time" value={form.hora} onChange={(e) => cambiar('hora', e.target.value)} />
          </Campo>
        </div>

        <Campo etiqueta="Notas previas">
          <textarea
            className="campo"
            value={form.detalle}
            onChange={(e) => cambiar('detalle', e.target.value)}
            placeholder="Puntos a tratar, contexto de la conversación anterior…"
          />
        </Campo>
      </div>
    </Modal>
  );
}

/* ── Completar ────────────────────────────────────────────────────────────── */

function ModalCompletar({
  actividad, procesando, onCerrar, onConfirmar,
}: {
  actividad: Actividad;
  procesando: boolean;
  onCerrar: () => void;
  onConfirmar: (resultado: string) => void;
}) {
  const [resultado, setResultado] = useState('');
  const [error, setError] = useState('');

  const enviar = () => {
    if (!resultado.trim()) {
      setError('Escribe qué pasó. Sin esto, la próxima vez nadie sabrá en qué quedó.');
      return;
    }
    onConfirmar(resultado.trim());
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Completar actividad"
      descripcion={actividad.asunto}
      ancho={480}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={procesando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={procesando}>
            Marcar como completada
          </Boton>
        </>
      }
    >
      <Campo etiqueta="¿Qué pasó?" requerido error={error}>
        <textarea
          className={`campo ${error ? 'campo-error' : ''}`}
          style={{ minHeight: 110 }}
          value={resultado}
          onChange={(e) => { setResultado(e.target.value); setError(''); }}
          placeholder="Aceptó la propuesta con descuento del 5 %. Pide entrega antes del 15."
          autoFocus
        />
      </Campo>
    </Modal>
  );
}
