"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, X, ShoppingCart, User,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2,
  Package, Loader2, Receipt, AlertCircle, Store,
  ChevronDown, RotateCcw, Barcode, Calendar, Clock,
  Building2, Calculator, ChevronRight,
} from 'lucide-react';
import type { MetodoPagoVenta } from '@/lib/ventas/metodos-pago';
import { METODOS_CREDITO as METODOS_CREDITO_CONTRATO } from '@/lib/ventas/metodos-pago';
import { api, ApiError, API_URL, intentar } from '@/lib/api';

const n   = (v: any): number => Number(v) || 0;
const fmt = (v: any) => n(v).toLocaleString('es-MX', { minimumFractionDigits: 2 });

/**
 * Hoy, como día de calendario local. `toISOString()` devuelve el día siguiente
 * a partir de las 18:00 en México, así que una venta de la tarde quedaba
 * fechada mañana.
 */
const diaLocal = (f = new Date()) =>
  `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`;

const fechaCorta = (iso?: string) =>
  iso ? new Date(`${String(iso).slice(0,10)}T12:00:00`).toLocaleDateString('es-MX',
    { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const extraerPrecio = (prod: any, listaPrecioId?: string): number => {
  const arr: any[] = prod?.preciosProducto ?? [];
  if (listaPrecioId) {
    const seleccionada = arr.find((p: any) => p?.listaPrecioId === listaPrecioId);
    return n(seleccionada?.precio);
  }
  if (n(prod?.precioVenta) > 0) return n(prod.precioVenta);
  const defecto = arr.find((p: any) => p?.listaPrecio?.esPorDefecto ?? p?.esPorDefecto);
  if (n(defecto?.precio) > 0) return n(defecto.precio);
  if (arr.length > 0 && n(arr[0]?.precio) > 0) return n(arr[0].precio);
  return 0;
};

interface IItemCarrito {
  productoId: string; nombre: string; sku: string; unidadMedida: string;
  cantidad: number; precioUnitario: number; descuento: number;
  tasaIVA: number; stockDisponible: number; reservaId?: string;
}
interface ICliente { id: string; nombre: string; email?: string; rfc?: string; limiteCredito?: number; diasCredito?: number; }
interface IPoliticaCredito { limite:number; utilizado:number; disponible:number; vencido:number; diasCredito:number; puedeComprarCredito:boolean; razonBloqueo?:string|null; }
interface ICuentaBancaria { id: string; nombre: string; tipo: string; esPorDefecto: boolean; }
interface IListaPrecio { id: string; nombre: string; esPorDefecto: boolean; }
interface ICuota { numeroCuota: number; fechaVencimiento: string; montoCuota: number; montoCapital: number; montoInteres: number; saldoRestante: number; }
/**
 * Producto de crédito del catálogo de la empresa. Antes esta pantalla tenía los
 * cuatro tipos escritos a mano; ahora los pide, porque cada empresa vende los
 * suyos y el plazo y la tasa los fija la fila, no el cajero.
 */
interface IProductoCredito {
  id: string; codigo: string; nombre: string; descripcion?: string|null;
  unidadPlazo: 'DIAS'|'MESES'; cadaCuantos: number;
  cuotasMinimas: number; cuotasMaximas: number;
  sinInteres: boolean; tasaInteresMensual: number; tasaEditable: boolean;
  montoMinimo: number; montoMaximo: number;
  tipoCreditoHeredado?: string|null;
}

/** Días que dura el crédito completo. Es lo que se compara con la línea. */
const plazoEnDias = (p: IProductoCredito|null, cuotas: number) =>
  !p ? 0 : p.cadaCuantos * Math.max(1, cuotas) * (p.unidadPlazo === 'MESES' ? 30 : 1);

const aPlazos = (p: IProductoCredito|null) => !!p && p.cuotasMaximas > 1;

type MetodoPago = MetodoPagoVenta;

const METODOS_CONTADO: { id: MetodoPago; icon: any; label: string; color: string }[] = [
  { id: 'EFECTIVO',      icon: Banknote,        label: 'Efectivo',      color: 'emerald' },
  { id: 'TARJETA',       icon: CreditCard,      label: 'Tarjeta',       color: 'blue' },
  { id: 'TRANSFERENCIA', icon: ArrowLeftRight,  label: 'Transferencia', color: 'purple' },
  { id: 'MSI_BANCO',     icon: Building2,       label: 'MSI Banco',     color: 'indigo' },
];
const esCredito = (m: MetodoPago) => METODOS_CREDITO_CONTRATO.has(m);

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
  const BASE_URL = API_URL.replace(/\/api$/, '');

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
  const [listasPrecio,      setListasPrecio]      = useState<IListaPrecio[]>([]);
  const [listaPrecioId,     setListaPrecioId]     = useState('');
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
  const [politicaCredito,   setPoliticaCredito]   = useState<IPoliticaCredito|null>(null);
  const [saldoFavor,        setSaldoFavor]        = useState(0);
  const [usarSaldoFavor,    setUsarSaldoFavor]    = useState(true);

  // ── Estado modal de crédito ─────────────────────────────────────
  const [productosCredito,  setProductosCredito]  = useState<IProductoCredito[]>([]);
  const [productoCreditoId, setProductoCreditoId] = useState('');
  const [modalCredito,      setModalCredito]      = useState(false);
  const [enganche,          setEnganche]          = useState('0');
  const [numeroCuotas,      setNumeroCuotas]      = useState('6');
  const [tasaInteres,       setTasaInteres]       = useState('2.5');
  const [sinInteres,        setSinInteres]        = useState(false);
  const [tablaAmort,        setTablaAmort]        = useState<ICuota[]>([]);
  const [cargandoAmort,     setCargandoAmort]     = useState(false);
  const [metodoSeccion,     setMetodoSeccion]     = useState<'contado'|'credito'>('contado');

  const searchRef = useRef<HTMLInputElement>(null);
  const ventaEnCursoRef = useRef(false);
  const idempotenciaVentaRef = useRef<string | null>(null);

  // ── Cargar datos iniciales ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      intentar(api.get<any[]>('/catalogo/almacenes'), []),
      intentar(api.get<ICuentaBancaria[]>('/credito/cuentas-bancarias'), []),
      intentar(api.get<IListaPrecio[]>('/catalogo/listas-precio'), []),
      // Sólo los vendibles: un producto sin verificar contra el registro
      // externo no debe ni aparecer en la pantalla del cajero.
      intentar(api.get<IProductoCredito[]>('/credito/productos', { query: { vendibles: '1' } }), []),
    ]).then(([alm, cb, listas, prodsCredito]) => {
      setAlmacenes(alm);
      if (alm.length>0) setAlmacenId(alm[0].id);
      setListasPrecio(listas);
      const listaDefecto = listas.find((lista) => lista.esPorDefecto) ?? listas[0];
      if (listaDefecto) setListaPrecioId(listaDefecto.id);
      setCuentasBancarias(cb);
      const def = cb.find((c:ICuentaBancaria) => c.esPorDefecto && c.tipo==='CAJA');
      if (def) setCuentaBancariaId(def.id);
      setProductosCredito(prodsCredito);
    });
    searchRef.current?.focus();
  }, []);

  // ── Auto-seleccionar cuenta según método de pago ───────────────
  useEffect(() => {
    if (!cuentasBancarias.length) return;
    const tipo = esCredito(metodoPago) && n(enganche)>0 ? 'CAJA'
      : metodoPago==='EFECTIVO' ? 'CAJA'
      : (metodoPago==='TARJETA'||metodoPago==='MSI_BANCO') ? 'TPV'
      : metodoPago==='TRANSFERENCIA' ? 'BANCO' : null;
    if (!tipo) return;
    const match = cuentasBancarias.find(c=>c.tipo===tipo && c.esPorDefecto)
                || cuentasBancarias.find(c=>c.tipo===tipo);
    if (match) setCuentaBancariaId(match.id);
  }, [metodoPago, cuentasBancarias, enganche]);

  // ── Buscar productos ────────────────────────────────────────────
  useEffect(() => {
    if (!busqueda.trim()) { setProductos([]); return; }
    const t = setTimeout(async () => {
      setCargandoProds(true);
      try {
        const resultado = await api.get<any[]>('/catalogo/productos/buscar', {
          query: { q: busqueda, limite: 24, almacenId },
        });
        setProductos(resultado);
      } finally { setCargandoProds(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, almacenId]);

  // ── Buscar clientes ─────────────────────────────────────────────
  useEffect(() => {
    if (!busquedaCliente.trim()) { setClientes([]); return; }
    const t = setTimeout(async () => {
      const resultado = await api.get<ICliente[]>('/clientes', { query: { filtro: busquedaCliente } });
      setClientes(resultado);
    }, 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  useEffect(() => {
    setPoliticaCredito(null);
    setSaldoFavor(0);
    setUsarSaldoFavor(true);
    if (!cliente) return;
    Promise.all([
      intentar<IPoliticaCredito | null>(api.get<IPoliticaCredito>(`/credito/creditos/cliente/${cliente.id}/politica`), null),
      intentar<{ saldo: number } | null>(api.get<{ saldo: number }>(`/ventas/clientes/${cliente.id}/saldo-favor`), null),
    ]).then(([politica, saldo]) => {
      setPoliticaCredito(politica);
      setSaldoFavor(n(saldo?.saldo));
    });
  }, [cliente]);

  // ── Crear cliente al vuelo desde el POS ─────────────────────────
  const crearClienteRapido = async () => {
    setErrorCliente('');
    if (!nuevoCliente.nombre.trim()) { setErrorCliente('El nombre es obligatorio'); return; }
    setGuardandoCliente(true);
    try {
      const d = await api.post<ICliente>('/clientes', {
        nombre:   nuevoCliente.nombre.trim(),
        telefono: nuevoCliente.telefono.trim() || null,
        rfc:      nuevoCliente.rfc.trim().toUpperCase() || null,
        email:    nuevoCliente.email.trim() || null,
      });
      if (d) {
        // Lo dejamos seleccionado en la venta, sin salir del POS
        setCliente(d);
        setShowNuevoCliente(false);
        setShowClienteSearch(false);
        setBusquedaCliente('');
        setNuevoCliente({ nombre: '', telefono: '', rfc: '', email: '' });
      }
    } catch (error) {
      setErrorCliente(error instanceof ApiError ? error.mensajeParaPantalla() : 'No se pudo crear el cliente');
    }
    setGuardandoCliente(false);
  };

  const productoSel = productosCredito.find(p => p.id === productoCreditoId) ?? null;

  /**
   * Elegir producto ajusta la captura a lo que el producto admite.
   *
   * Se hace aquí y no al vender para que el cajero no pueda teclear seis meses
   * de un producto de tres y enterarse hasta que el servidor lo rechace con el
   * cliente enfrente.
   */
  const elegirProducto = useCallback((p: IProductoCredito) => {
    setProductoCreditoId(p.id);
    // El método de pago de la venta sigue siendo del contrato anterior. Sale de
    // la fila, no de una deducción en pantalla, y se retira con `tipoCredito`.
    setMetodoPago((p.tipoCreditoHeredado ?? 'MENSUALIDADES') as MetodoPago);
    setNumeroCuotas(String(Math.min(Math.max(n(numeroCuotas) || p.cuotasMinimas, p.cuotasMinimas), p.cuotasMaximas)));
    setSinInteres(p.sinInteres);
    setTasaInteres(String(p.sinInteres ? 0 : p.tasaInteresMensual));
    if (p.cuotasMaximas > 1) setModalCredito(true);
  }, [numeroCuotas]);

  // ── Simular amortización ────────────────────────────────────────
  const simularAmortizacion = useCallback(async () => {
    if (!productoSel) return;
    const { total } = calcTotales(carrito);
    const saldoAplicado = usarSaldoFavor ? Math.min(saldoFavor, total) : 0;
    const capital = total - saldoAplicado - n(enganche);
    if (capital <= 0 || n(numeroCuotas)<1) return;
    setCargandoAmort(true);
    try {
      const resultado = await api.post<ICuota[]>('/credito/creditos/simular', {
        capital, numeroCuotas: n(numeroCuotas),
        tasaInteresMensual: sinInteres ? 0 : n(tasaInteres),
        sinInteres,
        // El plazo va explícito. Sin esto la pantalla mostraría una tabla
        // mensual para un crédito a 45 días y el cliente firmaría otra.
        unidadPlazo: productoSel.unidadPlazo,
        cadaCuantos: productoSel.cadaCuantos,
      });
      setTablaAmort(resultado);
    } finally { setCargandoAmort(false); }
  }, [carrito, enganche, numeroCuotas, tasaInteres, sinInteres, saldoFavor, usarSaldoFavor, productoSel]);

  // Se simula para CUALQUIER producto de crédito, no sólo los de varias cuotas:
  // un crédito de un solo pago también tiene una fecha de vencimiento que el
  // cajero debe poder leer antes de cobrar.
  useEffect(() => {
    if (productoCreditoId) simularAmortizacion();
    else setTablaAmort([]);
  }, [enganche, numeroCuotas, tasaInteres, sinInteres, modalCredito, productoCreditoId, carrito]);

  // ── Carrito ─────────────────────────────────────────────────────
  const agregarProducto = useCallback(async (prod: any) => {
    let precio = extraerPrecio(prod, listaPrecioId);
    let tasaIVA =
      prod?.impuesto?.porcentaje !== undefined
        ? n(prod.impuesto.porcentaje) / 100
        : 0;
    try {
      const oficial = await api.get<any>(`/catalogo/listas-precio/producto/${prod.id}`, {
        query: listaPrecioId ? { listaPrecioId } : undefined,
      });
      if (oficial.sinPrecio) {
        const nombreLista = listasPrecio.find(lista => lista.id === listaPrecioId)?.nombre;
        throw new Error(
          `${prod.nombre} no tiene un precio mayor a cero${nombreLista ? ` en la lista "${nombreLista}"` : ' en la lista seleccionada'}. ` +
          'Asígnalo en Catálogos → Listas de precio y vuelve a intentarlo.',
        );
      }
      precio = n(oficial.precioUnitario);
      tasaIVA = n(oficial.impuestoPorcentaje) / 100;
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo consultar el precio',
      );
      setTimeout(() => setErrorMsg(''), 6000);
      return;
    }
    setCarrito(prev => {
      const stockDisponible = prod.tipo === 'SERVICIO'
        ? Number.MAX_SAFE_INTEGER
        : n(prod.stockActual);
      const existe = prev.find(i=>i.productoId===prod.id);
      if (existe) {
        if (existe.cantidad>=stockDisponible) return prev;
        return prev.map(i=>i.productoId===prod.id?{...i,cantidad:i.cantidad+1}:i);
      }
      return [...prev,{ productoId:prod.id, nombre:prod.nombre||'', sku:prod.sku||'',
        unidadMedida:prod.unidadMedida||'PIEZA', cantidad:1, precioUnitario:precio,
        descuento:0, tasaIVA, stockDisponible }];
    });
    setBusqueda(''); searchRef.current?.focus();
  }, [listaPrecioId, listasPrecio]);

  const actualizarCantidad = (id:string, delta:number) =>
    setCarrito(prev=>prev.map(i=>i.productoId!==id?i:{...i,cantidad:Math.max(0,Math.min(i.cantidad+delta,i.stockDisponible))}).filter(i=>i.cantidad>0));
  const actualizarDescuento = (id:string, val:string) =>
    setCarrito(prev=>prev.map(i=>i.productoId!==id?i:{...i,descuento:n(val)}));
  const eliminarItem = (id:string) => setCarrito(prev=>prev.filter(i=>i.productoId!==id));

  const limpiarCarrito = () => {
    setCarrito([]); setCliente(null); setMontoRecibido('');
    setNotas(''); setVentaExitosa(null); setMetodoPago('EFECTIVO');
    setEnganche('0'); setTablaAmort([]);
    idempotenciaVentaRef.current = null;
    setTimeout(()=>searchRef.current?.focus(),100);
  };

  // ── Procesar venta ──────────────────────────────────────────────
  const procesarVenta = async () => {
    if (ventaEnCursoRef.current || !carrito.length) return;
    if (!almacenId) {
      setErrorMsg('Configura y selecciona un almacén activo antes de vender.');
      return;
    }
    if (!listaPrecioId) {
      setErrorMsg('Configura una lista de precios antes de vender.');
      return;
    }
    if (['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'MSI_BANCO', 'OTRO'].includes(metodoPago) && !cuentaBancariaId) {
      setErrorMsg('Selecciona la cuenta financiera o TPV que recibirá el cobro.');
      return;
    }
    if (esCredito(metodoPago) && !productoCreditoId) {
      setErrorMsg('Selecciona el producto de crédito con el que se vende.'); setTimeout(()=>setErrorMsg(''),5000); return;
    }
    if (esCredito(metodoPago) && !cliente) {
      setErrorMsg('Para ventas a crédito debes seleccionar un cliente.'); setTimeout(()=>setErrorMsg(''),5000); return;
    }
    if (esCredito(metodoPago) && politicaCredito && !politicaCredito.puedeComprarCredito) {
      setErrorMsg(politicaCredito.razonBloqueo || 'El cliente no tiene crédito disponible.'); return;
    }
    ventaEnCursoRef.current = true;
    setProcesando(true);
    const { subtotal, impuestos, total } = calcTotales(carrito);
    const payload = {
      clienteId: cliente?.id??null, almacenId: almacenId||null,
      listaPrecioId: listaPrecioId||undefined,
      metodoPago, cuentaBancariaId: cuentaBancariaId||null,
      montoRecibido: metodoPago==='EFECTIVO' ? n(montoRecibido) : null,
      saldoFavorSolicitado: usarSaldoFavor ? Math.min(saldoFavor, total) : 0,
      subtotal, descuento:0, impuestoTotal:impuestos, total, notas:notas||null,
      credito: esCredito(metodoPago) ? {
        // El producto manda: el servidor toma de él el plazo, la tasa y los
        // límites, y rechaza lo que no quepa. Lo que va aquí es la solicitud,
        // no la definición.
        productoCreditoId,
        enganche: aPlazos(productoSel) ? n(enganche) : 0,
        numeroCuotas: aPlazos(productoSel) ? n(numeroCuotas) : 1,
        tasaInteresMensual: sinInteres ? 0 : n(tasaInteres),
        sinInteres,
        // Día de calendario local, no instante: un ISO completo se corría un
        // día al parsearse y el crédito quedaba fechado el día anterior.
        fechaInicio: diaLocal(),
        metodoPagoEnganche:
          aPlazos(productoSel) && n(enganche)>0 ? 'EFECTIVO' : undefined,
        cuentaBancariaEngancheId:
          aPlazos(productoSel) && n(enganche)>0 && cuentaBancariaId
            ? cuentaBancariaId
            : undefined,
      } : undefined,
      detalles: carrito.map(item => {
        const {base,iva} = calcItem(item);
        return { productoId:item.productoId, cantidad:item.cantidad,
          precioUnitario:item.precioUnitario, descuento:item.descuento,
          subtotal:base, impuestoPorcentaje:item.tasaIVA*100, impuestoMonto:iva,
          reservaId:item.reservaId };
      }),
    };
    try {
      idempotenciaVentaRef.current ||= crypto.randomUUID();
      const data = await api.post<{ id: string; folio: number }>('/ventas', payload, {
        headers: { 'Idempotency-Key': idempotenciaVentaRef.current },
      });
      idempotenciaVentaRef.current = null;
      setVentaExitosa({ id:data.id, folio:data.folio });
    } catch (error) {
      // Errores de validación son definitivos y permiten una nueva solicitud.
      // En red/5xx la clave se conserva para consultar la misma venta al reintentar.
      if (error instanceof ApiError && error.status > 0 && error.status < 500) {
        idempotenciaVentaRef.current = null;
      }
      setErrorMsg(error instanceof ApiError ? error.mensajeParaPantalla() : 'No se pudo procesar la venta.');
      setTimeout(()=>setErrorMsg(''),6000);
    }
    finally {
      ventaEnCursoRef.current = false;
      setProcesando(false);
    }
  };

  const { subtotal, impuestos, total } = calcTotales(carrito);
  const saldoAplicado = cliente&&usarSaldoFavor ? Math.min(saldoFavor,total) : 0;
  const totalEfectivo = Math.max(0,total-saldoAplicado);
  const cambio = metodoPago==='EFECTIVO'&&montoRecibido ? n(montoRecibido)-totalEfectivo : null;
  // El plazo sale del producto, no de adivinar por el nombre del método.
  const plazoMetodo = plazoEnDias(productoSel, aPlazos(productoSel) ? n(numeroCuotas) : 1);

  /*
   * Dos topes distintos y los dos reales: el del producto —lo que la empresa
   * decidió vender— y el de la línea del cliente —lo que ese cliente aguanta—.
   * Manda el menor.
   */
  const diasPorCuota = productoSel
    ? productoSel.cadaCuantos * (productoSel.unidadPlazo === 'MESES' ? 30 : 1)
    : 30;
  const cuotasMaxPermitidas = productoSel
    ? Math.max(
        productoSel.cuotasMinimas,
        Math.min(
          productoSel.cuotasMaximas,
          Math.floor(n(politicaCredito?.diasCredito) / diasPorCuota) || productoSel.cuotasMinimas,
        ),
      )
    : 1;
  const atajosCuotas = productoSel
    ? [...new Set(
        [
          productoSel.cuotasMinimas,
          Math.round((productoSel.cuotasMinimas + cuotasMaxPermitidas) / 3),
          Math.round(((productoSel.cuotasMinimas + cuotasMaxPermitidas) * 2) / 3),
          cuotasMaxPermitidas,
        ].filter(c => c >= productoSel.cuotasMinimas && c <= cuotasMaxPermitidas),
      )].sort((a, b) => a - b)
    : [];
  const fueraDeRango = !!productoSel && aPlazos(productoSel) && (
    n(numeroCuotas) < productoSel.cuotasMinimas || n(numeroCuotas) > productoSel.cuotasMaximas
  );
  const capitalCredito = total-saldoAplicado-n(enganche);
  const creditoPermitido = !esCredito(metodoPago) || (
    !!productoSel && !fueraDeRango && !!cliente && !!politicaCredito?.puedeComprarCredito
    && plazoMetodo<=n(politicaCredito?.diasCredito)
    && capitalCredito<=n(politicaCredito?.disponible)
    && capitalCredito>=n(productoSel.montoMinimo)
    && (n(productoSel.montoMaximo)===0 || capitalCredito<=n(productoSel.montoMaximo))
  );
  const requiereCuenta = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'MSI_BANCO', 'OTRO'].includes(metodoPago)
    || (esCredito(metodoPago) && n(enganche)>0);
  const contextoCompleto = Boolean(almacenId && listaPrecioId && (!requiereCuenta || cuentaBancariaId));
  const puedeVender = carrito.length>0 && contextoCompleto && creditoPermitido && (metodoPago!=='EFECTIVO'||(!!montoRecibido&&n(montoRecibido)>=totalEfectivo));

  const cambiarContextoVenta = (
    tipo: 'almacén' | 'lista de precios',
    valor: string,
  ) => {
    if (carrito.length > 0) {
      setErrorMsg(`Vacía el carrito antes de cambiar ${tipo}; el stock y los precios ya fueron confirmados.`);
      setTimeout(() => setErrorMsg(''), 6000);
      return;
    }
    if (tipo === 'almacén') setAlmacenId(valor);
    else setListaPrecioId(valor);
  };

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
            <select value={almacenId} onChange={e=>cambiarContextoVenta('almacén',e.target.value)}
              className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {almacenes.map((a:any)=><option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          {listasPrecio.length>0&&(
            <select value={listaPrecioId} onChange={e=>cambiarContextoVenta('lista de precios',e.target.value)}
              title="Lista de precios aplicable"
              className="max-w-48 px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {listasPrecio.map(lista=><option key={lista.id} value={lista.id}>{lista.nombre}{lista.esPorDefecto?' · Predeterminada':''}</option>)}
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
                const agotado=prod.tipo!=='SERVICIO'&&n(prod.stockActual)<=0, precio=extraerPrecio(prod, listaPrecioId);
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
                    <p className={`text-[10px] font-bold mt-0.5 ${agotado?'text-rose-500':'text-slate-400'}`}>{prod.tipo==='SERVICIO'?'Servicio · sin inventario':agotado?'Sin stock':`${n(prod.stockActual)} ${prod.unidadMedida||''}`}</p>
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

          {cliente && (saldoFavor>0 || politicaCredito) && (
            <div className="mx-4 mb-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs space-y-2">
              {saldoFavor>0 && (
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="font-semibold text-cyan-900">Usar saldo a favor (${fmt(Math.min(saldoFavor,total))})</span>
                  <input type="checkbox" checked={usarSaldoFavor} onChange={e=>setUsarSaldoFavor(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600"/>
                </label>
              )}
              {politicaCredito && (
                <div className={politicaCredito.puedeComprarCredito?'text-indigo-800':'text-rose-700'}>
                  <p className="font-bold">Crédito disponible: ${fmt(politicaCredito.disponible)} · plazo máximo {politicaCredito.diasCredito} días</p>
                  {!politicaCredito.puedeComprarCredito && <p>{politicaCredito.razonBloqueo}</p>}
                </div>
              )}
            </div>
          )}

          {/* Métodos de pago */}
          <div className="px-4 pb-3">
            {/* Tabs contado / crédito */}
            <div className="flex mb-2 border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={()=>{setMetodoSeccion('contado');setMetodoPago('EFECTIVO');setProductoCreditoId('')}}
                className={`flex-1 py-1.5 text-xs font-bold transition-colors ${metodoPago==='EFECTIVO'||metodoPago==='TARJETA'||metodoPago==='TRANSFERENCIA'||metodoPago==='MSI_BANCO'?'bg-blue-600 text-white':'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Contado
              </button>
              <button onClick={()=>{
                  setMetodoSeccion('credito');
                  if (productosCredito[0]) elegirProducto(productosCredito[0]);
                }}
                disabled={productosCredito.length===0}
                title={productosCredito.length===0 ? 'No hay productos de crédito vendibles. Configúralos en Crédito → Productos.' : undefined}
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
              <div className="grid grid-cols-3 gap-1.5">
                {productosCredito.map(p=>{
                  /*
                   * Se deshabilita por la línea del cliente, comparando el plazo
                   * MÍNIMO del producto: uno de 3 a 24 meses sigue ofreciéndose a
                   * quien tiene línea para tres, y el rango se acota adentro.
                   */
                  const plazoMin = plazoEnDias(p, p.cuotasMinimas);
                  const fuera = plazoMin > n(politicaCredito?.diasCredito);
                  return (
                    <button key={p.id}
                      disabled={!cliente || !politicaCredito?.puedeComprarCredito || fuera}
                      onClick={()=>elegirProducto(p)}
                      title={fuera ? `El cliente tiene ${n(politicaCredito?.diasCredito)} días de línea y este producto necesita ${plazoMin}.` : (p.descripcion ?? undefined)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 text-[10px] font-bold transition-all disabled:opacity-40 ${productoCreditoId===p.id?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                      {aPlazos(p) ? <Calculator className="w-4 h-4"/> : <Calendar className="w-4 h-4"/>}
                      <span className="text-center leading-tight">{p.nombre}</span>
                      <span className="font-normal text-[9px] text-slate-400">
                        {aPlazos(p)
                          ? `${p.cuotasMinimas}-${p.cuotasMaximas} × ${p.cadaCuantos} ${p.unidadPlazo==='MESES'?'mes':'días'}`
                          : `${p.cadaCuantos} ${p.unidadPlazo==='MESES'?'mes':'días'}`}
                        {!p.sinInteres && ` · ${p.tasaInteresMensual}%`}
                      </span>
                    </button>
                  );
                })}
                {productosCredito.length===0&&(
                  <p className="col-span-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                    No hay productos de crédito vendibles. Configúralos en Crédito → Productos.
                  </p>
                )}
              </div>
            )}

            {/* Monto recibido (efectivo) */}
            {metodoPago==='EFECTIVO'&&(
              <div className="mt-2 flex gap-2 items-center">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input type="number" step="0.01" min={totalEfectivo} value={montoRecibido} onChange={e=>setMontoRecibido(e.target.value)}
                    placeholder="Monto recibido" className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"/>
                </div>
                {cambio!==null&&<div className={`px-3 py-2 rounded-xl text-sm font-black text-center min-w-[80px] ${cambio>=0?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}`}>{cambio>=0?`+$${fmt(cambio)}`:`-$${fmt(Math.abs(cambio))}`}</div>}
              </div>
            )}

            {/* Resumen crédito a plazos */}
            {aPlazos(productoSel)&&tablaAmort.length>0&&(
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

            {/* Resumen crédito de un solo pago */}
            {!!productoSel&&!aPlazos(productoSel)&&(
              <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
                <div className="flex items-center gap-2 font-bold">
                  <Clock className="w-3.5 h-3.5"/>
                  Pago total en {productoSel.cadaCuantos} {productoSel.unidadPlazo==='MESES'?'mes(es)':'días'}: <span className="text-base">${fmt(total-saldoAplicado)}</span>
                </div>
                {/*
                  * La fecha se toma de la tabla simulada, que es la que aplica la
                  * política de día hábil de la empresa. Sumar días aquí mostraría
                  * un sábado que el crédito no va a tener.
                  */}
                {!!tablaAmort[0]&&(
                  <div className="mt-0.5 font-semibold">Vence el {fechaCorta(tablaAmort[0].fechaVencimiento)}</div>
                )}
                {!cliente&&<p className="text-amber-600 font-semibold mt-1">⚠ Selecciona un cliente para continuar</p>}
              </div>
            )}

            {/* Cuenta bancaria activa */}
            {cuentasBancarias.length>0&&(!esCredito(metodoPago)||(esCredito(metodoPago)&&n(enganche)>0))&&(
              <div className="mt-2">
                <select value={cuentaBancariaId} onChange={e=>setCuentaBancariaId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— Cuenta bancaria —</option>
                  {cuentasBancarias.filter(c=>{
                    if(esCredito(metodoPago)||metodoPago==='EFECTIVO') return c.tipo==='CAJA';
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
            {saldoAplicado>0&&<div className="flex justify-between text-sm text-cyan-700"><span>Saldo a favor aplicado</span><span className="font-semibold font-mono">-${fmt(saldoAplicado)}</span></div>}
            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
              <span className="text-base font-black text-slate-800">TOTAL</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">${fmt(total)}</span>
            </div>
            {saldoAplicado>0&&<div className="flex justify-between font-bold text-sm text-slate-700"><span>RESTO A PAGAR</span><span>${fmt(totalEfectivo)}</span></div>}
          </div>

          {/* Botón cobrar */}
          <div className="px-4 pb-4">
            <button onClick={procesarVenta} disabled={!puedeVender||procesando}
              className={`w-full py-4 text-white font-black text-lg rounded-2xl active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${esCredito(metodoPago)?'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200':'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
              {procesando?<><Loader2 className="w-5 h-5 animate-spin"/> Procesando...</>:<><CheckCircle2 className="w-6 h-6"/> {esCredito(metodoPago)?`Registrar Crédito $${fmt(totalEfectivo)}`:`Cobrar $${fmt(totalEfectivo)}`}</>}
            </button>
            {metodoPago==='EFECTIVO'&&!montoRecibido&&carrito.length>0&&(
              <p className="text-center text-xs text-amber-600 font-medium mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> Ingresa el monto recibido para el cambio
              </p>
            )}
            {requiereCuenta&&!cuentaBancariaId&&carrito.length>0&&(
              <p className="text-center text-xs text-amber-600 font-medium mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> Configura o selecciona la cuenta de cobro correspondiente
              </p>
            )}
            {!listaPrecioId&&(
              <p className="text-center text-xs text-rose-600 font-medium mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> No existe una lista de precios configurada
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
              <h2 className="font-bold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-400"/>
                {productoSel ? productoSel.nombre : 'Configurar Plan de Pagos'}
                {!!productoSel&&<span className="font-normal text-xs text-slate-400">{productoSel.codigo}</span>}
              </h2>
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
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Número de cuotas
                    {!!productoSel&&<span className="font-normal normal-case text-slate-400"> · de {productoSel.cuotasMinimas} a {productoSel.cuotasMaximas}</span>}
                  </label>
                  {/*
                    * Los atajos son los del producto, no [3,6,9,12] fijos: un
                    * producto de 3 a 24 y otro de 6 a 6 no se capturan igual.
                    */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {atajosCuotas.map(c=>(
                      <button key={c} onClick={()=>setNumeroCuotas(String(c))}
                        className={`py-2 rounded-lg border text-xs font-bold transition-colors ${numeroCuotas===String(c)?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 hover:border-slate-300'}`}>
                        {c}{productoSel?.unidadPlazo==='MESES'?'m':'×'}
                      </button>
                    ))}
                  </div>
                  <input type="number"
                    min={productoSel?.cuotasMinimas ?? 1}
                    max={cuotasMaxPermitidas}
                    value={numeroCuotas}
                    onChange={e=>setNumeroCuotas(e.target.value)}
                    className="w-full px-3 py-2 mt-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="O escribe un número"/>
                  {!!productoSel&&cuotasMaxPermitidas<productoSel.cuotasMaximas&&(
                    <p className="mt-1 text-[11px] text-amber-700">
                      La línea del cliente ({n(politicaCredito?.diasCredito)} días) no alcanza para las {productoSel.cuotasMaximas} cuotas del producto.
                    </p>
                  )}
                  {fueraDeRango&&(
                    <p className="mt-1 text-[11px] text-rose-600 font-semibold">
                      {productoSel?.nombre} admite de {productoSel?.cuotasMinimas} a {productoSel?.cuotasMaximas} cuotas.
                    </p>
                  )}
                </div>
                {/*
                  * El precio ya no se captura: lo trae el producto. Antes esto era
                  * una casilla y un campo libres en la pantalla del cajero, es
                  * decir una tasa que nadie autorizó a un clic de distancia.
                  */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-sm font-bold text-slate-800">
                    {sinInteres ? 'Sin intereses' : `${productoSel?.tasaInteresMensual ?? tasaInteres}% mensual`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {sinInteres
                      ? 'La empresa absorbe el costo financiero. Lo define el producto.'
                      : 'Tasa del producto, sobre saldos insolutos.'}
                  </p>
                </div>
                {!!productoSel?.tasaEditable&&!sinInteres&&(
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                      Tasa de interés mensual (%)
                      <span className="font-normal normal-case text-slate-400"> · editable en este producto</span>
                    </label>
                    <input type="number" min="0" step="0.1" value={tasaInteres} onChange={e=>setTasaInteres(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                )}
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs space-y-1 text-indigo-800">
                  <div className="flex justify-between"><span>Capital financiado:</span><span className="font-bold">${fmt(total-saldoAplicado-n(enganche))}</span></div>
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
