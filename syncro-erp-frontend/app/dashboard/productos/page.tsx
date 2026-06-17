"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search, Plus, Edit2, History, Power, PackagePlus, PackageMinus,
  X, Image as ImageIcon, Loader2, Filter, LayoutGrid, List, PackageSearch
} from 'lucide-react';
import {
  IProducto, IFormData, ICatalogoBasico, IImpuesto, IImagen, IListaPrecio
} from './types/producto.types';
import ModalInventarioRapido from './components/ModalInventarioRapido';
import ModalFichaProducto from './components/ModalFichaProducto';
import { PuedeCrear, PuedeEditar, ProtectedElement } from "@/app/components/ProtectedElement";

// ─── Formulario vacío con TODOS los campos tipados ───────────────
const FORM_VACIO: IFormData = {
  // Identificación
  nombre: '', nombreCorto: '', sku: '', codigoBarras: '',
  codigoBarras2: '', codigoProveedor: '', descripcion: '', observacionesInternas: '',
  // SAT
  claveSAT: '', claveUnidadSAT: '',
  // Tipo y unidad
  tipo: 'FISICO', unidadMedida: 'PIEZA', unidadMedidaSecundaria: '', esGranel: false,
  // Costos
  precioCompra: 0, monedaCosto: 'MXN', tipoCosto: 'PROMEDIO', costoEstandar: null,
  // Almacenamiento
  condicionAlmacen: 'AMBIENTE', temperaturaMinC: null, temperaturaMaxC: null,
  // Logística
  pesoKg: 0, volumenCm3: 0, diasVidaUtil: null,
  // Control inventario
  stockActual: 0, stockMinimo: 5, stockMaximo: null, puntoReorden: null,
  cantidadMinimaPedido: null, requiereLote: false, requiereCaducidad: false,
  permiteVentaSinStock: false, requiereNumeroSerie: false,
  // Comercio exterior
  fraccionArancelaria: '', paisOrigen: '',
  // Relaciones
  categoriaId: '', marcaId: '', impuestoId: '', almacenId: '',
  // Colecciones
  imagenes: [], precios: [], equivalencias: [], atributos: [],
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<IProducto[]>([]);
  const [categorias, setCategorias] = useState<ICatalogoBasico[]>([]);
  const [almacenes, setAlmacenes] = useState<ICatalogoBasico[]>([]);
  const [marcas, setMarcas] = useState<ICatalogoBasico[]>([]);
  const [impuestos, setImpuestos] = useState<IImpuesto[]>([]);
  const [listasPrecio, setListasPrecio] = useState<IListaPrecio[]>([]);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [mostrarCatalogoCompleto, setMostrarCatalogoCompleto] = useState(false);
  const [filtros, setFiltros] = useState({ categoriaId: '', marcaId: '', soloConStock: false });

  const [cargando, setCargando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const LIMITE = 20;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [productoEditandoId, setProductoEditandoId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<{ open: boolean; imagenes: IImagen[]; currentIndex: number }>({ open: false, imagenes: [], currentIndex: 0 });
  const [modalInventario, setModalInventario] = useState<{ isOpen: boolean; tipo: 'compra' | 'salida'; producto: IProducto | null }>({ isOpen: false, tipo: 'compra', producto: null });
  const [formData, setFormData] = useState<IFormData>(FORM_VACIO);
  const [atributosIniciales, setAtributosIniciales] = useState<any[]>([]);
  const [sectorInicial, setSectorInicial] = useState('');

  const inputFileRef = useRef<HTMLInputElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const BASE_URL = apiUrl.replace('/api', '');

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Cargar catálogos ──────────────────────────────────────────
  useEffect(() => {
    const fetchCatalogos = async () => {
      const token = localStorage.getItem('syncro_token');
      const h = { Authorization: `Bearer ${token}` };
      try {
        const [cat, alm, mar, imp, listas] = await Promise.all([
          fetch(`${apiUrl}/catalogo/categorias`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${apiUrl}/catalogo/almacenes`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${apiUrl}/catalogo/marcas`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${apiUrl}/catalogo/impuestos`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${apiUrl}/catalogo/listas-precio`, { headers: h }).then(r => r.ok ? r.json() : []),
        ]);
        setCategorias(cat); setAlmacenes(alm); setMarcas(mar);
        setImpuestos(imp); setListasPrecio(listas);
      } catch (e) { console.error('Error cargando catálogos:', e); }
    };
    fetchCatalogos();
  }, [apiUrl]);

  const busquedaActiva = busquedaDebounced.trim() !== '' || filtros.categoriaId !== '' || filtros.marcaId !== '' || filtros.soloConStock || mostrarCatalogoCompleto;

  // ── Fetch productos ───────────────────────────────────────────
  const fetchProductos = async (
    pag = 1, append = false,
    cf = filtros, cb = busquedaDebounced, cc = mostrarCatalogoCompleto
  ) => {
    const active = cb.trim() !== '' || cf.categoriaId !== '' || cf.marcaId !== '' || cf.soloConStock || cc;
    if (!active) { setProductos([]); return; }
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const params = new URLSearchParams({ pagina: pag.toString(), limite: LIMITE.toString() });
      if (cf.categoriaId) params.append('categoriaId', cf.categoriaId);
      if (cf.marcaId) params.append('marcaId', cf.marcaId);
      if (cf.soloConStock) params.append('soloConStock', 'true');

      let url = `${apiUrl}/catalogo/productos?${params}`;
      if (cb.trim()) { params.append('q', cb.trim()); url = `${apiUrl}/catalogo/productos/buscar?${params}`; }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const nuevos: IProducto[] = data.productos || data;
        setProductos(append ? prev => [...prev, ...nuevos] : nuevos);
        setHayMas(data.totalPaginas ? pag < data.totalPaginas : nuevos.length === LIMITE);
      }
    } catch { mostrarToast('Error al cargar productos', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    setPagina(1);
    fetchProductos(1, false, filtros, busquedaDebounced, mostrarCatalogoCompleto);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced, filtros, mostrarCatalogoCompleto]);

  const obtenerPrecioPublico = (prod: IProducto): number => {
    if (prod.preciosProducto && prod.preciosProducto.length > 0) {
      const def = prod.preciosProducto.find(p => p.listaPrecio?.esPorDefecto);
      return Number(def ? def.precio : prod.preciosProducto[0].precio);
    }
    return Number(prod.precioVenta ?? 0);
  };

  // ── Abrir modal CREAR ─────────────────────────────────────────
  const abrirModalCrear = () => {
    setProductoEditandoId(null);
    setAtributosIniciales([]);
    setSectorInicial('');
    setFormData({
      ...FORM_VACIO,
      precios: listasPrecio.map(l => ({ listaPrecioId: l.id, precio: 0 })),
    });
    setIsModalOpen(true);
  };

  // ── Abrir modal EDITAR ────────────────────────────────────────
  // Carga TODOS los campos del producto incluyendo los nuevos
  const abrirModalEditar = (prod: IProducto) => {
    setProductoEditandoId(prod.id);

    // Extraer sector y atributos ANTES de setFormData para pasarlos al modal como props
    // Esto evita el problema de timing donde el useEffect corre antes de que formData se actualice
    const atrs = prod.atributos ?? [];
    const sector = atrs.length > 0 ? (atrs[0].sector || '') : '';
    setAtributosIniciales(atrs);
    setSectorInicial(sector);

    setFormData({
      // ── Identificación
      nombre:               prod.nombre             ?? '',
      nombreCorto:          prod.nombreCorto         ?? '',
      sku:                  prod.sku                ?? '',
      codigoBarras:         prod.codigoBarras        ?? '',
      codigoBarras2:        prod.codigoBarras2       ?? '',
      codigoProveedor:      prod.codigoProveedor     ?? '',
      descripcion:          prod.descripcion         ?? '',
      observacionesInternas:prod.observacionesInternas ?? '',
      // ── SAT
      claveSAT:             prod.claveSAT            ?? '',
      claveUnidadSAT:       prod.claveUnidadSAT      ?? '',
      // ── Tipo y unidad
      tipo:                 prod.tipo                ?? 'FISICO',
      unidadMedida:         prod.unidadMedida        ?? 'PIEZA',
      unidadMedidaSecundaria: prod.unidadMedidaSecundaria ?? '',
      esGranel:             prod.esGranel            ?? false,
      // ── Costos
      precioCompra:         Number(prod.precioCompra ?? 0),
      monedaCosto:          prod.monedaCosto         ?? 'MXN',
      tipoCosto:            prod.tipoCosto           ?? 'PROMEDIO',
      costoEstandar:        prod.costoEstandar       ?? null,
      // ── Almacenamiento
      condicionAlmacen:     prod.condicionAlmacen    ?? 'AMBIENTE',
      temperaturaMinC:      prod.temperaturaMinC     ?? null,
      temperaturaMaxC:      prod.temperaturaMaxC     ?? null,
      // ── Logística
      pesoKg:               Number(prod.pesoKg       ?? 0),
      volumenCm3:           Number(prod.volumenCm3   ?? 0),
      diasVidaUtil:         prod.diasVidaUtil        ?? null,
      // ── Control inventario
      stockActual:          Number(prod.stockActual  ?? 0),
      stockMinimo:          Number(prod.stockMinimo  ?? 5),
      stockMaximo:          prod.stockMaximo         ?? null,
      puntoReorden:         prod.puntoReorden        ?? null,
      cantidadMinimaPedido: prod.cantidadMinimaPedido ?? null,
      requiereLote:         prod.requiereLote        ?? false,
      requiereCaducidad:    prod.requiereCaducidad   ?? false,
      permiteVentaSinStock: prod.permiteVentaSinStock ?? false,
      requiereNumeroSerie:  prod.requiereNumeroSerie  ?? false,
      // ── Comercio exterior
      fraccionArancelaria:  prod.fraccionArancelaria ?? '',
      paisOrigen:           prod.paisOrigen          ?? '',
      // ── Relaciones
      categoriaId:          prod.categoriaId         ?? '',
      marcaId:              prod.marcaId             ?? '',
      impuestoId:           prod.impuestoId          ?? '',
      almacenId:            '',   // nunca se prelllena al editar
      // ── Colecciones
      imagenes:   prod.imagenes    ?? [],
      precios:    listasPrecio.map(lista => ({
        listaPrecioId: lista.id,
        precio: Number(prod.preciosProducto?.find(p => p.listaPrecioId === lista.id)?.precio ?? 0),
      })),
      equivalencias: (prod.equivalencias ?? []).map(eq => ({
        id:               eq.id,
        nombreEmpaque:    eq.nombreEmpaque,
        factorConversion: Number(eq.factorConversion),
        codigoBarras:     eq.codigoBarras ?? '',
        padreIdx:         (eq as any).padreIdx ?? null,
      })),
      atributos: prod.atributos ?? [],
    });
    setIsModalOpen(true);
  };

  // ── Guardar producto ──────────────────────────────────────────
  const handleGuardarProducto = async (e: React.FormEvent, atributosFinales: any[] = []) => {
    e.preventDefault();
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = productoEditandoId
      ? `${apiUrl}/catalogo/productos/${productoEditandoId}`
      : `${apiUrl}/catalogo/productos`;

    const fd = formData;

    const payload = {
      // Identificación
      nombre:                fd.nombre,
      nombreCorto:           fd.nombreCorto           || null,
      sku:                   fd.sku,
      codigoBarras:          fd.codigoBarras          || null,
      codigoBarras2:         fd.codigoBarras2         || null,
      codigoProveedor:       fd.codigoProveedor       || null,
      descripcion:           fd.descripcion           || null,
      observacionesInternas: fd.observacionesInternas || null,
      // SAT
      claveSAT:              fd.claveSAT              || null,
      claveUnidadSAT:        fd.claveUnidadSAT        || null,
      // Tipo y unidad
      tipo:                  fd.tipo                  || 'FISICO',
      unidadMedida:          fd.unidadMedida          || 'PIEZA',
      unidadMedidaSecundaria:fd.unidadMedidaSecundaria || null,
      esGranel:              Boolean(fd.esGranel),
      // Costos
      precioCompra:          Number(fd.precioCompra   || 0),
      monedaCosto:           fd.monedaCosto           || 'MXN',
      tipoCosto:             fd.tipoCosto             || 'PROMEDIO',
      costoEstandar:         fd.costoEstandar != null ? Number(fd.costoEstandar) : null,
      // Almacenamiento
      condicionAlmacen:      fd.condicionAlmacen      || 'AMBIENTE',
      temperaturaMinC:       fd.temperaturaMinC != null ? Number(fd.temperaturaMinC) : null,
      temperaturaMaxC:       fd.temperaturaMaxC != null ? Number(fd.temperaturaMaxC) : null,
      // Logística
      pesoKg:                fd.pesoKg                ? Number(fd.pesoKg)                : null,
      volumenCm3:            fd.volumenCm3            ? Number(fd.volumenCm3)            : null,
      diasVidaUtil:          fd.diasVidaUtil           ? Number(fd.diasVidaUtil)          : null,
      // Control inventario
      stockMinimo:           Number(fd.stockMinimo    ?? 5),
      stockMaximo:           fd.stockMaximo           ? Number(fd.stockMaximo)           : null,
      puntoReorden:          fd.puntoReorden          ? Number(fd.puntoReorden)          : null,
      cantidadMinimaPedido:  fd.cantidadMinimaPedido  ? Number(fd.cantidadMinimaPedido)  : null,
      requiereLote:          Boolean(fd.requiereLote),
      requiereCaducidad:     Boolean(fd.requiereCaducidad),
      permiteVentaSinStock:  Boolean(fd.permiteVentaSinStock),
      requiereNumeroSerie:   Boolean(fd.requiereNumeroSerie),
      // Stock inicial — solo aplica al crear
      stockActual:           Number(fd.stockActual    || 0),
      almacenId:             fd.almacenId             || null,
      // Comercio exterior
      fraccionArancelaria:   fd.fraccionArancelaria   || null,
      paisOrigen:            fd.paisOrigen            || null,
      // Relaciones
      categoriaId:           fd.categoriaId           || null,
      marcaId:               fd.marcaId               || null,
      impuestoId:            fd.impuestoId            || null,
      // Colecciones
      precios: fd.precios.map(p => ({
        listaPrecioId: p.listaPrecioId,
        precio: Number(p.precio || 0),
      })),
      imagenes: fd.imagenes.map(img => ({
        url: img.url,
        principal: Boolean(img.principal),
      })),
      equivalencias: fd.equivalencias.map(eq => ({
        nombreEmpaque:    eq.nombreEmpaque,
        factorConversion: Number(eq.factorConversion || 1),
        codigoBarras:     eq.codigoBarras            || null,
        padreIdx:         (eq as any).padreIdx       ?? null,
      })),
      // Atributos vienen del modal directamente — ya filtrados
      atributos: atributosFinales,
    };

    try {
      const res = await fetch(url, {
        method: productoEditandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchProductos(1, false, filtros, busquedaDebounced, mostrarCatalogoCompleto);
        mostrarToast(productoEditandoId ? 'Producto actualizado' : 'Producto creado', 'exito');
      } else {
        const err = await res.json();
        const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
        mostrarToast(`Error: ${msg}`, 'error');
      }
    } catch {
      mostrarToast('Error de conexión con el servidor', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (id: string) => {
    if (!window.confirm('¿Deseas cambiar el estado de este producto?')) return;
    const token = localStorage.getItem('syncro_token');
    const res = await fetch(`${apiUrl}/catalogo/productos/${id}/estado`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchProductos(1, false, filtros, busquedaDebounced, mostrarCatalogoCompleto);
  };

  const handleTransaccionInventario = async (data: any) => {
    if (!data.almacenId || data.cantidad <= 0) return mostrarToast('Verifica almacén y cantidad.', 'info');
    const token = localStorage.getItem('syncro_token');
    const res = await fetch(`${apiUrl}/catalogo/inventario/productos/${data.id}/${modalInventario.tipo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        cantidad: data.cantidad, motivo: data.motivo, almacenId: data.almacenId,
        numeroLote: data.numeroLote, fechaCaducidad: data.fechaCaducidad,
        equivalenciaId: data.equivalenciaId,
      }),
    });
    if (res.ok) {
      setModalInventario({ isOpen: false, tipo: 'compra', producto: null });
      fetchProductos(1, false, filtros, busquedaDebounced, mostrarCatalogoCompleto);
      mostrarToast('Operación registrada', 'exito');
    } else {
      const err = await res.json();
      mostrarToast(err.message || 'Error en la operación', 'error');
    }
  };

  const handleSeleccionarImagenes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    const token = localStorage.getItem('syncro_token');
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const form = new FormData(); form.append('imagen', files[i]);
      const res = await fetch(`${apiUrl}/catalogo/productos/imagen`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) urls.push((await res.json()).url);
    }
    if (urls.length > 0) {
      setFormData(prev => ({
        ...prev,
        imagenes: [
          ...prev.imagenes,
          ...urls.map((url, i) => ({ url, principal: prev.imagenes.length === 0 && i === 0 })),
        ],
      }));
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden">
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] px-6 py-4 rounded-xl shadow-2xl font-bold text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.mensaje}
        </div>
      )}

      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-full shadow-sm z-10 shrink-0">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h2 className="font-black text-slate-800">Filtros</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Categorías</h3>
              <div className="space-y-2">
                {[{ id: '', nombre: 'Todas' }, ...categorias].map(cat => (
                  <label key={cat.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="cat" value={cat.id} checked={filtros.categoriaId === cat.id} onChange={() => setFiltros(f => ({ ...f, categoriaId: cat.id }))} className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-slate-600">{cat.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Marca</h3>
              <select value={filtros.marcaId} onChange={(e) => setFiltros(f => ({ ...f, marcaId: e.target.value }))} className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todas</option>
                {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-blue-50 transition-colors">
              <input type="checkbox" checked={filtros.soloConStock} onChange={(e) => setFiltros(f => ({ ...f, soloConStock: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm font-bold text-slate-700">Solo con stock</span>
            </label>
            <button onClick={() => { setFiltros({ categoriaId: '', marcaId: '', soloConStock: false }); setBusqueda(''); setMostrarCatalogoCompleto(false); }} className="w-full py-2.5 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              Limpiar filtros
            </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(s => !s)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Filter className="w-5 h-5" />
            </button>
            <div className="relative w-full max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text" placeholder="Buscar SKU, código o nombre..." value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setBusquedaDebounced(busqueda)}
                className="w-full pl-12 pr-4 py-2.5 bg-slate-100/70 border border-slate-200/50 rounded-xl text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 font-semibold"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}><List className="w-4 h-4" /></button>
            </div>
            <PuedeCrear ruta="/api/catalogo/productos">
              <button onClick={abrirModalCrear} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-md transition-all">
                <Plus className="w-4 h-4" /> Nuevo Artículo
              </button>
            </PuedeCrear>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!busquedaActiva ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
                <PackageSearch className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-3">Directorio de Materiales</h2>
              <p className="text-slate-500 max-w-md mb-8 font-medium">Usa el buscador o los filtros para localizar un producto.</p>
              <button onClick={() => setMostrarCatalogoCompleto(true)} className="px-6 py-3 bg-white border border-slate-200 shadow-sm rounded-xl font-bold text-blue-600 hover:bg-blue-50 transition-colors">
                Cargar todo el catálogo
              </button>
            </div>
          ) : cargando && productos.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-slate-400">
              <Loader2 className="animate-spin text-blue-500 w-10 h-10 mb-4" />
              <span className="font-bold">Buscando...</span>
            </div>
          ) : productos.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-slate-500">
              <PackageMinus className="w-20 h-20 text-slate-200 mb-4" />
              <p className="text-2xl font-black text-slate-800">Sin resultados</p>
            </div>
          ) : (
            <>
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {productos.map((prod) => {
                    const imgPrincipal = prod.imagenes?.find(img => img.principal) || prod.imagenes?.[0];
                    return (
                      <div key={prod.id} className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group hover:shadow-md transition-all ${!prod.activo ? 'opacity-70 grayscale-[50%]' : ''}`}>
                        <div onClick={() => prod.imagenes?.length && setGallery({ open: true, imagenes: prod.imagenes!, currentIndex: 0 })} className="relative aspect-video bg-slate-100 cursor-pointer overflow-hidden border-b border-slate-100">
                          {imgPrincipal ? (
                            <img src={`${BASE_URL}${imgPrincipal.url}`} alt={prod.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-slate-300" /></div>
                          )}
                          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-black shadow-sm">
                            ${obtenerPrecioPublico(prod).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <p className="text-xs font-bold text-slate-400 mb-1">{prod.sku}</p>
                          <h3 className="font-bold text-slate-900 leading-tight mb-3 line-clamp-2">{prod.nombre}</h3>
                          <div className="mt-auto flex items-center justify-between">
                            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${(prod.stockActual ?? 0) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {prod.stockActual ?? 0} {prod.unidadMedida}
                            </span>
                            <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                              <PuedeEditar ruta="/api/catalogo/productos/:id">
                                <button onClick={() => abrirModalEditar(prod)} className="p-1.5 hover:bg-slate-100 rounded text-slate-600"><Edit2 className="w-4 h-4" /></button>
                              </PuedeEditar>
                              <Link href={`/dashboard/productos/${prod.id}`} className="p-1.5 hover:bg-slate-100 rounded text-slate-600"><History className="w-4 h-4" /></Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === 'list' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black border-b border-slate-200">
                        <th className="px-6 py-4">Producto</th>
                        <th className="px-6 py-4">SKU</th>
                        <th className="px-6 py-4 text-right">Precio Público</th>
                        <th className="px-6 py-4 text-center">Stock</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {productos.map((prod) => (
                        <tr key={prod.id} className={`hover:bg-slate-50/80 transition-colors ${!prod.activo ? 'opacity-70 grayscale' : ''}`}>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 bg-slate-100 rounded overflow-hidden cursor-pointer shrink-0" onClick={() => prod.imagenes?.length && setGallery({ open: true, imagenes: prod.imagenes!, currentIndex: 0 })}>
                                {prod.imagenes?.[0] ? <img src={`${BASE_URL}${prod.imagenes[0].url}`} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="w-4 h-4 m-auto mt-3 text-slate-300" />}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">{prod.nombre}</span>
                                {prod.nombreCorto && <span className="text-xs text-slate-400">{prod.nombreCorto}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-700 font-mono">{prod.sku}</td>
                          <td className="px-6 py-3 text-right font-black text-slate-900">
                            ${obtenerPrecioPublico(prod).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold border ${(prod.stockActual ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {prod.stockActual ?? 0} {prod.unidadMedida}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <PuedeEditar ruta="/api/catalogo/productos/:id">
                                <button onClick={() => abrirModalEditar(prod)} className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                              </PuedeEditar>
                              <Link href={`/dashboard/productos/${prod.id}`} className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded transition-colors"><History className="w-4 h-4" /></Link>
                              <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
                              <ProtectedElement metodo="POST" ruta="/api/catalogo/inventario/productos/:id/compra">
                                <button onClick={() => setModalInventario({ isOpen: true, tipo: 'compra', producto: prod })} className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded transition-colors"><PackagePlus className="w-4 h-4" /></button>
                              </ProtectedElement>
                              <ProtectedElement metodo="POST" ruta="/api/catalogo/inventario/productos/:id/salida">
                                <button onClick={() => setModalInventario({ isOpen: true, tipo: 'salida', producto: prod })} className="p-1.5 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded transition-colors"><PackageMinus className="w-4 h-4" /></button>
                              </ProtectedElement>
                              <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
                              <PuedeEditar ruta="/api/catalogo/productos/:id/estado">
                                <button onClick={() => handleCambiarEstado(prod.id)} className={`p-1.5 rounded transition-colors ${prod.activo ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-rose-500 hover:bg-emerald-50 hover:text-emerald-600'}`}><Power className="w-4 h-4" /></button>
                              </PuedeEditar>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {hayMas && (
                <div className="mt-8 flex justify-center pb-4">
                  <button onClick={() => { const sig = pagina + 1; setPagina(sig); fetchProductos(sig, true); }} disabled={cargando} className="px-8 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 shadow-sm transition-all flex items-center gap-2">
                    {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Cargar más
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {gallery.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95">
          <button onClick={() => setGallery(g => ({ ...g, open: false }))} className="absolute top-6 right-6 text-white"><X className="w-8 h-8" /></button>
          <img src={`${BASE_URL}${gallery.imagenes[gallery.currentIndex].url}`} className="max-h-[80vh] max-w-[80vw] object-contain" alt="" />
        </div>
      )}

      <ModalFichaProducto
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productoEditandoId={productoEditandoId}
        formData={formData}
        setFormData={setFormData}
        categorias={categorias}
        marcas={marcas}
        impuestos={impuestos}
        almacenes={almacenes}
        listasPrecio={listasPrecio}
        guardando={guardando}
        onSubmit={handleGuardarProducto}
        inputFileRef={inputFileRef}
        handleSeleccionarImagenes={handleSeleccionarImagenes}
        BASE_URL={BASE_URL}
        atributosIniciales={atributosIniciales}
        sectorInicial={sectorInicial}
      />

      <ModalInventarioRapido
        isOpen={modalInventario.isOpen}
        onClose={() => setModalInventario({ isOpen: false, tipo: 'compra', producto: null })}
        tipo={modalInventario.tipo}
        producto={modalInventario.producto}
        almacenes={almacenes}
        onSubmit={handleTransaccionInventario}
      />
    </div>
  );
}
