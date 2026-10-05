/**
 * ============================================================================
 * Lo que el core tiene y el ERP no sabe
 * ----------------------------------------------------------------------------
 * Preguntado por Abel el 30-sep-2026: «¿por qué los clientes que están en
 * Fineract no existen en el ERP, si son de la misma empresa? Deberían estar
 * sincronizados».
 *
 * La respuesta corta es que la replicación va **en un solo sentido a
 * propósito**: el padrón de clientes es del ERP, que es donde viven el RFC, el
 * régimen fiscal, la lista de precios y la política de crédito. Un cliente
 * nacido en el core no trae nada de eso, y un importador automático tendría que
 * inventárselo.
 *
 * La respuesta larga es el defecto. La conciliación de cartera —el instrumento
 * que decide si la integración está lista, porque mientras tenga diferencias
 * abiertas la empresa no sube de SOMBRA a AUTORIDAD— recorría los clientes
 * **vinculados**. Un cliente creado directamente en el core no tiene vínculo:
 * no entraba en ningún bucle, no generaba diferencia, y el informe decía «sin
 * discrepancias abiertas» mientras allá había cartera que el ERP no sabía que
 * existía.
 *
 * Es el mismo agujero que tenía el diagnóstico de roles, que reportaba «Listo»
 * sobre un rol espejo sin permisos: **un instrumento que decide si algo está
 * listo mirando sólo el lado que ya conocía.**
 *
 * Y había un tercer silencio, más tonto y más caro: esos tres endpoints
 * —consultar, ejecutar, cerrar— existían desde hacía meses y **ninguna pantalla
 * del ERP los llamaba**. El cron escribía sus hallazgos cada noche y la única
 * forma de verlos era pegarle al API a mano. Un control que acierta y que nadie
 * puede leer no es un control: es un registro.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { CarteraExternaNoConfigurada } from './ports/cartera-externa.port';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const fuente = (...ruta: string[]) => readFileSync(join(SRC, ...ruta), 'utf8');
const sinComentarios = (t: string) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('El puerto sabe mirar en el sentido que faltaba', () => {
  it('declara `clientesDelExterno`', () => {
    const puerto = sinComentarios(fuente('integracion', 'ports', 'cartera-externa.port.ts'));
    expect(puerto).toMatch(
      /clientesDelExterno\(empresaId: string\): Promise<ClienteDelExterno\[\] \| null>;/,
    );
  });

  it('«no se pudo preguntar» es null, no una lista vacía', async () => {
    /*
     * La distinción que hace útil el hallazgo: `[]` significa «el core no tiene
     * ningún cliente que el ERP no conozca», que es una afirmación fuerte;
     * `null` significa «no sé», y sobre eso no se acusa a nadie. Es la misma
     * disciplina de `permisosDeRol`.
     */
    const sinCore = new CarteraExternaNoConfigurada();
    await expect(sinCore.clientesDelExterno()).resolves.toBeNull();
  });

  it('el adaptador pregunta POR OFICINA', () => {
    /*
     * En Fineract la oficina es lo que separa las carteras. Sin ese filtro se
     * traerían los clientes de todas las empresas que comparten inquilino y la
     * conciliación de una acusaría a la otra de tener clientes de más. Es el
     * mismo defecto que ya costó una corrección al replicar clientes a la
     * oficina 1 por omisión.
     */
    const adaptador = sinComentarios(
      fuente('integracion', 'adaptadores', 'fineract', 'fineract-cartera.adapter.ts'),
    );
    expect(adaptador).toMatch(/\/v1\/clients\?officeId=\$\{oficina\}/);
    expect(adaptador).toMatch(/if \(!oficina\) return null;/);
  });

  it('y no tumba la conciliación si falla', () => {
    /*
     * Esta consulta es un extra. Que falle no puede impedir que se revise todo
     * lo demás, que es lo que lleva meses funcionando.
     */
    const adaptador = fuente(
      'integracion', 'adaptadores', 'fineract', 'fineract-cartera.adapter.ts',
    );
    const metodo = adaptador.slice(
      adaptador.indexOf('async clientesDelExterno('),
      adaptador.indexOf('async resumenCliente('),
    );
    expect(metodo).toMatch(/catch \(error\)/);
    expect(metodo).toMatch(/return null;/);
    expect(metodo).not.toMatch(/throw/);
  });

  it('el paginado tiene tope: un core enorme no tumba la corrida nocturna', () => {
    const adaptador = sinComentarios(
      fuente('integracion', 'adaptadores', 'fineract', 'fineract-cartera.adapter.ts'),
    );
    expect(adaptador).toMatch(/pagina < 20/);
    expect(adaptador).toMatch(/if \(filas\.length < porPagina\) break;/);
  });
});

