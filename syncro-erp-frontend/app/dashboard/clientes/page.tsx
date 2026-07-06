"use client";
import { useState, useEffect, useCallback } from 'react';
import {
    Search, Plus, Edit2, Power, X, Users, AlertCircle, CheckCircle2,
    Building2, User, MapPin, Phone, ShieldCheck, Loader2, AlertTriangle,
    Mail, Hash, FileText, CreditCard, ChevronDown
} from 'lucide-react';

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface ICliente {
    id: string; nombre: string; curp?: string;
    tipoPersona: 'FISICA' | 'MORAL'; rfc: string; razonSocial: string;
    email: string; telefono: string; direccion: string; ciudad: string;
    estado: string; codigoPostal: string; pais: string;
    contactoNombre: string; contactoTelefono: string;
    limiteCredito: number; diasCredito: number; notas: string; activo: boolean;
}
type FormData = Omit<ICliente, 'id' | 'activo'>;
type Errors   = Partial<Record<keyof FormData, string>>;
type Touched  = Partial<Record<keyof FormData, boolean>>;

// ── Reglas de validación ──────────────────────────────────────────────────────
const validar = (data: FormData): Errors => {
    const e: Errors = {};
    if (!data.nombre.trim())
        e.nombre = 'El nombre comercial es obligatorio';
    if (data.tipoPersona === 'MORAL' && !data.razonSocial.trim())
        e.razonSocial = 'La razón social es obligatoria para Persona Moral';
    if (data.rfc) {
        const longitud = data.tipoPersona === 'FISICA' ? 13 : 12;
        if (data.rfc.length !== longitud)
            e.rfc = `El RFC de Persona ${data.tipoPersona === 'FISICA' ? 'Física debe tener 13' : 'Moral debe tener 12'} caracteres`;
        else if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(data.rfc))
            e.rfc = 'Formato de RFC inválido';
    }
    if (data.curp && data.curp.length > 0) {
        if (data.curp.length !== 18)
            e.curp = 'La CURP debe tener exactamente 18 caracteres';
        else if (!/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$/.test(data.curp))
            e.curp = 'Formato de CURP inválido';
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        e.email = 'El correo electrónico no tiene un formato válido';
    if (!data.email.trim())
        e.email = 'El correo electrónico es obligatorio';
    if (!data.telefono.trim())
        e.telefono = 'El teléfono es obligatorio';
    else if (!/^[0-9+\-\s()]{7,20}$/.test(data.telefono))
        e.telefono = 'Número de teléfono inválido';
    if (data.codigoPostal && !/^[0-9]{5}$/.test(data.codigoPostal))
        e.codigoPostal = 'El código postal debe tener 5 dígitos';
    if (data.limiteCredito < 0)
        e.limiteCredito = 'El límite de crédito no puede ser negativo';
    if (data.diasCredito < 0)
        e.diasCredito = 'Los días de crédito no pueden ser negativos';
    return e;
};

// ── Componente campo con validación ──────────────────────────────────────────
function Campo({
    label, name, error, touched, required = false, children,
}: {
    label: string; name: string; error?: string;
    touched?: boolean; required?: boolean; children: React.ReactNode;
}) {
    const showError = touched && error;
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                {label}
                {required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <div className={`rounded-lg transition-all ${showError ? 'ring-2 ring-rose-400' : ''}`}>
                {children}
            </div>
            {showError && (
                <p className="flex items-center gap-1 mt-1 text-xs text-rose-600 font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0"/> {error}
                </p>
            )}
        </div>
    );
}

