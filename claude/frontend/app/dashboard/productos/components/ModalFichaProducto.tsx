"use client";
import { useState, useEffect, useRef } from 'react';

/** Las secciones del modal, para poder nombrarlas en los avisos. */
type TabId = 'general' | 'precios' | 'logistica' | 'sectorial' | 'empaques' | 'multimedia';
const NOMBRE_SECCION: Record<TabId, string> = {
  general: 'Datos generales',
  precios: 'Costos y precios',
  logistica: 'Logística',
  sectorial: 'Atributos sector',
  empaques: 'Empaques',
  multimedia: 'Imágenes',
};
import {
  Package, CheckCircle2, Info, Image as ImageIcon, Star, Trash2,
  Plus, Tags, DollarSign, Box, PackagePlus, AlertCircle,
  Layers, FileText, X, Thermometer, Globe, Barcode,
  FlaskConical, Settings2, Loader2, ChevronRight, ArrowRight, Check
} from 'lucide-react';
import { IFormData, ICatalogoBasico, IImpuesto, IListaPrecio } from '../types/producto.types';
import SelectConCrear from './SelectConCrear';
import { usePermiso } from '@/hooks/use-permisos';

// ─── Tipos internos ───────────────────────────────────────────────
interface IAtributo {
  clave: string; etiqueta: string; valor: string;
  tipoValor?: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
  unidad?: string; sector?: string; orden?: number;
  opciones?: string | null; // para SELECT: 'A|B|C'
}
interface IGrupoAtributos {
  id: string; nombre: string; descripcion?: string | null;
  definiciones: Array<{
    id: string; clave: string; etiqueta: string;
    tipoValor: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
    unidad?: string | null; opciones?: string | null; orden: number;
  }>;
}
interface IPresetAtributo {
  clave: string; etiqueta: string; tipoValor: string;
  sector: string; orden: number; unidad?: string;
}
interface IEquivalencia {
  id?: string; nombreEmpaque: string; factorConversion: number;
  codigoBarras?: string; padreIdx?: number | null;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  productoEditandoId: string | null;
  formData: IFormData;
  setFormData: React.Dispatch<React.SetStateAction<IFormData>>;
  categorias: ICatalogoBasico[];
  marcas: ICatalogoBasico[];
  impuestos: IImpuesto[];
  almacenes: ICatalogoBasico[];
  listasPrecio: IListaPrecio[];
  unidades: any[];
  setCategorias: React.Dispatch<React.SetStateAction<ICatalogoBasico[]>>;
  setMarcas: React.Dispatch<React.SetStateAction<ICatalogoBasico[]>>;
  setUnidades: React.Dispatch<React.SetStateAction<any[]>>;
  guardando: boolean;
  onSubmit: (e: React.FormEvent, atributos?: any[]) => void;
  inputFileRef: React.RefObject<HTMLInputElement | null>;
  handleSeleccionarImagenes: (e: React.ChangeEvent<HTMLInputElement>) => void;
  BASE_URL: string;
  atributosIniciales?: any[];
  sectorInicial?: string;
}

// ─── Catálogos ────────────────────────────────────────────────────
const TIPOS_PRODUCTO = [
  { value: 'FISICO', label: 'Físico — producto con stock' },
  { value: 'SERVICIO', label: 'Servicio — sin inventario' },
  { value: 'CONSUMIBLE', label: 'Consumible — uso interno' },
  { value: 'KIT', label: 'Kit — paquete compuesto' },
  { value: 'MATERIA_PRIMA', label: 'Materia Prima — manufactura' },
];
const UNIDADES_MEDIDA = [
  { value: 'PIEZA', label: 'Pieza (PZA)' }, { value: 'KILOGRAMO', label: 'Kilogramo (KG)' },
  { value: 'GRAMO', label: 'Gramo (G)' },   { value: 'LITRO', label: 'Litro (L)' },
  { value: 'MILILITRO', label: 'Mililitro (ML)' }, { value: 'METRO', label: 'Metro (M)' },
  { value: 'CAJA', label: 'Caja (CJ)' },    { value: 'PAQUETE', label: 'Paquete (PAQ)' },
  { value: 'SERVICIO', label: 'Servicio (SRV)' },
];
const CONDICIONES_ALMACEN = [
  { value: 'AMBIENTE', label: 'Temperatura ambiente (15-25°C)' },
  { value: 'REFRIGERADO', label: 'Refrigerado (2-8°C)' },
  { value: 'CONGELADO', label: 'Congelado (-18°C o menos)' },
  { value: 'CONTROLADO', label: 'Temperatura y humedad controlada' },
  { value: 'INFLAMABLE', label: 'Bodega especial — inflamables' },
];
const TIPOS_COSTO = [
  { value: 'PROMEDIO', label: 'Promedio Ponderado (recomendado)' },
  { value: 'ESTANDAR', label: 'Costo Estándar' },
  { value: 'FIFO', label: 'FIFO — Primero en entrar, primero en salir' },
  { value: 'LIFO', label: 'LIFO — Último en entrar, primero en salir' },
  { value: 'ESPECIFICO', label: 'Identificación Específica' },
];
const MONEDAS = [
  { value: 'MXN', label: 'MXN — Peso Mexicano' },
  { value: 'USD', label: 'USD — Dólar Americano' },
  { value: 'EUR', label: 'EUR — Euro' },
];
// Los grupos de atributos ahora son DINÁMICOS: los crea el usuario
// en /dashboard/productos/atributos y se cargan de la API.

