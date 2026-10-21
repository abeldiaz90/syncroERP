import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Ningún camino llega al core sin haberlo contratado
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * Una empresa puede contratar sólo el ERP, sólo el registro financiero externo,
 * o los dos. El «sólo el ERP» no es una configuración: es una promesa. Si un
 * endpoint cualquiera alcanza el core de una empresa que no lo contrató, esa
 * empresa paga —en consultas que se facturan, en datos que viajan a un sistema
 * que no es suyo, y en una lentitud que nadie sabe explicar.
 *
 * El acceso al core no está esparcido: pasa por CINCO puertos, inyectados por
 * símbolo. `PUERTO_CARTERA_EXTERNA`, `PUERTO_CONTABILIDAD_EXTERNA`,
 * `PUERTO_USUARIOS_EXTERNOS`, `PUERTO_VALIDACION_IDENTIDAD` y
 * `PUERTO_BURO_CREDITO`. Eso hace la pregunta contestable: ¿quién llama a un
 * puerto, y preguntó antes por el modo?
 *
 * QUÉ SE ENCONTRÓ EL 21-OCT-2026
 *
 * Catorce sitios inyectan un puerto. De sus métodos PÚBLICOS —los privados sólo
 * se alcanzan desde dentro de su clase, y ahí la compuerta ya está puesta en el
 * método público que los llama— CINCO llegaban al core sin preguntar:
 *
 *   · `GET /integracion/verificacion`. `verificarConfiguracion` no se queda en
 *     la base: pide `/v1/loanproducts/:id` por cada producto vinculado y, al
 *     final, `/v1/workingdays`, que no depende de que haya productos. Una
 *     empresa con el eje contable en APAGADO no tiene productos vinculados —el
 *     bucle sale vacío— pero la lectura de días hábiles se hacía igual: una
 *     llamada de red al core por cada visita a la pantalla.
 *   · `POST /integracion/conciliacion/ejecutar`. La tarea de las 5:30 recorre
 *     `empresasActivas()` y por eso nunca tocaba a las demás, pero el botón
 *     llamaba a `conciliarEmpresa(empresaId)` directo: una lectura por cliente
 *     contra un registro que la empresa no contrató. La compuerta estaba en la
 *     tarea programada y no en el servicio, así que valía por un camino y no
 *     por el otro.
 *   · `POST /integracion/evaluar-credito`. Llama al puerto de identidad y al de
 *     buró, que se pagan POR CONSULTA. Hoy los dos son `NoConfigurado` y no
 *     sale ni un paquete —por eso llevaba tiempo así—, pero el día que se
 *     conecte un proveedor, una empresa que no contrató validación estaría
 *     gastando consultas porque alguien llamó a la ruta.
 *
 *   · `GET /integracion/cuentas/externas`. `disponiblesEnElMayorExterno()` no
 *     recibía la empresa —la lectura del catálogo es global— y por eso no había
 *     dónde poner la compuerta. Ahora la recibe: una empresa con el eje contable
 *     en APAGADO leía el catálogo de un mayor que no contrató cada vez que
 *     alguien abría la pantalla de correspondencia.
 *   · `/integracion/contabilidad/conciliacion`, sus dos endpoints. Aquí no
 *     había fuga de red —sin espejo no hay `oficinaContableExterna` y la
 *     siguiente línea cortaba— pero cortaba CULPANDO AL DATO EQUIVOCADO:
 *     «Falta la oficina contable externa» manda a quien no contrató el espejo a
 *     buscar un campo que no tiene por qué llenar nunca. Primero se pregunta por
 *     lo contratado, que es la respuesta verdadera.
 *
 * Y dos piezas más: `recodificarImportados` y `suspenderImportados` estaban
 * escritas, con su razón escrita, y sin una sola llamada en el repositorio. La
 * primera llegaba al puerto. Ahora tienen ruta y compuerta.
 *
 * LA REGLA
 *
 * Todo método público de una clase que inyecte un puerto y lo llame por red
 * pregunta primero por el modo de esa empresa. Lo que se mide es la compuerta
 * EN EL MÉTODO, no en la ruta: una regla que protege un sistema de registro —o
 * un contador de consumo— no puede depender de por dónde entró la petición.
 * Está escrito así en `establecerModoCartera`, y estas tres faltas son
 * exactamente lo que pasa cuando no se cumple.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

/** Las lecturas que NO salen a la red: estado local del interruptor. */
const SIN_RED = new Set(['configurado', 'disponible', 'estado', 'proveedor']);

/**
 * Los nombres con los que este repositorio pregunta por el modo. Van por
 * nombre y no por tipo porque varias son ayudantes privadas de su clase
 * —`exigirContratado`, `exigeCorrespondencia`, `activoPara`,
 * `empresaAceptaEvento`— y lo que importa es que la pregunta se haga, no cómo
 * se llame quien la hace.
 */
