/**
 * ============================================================================
 * Reconocer errores del motor sin atarse a un motor
 * ----------------------------------------------------------------------------
 * El ERP nació sobre SQL Server y hoy corre sobre PostgreSQL. Los dos avisan de
 * lo mismo con códigos distintos, y durante la migración quedaron repartidas
 * por el código comprobaciones como `error.number === 2627`: correctas en SQL
 * Server y siempre falsas en PostgreSQL.
 *
 * El síntoma es traicionero. No revienta: el `catch` deja de reconocer el
 * error y cae al camino genérico. Donde había una recuperación —«esta clave de
 * idempotencia ya existe, devuelve el registro que ya se creó»— el usuario
 * recibe un 500 por una operación que en realidad sí se completó. Es decir, el
 * candado seguía protegiendo, pero la respuesta mentía.
 *
 * Por eso vive aquí y no repetido en cada servicio: la próxima vez que haga
 * falta reconocer un código, se agrega una sola vez.
 *
 * El error puede llegar de tres formas según por dónde pase —el driver crudo,
 * el `QueryFailedError` de TypeORM o el error ya envuelto—, así que se miran
 * las tres.
 * ============================================================================
 */

interface ErrorMotor {
  code?: string | number;
  number?: number;
  driverError?: { code?: string | number; number?: number };
  originalError?: { info?: { number?: number }; code?: string | number };
}

function codigos(error: unknown): { texto: string[]; numero: number[] } {
  const e = (error ?? {}) as ErrorMotor;
  const crudos = [
    e.code,
    e.number,
    e.driverError?.code,
    e.driverError?.number,
    e.originalError?.code,
    e.originalError?.info?.number,
  ].filter((v) => v !== undefined && v !== null);

  return {
    texto: crudos.map((v) => String(v)),
    numero: crudos.map((v) => Number(v)).filter((n) => Number.isFinite(n)),
  };
}

/** Clave duplicada. PostgreSQL: 23505. SQL Server: 2601 y 2627. */
export function esViolacionUnicidad(error: unknown): boolean {
  const { texto, numero } = codigos(error);
  return texto.includes('23505') || numero.includes(2601) || numero.includes(2627);
}

/** Llave foránea violada. PostgreSQL: 23503. SQL Server: 547. */
export function esViolacionLlaveForanea(error: unknown): boolean {
  const { texto, numero } = codigos(error);
  return texto.includes('23503') || numero.includes(547);
}

/**
 * Fila bloqueada por otra transacción o interbloqueo. Vale la pena reintentar.
 *
 * Además del código se mira el mensaje. PostgreSQL anuncia el interbloqueo con
 * `40P01` y el texto «deadlock detected»; SQL Server con el número 1205. Pero
 * cuando el error llega envuelto por una capa intermedia el código a veces se
 * pierde por el camino y el texto sobrevive: si sólo se mirara el código, ese
 * caso dejaría de reintentarse y el usuario vería fallar una venta que la
 * segunda vez habría pasado sola.
 */
export function esConflictoDeConcurrencia(error: unknown): boolean {
  const { texto, numero } = codigos(error);
  if (
    texto.includes('40001') ||
    texto.includes('40P01') ||
    numero.includes(1205)
  ) {
    return true;
  }
  const e = (error ?? {}) as {
    message?: string;
    driverError?: { message?: string };
    originalError?: { message?: string };
  };
  const mensaje = [
    e.message,
    e.driverError?.message,
    e.originalError?.message,
  ]
    .filter(Boolean)
    .join(' ');
  return /deadlock|was deadlocked|could not serialize access/i.test(mensaje);
}
