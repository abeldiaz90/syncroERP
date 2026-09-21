'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { iniciarSesionKeycloak } from '@/lib/keycloak';
import { sesionVigente, leerSesion } from '@/lib/session';
import { token } from '@/lib/api';

export default function LoginPage() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sesionVigente(leerSesion(token.get()))) {
      window.location.replace('/dashboard');
    }
  }, []);

  const entrar = async () => {
    setCargando(true);
    setError('');
    try {
      /*
       * Segundo cinturón: aunque `next` llegue apuntando a la propia pantalla
       * de acceso —por una URL vieja guardada en favoritos, o por un rebote— se
       * ignora. Devolver al usuario al formulario después de que entró se lee
       * como un acceso fallido.
       */
      const crudo = new URLSearchParams(window.location.search).get('next');
      const siguiente =
        crudo && crudo.startsWith('/') && !crudo.startsWith('//') && !/^\/(login|logout|auth)(\/|$|\?)/.test(crudo)
          ? crudo
          : '/dashboard';
      await iniciarSesionKeycloak(siguiente);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo conectar con SUMA.',
      );
      setCargando(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Syncro ERP
          </h1>
          <p className="mt-1 font-medium text-slate-500">
            Acceso centralizado con tu identidad SUMA
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={cargando}
          onClick={() => void entrar()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-lg font-black text-white transition hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 active:scale-[0.98] disabled:bg-indigo-300"
        >
          {cargando ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Redirigiendo…
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" /> Entrar con SUMA
            </>
          )}
        </button>

        <p className="mt-5 text-center text-xs leading-5 text-slate-400">
          La contraseña y el segundo factor se administran únicamente en
          Keycloak de SUMA.
        </p>
      </section>
    </main>
  );
}
