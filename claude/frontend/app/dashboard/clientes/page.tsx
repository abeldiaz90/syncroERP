"use client";
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { confirmarElegante, solicitarTexto } from '@/components/ui/dialogos';
import { ExpedienteCliente } from '@/components/clientes/expediente-cliente';
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
    estado: string; estadoId: string; codigoPostal: string; pais: string; paisId: string;
    contactoNombre: string; contactoTelefono: string;
    limiteCredito: number; diasCredito: number; notas: string; activo: boolean;
    etapaComercial?: 'PROSPECTO' | 'ACTIVO' | 'BLOQUEADO' | 'INACTIVO';
    estadoCredito?: 'SIN_CREDITO' | 'EN_REVISION' | 'AUTORIZADO' | 'RECHAZADO' | 'SUSPENDIDO';
    estadoSolicitudCredito?: 'NINGUNA' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
    nivelRiesgo?: 'BAJO' | 'MEDIO' | 'ALTO';
    clasificacionHotelera?: 'EMPRESA' | 'AGENCIA' | '';
    bloquearCreditoConSaldoVencido?: boolean;
    versionCredito?: number;
    versionSolicitudCredito?: number;
    limiteCreditoSolicitado?: number | null;
    diasCreditoSolicitados?: number | null;
    nivelRiesgoSolicitado?: 'BAJO' | 'MEDIO' | 'ALTO' | null;
    clasificacionHoteleraSolicitada?: 'EMPRESA' | 'AGENCIA' | null;
    bloquearCreditoConSaldoVencidoSolicitado?: boolean | null;
}
type FormData = Omit<ICliente,
    'id' | 'activo' | 'etapaComercial' | 'estadoCredito' | 'estadoSolicitudCredito' |
    'versionCredito' | 'versionSolicitudCredito' | 'limiteCreditoSolicitado' |
    'diasCreditoSolicitados' | 'nivelRiesgoSolicitado' |
    'clasificacionHoteleraSolicitada' | 'bloquearCreditoConSaldoVencidoSolicitado'
> & {
    nivelRiesgo: 'BAJO' | 'MEDIO' | 'ALTO';
    bloquearCreditoConSaldoVencido: boolean;
};
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
    if ((data.limiteCredito > 0 && data.diasCredito <= 0) || (data.diasCredito > 0 && data.limiteCredito <= 0)) {
        e.limiteCredito = 'El límite y el plazo deben configurarse juntos';
        e.diasCredito = 'El límite y el plazo deben configurarse juntos';
    }
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

