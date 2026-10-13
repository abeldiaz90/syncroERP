'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Palmtree, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fecha, isoCorto, plural } from '@/lib/format';
import { solicitarTexto } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';
import { Boton, Cargando, Distintivo, EncabezadoPantalla, Panel, SinDatos, useAvisos } from '@/components/ui';

/*
 * El desglose del rango, tal y como lo cuenta el servidor.
 *
 * La pantalla contaba días NATURALES y el servidor descuenta LABORABLES, así
 * que «40 días naturales seleccionados» acababa en «Saldo insuficiente.
 * Disponibles: 14; solicitados: 34» después de pulsar. El servidor ya sabía
 * explicarlo —`explicarDiasLaborables`, con su comentario diciendo este mismo
 * problema—, pero no tenía ruta ni quien la llamara. Ahora la tiene.
 */
type Desglose = {
  laborables: number;
  naturales: number;
  noLaborables: Array<{ fecha: string; motivo: string }>;
};

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
   * El desglose se pide al servidor cada vez que cambia el rango. No se calcula
   * aquí a propósito: los días que no cuentan salen del calendario laboral de
   * la empresa y de los descansos obligatorios de la LFT, y una segunda copia
   * de esa regla en la pantalla volvería a separarse de la del servidor —que es
   * exactamente la avería que esto arregla—.
   */
  const [desglose, setDesglose] = useState<Desglose | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  useEffect(() => {
    const { fechaInicio, fechaFin } = form;
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) { setDesglose(null); return; }
    let vigente = true;
    setMidiendo(true);
    api
      .get<Desglose>(`/rrhh/vacaciones/dias-laborables?desde=${fechaInicio}&hasta=${fechaFin}`)
      .then((d) => { if (vigente) setDesglose(d); })
      .catch(() => { if (vigente) setDesglose(null); })
      .finally(() => { if (vigente) setMidiendo(false); });
    return () => { vigente = false; };
  }, [form.fechaInicio, form.fechaFin]);

  /* Lo que de verdad se va a consumir, y si cabe en el saldo. */
  const consume = desglose?.laborables ?? null;
  const seExcede =
    consume !== null && saldo?.tieneDerecho !== false && typeof saldo?.disponible === 'number'
      ? consume > saldo.disponible
      : false;

  /*
   * Antes se podia elegir al empleado, poner las fechas, escribir el motivo y
   * pulsar enviar para enterarse de que todavia no tiene derecho a vacaciones.
   * El saldo ya trae el veredicto: se dice aqui, con la fecha en que nace el
   * derecho, y el boton no promete lo que el servidor va a negar.
   */
  const sinDerecho = saldo?.tieneDerecho === false ? saldo : null;

  /*
   * ==========================================================================
   * «NaN dias naturales seleccionados.»
   * --------------------------------------------------------------------------
   * Eso es lo que decia la pantalla. `Math.max(0, NaN)` es NaN, y un campo de
   * fecha a medio teclear —o vaciado— da exactamente eso. Visto el 30-sep-2026
   * escribiendo en el campo «Desde».
   *
   * Un numero que no se puede calcular no se enseña como si fuera un numero.
   * Cuando falta una fecha, o el rango esta al reves, se dice eso y no se
   * inventa una cuenta.
   * ==========================================================================
   */
  const diasNaturales = useMemo((): number | null => {
    const inicio = new Date(`${form.fechaInicio}T00:00:00`).getTime();
    const fin = new Date(`${form.fechaFin}T00:00:00`).getTime();
    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return null;
    if (fin < inicio) return null;
    return Math.floor((fin - inicio) / 86400000) + 1;
  }, [form.fechaInicio, form.fechaFin]);
  const visibles = solicitudes.filter((s) => filtro === 'TODAS' || s.estado === filtro);
  async function solicitar() {
    if (!form.empleadoId || form.fechaFin < form.fechaInicio) return avisar('Selecciona empleado y un rango de fechas válido.', 'alerta');
    setProcesando('nueva');
    try { await api.post('/rrhh/vacaciones/solicitudes', form); avisar('Solicitud enviada a la ruta de aprobación.', 'exito'); /*
       * Las fechas también vuelven a su sitio, no sólo el motivo.
       *
       * Dejándolas puestas, el aviso «este rango no cabe en el saldo» aparecía
       * justo después de enviar —el saldo ya estaba reservado y el rango seguía
       * en el formulario—, y se leía como si la solicitud hubiera fallado
       * cuando acababa de entrar.
       */
      setForm((f) => ({ ...f, fechaInicio: hoy(), fechaFin: hoy(), motivo: '' })); await cargar(); if (form.empleadoId) setSaldo(await api.get(`/rrhh/vacaciones/saldo/${form.empleadoId}`)); }
    catch (e) { avisar(e instanceof ApiError ? e.mensajeParaPantalla() : e instanceof Error ? e.message : 'No se pudo registrar.', 'error'); }
    finally { setProcesando(null); }
  }
  async function resolver(s: Solicitud, aprobar: boolean) {
    const motivo = aprobar ? await solicitarTexto('Puedes dejar evidencia de la revisión.', { titulo: 'Aprobar vacaciones' }) : await solicitarTexto('Explica por qué se rechaza la solicitud.', { titulo: 'Rechazar vacaciones', obligatorio: true, minimo: 5 });
    /* El mínimo lo exige ya el diálogo, con el botón apagado y los caracteres
       que faltan a la vista. Aquí sólo queda el caso de cerrarlo sin escribir:
       antes, tres letras y «Continuar» se iban por este `return` sin decir nada,
       y la pantalla se leía como si el clic no hubiera hecho nada. */
    if (!aprobar && !motivo?.trim()) return;
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
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            {diasNaturales === null ? (
              <b>Elige un rango de fechas válido.</b>
            ) : midiendo ? (
              <b>Midiendo el rango…</b>
            ) : desglose === null ? (
              <>
                <b>{plural(diasNaturales, 'día natural', 'días naturales')} seleccionados.</b>
                <br />
                Ahora mismo no se pudo calcular cuántos son laborables. Al
                enviar la solicitud se calcula igualmente: el sistema descontará
                exclusivamente los días laborables.
              </>
            ) : (
              <>
                <b>
                  {plural(desglose.laborables, 'día laborable', 'días laborables')} de{' '}
                  {plural(desglose.naturales, 'natural', 'naturales')}.
                </b>
                <br />
                El sistema descontará exclusivamente los días laborables.
                {desglose.noLaborables.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-slate-500">
                    {desglose.noLaborables.slice(0, 6).map((d) => (
                      <li key={d.fecha}>· {fecha(d.fecha)} — {d.motivo}</li>
                    ))}
                    {desglose.noLaborables.length > 6 && (
                      <li>· y {plural(desglose.noLaborables.length - 6, 'día más', 'días más')}.</li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>
          {/*
            * El aviso llega ANTES de pulsar. El servidor niega con «Saldo
            * insuficiente. Disponibles: N; solicitados: M», y hasta ahora ésa
            * era la primera vez que alguien veía el número que de verdad
            * importaba. Un botón que lleva a un no.
            */}
          {seExcede && saldo && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
              <b>Este rango no cabe en el saldo.</b>
              <p className="mt-1">
                Consume {plural(consume ?? 0, 'día laborable', 'días laborables')} y quedan{' '}
                {plural(saldo.disponible, 'día disponible', 'días disponibles')}. Acorta el
                rango o espera a que devengue más.
              </p>
            </div>
          )}
          {sinDerecho && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Todavía no tiene derecho a vacaciones.</b>
            <p className="mt-1">
              Las vacaciones nacen al cumplir el primer año de servicios (LFT art. 76).
              {sinDerecho.proximoAniversario && <> Este empleado lo cumple el <b>{fecha(sinDerecho.proximoAniversario)}</b>.</>}
            </p>
            {sinDerecho.fechaIngreso && <p className="mt-1 text-amber-700">Ingresó el {fecha(sinDerecho.fechaIngreso)}.</p>}
            <p className="mt-1 text-amber-700">Mientras tanto, un permiso con o sin goce se registra en Incidencias.</p>
          </div>}
          <Boton variante="primario" cargando={procesando === 'nueva'} disabled={!form.empleadoId || form.fechaFin < form.fechaInicio || Boolean(sinDerecho) || midiendo || seExcede} onClick={() => void solicitar()} className="w-full">Enviar a aprobación</Boton>
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
