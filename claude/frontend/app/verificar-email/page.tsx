"use client";

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

function leerTokenDelFragmento(): string {
  if (typeof window === 'undefined') return '';
  const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return fragmento.get('token') ?? '';
}

function VerificarEmailContent() {
  const router = useRouter();
  const api = (
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? '/api'
      : 'http://localhost:4000/api')
  ).trim();

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState('');
  const yaEjecutado = useRef(false);

  useEffect(() => {
    if (yaEjecutado.current) return;
    yaEjecutado.current = true;

    // El fragmento (#token=...) no viaja en Referer ni en logs HTTP.
    const token = leerTokenDelFragmento();
    if (!token) {
      setEstado('error');
      setMsg('Token no encontrado en el enlace.');
      return;
    }

    // Elimina el secreto de la barra de direcciones antes de llamar al backend.
    window.history.replaceState({}, document.title, '/verificar-email');

    void (async () => {
      try {
        const respuesta = await fetch(`${api}/auth/verificar-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const datos = await respuesta.json().catch(() => null);

        if (respuesta.ok && datos?.verificado) {
          setEstado('ok');
          setTimeout(() => router.replace('/login?verificado=1'), 1800);
          return;
        }

        const mensaje = Array.isArray(datos?.message)
          ? datos.message.join(', ')
          : datos?.message;
        setEstado('error');
        setMsg(mensaje || `Error al verificar (HTTP ${respuesta.status})`);
      } catch {
        setEstado('error');
        setMsg('No fue posible conectar con el servidor.');
      }
    })();
  }, [api, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
        {estado === 'cargando' && (
          <>
            <Loader2 className="w-14 h-14 animate-spin text-indigo-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Verificando tu cuenta…</h2>
            <p className="text-slate-500 mt-2 text-sm">Un momento por favor.</p>
          </>
        )}

        {estado === 'ok' && (
          <>
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Cuenta verificada!</h2>
            <p className="text-slate-500 text-sm mb-4">
              Tu correo fue confirmado. Por seguridad, inicia sesión para continuar.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo…
            </div>
          </>
        )}

        {estado === 'error' && (
          <>
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-10 h-10 text-rose-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Enlace inválido</h2>
            <p className="text-slate-500 text-sm mb-6">
              {msg || 'El enlace expiró o ya fue utilizado.'}
            </p>
            <button
              onClick={() => router.replace('/login')}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all text-sm"
            >
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center">
          <Loader2 className="w-14 h-14 animate-spin text-indigo-400" />
        </div>
      }
    >
      <VerificarEmailContent />
    </Suspense>
  );
}
