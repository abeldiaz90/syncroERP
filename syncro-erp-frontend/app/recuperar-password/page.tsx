// app/recuperar-password/page.tsx
"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function RecuperarPasswordPage() {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [email, setEmail]       = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Escribe un correo válido');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`${api}/auth/recuperar-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (r.ok) setEnviado(true);
      else setError('Error al procesar la solicitud. Intenta de nuevo.');
    } catch {
      setError('Error de conexión. Verifica tu internet.');
    }
    setEnviando(false);
  };

  if (enviado) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600"/>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Revisa tu correo</h2>
        <p className="text-slate-500 mb-6">
          Si existe una cuenta con <strong className="text-slate-700">{email}</strong>,
          recibirás un enlace para crear una nueva contraseña.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 text-left mb-6">
          <p className="font-semibold mb-1">⏱ El enlace expira en 1 hora</p>
          <p>Si no lo ves, revisa tu carpeta de spam.</p>
        </div>
        <Link href="/login" className="text-sm text-indigo-600 hover:underline font-medium">
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6">
          <ArrowLeft className="w-4 h-4"/> Volver
        </Link>

        <h2 className="text-2xl font-bold text-slate-900 mb-1">¿Olvidaste tu contraseña?</h2>
        <p className="text-slate-500 text-sm mb-6">
          Escribe el correo de tu cuenta y te enviaremos un enlace para restablecerla.
        </p>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
              <input type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none
                           focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"/>
            </div>
          </div>

          <button type="submit" disabled={enviando}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white
                       font-bold py-3 rounded-xl text-sm shadow-sm transition-all disabled:opacity-60">
            {enviando
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Enviando…</>
              : <><ArrowRight className="w-4 h-4"/> Enviar enlace</>}
          </button>
        </form>
      </div>
    </div>
  );
}
