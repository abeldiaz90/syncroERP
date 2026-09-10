'use client';

import { useEffect } from 'react';
import { iniciarSesionVigilada } from '@/lib/sesion';

/**
 * Mantiene viva la sesión de Keycloak mientras la aplicación está abierta.
 *
 * No pinta nada. Vive en el layout raíz porque la sesión no pertenece a una
 * pantalla: si sólo se renovara donde alguien se acordó de ponerlo, el punto de
 * venta —que es donde más caro sale caerse— sería justo el que se quedaría sin
 * renovación.
 */
export function VigilanteSesion() {
  useEffect(() => iniciarSesionVigilada(), []);
  return null;
}
