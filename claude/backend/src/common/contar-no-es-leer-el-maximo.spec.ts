/**
 * ============================================================================
 * Contar no es leer el máximo y sumarle uno
 * ----------------------------------------------------------------------------
 * Cuatro documentos se numeraban con un `SELECT MAX(...) + 1`: la oportunidad
 * de CRM (`OPP-`), el activo fijo (`AF-`), la devolución a proveedor (`DP-`) y
 * el movimiento de tesorería (`TM-`).
 *
 * Entre leer el máximo y escribir la fila hay una ventana. Dos altas
 * simultáneas leen el mismo máximo y se llevan el mismo número. No se nota en
 * pruebas —hace falta que dos personas guarden en el mismo instante— y se nota
 * el día que una sucursal entera captura a la vez.
 *
 * Lo que decide la gravedad es si la base lo impide:
 *
 *   · `activos_fijos` ya tenía índice único. Ahí la carrera da un error 500:
 *     feo, pero ruidoso, y nadie se queda con dos activos iguales.
 *   · Las otras tres no lo tenían. Ahí la carrera **no da error**: da dos
 *     documentos con el mismo folio, en silencio. Dos movimientos de dinero
 *     con el mismo número y una conciliación que no cuadra sin que nadie sepa
 *     por qué; dos devoluciones con el mismo número, cada una con su asiento,
 *     y una nota de crédito del proveedor que ya no se sabe a cuál pertenece.
 *
 * El arreglo son dos cosas, y ninguna basta sola: el servicio reserva el
 * número con una sentencia atómica, y la base se niega a guardar dos iguales.
 *
 * El FORMATO no se tocó. Esas cuatro series están impresas y referidas así, y
 * lo que estaba roto no era la forma: era la cuenta.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { SIN_EJERCICIO, TIPOS_CORRIDOS } from './services/folios.service';

const SRC = join(__dirname, '..');
const fuente = (...ruta: string[]) => readFileSync(join(SRC, ...ruta), 'utf8');
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Los cuatro generadores: su archivo y el prefijo que produce. */
const GENERADORES: { archivo: string[]; tipo: string; formato: RegExp }[] = [
  {
    archivo: ['crm', 'services', 'crm.service.ts'],
    tipo: 'OPORTUNIDAD',
    formato: /`OPP-\$\{String\(consecutivo\)\.padStart\(6, '0'\)\}`/,
  },
  {
    archivo: ['activos', 'services', 'activos.service.ts'],
    tipo: 'ACTIVO_FIJO',
    formato: /`AF-\$\{String\(consecutivo\)\.padStart\(6, '0'\)\}`/,
  },
  {
    archivo: ['compras', 'services', 'devoluciones-proveedor.service.ts'],
    tipo: 'DEVOLUCION_PROVEEDOR',
    formato: /`DP-\$\{String\(consecutivo\)\.padStart\(6, '0'\)\}`/,
  },
  {
    archivo: ['tesoreria', 'services', 'tesoreria.service.ts'],
    tipo: 'MOVIMIENTO_TESORERIA',
    formato: /`TM-\$\{String\(consecutivo\)\.padStart\(8, '0'\)\}`/,
  },
];

