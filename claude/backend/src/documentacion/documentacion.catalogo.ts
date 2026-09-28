/**
 * ============================================================================
 * Qué documentos se publican, y a quién
 * ----------------------------------------------------------------------------
 * La lista es explícita a propósito. El identificador que llega por la URL NO
 * se convierte en un nombre de archivo: se busca en esta tabla, y lo que no
 * esté aquí no existe. Un `GET /documentacion/../../.env` no tiene por dónde
 * entrar, porque nunca se construye una ruta con lo que mandó el cliente.
 *
 * ── LA DIVISIÓN, Y POR QUÉ ─────────────────────────────────────────────────
 *
 * De los seis documentos, dos son del USUARIO —el manual por rol y el de
 * compras y nómina— y cuatro son de quien instala y mantiene: variables de
 * entorno, claves de servicio, defectos corregidos y lo que falta por probar.
 *
 * Publicar los cuatro dentro del ERP sería enseñarle a cada empresa cliente el
 * inventario de lo que todavía no está probado y los nombres de las llaves que
 * protegen su instalación. Así que los técnicos son del administrador, y el
 * índice que ve cada quien se arma con lo que de verdad puede abrir: nadie ve
 * en la lista un documento que al pulsarlo le va a contestar que no.
 * ============================================================================
 */

export interface DocumentoPublicado {
  /** Lo que viaja por la URL. Estable: es lo que alguien guarda en favoritos. */
  id: string;
  /** Nombre del archivo dentro de `docs/`. Nunca se arma con datos del cliente. */
  archivo: string;
  titulo: string;
  resumen: string;
  /** Sólo el administrador. Ver el encabezado. */
  restringido: boolean;
  orden: number;
}

export const DOCUMENTOS_PUBLICADOS: ReadonlyArray<DocumentoPublicado> = [
  {
    id: 'manual-por-rol',
    archivo: '03-manual-por-rol.md',
    titulo: 'Manual por rol',
    resumen:
      'Los trece roles y qué alcanza cada uno. Cierre mensual, conciliación bancaria, ' +
      'póliza manual, movimientos de tesorería, activos fijos, crédito y aprobaciones.',
    restringido: false,
    orden: 10,
  },
  {
    id: 'compras-y-nomina',
    archivo: '04-compras-y-nomina.md',
    titulo: 'Compras y nómina',
    resumen:
      'Los dos ciclos que firma más de una persona, paso a paso y diciendo a quién le ' +
      'toca cada firma. Incluye qué hacer cuando el sistema no te deja.',
    restringido: false,
    orden: 20,
  },
  {
    id: 'instalacion',
    archivo: '01-instalacion-y-puesta-en-marcha.md',
    titulo: 'Instalación y puesta en marcha',
    resumen:
      'Piezas y puertos, todas las variables de entorno con sus valores por omisión, ' +
      'orden de arranque y cómo verificar que quedó bien.',
    restringido: true,
    orden: 30,
  },
  {
    id: 'arquitectura',
    archivo: '02-arquitectura.md',
    titulo: 'Arquitectura',
    resumen:
      'Autenticación, autorización, aislamiento entre empresas, contabilidad y cierre, ' +
      'bitácora, integración con Fineract y las reglas que el sistema se hace cumplir solo.',
    restringido: true,
    orden: 40,
  },
  {
    id: 'aprovisionamiento',
    archivo: '05-aprovisionamiento-y-consola-suma.md',
    titulo: 'Aprovisionamiento y consola SUMA',
    resumen:
      'Cómo se da de alta una empresa cliente en cada uno de los tres modos, la reserva ' +
      'de inquilinos del core y el realm por empresa.',
    restringido: true,
    orden: 50,
  },
  {
    id: 'limites-conocidos',
    archivo: '06-limites-conocidos.md',
    titulo: 'Límites conocidos',
    resumen:
      'Lo que no está probado y lo que falta, con el motivo de cada cosa. ' +
      'Vale más que una lista de verdes.',
    restringido: true,
    orden: 60,
  },
];

export function documentoDe(id: string): DocumentoPublicado | undefined {
  return DOCUMENTOS_PUBLICADOS.find((d) => d.id === id);
}
