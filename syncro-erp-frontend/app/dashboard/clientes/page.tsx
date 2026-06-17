"use client";

import { useState, useEffect } from 'react';
import { 
    Search, Plus, Edit2, Power, X, Users, AlertCircle, CheckCircle2, 
    Building2, User, MapPin, CreditCard, Phone
} from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface ICliente {
    id: string;
    nombre: string;
    tipoPersona: 'FISICA' | 'MORAL';
    rfc: string;
    razonSocial: string;
    email: string;
    telefono: string;
    direccion: string;
    ciudad: string;
    estado: string;
    codigoPostal: string;
    pais: string;
    contactoNombre: string;
    contactoTelefono: string;
    limiteCredito: number;
    diasCredito: number;
    notas: string;
    activo: boolean;
}

export interface IClienteFormData extends Omit<ICliente, 'id' | 'activo'> {}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function ClientesPage() {
    const [clientes, setClientes] = useState<ICliente[]>([]);
    const [cargando, setCargando] = useState(true);
    
    const [busqueda, setBusqueda] = useState('');
    const [busquedaDebounced, setBusquedaDebounced] = useState('');
    const [mostrarInactivos, setMostrarInactivos] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    const [formData, setFormData] = useState<IClienteFormData>({
        nombre: '', tipoPersona: 'FISICA', rfc: '', razonSocial: '',
        email: '', telefono: '', direccion: '', ciudad: '', estado: '',
        codigoPostal: '', pais: '', contactoNombre: '', contactoTelefono: '',
        limiteCredito: 0, diasCredito: 0, notas: '',
    });

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

