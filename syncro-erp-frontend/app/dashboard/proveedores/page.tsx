"use client";

import { useState, useEffect } from 'react';
import {
  Search, Plus, Edit2, Power, X, Truck, AlertCircle, CheckCircle2,
  Building2, User, MapPin, CreditCard, Phone, Briefcase, FileText
} from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IProveedor {
  id: string; nombre: string; tipoPersona: 'FISICA' | 'MORAL';
  razonSocial: string; rfc: string; tipoProveedor: 'MERCANCIA' | 'SERVICIO' | 'AMBOS';
  contactoNombre: string; contactoTelefono: string; contactoEmail: string; contactoPuesto: string;
  telefono: string; email: string; sitioWeb: string; direccion: string;
  numeroExterior: string; numeroInterior: string; colonia: string; ciudad: string;
  paisId: string; estadoId: string; codigoPostal: string; bancoId: string;
  numeroCuenta: string; clabe: string; diasCredito: number; limiteCredito: number;
  metodoPago: string; formaPagoId: string; moneda: string; notas: string; activo: boolean;
}
export interface ICatalogoItem { id: string; nombre: string; }
export interface IProveedorFormData extends Omit<IProveedor, 'id' | 'activo'> {}

const FORM_VACIO: IProveedorFormData = {
  nombre: '', tipoPersona: 'MORAL', razonSocial: '', rfc: '',
  tipoProveedor: 'MERCANCIA', contactoNombre: '', contactoTelefono: '',
  contactoEmail: '', contactoPuesto: '', telefono: '', email: '',
  sitioWeb: '', direccion: '', numeroExterior: '', numeroInterior: '',
  colonia: '', ciudad: '', paisId: '', estadoId: '', codigoPostal: '',
  bancoId: '', numeroCuenta: '', clabe: '', diasCredito: 0,
  limiteCredito: 0, metodoPago: 'PUE', formaPagoId: '', moneda: 'MXN', notas: '',
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<IProveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [paises, setPaises] = useState<ICatalogoItem[]>([]);
  const [estados, setEstados] = useState<ICatalogoItem[]>([]);
  const [bancos, setBancos] = useState<ICatalogoItem[]>([]);
  const [formasPago, setFormasPago] = useState<ICatalogoItem[]>([]);
  const [formData, setFormData] = useState<IProveedorFormData>(FORM_VACIO);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const fetchProveedores = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const params = new URLSearchParams();
      if (busquedaDebounced) params.append('filtro', busquedaDebounced);
      params.append('activos', mostrarInactivos ? 'false' : 'true');
      const res = await fetch(`${apiUrl}/proveedores?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setProveedores(await res.json());
      else mostrarToast('Error al cargar la lista de proveedores', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setCargando(false); }
  };

  const fetchCatalogos = async () => {
    const token = localStorage.getItem('syncro_token');
    try {
      const [resPaises, resBancos, resFormas] = await Promise.all([
        fetch(`${apiUrl}/catalogos/paises`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/catalogos/bancos`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/catalogos/formas-pago`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resPaises.ok) setPaises(await resPaises.json());
      if (resBancos.ok) setBancos(await resBancos.json());
      if (resFormas.ok) setFormasPago(await resFormas.json());
    } catch { console.error('Error al cargar catálogos'); }
  };

  useEffect(() => { fetchProveedores(); }, [busquedaDebounced, mostrarInactivos]);
  useEffect(() => { fetchCatalogos(); }, []);

  useEffect(() => {
    if (!formData.paisId) { setEstados([]); return; }
    const token = localStorage.getItem('syncro_token');
    fetch(`${apiUrl}/catalogos/estados?paisId=${formData.paisId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setEstados)
      .catch(() => setEstados([]));
  }, [formData.paisId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'limiteCredito' || name === 'diasCredito' ? Number(value) : value }));
  };

  const abrirModalCrear = () => { setEditandoId(null); setFormData(FORM_VACIO); setIsModalOpen(true); };
  const abrirModalEditar = (prov: IProveedor) => {
    setEditandoId(prov.id);
    setFormData({ ...prov, nombre: prov.nombre || '', tipoPersona: prov.tipoPersona || 'MORAL', tipoProveedor: prov.tipoProveedor || 'MERCANCIA', metodoPago: prov.metodoPago || 'PUE', moneda: prov.moneda || 'MXN', paisId: prov.paisId || '', estadoId: prov.estadoId || '', bancoId: prov.bancoId || '', formaPagoId: prov.formaPagoId || '' });
    setIsModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) { mostrarToast('El nombre del proveedor es obligatorio.', 'info'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = editandoId ? `${apiUrl}/proveedores/${editandoId}` : `${apiUrl}/proveedores`;
    try {
      const res = await fetch(url, {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData, diasCredito: Number(formData.diasCredito), limiteCredito: Number(formData.limiteCredito), paisId: formData.paisId || null, estadoId: formData.estadoId || null, bancoId: formData.bancoId || null, formaPagoId: formData.formaPagoId || null }),
      });
      if (res.ok) {
        setIsModalOpen(false); fetchProveedores();
        mostrarToast(editandoId ? 'Proveedor actualizado exitosamente.' : 'Proveedor creado exitosamente.', 'exito');
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Error al guardar'}`, 'error');
      }
    } catch { mostrarToast('Error de conexión al intentar guardar.', 'error'); }
    finally { setGuardando(false); }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!window.confirm(`¿${activo ? 'Desactivar' : 'Activar'} este proveedor?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/proveedores/${id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { fetchProveedores(); mostrarToast(`Proveedor ${activo ? 'desactivado' : 'activado'} correctamente.`, 'exito'); }
      else mostrarToast('Error al cambiar el estado del proveedor', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
  };

  const getBadgeTipo = (tipo: string) => {
    switch (tipo) {
      case 'MERCANCIA': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'SERVICIO': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'AMBOS': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}
          {toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Truck className="w-8 h-8 text-indigo-500" /> Directorio de Proveedores
          </h1>
          <p className="text-slate-500 mt-1">Gestiona los suministradores de mercancías y prestadores de servicios.</p>
        </div>
        {/* ✅ Solo aparece si tiene POST /api/proveedores */}
        <PuedeCrear ruta="/api/proveedores">
          <button onClick={abrirModalCrear} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Nuevo Proveedor
          </button>
        </PuedeCrear>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Buscar por nombre, RFC, razón social..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" />
        </div>
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
            <div className={`block w-10 h-6 rounded-full transition-colors ${mostrarInactivos ? 'bg-indigo-500' : 'bg-slate-300'}`} />
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${mostrarInactivos ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Mostrar inactivos</span>
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center flex flex-col items-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
            Cargando proveedores...
          </div>
        ) : proveedores.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-700">No se encontraron proveedores</p>
            <p className="text-sm">Ajusta tu búsqueda o registra el primero.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Proveedor</th>
                  <th className="p-4 font-semibold hidden sm:table-cell">Contacto</th>
                  <th className="p-4 font-semibold text-center">Clasificación</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proveedores.map((prov) => (
                  <tr key={prov.id} className={`hover:bg-slate-50 transition-colors ${!prov.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm ${prov.tipoPersona === 'MORAL' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {prov.tipoPersona === 'MORAL' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{prov.nombre}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{prov.rfc || 'Sin RFC'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <p className="font-medium text-slate-800 text-sm">{prov.contactoNombre || 'N/A'}</p>
                      <p className="text-xs text-slate-500">{prov.email || prov.contactoEmail || 'Sin email'}</p>
                      <p className="text-xs text-slate-500">{prov.telefono || prov.contactoTelefono || 'Sin teléfono'}</p>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${getBadgeTipo(prov.tipoProveedor)}`}>
                        {prov.tipoProveedor}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${prov.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${prov.activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {prov.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center items-center gap-2">
                        {/* ✅ Solo aparece si tiene PATCH /api/proveedores/:id */}
                        <PuedeEditar ruta="/api/proveedores/:id">
                          <button onClick={() => abrirModalEditar(prov)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </PuedeEditar>
                        {/* ✅ Solo aparece si tiene PATCH /api/proveedores/:id/estado */}
                        <PuedeEditar ruta="/api/proveedores/:id/estado">
                          <button onClick={() => handleCambiarEstado(prov.id, prov.activo)} className={`p-2 rounded-lg transition-colors ${prov.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={prov.activo ? 'Desactivar' : 'Activar'}>
                            <Power className="w-4 h-4" />
                          </button>
                        </PuedeEditar>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-full overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white sticky top-0 z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-500" /> {editandoId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              <form id="proveedor-form" onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">

                {/* Datos Generales */}
                <div className="col-span-full">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <Briefcase className="w-4 h-4" /> Datos Generales
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre Comercial *</label><input required name="nombre" value={formData.nombre} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Razón Social</label><input name="razonSocial" value={formData.razonSocial} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">RFC</label><input name="rfc" value={formData.rfc} onChange={handleChange} className={`${inputClass} uppercase font-mono`} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo de Persona</label><select name="tipoPersona" value={formData.tipoPersona} onChange={handleChange} className={inputClass}><option value="FISICA">Persona Física</option><option value="MORAL">Persona Moral</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Categoría</label><select name="tipoProveedor" value={formData.tipoProveedor} onChange={handleChange} className={inputClass}><option value="MERCANCIA">Mercancía / Insumos</option><option value="SERVICIO">Prestación de Servicios</option><option value="AMBOS">Ambos</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sitio Web</label><input name="sitioWeb" value={formData.sitioWeb} onChange={handleChange} placeholder="www.ejemplo.com" className={inputClass} /></div>

                {/* Dirección */}
                <div className="col-span-full mt-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <MapPin className="w-4 h-4" /> Dirección Fiscal
                  </h3>
                </div>
                <div className="xl:col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Calle / Avenida</label><input name="direccion" value={formData.direccion} onChange={handleChange} className={inputClass} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">No. Ext.</label><input name="numeroExterior" value={formData.numeroExterior} onChange={handleChange} className={inputClass} /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">No. Int.</label><input name="numeroInterior" value={formData.numeroInterior} onChange={handleChange} className={inputClass} /></div>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Colonia</label><input name="colonia" value={formData.colonia} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Código Postal</label><input name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ciudad / Municipio</label><input name="ciudad" value={formData.ciudad} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">País</label><select name="paisId" value={formData.paisId} onChange={handleChange} className={inputClass}><option value="">Seleccione país</option>{paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Estado</label><select name="estadoId" value={formData.estadoId} onChange={handleChange} disabled={!formData.paisId} className={`${inputClass} disabled:bg-slate-100`}><option value="">Seleccione estado</option>{estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>

                {/* Contacto */}
                <div className="col-span-full mt-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <User className="w-4 h-4" /> Contacto Principal
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre del Contacto</label><input name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Puesto</label><input name="contactoPuesto" value={formData.contactoPuesto} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono Directo</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} className={`${inputClass} pl-9`} /></div></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email del Contacto</label><input type="email" name="contactoEmail" value={formData.contactoEmail} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono Empresa</label><input name="telefono" value={formData.telefono} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email Empresa</label><input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClass} /></div>

                {/* Financiero */}
                <div className="col-span-full mt-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <CreditCard className="w-4 h-4" /> Datos Bancarios y Comerciales
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Banco</label><select name="bancoId" value={formData.bancoId} onChange={handleChange} className={inputClass}><option value="">Seleccione banco</option>{bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Número de Cuenta</label><input name="numeroCuenta" value={formData.numeroCuenta} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CLABE Interbancaria</label><input name="clabe" value={formData.clabe} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Método de Pago</label><select name="metodoPago" value={formData.metodoPago} onChange={handleChange} className={inputClass}><option value="PUE">PUE - Una sola exhibición</option><option value="PPD">PPD - Parcialidades o diferido</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Forma de Pago</label><select name="formaPagoId" value={formData.formaPagoId} onChange={handleChange} className={inputClass}><option value="">Seleccione forma</option>{formasPago.map(fp => <option key={fp.id} value={fp.id}>{fp.nombre}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Moneda</label><select name="moneda" value={formData.moneda} onChange={handleChange} className={inputClass}><option value="MXN">MXN - Peso Mexicano</option><option value="USD">USD - Dólar</option><option value="EUR">EUR - Euro</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Límite de Crédito</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span><input type="number" step="0.01" min="0" name="limiteCredito" value={formData.limiteCredito === 0 ? '' : formData.limiteCredito} onChange={handleChange} className={`${inputClass} pl-8`} placeholder="0.00" /></div></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Días de Crédito</label><input type="number" min="0" name="diasCredito" value={formData.diasCredito === 0 ? '' : formData.diasCredito} onChange={handleChange} className={inputClass} placeholder="Ej. 30" /></div>

                <div className="col-span-full mt-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Notas Internas</label>
                  <textarea name="notas" value={formData.notas} onChange={handleChange} className={`${inputClass} resize-none`} rows={3} placeholder="Condiciones especiales, horarios de recepción..." />
                </div>
              </form>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 sticky bottom-0 rounded-b-2xl">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors" disabled={guardando}>Cancelar</button>
              <button type="submit" form="proveedor-form" disabled={guardando} className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {guardando ? 'Guardando...' : 'Guardar Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
