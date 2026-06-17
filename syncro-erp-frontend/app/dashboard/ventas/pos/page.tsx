"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, X, ShoppingCart, User,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2,
  Package, Loader2, Receipt, AlertCircle, Store,
  ChevronDown, RotateCcw, Barcode,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// HELPERS — defensivos, nunca explotan
// ─────────────────────────────────────────────────────────────────

const n = (v: any): number => Number(v) || 0;
const fmt = (v: any) => n(v).toLocaleString('es-MX', { minimumFractionDigits: 2 });

// Extraer precio público de cualquier forma que lo devuelva el backend
const extraerPrecio = (prod: any): number => {
  if (n(prod?.precioVenta) > 0) return n(prod.precioVenta);
  const arr: any[] = prod?.preciosProducto ?? [];
  const defecto = arr.find((p: any) => p?.listaPrecio?.esPorDefecto ?? p?.esPorDefecto);
  if (n(defecto?.precio) > 0) return n(defecto.precio);
  if (arr.length > 0 && n(arr[0]?.precio) > 0) return n(arr[0].precio);
  return 0;
};

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

interface IItemCarrito {
  productoId: string;
  nombre: string;
  sku: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tasaIVA: number;
  stockDisponible: number;
}

interface ICliente { id: string; nombre: string; email?: string; rfc?: string; }
type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

// ─────────────────────────────────────────────────────────────────
// CÁLCULOS
// ─────────────────────────────────────────────────────────────────

const calcItem = (item: IItemCarrito) => {
  const base  = n(((n(item.cantidad) * n(item.precioUnitario)) - n(item.descuento)).toFixed(4));
  const iva   = n((base * n(item.tasaIVA)).toFixed(4));
  return { base, iva, total: n((base + iva).toFixed(4)) };
};