    // Sistema de Notificaciones Toast
    const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
    const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
        setToast({ mensaje, tipo });
        setTimeout(() => setToast(null), 4000);
    };

    // Efecto Debounce para el buscador
    useEffect(() => {
        const timer = setTimeout(() => setBusquedaDebounced(busqueda), 400);
        return () => clearTimeout(timer);
    }, [busqueda]);

    const fetchClientes = async () => {
        setCargando(true);
        const token = localStorage.getItem('syncro_token');
        try {
            const params = new URLSearchParams();
            if (busquedaDebounced) params.append('filtro', busquedaDebounced);
            params.append('activos', mostrarInactivos ? 'false' : 'true');

            const res = await fetch(`${apiUrl}/clientes?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setClientes(await res.json());
            } else {
                mostrarToast('Error al cargar la lista de clientes', 'error');
            }
        } catch (error) {
            console.error('Error al cargar clientes:', error);
            mostrarToast('Error de conexión con el servidor', 'error');
        } finally {
            setCargando(false);
        }
    };

    // Recargar cuando cambie el filtro debounced o el toggle de inactivos
    useEffect(() => { 
        fetchClientes(); 
    }, [busquedaDebounced, mostrarInactivos]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'limiteCredito' || name === 'diasCredito' ? Number(value) : value 
        }));
    };

    const abrirModalCrear = () => {
        setEditandoId(null);
        setFormData({
            nombre: '', tipoPersona: 'FISICA', rfc: '', razonSocial: '',
            email: '', telefono: '', direccion: '', ciudad: '', estado: '',
            codigoPostal: '', pais: '', contactoNombre: '', contactoTelefono: '',
            limiteCredito: 0, diasCredito: 0, notas: '',
        });
        setIsModalOpen(true);
    };

    const abrirModalEditar = (cliente: ICliente) => {
        setEditandoId(cliente.id);
        setFormData({
            nombre: cliente.nombre || '',
            tipoPersona: cliente.tipoPersona || 'FISICA',
            rfc: cliente.rfc || '',
            razonSocial: cliente.razonSocial || '',
            email: cliente.email || '',
            telefono: cliente.telefono || '',
            direccion: cliente.direccion || '',
            ciudad: cliente.ciudad || '',
            estado: cliente.estado || '',
            codigoPostal: cliente.codigoPostal || '',
            pais: cliente.pais || '',
            contactoNombre: cliente.contactoNombre || '',
            contactoTelefono: cliente.contactoTelefono || '',
            limiteCredito: cliente.limiteCredito || 0,
            diasCredito: cliente.diasCredito || 0,
            notas: cliente.notas || '',
        });
        setIsModalOpen(true);
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nombre.trim()) {
            mostrarToast('El nombre del cliente es obligatorio', 'info');
            return;
        }

        setGuardando(true);
        const token = localStorage.getItem('syncro_token');
        const url = editandoId ? `${apiUrl}/clientes/${editandoId}` : `${apiUrl}/clientes`;
        const metodo = editandoId ? 'PATCH' : 'POST';

        try {
            const res = await fetch(url, {
                method: metodo,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                setIsModalOpen(false);
                fetchClientes();
                mostrarToast(editandoId ? 'Cliente actualizado exitosamente.' : 'Cliente creado exitosamente.', 'exito');
            } else {
                const data = await res.json().catch(() => null);
                const mensaje = Array.isArray(data?.message)
                    ? data.message.join(', ')
                    : data?.message || 'Error al guardar';
                mostrarToast(`Error: ${mensaje}`, 'error');
            }
        } catch (error) {
            console.error('Error al guardar:', error);
            mostrarToast('Error de conexión al intentar guardar.', 'error');
        } finally {
            setGuardando(false);
        }
    };

    const handleCambiarEstado = async (id: string, activo: boolean) => {
        if (!window.confirm(`¿Estás seguro de que deseas ${activo ? 'desactivar' : 'activar'} este cliente?`)) return;
        const token = localStorage.getItem('syncro_token');
        try {
            const res = await fetch(`${apiUrl}/clientes/${id}/estado`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                fetchClientes();
                mostrarToast(`Cliente ${activo ? 'desactivado' : 'activado'} correctamente.`, 'exito');
            } else {
                mostrarToast('Error al cambiar el estado del cliente', 'error');
            }
        } catch (error) {
            console.error('Error al cambiar estado:', error);
            mostrarToast('Error de conexión con el servidor', 'error');
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
            
            {/* Notificaciones Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 transform translate-y-0 opacity-100 ${
                    toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'
                }`}>
                    {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}
                    {toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}
                    {toast.mensaje}
                </div>
            )}

            {/* Encabezado */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Users className="w-8 h-8 text-indigo-500" />
                        Cartera de Clientes
                    </h1>
                    <p className="text-slate-500 mt-1">Administra la información, crédito y contacto de tus clientes.</p>
                </div>
                <button onClick={abrirModalCrear} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95">
                    <Plus className="w-5 h-5" />
                    Nuevo Cliente
                </button>
            </div>

            {/* Buscador y Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, RFC, email o teléfono..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                </div>
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
                        <div className={`block w-10 h-6 rounded-full transition-colors ${mostrarInactivos ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${mostrarInactivos ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Mostrar inactivos</span>
                </label>
            </div>

            {/* Contenedor de la Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {cargando ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        Cargando clientes...
                    </div>
                ) : clientes.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-lg font-medium text-slate-700">No se encontraron clientes</p>
                        <p className="text-sm">Ajusta tu búsqueda o registra el primero.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                                    <th className="p-4 font-semibold">Cliente</th>
                                    <th className="p-4 font-semibold">Contacto</th>
                                    <th className="p-4 font-semibold text-center">Tipo</th>
                                    <th className="p-4 font-semibold text-center">Estado</th>
                                    <th className="p-4 font-semibold text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {clientes.map((c) => (
                                    <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                                        <td className="p-4">
                                            <p className="font-bold text-slate-900">{c.nombre}</p>
                                            <p className="text-xs text-slate-500 font-mono mt-0.5">{c.rfc || 'Sin RFC'}</p>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-sm text-slate-600">
                                                <p>{c.email || 'Sin email'}</p>
                                                <p className="text-xs text-slate-400">{c.telefono || 'Sin teléfono'}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                                c.tipoPersona === 'MORAL' 
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                                {c.tipoPersona === 'MORAL' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                                                {c.tipoPersona}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${c.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                                {c.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center items-center gap-2">
                                                <button onClick={() => abrirModalEditar(c)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleCambiarEstado(c.id, c.activo)}
                                                    className={`p-2 rounded-lg transition-colors ${c.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                                    title={c.activo ? 'Desactivar' : 'Activar'}
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL CREAR / EDITAR */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                {editandoId ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <form id="cliente-form" onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                
                                {/* SECCIÓN: DATOS GENERALES */}
                                <div className="col-span-1 md:col-span-2">
                                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-2 border-b pb-2">
                                        <User className="w-4 h-4" /> Datos Generales
                                    </h3>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial *</label>
                                    <input required name="nombre" value={formData.nombre} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Persona</label>
                                    <select name="tipoPersona" value={formData.tipoPersona} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                                        <option value="FISICA">Persona Física</option>
                                        <option value="MORAL">Persona Moral</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">RFC</label>
                                    <input name="rfc" value={formData.rfc} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social</label>
                                    <input name="razonSocial" value={formData.razonSocial} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>

                                {/* SECCIÓN: UBICACIÓN */}
                                <div className="col-span-1 md:col-span-2 mt-2">
                                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-2 border-b pb-2">
                                        <MapPin className="w-4 h-4" /> Dirección y Ubicación
                                    </h3>
                                </div>

                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Completa</label>
                                    <input name="direccion" value={formData.direccion} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad / Municipio</label>
                                    <input name="ciudad" value={formData.ciudad} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                                    <input name="estado" value={formData.estado} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Código Postal</label>
                                    <input name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                                    <input name="pais" value={formData.pais} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>

                                {/* SECCIÓN: CONTACTO & CRÉDITO */}
                                <div className="col-span-1 md:col-span-2 mt-2">
                                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-2 border-b pb-2">
                                        <Phone className="w-4 h-4" /> Contacto y Crédito
                                    </h3>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Principal</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono Empresa</label>
                                    <input name="telefono" value={formData.telefono} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Contacto</label>
                                    <input name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Ej. Juan Pérez" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono del Contacto</label>
                                    <input name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Límite de Crédito ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                                        <input type="number" step="0.01" min="0" name="limiteCredito" value={formData.limiteCredito === 0 ? '' : formData.limiteCredito} onChange={handleChange} className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="0.00" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Días de Crédito</label>
                                    <input type="number" min="0" name="diasCredito" value={formData.diasCredito === 0 ? '' : formData.diasCredito} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Ej. 15, 30" />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notas Internas</label>
                                    <textarea name="notas" value={formData.notas} onChange={handleChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" rows={2} placeholder="Observaciones adicionales sobre el cliente..." />
                                </div>

                            </form>
                        </div>

                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                            <button 
                                type="button" 
                                onClick={() => setIsModalOpen(false)} 
                                className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                                disabled={guardando}
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                form="cliente-form" 
                                disabled={guardando} 
                                className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
                            >
                                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {guardando ? 'Guardando...' : 'Guardar Cliente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}