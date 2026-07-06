"use client";
import { useState, useEffect } from 'react';
import { Tags, Edit2, CheckCircle2, AlertCircle, X, Save, Info, Plus } from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

interface ICuenta { id: string; numeroCuenta: string; nombre: string; tipo: string; }
interface ICategoria {
  id: string; nombre: string; descripcion: string; activo: boolean;
  categoriaPadreId: string | null;
  cuentaVentasId: string | null;       cuentaVentas?: ICuenta;
  cuentaCostoVentasId: string | null;  cuentaCostoVentas?: ICuenta;
  cuentaInventarioId: string | null;   cuentaInventario?: ICuenta;
  cuentaDevolucionesId: string | null; cuentaDevoluciones?: ICuenta;
  cuentaMermasId: string | null;       cuentaMermas?: ICuenta;
}

const CAMPOS_CUENTAS = [
  { key: 'cuentaVentasId',      label: 'Ingresos por Ventas',   desc: 'Se abona cada vez que se vende un producto de esta categoría.', color: 'emerald', ejemplo: 'Ej. 401-01 – Ventas Nacionales' },
  { key: 'cuentaCostoVentasId', label: 'Costo de Ventas',       desc: 'Se carga con el costo del producto al momento de la venta.',    color: 'rose',    ejemplo: 'Ej. 501-01 – Costo de Ventas' },
  { key: 'cuentaInventarioId',  label: 'Inventario',            desc: 'Refleja el valor del stock. Se abona al vender, se carga al comprar.', color: 'blue', ejemplo: 'Ej. 130-01 – Inventario de Mercancías' },
  { key: 'cuentaDevolucionesId',label: 'Devoluciones s/ Ventas',desc: 'Se carga cuando un cliente devuelve mercancía.',                color: 'amber',   ejemplo: 'Ej. 401-02 – Devoluciones' },
  { key: 'cuentaMermasId',      label: 'Mermas y Pérdidas',     desc: 'Se carga cuando hay pérdida de inventario (daño, vencimiento).', color: 'purple', ejemplo: 'Ej. 601-01 – Mermas y Pérdidas' },
] as const;

const colorMap: Record<string, string> = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  rose:    'bg-rose-50 border-rose-200 text-rose-800',
  blue:    'bg-blue-50 border-blue-200 text-blue-800',
  amber:   'bg-amber-50 border-amber-200 text-amber-800',
  purple:  'bg-purple-50 border-purple-200 text-purple-800',
};

const FORM_NUEVA_VACIO = { nombre: '', descripcion: '', categoriaPadreId: '' };

