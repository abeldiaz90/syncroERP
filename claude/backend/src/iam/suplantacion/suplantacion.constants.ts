import { ConfigService } from '@nestjs/config';

/**
 * ============================================================================
 * SyncroERP · Ver el ERP como otra persona
 * ----------------------------------------------------------------------------
 * PARA QUÉ EXISTE
 *
 * Un ERP con trece roles no se prueba con una sola sesión. La mitad de lo que
 * hay que comprobar —que el almacenista no ve los impuestos del producto, que
 * el cajero no puede autorizar su propia devolución, que quien captura un
 * conteo no puede cerrarlo— sólo ocurre cuando quien pulsa el botón NO es el
 * administrador, porque el administrador atraviesa los tres controles de
 * autorización por diseño.
 *
 * Hasta ahora eso obligaba a trece inicios de sesión, uno por rol, cada vez que
 * se tocaba un permiso. En la práctica significaba que no se comprobaba.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * NO es un inicio de sesión. No se emite ningún token, no se pide ninguna
 * contraseña, no se toca Keycloak —que sigue siendo el único que dice quién
 * eres—. La sesión del administrador es la que llega y la que se verifica; lo
 * único que cambia es el alcance con el que el ERP la atiende durante esa
 * petición.
 *
 * Y sólo puede acotar. Un administrador puede atenderse como almacenista; nadie
 * puede atenderse como administrador, ni cruzar a otra empresa, ni encadenar
 * suplantaciones. Por eso esto no abre ninguna puerta que el administrador no
 * tuviera ya abierta: la cierra un poco durante un rato.
 *
 * LOS TRES CANDADOS
 *
 *  1. `NODE_ENV` distinto de `production`.
 *  2. `SUPLANTACION_HABILITADA=true`, que hay que poner a mano.
 *  3. Rol de administrador en la sesión real.
 *
 * Los tres, no uno. El primero solo sería frágil —una variable mal puesta en un
 * despliegue— y el segundo solo dejaría la decisión en manos de quien edite un
 * `.env`. Con los dos, encender esto en producción exige equivocarse dos veces
 * a propósito.
 *
 * Y todo lo que se haga así queda en la bitácora a nombre de quien lo hizo DE
 * VERDAD, no de la persona suplantada. Una auditoría que culpe al almacenista
 * de lo que hizo el administrador es peor que no tener auditoría.
 * ============================================================================
 */

/** La petición pide ser atendida como este usuario. */
export const CABECERA_SUPLANTACION = 'x-suplantar-usuario';

/** Lo que el guardia deja escrito en `request.user` cuando suplanta. */
export interface Suplantacion {
  /** Quién lo hizo de verdad. */
  realId: string;
  realEmail: string;
  realRol: string;
}

export function suplantacionHabilitada(config: {
  get: ConfigService['get'];
}): boolean {
  const entorno = String(config.get<string>('NODE_ENV') ?? '').toLowerCase();
  if (entorno === 'production' || entorno === 'produccion') return false;
  return (
    String(config.get<string>('SUPLANTACION_HABILITADA') ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}
