/**
 * ============================================================================
 * Ver el ERP como otra persona
 * ----------------------------------------------------------------------------
 * Guarda a quién se está viendo. No guarda ninguna credencial: sólo un id de
 * usuario, que el backend usa para decidir con qué alcance atiende la sesión
 * —la del administrador, la de siempre— durante cada petición.
 *
 * Vive en `sessionStorage` y no en `localStorage` a propósito: cerrar la
 * pestaña termina la suplantación. Dejarla puesta de un día para otro es la
 * receta para que alguien crea que el ERP «no le deja hacer nada» sin acordarse
 * de que se dejó puesto como almacenista.
 * ============================================================================
 */

const CLAVE = 'syncro.ver-como';
export const CABECERA_SUPLANTACION = 'X-Suplantar-Usuario';
export const EVENTO_VER_COMO = 'syncro:ver-como';

export interface VerComo {
  id: string;
  nombre: string;
  rol: string;
}

export function verComoActual(): VerComo | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo);
    return v?.id ? (v as VerComo) : null;
  } catch {
    // Un almacén ilegible o bloqueado no es motivo para tumbar la pantalla:
    // simplemente no se está viendo como nadie.
    return null;
  }
}

export function establecerVerComo(valor: VerComo | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (valor) window.sessionStorage.setItem(CLAVE, JSON.stringify(valor));
    else window.sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacén no hay suplantación, y es una degradación aceptable */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_VER_COMO));
}

/**
 * ----------------------------------------------------------------------------
 * Quien atiende de verdad
 * ----------------------------------------------------------------------------
 * MEDIDO EL 7-OCT-2026, por pantalla, en el punto de venta.
 *
 * Con la suplantación puesta se cobró un café de $320. La barra de la caja
 * decía «Abel Díaz · Atiende» de principio a fin, y la venta quedó grabada
 * con `usuarioId` del suplantado:
 *
 *     folio 10 · $320 · usuarioId d9e3ffeb… = Empleado Prueba
 *
 * `lib/api` manda la cabecera de suplantación en TODA llamada, así que el
 * servidor atiende como el suplantado; la barra lee el JWT, que es de quien
 * inició sesión. Dos fuentes para una sola pregunta, y la única pantalla donde
 * el error mueve dinero era además la única sin la banda ámbar —la banda vive
 * en el layout del área de trabajo, y la caja tiene layout propio—.
 *
 * El mismo desajuste apagaba el aviso de «turno abierto por otra persona»: se
 * comparaba el turno contra el id del JWT, no contra quien atiende.
 *
 * Esta función es la única respuesta a «quién atiende». Quien la use no puede
 * divergir del servidor, porque mira exactamente lo mismo que viaja en la
 * cabecera.
 */
export interface QuienAtiende {
  id: string;
  nombre: string;
  /** `true` cuando se está viendo el ERP como otra persona. */
  suplantado: boolean;
}

export function quienAtiende(
  sesion: { id?: string; nombreCompleto?: string; email?: string } | null,
): QuienAtiende {
  const visto = verComoActual();
  if (visto) return { id: visto.id, nombre: visto.nombre, suplantado: true };
  return {
    id: sesion?.id ?? '',
    nombre: sesion?.nombreCompleto || sesion?.email || '—',
    suplantado: false,
  };
}
