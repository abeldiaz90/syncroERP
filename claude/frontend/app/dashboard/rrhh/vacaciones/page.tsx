'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Palmtree, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fecha, isoCorto } from '@/lib/format';
import { solicitarTexto } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';
import { Boton, Cargando, Distintivo, EncabezadoPantalla, Panel, SinDatos, useAvisos } from '@/components/ui';

type Empleado = { id: string; numeroEmpleado: string; nombreCompleto?: string; nombres?: string; apellidoPaterno?: string; estado?: string };
type Solicitud = { id: string; empleadoId: string; fechaInicio: string; fechaFin: string; diasSolicitados: number; estado: string; motivo?: string; motivoResolucion?: string; fechaCreacion: string };
type Saldo = { diasDevengados: number; diasArrastre: number; diasReservados: number; diasDisfrutados: number; diasCancelados: number; disponible: number; aniversario: number; vigenciaDesde: string; vigenciaHasta: string;
  /* El veredicto del derecho, que ahora viaja como dato y no como excepcion. */
  tieneDerecho?: boolean; motivo?: string | null; fechaIngreso?: string; proximoAniversario?: string };

/*
 * En hora local. `new Date().toISOString().slice(0,10)` da el dia siguiente
 * desde las 18:00 en Mexico, asi que el formulario abria proponiendo manana.
 */
const hoy = () => isoCorto();
const lista = <T,>(valor: unknown): T[] => Array.isArray(valor) ? valor as T[] : valor && typeof valor === 'object' && Array.isArray((valor as { data?: unknown }).data) ? (valor as { data: T[] }).data : [];

