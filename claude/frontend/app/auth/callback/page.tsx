'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { completarSesionKeycloak } from '@/lib/keycloak';

import { useT } from '@/components/I18nProvider';
export default function CallbackKeycloakPage() {
  const t = useT();
  const [error, setError] = useState('');

  useEffect(() => {
    completarSesionKeycloak(new URLSearchParams(window.location.search))
      .then((destino) => window.location.replace(destino))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : t("No se pudo iniciar sesión.")),
      );
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-xl">
        {error ? (
          <>
            <AlertCircle className="mx-auto mb-4 h-9 w-9 text-rose-600" />
            <h1 className="text-xl font-black text-slate-900">{t("Acceso no completado")}</h1>
            <p className="mt-3 text-sm text-slate-600">{t(error)}</p>
            <a className="mt-6 inline-block font-bold text-indigo-700" href="/login">
              
              {t("Volver a intentar")}
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-indigo-600" />
            <h1 className="text-xl font-black text-slate-900">{t("Validando identidad SUMA")}</h1>
            <p className="mt-2 text-sm text-slate-500">{t("Preparando tu empresa y permisos…")}</p>
          </>
        )}
      </div>
    </main>
  );
}
