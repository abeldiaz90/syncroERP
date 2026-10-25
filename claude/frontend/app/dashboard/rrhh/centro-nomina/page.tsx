'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmarElegante } from '@/components/ui/dialogos';
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Banknote, Building2, Calculator, CalendarClock,
  Check, CheckCircle2, CircleAlert, Clock3, FileCheck2, Landmark,
  RefreshCw, Settings2, ShieldCheck, Sparkles, Users, WalletCards,
} from 'lucide-react';
import { api, conPermiso } from '@/lib/api';
import { usePermiso } from '@/hooks/use-permisos';
import { useRutasPermitidas } from '@/hooks/use-rutas-permitidas';
import { dinero, fecha, plural } from '@/lib/format';

import { useT } from '@/components/I18nProvider';
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
  const t = useT();
  const { tienePermiso } = usePermiso();
  /*
   * Esta pantalla la abren RRHH, Finanzas, Contabilidad y Tesorería: cada uno
   * firma un tramo de la nómina y ninguno tiene el módulo entero. Los accesos
   * del pie y la lista de requisitos llevan a pantallas de RRHH que la mayoría
   * de ellos no abre, así que se ofrecen sólo a quien puede entrar.
   */
  const { puedeAbrir } = useRutasPermitidas();
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [preparacion, setPreparacion] = useState<Preparacion | null>(null);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [pre, setPre] = useState<Prenomina | null>(null);
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([]);
  /* Vedadas por rol, que no es lo mismo que no haberlas podido cargar. */
  const [prenominaVedada, setPrenominaVedada] = useState(false);
  const [preparacionVedada, setPreparacionVedada] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const periodo = useMemo(() => periodos.find((p) => p.id === periodoId), [periodos, periodoId]);
  const puedePrepararCfdi = tienePermiso('POST', '/rrhh/nomina-avanzada/periodos/:id/cfdi/generar');

  async function cargarBase() {
    setCargando(true); setError('');
    try {
      /*
       * La preparacion de la empresa —puestos, plantilla, conceptos— es de
       * Recursos humanos. Finanzas y Tesoreria entran aqui solo a firmar, y su
       * 403 en esa llamada no es una averia: es la regla. Antes iba en el
       * mismo `Promise.all` y dejaba la pantalla entera en blanco, sin
       * periodos y sin flujo, para el rol que venia a autorizar la nomina.
       */
      const [t, p, r] = await Promise.all([
        api.get<Tablero>('/rrhh/nomina-avanzada/tablero'),
        api.get<Periodo[]>('/rrhh/nomina/periodos'),
        conPermiso(api.get<Preparacion>('/rrhh/preparacion')),
      ]);
      setTablero(t); setPeriodos(Array.isArray(p) ? p : []); setPreparacion(r.valor); setPreparacionVedada(r.vedado);
      const solicitado = new URLSearchParams(window.location.search).get('periodoId');
      if (!periodoId && solicitado && p.some((periodo) => periodo.id === solicitado)) setPeriodoId(solicitado);
      else if (!periodoId && p[0]) setPeriodoId(p[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : t("No fue posible cargar el centro de nómina.")); }
    finally { setCargando(false); }
  }

  /*
   * La prenomina y el flujo de firmas se cargan por separado a proposito.
   *
   * Gerencia abre la cadena de aprobacion de la nomina, pero NO ve la
   * prenomina trabajador por trabajador: autoriza por los totales del
   * periodo, y el sueldo de cada quien no es asunto de esa firma. Asi que su
   * 403 en la prenomina no es un fallo, es la regla funcionando.
   *
   * Iban las dos peticiones en un `Promise.all`, de modo que ese 403 esperado
   * tumbaba tambien el flujo de firmas: gerencia entraba a autorizar la
   * nomina, veia «No tienes permisos suficientes para esta accion» y ni
   * rastro de lo que tenia que firmar. Es el mismo error que en la
   * configuracion patronal, y por la misma causa.
   */
  async function cargarPeriodo(id: string) {
    if (!id) { setPre(null); setAprobaciones([]); setPrenominaVedada(false); return; }
    const actual = periodos.find((p) => p.id === id);
    if (!actual || !ESTADOS_CALCULADOS.includes(actual.estado)) {
      setPre(null); setAprobaciones([]); setPrenominaVedada(false); return;
    }
    setCargando(true); setError('');
    try {
      const [detalle, firmas] = await Promise.all([
        conPermiso(api.get<Prenomina>(`/rrhh/nomina-avanzada/periodos/${id}/prenomina`)),
        conPermiso(api.get<Aprobacion[]>(`/rrhh/nomina-avanzada/periodos/${id}/aprobaciones`)),
      ]);
      setPre(detalle.valor);
      setPrenominaVedada(detalle.vedado);
      setAprobaciones(Array.isArray(firmas.valor) ? firmas.valor : []);
    } catch (e) {
      setPre(null); setAprobaciones([]); setPrenominaVedada(false);
      setError(e instanceof Error ? e.message : t("No fue posible cargar el periodo."));
    } finally { setCargando(false); }
  }

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargarBase(), 0);
    return () => window.clearTimeout(temporizador);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargarPeriodo(periodoId), 0);
    return () => window.clearTimeout(temporizador);
  }, [periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Preparar los expedientes fiscales es de Recursos humanos
   * (`FIRMAS_NOMINA.prepararCfdi`), pero el boton vivia en «Cumplimiento y
   * cierre», una pantalla que RRHH no tiene en su menu. La accion era suya y
   * no tenia por donde; desde alli daba 403 a quien si podia abrirla.
   *
   * No se timbra aqui: se preparan. El timbrado exige respuesta autenticada
   * del PAC, y sin ella nada se marca como timbrado.
   */
  async function prepararCfdi() {
    if (!periodoId) return;
    try {
      await api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/cfdi/generar`, { enviarPac: false });
      setError('');
      await cargarPeriodo(periodoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No fue posible preparar los expedientes fiscales."));
    }
  }

  async function prepararAprobacion() {
    if (!pre) return;
    const aceptarAlertas = pre.alertas > 0;
    if (aceptarAlertas && !await confirmarElegante(`La prenómina contiene ${plural(pre.alertas, 'alerta', 'alertas')}. ¿Deseas enviarla a revisión dejando evidencia de aceptación?`)) return;
    try {
      /* Sin `niveles`: cuántas firmas lleva una nómina lo decide la matriz de
         aprobaciones de la empresa, no la pantalla que las dispara. El campo se
         quitó del DTO porque con `@Min(1)` quien preparaba podía pedir una sola
         firma y dejar a Finanzas y Tesorería fuera. */
      await api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/aprobaciones/preparar`, { aceptarAlertas });
      await cargarPeriodo(periodoId);
    } catch (e) { setError(e instanceof Error ? e.message : t("No fue posible iniciar la aprobación.")); }
  }

  async function resolver(id: string, estado: 'APROBADA' | 'RECHAZADA') {
    try {
      await api.patch(`/rrhh/nomina-avanzada/aprobaciones/${id}`, { estado, comentario: estado === 'RECHAZADA' ? 'Requiere corrección de prenómina' : undefined });
      await cargarPeriodo(periodoId);
    } catch (e) { setError(e instanceof Error ? e.message : t("No fue posible resolver la aprobación.")); }
  }

  const requisitos = [
    { titulo: 'Estructura organizacional', listo: (preparacion?.puestos ?? 0) > 0, detalle: `${preparacion?.puestos ?? 0} puestos`, href: '/dashboard/rrhh/puestos' },
    { titulo: 'Plantilla activa', listo: (preparacion?.empleados ?? 0) > 0, detalle: `${preparacion?.empleados ?? 0} empleados`, href: '/dashboard/rrhh/empleados' },
    { titulo: t("Conceptos de nómina"), listo: (preparacion?.conceptos ?? 0) > 0, detalle: `${preparacion?.conceptos ?? 0} conceptos`, href: '/dashboard/rrhh/conceptos-nomina' },
    { titulo: 'Tarifas fiscales', listo: Boolean(preparacion?.tarifasFiscales), detalle: preparacion?.tarifasFiscales ? `Ejercicio ${preparacion.ejercicioFiscal} disponible` : t("Ejercicio sin tarifas verificadas"), href: '/dashboard/rrhh/configuracion-nomina' },
    { titulo: t("Configuración patronal"), listo: Boolean(tablero?.configuracionCompleta), detalle: tablero?.configuracionCompleta ? 'Completa' : 'Pendiente', href: '/dashboard/rrhh/configuracion-nomina' },
  ];
  const avance = Math.round((requisitos.filter((r) => r.listo).length / requisitos.length) * 100);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 md:p-7">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl md:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-indigo-200"><Sparkles className="h-3.5 w-3.5" />{t("Centro de operación guiada")}</div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("Recursos Humanos y Nómina")}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{t("Un solo recorrido para preparar la empresa, contratar personal, revisar incidencias, calcular, autorizar, timbrar, pagar y contabilizar.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">{puedeAbrir('/dashboard/rrhh/empleados') && <Link href="/dashboard/rrhh/empleados" className="btn border-white/15 bg-white text-slate-950 hover:bg-slate-100"><Users className="h-4 w-4" />{t("Alta de empleado")}</Link>}<button className="btn border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => void cargarBase()}><RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />{t("Actualizar")}</button></div>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiOscuro icono={<Users />} etiqueta={t("Plantilla activa")} valor={tablero?.empleados ?? 0} />
          <KpiOscuro icono={<CircleAlert />} etiqueta={t("Incidencias pendientes")} valor={tablero?.incidenciasPendientes ?? 0} alerta={(tablero?.incidenciasPendientes ?? 0) > 0} />
          <KpiOscuro icono={<Banknote />} etiqueta={t("Saldo de préstamos")} valor={dinero(tablero?.saldoPrestamos ?? 0)} />
          {/* El avance sale de un dato que no todos los roles pueden leer; sin
              el dato diria 20% y seria mentira, no «no disponible». */}
          {!preparacionVedada && <KpiOscuro icono={<BadgeCheck />} etiqueta={t("Preparación")} valor={`${avance}%`} alerta={avance < 100} />}
        </div>
      </section>

      {error && <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{t(error)}</div>}

      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        {/*
          * La preparación de la empresa —puestos, plantilla, conceptos— es de
          * Recursos humanos. A Finanzas y Tesorería, que entran solo a firmar,
          * no se les enseña: sin el dato el panel diría «0 puestos, 0
          * empleados» y un avance falso sobre algo que además no es suyo.
          */}
        {!preparacionVedada && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div><p className="eyebrow">{t("Antes de calcular")}</p><h2 className="mt-1 text-base font-bold text-slate-950">{t("Preparación de la empresa")}</h2></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${avance === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{avance}%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${avance === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${avance}%` }} /></div>
          <div className="mt-5 space-y-2">
            {requisitos.map((r) => <Renglon key={r.titulo} href={puedeAbrir(r.href) ? r.href : null} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${r.listo ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{r.listo ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><span className="min-w-0"><b className="block text-xs text-slate-900">{t(r.titulo)}</b><span className="text-[11px] text-slate-500">{t(r.detalle)}</span></span><ArrowRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-indigo-500" /></Renglon>)}
          </div>
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">{t("Asistente de nómina")}</p><h2 className="mt-1 text-base font-bold text-slate-950">{t("Periodo en operación")}</h2></div><label className="min-w-80 text-xs font-semibold text-slate-600">{t("Periodo")}<select className="campo mt-1" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}><option value="">{t("Selecciona un periodo")}</option>{periodos.map((p) => <option key={p.id} value={p.id}>#{p.numero} · {p.regimen} · {fecha(p.fechaInicio)} a {fecha(p.fechaFin)} · {p.estado}</option>)}</select></label></div>

          {!periodo ? <VacioPeriodo /> : <div className="mt-6">
            <FlujoNomina estado={periodo.estado} periodoId={periodo.id} />
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-900">{t("Periodo #{n0}", { n0: periodo.numero })}</p><p className="text-[11px] text-slate-500">{t("{n0} al {n1} · Estado: {n2}", { n0: fecha(periodo.fechaInicio), n1: fecha(periodo.fechaFin), n2: periodo.estado })}</p></div><div className="flex gap-2"><Link className="btn btn-neutro" href="/dashboard/rrhh/incidencias"><CalendarClock className="h-4 w-4" />{t("Incidencias")}</Link><Link className="btn btn-primario" href="/dashboard/rrhh/nomina"><Calculator className="h-4 w-4" />{t("Calcular o recalcular")}</Link>{puedePrepararCfdi && <button className="btn btn-neutro" onClick={()=>void prepararCfdi()} title={t("Prepara los expedientes; el timbrado exige respuesta del PAC")}><FileCheck2 className="h-4 w-4" />{t("Preparar CFDI")}</button>}</div></div>
            </div>
          </div>}
        </section>
      </div>

      {/*
        * El bloque entero colgaba de `pre`, asi que quien no puede ver la
        * prenomina tampoco veia el flujo de firmas —y Gerencia entra aqui
        * justamente a firmar—. Ahora basta con tener una de las dos cosas.
        */}
      {(pre || prenominaVedada) && <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {pre ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">{t("Revisión de prenómina")}</h2><p className="text-xs text-slate-500">{t("Importes calculados por trabajador")}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${pre.alertas ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{pre.alertas ? `${pre.alertas} alertas` : t("Sin alertas")}</span></header>
          <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-6"><MiniTotal etiqueta={t("Trabajadores")} valor={pre.totales.empleados} /><MiniTotal etiqueta={t("Percepciones")} valor={dinero(pre.totales.percepciones)} /><MiniTotal etiqueta={t("ISR")} valor={dinero(pre.totales.isr)} /><MiniTotal etiqueta="IMSS" valor={dinero(pre.totales.imss)} /><MiniTotal etiqueta={t("Deducciones")} valor={dinero(pre.totales.deducciones)} /><MiniTotal etiqueta={t("Neto")} valor={dinero(pre.totales.neto)} destacado /></div>
          <div className="max-h-[420px] overflow-auto"><table className="tabla"><thead><tr><th>{t("Empleado")}</th><th className="text-right">{t("Días")}</th><th className="text-right">{t("Percepciones")}</th><th className="text-right">{t("Deducciones")}</th><th className="text-right">{t("Neto")}</th><th>{t("Validación")}</th></tr></thead><tbody>{pre.filas.map((f) => <tr key={f.reciboId}><td className="font-medium text-slate-900">{f.empleado}</td><td className="text-right cifra">{f.diasPagados}</td><td className="text-right cifra">{dinero(f.percepciones)}</td><td className="text-right cifra">{dinero(f.deducciones)}</td><td className="text-right cifra font-semibold">{dinero(f.neto)}</td><td>{f.alertas.length ? <span className="text-[11px] text-amber-700">{f.alertas.join(', ')}</span> : <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{t("Correcto")}</span>}</td></tr>)}</tbody></table></div>
        </section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-950">{t("Autorización por totales")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("El detalle por trabajador no forma parte de esta firma.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 md:grid-cols-4">
            <MiniTotal etiqueta={t("Trabajadores")} valor={tablero?.empleados ?? '—'} />
            <MiniTotal etiqueta={t("Periodo")} valor={`#${periodo?.numero ?? '—'}`} />
            <MiniTotal etiqueta={t("Pago")} valor={periodo ? fecha(periodo.fechaFin) : '—'} />
            <MiniTotal etiqueta={t("Neto a pagar")} valor={periodo ? dinero(periodo.totalNeto) : '—'} destacado />
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            
            {t("Tu rol autoriza la nómina por sus totales. La prenómina trabajador por trabajador —y con ella el sueldo de cada persona— la revisa Recursos humanos, que responde de su exactitud.")}
          </p>
        </section>}

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{t("Flujo de aprobación")}</h2><p className="mb-4 text-xs text-slate-500">{t("Las aprobaciones son secuenciales y dejan trazabilidad.")}</p>{!aprobaciones.length ? <button disabled={!['CALCULADO','CON_ALERTAS'].includes(periodo?.estado ?? '')} onClick={() => void prepararAprobacion()} className="btn btn-primario w-full"><ShieldCheck className="h-4 w-4" />{t("Enviar a aprobación")}</button> : <div className="space-y-2">{aprobaciones.map((a) => <div key={a.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><b className="text-xs">{t("Nivel {n0}", { n0: a.nivel })}</b><span className="text-[10px] font-bold text-slate-500">{a.estado}</span></div><p className="mt-0.5 text-[11px] text-slate-500">{a.rolRequerido}</p>{a.estado === 'PENDIENTE' && (a.puedoResolver
  ? <div className="mt-3 flex gap-2"><button className="btn btn-primario btn-sm flex-1" onClick={() => void resolver(a.id, 'APROBADA')}>{t("Aprobar")}</button><button className="btn btn-neutro btn-sm flex-1" onClick={() => void resolver(a.id, 'RECHAZADA')}>{t("Rechazar")}</button></div>
  : <p className="mt-2 text-[11px] text-slate-500">{a.motivoBloqueo ?? `Esta firma es de ${a.rolRequerido}.`}</p>)}</div>)}</div>}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{t("Siguientes pasos")}</h2><div className="mt-4 grid gap-2">{puedeAbrir('/dashboard/rrhh/recibos') && <Link className="btn btn-neutro w-full justify-start" href={`/dashboard/rrhh/recibos?periodoId=${periodoId}`}><FileCheck2 className="h-4 w-4" />{t("Revisar recibos")}</Link>}{puedeAbrir('/dashboard/rrhh/pagos') && <Link className="btn btn-primario w-full justify-start" href={`/dashboard/rrhh/pagos?periodoId=${periodoId}`}><WalletCards className="h-4 w-4" />{t("Dispersión y pago")}</Link>}{puedeAbrir('/dashboard/rrhh/cumplimiento') && <Link className="btn btn-neutro w-full justify-start" href={`/dashboard/rrhh/cumplimiento?periodoId=${periodoId}`}><Landmark className="h-4 w-4" />{t("Póliza y cierre")}</Link>}</div></section>
        </aside>
      </div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { icono: <Building2 />, titulo: t("Puestos y estructura"), descripcion: t("Áreas, plazas y rangos salariales"), href: '/dashboard/rrhh/puestos' },
          { icono: <ShieldCheck />, titulo: t("Aprobar estructura"), descripcion: t("Solicitudes pendientes"), href: '/dashboard/rrhh/aprobaciones-estructura' },
          { icono: <Settings2 />, titulo: t("Gobierno de flujos"), descripcion: t("Aprobadores y niveles"), href: '/dashboard/configuraciones-aprobacion' },
          { icono: <Users />, titulo: t("Expedientes"), descripcion: t("Altas, contratos y datos fiscales"), href: '/dashboard/rrhh/empleados' },
          { icono: <CalendarClock />, titulo: t("Tiempo e incidencias"), descripcion: t("Asistencia, vacaciones e incapacidades"), href: '/dashboard/rrhh/incidencias' },
          { icono: <Settings2 />, titulo: t("Configuración"), descripcion: t("Patrón, impuestos y mapa contable"), href: '/dashboard/rrhh/configuracion-nomina' },
        ]
          .filter((a) => puedeAbrir(a.href))
          .map((a) => <Acceso key={a.titulo} icono={a.icono} titulo={t(a.titulo)} descripcion={t(a.descripcion)} href={a.href} />)}
      </section>
    </div>
  );
}

function FlujoNomina({ estado, periodoId }: { estado: string; periodoId: string }) {
  const t = useT();
  const etapas = [
    { clave: 'ABIERTO', titulo: 'Incidencias', detalle: t("Captura y aprobación") },
    { clave: 'CALCULADO', titulo: t("Prenómina"), detalle: t("Cálculo y revisión") },
    { clave: 'APROBADO', titulo: t("Autorización"), detalle: t("Flujo de firmas") },
    { clave: 'TIMBRADO', titulo: t("CFDI y pago"), detalle: t("Timbrado y dispersión") },
    { clave: 'CERRADO', titulo: 'Contabilidad', detalle: t("Póliza y cierre") },
  ];
  const orden = ['ABIERTO','CALCULANDO','CALCULADO','CON_ALERTAS','EN_REVISION','APROBADO','CFDI_PREPARADO','TIMBRADO','DISPERSION_GENERADA','EN_DISPERSION','PAGADO','CONTABILIZADO','CERRADO'];
  const actual = orden.indexOf(estado);
  const indices = [0, 2, 5, 7, 12];
  return <div className="overflow-x-auto"><div className="flex min-w-[720px] items-start">{etapas.map((e, i) => { const listo = actual >= indices[i]; const activo = actual >= indices[i] && (i === etapas.length - 1 || actual < indices[i + 1]); return <div key={e.clave} className="relative flex flex-1 flex-col items-center text-center"><div className={`absolute left-0 top-4 h-0.5 w-full ${i === 0 ? 'hidden' : listo ? 'bg-indigo-500' : 'bg-slate-200'}`} /><span className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white text-xs font-bold ${listo ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'} ${activo ? 'ring-4 ring-indigo-100' : ''}`}>{listo && !activo ? <Check className="h-4 w-4" /> : i + 1}</span><b className={`mt-2 text-xs ${activo ? 'text-indigo-700' : 'text-slate-700'}`}>{t(e.titulo)}</b><span className="text-[10px] text-slate-400">{t(e.detalle)}</span></div>; })}</div><input type="hidden" value={periodoId} readOnly /></div>;
}

function VacioPeriodo() {
  const t = useT(); return <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center"><CalendarClock className="h-9 w-9 text-slate-300" /><h3 className="mt-3 font-bold text-slate-900">{t("Selecciona o crea un periodo")}</h3><p className="mt-1 max-w-sm text-xs text-slate-500">{t("El asistente mostrará qué sigue según el estado real de la nómina.")}</p><Link href="/dashboard/rrhh/nomina" className="btn btn-primario mt-4">{t("Administrar periodos")}<ArrowRight className="h-4 w-4" /></Link></div>; }
function KpiOscuro({ icono, etiqueta, valor, alerta }: { icono:ReactNode; etiqueta:string; valor:string|number; alerta?:boolean }) {
  const t = useT(); return <div className="rounded-xl border border-white/10 bg-white/[.07] p-4 backdrop-blur"><div className="flex items-center gap-2 text-slate-300"><span className={alerta ? 'text-amber-300' : 'text-indigo-300'}>{icono}</span><span className="text-[11px]">{t(etiqueta)}</span></div><p className="mt-2 text-xl font-bold">{valor}</p></div>; }
function MiniTotal({ etiqueta, valor, destacado }: { etiqueta:string; valor:string|number; destacado?:boolean }) {
  const t = useT(); return <div className={`${destacado ? 'bg-indigo-50' : 'bg-white'} p-3`}><p className="text-[10px] uppercase tracking-wide text-slate-400">{t(etiqueta)}</p><p className={`mt-1 text-sm font-bold cifra ${destacado ? 'text-indigo-700' : 'text-slate-900'}`}>{valor}</p></div>; }
/**
 * Un renglón que lleva a una pantalla cuando se puede abrir, y que se queda
 * quieto cuando no. No se esconde: el requisito sigue contando para el avance
 * y quien lo mira tiene que saber si está cumplido, aunque no sea quien lo
 * cumple.
 */
function Renglon({ href, className, children }: { href: string | null; className?: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>;
  return <Link href={href} className={className}>{children}</Link>;
}

function Acceso({ icono, titulo, descripcion, href }: { icono:ReactNode; titulo:string; descripcion:string; href:string }) {
  const t = useT(); return <Link href={href} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600">{icono}</span><span><b className="block text-sm text-slate-900">{t(titulo)}</b><span className="mt-0.5 block text-[11px] text-slate-500">{t(descripcion)}</span></span><ArrowRight className="ml-auto mt-1 h-4 w-4 text-slate-300 group-hover:text-indigo-500" /></Link>; }
