"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, X, ShoppingCart, User,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2,
  Package, Loader2, Receipt, AlertCircle, Store,
  ChevronDown, RotateCcw, Barcode, Calendar, Clock,
  Building2, Calculator, ChevronRight,
} from 'lucide-react';

const n   = (v: any): number => Number(v) || 0;
const fmt = (v: any) => n(v).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const extraerPrecio = (prod: any): number => {
  if (n(prod?.precioVenta) > 0) return n(prod.precioVenta);
  const arr: any[] = prod?.preciosProducto ?? [];
  const defecto = arr.find((p: any) => p?.listaPrecio?.esPorDefecto ?? p?.esPorDefecto);
  if (n(defecto?.precio) > 0) return n(defecto.precio);
  if (arr.length > 0 && n(arr[0]?.precio) > 0) return n(arr[0].precio);
  return 0;
};

interface IItemCarrito {
  productoId: string; nombre: string; sku: string; unidadMedida: string;
  cantidad: number; precioUnitario: number; descuento: number;
  tasaIVA: number; stockDisponible: number;
}
interface ICliente { id: string; nombre: string; email?: string; rfc?: string; }
interface ICuentaBancaria { id: string; nombre: string; tipo: string; esPorDefecto: boolean; }
interface ICuota { numeroCuota: number; fechaVencimiento: string; montoCuota: number; montoCapital: number; montoInteres: number; saldoRestante: number; }

type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'MSI_BANCO' | 'CREDITO_30D' | 'CREDITO_60D' | 'CREDITO_90D' | 'MENSUALIDADES';

const METODOS_CONTADO: { id: MetodoPago; icon: any; label: string; color: string }[] = [
  { id: 'EFECTIVO',      icon: Banknote,        label: 'Efectivo',      color: 'emerald' },
  { id: 'TARJETA',       icon: CreditCard,      label: 'Tarjeta',       color: 'blue' },
  { id: 'TRANSFERENCIA', icon: ArrowLeftRight,  label: 'Transferencia', color: 'purple' },
  { id: 'MSI_BANCO',     icon: Building2,       label: 'MSI Banco',     color: 'indigo' },
];
const METODOS_CREDITO: { id: MetodoPago; icon: any; label: string; dias?: number }[] = [
  { id: 'CREDITO_30D',  icon: Calendar, label: 'Crédito 30 días',  dias: 30 },
  { id: 'CREDITO_60D',  icon: Calendar, label: 'Crédito 60 días',  dias: 60 },
  { id: 'CREDITO_90D',  icon: Calendar, label: 'Crédito 90 días',  dias: 90 },
  { id: 'MENSUALIDADES',icon: Calculator,label: 'A plazos',         dias: undefined },
];

const esCredito = (m: MetodoPago) => ['CREDITO_30D','CREDITO_60D','CREDITO_90D','MENSUALIDADES'].includes(m);

const calcItem = (item: IItemCarrito) => {
  const base = n(((n(item.cantidad)*n(item.precioUnitario))-n(item.descuento)).toFixed(4));
  const iva  = n((base*n(item.tasaIVA)).toFixed(4));
  return { base, iva, total: n((base+iva).toFixed(4)) };
};
const calcTotales = (carrito: IItemCarrito[]) => {
  let subtotal=0, impuestos=0;
  carrito.forEach(item => { const {base,iva}=calcItem(item); subtotal+=base; impuestos+=iva; });
  return { subtotal:n(subtotal.toFixed(4)), impuestos:n(impuestos.toFixed(4)), total:n((subtotal+impuestos).toFixed(4)) };
};

