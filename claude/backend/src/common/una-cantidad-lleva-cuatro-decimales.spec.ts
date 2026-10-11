import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * ============================================================================
 * UNA CANTIDAD LLEVA CUATRO DECIMALES
 * ----------------------------------------------------------------------------
 * EL CASO QUE LO ORIGINA
 *
 * El inventario guarda `numeric(18,4)` y los documentos que lo mueven
 * guardaban `numeric(10,2)`. El ERP se instala con kilogramo, litro, mililitro
 * y metro entre sus unidades estándar, así que vender 0.125 kg es un caso
 * previsto. Lo que ocurría:
 *
 *     el servicio descuenta   0.125  del almacén, que sí los guarda
 *     la línea de la venta se guarda como 0.13, porque PostgreSQL redondea
 *     el importe ya se había calculado con 0.125
 *
 * La venta y el movimiento de inventario discrepaban en 0.005, en silencio.
 * Y en la misma tabla `cantidadDevuelta` ya era (18,4): se podía devolver con
 * más precisión de la que se vendió.
 *
 * POR QUÉ ESTA PRUEBA Y NO SÓLO LA MIGRACIÓN
 *
 * Porque el defecto no fue escribir una columna mal: fue que nadie se enteró
 * de que dos tablas que se suman entre sí llevaban distinta precisión. La
 * migración arregla las trece columnas de hoy; esto es lo que impide que la
 * número catorce nazca igual. *Un hueco que se sabe ausente cuesta una
 * conversación; uno que se cree puesto cuesta un cliente.*
 *
 * CÓMO MIDE
 *
 * Lee las declaraciones reales de TypeORM —`getMetadataArgsStorage()`, lo que
 * el decorador registró—, no el texto del archivo. Una prueba que buscara
 * «scale: 4» en el código se pondría verde con un comentario que lo mencione.
 * ============================================================================
 */

/** La raíz de `src`, para importar todas las entidades. */
const SRC = join(__dirname, '..');

function entidades(dir: string, hallados: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) entidades(p, hallados);
    else if (n.endsWith('.entity.ts')) hallados.push(p);
  }
  return hallados;
}

/*
 * Las entidades se importan todas: el almacenamiento de metadatos de TypeORM
 * se llena cuando el decorador corre, así que una entidad no importada
 * sencillamente no se revisaría — y ésa sería justo la que se cuela.
 */
const ARCHIVOS = entidades(SRC);
for (const archivo of ARCHIVOS) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require(archivo);
}

/**
 * Los nombres que significan «una cantidad de mercancía».
 *
 * Es una lista de prefijos y no una heurística lista porque el error caro es
 * el contrario: dar por cantidad algo que no lo es y obligar a declarar una
 * excepción que nadie entiende.
 */
const ES_CANTIDAD = (nombre: string) => {
  const n = nombre.toLowerCase();
  return (
    n === 'cantidad' ||
    n.startsWith('cantidad') ||
    n === 'existencia' ||
    n.startsWith('existencia') ||
    n === 'rendimiento' ||
    n === 'stockminimo' ||
    n === 'stockmaximo' ||
    n === 'puntoreorden'
  );
};

/**
 * Las excepciones, cada una con su razón. Una excepción sin razón escrita es
 * una columna que alguien añadió a la lista para que la prueba callara.
 */
const DECLARADAS: Record<string, string> = {
  /* Un conteo de impresiones no es mercancía: es un entero y así se guarda. */
  'Venta.impresionesTicket': 'es un contador entero, no una cantidad de mercancía',
  /*
   * En una partida de recibo de nómina, «cantidad» son días, horas o veces: no
   * es mercancía y no se suma contra el inventario. Dos decimales cubren media
   * hora y el cuarto de día, que es la fracción más fina que la ley reconoce.
   */
  'PartidaRecibo.cantidad':
    'en nómina son días u horas, no mercancía: no se contrasta con el inventario',
};

describe('una cantidad lleva cuatro decimales', () => {
  it('ninguna columna de cantidad se guarda con menos precisión que el inventario', () => {
    const columnas = getMetadataArgsStorage().columns;
    /* La prueba de la prueba: si el barrido no encontró entidades, la lista
       vacía de culpables no significaría nada. */
    expect(columnas.length).toBeGreaterThan(200);

    const culpables: string[] = [];
    let revisadas = 0;

    for (const c of columnas) {
      const opciones: any = c.options ?? {};
      if (opciones.type !== 'decimal' && opciones.type !== 'numeric') continue;
      const nombre = String(c.propertyName);
      if (!ES_CANTIDAD(nombre)) continue;
      const clase = (c.target as any)?.name ?? '¿?';
      const llave = `${clase}.${nombre}`;
      if (DECLARADAS[llave]) continue;
      revisadas++;
      const escala = Number(opciones.scale ?? 0);
      if (escala < 4) {
        culpables.push(`${llave}: scale ${escala} (el inventario lleva 4)`);
      }
    }

    expect(revisadas).toBeGreaterThan(15);
    expect(culpables.sort()).toEqual([]);
  });

  it('cada excepción declarada sigue existiendo y sigue explicada', () => {
    /*
     * Una lista de excepciones que se queda con nombres de columnas borradas
     * es una lista que ya no se lee. Y una sin razón es una columna que entró
     * para que la prueba callara.
     */
    const columnas = getMetadataArgsStorage().columns;
    const huerfanas = Object.keys(DECLARADAS).filter(
      (llave) =>
        !columnas.some(
          (c) => `${(c.target as any)?.name}.${c.propertyName}` === llave,
        ),
    );
    expect(huerfanas).toEqual([]);

    const sinRazon = Object.entries(DECLARADAS)
      .filter(([, razon]) => String(razon).trim().length < 15)
      .map(([llave]) => llave);
    expect(sinRazon).toEqual([]);
  });

  it('el dinero de un documento no tiene techo de ocho dígitos', () => {
    /*
     * `precision: 10` con dos decimales son ocho dígitos enteros:
     * $99,999,999.99 es el máximo y quien lo pase no recibe un número malo
     * sino un error de PostgreSQL en mitad del guardado. Se vigilan los
     * totales de documento, que son los que suman muchas líneas.
     */
    const ES_TOTAL = (n: string) =>
      ['total', 'subtotal', 'importe', 'monto', 'saldo'].includes(n.toLowerCase());
    const estrechos = getMetadataArgsStorage()
      .columns.filter((c) => {
        const o: any = c.options ?? {};
        return (
          (o.type === 'decimal' || o.type === 'numeric') &&
          ES_TOTAL(String(c.propertyName)) &&
          Number(o.precision ?? 0) > 0 &&
          Number(o.precision ?? 0) - Number(o.scale ?? 0) < 10
        );
      })
      .map((c) => `${(c.target as any)?.name}.${c.propertyName}`);
    expect(estrechos.sort()).toEqual([]);
  });
});
