"use client";
/**
 * ============================================================================
 * SyncroERP · CRM — pipeline
 * ----------------------------------------------------------------------------
 * Tablero por etapas. La firma visual del módulo es la barra de color de la
 * etapa sobre cada columna y el marcador de "estancada" en las tarjetas: es
 * la información que un gerente comercial busca en los primeros tres segundos.
 * ============================================================================
 */

import { useState } from 'react';
import { Briefcase, Clock, Plus, TrendingUp } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, dineroCorto, fecha } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Etapa {
  id: string; nombre: string; color: string; probabilidad: number; diasAlerta: number;
}

interface Oportunidad {
  id: string; folio: string; titulo: string; importe: number;
  probabilidad: number; valorPonderado: number;
  diasEnEtapa: number; estancada: boolean;
  fechaCierreEstimada?: string;
  nombreResponsable?: string;
  prospecto?: { nombre: string; empresa?: string };
}

interface Columna {
  etapa: Etapa;
  oportunidades: Oportunidad[];
  cantidad: number;
  importe: number;
  valorPonderado: number;
  estancadas: number;
}

interface Pipeline {
  columnas: Columna[];
  totales: { oportunidades: number; importe: number; pronostico: number; estancadas: number };
}

interface Prospecto { id: string; nombre: string; empresa?: string }

