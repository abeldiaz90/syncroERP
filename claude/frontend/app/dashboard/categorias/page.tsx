"use client";
/**
 * ============================================================================
 * Productos → Categorías · el catálogo
 * ----------------------------------------------------------------------------
 * Esta pantalla y la de Finanzas → Categorías contables eran la misma: las dos
 * listaban las categorías y las dos abrían el mismo modal para asignarles sus
 * cinco cuentas contables. Como ésta cuelga del módulo de Inventario, que el
 * almacenista tiene completo, el resultado era que quien acomoda la mercancía
 * podía cambiar a qué cuenta se va el costo de toda una familia de productos.
 * No se nota en el almacén: se nota en el cierre, cuando la balanza ya no
 * cuadra y nadie sabe desde cuándo.
 *
 * Así que se repartió el trabajo como lo reparte cualquier ERP serio:
 *
 *  · Aquí —catálogo— se crea, se renombra, se cuelga de un padre y se da de
 *    baja una categoría. Es trabajo de quien administra el catálogo.
 *  · En Finanzas → Categorías contables se decide a qué cuenta va cada una.
 *    Es trabajo de quien responde por los estados financieros.
 *
 * El estado contable sí se ve desde aquí, en sólo lectura: quien administra el
 * catálogo necesita saber que una categoría nueva todavía no contabiliza, para
 * pedir que la configuren. Ver no es poder cambiar.
 * ============================================================================
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Tags, Edit2, CheckCircle2, AlertCircle, X, Save, Info, Plus,
  Power, ExternalLink,
} from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

interface ICategoria {
  id: string; nombre: string; descripcion: string; activo: boolean;
  categoriaPadreId: string | null;
  cuentaVentasId: string | null;
  cuentaCostoVentasId: string | null;
  cuentaInventarioId: string | null;
  cuentaDevolucionesId: string | null;
  cuentaMermasId: string | null;
}

const CAMPOS_CUENTAS = [
  'cuentaVentasId',
  'cuentaCostoVentasId',
  'cuentaInventarioId',
  'cuentaDevolucionesId',
  'cuentaMermasId',
] as const;

const FORM_VACIO = { nombre: '', descripcion: '', categoriaPadreId: '' };

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<ICategoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  /** `null` = cerrado · `'nueva'` = alta · una categoría = edición. */
  const [modal, setModal] = useState<ICategoria | 'nueva' | null>(null);
  const [form, setForm] = useState(FORM_VACIO);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000);
  };

  const cargar = async () => {
    setCargando(true);
    const res = await fetch(`${api}/catalogo/categorias`, {
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) setCategorias(await res.json());
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const abrirNueva = () => { setForm(FORM_VACIO); setModal('nueva'); };
  const abrirEdicion = (cat: ICategoria) => {
    setForm({
      nombre: cat.nombre ?? '',
      descripcion: cat.descripcion ?? '',
      categoriaPadreId: cat.categoriaPadreId ?? '',
    });
    setModal(cat);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { mostrarToast('El nombre es obligatorio', false); return; }
    const esNueva = modal === 'nueva';
    setGuardando(true);
    /*
     * El cuerpo lleva sólo lo del catálogo. Las cuentas contables ya no se
     * aceptan en esta ruta: el servidor las rechaza con un mensaje claro en
     * vez de guardarlas a medias.
     */
    const cuerpo = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoriaPadreId: form.categoriaPadreId || null,
    };
    const res = await fetch(
      esNueva ? `${api}/catalogo/categorias` : `${api}/catalogo/categorias/${(modal as ICategoria).id}`,
      {
        method: esNueva ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(cuerpo),
      },
    );
    setGuardando(false);
    if (res.ok) {
      mostrarToast(esNueva ? 'Categoría creada' : 'Categoría actualizada');
      setModal(null);
      cargar();
    } else {
      const e = await res.json().catch(() => ({}));
      mostrarToast(Array.isArray(e.message) ? e.message[0] : e.message ?? 'No se pudo guardar', false);
    }
  };

  const alternarEstado = async (cat: ICategoria) => {
    const res = await fetch(`${api}/catalogo/categorias/${cat.id}/estado`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) { mostrarToast(cat.activo ? 'Categoría desactivada' : 'Categoría activada'); cargar(); }
    else { const e = await res.json().catch(() => ({})); mostrarToast(e.message ?? 'No se pudo cambiar el estado', false); }
  };

  const contarAsignadas = (cat: ICategoria) =>
    CAMPOS_CUENTAS.filter(k => cat[k]).length;

  const nombrePadre = (id: string | null) =>
    id ? (categorias.find(c => c.id === id)?.nombre ?? '—') : null;

  const sinContabilidad = categorias.filter(c => contarAsignadas(c) < 5).length;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Tags className="w-8 h-8 text-teal-600" /> Categorías de productos
          </h1>
          <p className="text-slate-500 mt-1.5 max-w-2xl">
            Cómo se agrupa el catálogo. De la categoría dependen el árbol de productos, los reportes por
            familia y —desde Finanzas— las cuentas contables con las que se registra cada movimiento.
          </p>
        </div>
        <PuedeCrear ruta="/api/catalogo/categorias">
          <button onClick={abrirNueva}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 shadow-md transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Nueva categoría
          </button>
        </PuedeCrear>
      </div>

      {!cargando && sinContabilidad > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <span className="font-bold">
              {sinContabilidad} {sinContabilidad === 1 ? 'categoría' : 'categorías'} sin contabilidad completa.
            </span>{' '}
            Lo que se venda o se dé de baja en ellas no llega a la contabilidad. Quien lleva la contabilidad lo
            resuelve en{' '}
            <Link href="/dashboard/finanzas/categorias-contables" className="font-semibold underline underline-offset-2 inline-flex items-center gap-1">
              Finanzas → Categorías contables <ExternalLink className="w-3 h-3" />
            </Link>.
          </p>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600">
          <span className="font-bold">Las cuentas contables no se cambian aquí.</span> Se ven en sólo lectura,
          para saber qué falta. Asignarlas es trabajo de Contabilidad y se hace en su propia pantalla: de esas
          cinco cuentas depende dónde aterriza el costo de toda una familia de productos.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Cargando categorías…
          </div>
        ) : categorias.length === 0 ? (
          <div className="p-16 text-center">
            <Tags className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No hay categorías</p>
            <p className="text-sm text-slate-400 mt-1">Crea la primera con el botón «Nueva categoría»</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">Depende de</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Contabilidad</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categorias.map(cat => {
                const asignadas = contarAsignadas(cat);
                const completa = asignadas === 5;
                const parcial = asignadas > 0 && asignadas < 5;
                return (
                  <tr key={cat.id} className={`hover:bg-slate-50 transition-colors ${cat.activo ? '' : 'opacity-60'}`}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{cat.nombre}</p>
                      {cat.descripcion && <p className="text-xs text-slate-400 mt-0.5">{cat.descripcion}</p>}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-sm text-slate-500">
                      {nombrePadre(cat.categoriaPadreId) ?? <span className="text-slate-300">— nivel raíz —</span>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${
                        cat.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                   : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {cat.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {/* Sólo lectura: se informa, no se toca. */}
                      <Link
                        href="/dashboard/finanzas/categorias-contables"
                        title="Lo configura Contabilidad"
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition-colors ${
                          completa ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
                          parcial  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' :
                                     'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${completa ? 'bg-emerald-500' : parcial ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        {asignadas}/5 cuentas
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <PuedeEditar ruta="/api/catalogo/categorias/:id">
                          <button onClick={() => abrirEdicion(cat)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                          </button>
                        </PuedeEditar>
                        <PuedeEditar ruta="/api/catalogo/categorias/:id/estado">
                          <button onClick={() => alternarEstado(cat)}
                            title={cat.activo ? 'Desactivar' : 'Activar'}
                            className="inline-flex items-center p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <Power className="w-4 h-4" />
                          </button>
                        </PuedeEditar>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ ALTA Y EDICIÓN ══ */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Tags className="w-5 h-5 text-teal-600" />
                {modal === 'nueva' ? 'Nueva categoría' : modal.nombre}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. Electrónica, Farmacia, Ropa…"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Descripción corta (opcional)"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoría padre</label>
                <select
                  value={form.categoriaPadreId}
                  onChange={e => setForm(f => ({ ...f, categoriaPadreId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                >
                  <option value="">— Sin categoría padre (nivel raíz) —</option>
                  {categorias
                    .filter(c => modal === 'nueva' || c.id !== modal.id)
                    .map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              {modal === 'nueva' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-600">
                    <span className="font-bold">Después:</span> para que sus ventas y movimientos lleguen a la
                    contabilidad, Contabilidad debe asignarle sus cinco cuentas en Finanzas → Categorías
                    contables. Hasta entonces la categoría funciona, pero no contabiliza.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setModal(null)} className="px-5 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="px-5 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 shadow-sm transition-colors">
                {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {guardando ? 'Guardando…' : modal === 'nueva' ? 'Crear categoría' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
