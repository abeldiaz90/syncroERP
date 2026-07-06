"use client";
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function VerificarEmailPage() {
  const params  = useSearchParams();
  const router  = useRouter();
  const token   = params.get('token') ?? '';
  const api     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error' | 'expirado'>('cargando');
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!token) { setEstado('error'); setMsg('Token no encontrado en la URL'); return; }
    fetch(`${api}/auth/verificar-email?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.verificado) {
          setEstado('ok');
          // Redirigir al onboarding después de 2 segundos
          setTimeout(() => router.push('/onboarding'), 2000);
        } else {
          setEstado('error'); setMsg(d.message || 'Error al verificar');
        }
      })
      .catch(() => { setEstado('error'); setMsg('Error de conexión'); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
        {estado === 'cargando' && (
          <>
            <Loader2 className="w-14 h-14 animate-spin text-indigo-500 mx-auto mb-4"/>
            <h2 className="text-xl font-bold text-slate-900">Verificando tu cuenta…</h2>
            <p className="text-slate-500 mt-2 text-sm">Un momento por favor.</p>
          </>
        )}
        {estado === 'ok' && (
          <>
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-emerald-600"/>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Cuenta verificada!</h2>
            <p className="text-slate-500 text-sm mb-4">
              Tu correo fue confirmado correctamente. Ahora vamos a configurar tu empresa.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
              <Loader2 className="w-4 h-4 animate-spin"/> Redirigiendo al asistente de configuración…
            </div>
          </>
        )}
        {(estado === 'error' || estado === 'expirado') && (
          <>
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-10 h-10 text-rose-600"/>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Enlace inválido</h2>
            <p className="text-slate-500 text-sm mb-6">{msg || 'El enlace expiró o ya fue utilizado.'}</p>
            <button onClick={() => router.push('/register')}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all text-sm">
              Volver al registro
            </button>
          </>
        )}
      </div>
    </div>
  );
}
