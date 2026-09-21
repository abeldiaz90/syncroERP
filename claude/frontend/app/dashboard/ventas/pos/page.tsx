"use client";

/**
 * La dirección de siempre del punto de venta.
 *
 * La caja se mudó a `/pos`, fuera del área de trabajo, porque una terminal de
 * cobro no es una pantalla más del ERP. Esta página se queda porque hay gente
 * con la dirección guardada en favoritos, y porque desaparecer sin decir a
 * dónde es la peor manera de mover algo de sitio.
 *
 * Abre la caja sola al entrar; si el navegador bloquea la ventana emergente,
 * queda el botón.
 */

import { useEffect } from 'react';
import { ExternalLink, Store } from 'lucide-react';
import { abrirPuntoDeVenta } from '@/lib/pos';

export default function PuntoDeVentaMudado() {
  useEffect(() => {
    abrirPuntoDeVenta();
  }, []);

  return (
    <div className="p-10 max-w-xl mx-auto text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 grid place-items-center mx-auto">
        <Store className="w-7 h-7 text-indigo-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mt-4">La caja se abre en su propia ventana</h1>
      <p className="text-[13px] text-slate-600 mt-2 leading-relaxed">
        El punto de venta ya no vive dentro del área de trabajo: se abre aparte, a pantalla
        completa y sin menús, para que cobrar no comparta sitio con la administración.
        Debería haberse abierto solo.
      </p>
      <button
        onClick={abrirPuntoDeVenta}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
      >
        <ExternalLink className="w-4 h-4" /> Abrir la caja
      </button>
      <p className="text-[11.5px] text-slate-400 mt-4">
        También está en Ventas → <b>Abrir caja</b>.
      </p>
    </div>
  );
}
