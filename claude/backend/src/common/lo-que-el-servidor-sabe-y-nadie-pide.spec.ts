import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Lo que el servidor sabe hacer y ninguna pantalla pide
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * «¿Falta funcionalidad?» se suele mirar por el lado de la pantalla: un botón
 * que no está, un campo que no se puede capturar. Hay un segundo lado, y es
 * más caro porque no se ve: funcionalidad que ESTÁ ESCRITA Y PROBADA en el
 * servidor y a la que no se llega desde ningún sitio. Se pagó, se mantiene, se
 * migra, y no sirve a nadie.
 *
 * MEDIDO el 21-oct-2026 cruzando las 604 rutas que sirven los controladores
 * contra todo lo que piden el ERP y la consola de SUMA. Dieron noventa y
 * nueve; doce eran un fallo del cruce —la consola arma sus rutas en dos
 * trozos, ver `prefijosDe`— y otras nueve también: son rutas hermanas que la
 * pantalla elige con un ternario. Quedaron setenta y seis, triadas a mano el
 * 22-oct-2026, y la lista baja según se conectan o se quitan: `estado` de
 * requisiciones se borró —prometía nueve estados y concedía el mismo que
 * `/cancelar`— y producir, explotar y los traspasos ya tienen pantalla. Entre ellas, cosas que no son cabos sueltos sino módulos enteros
 * sin puerta:
 *
 *   · Las RESERVAS del WMS —crear, liberar, consumir— y la disponibilidad por
 *     ubicación. Ni una pantalla.
 *   · `POST /integracion/evaluar-credito`, el motor de decisión que reúne
 *     identidad, buró e historial y aplica la política. Ninguna pantalla lo
 *     llama.
 *   · `POST /integracion/sincronizacion-inicial`.
 *   · Los cuatro desgloses del catálogo de códigos postales —estados,
 *     municipios, colonias, estatus—: el alta de clientes sólo usa la consulta
 *     por código postal.
 *   · `GET /auth/menu`, que arma el menú entero del lado del servidor. Quedó
 *     atrás cuando el menú pasó a armarse con `mis-rutas`, y sigue ahí.
 *
 * ESTA LISTA NO ESTÁ TRIADA, y decirlo importa. Alguna de estas rutas existe a
 * propósito sin pantalla: las llama un script, una tarea, otra instalación, o
 * se dejaron listas para lo que viene. Otras son un hueco de verdad. Separar
 * unas de otras es trabajo de producto, no de una prueba, y se hace renglón a
 * renglón.
 *
 * LO QUE SÍ HACE ESTA PRUEBA
 *
 * Que la lista no CREZCA sin que alguien lo escriba. Una ruta nueva que nace
 * sin pantalla aparece aquí el mismo día, y entonces es una decisión —«va sin
 * pantalla porque la llama tal cosa»— y no un olvido que se descubre un año
 * después. Cuando una se conecta o se borra, se quita su renglón y el techo
 * baja con él.
 *
 * CÓMO SE MIDE, Y POR QUÉ ASÍ
 *
 * Una ruta se alcanza si el frontend escribe algo con su misma FORMA: los
 * segmentos literales en orden, y cualquier cosa donde el controlador declara
 * un parámetro. La primera versión juntaba sólo los literales, así que
 * `/rrhh/empleados/:id/baja` se buscaba como «rrhh/empleados/baja» —que no
 * aparece nunca, porque se escribe `/rrhh/empleados/${id}/baja`— y daba 223 de
 * 604, casi todas mentira.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..', '..');

/** Quien pide: el ERP y la consola de SUMA. Son los dos únicos clientes. */
const CLIENTES = [
  ['claude/frontend', 'frontend', '../claude/frontend'],
  ['../suma-consola', '../../suma-consola', 'suma-consola'],
].map((candidatas) =>
  candidatas.map((n) => join(RAIZ, n)).find((r) => existsSync(join(r, 'app'))),
);