export default function POSPage() {
  const apiUrl   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const BASE_URL = apiUrl.replace('/api','');

  const [busqueda,          setBusqueda]         = useState('');
  const [productos,         setProductos]         = useState<any[]>([]);
  const [cargandoProds,     setCargandoProds]     = useState(false);
  const [carrito,           setCarrito]           = useState<IItemCarrito[]>([]);
  const [cliente,           setCliente]           = useState<ICliente|null>(null);
  const [busquedaCliente,   setBusquedaCliente]   = useState('');
  const [clientes,          setClientes]          = useState<ICliente[]>([]);
  const [metodoPago,        setMetodoPago]        = useState<MetodoPago>('EFECTIVO');
  const [montoRecibido,     setMontoRecibido]     = useState('');
  const [almacenes,         setAlmacenes]         = useState<any[]>([]);
  const [almacenId,         setAlmacenId]         = useState('');
  const [cuentasBancarias,  setCuentasBancarias]  = useState<ICuentaBancaria[]>([]);
  const [cuentaBancariaId,  setCuentaBancariaId]  = useState('');
  const [procesando,        setProcesando]        = useState(false);
  const [ventaExitosa,      setVentaExitosa]      = useState<{id:string;folio:number}|null>(null);
  const [showClienteSearch, setShowClienteSearch] = useState(false);
  const [showNuevoCliente,  setShowNuevoCliente]  = useState(false);
  const [nuevoCliente,      setNuevoCliente]      = useState({ nombre: '', telefono: '', rfc: '', email: '' });
  const [guardandoCliente,  setGuardandoCliente]  = useState(false);
  const [errorCliente,      setErrorCliente]      = useState('');
  const [notas,             setNotas]             = useState('');
  const [errorMsg,          setErrorMsg]          = useState('');

  // ── Estado modal de crédito ─────────────────────────────────────
  const [modalCredito,      setModalCredito]      = useState(false);
  const [enganche,          setEnganche]          = useState('0');
  const [numeroCuotas,      setNumeroCuotas]      = useState('6');
  const [tasaInteres,       setTasaInteres]       = useState('2.5');
  const [sinInteres,        setSinInteres]        = useState(false);
  const [tablaAmort,        setTablaAmort]        = useState<ICuota[]>([]);
  const [cargandoAmort,     setCargandoAmort]     = useState(false);
  const [metodoSeccion,     setMetodoSeccion]     = useState<'contado'|'credito'>('contado');

  const searchRef = useRef<HTMLInputElement>(null);
  const getToken  = () => typeof window!=='undefined' ? localStorage.getItem('syncro_token')||'' : '';
  const hdrs      = () => ({ Authorization:`Bearer ${getToken()}` });

  // ── Cargar datos iniciales ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/catalogo/almacenes`, { headers: hdrs() }).then(r=>r.ok?r.json():[]),
      fetch(`${apiUrl}/credito/cuentas-bancarias`, { headers: hdrs() }).then(r=>r.ok?r.json():[]),
    ]).then(([alm, cb]) => {
      setAlmacenes(alm);
      if (alm.length>0) setAlmacenId(alm[0].id);
      setCuentasBancarias(cb);
      const def = cb.find((c:ICuentaBancaria) => c.esPorDefecto && c.tipo==='CAJA');
      if (def) setCuentaBancariaId(def.id);
    });
    searchRef.current?.focus();
  }, []);

  // ── Auto-seleccionar cuenta según método de pago ───────────────
  useEffect(() => {
    if (!cuentasBancarias.length) return;
    const tipo = metodoPago==='EFECTIVO' ? 'CAJA'
      : (metodoPago==='TARJETA'||metodoPago==='MSI_BANCO') ? 'TPV'
      : metodoPago==='TRANSFERENCIA' ? 'BANCO' : null;
    if (!tipo) return;
    const match = cuentasBancarias.find(c=>c.tipo===tipo && c.esPorDefecto)
                || cuentasBancarias.find(c=>c.tipo===tipo);
    if (match) setCuentaBancariaId(match.id);
  }, [metodoPago, cuentasBancarias]);

  // ── Buscar productos ────────────────────────────────────────────
  useEffect(() => {
    if (!busqueda.trim()) { setProductos([]); return; }
    const t = setTimeout(async () => {
      setCargandoProds(true);
      try {
        const res = await fetch(`${apiUrl}/catalogo/productos/buscar?q=${encodeURIComponent(busqueda)}&limite=24`,{ headers:hdrs() });
        if (res.ok) setProductos(await res.json());
      } finally { setCargandoProds(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // ── Buscar clientes ─────────────────────────────────────────────
  useEffect(() => {
    if (!busquedaCliente.trim()) { setClientes([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${apiUrl}/clientes?filtro=${encodeURIComponent(busquedaCliente)}`,{headers:hdrs()});
      if (res.ok) setClientes(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  // ── Crear cliente al vuelo desde el POS ─────────────────────────
  const crearClienteRapido = async () => {
    setErrorCliente('');
    if (!nuevoCliente.nombre.trim()) { setErrorCliente('El nombre es obligatorio'); return; }
    setGuardandoCliente(true);
    try {
      const res = await fetch(`${apiUrl}/clientes`, {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:   nuevoCliente.nombre.trim(),
          telefono: nuevoCliente.telefono.trim() || null,
          rfc:      nuevoCliente.rfc.trim().toUpperCase() || null,
          email:    nuevoCliente.email.trim() || null,
        }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d) {
        // Lo dejamos seleccionado en la venta, sin salir del POS
        setCliente(d);
        setShowNuevoCliente(false);
        setShowClienteSearch(false);
        setBusquedaCliente('');
        setNuevoCliente({ nombre: '', telefono: '', rfc: '', email: '' });
      } else {
        const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
        setErrorCliente(m || 'No se pudo crear el cliente');
      }
    } catch {
      setErrorCliente('Error de conexión con el servidor');
    }
    setGuardandoCliente(false);
  };

  // ── Simular amortización ────────────────────────────────────────
  const simularAmortizacion = useCallback(async () => {
    const { total } = calcTotales(carrito);
    const capital = total - n(enganche);
    if (capital <= 0 || n(numeroCuotas)<1) return;
    setCargandoAmort(true);
    try {
      const res = await fetch(`${apiUrl}/credito/creditos/simular`, {
        method:'POST', headers:{...hdrs(),'Content-Type':'application/json'},
        body: JSON.stringify({
          capital, numeroCuotas: n(numeroCuotas),
          tasaInteresMensual: sinInteres ? 0 : n(tasaInteres),
          sinInteres,
        }),
      });
      if (res.ok) setTablaAmort(await res.json());
    } finally { setCargandoAmort(false); }
  }, [carrito, enganche, numeroCuotas, tasaInteres, sinInteres]);

  useEffect(() => {
    if (modalCredito && metodoPago==='MENSUALIDADES') simularAmortizacion();
  }, [enganche, numeroCuotas, tasaInteres, sinInteres, modalCredito]);

  // ── Carrito ─────────────────────────────────────────────────────
  const agregarProducto = useCallback((prod: any) => {
    const precio = extraerPrecio(prod);
    const tasaIVA = n(prod?.impuesto?.porcentaje)>0 ? n(prod.impuesto.porcentaje)/100 : 0.16;
    setCarrito(prev => {
      const existe = prev.find(i=>i.productoId===prod.id);
      if (existe) {
        if (existe.cantidad>=n(prod.stockActual)) return prev;
        return prev.map(i=>i.productoId===prod.id?{...i,cantidad:i.cantidad+1}:i);
      }
      return [...prev,{ productoId:prod.id, nombre:prod.nombre||'', sku:prod.sku||'',
        unidadMedida:prod.unidadMedida||'PIEZA', cantidad:1, precioUnitario:precio,
        descuento:0, tasaIVA, stockDisponible:n(prod.stockActual) }];
    });
    setBusqueda(''); searchRef.current?.focus();
  }, []);

  const actualizarCantidad = (id:string, delta:number) =>
    setCarrito(prev=>prev.map(i=>i.productoId!==id?i:{...i,cantidad:Math.max(0,Math.min(i.cantidad+delta,i.stockDisponible))}).filter(i=>i.cantidad>0));
  const actualizarDescuento = (id:string, val:string) =>
    setCarrito(prev=>prev.map(i=>i.productoId!==id?i:{...i,descuento:n(val)}));
  const eliminarItem = (id:string) => setCarrito(prev=>prev.filter(i=>i.productoId!==id));

  const limpiarCarrito = () => {
    setCarrito([]); setCliente(null); setMontoRecibido('');
    setNotas(''); setVentaExitosa(null); setMetodoPago('EFECTIVO');
    setEnganche('0'); setTablaAmort([]);
    setTimeout(()=>searchRef.current?.focus(),100);
  };

  // ── Procesar venta ──────────────────────────────────────────────
  const procesarVenta = async () => {
    if (!carrito.length) return;
    if (esCredito(metodoPago) && !cliente) {
      setErrorMsg('Para ventas a crédito debes seleccionar un cliente.'); setTimeout(()=>setErrorMsg(''),5000); return;
    }
    setProcesando(true);
    const { subtotal, impuestos, total } = calcTotales(carrito);
    const payload = {
      clienteId: cliente?.id??null, almacenId: almacenId||null,
      metodoPago, cuentaBancariaId: cuentaBancariaId||null,
      montoRecibido: metodoPago==='EFECTIVO' ? n(montoRecibido) : null,
      subtotal, descuento:0, impuestoTotal:impuestos, total, notas:notas||null,
      detalles: carrito.map(item => {
        const {base,iva} = calcItem(item);
        return { productoId:item.productoId, cantidad:item.cantidad,
          precioUnitario:item.precioUnitario, descuento:item.descuento,
          subtotal:base, impuestoPorcentaje:item.tasaIVA*100, impuestoMonto:iva };
      }),
    };
    try {
      const res = await fetch(`${apiUrl}/ventas`,{
        method:'POST', headers:{...hdrs(),'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      if (!res.ok) {
        const err=await res.json(); const msg=Array.isArray(err.message)?err.message.join(', '):(err.message||'Error');
        setErrorMsg(msg); setTimeout(()=>setErrorMsg(''),6000); setProcesando(false); return;
      }
      const data = await res.json();

      // Si es crédito → crear el crédito vinculado a la venta
      if (esCredito(metodoPago) && cliente) {
        const diasMap:Record<string,number> = { CREDITO_30D:30, CREDITO_60D:60, CREDITO_90D:90 };
        const dias = diasMap[metodoPago];
        const fechaVenc = new Date(); fechaVenc.setDate(fechaVenc.getDate()+(dias??0));

        await fetch(`${apiUrl}/credito/creditos`,{
          method:'POST', headers:{...hdrs(),'Content-Type':'application/json'},
          body:JSON.stringify({
            ventaId:            data.id,
            clienteId:          cliente.id,
            tipoCredito:        metodoPago,
            montoVenta:         total,
            enganche:           metodoPago==='MENSUALIDADES' ? n(enganche) : 0,
            numeroCuotas:       metodoPago==='MENSUALIDADES' ? n(numeroCuotas) : 1,
            tasaInteresMensual: (metodoPago==='MENSUALIDADES' && !sinInteres) ? n(tasaInteres) : 0,
            sinInteres:         metodoPago!=='MENSUALIDADES' || sinInteres,
            fechaInicio:        new Date().toISOString(),
          }),
        }).catch(e=>console.error('Error creando crédito:',e));
      }

      setVentaExitosa({ id:data.id, folio:data.folio });
    } catch { setErrorMsg('Error de conexión.'); setTimeout(()=>setErrorMsg(''),6000); }
    finally { setProcesando(false); }
  };

  const { subtotal, impuestos, total } = calcTotales(carrito);
  const cambio = metodoPago==='EFECTIVO'&&montoRecibido ? n(montoRecibido)-total : null;
  const puedeVender = carrito.length>0 && (metodoPago!=='EFECTIVO'||!montoRecibido||n(montoRecibido)>=total);

  // ── Pantalla éxito ──────────────────────────────────────────────
  if (ventaExitosa) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600"/>
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">¡Venta Completada!</h2>
        <p className="text-slate-500 mb-1">Ticket <span className="font-bold text-slate-700">#{ventaExitosa.folio}</span></p>
        {esCredito(metodoPago) && (
          <p className="text-sm text-indigo-600 font-medium mt-1">Crédito generado en módulo de Cobranza</p>
        )}
        <p className="text-4xl font-black text-emerald-600 my-6">${fmt(total)}</p>
        {cambio!==null&&cambio>=0&&(
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-700 font-medium">Cambio a entregar</p>
            <p className="text-3xl font-black text-emerald-700">${fmt(cambio)}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={()=>window.open(`/dashboard/ventas/${ventaExitosa.id}/ticket`,'_blank')}
            className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50">
            <Receipt className="w-5 h-5"/> Ticket
          </button>
          <button onClick={limpiarCarrito}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
            <RotateCcw className="w-5 h-5"/> Nueva Venta
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {errorMsg&&(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-3 max-w-lg text-sm">
          <AlertCircle className="w-5 h-5 shrink-0"/> {errorMsg}
          <button onClick={()=>setErrorMsg('')}><X className="w-4 h-4"/></button>
        </div>
      )}

      {/* ── PANEL IZQUIERDO — PRODUCTOS ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/>
            <input ref={searchRef} type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium text-slate-800"/>
            {busqueda&&<button onClick={()=>{setBusqueda('');searchRef.current?.focus()}} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4"/></button>}
          </div>
          {almacenes.length>1&&(
            <select value={almacenId} onChange={e=>setAlmacenId(e.target.value)}
              className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {almacenes.map((a:any)=><option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!busqueda.trim() ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Barcode className="w-16 h-16 mb-4 text-slate-200"/>
              <p className="text-lg font-bold text-slate-500">Busca un producto para comenzar</p>
              <p className="text-sm mt-1">Escribe el nombre, SKU o escanea el código de barras</p>
            </div>
          ) : cargandoProds ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500"/></div>
          ) : productos.length===0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Package className="w-12 h-12 mb-3 text-slate-200"/>
              <p className="font-bold text-slate-500">Sin resultados para "{busqueda}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {productos.map((prod:any)=>{
                const agotado=n(prod.stockActual)<=0, precio=extraerPrecio(prod);
                const img=prod.imagenes?.find((i:any)=>i.principal)||prod.imagenes?.[0];
                const enCarrito=carrito.find(i=>i.productoId===prod.id);
                return (
                  <button key={prod.id} onClick={()=>!agotado&&agregarProducto(prod)} disabled={agotado}
                    className={`relative bg-white rounded-xl border-2 p-3 text-left transition-all active:scale-95 ${agotado?'border-slate-100 opacity-50 cursor-not-allowed':enCarrito?'border-blue-400 shadow-md shadow-blue-100':'border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer'}`}>
                    {enCarrito&&<span className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 text-white text-xs font-black rounded-full flex items-center justify-center z-10">{enCarrito.cantidad}</span>}
                    <div className="aspect-square bg-slate-100 rounded-lg mb-2 overflow-hidden">
                      {img?<img src={`${BASE_URL}${img.url}`} alt={prod.nombre} className="w-full h-full object-cover"/>:<div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-slate-300"/></div>}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{prod.sku}</p>
                    <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2 mb-1">{prod.nombre}</p>
                    <p className="text-sm font-black text-blue-600">${fmt(precio)}</p>
                    <p className={`text-[10px] font-bold mt-0.5 ${agotado?'text-rose-500':'text-slate-400'}`}>{agotado?'Sin stock':`${n(prod.stockActual)} ${prod.unidadMedida||''}`}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── PANEL DERECHO — CARRITO ── */}
      <div className="w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-xl">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600"/>
            <span className="font-black text-slate-800">Carrito {carrito.length>0&&<span className="text-blue-600">({carrito.length})</span>}</span>
          </div>
          {carrito.length>0&&<button onClick={limpiarCarrito} className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1"><X className="w-3.5 h-3.5"/> Limpiar</button>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {carrito.length===0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 p-6">
              <ShoppingCart className="w-16 h-16 mb-3"/>
              <p className="text-sm font-bold text-slate-400 text-center">El carrito está vacío.<br/>Busca y agrega productos.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {carrito.map(item=>{
                const {iva,total:itemTotal}=calcItem(item);
                return (
                  <div key={item.productoId} className="px-4 py-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{item.nombre}</p>
                        <p className="text-[10px] font-bold text-slate-400">{item.sku}</p>
                      </div>
                      <button onClick={()=>eliminarItem(item.productoId)} className="p-1 text-slate-300 hover:text-rose-500 rounded"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                        <button onClick={()=>actualizarCantidad(item.productoId,-1)} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100"><Minus className="w-3.5 h-3.5"/></button>
                        <span className="w-10 text-center text-sm font-black text-slate-800">{item.cantidad}</span>
                        <button onClick={()=>actualizarCantidad(item.productoId,1)} disabled={item.cantidad>=item.stockDisponible} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Plus className="w-3.5 h-3.5"/></button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">${fmt(itemTotal)}</p>
                        <p className="text-[10px] text-slate-400">${fmt(item.precioUnitario)} c/u {item.tasaIVA>0&&`+IVA`}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Desc. $</label>
                      <input type="number" min="0" step="0.01" value={item.descuento||''} onChange={e=>actualizarDescuento(item.productoId,e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700" placeholder="0.00"/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50">
          {/* Cliente */}
          <div className="px-4 pt-3 pb-2">
            {cliente ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600"/>
                  <div>
                    <p className="text-xs font-bold text-blue-800">{cliente.nombre}</p>
                    {cliente.rfc&&<p className="text-[10px] text-blue-600">{cliente.rfc}</p>}
                  </div>
                </div>
                <button onClick={()=>setCliente(null)} className="text-blue-400 hover:text-blue-700"><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <div className="relative">
                <button onClick={()=>setShowClienteSearch(!showClienteSearch)}
                  className={`w-full flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium transition-colors bg-white ${esCredito(metodoPago)?'border-amber-400 text-amber-700 animate-pulse':'border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'}`}>
                  <Store className="w-4 h-4"/>
                  <span>{esCredito(metodoPago)?'⚠ Selecciona un cliente (requerido)':'Público General'}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto"/>
                </button>
                {showClienteSearch&&(
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20">
                    <div className="p-2 border-b border-slate-100">
                      <input type="text" value={busquedaCliente} onChange={e=>setBusquedaCliente(e.target.value)}
                        placeholder="Buscar cliente..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus/>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {clientes.map(c=>(
                        <button key={c.id} onClick={()=>{setCliente(c);setShowClienteSearch(false);setBusquedaCliente('');}}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0">
                          <p className="font-bold text-slate-800">{c.nombre}</p>
                          {c.rfc&&<p className="text-[10px] text-slate-400">{c.rfc}</p>}
                        </button>
                      ))}
                      {busquedaCliente&&clientes.length===0&&<p className="px-3 py-3 text-xs text-slate-400 text-center">Sin resultados</p>}
                    </div>
                    {/* Crear cliente al vuelo */}
                    <button
                      onClick={() => {
                        setNuevoCliente({ nombre: busquedaCliente, telefono: '', rfc: '', email: '' });
                        setErrorCliente('');
                        setShowNuevoCliente(true);
                        setShowClienteSearch(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 border-t border-slate-100">
                      <Plus className="w-4 h-4" /> Nuevo cliente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Métodos de pago */}
          <div className="px-4 pb-3">
            {/* Tabs contado / crédito */}
            <div className="flex mb-2 border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={()=>{setMetodoSeccion('contado');setMetodoPago('EFECTIVO')}}
                className={`flex-1 py-1.5 text-xs font-bold transition-colors ${metodoPago==='EFECTIVO'||metodoPago==='TARJETA'||metodoPago==='TRANSFERENCIA'||metodoPago==='MSI_BANCO'?'bg-blue-600 text-white':'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Contado
              </button>
              <button onClick={()=>{setMetodoSeccion('credito');setMetodoPago('CREDITO_30D')}}
                className={`flex-1 py-1.5 text-xs font-bold transition-colors ${esCredito(metodoPago)?'bg-indigo-600 text-white':'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Crédito
              </button>
            </div>

            {!esCredito(metodoPago) ? (
              <div className="grid grid-cols-4 gap-1.5">
                {METODOS_CONTADO.map(m=>(
                  <button key={m.id} onClick={()=>setMetodoPago(m.id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 text-[10px] font-bold transition-all ${metodoPago===m.id?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <m.icon className="w-4 h-4"/> {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {METODOS_CREDITO.map(m=>(
                  <button key={m.id} onClick={()=>{setMetodoPago(m.id);if(m.id==='MENSUALIDADES')setModalCredito(true)}}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 text-[10px] font-bold transition-all ${metodoPago===m.id?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <m.icon className="w-4 h-4"/>
                    <span className="text-center leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Monto recibido (efectivo) */}
            {metodoPago==='EFECTIVO'&&(
              <div className="mt-2 flex gap-2 items-center">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input type="number" step="0.01" min={total} value={montoRecibido} onChange={e=>setMontoRecibido(e.target.value)}
                    placeholder="Monto recibido" className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"/>
                </div>
                {cambio!==null&&<div className={`px-3 py-2 rounded-xl text-sm font-black text-center min-w-[80px] ${cambio>=0?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}`}>{cambio>=0?`+$${fmt(cambio)}`:`-$${fmt(Math.abs(cambio))}`}</div>}
              </div>
            )}

            {/* Resumen crédito mensualidades */}
            {metodoPago==='MENSUALIDADES'&&tablaAmort.length>0&&(
              <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs">
                <div className="flex justify-between font-bold text-indigo-800 mb-1">
                  <span>{numeroCuotas} cuotas {sinInteres?'sin interés':`al ${tasaInteres}% mensual`}</span>
                  <button onClick={()=>setModalCredito(true)} className="text-indigo-600 hover:underline flex items-center gap-0.5">Ver tabla <ChevronRight className="w-3 h-3"/></button>
                </div>
                <div className="flex justify-between text-indigo-700">
                  <span>Enganche: ${fmt(n(enganche))}</span>
                  <span>Cuota: ${fmt(tablaAmort[0]?.montoCuota)}</span>
                </div>
              </div>
            )}

            {/* Resumen crédito simple */}
            {(metodoPago==='CREDITO_30D'||metodoPago==='CREDITO_60D'||metodoPago==='CREDITO_90D')&&(
              <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
                <div className="flex items-center gap-2 font-bold">
                  <Clock className="w-3.5 h-3.5"/>
                  Pago total en {metodoPago==='CREDITO_30D'?30:metodoPago==='CREDITO_60D'?60:90} días: <span className="text-base">${fmt(total)}</span>
                </div>
                {!cliente&&<p className="text-amber-600 font-semibold mt-1">⚠ Selecciona un cliente para continuar</p>}
              </div>
            )}

            {/* Cuenta bancaria activa */}
            {cuentasBancarias.length>0&&!esCredito(metodoPago)&&(
              <div className="mt-2">
                <select value={cuentaBancariaId} onChange={e=>setCuentaBancariaId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— Cuenta bancaria —</option>
                  {cuentasBancarias.filter(c=>{
                    if(metodoPago==='EFECTIVO') return c.tipo==='CAJA';
                    if(metodoPago==='TARJETA'||metodoPago==='MSI_BANCO') return c.tipo==='TPV';
                    if(metodoPago==='TRANSFERENCIA') return c.tipo==='BANCO';
                    return true;
                  }).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Totales */}
          <div className="px-4 pb-3 space-y-1 border-t border-slate-200 pt-3">
            <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span className="font-semibold font-mono">${fmt(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-500"><span>IVA</span><span className="font-semibold font-mono">${fmt(impuestos)}</span></div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
              <span className="text-base font-black text-slate-800">TOTAL</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">${fmt(total)}</span>
            </div>
          </div>

          {/* Botón cobrar */}
          <div className="px-4 pb-4">
            <button onClick={procesarVenta} disabled={!puedeVender||procesando}
              className={`w-full py-4 text-white font-black text-lg rounded-2xl active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${esCredito(metodoPago)?'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200':'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
              {procesando?<><Loader2 className="w-5 h-5 animate-spin"/> Procesando...</>:<><CheckCircle2 className="w-6 h-6"/> {esCredito(metodoPago)?`Registrar Crédito $${fmt(total)}`:`Cobrar $${fmt(total)}`}</>}
            </button>
            {metodoPago==='EFECTIVO'&&!montoRecibido&&carrito.length>0&&(
              <p className="text-center text-xs text-amber-600 font-medium mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> Ingresa el monto recibido para el cambio
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL CONFIGURAR CRÉDITO A PLAZOS ── */}
      {modalCredito&&(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold flex items-center gap-2"><Calculator className="w-5 h-5 text-indigo-400"/> Configurar Plan de Pagos</h2>
              <button onClick={()=>setModalCredito(false)} className="p-1.5 text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-6 overflow-y-auto">
              {/* Configuración */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Total de la venta</label>
                  <p className="text-2xl font-black text-slate-900">${fmt(total)}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Enganche ($)</label>
                  <input type="number" min="0" max={total} value={enganche} onChange={e=>setEnganche(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Número de cuotas</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[3,6,9,12].map(c=>(
                      <button key={c} onClick={()=>setNumeroCuotas(String(c))}
                        className={`py-2 rounded-lg border text-xs font-bold transition-colors ${numeroCuotas===String(c)?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 hover:border-slate-300'}`}>
                        {c}m
                      </button>
                    ))}
                  </div>
                  <input type="number" min="1" max="60" value={numeroCuotas} onChange={e=>setNumeroCuotas(e.target.value)}
                    className="w-full px-3 py-2 mt-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="O escribe un número"/>
                </div>
                <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-indigo-50">
                  <input type="checkbox" checked={sinInteres} onChange={e=>setSinInteres(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded"/>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Sin interés (MSI empresa)</p>
                    <p className="text-xs text-slate-500">La empresa absorbe el costo financiero</p>
                  </div>
                </label>
                {!sinInteres&&(
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Tasa de interés mensual (%)</label>
                    <input type="number" min="0" step="0.1" value={tasaInteres} onChange={e=>setTasaInteres(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                )}
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs space-y-1 text-indigo-800">
                  <div className="flex justify-between"><span>Capital financiado:</span><span className="font-bold">${fmt(total-n(enganche))}</span></div>
                  {tablaAmort.length>0&&<>
                    <div className="flex justify-between"><span>Cuota mensual:</span><span className="font-bold">${fmt(tablaAmort[0]?.montoCuota)}</span></div>
                    <div className="flex justify-between"><span>Total a pagar:</span><span className="font-bold">${fmt(tablaAmort.reduce((s,c)=>s+c.montoCuota,0)+n(enganche))}</span></div>
                    {!sinInteres&&<div className="flex justify-between"><span>Total intereses:</span><span className="font-bold text-rose-600">${fmt(tablaAmort.reduce((s,c)=>s+c.montoInteres,0))}</span></div>}
                  </>}
                </div>
              </div>
              {/* Tabla amortización */}
              <div>
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">Tabla de amortización</p>
                {cargandoAmort ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-500"/></div>
                ) : tablaAmort.length>0 ? (
                  <div className="overflow-auto max-h-80 rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-500 font-bold">#</th>
                          <th className="px-3 py-2 text-right text-slate-500 font-bold">Capital</th>
                          {!sinInteres&&<th className="px-3 py-2 text-right text-slate-500 font-bold">Interés</th>}
                          <th className="px-3 py-2 text-right text-slate-500 font-bold">Cuota</th>
                          <th className="px-3 py-2 text-right text-slate-500 font-bold">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tablaAmort.map(c=>(
                          <tr key={c.numeroCuota} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-bold text-slate-600">{c.numeroCuota}</td>
                            <td className="px-3 py-2 text-right font-mono">${fmt(c.montoCapital)}</td>
                            {!sinInteres&&<td className="px-3 py-2 text-right font-mono text-rose-600">${fmt(c.montoInteres)}</td>}
                            <td className="px-3 py-2 text-right font-mono font-bold">${fmt(c.montoCuota)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-400">${fmt(c.saldoRestante)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">Configura los parámetros para ver la tabla</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100 bg-slate-50 shrink-0">
              <button onClick={()=>setModalCredito(false)} className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-200 rounded-xl">Cancelar</button>
              <button onClick={()=>setModalCredito(false)}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4"/> Confirmar plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MINI-MODAL: NUEVO CLIENTE AL VUELO ══════════════════════ */}
      {showNuevoCliente && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[90] p-4"
          onClick={() => !guardandoCliente && setShowNuevoCliente(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" /> Nuevo cliente
              </h3>
              <button onClick={() => setShowNuevoCliente(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {errorCliente && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{errorCliente}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input autoFocus value={nuevoCliente.nombre}
                  onChange={e => setNuevoCliente(c => ({ ...c, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearClienteRapido(); }}
                  placeholder="Nombre del cliente"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={nuevoCliente.telefono}
                    onChange={e => setNuevoCliente(c => ({ ...c, telefono: e.target.value }))}
                    placeholder="Opcional" maxLength={20}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">RFC</label>
                  <input value={nuevoCliente.rfc}
                    onChange={e => setNuevoCliente(c => ({ ...c, rfc: e.target.value.toUpperCase() }))}
                    placeholder="Opcional" maxLength={13}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo</label>
                <input value={nuevoCliente.email} type="email"
                  onChange={e => setNuevoCliente(c => ({ ...c, email: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowNuevoCliente(false)} disabled={guardandoCliente}
                className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={crearClienteRapido} disabled={guardandoCliente}
                className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {guardandoCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {guardandoCliente ? 'Creando…' : 'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
