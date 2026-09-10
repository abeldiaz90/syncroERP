"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Search, ChevronDown, CheckCircle2, AlertCircle,
  X, Save, Clock, User, Calendar, CreditCard, Banknote,
  ArrowLeftRight, Eye, Filter, RefreshCw
} from 'lucide-react';

interface ICuota {
  id: string; numeroCuota: number; fechaVencimiento: string;
  montoCuota: number; montoCapital: number; montoInteres: number;
  montoPagado: number; saldoRestante?: number; estado: string;
}
interface ICredito {
  id: string; folio: string; tipoCredito: string;
  montoTotal: number; saldoPendiente: number; estado: string;
  fechaVencimiento: string; clienteId: string; sinInteres: boolean;
  numeroCuotas: number; cuotas: ICuota[];
  cliente?: { nombre: string; rfc?: string };
}
interface ICuentaBancaria { id: string; nombre: string; tipo: string; esPorDefecto: boolean; }

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const fmtFecha = (s: string) => new Date(s+'T00:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
const diasVencido = (fecha: string) => Math.floor((new Date().getTime() - new Date(fecha+'T00:00:00').getTime()) / 86400000);

const ESTADO_STYLE: Record<string, string> = {
  ACTIVO:    'bg-blue-50 text-blue-700 border-blue-200',
  LIQUIDADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  VENCIDO:   'bg-rose-50 text-rose-700 border-rose-200',
  CANCELADO: 'bg-slate-100 text-slate-500 border-slate-200',
};
const CUOTA_STYLE: Record<string, string> = {
  PENDIENTE:     'bg-amber-50 text-amber-700',
  VENCIDA:       'bg-rose-50 text-rose-600',
  PAGADA:        'bg-emerald-50 text-emerald-700',
  PAGO_PARCIAL:  'bg-blue-50 text-blue-700',
};
const TIPO_LABEL: Record<string, string> = {
  CREDITO_30D: '30 días', CREDITO_60D: '60 días', CREDITO_90D: '90 días',
  MENSUALIDADES: 'Mensualidades', MSI_BANCO: 'MSI Banco',
};

export default function CobranzaPage() {
  const [creditos, setCreditos]           = useState<ICredito[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<ICuentaBancaria[]>([]);
  const [cargando, setCargando]           = useState(true);
  const [busqueda, setBusqueda]           = useState('');
  const [filtroEstado, setFiltroEstado]   = useState('ACTIVO');
  const [creditoSeleccionado, setCreditoSeleccionado] = useState<ICredito|null>(null);
  const [cuotaSeleccionada, setCuotaSeleccionada]     = useState<ICuota|null>(null);
  const [modalPago, setModalPago]         = useState(false);
  const [guardando, setGuardando]         = useState(false);
  const [toast, setToast]                 = useState<{msg:string;ok:boolean}|null>(null);

  // Form pago
  const [montoPago, setMontoPago]         = useState('');
  const [metodoPago, setMetodoPago]       = useState('EFECTIVO');
  const [cuentaBancariaId, setCuentaBancariaId] = useState('');
  const [referencia, setReferencia]       = useState('');
  const [fechaPago, setFechaPago]         = useState(new Date().toISOString().split('T')[0]);
  /** Identifica este intento de cobro. Cambia al abrir el modal, no al reintentar. */
  const [claveIntento, setClaveIntento]   = useState('');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });
  const toast$ = (msg:string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),4000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rC, rCB] = await Promise.all([
      fetch(`${api}/credito/creditos${filtroEstado?`?estado=${filtroEstado}`:''}`, { headers:h() }),
      fetch(`${api}/credito/cuentas-bancarias`, { headers:h() }),
    ]);
    if (rC.ok)  setCreditos(await rC.json());
    if (rCB.ok) {
      const cb = await rCB.json();
      setCuentasBancarias(cb);
      const def = cb.find((c:ICuentaBancaria)=>c.esPorDefecto&&c.tipo==='CAJA');
      if (def) setCuentaBancariaId(def.id);
    }
    setCargando(false);
  }, [filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirPago = (credito: ICredito, cuota?: ICuota) => {
    setCreditoSeleccionado(credito);
    setCuotaSeleccionada(cuota??null);
    // Pre-llenar con el monto de la cuota o el saldo pendiente
    const monto = cuota ? (cuota.montoCuota - cuota.montoPagado) : credito.saldoPendiente;
    setMontoPago(String(Math.round(monto*100)/100));
    setFechaPago(new Date().toISOString().split('T')[0]);
    setReferencia('');
    setClaveIntento(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    setModalPago(true);
  };

  const registrarPago = async () => {
    if (!creditoSeleccionado || !montoPago || Number(montoPago)<=0) {
      toast$('El monto debe ser mayor a cero', false); return;
    }
    setGuardando(true);
    /*
     * La clave de idempotencia la exige el backend y esta pantalla no la
     * mandaba, así que TODO pago fallaba con 400. Se arma una por intento de
     * cobro: si el cajero pulsa dos veces o la red repite la petición, el pago
     * se aplica una sola vez.
     */
    const claveIdempotencia =
      `cobranza:${creditoSeleccionado.id}:${cuotaSeleccionada?.id ?? 'saldo'}:${claveIntento}`;
    const res = await fetch(`${api}/credito/cobranza/pago`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', ...h() },
      body: JSON.stringify({
        creditoId:        creditoSeleccionado.id,
        cuotaId:          cuotaSeleccionada?.id ?? null,
        montoPagado:      Number(montoPago),
        metodoPago,
        cuentaBancariaId: cuentaBancariaId || null,
        referencia:       referencia || null,
        fechaPago,
        claveIdempotencia,
      }),
    });
    setGuardando(false);
    if (res.ok) {
      toast$('Pago registrado correctamente');
      setModalPago(false);
      cargar();
    } else {
      const e = await res.json().catch(()=>({}));
      toast$(e.message??'Error al registrar el pago', false);
    }
  };

  const filtrados = creditos.filter(c => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return c.folio.toLowerCase().includes(q) ||
      c.cliente?.nombre?.toLowerCase().includes(q) ||
      c.cliente?.rfc?.toLowerCase().includes(q);
  });

  const cuotasPendientes = (c: ICredito) =>
    c.cuotas?.filter(cu => cu.estado==='PENDIENTE'||cu.estado==='VENCIDA'||cu.estado==='PAGO_PARCIAL') ?? [];

  const proximaCuota = (c: ICredito) => {
    const pend = cuotasPendientes(c).sort((a,b)=>a.numeroCuota-b.numeroCuota);
    return pend[0] ?? null;
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {toast&&(
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok?'bg-emerald-600':'bg-rose-600'}`}>
          {toast.ok?<CheckCircle2 className="w-5 h-5"/>:<AlertCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Crédito & Cobranza</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-indigo-500"/> Cobranza
          </h1>
          <p className="text-slate-500 text-sm mt-1">Registra abonos y pagos de créditos activos.</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 shadow-sm">
          <RefreshCw className="w-4 h-4"/> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar por folio o cliente..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"/>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400"/>
          {['ACTIVO','VENCIDO','LIQUIDADO',''].map(e=>(
            <button key={e} onClick={()=>setFiltroEstado(e)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${filtroEstado===e?'bg-indigo-600 text-white border-indigo-600':'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
              {e||'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de créditos */}
      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando créditos...</p>
        </div>
      ) : filtrados.length===0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <DollarSign className="w-12 h-12 text-slate-200 mx-auto mb-3"/>
          <p className="font-semibold text-slate-600">Sin créditos {filtroEstado?filtroEstado.toLowerCase()+'s':''}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtrados.map(credito => {
            const prox = proximaCuota(credito);
            const diasV = prox ? diasVencido(prox.fechaVencimiento) : 0;
            const estaBienVencido = diasV > 0;

            return (
              <div key={credito.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header tarjeta */}
                <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-indigo-600">{credito.folio}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ESTADO_STYLE[credito.estado]}`}>{credito.estado}</span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{TIPO_LABEL[credito.tipoCredito]??credito.tipoCredito}</span>
                      {credito.sinInteres&&<span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Sin interés</span>}
                    </div>
                    {credito.cliente&&(
                      <div className="flex items-center gap-2 mt-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400"/>
                        <span className="text-sm font-medium text-slate-700">{credito.cliente.nombre}</span>
                        {credito.cliente.rfc&&<span className="text-xs text-slate-400">{credito.cliente.rfc}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Saldo pendiente</p>
                    <p className="text-xl font-black text-slate-900">{fmt$(credito.saldoPendiente)}</p>
                    <p className="text-xs text-slate-400">de {fmt$(credito.montoTotal)}</p>
                  </div>
                  {credito.estado!=='LIQUIDADO'&&credito.estado!=='CANCELADO'&&(
                    <button onClick={()=>abrirPago(credito)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm shrink-0">
                      <DollarSign className="w-4 h-4"/> Registrar Abono
                    </button>
                  )}
                </div>

                {/* Cuotas */}
                {credito.cuotas&&credito.cuotas.length>0&&(
                  <div className="px-6 py-4">
                    <p className="text-xs font-bold uppercase text-slate-400 mb-3">
                      Cuotas — {cuotasPendientes(credito).length} pendientes
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {credito.cuotas.map(cuota=>{
                        const dias = diasVencido(cuota.fechaVencimiento);
                        const vencida = dias>0&&cuota.estado!=='PAGADA';
                        return (
                          <div key={cuota.id}
                            className={`p-3 rounded-xl border transition-all ${cuota.estado==='PAGADA'?'bg-emerald-50 border-emerald-200 opacity-60':vencida?'bg-rose-50 border-rose-200':'bg-slate-50 border-slate-200 hover:border-indigo-300 cursor-pointer'}`}
                            onClick={()=>cuota.estado!=='PAGADA'&&abrirPago(credito,cuota)}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-500">Cuota {cuota.numeroCuota}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CUOTA_STYLE[cuota.estado]}`}>{cuota.estado.replace('_',' ')}</span>
                            </div>
                            <p className="font-mono font-bold text-sm text-slate-900">{fmt$(cuota.montoCuota)}</p>
                            <p className={`text-[10px] mt-1 ${vencida?'text-rose-600 font-bold':'text-slate-400'}`}>
                              {vencida?`Vencida hace ${dias}d`:fmtFecha(cuota.fechaVencimiento)}
                            </p>
                            {cuota.montoPagado>0&&cuota.estado!=='PAGADA'&&(
                              <p className="text-[10px] text-blue-600 font-medium mt-0.5">Pagado: {fmt$(cuota.montoPagado)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Barra de progreso */}
                {credito.montoTotal>0&&(
                  <div className="px-6 pb-4">
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-indigo-500 rounded-full h-2 transition-all"
                        style={{width:`${Math.min(100,(1-credito.saldoPendiente/credito.montoTotal)*100)}%`}}/>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {fmt$(credito.montoTotal-credito.saldoPendiente)} pagado de {fmt$(credito.montoTotal)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal registrar pago */}
      {modalPago&&creditoSeleccionado&&(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-400"/>
                Registrar Pago — {creditoSeleccionado.folio}
              </h2>
              <button onClick={()=>setModalPago(false)} className="p-1.5 text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4">
              {cuotaSeleccionada&&(
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm">
                  <p className="font-bold text-indigo-800">Cuota {cuotaSeleccionada.numeroCuota}</p>
                  <div className="flex gap-4 mt-1 text-xs text-indigo-700">
                    <span>Vence: {fmtFecha(cuotaSeleccionada.fechaVencimiento)}</span>
                    <span>Total cuota: {fmt$(cuotaSeleccionada.montoCuota)}</span>
                    {cuotaSeleccionada.montoPagado>0&&<span>Abonado: {fmt$(cuotaSeleccionada.montoPagado)}</span>}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Monto a pagar *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input type="number" min="0.01" step="0.01" value={montoPago}
                    onChange={e=>setMontoPago(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
                <p className="text-xs text-slate-400 mt-1">Saldo pendiente: {fmt$(creditoSeleccionado.saldoPendiente)}</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id:'EFECTIVO',      icon:Banknote,       label:'Efectivo' },
                    { id:'TRANSFERENCIA', icon:ArrowLeftRight, label:'Transferencia' },
                    { id:'TARJETA_DEBITO',icon:CreditCard,     label:'Tarjeta' },
                  ].map(m=>(
                    <button key={m.id} onClick={()=>setMetodoPago(m.id)}
                      className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-colors ${metodoPago===m.id?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                      <m.icon className="w-4 h-4"/> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {cuentasBancarias.length>0&&(
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Cuenta donde ingresa el pago</label>
                  <select value={cuentaBancariaId} onChange={e=>setCuentaBancariaId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">— Seleccionar cuenta —</option>
                    {cuentasBancarias.map(c=><option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fecha del pago</label>
                  <input type="date" value={fechaPago} onChange={e=>setFechaPago(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Referencia (opcional)</label>
                  <input type="text" value={referencia} onChange={e=>setReferencia(e.target.value)}
                    placeholder="No. de transferencia..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={()=>setModalPago(false)} className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button onClick={registrarPago} disabled={guardando}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {guardando?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<Save className="w-4 h-4"/>}
                  {guardando?'Guardando...':'Registrar Pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
