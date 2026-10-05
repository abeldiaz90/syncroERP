/**
 * ============================================================================
 * Un ingreso que nadie contabilizaba
 * ----------------------------------------------------------------------------
 * `ajusteManual` tiene dos ramas. La de MERMA descuenta del almacén Y encola su
 * asiento contable. La de INGRESO subía la existencia y no encolaba nada.
 *
 * Y la pantalla de ajustes decía, para las dos:
 *
 *     «Ajuste contabilizado; inventario y kardex actualizados»
 *
 * O sea: el valor del inventario crecía sin contrapartida, y quien lo registró
 * se iba creyendo que había quedado asentado. Es un agujero del lado que nadie
 * reclama —el almacén cuadra, la contabilidad no— y sale a la luz al cierre del
 * mes, cuando ya nadie recuerda qué ajuste fue.
 *
 * No hizo falta inventar nada: `AJUSTE_INVENTARIO` ya existía y es lo que usa
 * el conteo cíclico del WMS. Su generador trata `diferencia` con signo, así que
 * sirve para las dos direcciones.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { TipoAsiento } from '../finanzas/entities/asiento-pendiente.entity';

const servicio = readFileSync(
  join(__dirname, 'services', 'inventario.service.ts'),
  'utf8',
);
const sinComentarios = servicio
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ============================================================================
 * Y LA MISMA PUERTA TENÍA UNA GEMELA QUE NADIE HABÍA MIRADO (5-oct-2026)
 * ----------------------------------------------------------------------------
 * El arreglo de arriba puso el asiento DENTRO de `ajusteManual`. Funcionaba, y
 * por eso tapaba lo otro: los dos botones del renglón del catálogo
 * —`POST .../:id/compra` y `.../:id/salida`, los iconos verde y ámbar de cada
 * producto— entran al mismo movimiento de inventario por otra puerta, y esa no
 * encolaba nada ni guardaba quién.
 *
 * O sea que el agujero no era «la rama INGRESO del ajuste». Era: **un
 * movimiento sin documento detrás no tiene a nadie que haga su póliza**, y el
 * ajuste era sólo uno de los tres sitios con ese problema.
 *
 * Lo que decide eso vive ahora en `movimientoSinDocumento`, una sola vez, y las
 * pruebas se mudaron ahí con él. Las de antes miraban el cuerpo de
 * `ajusteManual` y se pusieron rojas con la mudanza: estaban clavadas al sitio,
 * no a la regla. Éstas miran la regla y además cierran la puerta de atrás: el
 * controlador ya no puede entrar directo al movimiento.
 * ============================================================================
 */

/** Toma el cuerpo de un método del servicio, cortando en el siguiente. */
function cuerpoDe(nombre: string): string {
  const inicio = sinComentarios.indexOf(nombre);
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = sinComentarios
    .slice(inicio + 1)
    .search(/\n  (async |private |\/\*)/);
  return siguiente > -1
    ? sinComentarios.slice(inicio, inicio + 1 + siguiente)
    : sinComentarios.slice(inicio);
}

const duenio = cuerpoDe('private async movimientoSinDocumento(');

