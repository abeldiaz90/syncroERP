import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un modo que no cambia nada
 * ----------------------------------------------------------------------------
 * QUÉ SE MIDIÓ
 *
 * El eje de cartera tiene tres grados: APAGADO, SOMBRA y AUTORIDAD. Lo que
 * promete AUTORIDAD está escrito en el propio código: «en modo SOMBRA la
 * decisión la sigue tomando el ERP aunque el registro externo responda […]
 * sólo en AUTORIDAD manda el registro externo».
 *
 * Se buscó quién distingue un grado del otro. Resultado: UN solo servicio,
 * `DisponibilidadCreditoService`. Todos los demás —el despachador, el
 * publicador de cartera, el reflejo, la sincronización inicial, la sincronía
 * de productos— preguntan únicamente si el eje está APAGADO. Y ese único
 * servicio se expone en un endpoint, `GET /integracion/disponibilidad/:id`,
 * que NINGUNA pantalla llama.
 *
 * Mientras tanto, la decisión de vender a crédito —en venta, en City Ledger,
 * en créditos y en aprobaciones— va a `PoliticaCreditoService`, que se
 * describe a sí mismo como «fuente única de verdad para la exposición
 * crediticia» y lee sólo las tablas del ERP, con su propio candado.
 *
 * Es decir: SOMBRA y AUTORIDAD se comportan igual, byte por byte, en todo lo
 * que toca dinero. Promover una empresa a AUTORIDAD cuesta conciliar hasta
 * cero diferencias —un trabajo real, con una puerta que lo exige— y después no
 * cambia un solo comportamiento, mientras anuncia que a partir de ahí decide
 * el registro externo. Es la peor versión de «parece que está bien»: no un
 * cero de más en una pantalla, sino una autoridad que nadie ejerce sobre quién
 * puede comprar a crédito.
 *
 * QUÉ SE HIZO, Y POR QUÉ RETIRARLA Y NO CABLEARLA
 *
 * La primera reacción fue tratarlo como cableado pendiente. Es un error, y la
 * razón es de diseño, no de calendario:
 *
 *  · Lo que impide vender DOS VECES el último disponible es un candado de base
 *    de datos que `PoliticaCreditoService` toma dentro de la transacción,
 *    compartido entre la venta y el check-out. Si quien decide es una llamada
 *    HTTP a otro sistema, esa garantía desaparece: dos ventas simultáneas
 *    preguntan, las dos oyen «sí», y las dos pasan. Fineract no ofrece reservas
 *    de línea con las que sustituir el candado.
 *
 *  · Y una autoridad que se degrada no era una autoridad. El propio servicio lo
 *    anticipaba: sin respuesta del externo resuelve con caché degradado y, sin
 *    caché, con el saldo del ERP. Correcto para no detener la caja, y la prueba
 *    de que el ERP es quien manda de verdad.
 *
 * La práctica de los ERP que conviven con un core financiero es ésta: el core es
 * la fuente de verdad del REGISTRO, y la decisión dentro de la transacción se
 * toma localmente contra un límite sincronizado, con conciliación continua. Eso
 * es exactamente SOMBRA. Y un cliente que quiera que el core sea el dueño del
 * crédito no quiere un grado más de este eje: quiere el despliegue dirigido por
 * el core, donde la solicitud nace allá. Es otro producto, no un selector.
 *
 * Así que el eje tiene DOS grados que significan algo y el tercero se retira. El
 * valor no se borra —puede estar escrito en la base de alguna empresa y el techo
 * global puede nombrarlo— pero no se escribe nunca más.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * 1. Que la negativa siga ahí, y que diga «retirada» y no «todavía no»: la
 *    diferencia es lo único que impide que alguien lo intente otra vez.
 * 2. Que nadie empiece a EJERCER el grado por la puerta de atrás. Si aparece un
 *    consumidor de `AUTORIDAD` fuera de los sitios conocidos, esta prueba falla
 *    para que se revise si es un descuido o una decisión de producto tomada en
 *    otra parte.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

