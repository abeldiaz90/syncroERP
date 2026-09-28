import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una clave de idempotencia sin red debajo
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Recibir mercancía exige clave de idempotencia y la comprueba con un SELECT
 * antes de insertar. Eso sirve contra el REINTENTO —el usuario que vuelve a
 * pulsar medio minuto después— y no sirve contra el DOBLE CLIC: dos peticiones
 * simultáneas con la misma clave hacen su SELECT a la vez, ninguna encuentra
 * nada, y las dos insertan. La mercancía entra dos veces al almacén, con sus
 * dos asientos.
 *
 * Lo que lo delata es que el propio código YA tenía escrito el remedio: el
 * `catch` de `recibir()` reconoce la violación de unicidad y devuelve la
 * recepción existente como idempotente. Estaba escrito esperando un índice
 * único… que en `recepciones_compra` no existía. Un `catch` que no se puede
 * alcanzar es peor que ninguno: quien lee el archivo cree que está protegido.
 *
 * El pago al mismo proveedor sí lo tenía desde que nació. Misma comprobación,
 * misma forma, una con red debajo y la otra sin ella.
 *
 * LA REGLA
 *
 * Entre la lectura y la escritura cabe otra transacción, así que **ningún `if`
 * puede cerrar esa ventana**. Sólo la base. Toda entidad que guarde una clave
 * de idempotencia tiene que llevar un índice ÚNICO que la incluya.
 *
 * Y el índice va con el ámbito completo —la empresa, y el documento padre
 * cuando lo hay—: único sólo por la clave impediría que dos empresas usaran el
 * mismo texto, que es otra avería, y romper el aislamiento entre inquilinos por
 * proteger una idempotencia sería un mal cambio.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function entidades(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'migrations') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) entidades(ruta, acc);
    else if (nombre.endsWith('.entity.ts')) acc.push(ruta);
  }
  return acc;
}

/**
 * Las excepciones, con su motivo. No es una lista para crecer sin pensar.
 */
const JUSTIFICADAS: Record<string, string> = {
  'hoteleria/entities/folio.entity.ts:claveIdempotenciaCierre':
    'No identifica una fila nueva: es la clave del ÚLTIMO cierre, guardada en el propio folio. ' +
    'La repetición se resuelve con el candado pesimista que `cerrarFolio` toma sobre esa misma ' +
    'fila antes de leerla, así que la segunda petición espera y ve el cierre ya hecho.',
};

describe('una clave de idempotencia sin red debajo', () => {
  const sinIndice: string[] = [];
  let columnas = 0;

  for (const archivo of entidades(SRC)) {
    const texto = readFileSync(archivo, 'utf8');
    const relativa = archivo.slice(SRC.length + 1).split('\\').join('/');

    /* Las columnas que guardan una clave de idempotencia, por su nombre. */
    const propiedades = [
      ...texto.matchAll(/@Column\([^)]*\)\s*(clave[Ii]dempotencia\w*)\s*[?!]/g),
    ].map((m) => m[1]);
    // El decorador puede ocupar varias líneas: segunda pasada, más laxa.
    const multilinea = [...texto.matchAll(/\n\s*(clave[Ii]dempotencia\w*)\s*[?!]\s*:/g)].map(
      (m) => m[1],
    );

    for (const propiedad of [...new Set([...propiedades, ...multilinea])]) {
      columnas += 1;
      if (JUSTIFICADAS[`${relativa}:${propiedad}`]) continue;

      /*
       * El índice tiene que ser ÚNICO y nombrar esta propiedad. Se busca en los
       * `@Index` de la clase, que es donde TypeORM los declara.
       */
      const protegida = [...texto.matchAll(/@Index\(([\s\S]*?)\)\s*(?=@|export|\/\*|\n)/g)].some(
        (m) => m[1].includes(propiedad) && /unique:\s*true/.test(m[1]),
      );
      if (!protegida) {
        sinIndice.push(`${relativa} · ${propiedad}`);
      }
    }
  }

  it('encuentra claves que revisar (si no, la prueba no prueba nada)', () => {
    expect(columnas).toBeGreaterThanOrEqual(5);
  });

  it('toda clave de idempotencia tiene un índice único que la respalde', () => {
    expect(sinIndice.sort()).toEqual([]);
  });

  it('cada justificación sigue apuntando a una columna que existe', () => {
    /*
     * Una excepción que sobrevive a la columna que justificaba es una excepción
     * que nadie va a revisar, y el hueco que deja no lo ve ya nadie.
     */
    const huerfanas: string[] = [];
    for (const clave of Object.keys(JUSTIFICADAS)) {
      const [relativa, propiedad] = clave.split(':');
      const texto = readFileSync(join(SRC, relativa), 'utf8');
      if (!texto.includes(propiedad)) huerfanas.push(clave);
    }
    expect(huerfanas).toEqual([]);
  });
});