export default function PipelinePage() {
  const { avisar } = useAvisos();
  const [modalAbierto, setModalAbierto] = useState(false);

  const pipeline = useDatos<Pipeline>(() => api.get('/crm/pipeline'), []);
  const etapas = useDatos<Etapa[]>(() => api.get('/crm/etapas'), []);
  const prospectos = useDatos<Prospecto[]>(() => api.get('/crm/prospectos'), []);

  const crear = useAccion(async (datos: Record<string, unknown>) => {
    const o = await api.post<Oportunidad>('/crm/oportunidades', datos);
    avisar(`Oportunidad ${o.folio} creada.`, 'exito');
    setModalAbierto(false);
    void pipeline.recargar();
    return o;
  });

  const mover = useAccion(async (id: string, etapaId: string) => {
    await api.patch(`/crm/oportunidades/${id}/etapa`, { etapaId });
    avisar('Oportunidad movida de etapa.', 'exito');
    void pipeline.recargar();
  });

  const sembrar = useAccion(async () => {
    await api.post('/crm/etapas/sembrar');
    avisar('Embudo creado con siete etapas. Ajústalas cuando quieras.', 'exito');
    void etapas.recargar();
    void pipeline.recargar();
  });

  const sinEtapas = !etapas.cargando && (etapas.datos?.length ?? 0) === 0;

  if (sinEtapas) {
    return (
      <div className="p-6 max-w-[900px] mx-auto">
        <EncabezadoPantalla titulo="Pipeline" descripcion="Seguimiento de oportunidades comerciales" />
        <Panel sinRelleno>
          <SinDatos
            titulo="Define tu embudo de ventas"
            descripcion="Las etapas describen cómo vende tu empresa. Empieza con el embudo estándar de siete etapas y ajústalo después."
            icono={<Briefcase className="w-5 h-5" />}
            accion={
              <Boton variante="primario" cargando={sembrar.ejecutando} onClick={() => void sembrar.ejecutar()}>
                Crear embudo estándar
              </Boton>
            }
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <EncabezadoPantalla
        titulo="Pipeline"
        descripcion="Oportunidades abiertas por etapa"
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            Nueva oportunidad
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Oportunidades abiertas" color="#ea580c" cargando={pipeline.cargando}
          icono={<Briefcase className="w-4 h-4" />}
          valor={pipeline.datos?.totales?.oportunidades ?? 0}
        />
        <Indicador
          etiqueta="Valor total" color="#0f172a" cargando={pipeline.cargando}
          valor={dinero(pipeline.datos?.totales?.importe)}
          detalle="suma sin ponderar"
        />
        <Indicador
          etiqueta="Pronóstico ponderado" color="#059669" cargando={pipeline.cargando}
          icono={<TrendingUp className="w-4 h-4" />}
          valor={dinero(pipeline.datos?.totales?.pronostico)}
          detalle="ajustado por probabilidad"
        />
        <Indicador
          etiqueta="Estancadas" color="#e11d48" cargando={pipeline.cargando}
          icono={<Clock className="w-4 h-4" />}
          valor={pipeline.datos?.totales?.estancadas ?? 0}
          detalle="sin movimiento reciente"
        />
      </div>

      {pipeline.cargando ? (
        <Panel sinRelleno><Cargando filas={5} /></Panel>
      ) : pipeline.error ? (
        <Panel sinRelleno><ErrorPantalla mensaje={pipeline.error} onReintentar={pipeline.recargar} /></Panel>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {pipeline.datos!.columnas.map((col) => (
            <div key={col.etapa.id} className="w-[280px] shrink-0">
              <div className="panel h-full flex flex-col">
                {/* Cabecera de la columna */}
                <div
                  className="px-3.5 py-3 border-b border-[var(--color-linea-suave)]"
                  style={{ borderTop: `3px solid ${col.etapa.color}`, borderRadius: '12px 12px 0 0' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] font-bold text-slate-900">{col.etapa.nombre}</p>
                    <span className="text-[11px] font-semibold text-slate-400 cifra">{col.cantidad}</span>
                  </div>
                  <p className="text-[15px] font-bold mt-1 cifra" style={{ color: col.etapa.color }}>
                    {dineroCorto(col.importe)}
                  </p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">
                    {col.etapa.probabilidad}% · pronóstico {dineroCorto(col.valorPonderado)}
                  </p>
                </div>

                {/* Tarjetas */}
                <div className="flex-1 p-2 space-y-2 min-h-[120px] max-h-[62vh] overflow-y-auto">
                  {col.oportunidades.length === 0 ? (
                    <p className="text-[11.5px] text-slate-300 text-center py-6">Sin oportunidades</p>
                  ) : (
                    col.oportunidades.map((o) => (
                      <TarjetaOportunidad
                        key={o.id}
                        oportunidad={o}
                        etapas={etapas.datos ?? []}
                        etapaActual={col.etapa.id}
                        onMover={(destino) => { void mover.ejecutar(o.id, destino); }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalNuevaOportunidad
        abierto={modalAbierto}
        prospectos={prospectos.datos ?? []}
        onProspectoCreado={() => prospectos.recargar()}
        etapas={etapas.datos ?? []}
        guardando={crear.ejecutando}
        errorServidor={crear.error}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void crear.ejecutar(d)}
      />
    </div>
  );
}

/* ── Tarjeta ──────────────────────────────────────────────────────────────── */

function TarjetaOportunidad({
  oportunidad: o, etapas, etapaActual, onMover,
}: {
  oportunidad: Oportunidad;
  etapas: Etapa[];
  etapaActual: string;
  onMover: (etapaId: string) => void;
}) {
  return (
    <div className="bg-white border border-[var(--color-linea)] rounded-lg p-2.5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-900 leading-snug line-clamp-2">
          {o.titulo}
        </p>
        {o.estancada && (
          <span title={`${o.diasEnEtapa} días sin movimiento`} className="shrink-0">
            <Clock className="w-3.5 h-3.5 text-rose-500" />
          </span>
        )}
      </div>

      {o.prospecto && (
        <p className="text-[11px] text-slate-500 mt-1 truncate">
          {o.prospecto.empresa || o.prospecto.nombre}
        </p>
      )}

      <p className="text-[14px] font-bold text-slate-900 mt-1.5 cifra">{dinero(o.importe)}</p>

      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-[10.5px] text-slate-400 cifra">{o.folio}</span>
        {o.fechaCierreEstimada && (
          <span className="text-[10.5px] text-slate-400">{fecha(o.fechaCierreEstimada)}</span>
        )}
      </div>

      {/* Sin arrastrar: un select es más rápido con teclado y funciona en táctil */}
      <select
        value={etapaActual}
        onChange={(e) => { if (e.target.value !== etapaActual) onMover(e.target.value); }}
        className="w-full mt-2 h-7 px-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded text-slate-600 cursor-pointer"
        aria-label="Mover a otra etapa"
      >
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id === etapaActual ? `● ${e.nombre}` : `Mover a ${e.nombre}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevaOportunidad({
  abierto, prospectos, etapas, guardando, errorServidor, onCerrar, onGuardar,
  onProspectoCreado,
}: {
  abierto: boolean;
  prospectos: Prospecto[];
  etapas: Etapa[];
  guardando: boolean;
  /*
    El error del servidor se enseñaba sólo como aviso flotante de cuatro
    segundos, y el recuadro se quedaba abierto e igual que antes. Quien no
    llegaba a leerlo volvía a pulsar el botón sin saber qué estaba mal. Aquí se
    queda hasta que se corrija.
  */
  errorServidor: string | null;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
  onProspectoCreado: () => Promise<unknown> | void;
}) {
  const [form, setForm] = useState({
    titulo: '', prospectoId: '', importe: '', etapaId: '',
    fechaCierreEstimada: '', descripcion: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Un prospecto que no se podía dar de alta
   * --------------------------------------------------------------------------
   * «Prospecto» es obligatorio para crear una oportunidad, y el desplegable
   * salía con una sola línea: «Elige uno…». El backend tiene
   * `POST /crm/prospectos` desde siempre, pero NINGUNA pantalla del frontend lo
   * llamaba: no existe una pantalla de prospectos. Es decir, no había manera de
   * crear una oportunidad desde la interfaz, con ningún rol y ningún permiso.
   * El módulo entero terminaba en este campo.
   *
   * Se resuelve como ya se resuelve en reservaciones con el huésped nuevo: se
   * da de alta aquí mismo, con lo mínimo —nombre y un medio de contacto, que es
   * lo que el servidor exige— y se queda seleccionado.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const [altaProspecto, setAltaProspecto] = useState(false);
  const [prospecto, setProspecto] = useState({
    nombre: '', empresa: '', email: '', telefono: '',
  });
  const [errorProspecto, setErrorProspecto] = useState('');
  const [guardandoProspecto, setGuardandoProspecto] = useState(false);

  const crearProspecto = async () => {
    if (prospecto.nombre.trim().length < 2) {
      setErrorProspecto('Escribe el nombre del prospecto.');
      return;
    }
    if (!prospecto.email.trim() && !prospecto.telefono.trim()) {
      setErrorProspecto(
        'Escribe un correo o un teléfono: sin uno de los dos no hay forma de contactarlo.',
      );
      return;
    }
    setErrorProspecto('');
    setGuardandoProspecto(true);
    try {
      const creado = await api.post<Prospecto>('/crm/prospectos', {
        nombre: prospecto.nombre.trim(),
        empresa: prospecto.empresa.trim() || undefined,
        email: prospecto.email.trim() || undefined,
        telefono: prospecto.telefono.trim() || undefined,
      });
      await onProspectoCreado();
      setForm((f) => ({ ...f, prospectoId: creado.id }));
      setErrores((e) => ({ ...e, prospectoId: '' }));
      setAltaProspecto(false);
      setProspecto({ nombre: '', empresa: '', email: '', telefono: '' });
    } catch (e) {
      setErrorProspecto(
        e instanceof Error ? e.message : 'No se pudo crear el prospecto.',
      );
    } finally {
      setGuardandoProspecto(false);
    }
  };

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.titulo.trim()) e.titulo = 'Describe brevemente la oportunidad.';
    if (!form.prospectoId) e.prospectoId = 'Elige a quién le vas a vender.';
    if (!form.importe || parseFloat(form.importe) < 0) e.importe = 'Indica un importe estimado.';

    setErrores(e);
    if (Object.keys(e).length) return;

    /*
      Lo que se dejó en blanco no se manda. Un campo opcional vacío viaja como
      cadena vacía, y una cadena vacía no es una fecha ni un identificador.
    */
    const datos: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      prospectoId: form.prospectoId,
      importe: parseFloat(form.importe),
    };
    if (form.etapaId) datos.etapaId = form.etapaId;
    if (form.fechaCierreEstimada) datos.fechaCierreEstimada = form.fechaCierreEstimada;
    if (form.descripcion.trim()) datos.descripcion = form.descripcion.trim();
    onGuardar(datos);
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva oportunidad"
      descripcion="Entra en la primera etapa del embudo si no eliges otra."
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Crear oportunidad</Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        {errorServidor && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorServidor}
          </p>
        )}

        <Campo etiqueta="Título" requerido error={errores.titulo}>
          <Entrada
            value={form.titulo}
            onChange={(e) => cambiar('titulo', e.target.value)}
            error={!!errores.titulo}
            placeholder="Suministro de mobiliario para sucursal norte"
          />
        </Campo>

        <Campo etiqueta="Prospecto" requerido error={errores.prospectoId}>
          <Seleccion
            value={form.prospectoId}
            onChange={(e) => cambiar('prospectoId', e.target.value)}
            error={!!errores.prospectoId}
          >
            <option value="">
              {prospectos.length
                ? 'Elige uno…'
                : 'Todavía no hay prospectos — da de alta uno'}
            </option>
            {prospectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.empresa ? ` · ${p.empresa}` : ''}
              </option>
            ))}
          </Seleccion>
        </Campo>

        {altaProspecto ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-3">
            <p className="text-xs font-semibold text-indigo-900">
              Nuevo prospecto
            </p>
            {errorProspecto && (
              <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                {errorProspecto}
              </p>
            )}
            <Campo etiqueta="Nombre" requerido>
              <Entrada
                value={prospecto.nombre}
                onChange={(e) => setProspecto((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="María Fernanda Ruiz"
              />
            </Campo>
            <Campo etiqueta="Empresa">
              <Entrada
                value={prospecto.empresa}
                onChange={(e) => setProspecto((p) => ({ ...p, empresa: e.target.value }))}
                placeholder="Opcional"
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Correo">
                <Entrada
                  type="email"
                  value={prospecto.email}
                  onChange={(e) => setProspecto((p) => ({ ...p, email: e.target.value }))}
                />
              </Campo>
              <Campo etiqueta="Teléfono">
                <Entrada
                  value={prospecto.telefono}
                  onChange={(e) => setProspecto((p) => ({ ...p, telefono: e.target.value }))}
                />
              </Campo>
            </div>
            <p className="text-xs text-slate-500">
              Hace falta el correo o el teléfono: sin uno de los dos no hay
              forma de contactarlo.
            </p>
            <div className="flex justify-end gap-2">
              <Boton
                variante="neutro"
                onClick={() => { setAltaProspecto(false); setErrorProspecto(''); }}
                disabled={guardandoProspecto}
              >
                Cancelar
              </Boton>
              <Boton
                variante="primario"
                onClick={crearProspecto}
                cargando={guardandoProspecto}
              >
                Guardar prospecto
              </Boton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAltaProspecto(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-semibold text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> Nuevo prospecto
          </button>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta="Importe estimado" requerido error={errores.importe}>
            <Entrada
              type="number" step="0.01" min="0"
              value={form.importe}
              onChange={(e) => cambiar('importe', e.target.value)}
              error={!!errores.importe}
              placeholder="0.00"
            />
          </Campo>

          <Campo etiqueta="Cierre estimado">
            <Entrada
              type="date"
              value={form.fechaCierreEstimada}
              onChange={(e) => cambiar('fechaCierreEstimada', e.target.value)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Etapa inicial" ayuda="Déjalo vacío para empezar por el principio">
          <Seleccion value={form.etapaId} onChange={(e) => cambiar('etapaId', e.target.value)}>
            <option value="">Primera etapa del embudo</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} · {e.probabilidad}%</option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Notas">
          <textarea
            className="campo"
            value={form.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
            placeholder="Qué necesita, con quién se habló, siguiente paso…"
          />
        </Campo>
      </div>
    </Modal>
  );
}
