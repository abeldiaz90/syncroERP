"use client";

import { useState, useEffect } from 'react';
import { confirmarElegante, solicitarTexto } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';
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
  estadoHomologacion?: 'EN_EVALUACION' | 'APROBADO' | 'CONDICIONADO' | 'BLOQUEADO';
  nivelRiesgo?: 'BAJO' | 'MEDIO' | 'ALTO';
}
export interface ICatalogoItem { id: string; nombre: string; clave?: string; }
export interface IProveedorFormData extends Omit<IProveedor, 'id' | 'activo' | 'estadoHomologacion' | 'nivelRiesgo'> {}

type CampoProveedor = keyof IProveedorFormData;
type ErroresProveedor = Partial<Record<CampoProveedor, string>>;

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
  const [errores, setErrores] = useState<ErroresProveedor>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

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

  const resolverHomologacion = async (
    proveedor: IProveedor,
    estado: 'APROBADO' | 'CONDICIONADO' | 'BLOQUEADO',
  ) => {
    let comentario: string | null = null;
    if (estado === 'APROBADO') {
      if (!await confirmarElegante(
        `¿Homologar a ${proveedor.nombre} como proveedor aprobado?`,
        { titulo: 'Aprobar proveedor' },
      )) return;
    } else {
      comentario = await solicitarTexto(
        `Documenta las condiciones o el motivo del bloqueo de ${proveedor.nombre}.`,
        { titulo: estado === 'CONDICIONADO' ? 'Aprobación condicionada' : 'Bloquear proveedor', obligatorio: true },
      );
      if (comentario === null) return;
    }
    const token = localStorage.getItem('syncro_token');
    const res = await fetch(`${apiUrl}/proveedores/${proveedor.id}/homologacion`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado,
        nivelRiesgo: estado === 'APROBADO' ? 'BAJO' : estado === 'CONDICIONADO' ? 'MEDIO' : 'ALTO',
        comentario,
      }),
    }).catch(() => null);
    if (res?.ok) {
      mostrarToast('Homologación actualizada correctamente', 'exito');
      fetchProveedores();
    } else {
      const data = await res?.json().catch(() => null);
      mostrarToast(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'No fue posible resolver la homologación', 'error');
    }
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
    const campo = name as CampoProveedor;
    setFormData(prev => ({ ...prev, [name]: name === 'limiteCredito' || name === 'diasCredito' ? Number(value) : value }));
    setErrores(prev => {
      if (!prev[campo]) return prev;
      const siguiente = { ...prev };
      delete siguiente[campo];
      return siguiente;
    });
    setErrorGeneral(null);
  };

  const claseCampo = (campo: CampoProveedor, extra = '') =>
    `${inputClass} ${errores[campo] ? 'border-rose-500 bg-rose-50/40 focus:ring-rose-500' : ''} ${extra}`;

  const ErrorCampo = ({ campo }: { campo: CampoProveedor }) =>
    errores[campo] ? <p className="mt-1 text-xs font-medium text-rose-600">{errores[campo]}</p> : null;

  const validarFormulario = (): ErroresProveedor => {
    const e: ErroresProveedor = {};
    const texto = (v: unknown) => String(v ?? '').trim();
    const rfc = texto(formData.rfc).toUpperCase();
    const email = texto(formData.email);
    const emailContacto = texto(formData.contactoEmail);
    const telefono = texto(formData.telefono);
    const telefonoContacto = texto(formData.contactoTelefono);
    const clabe = texto(formData.clabe).replace(/\s/g, '');
    const cuenta = texto(formData.numeroCuenta).replace(/\s/g, '');

    if (texto(formData.nombre).length < 2) e.nombre = 'Captura el nombre comercial (mínimo 2 caracteres).';
    if (!texto(formData.razonSocial)) e.razonSocial = formData.tipoPersona === 'FISICA' ? 'Captura el nombre fiscal completo.' : 'Captura la razón social.';
    if (!rfc) e.rfc = 'El RFC es obligatorio.';
    else if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) e.rfc = 'El RFC no tiene un formato válido.';
    if (!formData.tipoPersona) e.tipoPersona = 'Selecciona el tipo de persona.';
    if (!formData.tipoProveedor) e.tipoProveedor = 'Selecciona la categoría del proveedor.';
    if (!formData.paisId) e.paisId = 'Selecciona el país.';
    if (!formData.estadoId) e.estadoId = 'Selecciona el estado.';
    if (!texto(formData.codigoPostal)) e.codigoPostal = 'El código postal es obligatorio.';
    else if (!/^\d{5}$/.test(texto(formData.codigoPostal))) e.codigoPostal = 'El código postal debe tener 5 dígitos.';
    if (!texto(formData.contactoNombre)) e.contactoNombre = 'Captura el nombre del contacto principal.';
    if (!telefono && !telefonoContacto) {
      e.telefono = 'Captura el teléfono de la empresa o el teléfono directo.';
      e.contactoTelefono = 'Captura al menos un teléfono.';
    }
    if (telefono && !/^[0-9+()\-\s]{10,20}$/.test(telefono)) e.telefono = 'Captura un teléfono válido.';
    if (telefonoContacto && !/^[0-9+()\-\s]{10,20}$/.test(telefonoContacto)) e.contactoTelefono = 'Captura un teléfono válido.';
    if (!email && !emailContacto) {
      e.email = 'Captura el email de la empresa o del contacto.';
      e.contactoEmail = 'Captura al menos un correo electrónico.';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'El correo electrónico no es válido.';
    if (emailContacto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContacto)) e.contactoEmail = 'El correo electrónico no es válido.';
    if (clabe && !/^\d{18}$/.test(clabe)) e.clabe = 'La CLABE debe contener exactamente 18 dígitos.';
    if (cuenta && !/^\d{4,20}$/.test(cuenta)) e.numeroCuenta = 'La cuenta debe contener entre 4 y 20 dígitos.';
    if (formData.metodoPago === 'PPD' && Number(formData.diasCredito) <= 0) e.diasCredito = 'Para PPD debes indicar días de crédito mayores a cero.';
    if (Number(formData.diasCredito) < 0) e.diasCredito = 'Los días de crédito no pueden ser negativos.';
    if (Number(formData.limiteCredito) < 0) e.limiteCredito = 'El límite de crédito no puede ser negativo.';
    if (!formData.moneda) e.moneda = 'Selecciona la moneda.';
    if (!formData.metodoPago) e.metodoPago = 'Selecciona el método de pago.';
    return e;
  };

  const enfocarPrimerError = (e: ErroresProveedor) => {
    const primerCampo = Object.keys(e)[0];
    if (!primerCampo) return;
    requestAnimationFrame(() => {
      const elemento = document.querySelector<HTMLElement>(`#proveedor-form [name=\"${primerCampo}\"]`);
      elemento?.focus();
      elemento?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const abrirModalCrear = () => { setEditandoId(null); setFormData(FORM_VACIO); setErrores({}); setErrorGeneral(null); setIsModalOpen(true); };
  const abrirModalEditar = (prov: IProveedor) => {
    setEditandoId(prov.id);
    setFormData({ ...prov, nombre: prov.nombre || '', tipoPersona: prov.tipoPersona || 'MORAL', tipoProveedor: prov.tipoProveedor || 'MERCANCIA', metodoPago: prov.metodoPago || 'PUE', moneda: prov.moneda || 'MXN', paisId: prov.paisId || '', estadoId: prov.estadoId || '', bancoId: prov.bancoId || '', formaPagoId: prov.formaPagoId || '' });
    setErrores({});
    setErrorGeneral(null);
    setIsModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const erroresValidacion = validarFormulario();
    if (Object.keys(erroresValidacion).length > 0) {
      setErrores(erroresValidacion);
      setErrorGeneral(`Revisa ${Object.keys(erroresValidacion).length} campo(s) marcado(s) antes de guardar.`);
      enfocarPrimerError(erroresValidacion);
      return;
    }
    setErrores({});
    setErrorGeneral(null);
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
        const mensaje = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Error al guardar';
        setErrorGeneral(mensaje);
        mostrarToast(`Error: ${mensaje}`, 'error');
      }
    } catch { mostrarToast('Error de conexión al intentar guardar.', 'error'); }
    finally { setGuardando(false); }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!await confirmarElegante(`¿${activo ? 'Desactivar' : 'Activar'} este proveedor?`, { peligroso: activo })) return;
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
                  <th className="p-4 font-semibold text-center">Homologación</th>
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
                      <div className="flex flex-col items-center gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${prov.estadoHomologacion === 'APROBADO' ? 'bg-emerald-50 text-emerald-700' : prov.estadoHomologacion === 'BLOQUEADO' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                          {(prov.estadoHomologacion ?? 'EN_EVALUACION').replaceAll('_', ' ')}
                        </span>
                        <span className={`text-[11px] font-medium ${prov.nivelRiesgo === 'ALTO' ? 'text-rose-600' : prov.nivelRiesgo === 'BAJO' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          Riesgo {prov.nivelRiesgo ?? 'MEDIO'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${prov.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${prov.activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {prov.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center items-center gap-2">
                        <PuedeEditar ruta="/api/proveedores/:id/homologacion">
                          <div className="flex items-center gap-1">
                            {prov.estadoHomologacion !== 'APROBADO' && (
                              <button onClick={() => resolverHomologacion(prov, 'APROBADO')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Aprobar homologación"><CheckCircle2 className="w-4 h-4" /></button>
                            )}
                            {prov.estadoHomologacion === 'EN_EVALUACION' && (
                              <button onClick={() => resolverHomologacion(prov, 'CONDICIONADO')} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Aprobar con condiciones"><AlertCircle className="w-4 h-4" /></button>
                            )}
                            {prov.estadoHomologacion !== 'BLOQUEADO' && (
                              <button onClick={() => resolverHomologacion(prov, 'BLOQUEADO')} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" title="Bloquear proveedor"><X className="w-4 h-4" /></button>
                            )}
                          </div>
                        </PuedeEditar>
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
              <button onClick={() => { setIsModalOpen(false); setErrores({}); setErrorGeneral(null); }} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              <form id="proveedor-form" noValidate onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">

                <div className="col-span-full rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
                  Los campos marcados con <span className="font-bold text-rose-600">*</span> son obligatorios. Para el contacto debes capturar al menos un teléfono y un correo.
                </div>
                {errorGeneral && (
                  <div role="alert" className="col-span-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div><p className="font-bold">No se puede guardar el proveedor</p><p>{errorGeneral}</p></div>
                  </div>
                )}

                {/* Datos Generales */}
                <div className="col-span-full">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <Briefcase className="w-4 h-4" /> Datos Generales
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre Comercial <span className="text-rose-600">*</span></label><input name="nombre" value={formData.nombre} onChange={handleChange} className={claseCampo('nombre')} aria-invalid={Boolean(errores.nombre)} /><ErrorCampo campo="nombre" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Razón Social / Nombre Fiscal <span className="text-rose-600">*</span></label><input name="razonSocial" value={formData.razonSocial} onChange={handleChange} className={claseCampo('razonSocial')} aria-invalid={Boolean(errores.razonSocial)} /><ErrorCampo campo="razonSocial" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">RFC <span className="text-rose-600">*</span></label><input name="rfc" value={formData.rfc} onChange={handleChange} className={claseCampo('rfc', 'uppercase font-mono')} maxLength={13} aria-invalid={Boolean(errores.rfc)} /><ErrorCampo campo="rfc" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo de Persona <span className="text-rose-600">*</span></label><select name="tipoPersona" value={formData.tipoPersona} onChange={handleChange} className={claseCampo('tipoPersona')} aria-invalid={Boolean(errores.tipoPersona)}><option value="FISICA">Persona Física</option><option value="MORAL">Persona Moral</option></select><ErrorCampo campo="tipoPersona" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Categoría <span className="text-rose-600">*</span></label><select name="tipoProveedor" value={formData.tipoProveedor} onChange={handleChange} className={claseCampo('tipoProveedor')} aria-invalid={Boolean(errores.tipoProveedor)}><option value="MERCANCIA">Mercancía / Insumos</option><option value="SERVICIO">Prestación de Servicios</option><option value="AMBOS">Ambos</option></select><ErrorCampo campo="tipoProveedor" /></div>
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
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Código Postal <span className="text-rose-600">*</span></label><input name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} className={claseCampo('codigoPostal')} inputMode="numeric" maxLength={5} aria-invalid={Boolean(errores.codigoPostal)} /><ErrorCampo campo="codigoPostal" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ciudad / Municipio</label><input name="ciudad" value={formData.ciudad} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">País <span className="text-rose-600">*</span></label><select name="paisId" value={formData.paisId} onChange={handleChange} className={claseCampo('paisId')} aria-invalid={Boolean(errores.paisId)}><option value="">Seleccione país</option>{paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select><ErrorCampo campo="paisId" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Estado <span className="text-rose-600">*</span></label><select name="estadoId" value={formData.estadoId} onChange={handleChange} disabled={!formData.paisId} className={claseCampo('estadoId', 'disabled:bg-slate-100')} aria-invalid={Boolean(errores.estadoId)}><option value="">Seleccione estado</option>{estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select><ErrorCampo campo="estadoId" /></div>

                {/* Contacto */}
                <div className="col-span-full mt-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <User className="w-4 h-4" /> Contacto Principal
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre del Contacto <span className="text-rose-600">*</span></label><input name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} className={claseCampo('contactoNombre')} aria-invalid={Boolean(errores.contactoNombre)} /><ErrorCampo campo="contactoNombre" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Puesto</label><input name="contactoPuesto" value={formData.contactoPuesto} onChange={handleChange} className={inputClass} /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono Directo</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} className={claseCampo('contactoTelefono', 'pl-9')} aria-invalid={Boolean(errores.contactoTelefono)} /></div><ErrorCampo campo="contactoTelefono" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email del Contacto</label><input type="email" name="contactoEmail" value={formData.contactoEmail} onChange={handleChange} className={claseCampo('contactoEmail')} aria-invalid={Boolean(errores.contactoEmail)} /><ErrorCampo campo="contactoEmail" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono Empresa</label><input name="telefono" value={formData.telefono} onChange={handleChange} className={claseCampo('telefono')} aria-invalid={Boolean(errores.telefono)} /><ErrorCampo campo="telefono" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email Empresa</label><input type="email" name="email" value={formData.email} onChange={handleChange} className={claseCampo('email')} aria-invalid={Boolean(errores.email)} /><ErrorCampo campo="email" /></div>

                {/* Financiero */}
                <div className="col-span-full mt-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <CreditCard className="w-4 h-4" /> Datos Bancarios y Comerciales
                  </h3>
                </div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Banco</label><BuscadorSeleccion valor={formData.bancoId} onChange={(bancoId) => setFormData((f) => ({ ...f, bancoId }))} opciones={bancos.map((b) => ({ valor: b.id, etiqueta: `${b.clave ?? '—'} · ${b.nombre}`, busqueda: b.clave }))} placeholder="Buscar banco por clave o nombre…" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Número de Cuenta</label><input name="numeroCuenta" value={formData.numeroCuenta} onChange={handleChange} className={claseCampo('numeroCuenta')} inputMode="numeric" aria-invalid={Boolean(errores.numeroCuenta)} /><ErrorCampo campo="numeroCuenta" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CLABE Interbancaria</label><input name="clabe" value={formData.clabe} onChange={handleChange} className={claseCampo('clabe')} inputMode="numeric" maxLength={18} aria-invalid={Boolean(errores.clabe)} /><ErrorCampo campo="clabe" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Método de Pago</label><select name="metodoPago" value={formData.metodoPago} onChange={handleChange} className={claseCampo('metodoPago')} aria-invalid={Boolean(errores.metodoPago)}><option value="PUE">PUE - Una sola exhibición</option><option value="PPD">PPD - Parcialidades o diferido</option></select><ErrorCampo campo="metodoPago" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Forma de Pago</label><select name="formaPagoId" value={formData.formaPagoId} onChange={handleChange} className={inputClass}><option value="">Seleccione forma</option>{formasPago.map(fp => <option key={fp.id} value={fp.id}>{fp.nombre}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Moneda</label><select name="moneda" value={formData.moneda} onChange={handleChange} className={claseCampo('moneda')} aria-invalid={Boolean(errores.moneda)}><option value="MXN">MXN - Peso Mexicano</option><option value="USD">USD - Dólar</option><option value="EUR">EUR - Euro</option></select><ErrorCampo campo="moneda" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Límite de Crédito</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span><input type="number" step="0.01" min="0" name="limiteCredito" value={formData.limiteCredito === 0 ? '' : formData.limiteCredito} onChange={handleChange} className={claseCampo('limiteCredito', 'pl-8')} placeholder="0.00" aria-invalid={Boolean(errores.limiteCredito)} /></div><ErrorCampo campo="limiteCredito" /></div>
                <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Días de Crédito</label><input type="number" min="0" name="diasCredito" value={formData.diasCredito === 0 ? '' : formData.diasCredito} onChange={handleChange} className={claseCampo('diasCredito')} placeholder="Ej. 30" aria-invalid={Boolean(errores.diasCredito)} /><ErrorCampo campo="diasCredito" /></div>

                <div className="col-span-full mt-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Notas Internas</label>
                  <textarea name="notas" value={formData.notas} onChange={handleChange} className={`${inputClass} resize-none`} rows={3} placeholder="Condiciones especiales, horarios de recepción..." />
                </div>
              </form>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 sticky bottom-0 rounded-b-2xl">
              <button type="button" onClick={() => { setIsModalOpen(false); setErrores({}); setErrorGeneral(null); }} className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors" disabled={guardando}>Cancelar</button>
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