describe('La conciliación mira los dos sentidos', () => {
  const servicio = fuente('integracion', 'services', 'cartera-conciliacion.service.ts');
  const codigo = sinComentarios(servicio);

  it('pregunta por los clientes del externo', () => {
    expect(codigo).toMatch(/await this\.externa\.clientesDelExterno\(empresaId\)/);
  });

  it('un null no genera acusaciones', () => {
    /* Sin esto, no poder preguntar se leería como «el core está vacío». */
    expect(codigo).toMatch(/if \(delExterno !== null\)/);
  });

  it('sólo acusa a los que el ERP no reconoce', () => {
    expect(codigo).toMatch(/if \(conocidos\.has\(ajeno\.idExterno\)\) continue;/);
  });

  it('registra `SOLO_EN_EXTERNO` y lo da por revisado', () => {
    /*
     * Entrar en `revisadas` es lo que permite que la diferencia se cierre sola
     * el día que el cliente se dé de alta y se vincule. Sin eso quedaría
     * abierta para siempre y la empresa no podría promoverse nunca.
     */
    expect(codigo).toMatch(/concepto: 'SOLO_EN_EXTERNO',/);
    expect(codigo).toMatch(/revisadas\.add\(ajeno\.idExterno\)/);
  });

  it('el detalle dice por qué pasa y qué hacer, no sólo qué falta', () => {
    expect(servicio).toMatch(/La replicación va del ERP al core, nunca al revés/);
    expect(servicio).toMatch(/Dalo de alta /);
  });
});

describe('La identidad del hallazgo cabe en su columna', () => {
  it('`entidadId` es texto, no uuid', () => {
    /*
     * El id de un cliente de Fineract es un entero, y éste es un hallazgo que
     * NO tiene identificador del ERP —ésa es justamente la noticia—. En una
     * columna `uuid` eso aborta la transacción con «invalid input syntax for
     * type uuid», y no se ve al compilar: es la misma clase de defecto que el
     * `ordenMenu: 21.5` que tumbó la API entera.
     */
    const entidad = fuente('integracion', 'entities', 'discrepancia-integracion.entity.ts');
    expect(entidad).toMatch(
      /@Column\(\{ type: 'varchar', length: 64, nullable: true \}\)\s*\n\s*entidadId!: string \| null;/,
    );
    expect(entidad).not.toMatch(/type: 'uuid', nullable: true \}\) entidadId/);
  });

  it('y la migración convierte sin perder lo que había', () => {
    const migracion = fuente(
      'database', 'migrations', 'postgres', '1790820000000-UnHallazgoDelOtroLado.ts',
    );
    expect(migracion).toMatch(/ALTER COLUMN entidadid TYPE varchar\(64\) USING entidadid::text/);
    /* Reejecutable: si ya es texto, no hace nada. */
    expect(migracion).toMatch(/!== 'uuid'\) return;/);
  });
});

describe('La fecha de corte es la del negocio', () => {
  it('no depende de la zona del servidor', () => {
    /*
     * `fechaCorte` es `@Column({ type: 'date' })` y TypeORM la escribe con los
     * getters LOCALES DEL PROCESO. La tarea corre a las 05:30 UTC, que en
     * México son las 23:30: justo la franja en la que las dos fechas no
     * coinciden. En un servidor en UTC —lo que hace cualquier nube— la
     * conciliación de la noche del día D quedaría fechada D+1.
     *
     * No se vio fallar: el backend de pruebas corre en hora de México. Se
     * corrige porque depender de la zona del servidor es depender de dónde se
     * despliegue.
     */
    const codigo = sinComentarios(
      fuente('integracion', 'services', 'cartera-conciliacion.service.ts'),
    );
    expect(codigo).toMatch(/const fechaCorte = fechaContableNegocio\(\)/);
    expect(codigo).not.toMatch(/const fechaCorte = new Date\(\)/);
  });
});

