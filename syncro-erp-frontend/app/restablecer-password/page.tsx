// app/restablecer-password/page.tsx
"use client";
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Check, X, Lock, ArrowRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// ── Fuerza de contraseña (mismas reglas que el registro) ────────────────────
function calcularFuerza(pwd: string) {
  const reglas = [
    { regex: /.{8,}/,         label: 'Mínimo 8 caracteres' },
    { regex: /[A-Z]/,         label: 'Una mayúscula'       },
    { regex: /[a-z]/,         label: 'Una minúscula'       },
    { regex: /[0-9]/,         label: 'Un número'           },
    { regex: /[^A-Za-z0-9]/,  label: 'Un símbolo (!@#…)'   },
  ];
  const resultados = reglas.map(r => ({ label: r.label, ok: r.regex.test(pwd) }));
  return { score: resultados.filter(r => r.ok).length, reglas: resultados };
}

const NIVELES = [
  { min: 0, label: '',          color: '#e2e8f0' },
  { min: 1, label: 'Muy débil', color: '#e11d48' },
  { min: 2, label: 'Débil',     color: '#f97316' },
  { min: 3, label: 'Regular',   color: '#eab308' },
  { min: 4, label: 'Fuerte',    color: '#22c55e' },
  { min: 5, label: 'Excelente', color: '#10b981' },
];

function RestablecerContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token') ?? '';
  const api    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [password, setPassword]   = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [listo, setListo]         = useState(false);
  const [error, setError]         = useState('');

  const { score, reglas } = calcularFuerza(password);
  const nivel = NIVELES.reduce((acc, n) => (score >= n.min ? n : acc), NIVELES[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (score < 4)              { setError('La contraseña es muy débil'); return; }
    if (password !== confirmar) { setError('Las contraseñas no coinciden'); return; }

    setEnviando(true);
    try {
      const r = await fetch(`${api}/auth/restablecer-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setListo(true);
        setTimeout(() => router.push('/login'), 2500);
      } else {
        const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
        setError(m || 'El enlace expiró o ya fue utilizado.');
      }
    } catch {
      setError('Error de conexión con el servidor');
    }
    setEnviando(false);
  };

  // Sin token en la URL → enlace roto
  if (!token) return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
      <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <XCircle className="w-10 h-10 text-rose-600"/>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Enlace incompleto</h2>
      <p className="text-slate-500 text-sm mb-6">
        Falta el token en la dirección. Usa el enlace exacto del correo o solicita uno nuevo.
      </p>
      <Link href="/recuperar-password"
        className="block w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all text-sm">
        Solicitar nuevo enlace
      </Link>
    </div>
  );

  if (listo) return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-emerald-600"/>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Contraseña actualizada!</h2>
      <p className="text-slate-500 text-sm mb-4">Ya puedes iniciar sesión con tu nueva contraseña.</p>
      <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
        <Loader2 className="w-4 h-4 animate-spin"/> Redirigiendo al inicio de sesión…
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Crea tu nueva contraseña</h2>
      <p className="text-slate-500 text-sm mb-6">Elige una contraseña fuerte que no uses en otros sitios.</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          <X className="w-4 h-4 shrink-0"/> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <input type={showPwd ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"/>
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </button>
          </div>

          {password && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1 items-center">
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

        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
            Confirmar contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <input type={showConf ? 'text' : 'password'} value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              placeholder="Repite tu contraseña"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"/>
            <button type="button" onClick={() => setShowConf(!showConf)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showConf ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </button>
          </div>
          {confirmar && password === confirmar && (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <Check className="w-3 h-3"/> Las contraseñas coinciden
            </p>
          )}
        </div>

        <button type="submit" disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white
                     font-bold py-3 rounded-xl text-sm shadow-sm transition-all disabled:opacity-60">
          {enviando
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Guardando…</>
            : <><ArrowRight className="w-4 h-4"/> Guardar nueva contraseña</>}
        </button>
      </form>
    </div>
  );
}

// useSearchParams requiere Suspense en App Router
export default function RestablecerPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-14 h-14 animate-spin text-indigo-400"/>}>
        <RestablecerContent/>
      </Suspense>
    </div>
  );
}
