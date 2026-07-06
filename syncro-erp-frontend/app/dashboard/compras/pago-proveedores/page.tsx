"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Search, DollarSign, CheckCircle2, AlertCircle,
  X, Save, Banknote, ArrowLeftRight, Building2, RefreshCw, Filter
} from 'lucide-react';

interface IProveedor { id: string; nombre: string; rfc?: string; }
interface IOrden {
  id: string; estado: string; total: number; fechaCreacion: string;
  proveedor?: IProveedor;
  detalles?: Array<{ cantidad: number; cantidadRecibidaOk: number; precioUnitario: number; producto?: { nombre: string } }>;
}
interface ICuentaBancaria { id: string; nombre: string; tipo: string; esPorDefecto: boolean; activo: boolean; }

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});

const ESTADO_STYLE: Record<string,string> = {
  RECIBIDA:        'bg-blue-50 text-blue-700 border-blue-200',
  CON_INCIDENCIAS: 'bg-amber-50 text-amber-700 border-amber-200',
  PAGADA:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDIENTE:       'bg-slate-100 text-slate-600 border-slate-200',
  ENVIADA:         'bg-purple-50 text-purple-700 border-purple-200',
};

export default function PagoProveedoresPage() {
  const [ordenes, setOrdenes]               = useState<IOrden[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<ICuentaBancaria[]>([]);
  const [cargando, setCargando]             = useState(true);
  const [busqueda, setBusqueda]             = useState('');
  const [filtroEstado, setFiltroEstado]     = useState('RECIBIDA');
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<IOrden|null>(null);
  const [modal, setModal]                   = useState(false);
  const [guardando, setGuardando]           = useState(false);
  const [toast, setToast]                   = useState<{msg:string;ok:boolean}|null>(null);

  // Form pago
  const [montoPago, setMontoPago]           = useState('');
  const [cuentaBancariaId, setCuentaBancariaId] = useState('');
  const [referencia, setReferencia]         = useState('');
  const [fechaPago, setFechaPago]           = useState(new Date().toISOString().split('T')[0]);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });
  const toast$ = (msg:string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),4000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rO, rCB] = await Promise.all([
      fetch(`${api}/compras/ordenes`, { headers: h() }),
      fetch(`${api}/credito/cuentas-bancarias`, { headers: h() }),
    ]);
    if (rO.ok) setOrdenes(await rO.json());
    if (rCB.ok) {
      const cb = await rCB.json();
      setCuentasBancarias(cb);
      const def = cb.find((c:ICuentaBancaria) => c.esPorDefecto && c.tipo==='CAJA');
      if (def) setCuentaBancariaId(def.id);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirModal = (orden: IOrden) => {
    setOrdenSeleccionada(orden);
    setMontoPago(String(orden.total));
    setFechaPago(new Date().toISOString().split('T')[0]);
    setReferencia('');
    setModal(true);
  };

  const registrarPago = async () => {
    if (!ordenSeleccionada || !montoPago || Number(montoPago) <= 0) {
      toast$('El monto debe ser mayor a cero', false); return;
    }
    setGuardando(true);
    const res = await fetch(`${api}/compras/ordenes/${ordenSeleccionada.id}/pagar`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', ...h() },
      body: JSON.stringify({
        montoPagado:     Number(montoPago),
        cuentaBancariaId: cuentaBancariaId || null,
        referencia:      referencia || null,
        fechaPago,
      }),
    });
    setGuardando(false);
    if (res.ok) {
      toast$('Pago registrado correctamente');
      setModal(false);
      cargar();
    } else {
      const e = await res.json().catch(()=>({}));
      toast$(e.message ?? 'Error al registrar el pago', false);
    }
  };

  const filtradas = ordenes.filter(o => {
    const estadoOk = filtroEstado ? o.estado === filtroEstado
      : ['RECIBIDA','CON_INCIDENCIAS','PAGADA'].includes(o.estado);
    if (!estadoOk) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return o.id.toLowerCase().includes(q) ||
      (o.proveedor?.nombre ?? '').toLowerCase().includes(q);
  });

  const totalPendiente = ordenes
    .filter(o => ['RECIBIDA','CON_INCIDENCIAS'].includes(o.estado))
    .reduce((s,o) => s + o.total, 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok?'bg-emerald-600':'bg-rose-600'}`}>
          {toast.ok?<CheckCircle2 className="w-5 h-5"/>:<AlertCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Compras</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Truck className="w-8 h-8 text-indigo-500"/> Pago a Proveedores
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Registra el pago de órdenes recibidas. Genera asiento Dr. Proveedores / Cr. Caja.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-right">
            <p className="text-xs text-rose-500 font-bold uppercase">Por pagar</p>
            <p className="font-black text-rose-700 text-lg">{fmt$(totalPendiente)}</p>
          </div>
          <button onClick={cargar}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4"/> Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor o folio..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"/>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400"/>
          {[
            { v:'RECIBIDA',        l:'Por pagar' },
            { v:'CON_INCIDENCIAS', l:'Con incidencias' },
            { v:'PAGADA',          l:'Pagadas' },
            { v:'',                l:'Todas' },
          ].map(({v,l}) => (
            <button key={v} onClick={()=>setFiltroEstado(v)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                filtroEstado===v
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Órdenes de Compra</p>
          <p className="text-xs text-slate-400">{filtradas.length} orden(es)</p>
        </div>

        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">Cargando órdenes...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="p-16 text-center">
            <Truck className="w-12 h-12 text-slate-200 mx-auto mb-3"/>
            <p className="font-semibold text-slate-600">Sin órdenes</p>
            <p className="text-sm text-slate-400 mt-1">No hay órdenes en el estado seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="px-5 py-3 text-left">Folio</th>
                  <th className="px-5 py-3 text-left">Proveedor</th>
                  <th className="px-5 py-3 text-center">Estado</th>
                  <th className="px-5 py-3 text-center">Fecha</th>
                  <th className="px-5 py-3 text-right">Total OC</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-indigo-600 font-bold">
                        OC-{o.id.slice(0,8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">{o.proveedor?.nombre ?? '—'}</p>
                      {o.proveedor?.rfc && <p className="text-xs text-slate-400">{o.proveedor.rfc}</p>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${ESTADO_STYLE[o.estado]??''}`}>
                        {o.estado}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center text-xs text-slate-500">
                      {fmtFecha(o.fechaCreacion)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                      {fmt$(o.total)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {['RECIBIDA','CON_INCIDENCIAS'].includes(o.estado) ? (
                        <button onClick={() => abrirModal(o)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 shadow-sm">
                          <DollarSign className="w-3.5 h-3.5"/> Registrar Pago
                        </button>
                      ) : o.estado === 'PAGADA' ? (
                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 justify-center">
                          <CheckCircle2 className="w-4 h-4"/> Pagada
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No disponible</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal pago */}
      {modal && ordenSeleccionada && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-400"/>
                Pago — OC-{ordenSeleccionada.id.slice(0,8).toUpperCase()}
              </h2>
              <button onClick={()=>setModal(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info proveedor */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
                <div className="flex justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{ordenSeleccionada.proveedor?.nombre ?? '—'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ordenSeleccionada.proveedor?.rfc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total OC</p>
                    <p className="font-black text-slate-900">{fmt$(ordenSeleccionada.total)}</p>
                  </div>
                </div>
              </div>

              {/* Monto */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Monto a pagar *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input type="number" min="0.01" step="0.01" value={montoPago}
                    onChange={e=>setMontoPago(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>

              {/* Cuenta bancaria */}
              {cuentasBancarias.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Sale de *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {cuentasBancarias.filter(c=>c.activo!==false).map(c => {
                      const Icon = c.tipo==='CAJA' ? Banknote : c.tipo==='BANCO' ? ArrowLeftRight : Building2;
                      return (
                        <button key={c.id} onClick={()=>setCuentaBancariaId(c.id)}
                          className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 text-[10px] font-bold transition-colors ${
                            cuentaBancariaId===c.id
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 hover:border-slate-300 text-slate-600'
                          }`}>
                          <Icon className="w-4 h-4"/>
                          <span className="text-center leading-tight">{c.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
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
                    placeholder="No. de cheque, transferencia..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <strong>Asiento contable que se generará:</strong><br/>
                Dr. 210-01 Proveedores ${montoPago||'0.00'}<br/>
                &nbsp;&nbsp;&nbsp;Cr. {cuentasBancarias.find(c=>c.id===cuentaBancariaId)?.nombre||'Caja'} ${montoPago||'0.00'}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={()=>setModal(false)}
                  className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
                <button onClick={registrarPago} disabled={guardando}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {guardando
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    : <Save className="w-4 h-4"/>}
                  {guardando ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