describe('Y por fin se puede leer', () => {
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/integracion/conciliacion-cartera/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('existe la pantalla', () => {
    if (!FRONTEND) return;
    expect(hay).toBe(true);
  });

  it('usa los tres endpoints que llevaban meses sin pantalla', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/\/integracion\/conciliacion"/);
    expect(pantalla).toMatch(/\/integracion\/conciliacion\/ejecutar/);
    expect(pantalla).toMatch(/\/integracion\/conciliacion\/\$\{id\}\/resolver/);
  });

  it('está en el catálogo de pantallas navegables', () => {
    /*
     * Sin esto el servidor no la ofrece en el menú de nadie y volveríamos al
     * punto de partida: el control existe y no se puede llegar a él.
     */
    const catalogo = fuente('iam', 'data', 'endpoints-navegables.ts');
    expect(catalogo).toMatch(/'GET \/integracion\/conciliacion': \{/);
    expect(catalogo).toMatch(/\/dashboard\/integracion\/conciliacion-cartera/);
  });

  it('declara que vive del core, en el eje de cartera', () => {
    /*
     * Lo exige `una-pantalla-que-vive-del-core-lo-declara`: una empresa que no
     * contrató cartera no debe ver en su menú una pantalla que sólo sabe
     * preguntarle al core. Esa prueba lo señaló en cuanto se escribió ésta.
     */
    if (!FRONTEND) return;
    const menu = readFileSync(join(FRONTEND, 'app/dashboard/module-config.ts'), 'utf8');
    const item = menu.slice(
      menu.indexOf('/dashboard/integracion/conciliacion-cartera'),
      menu.indexOf('/dashboard/integracion/conciliacion-cartera') + 200,
    );
    expect(item).toMatch(/requiereCore: "cartera"/);
  });

  it('traduce el concepto en vez de enseñar la palabra en mayúsculas', () => {
    /*
     * El servidor manda `SOLO_EN_EXTERNO`. Enseñarlo tal cual deja a quien lo
     * lee adivinando si eso es grave y a quién le toca arreglarlo.
     */
    if (!hay) return;
    expect(pantalla).toMatch(/SOLO_EN_EXTERNO: \{/);
    expect(pantalla).toMatch(/SIN_CONTRAPARTE: \{/);
    expect(pantalla).toMatch(/queHacer:/);
  });

  it('no enseña dos saldos donde no hay dos saldos', () => {
    /*
     * En «existe en el core y el ERP no lo conoce» no hay importes que
     * comparar. Pintar «ERP $0.00 · core $1.00» convertiría una ausencia en un
     * descuadre de un peso, y alguien iría a buscar ese peso.
     */
    if (!hay) return;
    expect(pantalla).toMatch(/d\.concepto !== "SOLO_EN_EXTERNO"/);
  });

  it('exige nota al cerrar una diferencia a mano', () => {
    /*
     * Una diferencia cerrada sin explicación obliga a reconstruir meses
     * después por qué se cerró, y nadie se acuerda.
     */
    if (!hay) return;
    expect(pantalla).toMatch(/obligatorio: true/);
  });
});

describe('El catálogo de lo que se replica es la lista de lo replicado', () => {
  /*
   * ==========================================================================
   * La segunda mitad de la pregunta de Abel: «valida si hay otros catálogos
   * que debieran sincronizarse solos».
   *
   * `TipoVinculo` es, para quien lo lee, la lista de lo que el ERP y el core
   * mantienen en correspondencia. Tenía dos miembros que ninguna línea del
   * sistema escribía nunca:
   *
   *   · `PROVEEDOR`, que prometía una replicación que nadie iba a construir
   *     —el registro externo es un core de crédito y no conoce proveedores—;
   *   · `CUENTA_CONTABLE`, cuando las cuentas ya se corresponden por su propia
   *     tabla, `integracion_mapeo_cuentas`, que además guarda el sentido y la
   *     validación. Dos mecanismos para lo mismo son uno que se mantiene y
   *     otro que se queda atrás.
   *
   * Es el mismo defecto que los tres interruptores muertos de la ficha del
   * producto, en el catálogo que un desarrollador consulta para saber qué está
   * integrado.
   * ==========================================================================
   */
  const constantes = fuente('integracion', 'integracion.constants.ts');

  const miembros = (() => {
    const bloque = constantes.slice(
      constantes.indexOf('export enum TipoVinculo {'),
      constantes.indexOf('}', constantes.indexOf('export enum TipoVinculo {')),
    );
    return [...bloque.matchAll(/^\s*([A-Z_]+) =/gm)].map((m) => m[1]);
  })();

  it('el enum se encontró', () => {
    expect(miembros.length).toBeGreaterThan(3);
  });

  it('`PROVEEDOR` y `CUENTA_CONTABLE` ya no se prometen', () => {
    expect(miembros).not.toContain('PROVEEDOR');
    expect(miembros).not.toContain('CUENTA_CONTABLE');
  });

  it('CADA tipo que queda lo escribe alguien', () => {
    /*
     * La regla, no los dos casos. Se busca quién CREA un vínculo de ese tipo,
     * no quién lo nombra: el propio enum y los diagnósticos que los listan no
     * cuentan como uso. El día que alguien declare un tipo nuevo «para luego»,
     * esto se cae y lo nombra.
     */
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const archivos: string[] = [];
    const caminar = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const completo = join(dir, nombre);
        if (statSync(completo).isDirectory()) caminar(completo);
        else if (completo.endsWith('.ts') && !completo.endsWith('.spec.ts'))
          archivos.push(completo);
      }
    };
    caminar(SRC);

    const codigo = archivos
      .filter((f) => !f.endsWith('integracion.constants.ts'))
      .map((f) => sinComentarios(readFileSync(f, 'utf8')))
      .join('\n');

    const huerfanos = miembros.filter(
      (m) => !codigo.includes(`TipoVinculo.${m}`),
    );
    expect(huerfanos).toEqual([]);
  });

  it('las cuentas contables siguen teniendo su propio mapeo', () => {
    /*
     * La prueba en el otro sentido: quitar el miembro del enum no podía
     * significar que las cuentas dejaran de corresponderse. Se corresponden,
     * por otra tabla y mejor.
     */
    const entidad = fuente(
      'integracion', 'entities', 'mapeo-cuenta-externa.entity.ts',
    );
    expect(entidad).toMatch(/@Entity\('integracion_mapeo_cuentas'\)/);
  });
});
