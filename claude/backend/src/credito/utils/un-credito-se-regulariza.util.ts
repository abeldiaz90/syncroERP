import { EstadoCredito } from '../entities/credito-cliente.entity';
import { EstadoCuota } from '../entities/amortizacion-cuota.entity';

/**
 * ============================================================================
 * Cuándo un crédito deja de estar en mora
 * ----------------------------------------------------------------------------
 * `actualizarVencidos` sólo escalaba: marcaba VENCIDO y no desmarcaba nunca. El
 * único regreso a ACTIVO era registrar un pago, así que quien dejaba de estar en
 * mora por cualquier otra vía —una cuota reprogramada, una fecha corregida, una
 * devolución que baja el saldo— se quedaba contado como moroso para siempre. Y
 * el ESTADO es lo que ven las pantallas, lo que suma la cartera vencida y lo
 * que alimenta las provisiones: un cliente al corriente contado como moroso
 * distorsiona a quién se le vuelve a prestar.
 *
 * El camino de vuelta se escribió, y su prueba —hallazgo 52 del barrido—
 * reimplementaba la condición **dentro del test** y no llamaba al servicio
 * nunca. O sea que afirmaba sobre una copia de la regla: si la del servicio
 * cambiaba, la prueba seguía verde midiendo la otra. Es la misma lección que la
 * aserción dentro de un `catch` que se la traga: una prueba que no puede fallar
 * es peor que no tenerla, porque afirma que algo está vigilado.
 *
 * Ahora la regla vive aquí, la prueba llama a ESTO, y el servicio la usa como
 * confirmación sobre las filas que el `NOT EXISTS` ya seleccionó. La consulta
 * sigue haciendo el trabajo pesado en la base —son miles de créditos y no se
 * pueden traer todos con sus cuotas—; esto es el segundo par de ojos sobre lo
 * poco que va a cambiar de estado.
 * ============================================================================
 */
export function seRegulariza(
  credito: {
    estado: EstadoCredito | string;
    cuotas?: { estado: EstadoCuota | string; fechaVencimiento: Date | string }[];
  },
  hoy: Date,
): boolean {
  if (credito.estado !== EstadoCredito.VENCIDO) return false;
  const cuotas = credito.cuotas ?? [];
  return !cuotas.some(
    (q) =>
      q.estado !== EstadoCuota.PAGADA &&
      new Date(q.fechaVencimiento).getTime() < hoy.getTime(),
  );
}
