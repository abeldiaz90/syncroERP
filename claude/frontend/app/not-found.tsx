import Link from 'next/link';

/**
 * ============================================================================
 * LA DIRECCIÓN NO EXISTE, Y HASTA HOY LO DECÍA EN INGLÉS
 * ----------------------------------------------------------------------------
 * Sin este archivo, Next sirve su propia pantalla:
 *
 *     404
 *     This page could not be found.
 *
 * Negro sobre blanco, en inglés, sin la barra lateral, sin el nombre del ERP y
 * sin un solo enlace. Quien llega ahí —por un marcador viejo, un enlace de un
 * correo de hace meses, o una dirección mal tecleada— se queda sin forma de
 * volver que no sea el botón del navegador, y con la impresión razonable de
 * que el sistema se rompió.
 *
 * Se descubrió el 6-oct tecleando `/dashboard/creditos` a mano: es una carpeta
 * de agrupación sin pantalla propia, así que contesta 404. Nada enlaza ahí, o
 * sea que el 404 estaba bien; lo que estaba mal era CÓMO lo decía.
 *
 * Esta pantalla dice tres cosas, que son las tres que hacen falta: que la
 * dirección no existe (y no que el sistema falló), cuál era, y por dónde
 * seguir.
 * ============================================================================
 */
export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl font-black tracking-tight text-slate-300">404</p>
        <h1 className="mt-4 text-xl font-black text-slate-900">
          Esta dirección no existe
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          No es una avería: el ERP está funcionando. La página que pediste no
          está en este sistema, o cambió de sitio.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          Ir al panel principal
        </Link>
      </div>
    </main>
  );
}
