"use client";
import { useState, useEffect } from 'react';
import {
  Landmark, Plus, X, Edit2, Power, CheckCircle2, AlertCircle,
  CreditCard, Banknote, Building2, Save
} from 'lucide-react';
import { PuedeCrear, PuedeEditar } from '@/app/components/ProtectedElement';

interface ICuentaContable { id: string; numeroCuenta: string; nombre: string; }
interface ICuentaBancaria {
  id: string; nombre: string; tipo: string;
  numeroCuenta: string | null; cuentaContableId: string | null;
  cuentaContable?: ICuentaContable; esPorDefecto: boolean; activo: boolean;
}

const TIPOS = [
  { value: 'CAJA',  label: 'Caja',             icon: Banknote,  color: 'emerald', desc: 'Efectivo físico en caja' },
  { value: 'TPV',   label: 'Terminal / TPV',    icon: CreditCard, color: 'blue',  desc: 'Cobros con tarjeta débito y crédito' },
  { value: 'BANCO', label: 'Banco / SPEI',      icon: Building2,  color: 'purple', desc: 'Transferencias bancarias' },
];

const TIPO_STYLE: Record<string, string> = {
  CAJA:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  TPV:   'bg-blue-50 text-blue-700 border-blue-200',
  BANCO: 'bg-purple-50 text-purple-700 border-purple-200',
};

const FORM_VACIO = { nombre:'', tipo:'CAJA', numeroCuenta:'', cuentaContableId:'', esPorDefecto: false };

