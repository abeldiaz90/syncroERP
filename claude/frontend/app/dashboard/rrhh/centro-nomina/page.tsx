'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmarElegante } from '@/components/ui/dialogos';
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Banknote, Building2, Calculator, CalendarClock,
  Check, CheckCircle2, CircleAlert, Clock3, FileCheck2, Landmark,
  RefreshCw, Settings2, ShieldCheck, Sparkles, Users, WalletCards,
} from 'lucide-react';
import { api } from '@/lib/api';
import { dinero, fecha } from '@/lib/format';

type Periodo = { id:string; ejercicio:number; numero:number; regimen:string; fechaInicio:string; fechaFin:string; estado:string; totalNeto:number };
type Tablero = { empleados:number; periodos:Periodo[]; saldoPrestamos:number; configuracionCompleta:boolean; incidenciasPendientes:number; cuentasPendientes?:number; obligacionesActivas?:number };
type Preparacion = { puestos:number; empleados:number; conceptos:number; parametros:number; ejercicioFiscal:number; tarifasFiscales:boolean; incidenciasPendientes:number; periodosAbiertos:number; listoParaEmpleados:boolean; listoParaCalculo:boolean };
type Prenomina = { periodo:Periodo; totales:{empleados:number;percepciones:number;deducciones:number;neto:number;isr:number;imss:number}; incidenciasPendientes:number; alertas:number; filas:Array<{reciboId:string;empleado:string;diasPagados:number;percepciones:number;deducciones:number;neto:number;isr:number;imss:number;alertas:string[]}> };
/*
 * `puedoResolver` y `motivoBloqueo` los calcula el servidor con la misma
 * lectura que aplica al resolver. Antes esta pantalla pintaba «Aprobar» y
 * «Rechazar» en los tres niveles —RRHH, Finanzas y Tesoreria— para cualquiera
 * que la abriera, y las tres parejas daban 403: ni siquiera la del propio
 * nivel servia, porque quien prepara la nomina no puede aprobarla y quien la
 * prepara es justo quien esta mirando.
 */
type Aprobacion = { id:string; nivel:number; rolRequerido:string; estado:string; comentario?:string; puedoResolver?:boolean; motivoBloqueo?:string|null };

const ESTADOS_CALCULADOS = ['CALCULADO', 'CON_ALERTAS', 'EN_REVISION', 'APROBADO', 'CFDI_PREPARADO', 'TIMBRADO', 'DISPERSION_GENERADA', 'EN_DISPERSION', 'PAGADO', 'CONTABILIZADO', 'CERRADO'];

