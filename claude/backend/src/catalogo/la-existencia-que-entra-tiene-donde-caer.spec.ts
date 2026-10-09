import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

import { EstadoUbicacionAlmacen } from './entities/ubicacion-almacen.entity';
import {
  CODIGO_UBICACION_RECEPCION,
} from './utils/ubicacion-de-recepcion';

/**
 * ============================================================================
 * La existencia que entra y no se ubica
 * ----------------------------------------------------------------------------
 * MEDIDO: `ABA-CAF-1KG`, 124 en el almacen y 119 localizados. Cinco kilos que
 * el almacen dice tener y que no estan en ninguna posicion.
 *
 * `registrarCompra` es el unico sitio por el que sube la existencia, y se
 * llama desde OCHO lugares. Cuatro pasan ubicacion y cuatro no, y los cuatro
 * que no tienen algo en comun: **ninguno pasa por una pantalla donde alguien
 * elija una posicion**. La importacion lee un Excel, el alta de producto
 * captura una cantidad, la transferencia por la via vieja no conoce el WMS, y
 * la reversion de consumo de receta devuelve lo que se consumio.
 *
 * Por eso la salida obvia —«que registrarCompra exija ubicacion»— era la
 * equivocada: les pide un dato que no tienen de donde sacar, y un parametro
 * obligatorio que el llamador rellena con lo primero que encuentra es un dato
 * falso con cara de dato bueno.
 *
 * LA DECISION, Y DE DONDE SALE
 *
 * Se miro como lo resuelven los ERP que manejan posiciones. Odoo crea las
 * ubicaciones con el almacen y el `WH/Input` solo, al activar la recepcion en
 * dos pasos. Dynamics guarda una `default receipt location` por almacen y
 * valida en la CONFIGURACION: no deja guardar un almacen cuya ubicacion de
 * recepcion sea invalida. NetSuite SUGIERE la posicion al recibir y tiene area
 * de preparacion: recibir no se bloquea por no saber donde poner la mercancia.
 *
 * Los tres coinciden: la posicion de recepcion no se configura, nace con el
 * almacen; y lo que se valida al configurar no se vuelve a validar al
 * trabajar. Asi que aqui no se elige entre rechazar la entrada y dejarla sin
 * ubicar: se hace que el estado «almacen con posiciones y sin recepcion» no
 * exista.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * Las cuatro piezas de esa decision, y sobre todo la que no se ve: que no
 * aparezca una NOVENA puerta a la existencia sin que nadie se entere.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8');

/** Sin comentarios: aqui se mide codigo, no explicaciones. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Inventario · la existencia que entra y no se ubica', () => {
  it('la posicion de recepcion tiene un codigo reservado y un estado propio', () => {
    expect(CODIGO_UBICACION_RECEPCION).toBe('RECEPCION');
    /* El estado ya existia en el modelo y no lo usaba nadie para esto. */
    expect(EstadoUbicacionAlmacen.RECEPCION).toBeDefined();
  });

  it('la entrada sin posicion cae en la de recepcion, no en ningun sitio', () => {
    const texto = sinComentarios(leer('catalogo/services/inventario.service.ts'));
    /* El parametro se resuelve ANTES de buscar la posicion. */
    expect(texto).toMatch(
      /const ubicacionElegida =\s*ubicacionId \?\?\s*\(await buscarUbicacionDeRecepcion\(em, empresaId, almacenId\)\)\?\.id;/,
    );
    /*
     * Y desde ahi sigue el MISMO camino. La comprobacion va ACOTADA a lo que
     * sigue a la resolucion y no al archivo entero: `registrarSalida` tiene su
     * propio `if (ubicacionId)` mas abajo, que es correcto —una salida sin
     * posicion no se inventa un anden, descuenta del almacen—. Una negativa
     * sobre todo el archivo se pondria roja por eso, y la forma de callarla
     * seria tocar la salida, que esta bien.
     */
    expect(texto).toMatch(
      /const ubicacionElegida =[\s\S]{0,160}if \(ubicacionElegida\) \{/,
    );
    /* Y dentro de ese bloque ya no se mira el parametro crudo. */
    const bloque = texto.slice(
      texto.indexOf('const ubicacionElegida ='),
      texto.indexOf('const loteActual = await em'),
    );
    expect(bloque).not.toMatch(/\{ id: ubicacionId,/);
    expect(bloque.length).toBeGreaterThan(400);
  });

  it('la de recepcion nace con la primera posicion del almacen', () => {
    /*
     * En este modelo no hay interruptor de «maneja posiciones»: un almacen las
     * maneja cuando tiene alguna, asi que crear la primera es el momento.
     */
    const texto = sinComentarios(leer('catalogo/services/wms.service.ts'));
    expect(texto).toMatch(/async crearUbicacion\(/);
    expect(texto).toMatch(/asegurarUbicacionDeRecepcion\(em, empresaId, dto\.almacenId\)/);
    /* En la MISMA transaccion: a medias es justo el estado que se evita. */
    expect(texto).toMatch(
      /async crearUbicacion\([\s\S]{0,600}this\.dataSource\.transaction\([\s\S]{0,800}asegurarUbicacionDeRecepcion/,
    );
  });

  it('y se repone en los almacenes que ya manejaban posiciones', () => {
    /*
     * Sin esto el arreglo valdria para la instalacion de demostracion y no
     * para la que trabaja.
     */
    const texto = sinComentarios(leer('catalogo/services/wms.service.ts'));
    expect(texto).toMatch(/export class WmsService implements OnModuleInit/);
    expect(texto).toMatch(/async onModuleInit\(\)/);
    expect(texto).toMatch(/HAVING COUNT\(\*\) FILTER \(WHERE u\.estado = \$1\) = 0/);
    /*
     * Y un fallo al reponer NO tumba el arranque: un ERP que no levanta porque
     * no pudo crear una posicion de anden es peor que un almacen sin anden.
     */
    expect(texto).toMatch(/async onModuleInit\(\) \{\s*try \{/);
  });

  it('la ultima posicion de recepcion no se puede liberar', () => {
    /* La validacion de Dynamics, en la pantalla y no en la operacion. */
    const texto = sinComentarios(leer('catalogo/services/wms.service.ts'));
    expect(texto).toMatch(/const dejaDeRecibir =/);
    expect(texto).toMatch(/dto\.activo === false/);
    /* Pero si hay OTRA, esta se libera: se prohibe quedarse sin ninguna. */
    expect(texto).toMatch(/id: Not\(id\)/);
  });

  it('la entrada nunca se rechaza por no haber posicion de recepcion', () => {
    /*
     * LA PARTE QUE MAS IMPORTA DE LA DECISION. Un control que impide trabajar
     * el primer dia se acaba desactivando, y entonces no protege de nada.
     * `buscarUbicacionDeRecepcion` devuelve null y la entrada sigue.
     */
    const util = sinComentarios(leer('catalogo/utils/ubicacion-de-recepcion.ts'));
    expect(util).toMatch(/export async function buscarUbicacionDeRecepcion/);
    expect(util).not.toMatch(/throw new/);

    const inventario = sinComentarios(
      leer('catalogo/services/inventario.service.ts'),
    );
    /* Ni una negativa colgando de la resolucion. */
    expect(inventario).not.toMatch(
      /ubicacionElegida[\s\S]{0,200}throw new BadRequestException\([^)]*recepci/i,
    );
  });

  it('y el diagnostico de integridad nombra la causa', () => {
    const texto = sinComentarios(leer('catalogo/services/wms.service.ts'));
    expect(texto).toMatch(/almacenesSinPosicionDeRecepcion/);
    expect(texto).toMatch(/causa: sinAnden\.has\(d\.almacenId\)/);
    expect(texto).toMatch(/CREAR_POSICION_RECEPCION/);
    /* La cifra sigue siendo la de antes, no se mezcla con la causa. */
    expect(texto).toMatch(/totalDiferencias: resumen\.length/);
  });

  it('no hay una novena puerta a la existencia —barrido—', () => {
    /*
     * EL TRINQUETE. Todo lo de arriba se sostiene sobre que `registrarCompra`
     * sea la unica puerta y que sus llamadores sean ocho. Una novena que nazca
     * manana sin pasar ubicacion heredaria el arreglo —cae en recepcion—,
     * pero conviene mirarla: puede que esa si tenga de donde sacar la posicion
     * y deba pasarla.
     */
    const llamadas: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
        const camino = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          recorrer(camino);
          continue;
        }
        if (!entrada.name.endsWith('.ts') || entrada.name.endsWith('.spec.ts')) continue;
        const texto = sinComentarios(readFileSync(camino, 'utf8'));
        for (const m of texto.matchAll(/\.registrarCompra\(/g)) {
          llamadas.push(`${relative(SRC, camino)}:${texto.slice(0, m.index).split('\n').length}`);
        }
      }
    };
    recorrer(SRC);

    /* Ocho, medidas el 7-oct-2026. Si cambia el numero, hay que mirar. */
    expect(llamadas.sort()).toHaveLength(8);
  });

  it('las cuatro que ya ubicaban siguen diciendo donde', () => {
    /*
     * El riesgo del arreglo es el contrario: que alguien «simplifique»
     * quitandole la ubicacion a las que si la tienen, confiando en que caiga
     * en recepcion. Eso dejaria toda la mercancia en el anden.
     */
    expect(sinComentarios(leer('compras/services/ordenes-compra.service.ts')))
      .toMatch(/captura\.ubicacionId/);
    const wms = sinComentarios(leer('catalogo/services/wms.service.ts'));
    expect(wms).toMatch(/r\.ubicacionDestinoId/);
    expect(wms).toMatch(/d\.ubicacionId/);
    expect(sinComentarios(leer('catalogo/services/inventario.service.ts')))
      .toMatch(/datos\.ubicacionId/);
  });

  it('el arbol es el que creo que es', () => {
    /* La prueba de la prueba: si se mira al sitio equivocado, nada de lo de
     * arriba prueba nada. */
    expect(existsSync(join(SRC, 'catalogo/utils/ubicacion-de-recepcion.ts'))).toBe(true);
    expect(existsSync(join(SRC, 'catalogo/services/wms.service.ts'))).toBe(true);
  });
});
