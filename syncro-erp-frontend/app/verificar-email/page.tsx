// app/verificar-email/page.tsx
"use client";
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function VerificarEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token') ?? '';
  const api    = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').trim();

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg]       = useState('');

  // Evita la doble ejecución del useEffect en React Strict Mode (dev)
  const yaEjecutado = useRef(false);

  useEffect(() => {
    if (yaEjecutado.current) return;
    yaEjecutado.current = true;

    if (!token) {
      setEstado('error');
      setMsg('Token no encontrado en la URL');
      return;
    }

    (async () => {
      try {
        const r = await fetch(`${api}/auth/verificar-email?token=${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => null);

        if (r.ok && d?.verificado) {
          // ✅ Guardamos la sesión que devuelve el backend, con las MISMAS
          // claves que usa el login, para que el wizard quede autenticado.
          if (d.access_token) {
            localStorage.setItem('syncro_token', d.access_token);
            localStorage.setItem('syncro_user', JSON.stringify(d.usuario));
            localStorage.setItem('syncro_permisos', JSON.stringify(d.permisos || []));
          }
          setEstado('ok');

          // Si el onboarding ya estaba completo, va directo al panel;
          // si no, al wizard.
          const destino = d.usuario?.onboardingCompletado ? '/dashboard' : '/onboarding';
          setTimeout(() => router.push(destino), 2000);
        } else {
          setEstado('error');
          const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
          setMsg(m || `Error al verificar (HTTP ${r.status})`);
        }
      } catch {
        setEstado('error');
        setMsg('Error de conexión con el servidor');
      }
    })();
  }, [token, api, router]);

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
              <Loader2 className="w-4 h-4 animate-spin"/> Redirigiendo…
            </div>
          </>
        )}

        {estado === 'error' && (
          <>
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-10 h-10 text-rose-600"/>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Enlace inválido</h2>
            <p className="text-slate-500 text-sm mb-6">{msg || 'El enlace expiró o ya fue utilizado.'}</p>
            <button onClick={() => router.push('/login')}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all text-sm">
              Ir al inicio de sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerificarEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center">
        <Loader2 className="w-14 h-14 animate-spin text-indigo-400"/>
      </div>
    }>
      <VerificarEmailContent/>
    </Suspense>
  );
}