describe('El movimiento sin documento tiene un dueño, y uno solo', () => {
  it('la salida encola su asiento', () => {
    expect(duenio).toMatch(/TipoAsiento\.SALIDA_INVENTARIO/);
  });

  it('la entrada encola el suyo', () => {
    expect(duenio).toMatch(/TipoAsiento\.AJUSTE_INVENTARIO/);
  });

  it('ninguna dirección se queda sin encolar', () => {
    /*
     * En negativo a propósito: no se cuenta que haya dos llamadas, se mide que
     * no haya un camino de salida sin asiento. Contar llamadas se queda verde
     * si alguien añade una tercera dirección muda.
     */
    const salidas = (duenio.match(/\n      return |\n    return /g) ?? []).length;
    const encolados = (duenio.match(/encolarEnTransaccion\(/g) ?? []).length;
    expect(salidas).toBeGreaterThanOrEqual(2);
    expect(encolados).toBeGreaterThanOrEqual(salidas);
  });

  it('el ajuste manual ya no tiene su propia copia de la regla', () => {
    /*
     * El valor del arreglo está aquí. Mientras `ajusteManual` siguiera
     * encolando por su cuenta, arreglar la cuenta de un ajuste obligaría a
     * acordarse de los dos sitios, y el segundo es el que se olvida.
     */
    const ajuste = cuerpoDe('async ajusteManual(');
    expect(ajuste).not.toMatch(/encolarEnTransaccion\(/);
    expect(ajuste).toMatch(/movimientoSinDocumento\(em, \{/);
  });

  it('y el controlador no tiene puerta directa al movimiento', () => {
    /*
     * ÉSTE es el defecto del 5-oct, escrito como no puede volver. Los dos
     * endpoints llamaban a `registrarCompra` / `registrarSalida`, que a
     * propósito no encolan asiento porque lo encola quien tiene el documento.
     * Sin documento no había nadie, y el valor del inventario se movía sin
     * tocar el mayor.
     */
    const controlador = readFileSync(
      join(__dirname, 'controllers', 'inventario.controller.ts'),
      'utf8',
    );
    expect(controlador).not.toMatch(/inventarioService\.registrarCompra\(/);
    expect(controlador).not.toMatch(/inventarioService\.registrarSalida\(/);
    expect(controlador).toMatch(/movimientoDesdeElCatalogo\(\{/);
  });

  it('las dos puertas del catálogo guardan quién lo hizo', () => {
    const controlador = readFileSync(
      join(__dirname, 'controllers', 'inventario.controller.ts'),
      'utf8',
    );
    /*
     * `MovimientoInventario` tiene el campo y el kardex lo muestra. La entrada
     * cruda lo dejaba vacío, y la salida no podía llenarlo porque
     * `registrarSalida` no recibía el dato: ninguna salida del sistema dejaba
     * nombre.
     */
    const compra = controlador.slice(
      controlador.indexOf("@Post('productos/:id/compra')"),
      controlador.indexOf("@Post('productos/:id/salida')"),
    );
    expect(compra).toMatch(/@ActiveUser\('sub'\) usuarioId/);
    expect(compra).toMatch(/usuarioId,/);

    const servicio = readFileSync(
      join(__dirname, 'services', 'inventario.service.ts'),
      'utf8',
    );
    const salida = servicio.slice(
      servicio.indexOf('async registrarSalida('),
      servicio.indexOf('): Promise<ResultadoSalida>'),
    );
    expect(salida).toMatch(/usuarioId\?: string,/);
  });

  it('y la salida de verdad lo escribe en el kardex, no sólo lo recibe', () => {
    /*
     * MUTANTE SUPERVIVIENTE. La prueba de arriba comprobaba que la firma de
     * `registrarSalida` acepta `usuarioId`, y un mutante que borró
     * `usuarioId,` del `create(MovimientoInventario, …)` pasó en verde: el dato
     * llegaba al método y se tiraba a la basura, que es exactamente el estado en
     * el que estaba el código antes de hoy —el campo existía en la entidad y
     * nadie lo llenaba—.
     *
     * Se mide sobre el bloque que ESCRIBE, no sobre la firma.
     */
    const servicio = readFileSync(
      join(__dirname, 'services', 'inventario.service.ts'),
      'utf8',
    );
    const cuerpo = servicio.slice(
      servicio.indexOf('async registrarSalida('),
      servicio.indexOf('/* ══ TRANSFERENCIAS'),
    );
    expect(cuerpo).toMatch(
      /tipo: 'SALIDA',[\s\S]{0,800}?tipoDocumento: documento\?\.tipo,\s*\n\s*usuarioId,/,
    );
  });

  it('y la entrada devuelve los dos números con los que se hace la póliza', () => {
    /*
     * MUTANTE SUPERVIVIENTE. Cambiar `costoUnitarioEntrada` por `costoPromedio`
     * no ponía nada rojo: la prueba de arriba mira cómo se USA el campo, no de
     * dónde sale su valor, y el promedio del lote es justo el número equivocado
     * cuando el lote ya tenía existencias a otro costo.
     *
     * Medirlo ejecutando `registrarCompra` pide montar almacén, producto, lote,
     * resumen de stock y bloqueo pesimista: se mediría el armado del doble. La
     * aserción se queda donde el valor se compone, con el invariante escrito:
     * `cantidadBase × costoUnitarioEntrada = costoTotal`.
     */
    const servicio = readFileSync(
      join(__dirname, 'services', 'inventario.service.ts'),
      'utf8',
    );
    const retorno = servicio.slice(
      servicio.indexOf("mensaje: 'Entrada registrada correctamente'"),
    );
    expect(retorno.slice(0, 400)).toMatch(
      /costoTotal: costoTotalEntrada,\s*\n\s*cantidadBase,\s*\n\s*costoUnitarioEntrada: redondear4\(costoPorUnidadBase\),/,
    );
    /* Y el costo total sigue siendo cantidadBase × costoPorUnidadBase. */
    expect(servicio).toMatch(/valorEntrada[\s\S]{0,40}cantidadBase \* costoPorUnidadBase/);
  });

  it('la salida cruda va a AJUSTE y no a MERMA', () => {
    /*
     * `generarAsientoDeSalida` carga a la cuenta de mermas sólo cuando el tipo
     * es MERMA. Una merma es una pérdida declarada; la salida del catálogo no
     * declara nada. Mandarla a mermas metería en esa cuenta cosas que no lo
     * son, y es la cuenta que mira el contador para decidir si hay un problema
     * en el almacén.
     */
    const servicio = readFileSync(
      join(__dirname, 'services', 'inventario.service.ts'),
      'utf8',
    );
    const puerta = servicio.slice(
      servicio.indexOf('async movimientoDesdeElCatalogo('),
    );
    expect(puerta.slice(0, puerta.indexOf('async ajusteManual('))).toMatch(
      /razon: 'AJUSTE'/,
    );
  });

  it('el tipo que encola tiene generador registrado', () => {
    /*
     * Encolar un tipo sin generador deja el asiento pendiente para siempre, que
     * es peor que no encolarlo: aparece en la bandeja y nadie sabe qué hacer.
     */
    const registro = readFileSync(
      join(__dirname, '..', 'finanzas', 'services', 'asientos-pendientes.service.ts'),
      'utf8',
    );
    expect(registro).toMatch(
      /\[TipoAsiento\.AJUSTE_INVENTARIO\]: 'generarAsientoDeAjusteInventario'/,
    );
    expect(registro).toMatch(
      /\[TipoAsiento\.SALIDA_INVENTARIO\]: 'generarAsientoDeSalida'/,
    );
    expect(TipoAsiento.AJUSTE_INVENTARIO).toBe('AJUSTE_INVENTARIO');
  });

  it('la diferencia de la entrada viaja positiva', () => {
    /*
     * El generador toma el valor absoluto para el importe, pero usa el signo
     * para decidir qué cuenta va al debe. Una entrada con diferencia negativa
     * asentaría al revés: inventario abonado en una entrada.
     */
    expect(duenio).toMatch(/diferencia: entrada\.cantidadBase,/);
  });

  it('y con el valor que de verdad entró, no con el promedio del lote', () => {
    /*
     * LO QUE ESTABA MAL EN EL ARREGLO DE AYER, encontrado al mudar la regla.
     *
     * Decía `costoUnitario ?? entrada.costoUnitarioLote ?? 0` sobre
     * `diferencia: cantidad`, y eso falla en dos casos reales:
     *
     *   · con un empaque de por medio, `cantidad` está en cajas y el costo en
     *     piezas: el asiento sale multiplicado por el factor;
     *   · si el lote ya tenía existencias a otro costo, `costoUnitarioLote` es
     *     el promedio ponderado DESPUÉS de la entrada, que no es lo que esta
     *     entrada añadió al auxiliar.
     *
     * `cantidadBase × costoUnitarioEntrada` es el valor exacto que subió, por
     * construcción de `registrarCompra`.
     */
    expect(duenio).toMatch(/costoUnitario: entrada\.costoUnitarioEntrada,/);
    expect(duenio).not.toMatch(/entrada\.costoUnitarioLote/);
  });

  it('el asiento nace dentro de la misma transacción que movió el stock', () => {
    /*
     * `encolarEnTransaccion(em, …)` con el mismo `EntityManager`: si la
     * transacción se deshace, el asiento se deshace con ella. Un asiento que
     * sobrevive a su movimiento es una póliza que no respalda nada.
     */
    expect(duenio).toMatch(
      /encolarEnTransaccion\(\s*em,\s*TipoAsiento\.AJUSTE_INVENTARIO/,
    );
    expect(duenio).toMatch(
      /encolarEnTransaccion\(\s*em,\s*TipoAsiento\.SALIDA_INVENTARIO/,
    );
  });

  it('y la póliza no dice que vino de un conteo que no existió', () => {
    /*
     * `generarAsientoDeAjusteInventario` nació para el conteo cíclico y fijaba
     * el concepto «Ajuste de inventario por conteo <folio>». Reusar la
     * maquinaria era correcto; heredar su concepto, no: un auditor que siga esa
     * línea busca un acta de conteo y no la encuentra.
     */
    const motor = readFileSync(
      join(__dirname, '..', 'finanzas', 'services', 'motor-contable.service.ts'),
      'utf8',
    );
    expect(motor).toMatch(/concepto:\s*\n?\s*datos\.concepto\?\.trim\(\) \|\|/);
    expect(duenio).toMatch(/concepto: /);
  });
});

describe('El lote es de la entrada, no de la salida', () => {
  /*
   * En una SALIDA los campos de lote y caducidad no se dibujan —el lote lo
   * elige FEFO, y eso es lo que promete el aviso azul de esa misma ventana—.
   * Pero se mandaban igual: `producto.requiereLote ? lote : undefined` da
   * cadena vacía, no `undefined`, así que la clave viajaba en el JSON y el
   * validador la rechazaba por no estar declarada en el DTO de salida.
   *
   * Resultado: la salida rápida estaba rota EXACTAMENTE para los productos
   * trazables —alimentos, farmacia—, los únicos a los que FEFO les sirve.
   */
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/productos/components/ModalInventarioRapido.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const modal = hay ? readFileSync(ruta, 'utf8') : '';

  it('el lote sólo se manda entrando', () => {
    if (!hay) return;
    expect(modal).toMatch(/numeroLote: esEntrada && producto\.requiereLote/);
  });

  it('y la caducidad igual', () => {
    if (!hay) return;
    expect(modal).toMatch(/esEntrada && producto\.requiereCaducidad/);
  });

  it('una lista de precios que no se pudo leer no se manda vacía', () => {
    /*
     * `precios` se arma recorriendo las listas de precio, y esa consulta es de
     * otro perfil: al almacenista le contesta 403 y la lista queda vacía. El
     * servidor entiende un arreglo presente como «ésta es la lista completa» y
     * borra todos los precios del producto.
     *
     * Medido: el almacenista corregía el stock mínimo y el precio de venta
     * desaparecía; en caja el producto dejaba de poder cobrarse, y nadie
     * relacionaba una cosa con la otra. El arreglo no está en el servidor
     * —un arreglo vacío es una orden legítima— sino en no afirmar nada sobre
     * los precios cuando no se pudieron leer las listas.
     */
    if (!hay) return;
    const pantalla = readFileSync(
      join(FRONTEND!, 'app/dashboard/productos/page.tsx'),
      'utf8',
    );
    expect(pantalla).toMatch(/\.\.\.\(listasPrecio\.length > 0/);
  });

  it('el DTO de salida sigue sin declararlos, que es lo correcto', () => {
    /*
     * No se arregla ensanchando el contrato: en una salida no se elige lote a
     * mano. Si alguien añadiera `numeroLote` al DTO de salida para «arreglar»
     * el 400, estaría abriendo la puerta a saltarse FEFO.
     */
    const dto = readFileSync(
      join(__dirname, 'dto', 'inventario-operaciones.dto.ts'),
      'utf8',
    );
    const salida = dto.slice(dto.indexOf('class RegistrarSalidaInventarioDto'));
    const cuerpo = salida.slice(0, salida.indexOf('}'));
    expect(cuerpo).not.toMatch(/numeroLote/);
    expect(cuerpo).not.toMatch(/fechaCaducidad/);
  });
});

describe('y el kardex enseña quién, que es la mitad que faltaba', () => {
  /*
   * ENCONTRADO MIRANDO LA PANTALLA, NO EL CÓDIGO (5-oct-2026).
   *
   * Hecho el arreglo, se registró una entrada real desde el catálogo y se abrió
   * la Auditoría de Kardex a comprobarlo. El movimiento estaba, con su motivo y
   * su saldo. **El nombre no, porque no hay columna.**
   *
   * El servicio traía el almacén con un `leftJoin` y nada más, así que al
   * navegador le llegaba `usuarioId` como UUID suelto. Guardar quién y no
   * enseñarlo es la mitad inútil del control: una investigación de inventario
   * empieza en esta pantalla, y sin el nombre acaba en la base de datos.
   *
   * Es el mismo patrón que el proyecto ya persiguió dos veces: un control que
   * está puesto y no se ve no está puesto.
   */
  const servicio = readFileSync(
    join(__dirname, 'services', 'inventario.service.ts'),
    'utf8',
  );

  it('el servicio resuelve el nombre y no manda un UUID', () => {
    const cuerpo = servicio.slice(
      servicio.indexOf('async obtenerMovimientosPorProducto('),
      servicio.indexOf('async obtenerStockEnAlmacen('),
    );
    expect(cuerpo).toMatch(/getRepository\(Usuario\)/);
    expect(cuerpo).toMatch(/usuarioNombre: m\.usuarioId \? \(nombres\.get\(m\.usuarioId\) \?\? null\) : null/);
  });

  it('y lo hace en una consulta por página, no una por renglón', () => {
    /*
     * El kardex pagina de a cincuenta. Resolver el nombre dentro del `map`
     * serían cincuenta consultas por pantalla, y en un producto de rotación
     * alta eso se nota.
     */
    const cuerpo = servicio.slice(
      servicio.indexOf('async obtenerMovimientosPorProducto('),
      servicio.indexOf('async obtenerStockEnAlmacen('),
    );
    expect(cuerpo).toMatch(/const idsDeUsuario = \[\s*\n?\s*\.\.\.new Set\(/);
    expect(cuerpo).toMatch(/where: \{ id: In\(idsDeUsuario\) \}/);
  });

  it('la pantalla tiene la columna, y dice la verdad cuando no hay nombre', () => {
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
      .map((nombre) => join(RAIZ, nombre))
      .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/productos/[id]/page.tsx'),
      'utf8',
    );
    expect(pantalla).toMatch(/usuarioNombre\?: string \| null;/);
    expect(pantalla).toMatch(/>Quién</);
    /*
     * El guion importa tanto como el nombre: un movimiento viejo no tiene
     * quién, y poner ahí cualquier otra cosa sería inventar.
     */
    expect(pantalla).toMatch(/m\.usuarioNombre \? \(/);
    /* Y el encabezado agrupador abarca las dos columnas, o la tabla se desalinea. */
    expect(pantalla).toMatch(/colSpan=\{2\}[^>]*>Referencia</);
  });

  it('y la exportación se lleva la columna, que es donde acaba la auditoría', () => {
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
      .map((nombre) => join(RAIZ, nombre))
      .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/productos/[id]/page.tsx'),
      'utf8',
    );
    const exportacion = pantalla.slice(pantalla.indexOf('const exportarExcel'));
    expect(exportacion.slice(0, 1500)).toMatch(/'Motivo', 'Quién'\]/);
    expect(exportacion.slice(0, 1500)).toMatch(/quienEscapado\].join\(','\)/);
  });

  it('la ventana ya no promete un documento que no existe', () => {
    /*
     * Decía «Recepción de Mercancía», que es como se llama recibir una orden de
     * compra. Por aquí no entra ninguna: es la puerta de lo que NO tiene
     * documento, y el nombre decide si se usa para eso o para saltarse el
     * circuito de compras.
     */
    const RAIZ = join(__dirname, '..', '..', '..');
    const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
      .map((nombre) => join(RAIZ, nombre))
      .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;

    const modal = readFileSync(
      join(FRONTEND, 'app/dashboard/productos/components/ModalInventarioRapido.tsx'),
      'utf8',
    );
    /*
     * Sobre el título que se pinta, no sobre el archivo: el comentario de ese
     * cambio cita el nombre viejo, y buscarlo suelto daba rojo por la
     * explicación del arreglo.
     */
    expect(modal).not.toMatch(/\? 'Recepción de Mercancía'/);
    expect(modal).toMatch(/Entrada sin documento/);
    expect(modal).toMatch(/Salida sin documento/);
    /* Y dice qué pasa en los libros antes de confirmar, no después. */
    expect(modal).toMatch(/cuenta de mermas/);
  });
});