export default function CategoriasContablesPage() {
  const [categorias, setCategorias] = useState<ICategoria[]>([]);
  const [cuentas, setCuentas]       = useState<ICuenta[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [guardando, setGuardando]   = useState(false);

  // Modal editar cuentas
  const [modal, setModal]   = useState<ICategoria | null>(null);
  const [form, setForm]     = useState<Record<string, string>>({});

  // Modal nueva categoría
  const [modalNueva, setModalNueva]   = useState(false);
  const [formNueva, setFormNueva]     = useState(FORM_NUEVA_VACIO);
  const [guardandoNueva, setGuardandoNueva] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000);
  };

  const cargarTodo = async () => {
    setCargando(true);
    const h = { Authorization: `Bearer ${tok()}` };
    const [rCat, rCue] = await Promise.all([
      fetch(`${api}/catalogo/categorias`, { headers: h }),
      fetch(`${api}/finanzas/cuentas-contables?soloAfectables=true`, { headers: h }),
    ]);
    if (rCat.ok) setCategorias(await rCat.json());
    if (rCue.ok) setCuentas(await rCue.json());
    setCargando(false);
  };

  useEffect(() => { cargarTodo(); }, []);

  // ── Abrir modal editar ──────────────────────────────────────────
  const abrirModal = (cat: ICategoria) => {
    setModal(cat);
    setForm({
      cuentaVentasId:       cat.cuentaVentasId       ?? '',
      cuentaCostoVentasId:  cat.cuentaCostoVentasId  ?? '',
      cuentaInventarioId:   cat.cuentaInventarioId   ?? '',
      cuentaDevolucionesId: cat.cuentaDevolucionesId ?? '',
      cuentaMermasId:       cat.cuentaMermasId       ?? '',
    });
  };

  // ── Guardar cuentas de categoría ────────────────────────────────
  const guardar = async () => {
    if (!modal) return;
    setGuardando(true);
    const payload: Record<string, string | null> = {};
    CAMPOS_CUENTAS.forEach(c => { payload[c.key] = form[c.key] || null; });
    const res = await fetch(`${api}/catalogo/categorias/${modal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
      body: JSON.stringify(payload),
    });
    setGuardando(false);
    if (res.ok) { mostrarToast('Cuentas guardadas correctamente'); setModal(null); cargarTodo(); }
    else { const e = await res.json().catch(() => ({})); mostrarToast(e.message ?? 'Error al guardar', false); }
  };

  // ── Crear nueva categoría ───────────────────────────────────────
  const crearCategoria = async () => {
    if (!formNueva.nombre.trim()) { mostrarToast('El nombre es obligatorio', false); return; }
    setGuardandoNueva(true);
    const res = await fetch(`${api}/catalogo/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
      body: JSON.stringify({
        nombre:           formNueva.nombre.trim(),
        descripcion:      formNueva.descripcion.trim() || null,
        categoriaPadreId: formNueva.categoriaPadreId || null,
      }),
    });
    setGuardandoNueva(false);
    if (res.ok) {
      mostrarToast('Categoría creada correctamente');
      setModalNueva(false);
      setFormNueva(FORM_NUEVA_VACIO);
      cargarTodo();
    } else {
      const e = await res.json().catch(() => ({}));
      mostrarToast(Array.isArray(e.message) ? e.message[0] : e.message ?? 'Error al crear', false);
    }
  };

  const contarAsignadas = (cat: ICategoria) =>
    CAMPOS_CUENTAS.filter(c => cat[c.key as keyof ICategoria]).length;

  const nombreCuenta = (id: string) => {
    const c = cuentas.find(x => x.id === id);
    return c ? `${c.numeroCuenta} – ${c.nombre}` : '—';
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Tags className="w-8 h-8 text-indigo-500" /> Categorías — Cuentas Contables
          </h1>
          <p className="text-slate-500 mt-1.5 max-w-2xl">
            Crea y configura las categorías de productos con sus cuentas contables para que el sistema genere asientos automáticamente.
          </p>
        </div>
        <PuedeCrear ruta="/api/catalogo/categorias">
          <button onClick={() => { setFormNueva(FORM_NUEVA_VACIO); setModalNueva(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-md transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Nueva Categoría
          </button>
        </PuedeCrear>
      </div>

      {/* Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-800">
          <span className="font-bold">¿Por qué aquí?</span> Cada categoría puede usar cuentas diferentes. Si una categoría no tiene cuentas asignadas, las ventas de esa categoría no generan asiento contable.
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Cargando categorías...
          </div>
        ) : categorias.length === 0 ? (
          <div className="p-16 text-center">
            <Tags className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No hay categorías</p>
            <p className="text-sm text-slate-400 mt-1">Crea la primera con el botón "Nueva Categoría"</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-center">Cuentas</th>
                <th className="px-5 py-3 text-left hidden lg:table-cell">Cuenta de Ventas</th>
                <th className="px-5 py-3 text-left hidden lg:table-cell">Cuenta de Inventario</th>
                <th className="px-5 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categorias.map(cat => {
                const asignadas = contarAsignadas(cat);
                const completa  = asignadas === 5;
                const parcial   = asignadas > 0 && asignadas < 5;
                return (
                  <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{cat.nombre}</p>
                      {cat.descripcion && <p className="text-xs text-slate-400 mt-0.5">{cat.descripcion}</p>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${
                        completa ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        parcial  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                   'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${completa ? 'bg-emerald-500' : parcial ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        {asignadas}/5 cuentas
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-sm font-mono text-slate-600">
                        {cat.cuentaVentasId
                          ? nombreCuenta(cat.cuentaVentasId)
                          : <span className="text-rose-400 font-sans not-italic text-xs">Sin asignar</span>}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-sm font-mono text-slate-600">
                        {cat.cuentaInventarioId
                          ? nombreCuenta(cat.cuentaInventarioId)
                          : <span className="text-rose-400 font-sans not-italic text-xs">Sin asignar</span>}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <PuedeEditar ruta="/api/catalogo/categorias/:id">
                        <button onClick={() => abrirModal(cat)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                          <Edit2 className="w-3.5 h-3.5" /> Configurar
                        </button>
                      </PuedeEditar>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ MODAL NUEVA CATEGORÍA ══════════════════════════════════ */}
      {modalNueva && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-500" /> Nueva Categoría
              </h2>
              <button onClick={() => setModalNueva(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label>
                <input
                  type="text"
                  value={formNueva.nombre}
                  onChange={e => setFormNueva(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. Electrónica, Farmacia, Ropa..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción</label>
                <input
                  type="text"
                  value={formNueva.descripcion}
                  onChange={e => setFormNueva(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Descripción corta (opcional)"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoría padre</label>
                <select
                  value={formNueva.categoriaPadreId}
                  onChange={e => setFormNueva(f => ({ ...f, categoriaPadreId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <option value="">— Sin categoría padre (nivel raíz) —</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <span className="font-bold">Tip:</span> Después de crear la categoría, haz clic en "Configurar" para asignarle las cuentas contables.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setModalNueva(false)} className="px-5 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={crearCategoria} disabled={guardandoNueva}
                className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors">
                {guardandoNueva ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                {guardandoNueva ? 'Creando...' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONFIGURAR CUENTAS ═══════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Tags className="w-5 h-5 text-indigo-500" /> {modal.nombre}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">Asigna una cuenta contable para cada tipo de movimiento</p>
              </div>
              <button onClick={() => setModal(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {CAMPOS_CUENTAS.map(campo => (
                <div key={campo.key} className={`p-4 rounded-xl border ${colorMap[campo.color]}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-sm">{campo.label}</p>
                      <p className="text-xs mt-0.5 opacity-70">{campo.desc}</p>
                    </div>
                    {form[campo.key] && (
                      <span className="text-[10px] font-bold uppercase bg-white/60 px-2 py-0.5 rounded-full border border-current">asignada</span>
                    )}
                  </div>
                  <select
                    value={form[campo.key] ?? ''}
                    onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="">— Sin asignar —</option>
                    {cuentas.map(c => (
                      <option key={c.id} value={c.id}>{c.numeroCuenta} – {c.nombre}</option>
                    ))}
                  </select>
                  <p className="text-[10px] mt-1.5 opacity-60">{campo.ejemplo}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
              <p className="text-xs text-slate-400">{Object.values(form).filter(Boolean).length}/5 cuentas configuradas</p>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="px-5 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando}
                  className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors">
                  {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  {guardando ? 'Guardando...' : 'Guardar configuración'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