const calcTotales = (carrito: IItemCarrito[]) => {
  let subtotal = 0, impuestos = 0;
  carrito.forEach(item => { const { base, iva } = calcItem(item); subtotal += base; impuestos += iva; });
  return {
    subtotal:  n(subtotal.toFixed(4)),
    impuestos: n(impuestos.toFixed(4)),
    total:     n((subtotal + impuestos).toFixed(4)),
  };
};

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export default function POSPage() {
  const apiUrl  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const BASE_URL = apiUrl.replace('/api', '');

  const [busqueda,          setBusqueda]          = useState('');
  const [productos,         setProductos]          = useState<any[]>([]);
  const [cargandoProds,     setCargandoProds]      = useState(false);
  const [carrito,           setCarrito]            = useState<IItemCarrito[]>([]);
  const [cliente,           setCliente]            = useState<ICliente | null>(null);
  const [busquedaCliente,   setBusquedaCliente]    = useState('');
  const [clientes,          setClientes]           = useState<ICliente[]>([]);
  const [metodoPago,        setMetodoPago]         = useState<MetodoPago>('EFECTIVO');
  const [montoRecibido,     setMontoRecibido]      = useState('');
  const [almacenes,         setAlmacenes]          = useState<any[]>([]);
  const [almacenId,         setAlmacenId]          = useState('');
  const [procesando,        setProcesando]         = useState(false);
  const [ventaExitosa,      setVentaExitosa]       = useState<{ id: string; folio: number } | null>(null);
  const [showClienteSearch, setShowClienteSearch]  = useState(false);
  const [notas,             setNotas]              = useState('');
  const [errorMsg,          setErrorMsg]           = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const getToken  = () => typeof window !== 'undefined' ? localStorage.getItem('syncro_token') || '' : '';
  const hdrs      = () => ({ Authorization: `Bearer ${getToken()}` });

  // ── Cargar almacenes ────────────────────────────────────────
  useEffect(() => {
    fetch(`${apiUrl}/catalogo/almacenes`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : [])
      .then((alm: any[]) => {
        setAlmacenes(alm);
        if (alm.length > 0) setAlmacenId(alm[0].id);
      });
    searchRef.current?.focus();
  }, []);

  // ── Buscar productos ────────────────────────────────────────
  useEffect(() => {
    if (!busqueda.trim()) { setProductos([]); return; }
    const t = setTimeout(async () => {
      setCargandoProds(true);
      try {
        const res = await fetch(
          `${apiUrl}/catalogo/productos/buscar?q=${encodeURIComponent(busqueda)}&limite=24`,
          { headers: hdrs() }
        );
        if (res.ok) setProductos(await res.json());
      } finally { setCargandoProds(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // ── Buscar clientes ─────────────────────────────────────────
  useEffect(() => {
    if (!busquedaCliente.trim()) { setClientes([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${apiUrl}/clientes?filtro=${encodeURIComponent(busquedaCliente)}`, { headers: hdrs() });
      if (res.ok) setClientes(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  // ── Agregar al carrito ──────────────────────────────────────
  const agregarProducto = useCallback((prod: any) => {
    const precio = extraerPrecio(prod);
    const tasaIVA = n(prod?.impuesto?.porcentaje) > 0
      ? n(prod.impuesto.porcentaje) / 100
      : 0.16;

    setCarrito(prev => {
      const existe = prev.find(i => i.productoId === prod.id);
      if (existe) {
        if (existe.cantidad >= n(prod.stockActual)) return prev;
        return prev.map(i => i.productoId === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, {
        productoId:      prod.id,
        nombre:          prod.nombre         || '',
        sku:             prod.sku            || '',
        unidadMedida:    prod.unidadMedida   || 'PIEZA',
        cantidad:        1,
        precioUnitario:  precio,
        descuento:       0,
        tasaIVA,
        stockDisponible: n(prod.stockActual),
      }];
    });
    setBusqueda('');
    searchRef.current?.focus();
  }, []);

  const actualizarCantidad = (id: string, delta: number) =>
    setCarrito(prev => prev
      .map(i => i.productoId !== id ? i : { ...i, cantidad: Math.max(0, Math.min(i.cantidad + delta, i.stockDisponible)) })
      .filter(i => i.cantidad > 0)
    );

  const actualizarDescuento = (id: string, val: string) =>
    setCarrito(prev => prev.map(i => i.productoId !== id ? i : { ...i, descuento: n(val) }));

  const eliminarItem  = (id: string) => setCarrito(prev => prev.filter(i => i.productoId !== id));

  const limpiarCarrito = () => {
    setCarrito([]); setCliente(null); setMontoRecibido('');
    setNotas(''); setVentaExitosa(null);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  // ── Procesar venta ──────────────────────────────────────────
  const procesarVenta = async () => {
    if (!carrito.length) return;
    setProcesando(true);
    const { subtotal, impuestos, total } = calcTotales(carrito);
    const payload = {
      clienteId:     cliente?.id ?? null,
      almacenId:     almacenId   || null,
      metodoPago,
      montoRecibido: metodoPago === 'EFECTIVO' ? n(montoRecibido) : null,
      subtotal, descuento: 0, impuestoTotal: impuestos, total,
      notas:         notas || null,
      detalles: carrito.map(item => {
        const { base, iva } = calcItem(item);
        return {
          productoId:         item.productoId,
          cantidad:           item.cantidad,
          precioUnitario:     item.precioUnitario,
          descuento:          item.descuento,
          subtotal:           base,
          impuestoPorcentaje: item.tasaIVA * 100,
          impuestoMonto:      iva,
        };
      }),
    };
    try {
      const res = await fetch(`${apiUrl}/ventas`, {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setVentaExitosa({ id: data.id, folio: data.folio });
      } else {
        const err = await res.json();
        const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message || 'Error al procesar la venta');
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(''), 6000);
      }
    } catch { setErrorMsg('Error de conexión con el servidor'); setTimeout(() => setErrorMsg(''), 6000); }
    finally { setProcesando(false); }
  };

  const { subtotal, impuestos, total } = calcTotales(carrito);
  const cambio = metodoPago === 'EFECTIVO' && montoRecibido ? n(montoRecibido) - total : null;
  const puedeVender = carrito.length > 0 &&
    (metodoPago !== 'EFECTIVO' || !montoRecibido || n(montoRecibido) >= total);

  // ── Pantalla de venta exitosa ───────────────────────────────
  if (ventaExitosa) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">¡Venta Completada!</h2>
          <p className="text-slate-500 mb-1">Ticket <span className="font-bold text-slate-700">#{ventaExitosa.folio}</span></p>
          <p className="text-4xl font-black text-emerald-600 my-6">${fmt(total)}</p>
          {cambio !== null && cambio >= 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-emerald-700 font-medium">Cambio a entregar</p>
              <p className="text-3xl font-black text-emerald-700">${fmt(cambio)}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => window.open(`/dashboard/ventas/${ventaExitosa.id}/ticket`, '_blank')}
              className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors">
              <Receipt className="w-5 h-5" /> Imprimir Ticket
            </button>
            <button onClick={limpiarCarrito}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
              <RotateCcw className="w-5 h-5" /> Nueva Venta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── UI PRINCIPAL POS ────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Toast de error */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-3 max-w-lg text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="ml-2 text-rose-200 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* PANEL IZQUIERDO — PRODUCTOS */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Buscador */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input ref={searchRef} type="text" value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium text-slate-800"
            />
            {busqueda && (
              <button onClick={() => { setBusqueda(''); searchRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {almacenes.length > 1 && (
            <select value={almacenId} onChange={e => setAlmacenId(e.target.value)}
              className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {almacenes.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
        </div>

        {/* Grid productos */}
        <div className="flex-1 overflow-y-auto p-4">
          {!busqueda.trim() ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Barcode className="w-16 h-16 mb-4 text-slate-200" />
              <p className="text-lg font-bold text-slate-500">Busca un producto para comenzar</p>
              <p className="text-sm mt-1">Escribe el nombre, SKU o escanea el código de barras</p>
            </div>
          ) : cargandoProds ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : productos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Package className="w-12 h-12 mb-3 text-slate-200" />
              <p className="font-bold text-slate-500">Sin resultados para "{busqueda}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {productos.map((prod: any) => {
                const agotado   = n(prod.stockActual) <= 0;
                const precio    = extraerPrecio(prod);
                const img       = prod.imagenes?.find((i: any) => i.principal) || prod.imagenes?.[0];
                const enCarrito = carrito.find(i => i.productoId === prod.id);
                return (
                  <button key={prod.id} onClick={() => !agotado && agregarProducto(prod)}
                    disabled={agotado}
                    className={`relative bg-white rounded-xl border-2 p-3 text-left transition-all active:scale-95 ${
                      agotado ? 'border-slate-100 opacity-50 cursor-not-allowed'
                      : enCarrito ? 'border-blue-400 shadow-md shadow-blue-100'
                      : 'border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer'}`}>
                    {enCarrito && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 text-white text-xs font-black rounded-full flex items-center justify-center z-10">
                        {enCarrito.cantidad}
                      </span>
                    )}
                    <div className="aspect-square bg-slate-100 rounded-lg mb-2 overflow-hidden">
                      {img ? (
                        <img src={`${BASE_URL}${img.url}`} alt={prod.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{prod.sku}</p>
                    <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2 mb-1">{prod.nombre}</p>
                    <p className="text-sm font-black text-blue-600">${fmt(precio)}</p>
                    <p className={`text-[10px] font-bold mt-0.5 ${agotado ? 'text-rose-500' : 'text-slate-400'}`}>
                      {agotado ? 'Sin stock' : `${n(prod.stockActual)} ${prod.unidadMedida || ''}`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PANEL DERECHO — CARRITO */}
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-xl">

        {/* Header carrito */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <span className="font-black text-slate-800">
              Carrito {carrito.length > 0 && <span className="text-blue-600">({carrito.length})</span>}
            </span>
          </div>
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito} className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>

        {/* Items carrito */}
        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 p-6">
              <ShoppingCart className="w-16 h-16 mb-3" />
              <p className="text-sm font-bold text-slate-400 text-center">
                El carrito está vacío.<br />Busca y agrega productos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {carrito.map(item => {
                const { iva, total: itemTotal } = calcItem(item);
                return (
                  <div key={item.productoId} className="px-4 py-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{item.nombre}</p>
                        <p className="text-[10px] font-bold text-slate-400">{item.sku}</p>
                      </div>
                      <button onClick={() => eliminarItem(item.productoId)}
                        className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                        <button onClick={() => actualizarCantidad(item.productoId, -1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-10 text-center text-sm font-black text-slate-800">{item.cantidad}</span>
                        <button onClick={() => actualizarCantidad(item.productoId, 1)}
                          disabled={item.cantidad >= item.stockDisponible}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">${fmt(itemTotal)}</p>
                        <p className="text-[10px] text-slate-400">
                          ${fmt(item.precioUnitario)} c/u
                          {item.tasaIVA > 0 && ` + IVA ${item.tasaIVA * 100}%`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Desc. $</label>
                      <input type="number" min="0" step="0.01"
                        value={item.descuento || ''}
                        onChange={e => actualizarDescuento(item.productoId, e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                        placeholder="0.00" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — cliente + pago + totales + cobrar */}
        <div className="border-t border-slate-200 bg-slate-50">

          {/* Selector de cliente */}
          <div className="px-4 pt-3 pb-2">
            {cliente ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-xs font-bold text-blue-800">{cliente.nombre}</p>
                    {cliente.rfc && <p className="text-[10px] text-blue-600">{cliente.rfc}</p>}
                  </div>
                </div>
                <button onClick={() => setCliente(null)} className="text-blue-400 hover:text-blue-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <button onClick={() => setShowClienteSearch(!showClienteSearch)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-slate-400 hover:border-blue-300 hover:text-blue-600 text-sm font-medium transition-colors bg-white">
                  <Store className="w-4 h-4" />
                  <span>Público General</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                </button>
                {showClienteSearch && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20">
                    <div className="p-2 border-b border-slate-100">
                      <input type="text" value={busquedaCliente}
                        onChange={e => setBusquedaCliente(e.target.value)}
                        placeholder="Buscar cliente por nombre, RFC..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus />
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {clientes.map(c => (
                        <button key={c.id}
                          onClick={() => { setCliente(c); setShowClienteSearch(false); setBusquedaCliente(''); }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0">
                          <p className="font-bold text-slate-800">{c.nombre}</p>
                          {c.rfc && <p className="text-[10px] text-slate-400">{c.rfc}</p>}
                        </button>
                      ))}
                      {busquedaCliente && clientes.length === 0 && (
                        <p className="px-3 py-3 text-xs text-slate-400 text-center">Sin resultados</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Métodos de pago */}
          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'EFECTIVO',      icon: <Banknote className="w-4 h-4" />,       label: 'Efectivo' },
                { id: 'TARJETA',       icon: <CreditCard className="w-4 h-4" />,     label: 'Tarjeta' },
                { id: 'TRANSFERENCIA', icon: <ArrowLeftRight className="w-4 h-4" />, label: 'Transfer.' },
              ] as const).map(m => (
                <button key={m.id} onClick={() => setMetodoPago(m.id)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                    metodoPago === m.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            {metodoPago === 'EFECTIVO' && (
              <div className="mt-2 flex gap-2 items-center">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input type="number" step="0.01" min={total} value={montoRecibido}
                    onChange={e => setMontoRecibido(e.target.value)}
                    placeholder="Monto recibido"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" />
                </div>
                {cambio !== null && (
                  <div className={`px-3 py-2 rounded-xl text-sm font-black text-center min-w-[80px] ${cambio >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {cambio >= 0 ? `+$${fmt(cambio)}` : `-$${fmt(Math.abs(cambio))}`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totales */}
          <div className="px-4 pb-3 space-y-1 border-t border-slate-200 pt-3">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span className="font-semibold font-mono">${fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>IVA</span><span className="font-semibold font-mono">${fmt(impuestos)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
              <span className="text-base font-black text-slate-800">TOTAL</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">${fmt(total)}</span>
            </div>
          </div>

          {/* Botón cobrar */}
          <div className="px-4 pb-4">
            <button onClick={procesarVenta} disabled={!puedeVender || procesando}
              className="w-full py-4 bg-blue-600 text-white font-black text-lg rounded-2xl hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
              {procesando
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                : <><CheckCircle2 className="w-6 h-6" /> Cobrar ${fmt(total)}</>}
            </button>
            {metodoPago === 'EFECTIVO' && !montoRecibido && carrito.length > 0 && (
              <p className="text-center text-xs text-amber-600 font-medium mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Ingresa el monto recibido para el cambio
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