const inputCls = (error?: string, touched?: boolean) =>
    `w-full px-3 py-2.5 bg-white border rounded-lg text-sm outline-none transition-all placeholder:text-slate-300 ${
        touched && error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

// ── Verificador CURP ──────────────────────────────────────────────────────────
function CurpVerificador({ onVerificado, curpInicial = '' }: {
    onVerificado?: (d: any) => void; curpInicial?: string;
}) {
    const [curp, setCurp]           = useState(curpInicial);
    const [resultado, setResultado] = useState<any>(null);
    const [verificando, setV]       = useState(false);
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const h   = () => ({ Authorization: `Bearer ${localStorage.getItem('syncro_token')}`, 'Content-Type': 'application/json' });
    useEffect(() => { setCurp(curpInicial); setResultado(null); }, [curpInicial]);
    const verificar = async () => {
        if (curp.length !== 18) return;
        setV(true); setResultado(null);
        const r = await fetch(`${api}/rpa/curp/consultar`, {
            method: 'POST', headers: h(),
            body: JSON.stringify({ tipo: 'CURP', curp: curp.trim().toUpperCase() }),
        }).catch(() => null);
        if (r?.ok) {
            const d = await r.json(); setResultado(d);
            if (d.exitosa && onVerificado) onVerificado({ ...d, curpCapturada: curp.toUpperCase() });
        } else setResultado({ exitosa: false, error: 'Error de conexión' });
        setV(false);
    };
    const color = resultado === null ? 'slate' : resultado.exitosa ? 'emerald' : 'rose';
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input value={curp}
                    onChange={e => { setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); setResultado(null); }}
                    onKeyDown={e => e.key==='Enter' && curp.length===18 && verificar()}
                    maxLength={18} placeholder="XXXX000000XXXXXXXX00"
                    className={`flex-1 px-3 py-2.5 border rounded-lg text-sm font-mono tracking-widest uppercase outline-none transition-all ${
                        resultado?.exitosa ? 'border-emerald-400 bg-emerald-50 focus:ring-2 focus:ring-emerald-100'
                        : resultado ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                    }`}/>
                <button type="button" onClick={verificar} disabled={curp.length!==18||verificando}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all whitespace-nowrap">
                    {verificando ? <Loader2 className="w-4 h-4 animate-spin"/> : <ShieldCheck className="w-4 h-4"/>}
                    {verificando ? 'Consultando…' : 'Verificar'}
                </button>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{curp.length}/18 caracteres</span>
                {resultado?.desdeCache && <span className="text-indigo-400">✓ desde caché</span>}
            </div>
            {resultado && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm border ${
                    resultado.exitosa
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                    {resultado.exitosa
                        ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600"/>
                        : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0 text-rose-600"/>}
                    <span className="font-medium">
                        {resultado.exitosa
                            ? `✓ ${[resultado.nombre, resultado.primerApellido, resultado.segundoApellido].filter(Boolean).join(' ')} · ${resultado.fechaNacimiento}`
                            : resultado.error || 'CURP no encontrada en RENAPO'}
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Página principal ──────────────────────────────────────────────────────────
const formVacio: FormData = {
    curp:'', nombre:'', tipoPersona:'FISICA', rfc:'', razonSocial:'',
    email:'', telefono:'', direccion:'', ciudad:'', estado:'',
    codigoPostal:'', pais:'México', contactoNombre:'', contactoTelefono:'',
    limiteCredito:0, diasCredito:0, notas:'',
};

export default function ClientesPage() {
    const [clientes, setClientes]       = useState<ICliente[]>([]);
    const [cargando, setCargando]       = useState(true);
    const [busqueda, setBusqueda]       = useState('');
    const [busqDebounced, setBD]        = useState('');
    const [soloActivos, setSoloActivos] = useState(true);
    const [modal, setModal]             = useState(false);
    const [editId, setEditId]           = useState<string|null>(null);
    const [guardando, setGuardando]     = useState(false);
    const [formData, setFormData]       = useState<FormData>(formVacio);
    const [errors, setErrors]           = useState<Errors>({});
    const [touched, setTouched]         = useState<Touched>({});
    const [submitTried, setSubmitTried] = useState(false);
    const [toast, setToast]             = useState<{msg:string;tipo:'ok'|'err'|'info'}|null>(null);

    const api   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const tok   = () => localStorage.getItem('syncro_token') ?? '';
    const heads = (json=false) => ({ Authorization:`Bearer ${tok()}`, ...(json?{'Content-Type':'application/json'}:{}) });
    const showToast = (msg:string, tipo:'ok'|'err'|'info'='info') => {
        setToast({msg,tipo}); setTimeout(()=>setToast(null),4000);
    };

    useEffect(()=>{ const t=setTimeout(()=>setBD(busqueda),400); return()=>clearTimeout(t); },[busqueda]);

    const fetchClientes = useCallback(async () => {
        setCargando(true);
        const p = new URLSearchParams({ activos: soloActivos?'true':'false' });
        if (busqDebounced) p.set('filtro', busqDebounced);
        const r = await fetch(`${api}/clientes?${p}`, { headers: heads() }).catch(()=>null);
        if (r?.ok) setClientes(await r.json()); else showToast('Error al cargar clientes','err');
        setCargando(false);
    }, [busqDebounced, soloActivos]);
    useEffect(()=>{ fetchClientes(); },[fetchClientes]);

    // Validar en tiempo real
    useEffect(()=>{ setErrors(validar(formData)); },[formData]);

    const touch = (name: keyof FormData) => setTouched(t=>({...t,[name]:true}));
    const touchAll = () => {
        const all: Touched = {};
        (Object.keys(formVacio) as (keyof FormData)[]).forEach(k=>{ all[k]=true; });
        setTouched(all);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
        const {name,value} = e.target;
        setFormData(p=>({...p,[name]: name==='limiteCredito'||name==='diasCredito' ? Number(value) : value}));
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
        touch(e.target.name as keyof FormData);

    const handleCurpVerificado = (d: any) => {
        const nom = [d.nombre, d.primerApellido, d.segundoApellido].filter(Boolean).join(' ');
        setFormData(p=>({
            ...p,
            curp:           d.curpCapturada   ?? p.curp,
            nombre:         p.nombre          || nom,
            contactoNombre: p.contactoNombre  || nom,
            estado:         p.estado          || d.entidadNacimiento || '',
        }));
        showToast(`CURP verificada · ${nom}`, 'ok');
    };

    const abrirCrear = () => {
        setEditId(null); setFormData(formVacio);
        setErrors({}); setTouched({}); setSubmitTried(false); setModal(true);
    };
    const abrirEditar = (c: ICliente) => {
        setEditId(c.id);
        setFormData({ curp:c.curp||'', nombre:c.nombre||'', tipoPersona:c.tipoPersona||'FISICA',
            rfc:c.rfc||'', razonSocial:c.razonSocial||'', email:c.email||'', telefono:c.telefono||'',
            direccion:c.direccion||'', ciudad:c.ciudad||'', estado:c.estado||'',
            codigoPostal:c.codigoPostal||'', pais:c.pais||'México',
            contactoNombre:c.contactoNombre||'', contactoTelefono:c.contactoTelefono||'',
            limiteCredito:c.limiteCredito||0, diasCredito:c.diasCredito||0, notas:c.notas||'' });
        setErrors({}); setTouched({}); setSubmitTried(false); setModal(true);
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        touchAll(); setSubmitTried(true);
        const errs = validar(formData);
        if (Object.keys(errs).length > 0) {
            showToast(`Corrige ${Object.keys(errs).length} campo(s) con error antes de continuar`, 'err');
            return;
        }
        setGuardando(true);
        const url    = editId ? `${api}/clientes/${editId}` : `${api}/clientes`;
        const method = editId ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: heads(true), body: JSON.stringify(formData) }).catch(()=>null);
        if (r?.ok) {
            setModal(false); fetchClientes();
            showToast(editId ? 'Cliente actualizado correctamente' : 'Cliente registrado correctamente','ok');
        } else {
            const d = await r?.json().catch(()=>null);
            showToast(`Error: ${Array.isArray(d?.message)?d.message.join(', '):d?.message||'Error al guardar'}`,'err');
        }
        setGuardando(false);
    };

    const toggleEstado = async (id:string, activo:boolean) => {
        if (!confirm(`¿${activo?'Desactivar':'Activar'} este cliente?`)) return;
        const r = await fetch(`${api}/clientes/${id}/estado`,{method:'PATCH',headers:heads()}).catch(()=>null);
        if (r?.ok) { fetchClientes(); showToast(`Cliente ${activo?'desactivado':'activado'}`, 'ok'); }
        else showToast('Error al cambiar estado','err');
    };

    const numErrores = Object.keys(errors).length;
    const esValido   = numErrores === 0;

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium ${
                    toast.tipo==='ok'?'bg-emerald-600':toast.tipo==='err'?'bg-rose-600':'bg-blue-600'}`}>
                    {toast.tipo==='ok' && <CheckCircle2 className="w-5 h-5"/>}
                    {toast.tipo==='err' && <AlertCircle className="w-5 h-5"/>}
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg"><Users className="w-5 h-5 text-indigo-600"/></div>
                        Cartera de Clientes
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Gestión de clientes, crédito y verificación de identidad</p>
                </div>
                <button onClick={abrirCrear}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all active:scale-95">
                    <Plus className="w-4 h-4"/> Nuevo Cliente
                </button>
            </div>

            {/* Barra de búsqueda */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                    <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre, RFC, CURP o correo…"
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"/>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={!soloActivos} onChange={e=>setSoloActivos(!e.target.checked)}/>
                        <div className={`w-9 h-5 rounded-full transition-colors ${!soloActivos?'bg-indigo-500':'bg-slate-300'}`}/>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${!soloActivos?'translate-x-4':''}`}/>
                    </div>
                    Ver inactivos
                </label>
            </div>

            {/* Tabla */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {cargando ? (
                    <div className="py-16 flex flex-col items-center text-slate-400">
                        <Loader2 className="w-7 h-7 animate-spin mb-3"/>
                        <p className="text-sm">Cargando clientes…</p>
                    </div>
                ) : clientes.length === 0 ? (
                    <div className="py-16 flex flex-col items-center text-slate-400">
                        <Users className="w-12 h-12 mb-3 opacity-30"/>
                        <p className="font-medium text-slate-600">Sin clientes registrados</p>
                        <p className="text-sm mt-1">Haz clic en "Nuevo Cliente" para comenzar.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                                <th className="px-5 py-3 text-left">Cliente</th>
                                <th className="px-5 py-3 text-left">Contacto</th>
                                <th className="px-5 py-3 text-center">Tipo</th>
                                <th className="px-5 py-3 text-center">Crédito</th>
                                <th className="px-5 py-3 text-center">Estado</th>
                                <th className="px-5 py-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {clientes.map(c=>(
                                <tr key={c.id} className={`hover:bg-slate-50/80 transition-colors ${!c.activo?'opacity-50':''}`}>
                                    <td className="px-5 py-3.5">
                                        <p className="font-semibold text-slate-900">{c.nombre}</p>
                                        {c.rfc && <p className="text-xs text-slate-400 font-mono mt-0.5">RFC: {c.rfc}</p>}
                                        {c.curp && (
                                            <p className="text-xs text-indigo-400 font-mono mt-0.5 flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3"/> {c.curp}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {c.email && <p className="text-slate-600 flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400"/>{c.email}</p>}
                                        {c.telefono && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3"/>{c.telefono}</p>}
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                            c.tipoPersona==='MORAL'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                            {c.tipoPersona==='MORAL'?<Building2 className="w-3 h-3"/>:<User className="w-3 h-3"/>}
                                            {c.tipoPersona==='MORAL'?'Moral':'Física'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                        {c.limiteCredito > 0 ? (
                                            <div>
                                                <p className="text-xs font-semibold text-slate-700">
                                                    ${c.limiteCredito.toLocaleString('es-MX')}
                                                </p>
                                                <p className="text-xs text-slate-400">{c.diasCredito}d</p>
                                            </div>
                                        ) : <span className="text-xs text-slate-300">—</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                            c.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${c.activo?'bg-emerald-500':'bg-slate-400'}`}/>
                                            {c.activo?'Activo':'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex justify-center gap-1.5">
                                            <button onClick={()=>abrirEditar(c)}
                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                                                <Edit2 className="w-4 h-4"/>
                                            </button>
                                            <button onClick={()=>toggleEstado(c.id,c.activo)}
                                                className={`p-1.5 rounded-lg transition-colors ${c.activo?'text-rose-500 hover:bg-rose-50':'text-emerald-600 hover:bg-emerald-50'}`}
                                                title={c.activo?'Desactivar':'Activar'}>
                                                <Power className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── MODAL ─────────────────────────────────────────────────────── */}
            {modal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

                        {/* Header modal */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-lg">
                                    <Users className="w-5 h-5 text-indigo-600"/>
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-900">{editId?'Editar Cliente':'Nuevo Cliente'}</h2>
                                    <p className="text-xs text-slate-400">
                                        Los campos marcados con <span className="text-rose-500 font-bold">*</span> son obligatorios
                                    </p>
                                </div>
                            </div>
                            <button onClick={()=>setModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-slate-400"/>
                            </button>
                        </div>

                        {/* Alerta de errores */}
                        {submitTried && numErrores > 0 && (
                            <div className="mx-6 mt-4 flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-700">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0"/>
                                <div>
                                    <p className="font-semibold">Hay {numErrores} campo{numErrores>1?'s':''} con error.</p>
                                    <p className="text-xs mt-0.5 text-rose-500">Revisa los campos marcados en rojo antes de guardar.</p>
                                </div>
                            </div>
                        )}

                        {/* Cuerpo del formulario */}
                        <div className="overflow-y-auto flex-1 px-6 py-5">
                            <form id="form-cliente" onSubmit={handleGuardar} noValidate>

                                {/* ── SECCIÓN 1: Identificación ── */}
                                <div className="mb-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">1</div>
                                        <h3 className="text-sm font-bold text-slate-700">Identificación</h3>
                                        <div className="flex-1 h-px bg-slate-200"/>
                                    </div>

                                    {/* Tipo persona */}
                                    <div className="mb-4">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                                            Tipo de persona <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="flex gap-3">
                                            {(['FISICA','MORAL'] as const).map(tipo=>(
                                                <label key={tipo}
                                                    className={`flex-1 flex items-center gap-3 px-4 py-3 border-2 rounded-lg cursor-pointer transition-all ${
                                                        formData.tipoPersona===tipo
                                                            ? 'border-indigo-500 bg-indigo-50'
                                                            : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                                                    <input type="radio" name="tipoPersona" value={tipo} checked={formData.tipoPersona===tipo}
                                                        onChange={handleChange} className="accent-indigo-600"/>
                                                    <div>
                                                        <p className={`text-sm font-semibold ${formData.tipoPersona===tipo?'text-indigo-700':'text-slate-700'}`}>
                                                            {tipo==='FISICA' ? 'Persona Física' : 'Persona Moral'}
                                                        </p>
                                                        <p className="text-xs text-slate-400">
                                                            {tipo==='FISICA' ? 'RFC a 13 dígitos' : 'RFC a 12 dígitos'}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <Campo label="Nombre Comercial" name="nombre" error={errors.nombre} touched={touched.nombre} required>
                                                <input name="nombre" value={formData.nombre} onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="Nombre con el que se conoce al cliente"
                                                    className={inputCls(errors.nombre, touched.nombre)}/>
                                            </Campo>
                                        </div>
                                        {formData.tipoPersona==='MORAL' && (
                                            <div className="col-span-2">
                                                <Campo label="Razón Social" name="razonSocial" error={errors.razonSocial} touched={touched.razonSocial} required>
                                                    <input name="razonSocial" value={formData.razonSocial} onChange={handleChange} onBlur={handleBlur}
                                                        placeholder="Nombre legal registrado ante el SAT"
                                                        className={inputCls(errors.razonSocial, touched.razonSocial)}/>
                                                </Campo>
                                            </div>
                                        )}
                                        <Campo label={`RFC ${formData.tipoPersona==='FISICA'?'(13 caracteres)':'(12 caracteres)'}`}
                                            name="rfc" error={errors.rfc} touched={touched.rfc}>
                                            <input name="rfc" value={formData.rfc} onChange={handleChange} onBlur={handleBlur}
                                                placeholder={formData.tipoPersona==='FISICA'?'ABCD000000AAA':'ABC000000AA0'}
                                                maxLength={formData.tipoPersona==='FISICA'?13:12}
                                                className={`${inputCls(errors.rfc, touched.rfc)} uppercase font-mono tracking-wider`}/>
                                        </Campo>
                                        {formData.tipoPersona==='FISICA' && (
                                            <Campo label="CURP (verificación RENAPO)" name="curp" error={errors.curp} touched={touched.curp}>
                                                <CurpVerificador
                                                    curpInicial={formData.curp ?? ''}
                                                    onVerificado={d => {
                                                        handleCurpVerificado(d);
                                                        setFormData(p=>({...p, curp: d.curpCapturada ?? p.curp}));
                                                        touch('curp');
                                                    }}
                                                />
                                            </Campo>
                                        )}
                                    </div>
                                </div>

                                {/* ── SECCIÓN 2: Contacto ── */}
                                <div className="mb-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">2</div>
                                        <h3 className="text-sm font-bold text-slate-700">Contacto</h3>
                                        <div className="flex-1 h-px bg-slate-200"/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Campo label="Correo Electrónico" name="email" error={errors.email} touched={touched.email} required>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                                <input type="email" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="cliente@empresa.com"
                                                    className={`${inputCls(errors.email, touched.email)} pl-9`}/>
                                            </div>
                                        </Campo>
                                        <Campo label="Teléfono" name="telefono" error={errors.telefono} touched={touched.telefono} required>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                                <input name="telefono" value={formData.telefono} onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="10 dígitos"
                                                    className={`${inputCls(errors.telefono, touched.telefono)} pl-9`}/>
                                            </div>
                                        </Campo>
                                        <Campo label="Nombre del Contacto" name="contactoNombre" error={errors.contactoNombre} touched={touched.contactoNombre}>
                                            <input name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="Persona de contacto directo"
                                                className={inputCls(errors.contactoNombre, touched.contactoNombre)}/>
                                        </Campo>
                                        <Campo label="Teléfono del Contacto" name="contactoTelefono" error={errors.contactoTelefono} touched={touched.contactoTelefono}>
                                            <input name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="Teléfono directo / celular"
                                                className={inputCls(errors.contactoTelefono, touched.contactoTelefono)}/>
                                        </Campo>
                                    </div>
                                </div>

                                {/* ── SECCIÓN 3: Dirección ── */}
                                <div className="mb-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">3</div>
                                        <h3 className="text-sm font-bold text-slate-700">Dirección</h3>
                                        <div className="flex-1 h-px bg-slate-200"/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <Campo label="Calle y Número" name="direccion" error={errors.direccion} touched={touched.direccion}>
                                                <div className="relative">
                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                                    <input name="direccion" value={formData.direccion} onChange={handleChange} onBlur={handleBlur}
                                                        placeholder="Calle, número exterior e interior"
                                                        className={`${inputCls(errors.direccion, touched.direccion)} pl-9`}/>
                                                </div>
                                            </Campo>
                                        </div>
                                        <Campo label="Ciudad / Municipio" name="ciudad" error={errors.ciudad} touched={touched.ciudad}>
                                            <input name="ciudad" value={formData.ciudad} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="Ciudad o municipio"
                                                className={inputCls(errors.ciudad, touched.ciudad)}/>
                                        </Campo>
                                        <Campo label="Estado" name="estado" error={errors.estado} touched={touched.estado}>
                                            <input name="estado" value={formData.estado} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="Estado o provincia"
                                                className={inputCls(errors.estado, touched.estado)}/>
                                        </Campo>
                                        <Campo label="Código Postal" name="codigoPostal" error={errors.codigoPostal} touched={touched.codigoPostal}>
                                            <input name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="5 dígitos" maxLength={5}
                                                className={inputCls(errors.codigoPostal, touched.codigoPostal)}/>
                                        </Campo>
                                        <Campo label="País" name="pais" error={errors.pais} touched={touched.pais}>
                                            <input name="pais" value={formData.pais} onChange={handleChange} onBlur={handleBlur}
                                                className={inputCls(errors.pais, touched.pais)}/>
                                        </Campo>
                                    </div>
                                </div>

                                {/* ── SECCIÓN 4: Crédito ── */}
                                <div className="mb-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">4</div>
                                        <h3 className="text-sm font-bold text-slate-700">Condiciones de Crédito</h3>
                                        <div className="flex-1 h-px bg-slate-200"/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Campo label="Límite de Crédito ($)" name="limiteCredito" error={errors.limiteCredito} touched={touched.limiteCredito}>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                                <input type="number" min="0" step="0.01" name="limiteCredito"
                                                    value={formData.limiteCredito||''}
                                                    onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="0.00"
                                                    className={`${inputCls(errors.limiteCredito, touched.limiteCredito)} pl-7`}/>
                                            </div>
                                        </Campo>
                                        <Campo label="Días de Crédito" name="diasCredito" error={errors.diasCredito} touched={touched.diasCredito}>
                                            <div className="relative">
                                                <input type="number" min="0" name="diasCredito"
                                                    value={formData.diasCredito||''}
                                                    onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="Ej. 30, 60, 90"
                                                    className={inputCls(errors.diasCredito, touched.diasCredito)}/>
                                            </div>
                                        </Campo>
                                        {(formData.limiteCredito > 0 || formData.diasCredito > 0) && (
                                            <div className="col-span-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-xs text-indigo-700 flex items-center gap-2">
                                                <CreditCard className="w-4 h-4"/>
                                                Este cliente podrá comprar a crédito hasta{' '}
                                                <strong>${formData.limiteCredito.toLocaleString('es-MX')}</strong> con{' '}
                                                <strong>{formData.diasCredito} días</strong> para pagar.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── SECCIÓN 5: Notas ── */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">5</div>
                                        <h3 className="text-sm font-bold text-slate-700">Observaciones</h3>
                                        <div className="flex-1 h-px bg-slate-200"/>
                                    </div>
                                    <Campo label="Notas internas" name="notas" error={errors.notas} touched={touched.notas}>
                                        <textarea name="notas" value={formData.notas} onChange={handleChange} onBlur={handleBlur}
                                            rows={3} placeholder="Observaciones internas del cliente (no visibles para el cliente)…"
                                            className={`${inputCls(errors.notas, touched.notas)} resize-none`}/>
                                    </Campo>
                                </div>

                            </form>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex items-center justify-between">
                            <div className="text-xs text-slate-400">
                                {submitTried && numErrores > 0 && (
                                    <span className="text-rose-500 font-medium flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3"/> {numErrores} error{numErrores>1?'es':''} pendiente{numErrores>1?'s':''}
                                    </span>
                                )}
                                {esValido && submitTried && (
                                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3"/> Formulario válido
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={()=>setModal(false)} disabled={guardando}
                                    className="px-5 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" form="form-cliente" disabled={guardando}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-all">
                                    {guardando && <Loader2 className="w-4 h-4 animate-spin"/>}
                                    {guardando ? 'Guardando…' : editId ? 'Actualizar Cliente' : 'Registrar Cliente'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
