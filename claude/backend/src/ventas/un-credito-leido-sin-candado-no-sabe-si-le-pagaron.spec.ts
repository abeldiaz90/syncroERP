/**
 * ============================================================================
 * Un crédito leído sin candado no sabe si le acaban de pagar
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * `AnulacionVentasService.anular` abre la transacción bloqueando la VENTA, y
 * con eso se daba por protegido todo lo que cuelga de ella. El crédito no
 * cuelga de la venta para quien cobra: `CobranzaService.registrarPago` entra
 * por el crédito y lo bloquea a él. Son dos puertas distintas a la misma fila.
 *
 * Así que la anulación podía leer el crédito mientras un pago estaba a medias:
 * veía el `saldoPendiente` anterior, calculaba `pagado = 0`, pasaba la guardia
 * que existe justo para no anular una venta con abonos, y escribía CANCELADO.
 * El pago confirmaba después, contra un crédito cancelado. Dinero cobrado sobre
 * una venta que el ERP dice que no existe, y la guardia que lo impedía mirando
 * un dato viejo.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * No el renglón que arreglé —eso lo protege mal una sola aserción—, sino la
 * regla: **toda lectura de `CreditoCliente` que vaya seguida de una escritura
 * toma candado**. Los tres sitios que legítimamente no lo necesitan están
 * nombrados aquí abajo, con su razón. Cualquier lectura nueva sin candado y sin
 * razón escrita pone esto en rojo, que es el único momento en que alguien va a
 * mirarlo.
 * ============================================================================
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

/**
 * Lecturas que NO necesitan candado, y por qué. Cada una se comprueba: si el
 * sitio desaparece o cambia de nombre, la lista deja de coincidir y hay que
 * volver a pensarlo en vez de arrastrar una excepción muerta.
 */
const SIN_CANDADO_A_PROPOSITO: Array<{ archivo: string; ancla: string; razon: string }> = [
  {
    archivo: 'credito/services/creditos.service.ts',
    ancla: 'const duplicado = await em.findOne(CreditoCliente',
    razon:
      'Comprobación de duplicado antes de crear. No hay fila que bloquear todavía; ' +
      'la carrera la cierra el índice único de la tabla, no un candado.',
  },
  {
    archivo: 'credito/services/creditos.service.ts',
    ancla: 'return em.findOne(CreditoCliente',
    razon:
      'Relectura de la fila que esta misma transacción acaba de crear, para ' +
      'devolverla con sus cuotas. Nadie más la conoce aún.',
  },
  {
    archivo: 'credito/services/cobranza.service.ts',
    ancla: 'const creditoPrevio = await em.findOne(CreditoCliente',
    razon:
      'Camino idempotente: el pago ya estaba registrado y sólo se vuelve a ' +
      'contar lo que pasó. No escribe nada.',
  },
];

function archivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acumulado);
    else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

describe('CreditoCliente · quien va a escribirlo, lo bloquea', () => {
  const lecturas: Array<{ archivo: string; linea: number; texto: string; conCandado: boolean }> = [];

  for (const ruta of archivosTs(SRC)) {
    const lineas = readFileSync(ruta, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (!/(findOne|createQueryBuilder)\(\s*CreditoCliente/.test(linea)) return;
      const ventana = lineas.slice(i, i + 12).join('\n');
      lecturas.push({
        archivo: ruta.slice(SRC.length + 1).replace(/\\/g, '/'),
        linea: i + 1,
        texto: linea.trim(),
        conCandado: /setLock\(|lock:\s*\{/.test(ventana),
      });
    });
  }

  it('hay lecturas de crédito que vigilar (si no, la prueba no prueba nada)', () => {
    expect(lecturas.length).toBeGreaterThanOrEqual(4);
  });

  it('cada excepción declarada sigue existiendo donde dice', () => {
    const perdidas = SIN_CANDADO_A_PROPOSITO.filter(
      (e) => !lecturas.some((l) => l.archivo === e.archivo && l.texto.startsWith(e.ancla)),
    ).map((e) => `${e.archivo} · ${e.ancla}`);
    expect(perdidas).toEqual([]);
  });

  it('ninguna otra lectura se queda sin candado', () => {
    const descubiertas = lecturas
      .filter((l) => !l.conCandado)
      .filter(
        (l) =>
          !SIN_CANDADO_A_PROPOSITO.some(
            (e) => e.archivo === l.archivo && l.texto.startsWith(e.ancla),
          ),
      )
      .map((l) => `${l.archivo}:${l.linea} → ${l.texto}`);

    /*
     * Se comparan listas y no cuentas: así el fallo dice QUÉ lectura es, y
     * quien lo lea puede decidir entre ponerle candado o declararla arriba con
     * su razón. Un `toBe(0)` obliga a buscarla a mano.
     */
    expect(descubiertas).toEqual([]);
  });

  it('la anulación de ventas lo bloquea', () => {
    const anulacion = lecturas.filter((l) => l.archivo === 'ventas/services/anulacion-ventas.service.ts');
    expect(anulacion.length).toBeGreaterThan(0);
    expect(anulacion.every((l) => l.conCandado)).toBe(true);
  });
});