/** Ficheros de producción (no pruebas) bajo `src`. */
function fuentes(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts'))
      acumulado.push(ruta);
  }
  return acumulado;
}

/**
 * Dónde puede nombrarse AUTORIDAD sin que signifique «alguien ejerce el eje»:
 * la validación del entorno, el DTO, el propio servicio de modos (que lo
 * ordena), la conciliación (que es la puerta para subir), el alta de empresas
 * (que informa el estado) y el servicio de disponibilidad (el que lo
 * implementa, hoy sin consumidores).
 */
const NOMBRARLO_NO_ES_EJERCERLO = [
  'config/validar-entorno.ts',
  'integracion/dto/configurar-integracion.dto.ts',
  'integracion/integracion.constants.ts',
  'integracion/services/integracion-modo.service.ts',
  'integracion/services/cartera-conciliacion.service.ts',
  'integracion/services/sincronizacion-inicial.service.ts',
  'integracion/services/alta-empresas.service.ts',
  'integracion/services/disponibilidad-credito.service.ts',
  'integracion/services/cliente-cartera.subscriber.ts',
  'integracion/entities/discrepancia-integracion.entity.ts',
  'integracion/controllers/integracion.controller.ts',
  /*
   * El diagnóstico del cierre la nombra en un comentario: explica por qué
   * enseña las diferencias de cartera, que perdieron su puerta cuando el grado
   * se retiró. No la ejerce. Esta prueba lo señaló en cuanto se escribió, que
   * es justo lo que se le pedía.
   */
  'finanzas/services/cierre-contable.service.ts',
];

describe('un modo que no cambia nada', () => {
  it('nadie ejerce AUTORIDAD fuera de los sitios que ya se conocen', () => {
    const nuevos = fuentes(SRC)
      .filter((archivo) => /AUTORIDAD/.test(readFileSync(archivo, 'utf8')))
      .map((archivo) => archivo.slice(SRC.length + 1).split(/[\\/]/).join('/'))
      .filter((relativo) => !NOMBRARLO_NO_ES_EJERCERLO.includes(relativo));

    // Si esto falla, puede ser una buena noticia: alguien cableó el eje. Mira
    // si la decisión de crédito ya consulta al registro externo dentro de la
    // transacción y, si sí, levanta la negativa de `establecerModoCartera` y
    // borra esta prueba. Si no, el sitio nuevo tampoco ejerce nada: añádelo
    // arriba explicando por qué.
    expect(nuevos).toEqual([]);
  });

  it('la decisión de crédito sigue siendo del ERP, y se sabe', () => {
    const politica = readFileSync(
      join(SRC, 'common', 'services', 'politica-credito.service.ts'),
      'utf8',
    );
    // No consulta al registro externo: ni lo importa ni lo nombra.
    expect(politica).not.toMatch(/Disponibilidad|CarteraExterna|AUTORIDAD/);
  });

  it('promover a AUTORIDAD se niega, y la negativa dice que está retirada', () => {
    const modos = readFileSync(
      join(SRC, 'integracion', 'services', 'integracion-modo.service.ts'),
      'utf8',
    );
    expect(modos).toMatch(/AUTORIDAD_RETIRADO/);
    /*
     * «Todavía no» invita a volver a intentarlo y a cablearlo; «retirada» dice
     * que la decisión ya se tomó y por qué. El texto es la mitad del arreglo.
     */
    expect(modos).not.toMatch(/no está cableado/);
  });

  it('el valor del enum sigue existiendo, para no romper lo ya escrito', () => {
    /*
     * Retirar no es borrar: una empresa puede tenerlo escrito en su fila y el
     * techo global puede nombrarlo. Quitar el valor del enum convertiría esos
     * datos en un estado ilegible, que es peor que un grado que ya no se
     * concede.
     */
    const constantes = readFileSync(
      join(SRC, 'integracion', 'integracion.constants.ts'),
      'utf8',
    );
    expect(constantes).toMatch(/AUTORIDAD = 'AUTORIDAD'/);
    expect(constantes).toMatch(/RETIRADO/);
  });
});