export default function CentroNominaPage() {
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [preparacion, setPreparacion] = useState<Preparacion | null>(null);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [pre, setPre] = useState<Prenomina | null>(null);
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const periodo = useMemo(() => periodos.find((p) => p.id === periodoId), [periodos, periodoId]);

  async function cargarBase() {
    setCargando(true); setError('');
    try {
      const [t, p, r] = await Promise.all([
        api.get<Tablero>('/rrhh/nomina-avanzada/tablero'),
        api.get<Periodo[]>('/rrhh/nomina/periodos'),
        api.get<Preparacion>('/rrhh/preparacion'),
      ]);
      setTablero(t); setPeriodos(Array.isArray(p) ? p : []); setPreparacion(r);
      const solicitado = new URLSearchParams(window.location.search).get('periodoId');
      if (!periodoId && solicitado && p.some((periodo) => periodo.id === solicitado)) setPeriodoId(solicitado);
      else if (!periodoId && p[0]) setPeriodoId(p[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible cargar el centro de nómina.'); }
    finally { setCargando(false); }
  }

  async function cargarPeriodo(id: string) {
    if (!id) { setPre(null); setAprobaciones([]); return; }
    setCargando(true); setError('');
    try {
      const actual = periodos.find((p) => p.id === id);
      if (actual && ESTADOS_CALCULADOS.includes(actual.estado)) {
        const [x, a] = await Promise.all([
          api.get<Prenomina>(`/rrhh/nomina-avanzada/periodos/${id}/prenomina`),
          api.get<Aprobacion[]>(`/rrhh/nomina-avanzada/periodos/${id}/aprobaciones`),
        ]);
        setPre(x); setAprobaciones(Array.isArray(a) ? a : []);
      } else { setPre(null); setAprobaciones([]); }
    } catch (e) { setPre(null); setError(e instanceof Error ? e.message : 'No fue posible cargar la prenómina.'); }
    finally { setCargando(false); }
  }

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargarBase(), 0);
    return () => window.clearTimeout(temporizador);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargarPeriodo(periodoId), 0);
    return () => window.clearTimeout(temporizador);
  }, [periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function prepararAprobacion() {
    if (!pre) return;
    const aceptarAlertas = pre.alertas > 0;
    if (aceptarAlertas && !await confirmarElegante(`La prenómina contiene ${pre.alertas} alerta(s). ¿Deseas enviarla a revisión dejando evidencia de aceptación?`)) return;
    try {
      await api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/aprobaciones/preparar`, { niveles: 3, aceptarAlertas });
      await cargarPeriodo(periodoId);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible iniciar la aprobación.'); }
  }

  async function resolver(id: string, estado: 'APROBADA' | 'RECHAZADA') {
    try {
      await api.patch(`/rrhh/nomina-avanzada/aprobaciones/${id}`, { estado, comentario: estado === 'RECHAZADA' ? 'Requiere corrección de prenómina' : undefined });
      await cargarPeriodo(periodoId);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible resolver la aprobación.'); }
  }

  const requisitos = [
    { titulo: 'Estructura organizacional', listo: (preparacion?.puestos ?? 0) > 0, detalle: `${preparacion?.puestos ?? 0} puestos`, href: '/dashboard/rrhh/puestos' },
    { titulo: 'Plantilla activa', listo: (preparacion?.empleados ?? 0) > 0, detalle: `${preparacion?.empleados ?? 0} empleados`, href: '/dashboard/rrhh/empleados' },
    { titulo: 'Conceptos de nómina', listo: (preparacion?.conceptos ?? 0) > 0, detalle: `${preparacion?.conceptos ?? 0} conceptos`, href: '/dashboard/rrhh/conceptos-nomina' },
    { titulo: 'Tarifas fiscales', listo: Boolean(preparacion?.tarifasFiscales), detalle: preparacion?.tarifasFiscales ? `Ejercicio ${preparacion.ejercicioFiscal} disponible` : 'Ejercicio sin tarifas verificadas', href: '/dashboard/rrhh/configuracion-nomina' },
    { titulo: 'Configuración patronal', listo: Boolean(tablero?.configuracionCompleta), detalle: tablero?.configuracionCompleta ? 'Completa' : 'Pendiente', href: '/dashboard/rrhh/configuracion-nomina' },
  ];
  const avance = Math.round((requisitos.filter((r) => r.listo).length / requisitos.length) * 100);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 md:p-7">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl md:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-indigo-200"><Sparkles className="h-3.5 w-3.5" />Centro de operación guiada</div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Recursos Humanos y Nómina</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Un solo recorrido para preparar la empresa, contratar personal, revisar incidencias, calcular, autorizar, timbrar, pagar y contabilizar.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/dashboard/rrhh/empleados" className="btn border-white/15 bg-white text-slate-950 hover:bg-slate-100"><Users className="h-4 w-4" />Alta de empleado</Link><button className="btn border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => void cargarBase()}><RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />Actualizar</button></div>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiOscuro icono={<Users />} etiqueta="Plantilla activa" valor={tablero?.empleados ?? 0} />
          <KpiOscuro icono={<CircleAlert />} etiqueta="Incidencias pendientes" valor={tablero?.incidenciasPendientes ?? 0} alerta={(tablero?.incidenciasPendientes ?? 0) > 0} />
          <KpiOscuro icono={<Banknote />} etiqueta="Saldo de préstamos" valor={dinero(tablero?.saldoPrestamos ?? 0)} />
          <KpiOscuro icono={<BadgeCheck />} etiqueta="Preparación" valor={`${avance}%`} alerta={avance < 100} />
        </div>
      </section>

      {error && <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div><p className="eyebrow">Antes de calcular</p><h2 className="mt-1 text-base font-bold text-slate-950">Preparación de la empresa</h2></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${avance === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{avance}%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${avance === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${avance}%` }} /></div>
          <div className="mt-5 space-y-2">
            {requisitos.map((r) => <Link key={r.titulo} href={r.href} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${r.listo ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{r.listo ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><span className="min-w-0"><b className="block text-xs text-slate-900">{r.titulo}</b><span className="text-[11px] text-slate-500">{r.detalle}</span></span><ArrowRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-indigo-500" /></Link>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Asistente de nómina</p><h2 className="mt-1 text-base font-bold text-slate-950">Periodo en operación</h2></div><label className="min-w-80 text-xs font-semibold text-slate-600">Periodo<select className="campo mt-1" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}><option value="">Selecciona un periodo</option>{periodos.map((p) => <option key={p.id} value={p.id}>#{p.numero} · {p.regimen} · {fecha(p.fechaInicio)} a {fecha(p.fechaFin)} · {p.estado}</option>)}</select></label></div>

          {!periodo ? <VacioPeriodo /> : <div className="mt-6">
            <FlujoNomina estado={periodo.estado} periodoId={periodo.id} />
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-900">Periodo #{periodo.numero}</p><p className="text-[11px] text-slate-500">{fecha(periodo.fechaInicio)} al {fecha(periodo.fechaFin)} · Estado: {periodo.estado}</p></div><div className="flex gap-2"><Link className="btn btn-neutro" href="/dashboard/rrhh/incidencias"><CalendarClock className="h-4 w-4" />Incidencias</Link><Link className="btn btn-primario" href="/dashboard/rrhh/nomina"><Calculator className="h-4 w-4" />Calcular o recalcular</Link></div></div>
            </div>
          </div>}
        </section>
      </div>

      {pre && <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">Revisión de prenómina</h2><p className="text-xs text-slate-500">Importes calculados por trabajador</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${pre.alertas ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{pre.alertas ? `${pre.alertas} alertas` : 'Sin alertas'}</span></header>
          <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-6"><MiniTotal etiqueta="Trabajadores" valor={pre.totales.empleados} /><MiniTotal etiqueta="Percepciones" valor={dinero(pre.totales.percepciones)} /><MiniTotal etiqueta="ISR" valor={dinero(pre.totales.isr)} /><MiniTotal etiqueta="IMSS" valor={dinero(pre.totales.imss)} /><MiniTotal etiqueta="Deducciones" valor={dinero(pre.totales.deducciones)} /><MiniTotal etiqueta="Neto" valor={dinero(pre.totales.neto)} destacado /></div>
          <div className="max-h-[420px] overflow-auto"><table className="tabla"><thead><tr><th>Empleado</th><th className="text-right">Días</th><th className="text-right">Percepciones</th><th className="text-right">Deducciones</th><th className="text-right">Neto</th><th>Validación</th></tr></thead><tbody>{pre.filas.map((f) => <tr key={f.reciboId}><td className="font-medium text-slate-900">{f.empleado}</td><td className="text-right cifra">{f.diasPagados}</td><td className="text-right cifra">{dinero(f.percepciones)}</td><td className="text-right cifra">{dinero(f.deducciones)}</td><td className="text-right cifra font-semibold">{dinero(f.neto)}</td><td>{f.alertas.length ? <span className="text-[11px] text-amber-700">{f.alertas.join(', ')}</span> : <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Correcto</span>}</td></tr>)}</tbody></table></div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Flujo de aprobación</h2><p className="mb-4 text-xs text-slate-500">Las aprobaciones son secuenciales y dejan trazabilidad.</p>{!aprobaciones.length ? <button disabled={!['CALCULADO','CON_ALERTAS'].includes(periodo?.estado ?? '')} onClick={() => void prepararAprobacion()} className="btn btn-primario w-full"><ShieldCheck className="h-4 w-4" />Enviar a aprobación</button> : <div className="space-y-2">{aprobaciones.map((a) => <div key={a.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><b className="text-xs">Nivel {a.nivel}</b><span className="text-[10px] font-bold text-slate-500">{a.estado}</span></div><p className="mt-0.5 text-[11px] text-slate-500">{a.rolRequerido}</p>{a.estado === 'PENDIENTE' && (a.puedoResolver
  ? <div className="mt-3 flex gap-2"><button className="btn btn-primario btn-sm flex-1" onClick={() => void resolver(a.id, 'APROBADA')}>Aprobar</button><button className="btn btn-neutro btn-sm flex-1" onClick={() => void resolver(a.id, 'RECHAZADA')}>Rechazar</button></div>
  : <p className="mt-2 text-[11px] text-slate-500">{a.motivoBloqueo ?? `Esta firma es de ${a.rolRequerido}.`}</p>)}</div>)}</div>}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Siguientes pasos</h2><div className="mt-4 grid gap-2"><Link className="btn btn-neutro w-full justify-start" href={`/dashboard/rrhh/recibos?periodoId=${periodoId}`}><FileCheck2 className="h-4 w-4" />Revisar recibos</Link><Link className="btn btn-neutro w-full justify-start" href={`/dashboard/rrhh/cumplimiento?periodoId=${periodoId}`}><Landmark className="h-4 w-4" />CFDI, dispersión y póliza</Link><Link className="btn btn-primario w-full justify-start" href={`/dashboard/rrhh/pagos?periodoId=${periodoId}`}><WalletCards className="h-4 w-4" />Registrar pago</Link></div></section>
        </aside>
      </div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Acceso icono={<Building2 />} titulo="Puestos y estructura" descripcion="Áreas, plazas y rangos salariales" href="/dashboard/rrhh/puestos" />
        <Acceso icono={<ShieldCheck />} titulo="Aprobar estructura" descripcion="Solicitudes pendientes" href="/dashboard/rrhh/aprobaciones-estructura" />
        <Acceso icono={<Settings2 />} titulo="Gobierno de flujos" descripcion="Aprobadores y niveles" href="/dashboard/configuraciones-aprobacion" />
        <Acceso icono={<Users />} titulo="Expedientes" descripcion="Altas, contratos y datos fiscales" href="/dashboard/rrhh/empleados" />
        <Acceso icono={<CalendarClock />} titulo="Tiempo e incidencias" descripcion="Asistencia, vacaciones e incapacidades" href="/dashboard/rrhh/incidencias" />
        <Acceso icono={<Settings2 />} titulo="Configuración" descripcion="Patrón, impuestos y mapa contable" href="/dashboard/rrhh/configuracion-nomina" />
      </section>
    </div>
  );
}

function FlujoNomina({ estado, periodoId }: { estado: string; periodoId: string }) {
  const etapas = [
    { clave: 'ABIERTO', titulo: 'Incidencias', detalle: 'Captura y aprobación' },
    { clave: 'CALCULADO', titulo: 'Prenómina', detalle: 'Cálculo y revisión' },
    { clave: 'APROBADO', titulo: 'Autorización', detalle: 'Flujo de firmas' },
    { clave: 'TIMBRADO', titulo: 'CFDI y pago', detalle: 'Timbrado y dispersión' },
    { clave: 'CERRADO', titulo: 'Contabilidad', detalle: 'Póliza y cierre' },
  ];
  const orden = ['ABIERTO','CALCULANDO','CALCULADO','CON_ALERTAS','EN_REVISION','APROBADO','CFDI_PREPARADO','TIMBRADO','DISPERSION_GENERADA','EN_DISPERSION','PAGADO','CONTABILIZADO','CERRADO'];
  const actual = orden.indexOf(estado);
  const indices = [0, 2, 5, 7, 12];
  return <div className="overflow-x-auto"><div className="flex min-w-[720px] items-start">{etapas.map((e, i) => { const listo = actual >= indices[i]; const activo = actual >= indices[i] && (i === etapas.length - 1 || actual < indices[i + 1]); return <div key={e.clave} className="relative flex flex-1 flex-col items-center text-center"><div className={`absolute left-0 top-4 h-0.5 w-full ${i === 0 ? 'hidden' : listo ? 'bg-indigo-500' : 'bg-slate-200'}`} /><span className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white text-xs font-bold ${listo ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'} ${activo ? 'ring-4 ring-indigo-100' : ''}`}>{listo && !activo ? <Check className="h-4 w-4" /> : i + 1}</span><b className={`mt-2 text-xs ${activo ? 'text-indigo-700' : 'text-slate-700'}`}>{e.titulo}</b><span className="text-[10px] text-slate-400">{e.detalle}</span></div>; })}</div><input type="hidden" value={periodoId} readOnly /></div>;
}

function VacioPeriodo() { return <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center"><CalendarClock className="h-9 w-9 text-slate-300" /><h3 className="mt-3 font-bold text-slate-900">Selecciona o crea un periodo</h3><p className="mt-1 max-w-sm text-xs text-slate-500">El asistente mostrará qué sigue según el estado real de la nómina.</p><Link href="/dashboard/rrhh/nomina" className="btn btn-primario mt-4">Administrar periodos<ArrowRight className="h-4 w-4" /></Link></div>; }
function KpiOscuro({ icono, etiqueta, valor, alerta }: { icono:ReactNode; etiqueta:string; valor:string|number; alerta?:boolean }) { return <div className="rounded-xl border border-white/10 bg-white/[.07] p-4 backdrop-blur"><div className="flex items-center gap-2 text-slate-300"><span className={alerta ? 'text-amber-300' : 'text-indigo-300'}>{icono}</span><span className="text-[11px]">{etiqueta}</span></div><p className="mt-2 text-xl font-bold">{valor}</p></div>; }
function MiniTotal({ etiqueta, valor, destacado }: { etiqueta:string; valor:string|number; destacado?:boolean }) { return <div className={`${destacado ? 'bg-indigo-50' : 'bg-white'} p-3`}><p className="text-[10px] uppercase tracking-wide text-slate-400">{etiqueta}</p><p className={`mt-1 text-sm font-bold cifra ${destacado ? 'text-indigo-700' : 'text-slate-900'}`}>{valor}</p></div>; }
function Acceso({ icono, titulo, descripcion, href }: { icono:ReactNode; titulo:string; descripcion:string; href:string }) { return <Link href={href} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600">{icono}</span><span><b className="block text-sm text-slate-900">{titulo}</b><span className="mt-0.5 block text-[11px] text-slate-500">{descripcion}</span></span><ArrowRight className="ml-auto mt-1 h-4 w-4 text-slate-300 group-hover:text-indigo-500" /></Link>; }