/** Rutas que no las pide ninguna pantalla. Medidas, sin triar. */
const SIN_PANTALLA: string[] = [
  'DELETE /cfdi/:id/cancelar',
  'GET /admin/permisos/arbol',
  'GET /admin/permisos/modulos',
  'GET /admin/permisos/plantillas',
  'GET /admin/permisos/roles',
  'GET /auditoria/:entidad/:id',
  'GET /auditoria/integridad',
  'GET /auth/menu',
  'GET /auth/onboarding/estado',
  'GET /catalogo/inventario/productos/:id/lotes',
  'GET /catalogo/inventario/transferencias',
  'GET /catalogo/productos/atributos/:sector',
  'GET /catalogo/productos/dashboard/metricas',
  'GET /catalogo/productos/dashboard/stock-bajo',
  'GET /catalogo/productos/sectores',
  'GET /catalogo/wms/disponibilidad',
  'GET /catalogos/codigos-postales/colonias',
  'GET /catalogos/codigos-postales/estados',
  'GET /catalogos/codigos-postales/estatus',
  'GET /catalogos/codigos-postales/municipios',
  'GET /compras/ordenes/dashboard/pendientes',
  'GET /compras/ordenes/recepciones',
  'GET /credito/cobranza/pagos/:creditoId',
  'GET /finanzas/centros-costo/exigencia',
  'GET /finanzas/cierres/historial/:anio/:mes',
  'GET /finanzas/cierres/resumen/:anio/:mes',
  'GET /finanzas/polizas/balance',
  'GET /hoteleria/city-ledger/cuentas/:id/cobros',
  'GET /hoteleria/disponibilidad/ocupacion',
  'GET /hoteleria/housekeeping/transiciones/:estado',
  'GET /integracion/acceso',
  'GET /integracion/disponibilidad/:clienteId',
  'GET /integracion/verificacion',
  'GET /recetas/costos/:recetaId/actual',
  'GET /rrhh/nomina/parametros',
  'GET /salud',
  'GET /salud/listo',
  'PATCH /catalogo/wms/reservas/:id/consumir',
  'PATCH /catalogo/wms/reservas/:id/liberar',
  'PATCH /catalogo/wms/ubicaciones/:id',
  'PATCH /hoteleria/config/tipos/:id',
  'PATCH /integracion/configuracion',
  'PATCH /rrhh/nomina-avanzada/cfdi/:id/resultado-pac',
  'POST /aprovisionamiento/empresas/:empresaId/identidad/suspender',
  'POST /auth/onboarding/paso/:numero',
  'POST /catalogo/importacion/stock-inicial/:id/reintentar',
  'POST /catalogo/impuestos/precargar-estandar',
  'POST /catalogo/wms/reservas',
  'POST /catalogos/bancos/restaurar-oficiales',
  'POST /cfdi/:id/enviar-correo',
  'POST /cfdi/:id/reintentar-timbrado',
  'POST /cfdi/devoluciones/:devolucionId/nota-credito/reintentar',
  'POST /cfdi/devoluciones/notas-credito-pendientes/procesar',
  'POST /cfdi/pagos/:pagoId/complemento-pago/reintentar',
  'POST /cfdi/pagos/complementos-pendientes/procesar',
  'POST /credito/cobranza/pago/:pagoId/cancelar',
  'POST /credito/cobranza/reflejar-externas',
  'POST /credito/productos/importados/recodificar',
  'POST /credito/productos/importados/suspender',
  'POST /finanzas/cuentas-contables/precargar-estandar',
  'POST /finanzas/presupuestos/:id/lineas',
  'POST /integracion/evaluar-credito',
  'POST /integracion/roles/cuenta-servicio',
  'POST /integracion/roles/espejo',
  'POST /integracion/sincronizacion-inicial',
  'POST /rrhh/nomina/parametros',
  'POST /usuarios/:id/reenviar-invitacion',
];

