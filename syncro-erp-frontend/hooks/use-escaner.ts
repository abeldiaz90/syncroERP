"use client";
/**
 * ============================================================================
 * SyncroERP · Lector de código de barras
 * ----------------------------------------------------------------------------
 * Un lector de códigos de barras es, para el navegador, un teclado que escribe
 * muy rápido y termina con Enter. No hay evento especial ni API que lo
 * distinga: hay que deducirlo por la velocidad.
 *
 * Sin esto, el cajero tiene que hacer clic en el campo de búsqueda antes de
 * cada escaneo. Con producto tras producto, eso son horas perdidas al mes y
 * una fuente constante de errores cuando el foco está en otro lado y el código
 * se escribe dentro de un campo equivocado.
 *
 * ── CÓMO SE DISTINGUE ──────────────────────────────────────────────────────
 *
 * Una persona escribe con pausas de 80–500 ms entre teclas. Un lector emite
 * todo el código en menos de 30 ms por carácter, sin variación.
 *
 * El umbral de 35 ms deja fuera hasta al mecanógrafo más rápido y funciona con
 * los lectores lentos. Si en tu equipo se escapa algún escaneo, súbelo; si un
 * cajero muy veloz dispara falsos positivos, bájalo.
 *
 * ── POR QUÉ ESCUCHA EN EL DOCUMENTO ────────────────────────────────────────
 *
 * El escaneo funciona sin importar dónde esté el foco, que es justo lo que se
 * quiere: el cajero apunta y dispara sin tocar el mouse. Se ignora cuando el
 * foco está en un campo de texto donde la persona sí está escribiendo a mano.
 * ============================================================================
 */

import { useCallback, useEffect, useRef } from 'react';

interface OpcionesEscaner {
  /** Se dispara con el código completo. */
  onEscaneo: (codigo: string) => void;
  /** Milisegundos máximos entre teclas para considerarlo lector. */
  umbralMs?: number;
  /** Longitud mínima del código; evita disparos por teclas sueltas. */
  longitudMinima?: number;
  /** Desactiva la escucha, por ejemplo con un modal abierto. */
  activo?: boolean;
}

/** Campos donde la persona sí está escribiendo y no hay que interceptar. */
function esCampoDeTexto(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;

  const etiqueta = destino.tagName;
  if (etiqueta === 'TEXTAREA') return true;
  if (destino.isContentEditable) return true;

  if (etiqueta === 'INPUT') {
    const tipo = (destino as HTMLInputElement).type;
    // Los campos de búsqueda SÍ deben recibir el escaneo: es donde el cajero
    // espera que aparezca. Los demás (fecha, número, contraseña) no.
    if (destino.dataset.aceptaEscaneo === 'true') return false;
    return !['checkbox', 'radio', 'button', 'submit'].includes(tipo);
  }

  return false;
}

export function useEscaner({
  onEscaneo,
  umbralMs = 35,
  longitudMinima = 4,
  activo = true,
}: OpcionesEscaner) {
  const bufer = useRef('');
  const ultimaTecla = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiar = useCallback(() => {
    bufer.current = '';
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activo) return;

    const alTeclear = (e: KeyboardEvent) => {
      if (esCampoDeTexto(e.target)) return;

      const ahora = Date.now();
      const transcurrido = ahora - ultimaTecla.current;
      ultimaTecla.current = ahora;

      // Enter cierra el escaneo
      if (e.key === 'Enter') {
        if (bufer.current.length >= longitudMinima) {
          e.preventDefault();
          onEscaneo(bufer.current);
        }
        limpiar();
        return;
      }

      // Solo caracteres imprimibles
      if (e.key.length !== 1) return;

      // Pausa larga: es una persona escribiendo, se descarta lo acumulado
      if (transcurrido > umbralMs && bufer.current.length > 0) {
        bufer.current = '';
      }

      bufer.current += e.key;

      // Red de seguridad: si el lector no manda Enter, se cierra solo.
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        if (bufer.current.length >= longitudMinima) {
          onEscaneo(bufer.current);
        }
        limpiar();
      }, 120);
    };

    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      limpiar();
    };
  }, [activo, onEscaneo, umbralMs, longitudMinima, limpiar]);
}

/* ── Validación de códigos comerciales ────────────────────────────────────── */

/**
 * Verifica el dígito de control de EAN-13, EAN-8 y UPC-A.
 *
 * Sirve para distinguir un escaneo legítimo de un código tecleado con un
 * dígito mal. No todos los productos usan estos formatos — los códigos
 * internos suelen ser arbitrarios — así que un `false` no significa que el
 * código sea inválido, solo que no es un EAN/UPC bien formado.
 */
export function esCodigoComercialValido(codigo: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(codigo)) return false;

  const digitos = codigo.split('').map(Number);
  const control = digitos.pop()!;

  // De derecha a izquierda, alternando peso 3 y 1
  const suma = digitos
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);

  return (10 - (suma % 10)) % 10 === control;
}
