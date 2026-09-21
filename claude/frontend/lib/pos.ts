/**
 * Abrir la caja.
 *
 * `window.open` con una lista de características hace que el navegador quite
 * la barra de direcciones y las pestañas: la ventana se ve como una aplicación
 * de caja y no como una página más. El nombre de la ventana es fijo a
 * propósito —siempre `syncro-pos`—, así el segundo clic trae al frente la caja
 * que ya está abierta en vez de abrir otra y dejar dos carritos vivos.
 *
 * Si el navegador bloquea la ventana emergente, se abre en una pestaña: es
 * peor, pero cobrar es más importante que la estética.
 */
export function abrirPuntoDeVenta() {
  const ancho = Math.min(1440, Math.max(1100, window.screen.availWidth - 80));
  const alto = Math.min(900, Math.max(700, window.screen.availHeight - 80));
  const izq = Math.max(0, Math.round((window.screen.availWidth - ancho) / 2));
  const arr = Math.max(0, Math.round((window.screen.availHeight - alto) / 2));

  const ventana = window.open(
    '/pos',
    'syncro-pos',
    `popup=yes,width=${ancho},height=${alto},left=${izq},top=${arr},menubar=no,toolbar=no,location=no,status=no`,
  );
  if (ventana) ventana.focus();
  else window.open('/pos', '_blank');
}