describe('Ningún generador vuelve a leer el máximo', () => {
  it('ninguno de los cuatro usa `MAX(` para numerar', () => {
    for (const { archivo } of GENERADORES) {
      const codigo = sinComentarios(fuente(...archivo));
      expect([archivo.join('/'), /MAX\(CAST\(SUBSTRING/.test(codigo)]).toEqual([
        archivo.join('/'),
        false,
      ]);
    }
  });

  it('los cuatro reservan con la sentencia atómica', () => {
    for (const { archivo, tipo } of GENERADORES) {
      const codigo = sinComentarios(fuente(...archivo));
      expect([archivo.join('/'), codigo.includes('this.folios.siguienteConsecutivo(')]).toEqual([
        archivo.join('/'),
        true,
      ]);
      expect([archivo.join('/'), codigo.includes(`TIPOS_CORRIDOS.${tipo}`)]).toEqual([
        archivo.join('/'),
        true,
      ]);
    }
  });

  it('y conservan su formato de siempre', () => {
    /*
     * La prueba en el otro sentido, y no es menor: unificar el formato habría
     * exigido renumerar cuatro series que ya están impresas y referidas.
     * Arreglar la cuenta no autorizaba a cambiar los números.
     */
    for (const { archivo, formato } of GENERADORES) {
      expect([archivo.join('/'), formato.test(fuente(...archivo))]).toEqual([
        archivo.join('/'),
        true,
      ]);
    }
  });

  it('van sin ejercicio: son series corridas, no anuales', () => {
    for (const { archivo } of GENERADORES) {
      const codigo = sinComentarios(fuente(...archivo));
      expect([archivo.join('/'), codigo.includes('SIN_EJERCICIO')]).toEqual([
        archivo.join('/'),
        true,
      ]);
    }
    expect(SIN_EJERCICIO).toBe(0);
  });

  it('la devolución reserva DENTRO de su transacción', () => {
    /*
     * Es la única de las cuatro cuyo alta ya estaba en una transacción, así que
     * es la única donde el número se puede devolver si el alta falla. Pasarle
     * `this.devoluciones.manager` en vez del manager en curso lo rompería sin
     * que nada fallara: sólo aparecerían huecos.
     */
    const codigo = sinComentarios(
      fuente('compras', 'services', 'devoluciones-proveedor.service.ts'),
    );
    expect(codigo).toMatch(/this\.siguienteFolio\(empresaId, manager\)/);
  });

  it('tesorería reserva con el manager del repositorio en curso', () => {
    const codigo = sinComentarios(
      fuente('tesoreria', 'services', 'tesoreria.service.ts'),
    );
    expect(codigo).toMatch(/repo\.manager,/);
  });
});

describe('La base se niega a guardar dos folios iguales', () => {
  const CON_INDICE = [
    ['crm', 'entities', 'crm.entity.ts'],
    ['compras', 'entities', 'devolucion-proveedor.entity.ts'],
    ['tesoreria', 'entities', 'tesoreria.entity.ts'],
  ];

  it('las tres tablas que no lo tenían ahora lo declaran', () => {
    /*
     * Ésta es la mitad que hace que el arreglo sea de fondo. El servicio ya no
     * produce duplicados; el índice es lo que impide que los produzca otro
     * camino —una importación, un script, una versión vieja del cliente—.
     */
    for (const ruta of CON_INDICE) {
      const entidad = fuente(...ruta);
      expect([ruta.join('/'), entidad.includes(
        "@Index(['empresaId', 'folio'], { unique: true, where: 'folio IS NOT NULL' })",
      )]).toEqual([ruta.join('/'), true]);
    }
  });

  it('y el activo fijo conserva el suyo, que ya tenía', () => {
    const entidad = fuente('activos', 'entities', 'activo-fijo.entity.ts');
    expect(entidad).toMatch(
      /@Index\(\['empresaId', 'codigo'\], \{ unique: true \}\)/,
    );
  });
});

describe('La migración siembra antes de exigir', () => {
  const migracion = fuente(
    'database',
    'migrations',
    'postgres',
    '1790810000000-ContarNoEsLeerElMaximo.ts',
  );

  it('deja cada secuencia en el consecutivo más alto ya usado', () => {
    /*
     * Sin esto la primera alta pediría el 1 y chocaría contra un folio
     * existente: el arreglo contra duplicados rompería el alta el primer día.
     */
    expect(migracion).toMatch(/INSERT INTO folio_secuencias/);
    expect(migracion).toMatch(/MAX\(\$\{numero\}\)::int/);
    expect(migracion).toMatch(
      /DO UPDATE SET ultimo = GREATEST\(folio_secuencias\.ultimo, EXCLUDED\.ultimo\)/,
    );
  });

  it('sólo cuenta los folios bien formados', () => {
    /* Uno roto —de los que ya hubo en tesorería— no puede marcar el tope. */
    expect(migracion).toMatch(/\^\$\{tipo\}-\[0-9\]\{1,12\}\$/);
  });

  it('se planta si ya hay duplicados, y los nombra', () => {
    /*
     * Crear el índice sobre una tabla con repetidos falla con un error de
     * PostgreSQL que no dice cuáles son. Y seguir en silencio dejaría la tabla
     * sin la única garantía que impide que se repita: nadie se enteraría hasta
     * la siguiente conciliación que no cuadre.
     */
    expect(migracion).toMatch(/HAVING COUNT\(\*\) > 1/);
    expect(migracion).toMatch(/throw new Error\(/);
    expect(migracion).toMatch(/Renumera los repetidos a /);
  });

  it('el índice se crea DESPUÉS de sembrar', () => {
    const iSemilla = migracion.indexOf('INSERT INTO folio_secuencias');
    const iIndice = migracion.indexOf('CREATE UNIQUE INDEX');
    expect(iSemilla).toBeGreaterThan(-1);
    expect(iIndice).toBeGreaterThan(iSemilla);
  });

  it('al deshacer no devuelve las series al uno', () => {
    /*
     * `down()` quita los índices y deja las semillas. Borrarlas haría que la
     * siguiente alta pidiera el 1 contra folios existentes: deshacer un índice
     * no puede dejar la numeración peor de lo que estaba.
     */
    const abajo = migracion.slice(migracion.indexOf('public async down'));
    expect(abajo).toMatch(/DROP INDEX IF EXISTS/);
    expect(abajo).not.toMatch(/DELETE FROM folio_secuencias/);
  });

  it('salta las tablas que no existan en esa instalación', () => {
    expect(migracion).toMatch(
      /if \(!\(await this\.existe\(queryRunner, tabla\)\)\) continue;/,
    );
  });
});

describe('Y el servicio distingue las dos formas de numerar', () => {
  const servicio = sinComentarios(
    fuente('common', 'services', 'folios.service.ts'),
  );

  it('`siguienteConsecutivo` devuelve el número, no la cadena', () => {
    /*
     * Porque cada una de estas cuatro series se escribe distinto. Unificar la
     * FORMA no era lo que estaba roto, y forzarla habría obligado a renumerar.
     */
    expect(servicio).toMatch(
      /async siguienteConsecutivo\([\s\S]*?\): Promise<number>/,
    );
  });

  it('y `siguiente` se apoya en él, para que haya un solo sitio que cuenta', () => {
    /*
     * Dos implementaciones de la misma atomicidad es una que se arregla y otra
     * que se queda. Es el patrón que generó este defecto: cuatro copias del
     * mismo `SELECT MAX(...)`.
     */
    expect(servicio).toMatch(/const consecutivo = await this\.siguienteConsecutivo\(/);
    const cuantas = (servicio.match(/INSERT INTO folio_secuencias/g) ?? []).length;
    expect(cuantas).toBe(1);
  });

  it('los cuatro prefijos viven en un solo catálogo', () => {
    expect(Object.values(TIPOS_CORRIDOS).sort()).toEqual([
      'AF',
      'DP',
      'OPP',
      'TM',
    ]);
  });
});
