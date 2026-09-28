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
