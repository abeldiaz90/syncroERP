'use client';

import { useEffect } from 'react';
import { iniciarSesionVigilada } from '@/lib/sesion';
import { vigilar401Global } from '@/lib/api';

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
  /*
   * Y vigila también los 401 de las pantallas que llaman con `fetch` directo
   * —63 de ellas—, que ni renuevan ni avisan. Sin esto, una sesión vencida se
   * ve como una pantalla que sigue ahí y en la que ya nada funciona.
   */
  useEffect(() => vigilar401Global(), []);
  return null;
}
