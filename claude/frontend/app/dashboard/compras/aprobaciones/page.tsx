"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, XCircle, Eye, Clock, Package, User,
  Calendar, MessageSquare, AlertTriangle, RefreshCw,
  Flag, ChevronDown, ChevronUp, Bell, Inbox, History, Ban
} from 'lucide-react';
import { ProtectedElement } from '@/app/components/ProtectedElement';
import { FOLIO, folioDe } from '@/lib/folios';

interface IProducto { nombre: string; sku?: string; }
interface IDetalle { productoId: string; cantidadSolicitada: number; producto?: IProducto; }
interface IRequisicion {
  id: string; fechaSolicitud: string; estado: string; notas?: string; prioridad?: string;
  usuarioSolicitante?: { nombreCompleto?: string; nombre?: string };
  detalles?: IDetalle[];
}
interface IAprobacion {
  id: string; orden: number; estado: string;
  requisicion: IRequisicion;
  usuario?: { nombreCompleto?: string };
}

/*
 * Una adjudicación esperando firma no aparecía en NINGUNA pantalla. Esta sólo
 * listaba requisiciones, así que quien tenía que firmarla llegaba únicamente
 * si alguien le pasaba la URL de la requisición a mano. Se comprobó en vivo el
 * 22-sep: Gerencia pudo adjudicar porque yo escribí la dirección.
 *
 * Lista el documento y enlaza al comparativo; la firma se da allí. Adjudicar
 * sin ver las ofertas que compiten es justo lo que no se quiere.
 */
interface IAdjudicacion {
  aprobacionId: string;
  ciclo: number;
  nivel: number;
  fechaVencimiento?: string;
  importeSolicitado: number;
  motivoSeleccion?: string | null;
  solicitadaPor?: string;
  cotizacion: {
    id: string;
    requisicionId: string;
    total: number;
    /*
     * `nombre` es el campo OBLIGATORIO de la entidad Proveedor y es el que
     * llena el alta rápida; `razonSocial` es opcional y `nombreComercial` no
     * existe en la entidad. El tipo declaraba justo los dos que no sirven, que
     * es cómo la tarjeta acabó diciendo «Proveedor no disponible» con el dato
     * ahí al lado.
     */
    proveedor?: { nombre?: string; razonSocial?: string };
    requisicion?: { id: string; usuarioSolicitante?: { nombreCompleto?: string } };
  };
}

/*
 * ============================================================================
 * EL HISTORIAL: LO QUE YA FIRMÉ
 * ----------------------------------------------------------------------------
 * Esta pantalla sólo mostraba lo pendiente. En cuanto alguien aprobaba o
 * rechazaba, el documento desaparecía y no volvía a aparecer en ningún lado:
 * quien firma no podía ver qué firmó, ni cuándo, ni con qué comentario.
 *
 * Una firma de aprobación compromete dinero de la empresa. Quien la da
 * necesita poder volver sobre ella —para contestar «¿tú autorizaste esto?»,
 * para recordar por qué rechazó algo, para revisar qué dejó pasar antes de que
 * llegue la factura—. Sin historial, del acto sólo queda el efecto.
 *
 * Las dos mitades de la bandeja tienen su historial, y se leen juntas en una
 * segunda pestaña: requisiciones y adjudicaciones de cotización.
 * ============================================================================
 */
interface IAprobacionResuelta {
  id: string;
  orden: number;
  estado: string;
  comentario?: string | null;
  fechaResolucion?: string | null;
  fechaCreacion: string;
  requisicion: IRequisicion;
  usuario?: { nombreCompleto?: string };
}

interface IAdjudicacionResuelta {
  aprobacionId: string;
  ciclo: number;
  nivel: number;
  estado: string;
  /** La resolvió quien pregunta, o se cerró sin él. No es la misma frase. */
  resueltaPorMi: boolean;
  resueltaPor?: string | null;
  solicitadaPor?: string;
  fechaResolucion?: string | null;
  fechaCreacion: string;
  comentario?: string | null;
  importeSolicitado: number;
  cotizacion: {
    id: string;
    requisicionId: string;
    total: number;
    proveedor?: { nombre?: string; razonSocial?: string };
  } | null;
}

/**
 * Cómo se pinta cada desenlace.
 *
 * `CANCELADA` existe y no es un adorno: cuando alguien rechaza un nivel, los
 * demás niveles pendientes de ese ciclo se cancelan. Para quien tenía uno de
 * ésos asignado, el documento se le fue de la bandeja sin que él hiciera nada,
 * y eso es justo lo que un historial tiene que poder explicar.
 */
