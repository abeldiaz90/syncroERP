import { AmortizacionCuota, EstadoCuota } from '../entities/amortizacion-cuota.entity';

/*
 * ============================================================================
 * REDUCIR UNA CUOTA SIN ROMPER SU ARITMÉTICA
 * ----------------------------------------------------------------------------
 * EL INVARIANTE QUE PROTEGE
 *
 *     montoCapital + montoInteres = montoCuota
 *
 * No es una convención: es lo que usa el reparto de un pago para decidir cuánto
 * va a capital y cuánto a ingresos por intereses.
 *
 *     proporcionCapital = montoCapital / montoCuota
 *     capital = aplicar × proporcionCapital
 *     interes = aplicar − capital
 *
 * Si alguien baja `montoCuota` sin bajar el capital, esa proporción se vuelve
 * mayor que uno y **el interés sale negativo**. Con una cuota de 1,000 (900 de
 * capital, 100 de interés) a la que se le quitan 300 sin tocar el capital:
 *
 *     proporción = 900 / 700 = 1.2857
 *     pago de 700 → capital 900, interés −200
 *
 * El crédito reporta más capital cobrado que dinero recibido, y la póliza sale
 * con un abono negativo a ingresos por intereses: no se genera y el pago se
 * queda sin asiento.
 *
 * POR QUÉ ESTA FUNCIÓN EXISTE, Y NO ES UN CRITERIO NUEVO
 *
 * La regla —**primero el capital, después el interés**— ya estaba escrita en
 * `DevolucionesVentasService.reducirCuotas` y era correcta. Lo que faltaba es
 * que la usara el otro camino que reduce cuotas: el ajuste por devolución
 * registrada en el sistema externo, que bajaba `montoCuota` y dejaba el capital
 * donde estaba.
 *
 * Es la misma forma de defecto que este proyecto ya encontró varias veces: una
 * regla que existe en un camino y no en el de al lado. Por eso no se copia la
 * lógica: se saca a un sitio y los dos la llaman.
 *
 * POR QUÉ EL CAPITAL PRIMERO
 *
 * Una devolución reduce lo que el cliente se llevó, es decir el principal. El
 * interés de un principal que ya no existe no se devenga. Bajar primero el
 * interés le cobraría al cliente el financiamiento de una mercancía que
 * devolvió; bajar proporcionalmente se lo cobraría a medias.
 *
 * (La respuesta de libro sería rehacer la tabla de amortización sobre el nuevo
 * principal, que cambia también las cuotas siguientes. Eso es una decisión de
 * producto, no de código, y mientras no se tome, ésta es la aproximación que ya
 * usaba el ERP y la que menos le cobra de más al cliente.)
 * ============================================================================
 */

/** Dos decimales, que es la precisión con la que se cobra. */
function redondear2(valor: number): number {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

export type ReduccionDeCuota = {
  /** Lo que de verdad se pudo quitar de esta cuota. */
  reducido: number;
  capitalReducido: number;
  interesReducido: number;
};

/**
 * Lo que queda por cobrar de una cuota: su importe menos lo ya pagado.
 *
 * Nunca negativo: una cuota sobrepagada no ofrece saldo que reducir, y tratar
 * ese caso como un número negativo haría que la reducción *aumentara* la cuota
 * siguiente.
 */
export function saldoReducibleDe(cuota: Pick<AmortizacionCuota, 'montoCuota' | 'montoPagado'>): number {
  return Math.max(0, redondear2(Number(cuota.montoCuota) - Number(cuota.montoPagado)));
}

/**
 * Reduce una cuota en `importe`, repartiendo la baja entre capital e interés y
 * dejando el invariante exacto. Devuelve lo que realmente se pudo aplicar.
 *
 * La cuota se modifica en el sitio; guardarla es cosa de quien llama, que es
 * quien tiene la transacción.
 */
export function reducirCuota(cuota: AmortizacionCuota, importe: number): ReduccionDeCuota {
  const disponible = saldoReducibleDe(cuota);
  const reducir = Math.min(Math.max(0, redondear2(importe)), disponible);
  if (reducir <= 0.0001) {
    return { reducido: 0, capitalReducido: 0, interesReducido: 0 };
  }

  const capitalReducido = Math.min(reducir, Number(cuota.montoCapital));
  const interesReducido = redondear2(reducir - capitalReducido);

  const nuevoMonto = redondear2(Number(cuota.montoCuota) - reducir);
  /*
   * El capital se recorta además contra el nuevo importe de la cuota. Sin ese
   * tope, un céntimo de redondeo podría dejar el capital por encima del total y
   * devolver el interés negativo por la puerta de atrás, que es justo lo que
   * esta función existe para impedir.
   */
  const nuevoCapital = Math.min(
    redondear2(Number(cuota.montoCapital) - capitalReducido),
    nuevoMonto,
  );

  cuota.montoCuota = nuevoMonto;
  cuota.montoCapital = nuevoCapital;
  /* Derivado, no restado: así el invariante es exacto por construcción. */
  cuota.montoInteres = redondear2(nuevoMonto - nuevoCapital);
  cuota.saldoRestante = Math.max(
    0,
    redondear2(Number(cuota.saldoRestante ?? 0) - reducir),
  );

  if (Number(cuota.montoPagado) + 0.0001 >= Number(cuota.montoCuota)) {
    cuota.estado = EstadoCuota.PAGADA;
    cuota.fechaPago = cuota.fechaPago ?? new Date();
  }

  return { reducido: reducir, capitalReducido, interesReducido };
}

/**
 * La proporción de capital de una cuota, **acotada a uno**.
 *
 * Es una red, no la corrección: el arreglo de raíz es que nadie rompa el
 * invariante, y de eso se encarga `reducirCuota`. Pero los créditos que ya
 * pasaron por el defecto tienen cuotas guardadas con el capital por encima del
 * total, y sin este tope su siguiente pago seguiría produciendo interés
 * negativo y quedándose sin póliza.
 *
 * Acotar hace que esos pagos se registren como capital puro, que es lo más
 * cercano a la verdad que se puede afirmar sin reconstruir la amortización.
 */
export function proporcionDeCapital(cuota: Pick<AmortizacionCuota, 'montoCapital' | 'montoCuota'>): number {
  const total = Number(cuota.montoCuota);
  if (!(total > 0)) return 1;
  return Math.min(1, Number(cuota.montoCapital) / total);
}
