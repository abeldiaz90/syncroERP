"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Loader2, ServerOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<{ message: string; type: 'auth' | 'network' } | null>(null);
  
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    
    setCargando(true);
    setError(null);

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').trim();

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('syncro_token', data.access_token);
        localStorage.setItem('syncro_user', JSON.stringify(data.usuario));
        localStorage.setItem('syncro_permisos', JSON.stringify(data.permisos || []));
        
        // Navegación nativa de Next.js (más rápida)
        router.push('/dashboard');
      } else {
        setError({
          type: 'auth',
          message: res.status === 401 ? 'Correo o contraseña incorrectos.' : (data.message || 'Error al iniciar sesión')
        });
      }
    } catch (err) {
      setError({
        type: 'network',
        message: 'No se pudo conectar con el servidor. Intenta de nuevo más tarde.'
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 transition-all duration-300">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Syncro ERP</h1>
          <p className="text-slate-500 mt-1 font-medium">Inicia sesión para continuar</p>
        </div>

        {error && (
          <div className={`mb-6 p-4 rounded-2xl flex items-start gap-3 text-sm animate-in fade-in ${error.type === 'network' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>
            {error.type === 'network' ? <ServerOff className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
            <p className="font-medium">{error.message}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700 ml-1">Correo Electrónico</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700 ml-1">Contraseña</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input
                type={verPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors p-1"
              >
                {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-lg hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all active:scale-[0.98] disabled:bg-indigo-300 disabled:shadow-none flex items-center justify-center gap-2 mt-2"
          >
            {cargando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Accediendo...
              </>
            ) : 'Entrar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}