function archivos(dir: string, re: RegExp, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, re, acumulado);
    else if (re.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * El trozo de ruta que queda justo antes de una interpolación.
 *
 * `` `${base()}/api/aprovisionamiento/empresas${ruta}` `` da
 * `/aprovisionamiento/empresas`. Se le quita el `/api` porque los
 * controladores no lo llevan: lo pone el prefijo global del servidor.
 *
 * Se mide del código, no se declara: una lista de prefijos escrita a mano
 * envejece igual que la de rutas, y con menos quien la mire.
 */
const prefijosDe = (texto: string): string[] => [
  ...new Set(
    [...texto.matchAll(/((?:\/[A-Za-z0-9_-]+)+)\$\{/g)]
      .map((m) => m[1].replace(/^\/api(?=\/)/, ''))
      .filter((p) => p.length >= 4),
  ),
];

describe('lo que el servidor sabe hacer y ninguna pantalla pide', () => {
  const rutas: string[] = [];
  for (const f of archivos(SRC, /\.controller\.ts$/)) {
    if (/\.spec\./.test(f)) continue;
    const texto = sinComentarios(readFileSync(f, 'utf8'));
    const base = /@Controller\(\s*['"]([^'"]*)['"]/.exec(texto)?.[1] ?? '';
    const re = /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const sub = m[2] ?? '';
      const ruta = ('/' + base + (sub ? '/' + sub : ''))
        .replace(/\/+/g, '/')
        .replace(/\/$/, '');
      if (ruta.replace(/\//g, '')) rutas.push(`${m[1].toUpperCase()} ${ruta}`);
    }
  }

  let pedido = '';
  /*
   * Y también por archivo, que hace falta para la composición de abajo: un
   * prefijo sólo vale dentro del archivo donde se escribe. Juntarlo todo en un
   * texto dejaría que un prefijo de la consola «alcanzara» una ruta que pide
   * el ERP, o al revés, y eso no es alcanzar: es coincidir.
   */
  const porArchivo: { texto: string; prefijos: string[] }[] = [];
  for (const raiz of CLIENTES) {
    if (!raiz) continue;
    for (const d of ['app', 'lib', 'components', 'hooks']) {
      for (const f of archivos(join(raiz, d), /\.tsx?$/)) {
        const texto = sinComentarios(readFileSync(f, 'utf8'));
        pedido += texto + '\n';
        porArchivo.push({ texto, prefijos: prefijosDe(texto) });
      }
    }
  }

  const escapa = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = (ruta: string) =>
    new RegExp(
      ruta
        .split('/')
        .filter(Boolean)
        .map((seg) => (seg.startsWith(':') ? "[^'\"`/]+" : escapa(seg)))
        .map((x) => '/' + x)
        .join(''),
    );

  const alcanzada = (clave: string) => {
    const ruta = clave.split(' ')[1];
    if (patron(ruta).test(pedido)) return true;
    /*
     * ── Y LA QUE SE ARMA EN DOS TROZOS ───────────────────────────────
     * La consola no escribe sus rutas enteras: tiene un ayudante que pega
     * `/api/aprovisionamiento/empresas` delante de lo que le pasen
     * —`lib/erp.ts`— así que la ruta completa no aparece en ninguna línea y
     * el cruce la daba por no pedida.
     *
     * Eran DOCE, y no son cabos sueltos: son las que dan de alta una empresa,
     * le registran su realm y le capturan, verifican, registran y activan el
     * origen del core. Las ejercité una por una contra la instalación el
     * 21-oct-2026 dando de alta «Financiera Onpremise Prueba». Doce de las
     * noventa y nueve eran mentira mía, no hueco del producto.
     *
     * El prefijo sólo vale DENTRO de su archivo, y el resto de la ruta tiene
     * que aparecer ahí mismo: si valiera en todo el texto, cualquier prefijo
     * corto alcanzaría media aplicación.
     */
    if (
      porArchivo.some((a) =>
        a.prefijos.some((p) => {
          if (!ruta.startsWith(p)) return false;
          const resto = ruta.slice(p.length);
          return !resto || patron(resto).test(a.texto);
        }),
      )
    ) {
      return true;
    }

    /*
     * ── Y LA QUE SE ELIGE CON UN TERNARIO ──────────────────────────────
     * El tercer modo de escribir una ruta, y el que más engañaba. El servidor
     * declara dos rutas hermanas y la pantalla escribe UNA sola línea que
     * elige entre las dos:
     *
     *     api.patch(`/integracion/validacion/flujos/${f.id}/${activar ? 'activar' : 'desactivar'}`)
     *     async function registrarManual(tipo: 'entrada' | 'retiro')
     *
     * `/caja/movimientos/entrada` no aparece escrito en ninguna parte y se
     * pulsa todos los días desde la caja. Eran NUEVE así.
     *
     * Se reconoce pidiendo TRES cosas a la vez, y en el MISMO archivo:
     *
     *   · que el padre tenga al menos dos segmentos —`/integracion` a secas
     *     alcanzaría media aplicación—;
     *   · que ese padre aparezca escrito y SEGUIDO DE UNA INTERPOLACIÓN, o
     *     sea que ahí de verdad se arma una ruta: `/caja/movimientos/${`;
     *   · y que el segmento final aparezca entrecomillado en ese archivo.
     *
     * Las dos primeras hacen el trabajo. Sin la segunda —primera versión—
     * bastaba con que el archivo nombrara `/hoteleria/config` en cualquier
     * línea y tuviera la palabra `'tipos'` suelta, y así se «alcanzaron»
     * cuatro rutas que nadie llama. Lo cazó la prueba de la prueba de abajo,
     * que es exactamente para lo que está.
     *
     * No es certeza, es la mejor evidencia que da el texto. Las que NO la
     * pasan se comprobaron a mano, una por una, el 22-oct-2026.
     */
    const segs = ruta.split('/').filter(Boolean);
    const iUltimo = segs.map((x) => !x.startsWith(':')).lastIndexOf(true);
    if (iUltimo < 2) return false;
    const padreArma = new RegExp(
      patron('/' + segs.slice(0, iUltimo).join('/')).source + '/\\$\\{',
    );
    const entrecomillado = new RegExp(`['"\`]${escapa(segs[iUltimo])}['"\`]`);
    return porArchivo.some((a) => padreArma.test(a.texto) && entrecomillado.test(a.texto));
  };

  const huerfanas = rutas.filter((r) => !alcanzada(r));

  it('el cruce mide algo: hay rutas y hay quien las pida', () => {
    /*
     * Si los controladores se renombraran, o las carpetas de los dos clientes
     * se movieran, esta prueba pasaría sin mirar nada. Es el modo de fallo que
     * más veces ha aparecido aquí: la regla sigue en verde y el detector ya no
     * ve.
     */
    expect(rutas.length).toBeGreaterThan(500);
    expect(pedido.length).toBeGreaterThan(500_000);
    expect(CLIENTES.filter(Boolean).length).toBe(2);
  });

  it('no aparece ninguna ruta sin pantalla que no esté escrita', () => {
    const nuevas = huerfanas.filter((r) => !SIN_PANTALLA.includes(r)).sort();
    expect(nuevas).toEqual([]);
  });

  it('la lista no crece', () => {
    expect(huerfanas.length).toBeLessThanOrEqual(SIN_PANTALLA.length);
  });

  it('LA PRUEBA DE LA PRUEBA: ningún renglón escrito ha dejado de medirse', () => {
    /*
     * Un renglón muerto hace creer que el hueco sigue ahí y, peor, deja holgura
     * en el techo para que entre uno nuevo sin que nadie se entere. Cuando una
     * ruta se conecta o se borra, se borra su renglón.
     */
    const vivas = new Set(huerfanas);
    const muertos = SIN_PANTALLA.filter((r) => !vivas.has(r)).sort();
    expect(muertos).toEqual([]);
  });

  it('y la forma se compara con parámetros, no juntando literales', () => {
    /*
     * El error de la primera versión, escrito: si `alcanzada` volviera a
     * juntar sólo los segmentos literales, una ruta con parámetro en medio no
     * se encontraría jamás y la lista se llenaría de mentiras.
     */
    const conParametro = rutas.filter((r) => r.includes('/:'));
    expect(conParametro.length).toBeGreaterThan(100);
    const alcanzadasConParametro = conParametro.filter(alcanzada);
    expect(alcanzadasConParametro.length).toBeGreaterThan(50);
  });
});
