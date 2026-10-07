'use client';

import { useEffect } from 'react';

/**
 * ============================================================================
 * UN MODAL SE CIERRA CON ESCAPE
 * ----------------------------------------------------------------------------
 * Medido el 7-oct-2026 sobre el árbol vivo: de los 50 modales del ERP, **44 no
 * respondían a Escape** y **32 no se cerraban pulsando fuera**. La única salida
 * era encontrar el botón «Cancelar» o la equis.
 *
 * Eso no es una comodidad. Es la salida de emergencia de cualquier pantalla que
 * tapa el resto, y la tecla que todo el mundo pulsa sin pensar. El mismo día se
 * encontró un modal cuyo botón quedaba fuera de la pantalla en un portátil: con
 * Escape, aquello habría sido una molestia en vez de un callejón sin salida.
 *
 * CÓMO SE USA
 *
 *     useCerrarConEscape(abierto, cerrar);
 *
 * `abierto` evita que un modal cerrado se trague la tecla de otro que sí lo
 * esté, y que varios modales anidados se cierren todos de golpe: sólo escucha
 * el que está en pantalla.
 *
 * CUÁNDO **NO** USARLO
 *
 * Cuando cerrar pierde trabajo que la persona no puede recuperar —un formulario
 * largo a medio llenar, un asistente de varios pasos—. Ahí Escape tiene que
 * preguntar antes, y eso lo decide cada pantalla; este gancho no lo adivina.
 * ============================================================================
 */
export function useCerrarConEscape(abierto: boolean, cerrar: () => void): void {
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /*
       * Un `Escape` dentro de un desplegable abierto, o de un campo con
       * autocompletado, lo consume el propio control del navegador y llega aquí
       * ya marcado. Cerrar el modal entero en ese caso se siente como si la
       * tecla hiciera dos cosas a la vez.
       */
      if (e.defaultPrevented) return;
      e.stopPropagation();
      cerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto, cerrar]);
}