// ─── Árbol de equivalencias ───────────────────────────────────────
function EquivalenciasArbol({ equivalencias, unidadBase, onChange }: {
  equivalencias: IEquivalencia[]; unidadBase: string;
  onChange: (eqs: IEquivalencia[]) => void;
}) {
  const calcularFactorTotal = (idx: number): number => {
    const eq = equivalencias[idx];
    if (eq.padreIdx == null) return eq.factorConversion;
    return eq.factorConversion * calcularFactorTotal(eq.padreIdx);
  };

  const agregarNivel = (padreIdx: number | null) => {
    onChange([...equivalencias, { nombreEmpaque: '', factorConversion: 1, codigoBarras: '', padreIdx }]);
  };

  const actualizarCampo = (idx: number, campo: keyof IEquivalencia, valor: unknown) => {
    onChange(equivalencias.map((eq, i) => i === idx ? { ...eq, [campo]: valor } : eq));
  };

  // IMPORTANTE: usamos 'aEliminar' — nombre distinto al de la función
  const eliminarNodo = (idx: number) => {
    const aEliminar = new Set<number>([idx]);
    let cambio = true;
    while (cambio) {
      cambio = false;
      equivalencias.forEach((eq, i) => {
        if (eq.padreIdx != null && aEliminar.has(eq.padreIdx) && !aEliminar.has(i)) {
          aEliminar.add(i); cambio = true;
        }
      });
    }
    const restantes = equivalencias.filter((_, i) => !aEliminar.has(i));
    onChange(restantes.map(eq => {
      if (eq.padreIdx == null) return eq;
      const nuevoIdx = restantes.findIndex((e) => equivalencias.indexOf(e) === eq.padreIdx);
      return { ...eq, padreIdx: nuevoIdx >= 0 ? nuevoIdx : null };
    }));
  };

  const renderNodos = (padreIdx: number | null, prof: number): React.ReactNode => {
    return equivalencias
      .map((eq, i) => ({ eq, i }))
      .filter(({ eq }) => eq.padreIdx === padreIdx)
      .map(({ eq, i }) => {
        const factorTotal = calcularFactorTotal(i);
        const nombrePadre = padreIdx == null ? unidadBase : (equivalencias[padreIdx]?.nombreEmpaque || unidadBase);
        return (
          <div key={i} style={{ marginLeft: prof * 24 }}>
            <div className="flex items-start gap-2 mb-2">
              {prof > 0 && (
                <div className="flex items-center gap-1 mt-3 shrink-0">
                  <div className="w-4 h-px bg-slate-300" />
                  <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
              )}
              <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre del empaque</label>
                    <input type="text" value={eq.nombreEmpaque}
                      onChange={(e) => actualizarCampo(i, 'nombreEmpaque', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      placeholder="Ej. Caja, Paquete..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Contiene</label>
                    <input type="number" min="1" value={eq.factorConversion || ''}
                      onChange={(e) => actualizarCampo(i, 'factorConversion', Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 font-mono font-bold" />
                  </div>
                  <div className="col-span-2 pb-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">De</label>
                    <div className="px-2 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded text-slate-600 font-medium truncate">
                      {nombrePadre}
                    </div>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Código de barras</label>
                    <input type="text" value={eq.codigoBarras || ''}
                      onChange={(e) => actualizarCampo(i, 'codigoBarras', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-slate-800"
                      placeholder="EAN opcional" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" onClick={() => eliminarNodo(i)}
                      className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {eq.nombreEmpaque && factorTotal > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      1 {eq.nombreEmpaque} = {factorTotal.toLocaleString()} {unidadBase}
                    </span>
                  </div>
                )}
                <button type="button" onClick={() => agregarNivel(i)}
                  className="mt-2 text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3" /> Agregar sub-empaque dentro de {eq.nombreEmpaque || 'este nivel'}
                </button>
              </div>
            </div>
            {renderNodos(i, prof + 1)}
          </div>
        );
      });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        <span className="text-sm font-bold text-blue-800">Unidad base: {unidadBase}</span>
        <span className="text-xs text-blue-600 ml-auto">Factor = 1 (referencia)</span>
      </div>
      <div className="space-y-1">{renderNodos(null, 0)}</div>
      <button type="button" onClick={() => agregarNivel(null)}
        className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Agregar empaque de nivel raíz
      </button>
      {equivalencias.length > 0 && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Resumen de jerarquía</p>
          <div className="flex flex-wrap gap-2">
            {[{ nombre: unidadBase, factor: 1 }, ...equivalencias.map((eq, i) => ({
              nombre: eq.nombreEmpaque || `Nivel ${i + 1}`,
              factor: eq.nombreEmpaque ? calcularFactorTotal(i) : 0,
            }))].filter(e => e.factor > 0 && e.nombre).map((e, i, arr) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded">{e.nombre}</span>
                {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-400" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────
export default function ModalFichaProducto({
  isOpen, onClose, productoEditandoId, formData, setFormData,
  categorias, marcas, impuestos, almacenes, listasPrecio,
  unidades, setCategorias, setMarcas, setUnidades,
  guardando, onSubmit, inputFileRef, handleSeleccionarImagenes, BASE_URL,
}: Props) {

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const token = typeof window !== 'undefined' ? (localStorage.getItem('syncro_token') ?? '') : '';

  /*
   * Si este perfil no consulta precios ni impuestos, la ficha no puede decir
   * «no hay listas configuradas»: sí las hay, no son suyas. La diferencia entre
   * «está vacío» y «no es tuyo» es la que hace que alguien salga a configurar
   * lo que ya estaba configurado.
   */
  const { tienePermiso } = usePermiso();
  const verPrecios = tienePermiso('GET', '/api/catalogo/listas-precio');
  /*
   * El costo de reposición es una cifra de compras, no de almacén: cuánto
   * costaría reponer hoy esta pieza. El costo REAL de lo que hay en piso no se
   * teclea aquí —lo arma cada recepción, lote por lote, con el precio de la
   * orden de compra—, así que este campo sólo sirve de referencia y de red
   * cuando una entrada llega sin costo. Tecleado por quien no compra, esa red
   * se vuelve una cifra inventada que acaba valuando inventario.
   */
  const editarCosto = tienePermiso('POST', '/api/compras/ordenes');

  const [modalUnidad, setModalUnidad] = useState(false);
  const [nuevaUnidad, setNuevaUnidad] = useState({ nombre: '', abreviatura: '', claveSAT: '' });
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  const crearUnidadRapida = async () => {
    if (!nuevaUnidad.nombre.trim()) return;
    setGuardandoUnidad(true);
    try {
      const res = await fetch(`${apiUrl}/catalogo/unidades-medida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nuevaUnidad),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d) {
        setUnidades(prev => [...prev, d]);
        setFormData(prev => ({
          ...prev,
          unidadMedida: d.nombre,
          claveUnidadSAT: d.claveSAT || prev.claveUnidadSAT,
        }));
        setModalUnidad(false);
        setNuevaUnidad({ nombre: '', abreviatura: '', claveSAT: '' });
      }
    } catch (e) { console.error(e); }
    setGuardandoUnidad(false);
  };

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [sectorSeleccionado, setSectorSeleccionado] = useState('');
  const [atributos, setAtributos] = useState<IAtributo[]>([]);
  const [cargandoPreset, setCargandoPreset] = useState(false);
  const [gruposAtributos, setGruposAtributos] = useState<IGrupoAtributos[]>([]);

  // Cargar los grupos de atributos definidos por el usuario
  useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem('syncro_token');
    fetch(`${apiUrl}/catalogo/atributos-personalizados/grupos?incluirDefiniciones=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setGruposAtributos(Array.isArray(data) ? data : []))
      .catch(() => setGruposAtributos([]));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const atributosOriginalesRef = useRef<IAtributo[]>([]);
  const sectorOriginalRef = useRef<string>('');


  /*
   * Si el perfil no decide costos ni precios, esa pestaña no existe para él.
   * Va aquí arriba y no junto a `TABS`, porque después del `return null` de
   * `isOpen` los hooks ya no se ejecutan en todos los renders y React cambia
   * el orden de llamada —lo avisa y deja de funcionar la ficha entera—.
   */
  useEffect(() => {
    if (activeTab === 'precios' && !editarCosto && !verPrecios) setActiveTab('general');
  }, [activeTab, editarCosto, verPrecios]);

  // Sincronizar atributos cuando se abre el modal
  useEffect(() => {
    if (!isOpen) { setActiveTab('general'); return; }
    const atrsExistentes = ((formData as unknown as Record<string, unknown>).atributos ?? []) as IAtributo[];
    if (atrsExistentes.length > 0) {
      setAtributos(atrsExistentes);
      setSectorSeleccionado(atrsExistentes[0]?.sector || '');
      atributosOriginalesRef.current = atrsExistentes;
      sectorOriginalRef.current = atrsExistentes[0]?.sector || '';
    } else {
      setAtributos([]);
      setSectorSeleccionado('');
      atributosOriginalesRef.current = [];
      sectorOriginalRef.current = '';
    }
  }, [isOpen, productoEditandoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarPresetSector = async (nombreGrupo: string) => {
    setSectorSeleccionado(nombreGrupo);
    if (!nombreGrupo) { setAtributos([]); return; }
    const grupo = gruposAtributos.find((g) => g.nombre === nombreGrupo);
    if (!grupo) { setAtributos([]); return; }
    // Si regresa al grupo original, restaurar valores de BD
    const esElOriginal = nombreGrupo === sectorOriginalRef.current;
    const fuente = esElOriginal ? atributosOriginalesRef.current : atributos;
    const valorGuardado: Record<string, string> = {};
    fuente.forEach((a: IAtributo) => { valorGuardado[a.clave] = a.valor; });
    setAtributos(grupo.definiciones.map((d) => ({
      clave: d.clave, etiqueta: d.etiqueta,
      valor: valorGuardado[d.clave] ?? '',
      tipoValor: d.tipoValor,
      unidad: d.unidad ?? undefined,
      sector: grupo.nombre,
      orden: d.orden,
      opciones: d.opciones ?? undefined,
    })));
  };

  type ErrorProducto = Partial<Record<'nombre'|'sku'|'categoriaId'|'unidadMedida'|'impuestoId'|'precioCompra'|'precios'|'stockActual'|'almacenId'|'stockMinimo'|'stockMaximo'|'puntoReorden'|'temperaturaMinC'|'temperaturaMaxC'|'equivalencias'|'requiereLote', string>>;
  const [errores, setErrores] = useState<ErrorProducto>({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [seccionesConError, setSeccionesConError] = useState<TabId[]>([]);
  /*
   * Aquí vivía un cálculo de «qué le falta para venderse» —impuesto, precio de
   * lista, claves del SAT— que pintaba un aviso ámbar en la ficha. Se quitó: a
   * quien da de alta la mercancía no le toca ninguno de esos tres datos, así
   * que el aviso le señalaba pendientes ajenos cada vez que abría un artículo,
   * en una pestaña que ya ni siquiera ve. Lo que de verdad importa —que un
   * artículo sin impuesto ni claves no se puede facturar— se dice en el
   * catálogo, con la etiqueta «No facturable», que es donde se ve de un golpe
   * y sin abrir nada.
   */
  const contenedorRef = useRef<HTMLDivElement>(null);

  const validarFormulario = (): ErrorProducto => {
    const e: ErrorProducto = {};
    if (!formData.nombre?.trim()) e.nombre = 'Captura el nombre comercial.';
    else if (formData.nombre.trim().length < 2) e.nombre = 'El nombre debe tener al menos 2 caracteres.';
    if (!formData.sku?.trim()) e.sku = 'Captura un SKU único.';
    if (!formData.categoriaId) e.categoriaId = 'Selecciona una categoría.';
    if (!formData.unidadMedida?.trim()) e.unidadMedida = 'Selecciona la unidad base.';
    /*
     * ══════════════════════════════════════════════════════════════════════
     * Existir y estar listo para vender no son lo mismo
     * ----------------------------------------------------------------------
     * El impuesto y el precio de venta eran obligatorios para GUARDAR, y el
     * único rol que puede dar de alta productos es el almacenista. Resultado:
     * para registrar un artículo había que inventarse un precio de venta y
     * elegir un impuesto —dos datos que no son del almacén— y ese precio
     * inventado quedaba en el sistema como si alguien lo hubiera decidido.
     *
     * Un artículo puede nacer con lo mínimo y comprarse y almacenarse desde el
     * primer día. Lo que no puede es venderse sin precio ni facturarse sin
     * claves SAT, y de eso avisa la ficha —y lo impide el timbrado— en vez de
     * bloquear el alta.
     * ══════════════════════════════════════════════════════════════════════
     */
    /*
     * Las reglas de costo y precio sólo se comprueban si este perfil los
     * captura. Si no, sus campos ni siquiera se dibujan, y una regla sobre un
     * campo invisible produce lo peor que puede hacer un formulario: se niega
     * a guardar, anuncia «hay errores en Costos y precios» y manda a una
     * pestaña que para este usuario no existe. Queda encerrado sin manera de
     * ver qué está mal.
     */
    if (editarCosto && Number(formData.precioCompra) < 0) e.precioCompra = 'El costo no puede ser negativo.';
    if (verPrecios && (formData.precios ?? []).some(p => Number(p.precio) < 0)) e.precios = 'Un precio de venta no puede ser negativo.';
    if (Number(formData.stockActual) < 0) e.stockActual = 'El stock inicial no puede ser negativo.';
    if (!productoEditandoId && Number(formData.stockActual) > 0 && !formData.almacenId) e.almacenId = 'Selecciona el almacén del stock inicial.';
    if (Number(formData.stockMinimo) < 0) e.stockMinimo = 'El mínimo no puede ser negativo.';
    if (formData.stockMaximo != null && Number(formData.stockMaximo) < Number(formData.stockMinimo)) e.stockMaximo = 'El máximo no puede ser menor al mínimo.';
    if (formData.puntoReorden != null && formData.stockMaximo != null && Number(formData.puntoReorden) > Number(formData.stockMaximo)) e.puntoReorden = 'El punto de reorden no puede superar el máximo.';
    if (formData.temperaturaMinC != null && formData.temperaturaMaxC != null && Number(formData.temperaturaMinC) > Number(formData.temperaturaMaxC)) e.temperaturaMinC = 'La temperatura mínima no puede superar la máxima.';
    if (formData.requiereCaducidad && !formData.requiereLote) e.requiereLote = 'Para controlar caducidad debes activar el control por lote.';
    if ((formData.equivalencias ?? []).some(eq => !eq.nombreEmpaque?.trim() || Number(eq.factorConversion) < 1)) e.equivalencias = 'Todos los empaques requieren nombre y factor mayor o igual a 1.';
    return e;
  };

  useEffect(() => {
    if (!isOpen) { setErrores({}); setIntentoGuardar(false); setSeccionesConError([]); return; }
    if (intentoGuardar) setErrores(validarFormulario());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isOpen, intentoGuardar]);

  const handleSubmitConAtributos = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentoGuardar(true);
    const encontrados = validarFormulario();
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) {
      /*
       * ══════════════════════════════════════════════════════════════════
       * Cada error vive donde vive su campo
       * ------------------------------------------------------------------
       * `impuestoId` estaba clasificado como «general» y su selector vive
       * en Costos y precios. Al faltar el impuesto, la pantalla saltaba a
       * Datos generales —donde no hay nada marcado en rojo—, y el botón de
       * guardar dejaba de responder sin decir por qué. Con el aviso arriba
       * del todo y el formulario desplazado hacia abajo, ni siquiera se veía
       * el mensaje: el producto simplemente no se guardaba y no había manera
       * de saber qué faltaba.
       * ══════════════════════════════════════════════════════════════════
       */
      const SECCION_DEL_CAMPO: Record<string, TabId> = {
        nombre: 'general', sku: 'general', categoriaId: 'general', unidadMedida: 'general',
        impuestoId: 'precios', precioCompra: 'precios', precios: 'precios',
        stockActual: 'logistica', almacenId: 'logistica', stockMinimo: 'logistica',
        stockMaximo: 'logistica', puntoReorden: 'logistica',
        temperaturaMinC: 'logistica', temperaturaMaxC: 'logistica', requiereLote: 'logistica',
        equivalencias: 'empaques',
      };
      const ORDEN: TabId[] = ['general', 'precios', 'logistica', 'sectorial', 'empaques', 'multimedia'];
      const conError = new Set(
        Object.keys(encontrados).map((k) => SECCION_DEL_CAMPO[k] ?? 'general'),
      );
      setSeccionesConError(ORDEN.filter((s) => conError.has(s)));
      const primera = ORDEN.find((s) => conError.has(s)) ?? 'general';
      setActiveTab(primera);
      // Y se sube al principio: el aviso está arriba y el formulario suele
      // estar desplazado, así que el usuario se quedaba mirando una sección
      // sin errores visibles.
      contenedorRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSeccionesConError([]);
    (formData as unknown as Record<string, unknown>).atributos = atributos;
    onSubmit(e, atributos);
  };

  if (!isOpen) return null;

  const fd = formData as unknown as Record<string, unknown>;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleCheckbox = (key: string, checked: boolean) => {
    setFormData({ ...formData, [key]: checked } as IFormData);
  };
  const handlePrecio = (listaId: string, valor: string) => {
    setFormData(prev => ({
      ...prev,
      precios: prev.precios.map(p =>
        p.listaPrecioId === listaId ? { ...p, precio: Number(valor) } : p
      ),
    }));
  };
  const handleAtributo = (clave: string, valor: string) => {
    setAtributos(prev => prev.map(a => a.clave === clave ? { ...a, valor } : a));
  };

  const lbl  = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";
  const inp  = "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-800";
  const claseCampo = (campo: keyof ErrorProducto) => `${inp} ${errores[campo] ? 'border-rose-500 bg-rose-50 focus:ring-rose-300' : ''}`;
  const MensajeError = ({ campo }: { campo: keyof ErrorProducto }) => errores[campo] ? <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">{errores[campo]}</p> : null;
  const sec  = "bg-white p-5 rounded-lg border border-slate-200 shadow-sm mb-6";
  const stit = "text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2";

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * «Costos y Precios» no es de todos
   * --------------------------------------------------------------------------
   * La pestaña reúne tres cosas que decide gente distinta: el costo de
   * reposición (compras, y desde la última recepción se mantiene solo), el
   * impuesto aplicable (contabilidad) y el precio de venta por lista (ventas).
   * Ninguna es del almacén, y a quien da de alta la mercancía le aparecía
   * entera, con un campo de costo obligatorio y un aviso de que al artículo le
   * faltaban cosas para venderse.
   *
   * Ahora sólo la ve quien decide alguna de las tres. El control de inventario
   * —mínimos y punto de reorden—, que estaba aquí dentro sin venir a cuento, se
   * mudó a Logística, que es donde lo busca quien surte.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const TABS = [
    { id: 'general',    label: 'Datos Generales',  icon: <FileText className="w-4 h-4" /> },
    ...(editarCosto || verPrecios
      ? [{ id: 'precios', label: 'Costos y Precios', icon: <DollarSign className="w-4 h-4" /> }]
      : []),
    { id: 'logistica',  label: 'Logística',        icon: <Box className="w-4 h-4" /> },
    { id: 'sectorial',  label: 'Atributos Sector', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'empaques',   label: 'Empaques',         icon: <Layers className="w-4 h-4" /> },
    { id: 'multimedia', label: 'Imágenes',         icon: <ImageIcon className="w-4 h-4" /> },
  ] as const;

  const eqs = ((fd.equivalencias ?? []) as IEquivalencia[]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col border border-slate-300 overflow-hidden">

        {/* Header */}
        <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 leading-none">
                {productoEditandoId ? 'Edición de Material' : 'Nuevo Material'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {productoEditandoId ? `SKU: ${formData.sku}` : 'Completa los datos en cada sección'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Nav lateral */}
          <div className="w-52 bg-white border-r border-slate-200 shrink-0 py-4">
            <nav className="flex flex-col gap-1 px-3">
              {TABS.map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                    activeTab === tab.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 font-medium hover:bg-slate-50'
                  }`}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Contenido */}
          <div ref={contenedorRef} className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <form id="producto-form" onSubmit={handleSubmitConAtributos} className="max-w-3xl mx-auto" noValidate>
              {intentoGuardar && Object.keys(errores).length > 0 && (
                <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert">
                  <p className="font-bold text-rose-800">No se puede guardar el producto</p>
                  <p className="mt-1 text-sm text-rose-700">
                    Corrige {Object.keys(errores).length} campo(s) marcado(s)
                    {seccionesConError.length > 0 && (
                      <> en {seccionesConError.map((s) => NOMBRE_SECCION[s]).join(', ')}</>
                    )}
                    .
                  </p>
                </div>
              )}

              {/* ══ GENERAL ══ */}
              <div className={activeTab === 'general' ? 'block' : 'hidden'}>
                <div className={sec}>
                  <h3 className={stit}><Info className="w-4 h-4 text-blue-500" /> Identificación</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={lbl}>Nombre Comercial *</label>
                      <input name="nombre" value={formData.nombre} onChange={handleChange} className={claseCampo('nombre')} aria-invalid={Boolean(errores.nombre)} placeholder="Ej. Paracetamol 500mg Tabletas" />
                      <MensajeError campo="nombre" />
                    </div>
                    <div>
                      <label className={lbl}>Nombre Corto (tickets — máx 60 caracteres)</label>
                      <input name="nombreCorto" value={(fd.nombreCorto as string) || ''} onChange={handleChange} maxLength={60} className={inp} />
                      <p className="text-[10px] text-slate-400 mt-1">{((fd.nombreCorto as string) || '').length}/60</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className={lbl}>SKU *</label>
                        <input name="sku" value={formData.sku} onChange={handleChange} className={`${claseCampo('sku')} font-mono`} aria-invalid={Boolean(errores.sku)} placeholder="MAT-001" />
                        <MensajeError campo="sku" /></div>
                      <div><label className={lbl}>Código de Barras</label>
                        <input name="codigoBarras" value={formData.codigoBarras || ''} onChange={handleChange} className={`${inp} font-mono`} /></div>
                      <div><label className={lbl}>Código Barras 2</label>
                        <input name="codigoBarras2" value={(fd.codigoBarras2 as string) || ''} onChange={handleChange} className={`${inp} font-mono`} /></div>
                      <div><label className={lbl}>Código Proveedor</label>
                        <input name="codigoProveedor" value={(fd.codigoProveedor as string) || ''} onChange={handleChange} className={inp} /></div>
                    </div>
                    <div><label className={lbl}>Descripción Técnica</label>
                      <textarea name="descripcion" value={formData.descripcion || ''} onChange={handleChange} className={`${inp} resize-none`} rows={3} /></div>
                    <div><label className={lbl}>Observaciones Internas</label>
                      <textarea name="observacionesInternas" value={(fd.observacionesInternas as string) || ''} onChange={handleChange} className={`${inp} resize-none bg-amber-50 border-amber-200`} rows={2} /></div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><Tags className="w-4 h-4 text-blue-500" /> Clasificación</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Tipo de Producto</label>
                      <select name="tipo" value={(fd.tipo as string) || 'FISICO'} onChange={handleChange} className={inp}>
                        {TIPOS_PRODUCTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                    <div>
                      <SelectConCrear
                        label="Categoría"
                        name="categoriaId"
                        value={formData.categoriaId || ''}
                        opciones={categorias}
                        textoVacio="— Sin categoría —"
                        onChange={handleChange}
                        endpointCrear={`${apiUrl}/catalogo/categorias`}
                        token={token}
                        onCreado={(nueva) => setCategorias(prev => [...prev, nueva])}
                        className={claseCampo('categoriaId')}
                        tituloModal="Nueva categoría"
                        campos={[{ key: 'nombre', label: 'Nombre', placeholder: 'Ej. Bebidas, Abarrotes…' }]}
                      />
                      <MensajeError campo="categoriaId" />
                    </div>
                    <div>
                      <SelectConCrear
                        label="Marca"
                        name="marcaId"
                        value={formData.marcaId || ''}
                        opciones={marcas}
                        textoVacio="— Sin marca —"
                        onChange={handleChange}
                        endpointCrear={`${apiUrl}/catalogo/marcas`}
                        token={token}
                        onCreado={(nueva) => setMarcas(prev => [...prev, nueva])}
                        className={inp}
                        tituloModal="Nueva marca"
                        campos={[{ key: 'nombre', label: 'Nombre', placeholder: 'Ej. Coca-Cola, Bimbo…' }]}
                      />
                    </div>
                    <div><label className={lbl}>Unidad de Medida Base</label>
                      {/*
                        * ══════════════════════════════════════════════════════
                        * La unidad se guarda como TEXTO y se desincroniza
                        * ------------------------------------------------------
                        * Unos productos la tienen como «Pieza» y otros como
                        * «PIEZA». Las opciones de este desplegable salen del
                        * catálogo, que dice «Pieza», así que un producto
                        * guardado en mayúsculas no coincide con ninguna opción
                        * y el campo se pinta vacío —y encima deshabilitado,
                        * porque la unidad base no se puede cambiar—. Si el
                        * usuario guardaba, el servidor respondía «La unidad de
                        * medida es obligatoria» sobre un campo que no le deja
                        * tocar: el producto quedaba imposible de editar.
                        *
                        * Aquí se busca la opción sin distinguir mayúsculas y se
                        * usa el nombre del catálogo como valor. El servidor
                        * además normaliza al guardar, para que la deriva no se
                        * siga acumulando.
                        * ══════════════════════════════════════════════════════
                        */}
                      <div className="flex gap-2">
                        <select name="unidadMedida"
                          value={
                            unidades.find(
                              (x: any) =>
                                String(x.nombre).toLowerCase() ===
                                String(formData.unidadMedida ?? '').toLowerCase(),
                            )?.nombre ?? formData.unidadMedida ?? ''
                          }
                          disabled={!!productoEditandoId}
                          onChange={(e) => {
                            handleChange(e);
                            const u = unidades.find((x: any) => x.nombre === e.target.value);
                            if (u?.claveSAT) setFormData(prev => ({ ...prev, claveUnidadSAT: u.claveSAT }));
                          }}
                          className={`${claseCampo('unidadMedida')} ${productoEditandoId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}>
                          <option value="">— Seleccionar unidad —</option>
                          {unidades.map((u: any) => (
                            <option key={u.id} value={u.nombre}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>
                          ))}
                          {/*
                            * Una unidad que el producto trae y el catálogo ya no
                            * tiene no se borra en silencio: se muestra tal cual,
                            * marcada, para que quien edite sepa qué había.
                            */}
                          {formData.unidadMedida &&
                            !unidades.some(
                              (x: any) =>
                                String(x.nombre).toLowerCase() ===
                                String(formData.unidadMedida).toLowerCase(),
                            ) && (
                              <option value={formData.unidadMedida}>
                                {formData.unidadMedida} (fuera del catálogo)
                              </option>
                            )}
                        </select>
                        {!productoEditandoId && (
                          <button type="button" title="Crear unidad" onClick={() => setModalUnidad(true)}
                            className="shrink-0 w-10 flex items-center justify-center bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100">
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <MensajeError campo="unidadMedida" />
                      {productoEditandoId && <p className="text-[10px] text-amber-600 mt-1">La unidad base no puede cambiarse.</p>}</div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><Barcode className="w-4 h-4 text-blue-500" /> Catálogo SAT — requerido para CFDI</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Clave Producto SAT</label>
                      <input name="claveSAT" value={(fd.claveSAT as string) || ''} onChange={handleChange} className={`${inp} font-mono`} placeholder="Ej. 50202300" /></div>
                    <div><label className={lbl}>Clave Unidad SAT</label>
                      <input name="claveUnidadSAT" value={(fd.claveUnidadSAT as string) || ''} onChange={handleChange} className={`${inp} font-mono`} placeholder="Ej. H87" />
                      <p className="text-[10px] text-slate-400 mt-1">H87=Pieza · KGM=Kilo · LTR=Litro</p></div>
                  </div>
                  {/*
                    * Sin estas dos claves el producto se da de alta igual —hay
                    * insumos que nunca se facturan— pero no se puede timbrar.
                    * El error salía en caja, con el cliente enfrente y al
                    * cajero, que no es quien mantiene el catálogo. Aquí se
                    * avisa a quien sí puede arreglarlo, en el momento en que
                    * lo está capturando.
                    */}
                  {(!fd.claveSAT || !fd.claveUnidadSAT) && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      Sin estas claves el producto se guarda, pero <strong>no se
                      podrá facturar</strong>: al timbrar, el SAT las exige. Déjalas
                      vacías sólo si este artículo nunca se vende al cliente.
                    </p>
                  )}
                </div>
              </div>

              {/* ══ PRECIOS ══ */}
              <div className={activeTab === 'precios' ? 'block' : 'hidden'}>
                <div className={sec}>
                  <h3 className={stit}><Layers className="w-4 h-4 text-blue-500" /> Costo de Adquisición</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className={lbl}>Costo de reposición</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                        <input
                          type="number" step="0.0001" name="precioCompra"
                          value={formData.precioCompra}
                          onChange={handleChange}
                          readOnly={!editarCosto}
                          disabled={!editarCosto}
                          title={editarCosto ? undefined : 'Lo mantiene cada recepción de compra'}
                          className={`${claseCampo('precioCompra')} pl-8 ${editarCosto ? '' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                          aria-invalid={Boolean(errores.precioCompra)} /></div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {editarCosto
                          ? 'Referencia de compra. Cada recepción lo actualiza con el precio de la orden.'
                          : 'Lo actualiza solo, con el precio de cada orden de compra recibida.'}
                      </p>
                      <MensajeError campo="precioCompra" /></div>
                    <div><label className={lbl}>Moneda</label>
                      <select name="monedaCosto" value={(fd.monedaCosto as string) || 'MXN'} onChange={handleChange} disabled={!editarCosto}
                        className={`${inp} ${editarCosto ? '' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}>
                        {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                    <div><label className={lbl}>Método de Costeo</label>
                      {/*
                        * Cambiar de promedio ponderado a costo estándar cambia
                        * el valor del inventario y el costo de cada venta
                        * posterior. Es una decisión de política contable, no un
                        * dato de la ficha: no se toca desde el almacén.
                        */}
                      <select name="tipoCosto" value={(fd.tipoCosto as string) || 'PROMEDIO'} onChange={handleChange} disabled={!editarCosto}
                        className={`${inp} ${editarCosto ? '' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}>
                        {TIPOS_COSTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><DollarSign className="w-4 h-4 text-emerald-600" /> Precios de Venta por Lista</h3>
                  <div className="mb-4 max-w-xs">
                    <label className={lbl}>Impuesto</label>
                    {/*
                      * Si la lista viene vacía no es que no haya impuestos: es
                      * que este perfil no los consulta. El impuesto aplicable
                      * lo decide quien lleva la contabilidad, no quien da de
                      * alta la mercancía. Un desplegable vacío y sin
                      * explicación se lee como un sistema roto.
                      */}
                    {!verPrecios && (
                      <p className="text-[11px] text-slate-500 mb-1.5">
                        Lo define Contabilidad. Puedes guardar el producto sin esto; no podrá facturarse
                        hasta que lo asignen.
                      </p>
                    )}
                    <select name="impuestoId" value={formData.impuestoId || ''} onChange={handleChange} className={claseCampo('impuestoId')} aria-invalid={Boolean(errores.impuestoId)}>
                      {/*
                        * La opción vacía decía «Exento (0%)», igual que el
                        * impuesto real de ese nombre. Un producto sin impuesto
                        * asignado se veía idéntico a uno configurado como
                        * exento, y no lo es: sin impuesto, la cotización de
                        * compra sale con IVA cero y la póliza de la recepción
                        * también.
                        */}
                      <option value="">Sin impuesto asignado</option>
                      {impuestos.map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.porcentaje}%)</option>)}
                    </select>
                    <MensajeError campo="impuestoId" />
                  </div>
                  {!verPrecios ? (
                    /*
                      * Antes decía «No hay listas de precio configuradas», que
                      * es falso: sí las hay, este perfil no las consulta. Un
                      * aviso que afirma un hecho equivocado manda a alguien a
                      * configurar lo que ya estaba configurado.
                      */
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      <p className="text-xs font-medium text-slate-600">
                        El precio de venta lo fija Ventas. No forma parte de tu ficha.
                      </p>
                    </div>
                  ) : listasPrecio.length === 0 ? (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 rounded border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-xs font-medium text-amber-800">No hay listas de precio configuradas.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {listasPrecio.map(lista => {
                        const val = formData.precios.find(p => p.listaPrecioId === lista.id)?.precio || '';
                        return (
                          <div key={lista.id} className={`p-3 rounded-md border ${lista.esPorDefecto ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                            <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                              <span>{lista.nombre}</span>
                              {lista.esPorDefecto && <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded font-bold">PÚBLICO</span>}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                              <input type="number" step="0.01" value={val}
                                onChange={(e) => handlePrecio(lista.id, e.target.value)}
                                className={`${inp} pl-8`} placeholder="0.00" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <MensajeError campo="precios" />
                </div>
              </div>

              {/* ══ LOGÍSTICA ══ */}
              <div className={activeTab === 'logistica' ? 'block' : 'hidden'}>
                {/*
                  * El control de inventario —mínimo, máximo, punto de reorden,
                  * compra mínima— vivía en «Costos y Precios», junto al precio
                  * de venta y al impuesto. No tienen nada que ver: esto es lo
                  * que decide cuándo hay que reponer, y lo lleva quien surte.
                  * Al ocultarle esa pestaña a quien no fija precios, estos
                  * cuatro campos se iban con ella. Su casa es Logística.
                  */}
                <div className={sec}>
                  <h3 className={stit}><Settings2 className="w-4 h-4 text-blue-500" /> Control de Inventario</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Stock Mínimo</label>
                      <input type="number" min="0" name="stockMinimo" value={(fd.stockMinimo as number) ?? 5} onChange={handleChange} className={claseCampo('stockMinimo')} />
                      <MensajeError campo="stockMinimo" /></div>
                    <div><label className={lbl}>Stock Máximo</label>
                      <input type="number" min="0" name="stockMaximo" value={(fd.stockMaximo as string) || ''} onChange={handleChange} className={claseCampo('stockMaximo')} />
                      <MensajeError campo="stockMaximo" /></div>
                    <div><label className={lbl}>Punto de Reorden</label>
                      <input type="number" min="0" name="puntoReorden" value={(fd.puntoReorden as string) || ''} onChange={handleChange} className={claseCampo('puntoReorden')} />
                      <MensajeError campo="puntoReorden" /></div>
                    <div><label className={lbl}>Cant. Mínima de Compra</label>
                      <input type="number" min="0" step="0.001" name="cantidadMinimaPedido" value={(fd.cantidadMinimaPedido as string) || ''} onChange={handleChange} className={inp} /></div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><Box className="w-4 h-4 text-blue-500" /> Dimensiones Físicas</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className={lbl}>Peso Bruto (Kg)</label>
                      <input type="number" step="0.001" name="pesoKg" value={formData.pesoKg || ''} onChange={handleChange} className={inp} /></div>
                    <div><label className={lbl}>Volumen (cm³)</label>
                      <input type="number" step="0.01" name="volumenCm3" value={formData.volumenCm3 || ''} onChange={handleChange} className={inp} /></div>
                    <div><label className={lbl}>Días de Vida Útil</label>
                      <input type="number" min="0" name="diasVidaUtil" value={(fd.diasVidaUtil as string) || ''} onChange={handleChange} className={inp} /></div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><Thermometer className="w-4 h-4 text-blue-500" /> Almacenamiento</h3>
                  <div>
                    <label className={lbl}>Condición de Almacén</label>
                    <select name="condicionAlmacen" value={(fd.condicionAlmacen as string) || 'AMBIENTE'} onChange={handleChange} className={inp}>
                      {CONDICIONES_ALMACEN.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {['REFRIGERADO','CONGELADO','CONTROLADO'].includes((fd.condicionAlmacen as string)) && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div><label className={lbl}>Temp. Mínima (°C)</label>
                          <input type="number" step="0.1" name="temperaturaMinC" value={(fd.temperaturaMinC as string) ?? ''} onChange={handleChange} className={claseCampo('temperaturaMinC')} />
                          <MensajeError campo="temperaturaMinC" /></div>
                        <div><label className={lbl}>Temp. Máxima (°C)</label>
                          <input type="number" step="0.1" name="temperaturaMaxC" value={(fd.temperaturaMaxC as string) ?? ''} onChange={handleChange} className={claseCampo('temperaturaMaxC')} />
                          <MensajeError campo="temperaturaMaxC" /></div>
                      </div>
                    )}
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><Globe className="w-4 h-4 text-blue-500" /> Comercio Exterior</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Fracción Arancelaria</label>
                      <input name="fraccionArancelaria" value={(fd.fraccionArancelaria as string) || ''} onChange={handleChange} className={`${inp} font-mono`} placeholder="Ej. 0201.10.01" /></div>
                    <div><label className={lbl}>País de Origen</label>
                      <input name="paisOrigen" value={(fd.paisOrigen as string) || ''} onChange={handleChange} className={`${inp} font-mono`} placeholder="MEX" maxLength={3} /></div>
                  </div>
                </div>
                <div className={sec}>
                  <h3 className={stit}><AlertCircle className="w-4 h-4 text-blue-500" /> Políticas de Inventario</h3>
                  <div className="space-y-3">
                    {[
                      { key: 'esGranel', label: 'Producto a Granel', desc: 'Venta por peso variable', locked: !!productoEditandoId },
                      { key: 'requiereLote', label: 'Control por Lotes', desc: 'Exige número de lote en movimientos', locked: !!productoEditandoId },
                      { key: 'requiereCaducidad', label: 'Manejo de Caducidad', desc: 'FEFO para alimentos/farmacia', locked: !!productoEditandoId },
                      { key: 'requiereNumeroSerie', label: 'Número de Serie', desc: 'Cada unidad tiene ID único', locked: !!productoEditandoId },
                      { key: 'permiteVentaSinStock', label: 'Permitir Venta en Negativo', desc: 'Genera backorders', locked: false },
                    ].map(({ key, label, desc, locked }) => (
                      <label key={key} className={`flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-md transition-colors ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={!!(fd[key])} onChange={(e) => handleCheckbox(key, e.target.checked)}
                          disabled={locked} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        <div>
                          <span className="block text-sm font-semibold text-slate-800">{label}</span>
                          <span className="block text-xs text-slate-500">{desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <MensajeError campo="requiereLote" />
                </div>
                {!productoEditandoId && (
                  <div className="bg-emerald-50 p-5 rounded-lg border border-emerald-200">
                    <h3 className="text-sm font-bold text-emerald-800 mb-4 pb-2 border-b border-emerald-200 flex items-center gap-2">
                      <PackagePlus className="w-4 h-4" /> Apertura de Inventario
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[11px] font-semibold text-emerald-700 uppercase mb-1.5">Cantidad Inicial</label>
                        <input type="number" name="stockActual" value={(fd.stockActual as number) ?? 0} onChange={handleChange} className={`${claseCampo('stockActual')} border-emerald-300`} />
                        <MensajeError campo="stockActual" /></div>
                      <div><label className="block text-[11px] font-semibold text-emerald-700 uppercase mb-1.5">Almacén Destino</label>
                        <select name="almacenId" value={formData.almacenId || ''} onChange={handleChange} className={`${claseCampo('almacenId')} border-emerald-300`}>
                          <option value="">— Seleccionar —</option>
                          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                        <MensajeError campo="almacenId" /></div>
                    </div>
                  </div>
                )}
              </div>

              {/* ══ SECTOR ══ */}
              <div className={activeTab === 'sectorial' ? 'block' : 'hidden'}>
                <div className={sec}>
                  <h3 className={stit}><FlaskConical className="w-4 h-4 text-purple-500" /> Sector de la Industria</h3>
                  <div className="flex items-center gap-3">
                    <select value={sectorSeleccionado} onChange={(e) => cargarPresetSector(e.target.value)} className={`${inp} max-w-xs`}>
                      <option value="">— Sin plantilla de atributos —</option>
                      {gruposAtributos.map(g => <option key={g.id} value={g.nombre}>{g.nombre}</option>)}
                    </select>
                    {cargandoPreset && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                    <a href="/dashboard/productos/atributos" target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap">⚙ Administrar plantillas</a>
                  </div>
                </div>
                {atributos.length > 0 && (
                  <div className={sec}>
                    <h3 className={stit}><Settings2 className="w-4 h-4 text-purple-500" />
                      Atributos — {sectorSeleccionado}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {atributos.map(attr => (
                        <div key={attr.clave}>
                          <label className={lbl}>{attr.etiqueta}
                            {attr.unidad && <span className="text-blue-500 ml-1 normal-case">({attr.unidad})</span>}
                          </label>
                          {attr.tipoValor === 'BOOLEAN' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={attr.valor === 'true'}
                                onChange={(e) => handleAtributo(attr.clave, e.target.checked ? 'true' : 'false')}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                              <span className="text-sm text-slate-700 font-medium">Sí</span>
                            </label>
                          ) : attr.tipoValor === 'NUMBER' ? (
                            <input type="number" step="0.01" value={attr.valor}
                              onChange={(e) => handleAtributo(attr.clave, e.target.value)} className={inp} />
                          ) : attr.tipoValor === 'SELECT' && attr.opciones ? (
                            <select value={attr.valor}
                              onChange={(e) => handleAtributo(attr.clave, e.target.value)} className={inp}>
                              <option value="">— Selecciona —</option>
                              {attr.opciones.split('|').map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          ) : attr.tipoValor === 'DATE' ? (
                            <input type="date" value={attr.valor}
                              onChange={(e) => handleAtributo(attr.clave, e.target.value)} className={inp} />
                          ) : (
                            <input type="text" value={attr.valor}
                              onChange={(e) => handleAtributo(attr.clave, e.target.value)} className={inp}
                              placeholder={`Ingresa ${attr.etiqueta.toLowerCase()}...`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!sectorSeleccionado && (
                  <div className="text-center py-16 text-slate-400">
                    <FlaskConical className="w-14 h-14 mx-auto mb-3 text-slate-200" />
                    <p className="font-bold text-slate-500">Selecciona una plantilla de atributos — créalas en ⚙ Administrar plantillas</p>
                  </div>
                )}
              </div>

              {/* ══ EMPAQUES ══ */}
              <div className={activeTab === 'empaques' ? 'block' : 'hidden'}>
                <div className={sec}>
                  <h3 className={stit}><Layers className="w-4 h-4 text-blue-500" /> Jerarquía de Empaques</h3>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-5 flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 font-medium">
                      Define cómo se empaca el producto en niveles.<br/>
                      Ej: <code className="bg-white border px-1 rounded">Pieza → Paquete x12 → Caja x10 paquetes = 120 piezas/caja</code>
                    </p>
                  </div>
                  <EquivalenciasArbol equivalencias={eqs} unidadBase={formData.unidadMedida}
                    onChange={(e) => setFormData(prev => ({ ...prev, equivalencias: e } as IFormData))} />
                  <MensajeError campo="equivalencias" />
                </div>
              </div>

              {/* ══ IMÁGENES ══ */}
              <div className={activeTab === 'multimedia' ? 'block' : 'hidden'}>
                <div className={sec}>
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-500" /> Galería</h3>
                    <span className="text-xs font-semibold text-slate-500">{formData.imagenes.length} imagen(es)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div onClick={() => inputFileRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-400 hover:text-blue-600 bg-slate-50">
                      <Plus className="w-6 h-6 mb-1" /><span className="text-[10px] font-bold uppercase">Subir</span>
                    </div>
                    {formData.imagenes.map((img, idx) => (
                      <div key={idx} className={`relative group rounded-md overflow-hidden aspect-square border ${img.principal ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
                        <img src={`${BASE_URL}${img.url}`} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-slate-900/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button type="button" className="p-1.5 bg-white text-blue-600 rounded shadow-sm hover:scale-110 transition-transform"
                            onClick={() => setFormData(p => ({ ...p, imagenes: p.imagenes.map((m, i) => ({ ...m, principal: i === idx })) }))}>
                            <Star className="w-3.5 h-3.5" /></button>
                          <button type="button" className="p-1.5 bg-rose-500 text-white rounded shadow-sm hover:scale-110 transition-transform"
                            onClick={() => setFormData(p => ({ ...p, imagenes: p.imagenes.filter((_, i) => i !== idx) }))}>
                            <Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {img.principal && <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Principal</div>}
                      </div>
                    ))}
                  </div>
                  <input ref={inputFileRef} type="file" multiple accept="image/*" onChange={handleSeleccionarImagenes} className="hidden" />
                </div>
              </div>

            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
          <p className="text-xs text-slate-400">
            {atributos.filter(a => a.valor?.trim()).length > 0 && (
              <span className="text-purple-600 font-bold">
                {atributos.filter(a => a.valor?.trim()).length} atributo(s) sectorial(es) listos
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
              Cerrar
            </button>
            <button type="submit" form="producto-form" disabled={guardando}
              aria-disabled={guardando}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
              {guardando
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando...</>
                : <><CheckCircle2 className="w-4 h-4" /> Confirmar y Guardar</>
              }
            </button>
          </div>
        </div>
      </div>

      {modalUnidad && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
          onClick={() => !guardandoUnidad && setModalUnidad(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-500" /> Nueva unidad de medida
              </h3>
              <button onClick={() => setModalUnidad(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input autoFocus value={nuevaUnidad.nombre}
                  onChange={e => setNuevaUnidad(u => ({ ...u, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearUnidadRapida(); }}
                  placeholder="Ej. Pieza, Kilogramo…"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Abreviatura</label>
                  <input value={nuevaUnidad.abreviatura}
                    onChange={e => setNuevaUnidad(u => ({ ...u, abreviatura: e.target.value }))}
                    placeholder="pza, kg…" maxLength={10}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Clave SAT</label>
                  <input value={nuevaUnidad.claveSAT}
                    onChange={e => setNuevaUnidad(u => ({ ...u, claveSAT: e.target.value.toUpperCase() }))}
                    placeholder="H87…" maxLength={10}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setModalUnidad(false)} disabled={guardandoUnidad}
                className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={crearUnidadRapida} disabled={guardandoUnidad}
                className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                {guardandoUnidad ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {guardandoUnidad ? 'Creando…' : 'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
