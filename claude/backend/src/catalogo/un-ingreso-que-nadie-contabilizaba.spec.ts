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

/** El cuerpo de `ajusteManual`, que es donde viven las dos ramas. */
const ajusteManual = (() => {
  const inicio = sinComentarios.indexOf('async ajusteManual(');
  expect(inicio).toBeGreaterThan(-1);
  /*
   * El corte va al SIGUIENTE método, no a un nombre concreto:
   * `listarTransferencias` está ANTES que `ajusteManual` en el archivo, así que
   * anclar ahí extendía el trozo hasta el final y la cuenta de ramas salía
   * inflada. Lo comprobé con la prueba en rojo: decía 5 ramas donde hay 2.
   */
  const siguiente = sinComentarios.slice(inicio + 1).search(/\n  (async |private |\/\*)/);
  return siguiente > -1
    ? sinComentarios.slice(inicio, inicio + 1 + siguiente)
    : sinComentarios.slice(inicio);
})();

describe('Las dos ramas del ajuste llegan a la contabilidad', () => {
  it('la merma encola su asiento (esto ya estaba bien)', () => {
    expect(ajusteManual).toMatch(/TipoAsiento\.SALIDA_INVENTARIO/);
  });

  it('el ingreso también encola el suyo', () => {
    expect(ajusteManual).toMatch(/TipoAsiento\.AJUSTE_INVENTARIO/);
  });

  it('ninguna rama se queda sin encolar', () => {
    /*
     * La comprobación que importa, y escrita en negativo a propósito: no se
     * mide que haya dos llamadas, se mide que no haya un camino de salida sin
     * asiento. Contar llamadas se queda verde si alguien añade una tercera
     * rama muda.
     */
    const ramas = ajusteManual.split('return {').length - 1;
    const encolados = (ajusteManual.match(/encolarEnTransaccion\(/g) ?? [])
      .length;
    expect(ramas).toBeGreaterThanOrEqual(2);
    expect(encolados).toBeGreaterThanOrEqual(ramas);
  });

  it('el ingreso usa el tipo que el motor sabe generar', () => {
    /*
     * `AJUSTE_INVENTARIO` tiene generador registrado. Encolar un tipo sin
     * generador deja el asiento pendiente para siempre, que es peor que no
     * encolarlo: aparece en la bandeja y nadie sabe qué hacer con él.
     */
    const registro = readFileSync(
      join(__dirname, '..', 'finanzas', 'services', 'asientos-pendientes.service.ts'),
      'utf8',
    );
    expect(registro).toMatch(
      /\[TipoAsiento\.AJUSTE_INVENTARIO\]: 'generarAsientoDeAjusteInventario'/,
    );
    expect(TipoAsiento.AJUSTE_INVENTARIO).toBe('AJUSTE_INVENTARIO');
  });

  it('la diferencia del ingreso viaja positiva', () => {
    /*
     * El generador toma el valor absoluto para el importe, pero usa el signo
     * para decidir qué cuenta va al debe. Un ingreso con diferencia negativa
     * asentaría al revés: inventario abonado en una entrada.
     */
    expect(ajusteManual).toMatch(/diferencia: cantidad,/);
  });

  it('y con el costo que de verdad se usó, no con cero', () => {
    /*
     * `costoUnitario` es opcional en la firma: cuando no viene, el costo real
     * lo calcula la entrada. Tomar el argumento sin más dejaría el asiento en
     * cero justo en el caso habitual, y un asiento de cero no se distingue de
     * uno que no existe.
     */
    expect(ajusteManual).toMatch(
      /costoUnitario \?\? entrada\.costoUnitarioLote \?\? 0/,
    );
  });
});

describe('Y el asiento nace con la existencia, no después', () => {
  it('se encola dentro de la misma transacción', () => {
    /*
     * `encolarEnTransaccion(em, …)` con el mismo `EntityManager` que movió el
     * inventario: si la transacción se deshace, el asiento se deshace con
     * ella. Un asiento que sobrevive a su movimiento es una póliza que no
     * respalda nada.
     */
    expect(ajusteManual).toMatch(
      /encolarEnTransaccion\(\s*em,\s*TipoAsiento\.AJUSTE_INVENTARIO/,
    );
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
  const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
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
