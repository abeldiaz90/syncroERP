// app/aceptar-invitacion/page.tsx
"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Check, X, Lock, ArrowRight, CheckCircle2, XCircle, Loader2, UserCheck } from 'lucide-react';

function calcularFuerza(pwd: string) {
  const reglas = [
    { regex: /.{8,}/,        label: 'Mínimo 8 caracteres' },
    { regex: /[A-Z]/,        label: 'Una mayúscula' },
    { regex: /[a-z]/,        label: 'Una minúscula' },
    { regex: /[0-9]/,        label: 'Un número' },
    { regex: /[^A-Za-z0-9]/, label: 'Un símbolo (!@#…)' },
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

function AceptarContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token') ?? '';
  const api    = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').trim();

  const [invitacion, setInvitacion] = useState<{ nombreCompleto: string; email: string; rol: string } | null>(null);
  const [cargandoInv, setCargandoInv] = useState(true);
  const [errorInv, setErrorInv] = useState('');

  const [password, setPassword]   = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [listo, setListo]         = useState(false);
  const [error, setError]         = useState('');

  const { score, reglas } = calcularFuerza(password);
  const nivel = NIVELES.reduce((acc, n) => (score >= n.min ? n : acc), NIVELES[0]);

  // Cargar datos de la invitación
  useEffect(() => {
    if (!token) { setErrorInv('Falta el token en el enlace.'); setCargandoInv(false); return; }
    (async () => {
      try {
        const r = await fetch(`${api}/usuarios/invitacion?token=${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => null);
        if (r.ok) setInvitacion(d);
        else setErrorInv(Array.isArray(d?.message) ? d.message.join(', ') : (d?.message || 'Invitación inválida o expirada.'));
      } catch {
        setErrorInv('Error de conexión con el servidor.');
      }
      setCargandoInv(false);
    })();
  }, [token, api]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (score < 4)              { setError('La contraseña es muy débil'); return; }
    if (password !== confirmar) { setError('Las contraseñas no coinciden'); return; }

    setEnviando(true);
    try {
      const r = await fetch(`${api}/usuarios/aceptar-invitacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setListo(true);
        setTimeout(() => router.push('/login'), 2500);
      } else {
        setError(Array.isArray(d?.message) ? d.message.join(', ') : (d?.message || 'No se pudo activar la cuenta.'));
      }
    } catch {
      setError('Error de conexión con el servidor');
    }
    setEnviando(false);
  };

  if (cargandoInv) return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
      <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-3" />
      <p className="text-slate-500">Validando tu invitación…</p>
    </div>
  );

  if (errorInv) return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
      <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <XCircle className="w-10 h-10 text-rose-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Invitación no válida</h2>
      <p className="text-slate-500 text-sm mb-6">{errorInv}</p>
      <Link href="/login" className="text-sm text-indigo-600 hover:underline font-medium">Ir al inicio de sesión</Link>
    </div>
  );

  if (listo) return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Cuenta activada!</h2>
      <p className="text-slate-500 text-sm mb-4">Ya puedes iniciar sesión con tu correo y tu nueva contraseña.</p>
      <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
        <Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo al inicio de sesión…
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
          <UserCheck className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Activa tu cuenta</h2>
          <p className="text-sm text-slate-500">Bienvenido a SyncroERP</p>
        </div>
      </div>

      {invitacion && (
        <div className="bg-slate-50 rounded-xl p-3 mb-5 text-sm">
          <p className="text-slate-700"><span className="font-semibold">{invitacion.nombreCompleto}</span></p>
          <p className="text-slate-500">{invitacion.email} · Rol: <span className="font-medium">{invitacion.rol}</span></p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          <X className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Crea tu contraseña</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type={showPwd ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {password && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1 items-center">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
                    style={{ background: i <= score ? nivel.color : '#e2e8f0' }} />
                ))}
                <span className="text-xs font-medium ml-2" style={{ color: nivel.color }}>{nivel.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {reglas.map(r => (
                  <div key={r.label} className={`flex items-center gap-1 text-xs ${r.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {r.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {r.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Confirmar contraseña</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type={showPwd ? 'text' : 'password'} value={confirmar}
              onChange={e => setConfirmar(e.target.value)} placeholder="Repite tu contraseña"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
          </div>
          {confirmar && password === confirmar && (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Coinciden</p>
          )}
        </div>

        <button type="submit" disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow-sm transition-all disabled:opacity-60">
          {enviando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Activando…</>
            : <><ArrowRight className="w-4 h-4" /> Activar mi cuenta</>}
        </button>
      </form>
    </div>
  );
}

export default function AceptarInvitacionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-14 h-14 animate-spin text-indigo-400" />}>
        <AceptarContent />
      </Suspense>
    </div>
  );
}
