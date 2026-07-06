"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Check, X, Building2, User, Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

// ── Fuerza de contraseña ─────────────────────────────────────────────────────
function calcularFuerza(pwd: string) {
  let score = 0;
  const reglas = [
    { regex: /.{8,}/,          label: 'Mínimo 8 caracteres' },
    { regex: /[A-Z]/,          label: 'Una mayúscula'       },
    { regex: /[a-z]/,          label: 'Una minúscula'       },
    { regex: /[0-9]/,          label: 'Un número'           },
    { regex: /[^A-Za-z0-9]/,  label: 'Un símbolo (!@#…)'   },
  ];
  const resultados = reglas.map(r => ({ label: r.label, ok: r.regex.test(pwd) }));
  score = resultados.filter(r => r.ok).length;
  return { score, reglas: resultados };
}

const NIVELES = [
  { min: 0, label: '',          color: '#e2e8f0' },
  { min: 1, label: 'Muy débil', color: '#e11d48' },
  { min: 2, label: 'Débil',     color: '#f97316' },
  { min: 3, label: 'Regular',   color: '#eab308' },
  { min: 4, label: 'Fuerte',    color: '#22c55e' },
  { min: 5, label: 'Excelente', color: '#10b981' },
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    nombreComercial: '', nombreCompleto: '', email: '', password: '', confirmar: '',
  });
  const [terms, setTerms]         = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [enviado, setEnviado]     = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [touched, setTouched]     = useState<Record<string, boolean>>({});

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const { score, reglas } = calcularFuerza(form.password);
  const nivel = NIVELES.reduce((acc, n) => score >= n.min ? n : acc, NIVELES[0]);

  const validar = (f = form) => {
    const e: Record<string, string> = {};
    if (!f.nombreComercial.trim())           e.nombreComercial = 'Nombre de empresa requerido';
    if (!f.nombreCompleto.trim())            e.nombreCompleto  = 'Tu nombre es requerido';
    if (!f.email.trim())                     e.email           = 'Correo requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Correo inválido';
    if (score < 4)                           e.password        = 'La contraseña es muy débil';
    if (f.password !== f.confirmar)          e.confirmar       = 'Las contraseñas no coinciden';
    if (!terms)                              e.terms           = 'Debes aceptar los términos';
    return e;
  };

  const handleChange = (field: string, value: string) => {
    const nf = { ...form, [field]: value };
    setForm(nf);
    if (touched[field]) setErrors(validar(nf));
  };
  const handleBlur = (field: string) => {
    setTouched(t => ({ ...t, [field]: true }));
    setErrors(validar());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allTouched = Object.keys(form).reduce((a, k) => ({ ...a, [k]: true }), {});
    setTouched({ ...allTouched, terms: true });
    const errs = validar();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEnviando(true);
    try {
      const r = await fetch(`${api}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreComercial: form.nombreComercial, nombreCompleto: form.nombreCompleto, email: form.email, password: form.password }),
      });
      if (r.ok) {
        setEnviado(true);
      } else {
        const d = await r.json().catch(() => null);
        setErrors({ general: d?.message || 'Error al registrar. Intenta de nuevo.' });
      }
    } catch {
      setErrors({ general: 'Error de conexión. Verifica tu internet.' });
    }
    setEnviando(false);
  };

  const inputCls = (field: string) =>
    `w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition-all ${
      touched[field] && errors[field]
        ? 'border-rose-400 bg-rose-50 focus:ring-2 focus:ring-rose-200'
        : 'border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

  // ── Pantalla de éxito ────────────────────────────────────────────────────
  if (enviado) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600"/>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">¡Revisa tu correo!</h2>
        <p className="text-slate-500 mb-6">
          Enviamos un enlace de verificación a <strong className="text-slate-700">{form.email}</strong>.
          Haz clic en el enlace para activar tu cuenta y comenzar.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 text-left mb-6">
          <p className="font-semibold mb-1">⏱ El enlace expira en 24 horas</p>
          <p>Si no lo ves, revisa tu carpeta de spam.</p>
        </div>
        <button
          onClick={async () => {
            await fetch(`${api}/auth/reenviar-verificacion`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: form.email }),
            });
            alert('Nuevo enlace enviado.');
          }}
          className="text-sm text-indigo-600 hover:underline"
        >
          ¿No llegó? Reenviar verificación
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex">

      {/* Panel izquierdo — beneficios */}
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-center px-12 py-10 text-white">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">S</span>
            </div>
            <span className="font-bold text-lg">SyncroERP</span>
          </div>
          <h1 className="text-4xl font-black leading-tight mb-4">
            Tu empresa,<br/>bajo control.
          </h1>
          <p className="text-slate-400 text-lg">
            ERP mexicano diseñado para PYMEs. Sin complicaciones, sin costos ocultos.
          </p>
        </div>

        <div className="space-y-5">
          {[
            { icon: '🏪', titulo: 'Ventas y POS',         desc: 'Punto de venta, crédito y cobranza integrados' },
            { icon: '📦', titulo: 'Inventario real',       desc: 'Stock multi-almacén con alertas automáticas'   },
            { icon: '📊', titulo: 'Contabilidad SAT',      desc: 'Pólizas automáticas, IVA y balanza en tiempo real' },
            { icon: '🤖', titulo: 'RPA integrado',         desc: 'Verificación CURP, SAT y más automatizado'     },
          ].map(b => (
            <div key={b.titulo} className="flex items-start gap-4 bg-white/5 rounded-xl px-4 py-3">
              <span className="text-2xl">{b.icon}</span>
              <div>
                <p className="font-semibold text-sm">{b.titulo}</p>
                <p className="text-slate-400 text-xs mt-0.5">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-slate-500 text-sm">
          ✓ 14 días gratis · ✓ Sin tarjeta de crédito · ✓ Cancela cuando quieras
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

          {/* Logo móvil */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">S</span>
            </div>
            <span className="font-bold text-slate-900">SyncroERP</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Crear cuenta gratis</h2>
          <p className="text-slate-500 text-sm mb-6">14 días de prueba · Sin tarjeta de crédito</p>

          {errors.general && (
            <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <X className="w-4 h-4 shrink-0"/> {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Empresa */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Nombre de tu empresa <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                <input value={form.nombreComercial}
                  onChange={e => handleChange('nombreComercial', e.target.value)}
                  onBlur={() => handleBlur('nombreComercial')}
                  placeholder="Ej. Distribuidora García S.A."
                  className={inputCls('nombreComercial')}/>
              </div>
              {touched.nombreComercial && errors.nombreComercial && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <X className="w-3 h-3"/> {errors.nombreComercial}
                </p>
              )}
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Tu nombre completo <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                <input value={form.nombreCompleto}
                  onChange={e => handleChange('nombreCompleto', e.target.value)}
                  onBlur={() => handleBlur('nombreCompleto')}
                  placeholder="Ej. María González López"
                  className={inputCls('nombreCompleto')}/>
              </div>
              {touched.nombreCompleto && errors.nombreCompleto && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <X className="w-3 h-3"/> {errors.nombreCompleto}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Correo electrónico <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                <input type="email" value={form.email}
                  onChange={e => handleChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder="tu@empresa.com"
                  className={inputCls('email')}/>
              </div>
              {touched.email && errors.email && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <X className="w-3 h-3"/> {errors.email}
                </p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Contraseña <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder="Mínimo 8 caracteres"
                  className={`${inputCls('password')} pr-10`}/>
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>

              {/* Barra de fuerza */}
              {form.password && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
                        style={{ background: i <= score ? nivel.color : '#e2e8f0' }}/>
                    ))}
                    <span className="text-xs font-medium ml-2" style={{ color: nivel.color }}>
                      {nivel.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {reglas.map(r => (
                      <div key={r.label} className={`flex items-center gap-1 text-xs ${r.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {r.ok ? <Check className="w-3 h-3"/> : <X className="w-3 h-3"/>} {r.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Confirmar contraseña <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                <input type={showConf ? 'text' : 'password'} value={form.confirmar}
                  onChange={e => handleChange('confirmar', e.target.value)}
                  onBlur={() => handleBlur('confirmar')}
                  placeholder="Repite tu contraseña"
                  className={`${inputCls('confirmar')} pr-10`}/>
                <button type="button" onClick={() => setShowConf(!showConf)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showConf ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
              {touched.confirmar && errors.confirmar && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <X className="w-3 h-3"/> {errors.confirmar}
                </p>
              )}
              {form.confirmar && form.password === form.confirmar && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3"/> Las contraseñas coinciden
                </p>
              )}
            </div>

            {/* Términos */}
            <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-3 transition-all ${
              terms ? 'border-indigo-300 bg-indigo-50' : touched.terms && errors.terms ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
            }`}>
              <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0 ${
                terms ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
              }`} onClick={() => { setTerms(!terms); setTouched(t=>({...t,terms:true})); }}>
                {terms && <Check className="w-3 h-3 text-white" strokeWidth={3}/>}
              </div>
              <span className="text-xs text-slate-600">
                Acepto los{' '}
                <a href="/terminos" target="_blank" className="text-indigo-600 hover:underline font-medium">Términos de Servicio</a>
                {' '}y la{' '}
                <a href="/privacidad" target="_blank" className="text-indigo-600 hover:underline font-medium">Política de Privacidad</a>
              </span>
            </label>
            {touched.terms && errors.terms && (
              <p className="text-xs text-rose-500 flex items-center gap-1">
                <X className="w-3 h-3"/> {errors.terms}
              </p>
            )}

            {/* Submit */}
            <button type="submit" disabled={enviando}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow-sm transition-all disabled:opacity-60 mt-2">
              {enviando
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Creando cuenta…</>
                : <><ArrowRight className="w-4 h-4"/> Crear cuenta gratis</>}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-indigo-600 hover:underline font-medium">Inicia sesión aquí</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
