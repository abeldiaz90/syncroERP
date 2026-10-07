'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * ============================================================================
 * CUANDO UNA PANTALLA SE CAE, QUIEN LA MIRA TIENE QUE PODER DECIR CUÁL
 * ----------------------------------------------------------------------------
 * Sin este archivo, un error de render deja la pantalla de Next: en desarrollo
 * una traza de pila, y en producción «Application error: a client-side
 * exception has occurred», en inglés y sin nada más. Quien lo ve no puede
 * reportar nada útil, porque no tiene ni un dato que dar.
 *
 * El servidor del ERP ya acompaña cada error con un número de traza, justamente
 * para que una llamada de soporte empiece por «me salió el 4C5EBD801EAC» en vez
 * de «no funciona». Del lado de la pantalla no había nada equivalente.
 *
 * Next pone un `digest` en los errores del servidor: es el identificador con el
 * que ese error se encuentra en la bitácora. Se enseña cuando existe, y se
 * dice para qué sirve. El mensaje técnico NO se enseña: puede traer rutas
 * internas, y no le dice nada a quien está intentando cobrar.
 *
 * `reintentar` vuelve a montar la rama que falló, que es lo primero que hay que
 * probar cuando el fallo fue una respuesta perdida.
 * ============================================================================
 */
export default function ErrorDePantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A la consola del navegador, que es donde sirve para diagnosticar.
    console.error('[ERP] Falló una pantalla:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-black text-slate-900">
          Esta pantalla no pudo cargarse
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          El resto del ERP sigue funcionando. Vuelve a intentarlo; si pasa otra
          vez, avisa a soporte con el dato de abajo.
        </p>
        {error.digest ? (
          <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">
            Referencia: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Ir al panel
          </Link>
        </div>
      </div>
    </main>
  );
}
