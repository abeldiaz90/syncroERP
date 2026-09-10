"use client";
/**
 * ============================================================================
 * SyncroERP · Atajos de teclado
 * ----------------------------------------------------------------------------
 * En un punto de venta el mouse es el enemigo. Un cajero entrenado despacha
 * con las dos manos en el teclado y la vista en el cliente; cada vez que tiene
 * que buscar un botón con el cursor pierde dos o tres segundos, y en un turno
 * con doscientas ventas eso es media hora.
 *
 * Las teclas de función son la convención de la industria: cualquier persona
 * que haya trabajado en un mostrador ya conoce F2 para cobrar y F4 para
 * cancelar. Respetarlas hace que el sistema se sienta familiar desde el primer
 * día.
 *
 * ── EL DETALLE QUE IMPORTA ─────────────────────────────────────────────────
 *
 * `preventDefault()` es obligatorio en las teclas de función: sin él, F3 abre
 * la búsqueda del navegador, F5 recarga la página en medio de una venta y F11
 * la pone en pantalla completa. Todas son interrupciones que en un mostrador
 * cuestan caro.
 * ============================================================================
 */

import { useEffect, useRef } from 'react';

export interface Atajo {
  /** 'F2', 'Escape', 'Enter', o una letra con modificador. */
  tecla: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  accion: () => void;
  /** Texto para la barra de ayuda. */
  descripcion: string;
  /** Se ejecuta aunque el foco esté en un campo de texto. */
  ignorarCampos?: boolean;
}

/** Atajos estándar de punto de venta. Se usan como referencia al configurar. */
export const ATAJOS_POS = {
  BUSCAR: 'F1',
  COBRAR: 'F2',
  CLIENTE: 'F3',
  CANCELAR_VENTA: 'F4',
  SUSPENDER: 'F6',
  RECUPERAR: 'F7',
  DESCUENTO: 'F8',
  ULTIMO_TICKET: 'F9',
  CERRAR_MODAL: 'Escape',
} as const;

function enCampoDeTexto(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  if (destino.isContentEditable) return true;
  if (destino.tagName === 'TEXTAREA') return true;
  if (destino.tagName === 'SELECT') return true;
  if (destino.tagName === 'INPUT') {
    const tipo = (destino as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit'].includes(tipo);
  }
  return false;
}

export function useAtajos(atajos: Atajo[], activo = true) {
  // Referencia mutable: evita re-suscribir el listener en cada render, que en
  // una pantalla que se redibuja con cada tecla sería costoso.
  const ref = useRef(atajos);
  useEffect(() => { ref.current = atajos; }, [atajos]);

  useEffect(() => {
    if (!activo) return;

    const alTeclear = (e: KeyboardEvent) => {
      for (const a of ref.current) {
        if (e.key !== a.tecla) continue;
        if (!!a.ctrl !== e.ctrlKey) continue;
        if (!!a.shift !== e.shiftKey) continue;
        if (!!a.alt !== e.altKey) continue;

        // Escape siempre pasa: es la salida universal.
        const esEscape = a.tecla === 'Escape';
        if (!a.ignorarCampos && !esEscape && enCampoDeTexto(e.target)) continue;

        // Sin esto, F3 abre la búsqueda del navegador y F5 recarga la página
        // en medio de una venta.
        e.preventDefault();
        e.stopPropagation();
        a.accion();
        return;
      }
    };

    document.addEventListener('keydown', alTeclear, true);
    return () => document.removeEventListener('keydown', alTeclear, true);
  }, [activo]);
}

/* ── Barra de ayuda ───────────────────────────────────────────────────────── */

/**
 * Franja con los atajos disponibles. Va fija al pie del punto de venta.
 * Un cajero nuevo la lee las primeras semanas; después deja de verla, pero no
 * estorba.
 */
export function BarraAtajos({ atajos }: { atajos: Atajo[] }) {
  return (
    <div className="flex items-center gap-4 px-4 h-8 bg-slate-900 text-slate-400 text-[11px] overflow-x-auto no-imprimir">
      {atajos.map((a) => (
        <span key={a.tecla + a.descripcion} className="flex items-center gap-1.5 shrink-0">
          <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-semibold text-white">
            {a.ctrl ? 'Ctrl+' : ''}{a.shift ? 'Shift+' : ''}{a.tecla}
          </kbd>
          {a.descripcion}
        </span>
      ))}
    </div>
  );
}