// ── Página principal ──────────────────────────────────────────────────────────
const formVacio: FormData = {
    curp:'', nombre:'', tipoPersona:'FISICA', rfc:'', razonSocial:'',
    email:'', telefono:'', direccion:'', ciudad:'', estado:'',
    estadoId:'', codigoPostal:'', pais:'México', paisId:'', contactoNombre:'', contactoTelefono:'',
    limiteCredito:0, diasCredito:0, nivelRiesgo:'MEDIO',
    bloquearCreditoConSaldoVencido:true, clasificacionHotelera:'', notas:'',
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
    const [paises, setPaises]           = useState<any[]>([]);
    /*
     * Verificacion de credito. El backend se niega a autorizar una linea si la
     * empresa tiene un flujo activo y el cliente no trae expediente favorable,
     * y hasta ahora eso se descubria al final, con un 409 en la pantalla de
     * aprobaciones. Se trae el flujo activo y el expediente del cliente para
     * decirlo aqui, donde se teclea el limite, no tres pantallas despues.
     */
    const [flujoVerif, setFlujoVerif]   = useState<{ id:string; nombre:string } | null>(null);
    const [expediente, setExpediente]   = useState<any|null|undefined>(undefined);
    /* El cliente que se esta editando, para leer su estado real de linea. */
    const clienteEnEdicion = editId ? clientes.find(c => c.id === editId) ?? null : null;
    /* Cual expediente se esta viendo. La pantalla ya no es una tabla: siempre
       hay un cliente abierto a la derecha, y al cargar se abre el primero
       para que nadie llegue a un panel vacio sin saber que hacer. */
    const [seleccionado, setSeleccionado] = useState<string|null>(null);
    const clienteActivo = clientes.find(c => c.id === seleccionado) ?? null;
    const [estados, setEstados]         = useState<any[]>([]);

    const api   = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
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
    useEffect(() => {
        if (!clientes.length) { setSeleccionado(null); return; }
        setSeleccionado(prev => (prev && clientes.some(c=>c.id===prev)) ? prev : clientes[0].id);
    }, [clientes]);
    useEffect(() => {
        fetch(`${api}/integracion/validacion/flujos/activo`, { headers: heads() })
          .then(r => r.ok ? r.json() : null)
          .then((f:any) => setFlujoVerif(f && f.id ? { id:f.id, nombre:f.nombre } : null))
          .catch(()=>setFlujoVerif(null));
    }, []);
    useEffect(() => {
        fetch(`${api}/catalogos/paises`, {headers:heads()})
          .then(r=>r.ok?r.json():[]).then((datos:any[]) => {
            setPaises(datos);
            const mx=datos.find(p=>p.codigoIso2==='MX'||p.codigo==='MX');
            setFormData(f=>f.paisId||!mx?f:{...f,paisId:mx.id,pais:mx.nombre});
          });
    }, []);
    useEffect(() => {
        if (!formData.paisId) { setEstados([]); return; }
        fetch(`${api}/catalogos/estados?paisId=${formData.paisId}`, {headers:heads()})
          .then(r=>r.ok?r.json():[]).then(setEstados);
    }, [formData.paisId]);

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

    const abrirCrear = () => {
        const mx=paises.find(p=>p.codigoIso2==='MX'||p.codigo==='MX');
        setEditId(null); setFormData({...formVacio,paisId:mx?.id||'',pais:mx?.nombre||'México'});
        setExpediente(null);
        setErrors({}); setTouched({}); setSubmitTried(false); setModal(true);
    };
    const abrirEditar = (c: ICliente) => {
        const tienePropuesta = ['PENDIENTE', 'RECHAZADA', 'CANCELADA'].includes(c.estadoSolicitudCredito ?? '')
            && Number(c.limiteCreditoSolicitado ?? 0) > 0
            && Number(c.diasCreditoSolicitados ?? 0) > 0;
        setEditId(c.id);
        setFormData({ curp:c.curp||'', nombre:c.nombre||'', tipoPersona:c.tipoPersona||'FISICA',
            rfc:c.rfc||'', razonSocial:c.razonSocial||'', email:c.email||'', telefono:c.telefono||'',
            direccion:c.direccion||'', ciudad:c.ciudad||'', estado:c.estado||'',
            estadoId:c.estadoId||'', codigoPostal:c.codigoPostal||'', pais:c.pais||'México', paisId:c.paisId||'',
            contactoNombre:c.contactoNombre||'', contactoTelefono:c.contactoTelefono||'',
            limiteCredito:tienePropuesta ? Number(c.limiteCreditoSolicitado) : Number(c.limiteCredito||0),
            diasCredito:tienePropuesta ? Number(c.diasCreditoSolicitados) : Number(c.diasCredito||0),
            nivelRiesgo:tienePropuesta ? (c.nivelRiesgoSolicitado||'MEDIO') : (c.nivelRiesgo||'MEDIO'),
            bloquearCreditoConSaldoVencido:tienePropuesta
                ? c.bloquearCreditoConSaldoVencidoSolicitado !== false
                : c.bloquearCreditoConSaldoVencido!==false,
            clasificacionHotelera:(tienePropuesta
                ? c.clasificacionHoteleraSolicitada
                : c.clasificacionHotelera)||'', notas:c.notas||'' });
        setErrors({}); setTouched({}); setSubmitTried(false); setModal(true);
        /* El expediente mas reciente que NO sea simulacion: es el unico que el
           candado de aprobacion mira. */
        setExpediente(undefined);
        fetch(`${api}/integracion/validacion/expedientes?clienteId=${c.id}`, { headers: heads() })
          .then(r => r.ok ? r.json() : [])
          .then((h:any[]) => setExpediente((Array.isArray(h)?h:[]).find(e => !e.simulacion) ?? null))
          .catch(()=>setExpediente(null));
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
        const payload = {
            ...formData,
            clasificacionHotelera:
                formData.tipoPersona === 'MORAL' && formData.clasificacionHotelera
                    ? formData.clasificacionHotelera
                    : null,
        };
        const r = await fetch(url, { method, headers: heads(true), body: JSON.stringify(payload) }).catch(()=>null);
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
        if (!await confirmarElegante(`¿${activo?'Desactivar':'Activar'} este cliente?`, { peligroso: activo })) return;
        const r = await fetch(`${api}/clientes/${id}/estado`,{method:'PATCH',headers:heads()}).catch(()=>null);
        if (r?.ok) { fetchClientes(); showToast(`Cliente ${activo?'desactivado':'activado'}`, 'ok'); }
        else showToast('Error al cambiar estado','err');
    };

    const gestionarCredito = async (
        cliente: ICliente,
        decision: 'REENVIAR' | 'SUSPENDER',
    ) => {
        let comentario: string | null = null;
        if (decision === 'REENVIAR') {
            const confirmado = await confirmarElegante(
                `¿Enviar nuevamente a aprobación la propuesta de $${Number(cliente.limiteCreditoSolicitado ?? cliente.limiteCredito).toLocaleString('es-MX')} a ${Number(cliente.diasCreditoSolicitados ?? cliente.diasCredito)} días para ${cliente.nombre}?`,
                { titulo: 'Reenviar crédito a aprobación' },
            );
            if (!confirmado) return;
            comentario = 'Línea reenviada para una nueva revisión.';
        } else {
            comentario = await solicitarTexto(
                `Explica por qué se suspende la línea de ${cliente.nombre}. El motivo quedará en la trazabilidad y suspenderá sus convenios hoteleros.`,
                { titulo: 'Suspender crédito', obligatorio: true },
            );
            if (comentario === null) return;
        }
        const r = await fetch(`${api}/clientes/${cliente.id}/credito/accion`, {
            method: 'PATCH',
            headers: heads(true),
            body: JSON.stringify({ decision, comentario }),
        }).catch(() => null);
        if (r?.ok) {
            showToast(
                decision === 'REENVIAR'
                    ? 'Crédito enviado nuevamente a la bandeja de aprobaciones'
                    : 'Crédito y convenios relacionados suspendidos correctamente',
                'ok',
            );
            fetchClientes();
        } else {
            const d = await r?.json().catch(() => null);
            showToast(
                Array.isArray(d?.message)
                    ? d.message.join(', ')
                    : d?.message ?? 'No fue posible actualizar el crédito',
                'err',
            );
        }
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

            {/* ══════════════════════════════════════════════════════════════
                CARTERA DE CLIENTES · panel, no tabla

                Era una rejilla con un popup encima, y eso decía que el cliente
                es un renglón. No lo es: es un expediente —identidad, línea,
                verificaciones, historia— y la pantalla tiene que enseñarlo
                entero sin abrir nada.

                De ahí la forma: un resumen de cartera arriba, la lista a la
                izquierda para elegir, y a la derecha el expediente del elegido.
                El formulario de alta y edición sigue siendo un modal porque es
                captura, no consulta: se abre, se llena y se cierra.
               ══════════════════════════════════════════════════════════════ */}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg"><Users className="w-5 h-5 text-indigo-600"/></div>
                        Cartera de Clientes
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Expediente, crédito y verificaciones de cada cliente</p>
                </div>
                <button onClick={abrirCrear}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all active:scale-95">
                    <Plus className="w-4 h-4"/> Nuevo Cliente
                </button>
            </div>

            {/* ── Resumen de cartera ─────────────────────────────────────────
                Cuatro números que se leen de un tirón. El último es el que
                nadie miraba: cuántos tienen línea viva sin haber pasado por
                una verificación. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {[
                    { etiqueta: 'Clientes', valor: clientes.length, pie: soloActivos ? 'activos' : 'incluye inactivos', color: 'text-slate-900' },
                    { etiqueta: 'Con línea vigente', valor: clientes.filter(c=>Number(c.limiteCredito??0)>0).length, pie: 'pueden comprar a crédito', color: 'text-emerald-700' },
                    { etiqueta: 'En aprobación', valor: clientes.filter(c=>c.estadoSolicitudCredito==='PENDIENTE').length, pie: 'esperan maker-checker', color: 'text-indigo-700' },
                    { etiqueta: 'Sin crédito', valor: clientes.filter(c=>!(Number(c.limiteCredito??0)>0)).length, pie: 'compran de contado', color: 'text-slate-500' },
                ].map(k=>(
                    <div key={k.etiqueta} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k.etiqueta}</p>
                        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${k.color}`}>{k.valor}</p>
                        <p className="text-[11px] text-slate-400">{k.pie}</p>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
                {/* ── Columna izquierda: elegir cliente ───────────────────── */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:sticky lg:top-4">
                    <div className="p-3 border-b border-slate-100 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                                placeholder="Buscar por nombre, RFC o correo…"
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"/>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={!soloActivos} onChange={e=>setSoloActivos(!e.target.checked)}/>
                                <div className={`w-8 h-4 rounded-full transition-colors ${!soloActivos?'bg-indigo-500':'bg-slate-300'}`}/>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${!soloActivos?'translate-x-4':''}`}/>
                            </div>
                            Ver inactivos
                        </label>
                    </div>

                    {cargando ? (
                        <div className="py-12 flex flex-col items-center text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin mb-2"/>
                            <p className="text-xs">Cargando…</p>
                        </div>
                    ) : clientes.length === 0 ? (
                        <div className="py-12 px-4 flex flex-col items-center text-center text-slate-400">
                            <Users className="w-10 h-10 mb-3 opacity-30"/>
                            <p className="font-medium text-slate-600 text-sm">Sin clientes</p>
                            <p className="text-xs mt-1">Empieza con «Nuevo Cliente».</p>
                        </div>
                    ) : (
                        <div className="max-h-[70vh] overflow-auto divide-y divide-slate-100">
                            {clientes.map(c=>{
                                const conLinea = Number(c.limiteCredito ?? 0) > 0;
                                const elegido = seleccionado === c.id;
                                return (
                                    <button key={c.id} onClick={()=>setSeleccionado(c.id)}
                                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                                            elegido ? 'bg-indigo-50' : 'hover:bg-slate-50'} ${!c.activo?'opacity-50':''}`}>
                                        <div className="flex items-start gap-2">
                                            <span className={`w-1 self-stretch rounded-full shrink-0 ${elegido?'bg-indigo-500':'bg-transparent'}`}/>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm truncate ${elegido?'font-bold text-indigo-900':'font-semibold text-slate-800'}`}>
                                                    {c.nombre}
                                                </p>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    {c.rfc || c.email || (c.tipoPersona==='MORAL'?'Persona moral':'Persona física')}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${conLinea?'text-emerald-700':'text-slate-300'}`}>
                                                {conLinea ? `$${Number(c.limiteCredito).toLocaleString('es-MX')}` : '—'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Columna derecha: el expediente ──────────────────────── */}
                <div>
                    {!clienteActivo ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-20 flex flex-col items-center text-center px-6">
                            <Users className="w-12 h-12 text-slate-200 mb-4"/>
                            <p className="font-semibold text-slate-700">Elige un cliente</p>
                            <p className="text-sm text-slate-500 mt-1 max-w-sm">
                                Aquí aparece su expediente: identidad, línea de crédito y todas las
                                verificaciones que se le han hecho.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Ficha de identidad y estado */}
                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                            Expediente del cliente
                                        </p>
                                        <h2 className="text-lg font-semibold text-slate-900 mt-0.5">{clienteActivo.nombre}</h2>
                                        <p className="text-xs text-slate-500 mt-1">
                                            <span className="font-mono">{[clienteActivo.rfc, clienteActivo.curp].filter(Boolean).join(' · ') || 'sin RFC ni CURP'}</span>
                                            {clienteActivo.email && <> · {clienteActivo.email}</>}
                                            {clienteActivo.telefono && <> · {clienteActivo.telefono}</>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Link href={`/dashboard/clientes/${clienteActivo.id}/expediente`}
                                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="Abrir el expediente a pantalla completa">
                                            <FileText className="w-4 h-4"/>
                                        </Link>
                                        {clienteActivo.estadoCredito === 'AUTORIZADO' && (
                                            <button onClick={()=>gestionarCredito(clienteActivo,'SUSPENDER')}
                                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Suspender crédito">
                                                <AlertTriangle className="w-4 h-4"/>
                                            </button>
                                        )}
                                        <button onClick={()=>abrirEditar(clienteActivo)}
                                            className="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                            <Edit2 className="w-4 h-4"/> Editar
                                        </button>
                                        <button onClick={()=>toggleEstado(clienteActivo.id, clienteActivo.activo)}
                                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                                            title={clienteActivo.activo?'Desactivar':'Activar'}>
                                            <Power className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                                    <div className="px-5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tipo</p>
                                        <p className="text-sm font-semibold text-slate-900 mt-0.5">
                                            {clienteActivo.tipoPersona==='MORAL'?'Persona moral':'Persona física'}
                                        </p>
                                        <p className="text-[11px] text-slate-400">{clienteActivo.activo?'Activo':'Inactivo'}</p>
                                    </div>
                                    <div className="px-5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Línea de crédito</p>
                                        <p className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                                            {Number(clienteActivo.limiteCredito ?? 0) > 0
                                                ? `$${Number(clienteActivo.limiteCredito).toLocaleString('es-MX')}`
                                                : 'Sin línea'}
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                            {Number(clienteActivo.limiteCredito ?? 0) > 0
                                                ? `${clienteActivo.diasCredito} días · v${clienteActivo.versionCredito ?? 1}`
                                                : 'compra de contado'}
                                        </p>
                                    </div>
                                    <div className="px-5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado</p>
                                        <p className="text-sm font-semibold text-slate-900 mt-0.5">
                                            {(clienteActivo.estadoCredito ?? 'SIN_CREDITO').replace(/_/g,' ').toLowerCase()}
                                        </p>
                                        <p className="text-[11px] text-slate-400">Riesgo {clienteActivo.nivelRiesgo ?? 'MEDIO'}</p>
                                    </div>
                                    <div className="px-5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Propuesta</p>
                                        {Number(clienteActivo.limiteCreditoSolicitado ?? 0) > 0 ? (
                                            <>
                                                <p className="text-sm font-semibold text-indigo-700 mt-0.5 tabular-nums">
                                                    ${Number(clienteActivo.limiteCreditoSolicitado).toLocaleString('es-MX')}
                                                </p>
                                                <p className="text-[11px] text-slate-400">
                                                    {(clienteActivo.estadoSolicitudCredito ?? '').toLowerCase()}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="text-sm text-slate-400 mt-0.5">Ninguna</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Verificaciones e historia */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <ExpedienteCliente clienteId={clienteActivo.id} limiteHistoria={4}/>
                            </div>
                        </div>
                    )}
                </div>
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
                                                        onChange={(e)=>setFormData(f=>({...f,tipoPersona:e.target.value as 'FISICA'|'MORAL',clasificacionHotelera:e.target.value==='MORAL'?f.clasificacionHotelera:''}))}
                                                        className="accent-indigo-600"/>
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
                                            <Campo label="CURP" name="curp" error={errors.curp} touched={touched.curp}>
                                                {/* Se capturaba con verificación contra RENAPO. Se quitó: esa
                                                    integración se hará aparte más adelante, y hasta entonces
                                                    la CURP es un dato que se teclea, no uno que se comprueba.
                                                    Dejarla con botón de «Verificar» prometía una comprobación
                                                    que ya no ocurre. La identidad se valida en el flujo de
                                                    verificación de crédito, que es donde corresponde. */}
                                                <input name="curp" value={formData.curp ?? ''}
                                                    onChange={handleChange} onBlur={handleBlur}
                                                    placeholder="18 caracteres" maxLength={18}
                                                    className={`${inputCls(errors.curp, touched.curp)} uppercase font-mono tracking-wider`}/>
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
                                            <select name="estadoId" value={formData.estadoId}
                                                onChange={e=>{const x=estados.find(s=>s.id===e.target.value);setFormData(f=>({...f,estadoId:e.target.value,estado:x?.nombre||''}));}}
                                                className={inputCls(errors.estado, touched.estado)}>
                                                <option value="">— Estado / provincia —</option>
                                                {estados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                                            </select>
                                        </Campo>
                                        <Campo label="Código Postal" name="codigoPostal" error={errors.codigoPostal} touched={touched.codigoPostal}>
                                            <input name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} onBlur={handleBlur}
                                                placeholder="5 dígitos" maxLength={5}
                                                className={inputCls(errors.codigoPostal, touched.codigoPostal)}/>
                                        </Campo>
                                        <Campo label="País" name="pais" error={errors.pais} touched={touched.pais}>
                                            <select name="paisId" value={formData.paisId}
                                                onChange={e=>{const p=paises.find(x=>x.id===e.target.value);setFormData(f=>({...f,paisId:e.target.value,pais:p?.nombre||'',estadoId:'',estado:''}));}}
                                                className={inputCls(errors.pais, touched.pais)}>
                                                <option value="">— País —</option>
                                                {paises.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                                            </select>
                                        </Campo>
                                    </div>
                                </div>

                                {/* ── LÍNEA DE CRÉDITO ─────────────────────────────────────────
                                    Fuera del alta, y a propósito.

                                    No todo cliente pide crédito: muchos compran de contado y no
                                    tienen por qué pasar por una verificación de identidad ni por un
                                    buró. Tener el límite como «sección 4» del alta invitaba a
                                    teclear una cifra antes de haber validado nada, y convertía en
                                    trámite de crédito el simple hecho de registrar a alguien.

                                    Abrir una línea es un acto aparte: primero existe la persona,
                                    después —si lo pide— se le verifica, y sólo entonces se propone
                                    un importe. Por eso este panel no aparece al dar de alta. */}
                                {editId && (
                                <div className="mb-5 rounded-2xl border border-slate-200 overflow-hidden">
                                    <div className="flex items-center justify-between gap-3 bg-slate-50 border-b border-slate-200 px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-slate-400"/>
                                            <h3 className="text-sm font-bold text-slate-700">Línea de crédito</h3>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Link href={`/dashboard/clientes/${editId}/expediente`}
                                                className="text-[11px] font-semibold text-indigo-600 hover:underline">
                                                Ver expediente completo
                                            </Link>
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                Opcional · sólo si la solicita
                                            </span>
                                        </div>
                                    </div>

                                    {/* El ciclo, para que se vea en qué paso va y cuál falta. */}
                                    <div className="flex items-center gap-1 px-4 pt-4 pb-1 text-[11px] font-semibold">
                                        {(() => {
                                            const tieneExp = !!expediente && expediente.estado !== 'RECHAZADA';
                                            const tienePropuesta = Number(formData.limiteCredito || 0) > 0;
                                            const autorizada = clienteEnEdicion?.estadoCredito === 'AUTORIZADO'
                                                && Number(clienteEnEdicion?.limiteCredito ?? 0) > 0;
                                            const pasos = [
                                                { etiqueta: 'Solicitud',  hecho: true },
                                                { etiqueta: 'Verificación', hecho: tieneExp },
                                                { etiqueta: 'Propuesta',  hecho: tienePropuesta },
                                                { etiqueta: 'Autorizada', hecho: autorizada },
                                            ];
                                            return pasos.map((x, i) => (
                                                <span key={x.etiqueta} className="flex items-center gap-1">
                                                    {i > 0 && <span className="text-slate-300">›</span>}
                                                    <span className={x.hecho
                                                        ? 'text-emerald-700'
                                                        : 'text-slate-300'}>{x.etiqueta}</span>
                                                </span>
                                            ));
                                        })()}
                                    </div>

                                    <div className="p-4 pt-3">

                                    {/* ── Expediente de verificación ──────────────────────────
                                        Lo que el candado de aprobación va a exigir, dicho aquí.
                                        Sin flujo activo no se pinta nada: sería ruido. */}
                                    {flujoVerif && (() => {
                                        const propuesto = Number(formData.limiteCredito || 0);
                                        const verificado = Number(expediente?.limiteSolicitado ?? 0);
                                        const enlace = (
                                            <Link href="/dashboard/creditos/verificacion/ejecutar"
                                                className="underline font-semibold whitespace-nowrap">
                                                Verificar ahora
                                            </Link>
                                        );

                                        if (!editId) return (
                                            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                                                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-slate-400"/>
                                                <span>
                                                    La empresa tiene activo el flujo <strong>{flujoVerif.nombre}</strong>.
                                                    Podrás verificar a esta persona en cuanto se guarde; la línea no se
                                                    autoriza sin expediente.
                                                </span>
                                            </div>
                                        );

                                        if (expediente === undefined) return (
                                            <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin"/> Buscando expediente de verificación…
                                            </div>
                                        );

                                        if (!expediente) return (
                                            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600"/>
                                                <span>
                                                    Este cliente <strong>no tiene expediente de verificación</strong>, y el flujo
                                                    <strong> {flujoVerif.nombre}</strong> está activo. Puedes capturar la propuesta,
                                                    pero la autorización de la línea se va a negar hasta que se verifique. {enlace}
                                                </span>
                                            </div>
                                        );

                                        if (expediente.estado === 'RECHAZADA') return (
                                            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600"/>
                                                <span>
                                                    El expediente de este cliente quedó <strong>RECHAZADO</strong>
                                                    {(expediente.motivos ?? []).length > 0 && <>: {(expediente.motivos as string[]).join(' ')}</>}
                                                    . No se puede autorizar una línea con este expediente. {enlace}
                                                </span>
                                            </div>
                                        );

                                        if (propuesto > verificado + 0.005) return (
                                            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600"/>
                                                <span>
                                                    El expediente se hizo por <strong>${verificado.toLocaleString('es-MX')}</strong>
                                                    {' '}y estás proponiendo <strong>${propuesto.toLocaleString('es-MX')}</strong>.
                                                    Hay que volver a verificar por el importe que se va a autorizar: no se valida
                                                    barato una vez para autorizar caro después. {enlace}
                                                </span>
                                            </div>
                                        );

                                        return (
                                            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600"/>
                                                <span>
                                                    Expediente <strong>{String(expediente.estado).replace(/_/g,' ').toLowerCase()}</strong>
                                                    {' '}por hasta <strong>${verificado.toLocaleString('es-MX')}</strong>, puntaje
                                                    {' '}{expediente.puntaje}
                                                    {expediente.fechaCreacion && <> · {new Date(expediente.fechaCreacion).toLocaleDateString('es-MX')}</>}
                                                    . La propuesta cabe dentro de lo verificado.
                                                </span>
                                            </div>
                                        );
                                    })()}

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
                                        <Campo label="Nivel de riesgo" name="nivelRiesgo" error={errors.nivelRiesgo} touched={touched.nivelRiesgo}>
                                            <select name="nivelRiesgo" value={formData.nivelRiesgo}
                                                onChange={handleChange} onBlur={handleBlur}
                                                className={inputCls(errors.nivelRiesgo, touched.nivelRiesgo)}>
                                                <option value="BAJO">Bajo</option>
                                                <option value="MEDIO">Medio</option>
                                                <option value="ALTO">Alto</option>
                                            </select>
                                        </Campo>
                                        <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                            <label className="flex items-start gap-3 text-sm font-semibold text-amber-900">
                                                <input type="checkbox" className="mt-0.5"
                                                    checked={formData.bloquearCreditoConSaldoVencido}
                                                    onChange={(e)=>setFormData(f=>({...f,bloquearCreditoConSaldoVencido:e.target.checked}))}/>
                                                <span>
                                                    Bloquear nuevas operaciones a crédito cuando exista saldo vencido global.
                                                    <span className="mt-1 block text-xs font-normal text-amber-700">
                                                        Esta política aplica por igual a Ventas y City Ledger y forma parte de las condiciones sometidas a aprobación.
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                        {formData.tipoPersona === 'MORAL' && (
                                            <Campo label="Clasificación para Hotelería" name="clasificacionHotelera" error={errors.clasificacionHotelera} touched={touched.clasificacionHotelera}>
                                                <select name="clasificacionHotelera" value={formData.clasificacionHotelera || ''}
                                                    onChange={handleChange} onBlur={handleBlur}
                                                    className={inputCls(errors.clasificacionHotelera, touched.clasificacionHotelera)}>
                                                    <option value="">— No participa en convenios hoteleros —</option>
                                                    <option value="EMPRESA">Empresa</option>
                                                    <option value="AGENCIA">Agencia de viajes</option>
                                                </select>
                                            </Campo>
                                        )}
                                        {(formData.limiteCredito > 0 || formData.diasCredito > 0) && (
                                            <div className="col-span-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-xs text-indigo-700 flex items-center gap-2">
                                                <CreditCard className="w-4 h-4"/>
                                                La propuesta de <strong>${formData.limiteCredito.toLocaleString('es-MX')}</strong> a{' '}
                                                <strong>{formData.diasCredito} días</strong>, riesgo <strong>{formData.nivelRiesgo}</strong> y política de vencidos se enviará al flujo maker-checker. Una línea ya autorizada seguirá vigente hasta la resolución final; los convenios nunca consumen la propuesta, sólo la versión aprobada.
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                </div>
                                )}


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