const DESENLACE: Record<
  string,
  { label: string; cls: string; Icono: typeof CheckCircle2 }
> = {
  APROBADO:  { label: 'Aprobada',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icono: CheckCircle2 },
  APROBADA:  { label: 'Aprobada',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icono: CheckCircle2 },
  RECHAZADO: { label: 'Rechazada', cls: 'bg-rose-50 text-rose-700 border-rose-200',          Icono: XCircle },
  RECHAZADA: { label: 'Rechazada', cls: 'bg-rose-50 text-rose-700 border-rose-200',          Icono: XCircle },
  CANCELADA: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-600 border-slate-200',      Icono: Ban },
};

const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  URGENTE: { label: 'URGENTE', cls: 'bg-red-100 text-red-700 border-red-300',     dot: 'bg-red-500' },
  ALTA:    { label: 'Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
  NORMAL:  { label: 'Normal',  cls: 'bg-slate-100 text-slate-500 border-slate-200',    dot: 'bg-slate-400' },
  BAJA:    { label: 'Baja',    cls: 'bg-green-100 text-green-700 border-green-200',    dot: 'bg-green-400' },
};

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

/*
 * En el historial importa la hora, no sólo el día: «lo aprobé el martes» y «lo
 * aprobé el martes a las 19:40, después de que cerrara almacén» son respuestas
 * distintas a la misma pregunta.
 *
 * Y si la fila no trae resolución —las que existían antes de registrarla— se
 * dice que no consta, en vez de inventar una fecha o enseñar «Invalid Date».
 */
const fmtMomento = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'fecha no registrada';

const fmtDinero = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(Number(n || 0));