export default function CuentasBancariasPage() {
  const [cuentas, setCuentas]       = useState<ICuentaBancaria[]>([]);
  const [ctasContables, setCtasContables] = useState<ICuentaContable[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [modal, setModal]           = useState(false);
  const [editando, setEditando]     = useState<ICuentaBancaria | null>(null);
  const [form, setForm]             = useState(FORM_VACIO);
  const [guardando, setGuardando]   = useState(false);
  const [toast, setToast]           = useState<{msg:string;ok:boolean}|null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const toast$ = (msg:string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),4000); };

  const cargar = async () => {
    setCargando(true);
    const h = { Authorization: `Bearer ${tok()}` };
    const [rCB, rCC] = await Promise.all([
      fetch(`${api}/credito/cuentas-bancarias`, { headers: h }),
      fetch(`${api}/finanzas/cuentas-contables?soloAfectables=true`, { headers: h }),
    ]);
    if (rCB.ok) setCuentas(await rCB.json());
    if (rCC.ok) setCtasContables(await rCC.json());
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const abrirCrear = () => {
    setEditando(null); setForm(FORM_VACIO); setModal(true);
  };
  const abrirEditar = (c: ICuentaBancaria) => {
    setEditando(c);
    setForm({ nombre: c.nombre, tipo: c.tipo, numeroCuenta: c.numeroCuenta??'',
      cuentaContableId: c.cuentaContableId??'', esPorDefecto: c.esPorDefecto });
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast$('El nombre es obligatorio', false); return; }
    setGuardando(true);
    const url = editando
      ? `${api}/credito/cuentas-bancarias/${editando.id}`
      : `${api}/credito/cuentas-bancarias`;
    const res = await fetch(url, {
      method: editando ? 'PATCH' : 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok()}` },
      body: JSON.stringify({
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        numeroCuenta: form.numeroCuenta || null,
        cuentaContableId: form.cuentaContableId || null,
        esPorDefecto: form.esPorDefecto,
      }),
    });
    setGuardando(false);
    if (res.ok) { setModal(false); cargar(); toast$(editando ? 'Cuenta actualizada' : 'Cuenta creada'); }
    else { const e=await res.json().catch(()=>({})); toast$(e.message??'Error al guardar', false); }
  };

  const toggleEstado = async (c: ICuentaBancaria) => {
    if (!confirm(`¿${c.activo?'Desactivar':'Activar'} "${c.nombre}"?`)) return;
    const res = await fetch(`${api}/credito/cuentas-bancarias/${c.id}/estado`, {
      method:'PATCH', headers:{ Authorization:`Bearer ${tok()}` },
    });
    if (res.ok) { cargar(); toast$(c.activo?'Desactivada':'Activada'); }
    else toast$('Error', false);
  };

  const caja  = cuentas.filter(c => c.tipo==='CAJA'  && c.activo);
  const tpv   = cuentas.filter(c => c.tipo==='TPV'   && c.activo);
  const banco = cuentas.filter(c => c.tipo==='BANCO' && c.activo);
  const inactivas = cuentas.filter(c => !c.activo);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok?'bg-emerald-600':'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Crédito & Cobranza</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Landmark className="w-8 h-8 text-indigo-500"/> Cuentas Bancarias
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Define dónde entra el dinero según el método de pago. Cada cuenta se vincula a su cuenta contable.
          </p>
        </div>
        <PuedeCrear ruta="/credito/cuentas-bancarias">
          <button onClick={abrirCrear}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-md">
            <Plus className="w-4 h-4"/> Nueva Cuenta
          </button>
        </PuedeCrear>
      </div>

      {cargando ? (
        <div className="p-20 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando cuentas...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tipos de cuenta */}
          {[
            { tipo:'CAJA',  lista:caja,  icon:Banknote,  color:'emerald', titulo:'Caja', desc:'Pagos en efectivo' },
            { tipo:'TPV',   lista:tpv,   icon:CreditCard, color:'blue',  titulo:'Terminal / TPV', desc:'Tarjeta débito y crédito' },
            { tipo:'BANCO', lista:banco, icon:Building2,  color:'purple', titulo:'Banco / SPEI', desc:'Transferencias' },
          ].map(({ tipo, lista, icon: Icon, color, titulo, desc }) => (
            <div key={tipo} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`flex items-center gap-3 px-6 py-4 bg-${color}-50 border-b border-${color}-100`}>
                <div className={`p-2 rounded-lg bg-${color}-100`}>
                  <Icon className={`w-5 h-5 text-${color}-600`}/>
                </div>
                <div>
                  <p className={`font-bold text-${color}-900`}>{titulo}</p>
                  <p className={`text-xs text-${color}-700`}>{desc}</p>
                </div>
                <span className={`ml-auto text-sm font-bold text-${color}-700`}>{lista.length} cuenta(s)</span>
              </div>

              {lista.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-slate-400 text-sm">No hay cuentas de este tipo.</p>
                  <button onClick={abrirCrear}
                    className="mt-3 text-sm text-indigo-600 font-semibold hover:underline">
                    + Agregar una
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {lista.map(c => (
                    <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800">{c.nombre}</p>
                          {c.esPorDefecto && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                              Por defecto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          {c.numeroCuenta && (
                            <span className="text-xs font-mono text-slate-500">{c.numeroCuenta}</span>
                          )}
                          {c.cuentaContable && (
                            <span className="text-xs text-slate-400">
                              → {c.cuentaContable.numeroCuenta} {c.cuentaContable.nombre}
                            </span>
                          )}
                          {!c.cuentaContable && (
                            <span className="text-xs text-amber-600 font-medium">⚠ Sin cuenta contable</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <PuedeEditar ruta="/credito/cuentas-bancarias/:id">
                          <button onClick={() => abrirEditar(c)}
                            className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4"/>
                          </button>
                        </PuedeEditar>
                        <PuedeEditar ruta="/credito/cuentas-bancarias/:id/estado">
                          <button onClick={() => toggleEstado(c)}
                            className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors">
                            <Power className="w-4 h-4"/>
                          </button>
                        </PuedeEditar>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Inactivas */}
          {inactivas.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-60">
              <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-500">Desactivadas ({inactivas.length})</p>
              </div>
              {inactivas.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50">
                  <p className="flex-1 text-sm text-slate-500 line-through">{c.nombre}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TIPO_STYLE[c.tipo]}`}>{c.tipo}</span>
                  <button onClick={() => toggleEstado(c)}
                    className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg text-xs font-medium">
                    <Power className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {cuentas.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
              <Landmark className="w-12 h-12 text-slate-200 mx-auto mb-4"/>
              <p className="font-semibold text-slate-600">Sin cuentas configuradas</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Crea al menos una caja y una cuenta para tarjetas antes de procesar pagos
              </p>
              <button onClick={abrirCrear}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700">
                <Plus className="w-4 h-4"/> Crear primera cuenta
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal crear / editar */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <Landmark className="w-5 h-5 text-indigo-400"/>
                {editando ? `Editar — ${editando.nombre}` : 'Nueva Cuenta Bancaria'}
              </h2>
              <button onClick={()=>setModal(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Tipo de cuenta *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.value} onClick={()=>setForm(f=>({...f,tipo:t.value}))}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                        form.tipo===t.value
                          ? `border-${t.color}-500 bg-${t.color}-50`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <t.icon className={`w-5 h-5 ${form.tipo===t.value?`text-${t.color}-600`:'text-slate-400'}`}/>
                      <span className="text-xs font-semibold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}
                  placeholder={form.tipo==='CAJA'?'Ej. Caja General':form.tipo==='TPV'?'Ej. TPV BBVA':'Ej. Banco BBVA SPEI'}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>

              {/* Número de cuenta (solo si BANCO o TPV) */}
              {form.tipo !== 'CAJA' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    {form.tipo==='TPV' ? 'Número de afiliación (opcional)' : 'Número de cuenta (opcional)'}
                  </label>
                  <input value={form.numeroCuenta} onChange={e=>setForm(f=>({...f,numeroCuenta:e.target.value}))}
                    placeholder={form.tipo==='TPV'?'123456':'CLABE o número de cuenta'}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              )}

              {/* Cuenta contable */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Cuenta contable *
                </label>
                <select value={form.cuentaContableId} onChange={e=>setForm(f=>({...f,cuentaContableId:e.target.value}))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Seleccionar cuenta —</option>
                  {ctasContables.filter(c=>c.numeroCuenta.startsWith('1')).map(c=>(
                    <option key={c.id} value={c.id}>{c.numeroCuenta} – {c.nombre}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Solo cuentas de Activo (1xxx). Si no ves la tuya, créala primero en Catálogo de Cuentas.</p>
              </div>

              {/* Por defecto */}
              <label className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.esPorDefecto} onChange={e=>setForm(f=>({...f,esPorDefecto:e.target.checked}))}
                  className="w-4 h-4 text-indigo-600 rounded"/>
                <div>
                  <p className="text-sm font-bold text-indigo-900">Cuenta por defecto</p>
                  <p className="text-xs text-indigo-700">El POS usará esta cuenta cuando no se seleccione otra</p>
                </div>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={()=>setModal(false)} className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button onClick={guardar} disabled={guardando}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save className="w-4 h-4"/>}
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear cuenta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
