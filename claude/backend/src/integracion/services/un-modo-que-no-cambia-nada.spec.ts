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
 * QUÉ SE HIZO, Y POR QUÉ ESTO Y NO CABLEARLO
 *
 * Cablearlo de verdad es meter al registro externo dentro de la transacción
 * que reserva la línea de crédito, y `PoliticaCreditoService` vive en `common`
 * mientras `DisponibilidadCreditoService` ya depende de él: hay que invertir la
 * dependencia con un puerto. Es un cambio de diseño, no un parche, y no se
 * hace la víspera de una entrega sobre el camino por donde pasa el dinero.
 *
 * Así que, mientras no esté cableado, NO SE PROMUEVE. Un modo que promete una
 * autoridad que nadie ejerce no se ofrece: se niega diciendo exactamente qué
 * falta. Cuando el cableado exista, se quita esta negativa —y esta prueba
 * cambia con ella—.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * 1. Que la negativa siga ahí mientras nadie consuma el eje.
 * 2. Y que se entere el día que alguien LO CABLEE: si aparece otro consumidor
 *    de `AUTORIDAD` fuera de los sitios conocidos, esta prueba falla para
 *    obligar a revisar si ya se puede levantar la negativa. Un candado que
 *    nadie recuerda es un candado que se queda puesto para siempre.
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

  it('promover a AUTORIDAD se niega, y la negativa dice qué falta', () => {
    const modos = readFileSync(
      join(SRC, 'integracion', 'services', 'integracion-modo.service.ts'),
      'utf8',
    );
    expect(modos).toMatch(/NO_HAY_QUIEN_EJERZA_AUTORIDAD/);
  });
});