const COMPUERTA =
  /modoDe\(|perfilDe\(|usaRegistroExterno\(|modoContabilidadDe\(|empresasActivas\(|ModoCartera\.APAGADO|ModoContabilidad\.APAGADO|exigirContratado\(|exigeCorrespondencia\(|exigirValidacionContratada\(|activoPara\(|empresaAceptaEvento\(|hayValidacionContratada\(/;

/**
 * SIN COMENTARIOS, Y EN LAS PRIMERAS LÍNEAS. Las dos cosas hacen falta.
 * ----------------------------------------------------------------------------
 * Sin lo primero, esta regla se cumple con PROSA: al comprobar que podía
 * fallar, se le quitó la compuerta a `conciliarEmpresa` y la regla siguió en
 * verde, porque el comentario que explica la compuerta menciona
 * `empresasActivas()` y `APAGADO`. Es la cuarta vez en un día que una prueba de
 * este repositorio lee un comentario como si fuera código.
 *
 * Sin lo segundo, se cumple con una MENCIÓN TARDÍA: un método de cuatrocientas
 * líneas que consulta el modo al final, para decidir un detalle, no está
 * protegido — y aquí dentro hay métodos de ese tamaño. Una compuerta tiene una
 * forma: se pregunta al entrar y se sale. Si está después de la línea 30 de
 * código, no es una compuerta.
 */
const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const LINEAS_DE_ENTRADA = 30;

const tieneCompuerta = (cuerpo: string): boolean =>
  COMPUERTA.test(
    sinComentarios(cuerpo)
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, LINEAS_DE_ENTRADA)
      .join('\n'),
  );

/**
 * Lo que llega al puerto sin compuerta Y está bien que lo haga, con su motivo.
 *
 * Es una lista, no una excepción general, y cada renglón tiene que poder
 * defenderse en voz alta.
 */
const CON_MOTIVO: Record<string, string> = {
  'integracion/services/roles-externos.service.ts::rolesExternos':
    'Su único llamador es `GET /integracion/roles/catalogos`, que pregunta por ' +
    'el modo y contesta `{ contratado: false, externos: [] }` en vez de lanzar. ' +
    'Una compuerta que lanzara aquí rompería esa respuesta, que es deliberada: ' +
    'para una empresa que sólo usa el ERP no es «un catálogo vacío», es una ' +
    'pantalla que no le toca.',

  /*
   * Los tres evaluadores de pasos. La compuerta está ARRIBA y es estructural:
   * un evaluador sólo corre sobre un paso de un flujo GUARDADO, y
   * `flujos-validacion` rechaza al guardar cualquier paso contratable que la
   * empresa no tenga en sus capacidades (`capacidadPermitida`). Una empresa que
   * sólo contrató el ERP no tiene flujos, y si alguien le creara uno, el paso
   * de identidad o de buró no pasaría del guardado.
   *
   * Es una compuerta de verdad y no una casualidad, pero no se puede medir
   * leyendo el método: por eso va escrita aquí, y por eso la prueba de abajo
   * comprueba que el rechazo al guardar sigue en pie. El día que alguien quite
   * esa línea, estos tres renglones dejan de tener razón y hay que enterarse.
   */
  'integracion/validacion/evaluadores/evaluadores.ts::evaluar':
    'Sólo corre sobre un paso de un flujo guardado, y `flujos-validacion` ' +
    'rechaza al guardar los pasos contratables que la empresa no tiene. ' +
    'Comprobado abajo.',
};

function fuentes(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.ts$/.test(nombre) && !/\.spec\.ts$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

interface Hallazgo {
  clave: string;
  metodo: string;
  puertos: string[];
}

function analizar(texto: string, rel: string): { hallazgos: Hallazgo[]; campos: string[] } {
  /* Los campos inyectados con un símbolo de puerto. */
  const campos = [
    ...texto.matchAll(
      /@Inject\(PUERTO_[A-Z_]+\)\s*(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\s*:/g,
    ),
  ].map((m) => m[1]);
  if (!campos.length) return { hallazgos: [], campos };

  /*
   * Se corta por método de clase. El `(private |public |protected )?` captura
   * la visibilidad: lo que lleva `private` no se puede alcanzar desde fuera, y
   * la compuerta de su clase ya está puesta en el método público que lo llama.
   */
  const bloques = texto.split(
    /\n  (private |public |protected )?(?:async )?(\w+)\s*(?:<[^>]*>)?\s*\(/,
  );

  const hallazgos: Hallazgo[] = [];
  for (let i = 1; i < bloques.length - 1; i += 3) {
    const visibilidad = bloques[i];
    const metodo = bloques[i + 1];
    const cuerpo = bloques[i + 2];
    if (visibilidad === 'private ') continue;
    if (metodo === 'constructor') continue;

    const porRed = campos.filter((campo) => {
      const llamadas = [
        ...cuerpo.matchAll(new RegExp('this\\.' + campo + '\\.(\\w+)\\s*\\(', 'g')),
      ].map((m) => m[1]);
      return llamadas.some((n) => !SIN_RED.has(n));
    });
    if (!porRed.length) continue;
    if (tieneCompuerta(cuerpo)) continue;

    hallazgos.push({ clave: `${rel}::${metodo}`, metodo, puertos: porRed });
  }
  return { hallazgos, campos };
}

describe('Integración · ningún camino llega al core sin haberlo contratado', () => {
  const archivos = fuentes(SRC).map((ruta) => ({
    rel: relative(SRC, ruta).split(sep).join('/'),
    texto: readFileSync(ruta, 'utf8'),
  }));

  const conPuerto = archivos
    .map((a) => ({ ...a, ...analizar(a.texto, a.rel) }))
    .filter((a) => a.campos.length > 0);

  const hallazgos = conPuerto.flatMap((a) => a.hallazgos);

  it('el cruce mide algo: hay clases que inyectan un puerto', () => {
    /*
     * Si los puertos se renombraran, o se dejara de inyectarlos por símbolo,
     * este archivo pasaría sin mirar nada. Es el accidente que ya pasó cuatro
     * veces en este repositorio el 21-oct-2026, siempre igual: la regla sigue
     * en verde y el detector ya no ve.
     */
    expect(conPuerto.length).toBeGreaterThanOrEqual(10);
    expect(archivos.length).toBeGreaterThan(300);
  });

  it('ningún método público llega al puerto sin preguntar por el modo', () => {
    const sinMotivo = hallazgos
      .filter((h) => !(h.clave in CON_MOTIVO))
      .map((h) => `${h.clave}  ->  ${h.puertos.join(', ')}`)
      .sort();
    expect(sinMotivo).toEqual([]);
  });

  it('LA PRUEBA DE LA PRUEBA: cada motivo escrito sigue midiéndose', () => {
    /*
     * Un renglón que ya no corresponde a nada hace creer que la excepción
     * sigue viva y, el día que alguien quite su compuerta de verdad, no hay
     * nada que avise. Al arreglarlo se borra su renglón.
     */
    const vivos = new Set(hallazgos.map((h) => h.clave));
    const muertos = Object.keys(CON_MOTIVO).filter((c) => !vivos.has(c));
    expect(muertos).toEqual([]);
  });

  it('y las tres compuertas que se pusieron esa noche siguen puestas', () => {
    /*
     * Escritas una por una, porque son el defecto concreto: si alguien las
     * quita, la regla de arriba lo diría con el nombre del método, pero este
     * renglón lo dice con el nombre del endpoint, que es como se cuenta.
     */
    const leer = (r: string) => readFileSync(join(SRC, r), 'utf8');

    /* GET /integracion/verificacion */
    const controlador = leer('integracion/controllers/integracion.controller.ts');
    expect(controlador).toMatch(
      /@Get\('verificacion'\)[\s\S]{0,2200}?modoContabilidadDe\(empresaId\)/,
    );

    /* POST /integracion/conciliacion/ejecutar */
    const cartera = leer('integracion/services/cartera-conciliacion.service.ts');
    expect(cartera).toMatch(
      /async conciliarEmpresa\([\s\S]{0,2000}?usaRegistroExterno\(empresaId\)/,
    );

    /* POST /integracion/evaluar-credito */
    const decision = leer('integracion/services/decision-credito.service.ts');
    expect(decision).toMatch(
      /async evaluar\(entrada[\s\S]{0,900}?exigirValidacionContratada\(entrada\.empresaId\)/,
    );
  });

  it('el motivo de los evaluadores se sostiene: no se guarda un paso sin contratar', () => {
    /*
     * Los tres renglones de `evaluadores.ts` en CON_MOTIVO dependen enteramente
     * de esta línea. Sin ella, un flujo podría guardarse con un paso de buró en
     * una empresa que no contrató buró, y entonces el evaluador correría y
     * consultaría —y se pagaría. Un motivo escrito que nadie comprueba es un
     * cuento.
     */
    const flujos = readFileSync(
      join(SRC, 'integracion/validacion/services/flujos-validacion.service.ts'),
      'utf8',
    );
    expect(flujos).toMatch(/capacidadesContratadas\(empresaId\)/);
    expect(flujos).toMatch(/!capacidadPermitida\(paso\.tipo, contratadas\)/);

    /* Y que la función siga entendiendo la ausencia como «no restrinjo». */
    const constantes = readFileSync(
      join(SRC, 'integracion/validacion/validacion.constants.ts'),
      'utf8',
    );
    expect(constantes).toMatch(
      /if \(!Array\.isArray\(contratadas\)\) return true;/,
    );
    expect(constantes).toMatch(/return contratadas\.includes\(tipo\);/);
  });

  it('las dos piezas que nadie llamaba ya tienen ruta', () => {
    const ctrl = readFileSync(
      join(SRC, 'credito/controllers/productos-credito.controller.ts'),
      'utf8',
    );
    expect(ctrl).toMatch(/@Post\('importados\/recodificar'\)/);
    expect(ctrl).toMatch(/@Post\('importados\/suspender'\)/);

    /*
     * Y van ANTES de las rutas con parámetro: `importados/suspender` encaja en
     * `:id/suspender` con `:id` = «importados», y Nest resuelve por orden de
     * declaración. Declaradas después, suspender los importados habría
     * intentado suspender un producto llamado «importados».
     */
    expect(ctrl.indexOf("@Post('importados/suspender')")).toBeLessThan(
      ctrl.indexOf("@Post(':id/suspender')"),
    );
  });
});
