"use client";

import FormValidationGuard from "@/app/components/FormValidationGuard";
import { useState, useEffect } from 'react';
import { confirmarElegante } from '@/components/ui/dialogos';
import { Layers, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { PuedeCrear, PuedeEditar, PuedeEliminar } from "@/app/components/ProtectedElement"; // ← NUEVO

interface IListaPrecio {
  id: string;
  nombre: string;
  esPorDefecto: boolean;
  modo?: 'MANUAL' | 'MARGEN';
  margenPorcentaje?: number;
  redondeo?: number;
}

export default function ListasPrecioPage() {
  const [listas, setListas] = useState<IListaPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [esPorDefecto, setEsPorDefecto] = useState(false);
  /*
   * De dónde sale el precio de esta lista. El precio de venta ya no tiene por
   * qué teclearse artículo por artículo: puede salir del costo de reposición,
   * que cada recepción de compra actualiza sola. Así una subida del proveedor
   * llega al precio de venta en la siguiente entrada, en vez de esperar a que
   * alguien se acuerde de retocar la lista —que es como se acaba vendiendo por
   * debajo del costo sin que nadie lo note.
   */
  const [modo, setModo] = useState<'MANUAL' | 'MARGEN'>('MANUAL');
  const [margen, setMargen] = useState('');
  const [redondeo, setRedondeo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nombreTocado, setNombreTocado] = useState(false);
  const errorNombre = !nombre.trim() ? 'El nombre de la lista es obligatorio' : nombre.trim().length < 3 ? 'Captura al menos 3 caracteres' : '';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' } | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchListas = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/listas-precio`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setListas(await res.json());
    } catch { mostrarToast('Error al cargar las listas', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchListas(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNombreTocado(true);
    if (errorNombre) { mostrarToast(errorNombre, 'error'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = editandoId ? `${apiUrl}/catalogo/listas-precio/${editandoId}` : `${apiUrl}/catalogo/listas-precio`;
    try {
      const res = await fetch(url, {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: nombre.trim(),
          esPorDefecto,
          modo,
          margenPorcentaje: modo === 'MARGEN' ? Number(margen || 0) : 0,
          redondeo: modo === 'MARGEN' ? Number(redondeo || 0) : 0,
        })
      });
      if (res.ok) {
        mostrarToast(editandoId ? 'Lista actualizada' : 'Lista creada', 'exito');
        setNombre(''); setEsPorDefecto(false); setEditandoId(null); setNombreTocado(false);
        fetchListas();
      } else { const err = await res.json(); mostrarToast(err.message || 'Error al guardar', 'error'); }
    } finally { setGuardando(false); }
  };

  const handleEditar = (lista: IListaPrecio) => {
    setEditandoId(lista.id);
    setNombre(lista.nombre);
    setEsPorDefecto(lista.esPorDefecto);
    setModo(lista.modo ?? 'MANUAL');
    setMargen(lista.margenPorcentaje ? String(lista.margenPorcentaje) : '');
    setRedondeo(lista.redondeo ? String(lista.redondeo) : '');
    setNombreTocado(false);
  };

  const handleEliminar = async (id: string) => {
    if (!await confirmarElegante('¿Seguro que deseas eliminar esta lista? Los productos perderán este precio.', { peligroso: true })) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/listas-precio/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { mostrarToast('Lista eliminada', 'exito'); fetchListas(); }
    } catch { mostrarToast('Error al eliminar', 'error'); }
  };

  const cancelarEdicion = () => { setEditandoId(null); setNombre(''); setEsPorDefecto(false); setModo('MANUAL'); setMargen(''); setRedondeo(''); setNombreTocado(false); };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 animate-in fade-in duration-500">
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] px-6 py-4 rounded-xl shadow-2xl font-bold text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.mensaje}
        </div>
      )}

      <header className="bg-white px-6 py-5 border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 leading-tight">Configuración de Listas de Precio</h1>
            <p className="text-sm font-medium text-slate-500 mt-0.5">Administra los tabuladores de venta de tu catálogo</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 flex items-start justify-center">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* COLUMNA: FORMULARIO */}
          <div className="md:col-span-1">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm sticky top-6">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                {editandoId ? 'Editar Tabulador' : 'Nuevo Tabulador'}
              </h2>

              <form id="lista-precio-form" noValidate onSubmit={handleSubmit} className="space-y-4">
                <FormValidationGuard formId="lista-precio-form" />
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre de la Lista *</label>
                  <input
                    required type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => setNombreTocado(true)} aria-invalid={Boolean(nombreTocado && errorNombre)}
                    placeholder="Ej. Público General, VIP..."
                    className={`w-full px-3 py-2 text-sm bg-slate-50 border rounded-md focus:outline-none focus:ring-2 font-medium text-slate-800 ${nombreTocado && errorNombre ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-emerald-500'}`}
                  />
                  {nombreTocado && errorNombre && <p className="mt-1 text-xs font-semibold text-rose-600">{errorNombre}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    De dónde sale el precio
                  </label>
                  <div className="space-y-2">
                    <label className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${modo === 'MANUAL' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                      <input type="radio" name="modo" checked={modo === 'MANUAL'} onChange={() => setModo('MANUAL')} className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                      <div>
                        <span className="block text-sm font-semibold text-slate-800">Lo captura Ventas</span>
                        <span className="block text-xs text-slate-500">Un precio tecleado para cada artículo.</span>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${modo === 'MARGEN' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                      <input type="radio" name="modo" checked={modo === 'MARGEN'} onChange={() => setModo('MARGEN')} className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                      <div>
                        <span className="block text-sm font-semibold text-slate-800">Se calcula desde el costo</span>
                        <span className="block text-xs text-slate-500">
                          Costo de la última compra más el margen. Se actualiza solo con cada recepción.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {modo === 'MARGEN' && (
                  <div className="grid grid-cols-2 gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Margen %</label>
                      <input type="number" min="0" step="0.01" value={margen} onChange={(e) => setMargen(e.target.value)}
                        placeholder="35"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Redondear a</label>
                      <input type="number" min="0" step="0.01" value={redondeo} onChange={(e) => setRedondeo(e.target.value)}
                        placeholder="0.50"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800" />
                    </div>
                    <p className="col-span-2 text-[11px] leading-relaxed text-slate-600">
                      {Number(margen) > 0 ? (
                        <>Un artículo que costó $100 se venderá en{' '}
                          <strong>
                            ${(() => {
                              const bruto = 100 * (1 + Number(margen) / 100);
                              const paso = Number(redondeo || 0);
                              return (paso > 0 ? Math.ceil(bruto / paso) * paso : bruto).toFixed(2);
                            })()}
                          </strong>. Un precio tecleado a mano para un artículo concreto gana sobre esta regla.</>
                      ) : (
                        <>Captura el margen. Con margen cero venderías exactamente a lo que te costó.</>
                      )}
                    </p>
                  </div>
                )}

                <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md cursor-pointer hover:bg-emerald-50 transition-colors">
                  <input type="checkbox" checked={esPorDefecto} onChange={(e) => setEsPorDefecto(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  <div>
                    <span className="block text-sm font-semibold text-slate-800">Lista por Defecto</span>
                    <span className="block text-xs text-slate-500">Se usará como el precio base en el catálogo y Punto de Venta.</span>
                  </div>
                </label>

                <div className="pt-2 flex gap-2">
                  {editandoId && (
                    <button type="button" onClick={cancelarEdicion} className="flex-1 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-md hover:bg-slate-200 transition-colors">
                      Cancelar
                    </button>
                  )}
                  {/* ✅ Crear: POST /api/catalogo/listas-precio | Editar: PATCH /api/catalogo/listas-precio/:id */}
                  {editandoId ? (
                    <PuedeEditar ruta="/api/catalogo/listas-precio/:id">
                      <button type="submit" disabled={guardando} className="flex-1 py-2 bg-emerald-600 text-white text-sm font-bold rounded-md shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Actualizar
                      </button>
                    </PuedeEditar>
                  ) : (
                    <PuedeCrear ruta="/api/catalogo/listas-precio">
                      <button type="submit" disabled={guardando} className="flex-1 py-2 bg-emerald-600 text-white text-sm font-bold rounded-md shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear Lista
                      </button>
                    </PuedeCrear>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* COLUMNA: TABLA */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">Listas Registradas ({listas.length})</h3>
              </div>

              {cargando ? (
                <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
              ) : listas.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center">
                  <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-600">No hay listas creadas.</p>
                  <p className="text-xs text-slate-400 mt-1">Crea tu primer tabulador de precios (Ej. Público General).</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black border-b border-slate-200">
                      <th className="px-5 py-3">Nombre del Tabulador</th>
                      <th className="px-5 py-3">Precio</th>
                      <th className="px-5 py-3 text-center">Estado</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium">
                    {listas.map((lista) => (
                      <tr key={lista.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-800">{lista.nombre}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {lista.modo === 'MARGEN' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">
                              costo + {Number(lista.margenPorcentaje ?? 0)}%
                              {Number(lista.redondeo) > 0 && <> · a {Number(lista.redondeo)}</>}
                            </span>
                          ) : (
                            <span className="text-slate-400">capturado</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {lista.esPorDefecto ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Por Defecto
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {/* ✅ Solo aparece si tiene PATCH /api/catalogo/listas-precio/:id */}
                            <PuedeEditar ruta="/api/catalogo/listas-precio/:id">
                              <button onClick={() => handleEditar(lista)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </PuedeEditar>
                            {/* ✅ Solo aparece si tiene DELETE /api/catalogo/listas-precio/:id */}
                            <PuedeEliminar ruta="/api/catalogo/listas-precio/:id">
                              <button onClick={() => handleEliminar(lista.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </PuedeEliminar>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