export default function AprobacionesPage() {
  const [aprobaciones, setAprobaciones] = useState<IAprobacion[]>([]);
  const [adjudicaciones, setAdjudicaciones] = useState<IAdjudicacion[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [comentarios, setComentarios]   = useState<Record<string, string>>({});
  const [expandidos, setExpandidos]     = useState<Record<string, boolean>>({});
  const [procesando, setProcesando]     = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  const [pestana, setPestana]           = useState<'pendientes' | 'historial'>('pendientes');
  const [histReq, setHistReq]           = useState<IAprobacionResuelta[]>([]);
  const [histAdj, setHistAdj]           = useState<IAdjudicacionResuelta[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [errorHist, setErrorHist]       = useState('');
  /*
   * Si no se ha pedido nunca, «no has firmado nada» es una conclusión que
   * todavía no se puede sacar. Es el mismo cuidado que ya tenía la bandeja de
   * pendientes: un vacío sin consulta de respaldo afirma sobre el mundo.
   */
  const [histPedido, setHistPedido]     = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });
  const toast$ = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    /*
      «Todo al día» es una conclusión, no un estado vacío.
      Esta es la bandeja donde un aprobador decide si se queda a firmar o se
      va: si la consulta falla y la lista queda vacía, la pantalla le decía
      «Todo al día · No tienes requisiciones ni adjudicaciones pendientes de
      aprobar» y el documento se quedaba esperando. Ahora sólo se dice cuando
      las dos consultas contestaron.

      Un 403 en una de las dos sigue siendo normal —hay roles que aprueban
      requisiciones y no adjudicaciones, y al revés—, pero se anota.
    */
    const [r, ra] = await Promise.all([
      fetch(`${api}/compras/requisiciones/aprobaciones/pendientes`, { headers: h() }),
      fetch(`${api}/compras/cotizaciones/aprobaciones/pendientes`, { headers: h() }),
    ]);
    if (r.ok) { setAprobaciones(await r.json()); }
    else { setAprobaciones([]); }
    setAdjudicaciones(ra.ok ? await ra.json() : []);
    /*
      Un 403 significa «esto no te toca» y no ensucia la bandeja; cualquier
      otro fallo sí, porque entonces no se sabe si hay algo esperando.
    */
    const caidas = [
      !r.ok && r.status !== 403 ? 'las requisiciones' : '',
      !ra.ok && ra.status !== 403 ? 'las adjudicaciones' : '',
    ].filter(Boolean);
    setErrorCarga(
      caidas.length
        ? `No se pudieron consultar ${caidas.join(' ni ')}. Puede haber documentos esperando tu firma.`
        : '',
    );
    setCargando(false);
  }, []);

  /*
   * El historial se pide cuando se abre su pestaña, no al cargar la pantalla.
   * Quien entra aquí viene a firmar lo que espera; traer de paso quinientos
   * documentos resueltos retrasaría justamente eso.
   */
  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    const [r, ra] = await Promise.all([
      fetch(`${api}/compras/requisiciones/aprobaciones/historial`, { headers: h() }),
      fetch(`${api}/compras/cotizaciones/aprobaciones/historial`, { headers: h() }),
    ]);
    setHistReq(r.ok ? await r.json() : []);
    setHistAdj(ra.ok ? await ra.json() : []);
    /*
     * Igual que en pendientes: un 403 es «esto no te toca» y no es un fallo
     * —hay roles que firman requisiciones y no adjudicaciones—; cualquier otro
     * error sí, porque entonces el historial está incompleto y no se sabe.
     */
    const caidas = [
      !r.ok && r.status !== 403 ? 'las requisiciones' : '',
      !ra.ok && ra.status !== 403 ? 'las adjudicaciones' : '',
    ].filter(Boolean);
    setErrorHist(
      caidas.length
        ? `No se pudo leer el historial de ${caidas.join(' ni ')}. Lo que ves abajo está incompleto.`
        : '',
    );
    setHistPedido(true);
    setCargandoHist(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (pestana === 'historial' && !histPedido) cargarHistorial();
  }, [pestana, histPedido, cargarHistorial]);

  const resolver = async (id: string, estado: 'APROBADO' | 'RECHAZADO') => {
    if (estado === 'RECHAZADO' && !comentarios[id]?.trim()) {
      toast$('Escribe un motivo de rechazo', false); return;
    }
    setProcesando(id);
    const r = await fetch(`${api}/compras/requisiciones/aprobaciones/${id}`, {
      method: 'PATCH', headers: { ...h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, comentario: comentarios[id] ?? '' }),
    });
    setProcesando(null);
    if (r.ok) {
      toast$(estado === 'APROBADO' ? '✓ Requisición aprobada' : '✗ Requisición rechazada', estado === 'APROBADO');
      setAprobaciones(prev => prev.filter(a => a.id !== id));
      /*
       * Lo que acaba de salir de pendientes pertenece ya al historial. Marcarlo
       * como no pedido obliga a releerlo la próxima vez que se abra esa
       * pestaña: si no, quien firma cambia de pestaña a los dos segundos y no
       * encuentra lo que acaba de firmar.
       */
      setHistPedido(false);
    } else {
      /*
       * «Error al procesar» borraba la unica pista util.
       *
       * Esta pantalla devolvia 400 en CADA aprobacion —el DTO exigia comentario
       * siempre y el campo dice «obligatorio si rechazas», asi que al aprobar
       * se mandaba cadena vacia— y lo unico que veia quien firmaba era un
       * «Error al procesar» rojo, sin decir que faltaba. La requisicion del
       * almacenista estuvo un dia entero atorada por eso: no faltaba la firma,
       * el boton no podia firmar.
       *
       * El servidor sabe exactamente que pasa —el nivel anterior sin resolver,
       * la aprobacion asignada a otro, la requisicion que ya cambio de estado—.
       * Repetirlo es mas util que cualquier mensaje que se invente aqui.
       */
      const e = await r.json().catch(() => ({}));
      const detalle = Array.isArray(e?.message) ? e.message[0] : e?.message;
      toast$(detalle ?? 'No se pudo procesar la aprobación', false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Compras</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Bell className="w-8 h-8 text-indigo-500"/>
            Aprobaciones
            {aprobaciones.length + adjudicaciones.length > 0 && (
              <span className="text-sm font-bold bg-rose-500 text-white px-2.5 py-1 rounded-full">
                {aprobaciones.length + adjudicaciones.length}
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {pestana === 'pendientes'
              ? 'Lo que espera tu firma en compras: requisiciones y adjudicaciones de cotización.'
              : 'Lo que ya firmaste: qué decidiste, cuándo y con qué comentario.'}
          </p>
        </div>
        <button
          onClick={() => (pestana === 'pendientes' ? cargar() : cargarHistorial())}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm"
          title="Actualizar"
        >
          <RefreshCw className="w-4 h-4"/>
        </button>
      </div>

      {/* Pestañas */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
        {([
          { id: 'pendientes', texto: 'Pendientes', Icono: Inbox },
          { id: 'historial',  texto: 'Historial',  Icono: History },
        ] as const).map(({ id, texto, Icono }) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              pestana === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icono className="h-4 w-4" />
            {texto}
            {id === 'pendientes' && aprobaciones.length + adjudicaciones.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                pestana === id ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'
              }`}>
                {aprobaciones.length + adjudicaciones.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {pestana === 'historial' ? (
        <HistorialDeFirmas
          cargando={cargandoHist}
          error={errorHist}
          requisiciones={histReq}
          adjudicaciones={histAdj}
        />
      ) : cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando aprobaciones...</p>
        </div>
      ) : errorCarga ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-16 text-center">
          <Inbox className="w-16 h-16 text-rose-200 mx-auto mb-4"/>
          <p className="font-bold text-xl text-rose-700">No se pudo leer la bandeja</p>
          <p className="text-slate-500 text-sm mt-1">{errorCarga}</p>
        </div>
      ) : aprobaciones.length === 0 && adjudicaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <Inbox className="w-16 h-16 text-slate-200 mx-auto mb-4"/>
          <p className="font-bold text-xl text-slate-700">Todo al día</p>
          <p className="text-slate-400 text-sm mt-1">No tienes requisiciones ni adjudicaciones pendientes de aprobar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {adjudicaciones.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-amber-900">
                <Flag className="h-4 w-4" />
                Adjudicaciones de cotización · {adjudicaciones.length}
              </h2>
              <p className="mt-1 text-xs font-semibold text-amber-800">
                Elegir proveedor se firma viendo las ofertas que compiten, no
                desde una lista. El enlace abre el comparativo.
              </p>
              <ul className="mt-4 space-y-3">
                {adjudicaciones.map((item) => {
                  const vencido = Boolean(
                    item.fechaVencimiento &&
                      new Date(item.fechaVencimiento).getTime() < Date.now(),
                  );
                  /*
                   * Quien firma ve el NOMBRE. Esto leía `razonSocial` y
                   * `nombreComercial`, y de esos dos uno es opcional —casi
                   * nunca se captura en un alta rápida— y el otro no existe en
                   * la entidad. El resultado, medido el 28-sep-2026 con la
                   * sesión de gerencia: las dos adjudicaciones que esperaban
                   * firma decían «Proveedor no disponible» y sólo se
                   * distinguían por el importe. Se pedía firmar A QUIÉN SE LE
                   * COMPRA sin decir a quién, con el dato ahí al lado.
                   *
                   * Y el texto mentía dos veces: «no disponible» se lee como
                   * proveedor dado de baja o bloqueado, que en este ERP es un
                   * estado real y uno que impide adjudicar.
                   *
                   * Se prefiere la razón social —es el nombre fiscal, y para
                   * una firma es el bueno— pero la caída llega al campo
                   * obligatorio antes que a un aviso.
                   */
                  const prov =
                    item.cotizacion.proveedor?.razonSocial?.trim() ||
                    item.cotizacion.proveedor?.nombre?.trim() ||
                    'Proveedor no disponible';
                  return (
                    <li
                      key={item.aprobacionId}
                      className="rounded-xl border border-amber-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-slate-900">{prov}</p>
                          {/*
                            * Dos personas distintas, y confundirlas en una
                            * pantalla de firma es nombrar a quien no fue:
                            * quien PIDIO la adjudicacion y quien levanto la
                            * requisicion.
                            */}
                          <p className="text-xs text-slate-500">
                            Adjudicación pedida por{' '}
                            <strong className="font-semibold text-slate-700">
                              {item.solicitadaPor ?? 'alguien de compras'}
                            </strong>{' '}
                            · Ciclo {item.ciclo} · Nivel {item.nivel}
                          </p>
                          <p className="text-xs text-slate-500">
                            Requisición de{' '}
                            {item.cotizacion.requisicion?.usuarioSolicitante
                              ?.nombreCompleto ?? 'origen no disponible'}
                          </p>
                          {item.motivoSeleccion && (
                            <p className="mt-2 text-xs italic text-slate-600">
                              «{item.motivoSeleccion}»
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-slate-900">
                            {new Intl.NumberFormat('es-MX', {
                              style: 'currency',
                              currency: 'MXN',
                            }).format(Number(item.importeSolicitado || 0))}
                          </p>
                          {item.fechaVencimiento && (
                            <p
                              className={`text-[11px] font-semibold ${
                                vencido ? 'text-rose-600' : 'text-slate-500'
                              }`}
                            >
                              {vencido ? 'SLA excedido' : 'Atender antes de'}{' '}
                              {new Date(item.fechaVencimiento).toLocaleString('es-MX')}
                            </p>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/compras/cotizaciones/requisicion/${item.cotizacion.requisicionId}`}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
                      >
                        <Eye className="h-4 w-4" /> Comparar propuestas y firmar
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {aprobaciones
            .sort((a, b) => {
              const orden = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAJA: 3 };
              const pA = orden[(a.requisicion.prioridad ?? 'NORMAL') as keyof typeof orden] ?? 2;
              const pB = orden[(b.requisicion.prioridad ?? 'NORMAL') as keyof typeof orden] ?? 2;
              return pA - pB;
            })
            .map(ap => {
              const req = ap.requisicion;
              const prioridadCfg = PRIORIDAD_CONFIG[req.prioridad ?? 'NORMAL'];
              const isExpanded = expandidos[ap.id];
              const isProcessing = procesando === ap.id;

              return (
                <div key={ap.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${
                  req.prioridad === 'URGENTE' ? 'border-red-300' : 'border-slate-200'
                }`}>
                  {/* Banda de prioridad */}
                  {req.prioridad === 'URGENTE' && (
                    <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest text-center py-1 flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3 h-3"/> Requiere atención urgente
                    </div>
                  )}

                  <div className="p-5">
                    {/* Header de la card */}
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono font-black text-indigo-600">
                            {folioDe(req, FOLIO.REQUISICION)}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prioridadCfg.cls}`}>
                            {prioridadCfg.label}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3"/> {fmtFecha(req.fechaSolicitud)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <User className="w-4 h-4 text-slate-400"/>
                            <span className="font-medium">{req.usuarioSolicitante?.nombreCompleto ?? '—'}</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Package className="w-4 h-4 text-slate-400"/>
                            <span className="font-medium">{req.detalles?.length ?? 0} producto(s)</span>
                          </span>
                        </div>

                        {req.notas && (
                          <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            "{req.notas}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                          <Link href={`/dashboard/compras/requisiciones/${req.id}`}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Ver detalle">
                            <Eye className="w-4 h-4"/>
                          </Link>
                        </ProtectedElement>
                        <button onClick={() => setExpandidos(prev => ({ ...prev, [ap.id]: !isExpanded }))}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                      </div>
                    </div>

                    {/* Productos expandidos */}
                    {isExpanded && req.detalles && req.detalles.length > 0 && (
                      <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                          <p className="text-xs font-bold uppercase text-slate-500">Detalle de productos</p>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-2 text-left font-bold text-slate-500">Producto</th>
                              <th className="px-4 py-2 text-center font-bold text-slate-500">Cantidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {req.detalles.map((d, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-slate-800">{d.producto?.nombre ?? d.productoId}</p>
                                  {d.producto?.sku && <p className="text-[9px] font-mono text-slate-400">{d.producto.sku}</p>}
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-slate-700">{d.cantidadSolicitada}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Zona de decisión */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
                          <input type="text"
                            value={comentarios[ap.id] ?? ''}
                            onChange={e => setComentarios(prev => ({ ...prev, [ap.id]: e.target.value }))}
                            placeholder="Comentario (obligatorio si rechazas)..."
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                        </div>
                        <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/aprobaciones/:id">
                          <div className="flex gap-2">
                            <button onClick={() => resolver(ap.id, 'APROBADO')} disabled={isProcessing}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                              {isProcessing
                                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                : <CheckCircle2 className="w-4 h-4"/>}
                              Aprobar
                            </button>
                            <button onClick={() => resolver(ap.id, 'RECHAZADO')} disabled={isProcessing}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm">
                              <XCircle className="w-4 h-4"/> Rechazar
                            </button>
                          </div>
                        </ProtectedElement>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * Historial de firmas
 * ----------------------------------------------------------------------------
 * Una sola lista con las dos mitades de la bandeja —requisiciones y
 * adjudicaciones— ordenadas por lo más reciente, porque quien pregunta «¿qué
 * aprobé?» no piensa en qué tabla vive cada cosa.
 *
 * Cada fila dice las cuatro cosas por las que se vuelve a un historial: QUÉ
 * documento, QUÉ se decidió, CUÁNDO y CON QUÉ comentario. El comentario sobre
 * todo: es lo único que explica un rechazo, y era lo que se perdía al
 * desaparecer el documento de la pantalla.
 * ============================================================================
 */
function HistorialDeFirmas({
  cargando,
  error,
  requisiciones,
  adjudicaciones,
}: {
  cargando: boolean;
  error: string;
  requisiciones: IAprobacionResuelta[];
  adjudicaciones: IAdjudicacionResuelta[];
}) {
  if (cargando) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Buscando lo que has firmado...</p>
      </div>
    );
  }

  /*
   * Se mezclan las dos listas y se ordenan por el momento de la resolución.
   * Las filas sin fecha registrada —las anteriores a que se guardara— caen al
   * final en vez de arriba, que es donde las pondría un `undefined` tratado
   * como cero.
   */
  const momento = (s?: string | null) => (s ? new Date(s).getTime() : -Infinity);
  const filas = [
    ...requisiciones.map((r) => ({ tipo: 'REQ' as const, cuando: momento(r.fechaResolucion), dato: r })),
    ...adjudicaciones.map((a) => ({ tipo: 'ADJ' as const, cuando: momento(a.fechaResolucion), dato: a })),
  ].sort((a, b) => b.cuando - a.cuando);

  if (!filas.length && !error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
        <History className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <p className="font-bold text-xl text-slate-700">Todavía no has firmado nada</p>
        <p className="text-slate-400 text-sm mt-1">
          Aquí van a quedar las requisiciones y adjudicaciones que apruebes o rechaces.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </div>
      )}

      {filas.map((fila) => {
        if (fila.tipo === 'REQ') {
          const ap = fila.dato;
          const d = DESENLACE[ap.estado] ?? DESENLACE.CANCELADA;
          return (
            <article key={`req-${ap.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono font-black text-indigo-600">
                      {folioDe(ap.requisicion, FOLIO.REQUISICION)}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${d.cls}`}>
                      <d.Icono className="h-3 w-3" /> {d.label}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Requisición · nivel {ap.orden}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    Pedida por{' '}
                    <strong className="font-semibold text-slate-800">
                      {ap.requisicion?.usuarioSolicitante?.nombreCompleto ?? '—'}
                    </strong>
                    {' · '}
                    {ap.requisicion?.detalles?.length ?? 0} producto(s)
                  </p>
                  {ap.comentario && (
                    <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                      «{ap.comentario}»
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="flex items-center justify-end gap-1.5 text-xs font-semibold text-slate-500">
                    <Clock className="h-3.5 w-3.5" /> {fmtMomento(ap.fechaResolucion)}
                  </p>
                  <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                    <Link
                      href={`/dashboard/compras/requisiciones/${ap.requisicion?.id}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver documento
                    </Link>
                  </ProtectedElement>
                </div>
              </div>
            </article>
          );
        }

        const adj = fila.dato;
        const d = DESENLACE[adj.estado] ?? DESENLACE.CANCELADA;
        const prov =
          adj.cotizacion?.proveedor?.razonSocial?.trim() ||
          adj.cotizacion?.proveedor?.nombre?.trim() ||
          'Proveedor sin nombre capturado';
        return (
          <article key={`adj-${adj.aprobacionId}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-900">{prov}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${d.cls}`}>
                    <d.Icono className="h-3 w-3" /> {d.label}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Adjudicación · ciclo {adj.ciclo} · nivel {adj.nivel}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Pedida por{' '}
                  <strong className="font-semibold text-slate-800">
                    {adj.solicitadaPor ?? 'alguien de compras'}
                  </strong>
                </p>
                {/*
                  * Que lo haya cerrado otro no se esconde: era un paso a mi
                  * nombre y alguien más lo resolvió. Decirlo es la diferencia
                  * entre un historial y una lista de cosas que pasaron.
                  */}
                {!adj.resueltaPorMi && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    {adj.estado === 'CANCELADA'
                      ? 'Se canceló al resolverse otro nivel del mismo ciclo.'
                      : `Lo resolvió ${adj.resueltaPor ?? 'alguien más'}, no tú.`}
                  </p>
                )}
                {adj.comentario && (
                  <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                    «{adj.comentario}»
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-black text-slate-900">{fmtDinero(adj.importeSolicitado)}</p>
                <p className="flex items-center justify-end gap-1.5 text-xs font-semibold text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> {fmtMomento(adj.fechaResolucion)}
                </p>
                {adj.cotizacion ? (
                  <Link
                    href={`/dashboard/compras/cotizaciones/requisicion/${adj.cotizacion.requisicionId}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver comparativo
                  </Link>
                ) : (
                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    La cotización ya no existe
                  </p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