export default function VacacionesPage() {
  const { avisar } = useAvisos();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('TODAS');
  const [form, setForm] = useState({ empleadoId: '', fechaInicio: hoy(), fechaFin: hoy(), motivo: '' });

  const nombre = (id: string) => { const e = empleados.find((x) => x.id === id); return e?.nombreCompleto || `${e?.numeroEmpleado ?? ''} · ${e?.nombres ?? ''} ${e?.apellidoPaterno ?? ''}`.trim() || id; };
  async function cargar() {
    setCargando(true);
    try {
      const [e, s] = await Promise.all([api.get<unknown>('/rrhh/empleados', { query: { estado: 'ACTIVO' } }), api.get<unknown>('/rrhh/vacaciones/solicitudes')]);
      setEmpleados(lista<Empleado>(e)); setSolicitudes(lista<Solicitud>(s));
    } catch (e) { avisar(e instanceof Error ? e.message : 'No se pudieron cargar las vacaciones.', 'error'); }
    finally { setCargando(false); }
  }
  useEffect(() => { void cargar(); }, []);
  useEffect(() => { if (!form.empleadoId) return setSaldo(null); api.get<Saldo>(`/rrhh/vacaciones/saldo/${form.empleadoId}`).then(setSaldo).catch(() => setSaldo(null)); }, [form.empleadoId]);

  /*
   * Antes se podia elegir al empleado, poner las fechas, escribir el motivo y
   * pulsar enviar para enterarse de que todavia no tiene derecho a vacaciones.
   * El saldo ya trae el veredicto: se dice aqui, con la fecha en que nace el
   * derecho, y el boton no promete lo que el servidor va a negar.
   */
  const sinDerecho = saldo?.tieneDerecho === false ? saldo : null;

  const diasNaturales = useMemo(() => Math.max(0, Math.floor((new Date(`${form.fechaFin}T00:00:00`).getTime() - new Date(`${form.fechaInicio}T00:00:00`).getTime()) / 86400000) + 1), [form.fechaInicio, form.fechaFin]);
  const visibles = solicitudes.filter((s) => filtro === 'TODAS' || s.estado === filtro);
  async function solicitar() {
    if (!form.empleadoId || form.fechaFin < form.fechaInicio) return avisar('Selecciona empleado y un rango de fechas válido.', 'alerta');
    setProcesando('nueva');
    try { await api.post('/rrhh/vacaciones/solicitudes', form); avisar('Solicitud enviada a la ruta de aprobación.', 'exito'); setForm((f) => ({ ...f, motivo: '' })); await cargar(); if (form.empleadoId) setSaldo(await api.get(`/rrhh/vacaciones/saldo/${form.empleadoId}`)); }
    catch (e) { avisar(e instanceof ApiError ? e.mensajeParaPantalla() : e instanceof Error ? e.message : 'No se pudo registrar.', 'error'); }
    finally { setProcesando(null); }
  }
  async function resolver(s: Solicitud, aprobar: boolean) {
    const motivo = aprobar ? await solicitarTexto('Puedes dejar evidencia de la revisión.', { titulo: 'Aprobar vacaciones' }) : await solicitarTexto('Explica por qué se rechaza la solicitud.', { titulo: 'Rechazar vacaciones', obligatorio: true });
    if (!aprobar && (!motivo || motivo.trim().length < 5)) return;
    setProcesando(s.id);
    try { const resultado = await api.patch<Solicitud>(`/rrhh/vacaciones/solicitudes/${s.id}/resolver`, { aprobar, motivo: motivo || undefined }); avisar(aprobar && resultado.estado === 'EN_REVISION' ? 'Nivel aprobado; continúa con el siguiente aprobador.' : aprobar ? 'Vacaciones aprobadas e incidencia generada.' : 'Solicitud rechazada y saldo liberado.', 'exito'); await cargar(); }
    catch (e) { avisar(e instanceof ApiError ? e.mensajeParaPantalla() : e instanceof Error ? e.message : 'No se pudo resolver.', 'error'); }
    finally { setProcesando(null); }
  }

  if (cargando) return <Cargando />;
  return <div className="mx-auto max-w-[1450px] space-y-5 p-6">
    <EncabezadoPantalla titulo="Vacaciones y saldos" descripcion="Solicitud, reserva de días, aprobación multinivel e incidencia automática para nómina." />
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel titulo="Nueva solicitud">
        <div className="space-y-4">
          <label className="etiqueta-campo">Empleado</label>
          <BuscadorSeleccion valor={form.empleadoId} onChange={(empleadoId) => setForm({ ...form, empleadoId })} opciones={empleados.map((e) => ({ valor: e.id, etiqueta: nombre(e.id), busqueda: e.numeroEmpleado }))} placeholder="Buscar empleado…" />
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Desde<input type="date" className="entrada mt-1 w-full" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}/></label><label className="text-sm">Hasta<input type="date" className="entrada mt-1 w-full" value={form.fechaFin} min={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}/></label></div>
          <label className="text-sm">Motivo o referencia<textarea className="entrada mt-1 min-h-20 w-full py-2" maxLength={400} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}/></label>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>{diasNaturales} días naturales seleccionados.</b><br/>El backend descontará exclusivamente los días laborables del calendario de la empresa.</div>
          {sinDerecho && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Todavía no tiene derecho a vacaciones.</b>
            <p className="mt-1">
              Las vacaciones nacen al cumplir el primer año de servicios (LFT art. 76).
              {sinDerecho.proximoAniversario && <> Este empleado lo cumple el <b>{fecha(sinDerecho.proximoAniversario)}</b>.</>}
            </p>
            {sinDerecho.fechaIngreso && <p className="mt-1 text-amber-700">Ingresó el {fecha(sinDerecho.fechaIngreso)}.</p>}
            <p className="mt-1 text-amber-700">Mientras tanto, un permiso con o sin goce se registra en Incidencias.</p>
          </div>}
          <Boton variante="primario" cargando={procesando === 'nueva'} disabled={!form.empleadoId || form.fechaFin < form.fechaInicio || Boolean(sinDerecho)} onClick={() => void solicitar()} className="w-full">Enviar a aprobación</Boton>
        </div>
      </Panel>
      <div className="space-y-5">
        {saldo && saldo.tieneDerecho !== false && <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metrica titulo="Devengados" valor={saldo.diasDevengados}/><Metrica titulo="Arrastre" valor={saldo.diasArrastre}/><Metrica titulo="Reservados" valor={saldo.diasReservados}/><Metrica titulo="Disfrutados" valor={saldo.diasDisfrutados}/><Metrica titulo="Cancelados" valor={saldo.diasCancelados}/><Metrica titulo="Disponibles" valor={saldo.disponible} destacado/></div>}
        <Panel sinRelleno titulo="Solicitudes" accion={<select className="campo w-48" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="TODAS">Todos los estados</option><option value="EN_REVISION">En revisión</option><option value="APROBADA">Aprobadas</option><option value="RECHAZADA">Rechazadas</option></select>}>
          {!visibles.length ? <SinDatos icono={<Palmtree className="h-5 w-5"/>} titulo="No hay solicitudes" descripcion="Las solicitudes aparecerán aquí con su estado de aprobación."/> : <div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Empleado</th><th>Periodo</th><th>Días laborables</th><th>Estado</th><th>Motivo</th><th>Acciones</th></tr></thead><tbody>{visibles.map((s) => <tr key={s.id}><td className="font-medium">{nombre(s.empleadoId)}</td><td>{fecha(s.fechaInicio)} – {fecha(s.fechaFin)}</td><td>{Number(s.diasSolicitados)}</td><td><Estado estado={s.estado}/></td><td><span>{s.motivo || '—'}</span>{s.motivoResolucion && <p className="text-xs text-slate-400">Resolución: {s.motivoResolucion}</p>}</td><td>{['CAPTURADA','EN_REVISION'].includes(s.estado) && <div className="flex gap-2"><Boton variante="primario" disabled={procesando === s.id} onClick={() => void resolver(s, true)}>Aprobar nivel</Boton><Boton variante="peligro" disabled={procesando === s.id} onClick={() => void resolver(s, false)}>Rechazar</Boton></div>}</td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    </div>
  </div>;
}

function Metrica({ titulo, valor, destacado = false }: { titulo: string; valor: number; destacado?: boolean }) { return <div className={`rounded-xl border p-3 ${destacado ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><p className="text-[11px] font-semibold uppercase text-slate-500">{titulo}</p><p className={`mt-1 text-xl font-bold ${destacado ? 'text-emerald-700' : 'text-slate-900'}`}>{Number(valor || 0)}</p></div>; }
function Estado({ estado }: { estado: string }) { const tono = estado === 'APROBADA' ? 'exito' : estado === 'RECHAZADA' ? 'peligro' : estado === 'EN_REVISION' ? 'alerta' : 'neutro'; const icono = estado === 'APROBADA' ? <CheckCircle2 className="h-3 w-3"/> : estado === 'RECHAZADA' ? <XCircle className="h-3 w-3"/> : <Clock3 className="h-3 w-3"/>; return <Distintivo tono={tono}><span className="inline-flex items-center gap-1">{icono}{estado.replaceAll('_',' ')}</span></Distintivo>; }
