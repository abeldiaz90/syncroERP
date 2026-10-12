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
    /*
     * Esto vivia dentro de `registrarCompra`. Desde el 12-oct vive en
     * `utils/una-entrada-cae-en-una-posicion.ts`, porque hubo una SEGUNDA via
     * que subia existencia —la devolucion de venta— y copiarselo habria dejado
     * dos implementaciones de la misma regla. Ver el capitulo de abajo.
     */
    const util = sinComentarios(
      leer('catalogo/utils/una-entrada-cae-en-una-posicion.ts'),
    );
    expect(util).toMatch(
      /const elegida =\s*datos\.ubicacionId \?\?\s*\(await buscarUbicacionDeRecepcion\(em, empresaId, almacenId\)\)\?\.id;/,
    );
    /* Y desde ahi sigue el MISMO camino: estado, slotting y capacidad. */
    expect(util).toMatch(/no admite recepciones en estado/);
    expect(util).toMatch(/excederia su capacidad|excedería su capacidad/);
    expect(util).toMatch(/ProductoUbicacion/);

    /* El servicio ya no resuelve por su cuenta: delega. */
    const inventario = sinComentarios(
      leer('catalogo/services/inventario.service.ts'),
    );
    expect(inventario).toMatch(/await resolverPosicionDeEntrada\(em, \{/);
    expect(inventario).toMatch(/await sumarEnPosicion\(em, \{/);
    /* Y no se quedo una copia del camino viejo. */
    expect(inventario).not.toMatch(/buscarUbicacionDeRecepcion/);
    expect(inventario).not.toMatch(/capacidadMaxima \?\? asignacion\.capacidadAsignada/);
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

    const compartida = sinComentarios(
      leer('catalogo/utils/una-entrada-cae-en-una-posicion.ts'),
    );
    /* Ni una negativa colgando de la resolucion: sin anden, devuelve null. */
    expect(compartida).toMatch(/if \(!elegida\) return null;/);
    expect(compartida).not.toMatch(
      /const elegida =[\s\S]{0,200}throw new BadRequestException\([^)]*recepci/i,
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

    /*
     * Eran ocho el 7-oct-2026 y son NUEVE desde el 10-oct: `producir` registra
     * lo producido, que antes no registraba nadie —los insumos salian y el
     * producto terminado no entraba por ningun lado—. Esa novena no pasa
     * ubicacion y esta bien que no la pase: una produccion no tiene posicion
     * que dar, asi que cae en la de recepcion y el almacenista la reubica,
     * que es exactamente para lo que existe el arreglo que vigila esta prueba.
     *
     * Se comparan ARCHIVOS y no un numero: cuando aparezca la decima, el fallo
     * dira cual es y quien lo lea podra decidir si tiene posicion que pasar,
     * en vez de ver un 9 donde esperaba un 8 y tener que buscarla a mano. Las
     * lineas no entran en la comparacion porque se mueven con cualquier
     * comentario.
     */
    const archivos = [...new Set(llamadas.map((l) => l.split(':')[0].replace(/\\/g, '/')))].sort();
    expect(archivos).toEqual([
      'catalogo/services/importacion-stock-inicial-masiva.service.ts',
      'catalogo/services/inventario.service.ts',
      'catalogo/services/productos.service.ts',
      'catalogo/services/wms.service.ts',
      'compras/services/ordenes-compra.service.ts',
      'recetas/services/consumo-recetas.service.ts',
      'recetas/services/recetas.service.ts',
    ]);
    expect(llamadas).toHaveLength(9);
  });

  describe('la puerta que el barrido no miraba', () => {
    /*
     * ========================================================================
     * QUE PASO EL 12 DE OCTUBRE
     * ------------------------------------------------------------------------
     * Todo lo de arriba descansa sobre una frase que esta escrita en este
     * mismo archivo: «`registrarCompra` es el unico sitio por el que sube la
     * existencia». **Era falsa.**
     *
     * La devolucion de venta sube existencia por su cuenta —escribe
     * `lote.stockRestante`, escribe el movimiento y sincroniza el resumen— y
     * tiene un motivo legitimo para no pasar por `registrarCompra`: necesita
     * recuperar el costo ORIGINAL de cada salida, y `registrarCompra`
     * calcularia un promedio nuevo. La anulacion de venta hace lo mismo.
     *
     * Ninguna de las dos tocaba `stock_ubicaciones`. Medido en vivo:
     *
     *   FER-CAS-SEG · resumen 99 · localizado 98
     *   FER-CAB-12  · resumen 2000 · localizado 1999
     *
     * El kardex del casco dice de donde salia la pieza: «6/10 ENTRADA +1 ·
     * Devolucion DEV-1». Durante seis dias se creyo que alguien la habia
     * movido a mano, y el hueco se cobro en otro modulo: el apartado de un
     * pedido mira el resumen, la salida se sirve de las posiciones, y el
     * surtido se nego con el cliente delante.
     *
     * EL BARRIDO DE ABAJO MIRABA LOS LLAMADORES DE `registrarCompra`, asi que
     * no podia ver una via que no lo llama. Un barrido que mira por la puerta
     * equivocada da verde y no prueba nada.
     *
     * Este mira lo que de verdad define una entrada: **quien sube
     * `stockRestante`**. Si manana nace una cuarta via, el fallo la nombra.
     * ========================================================================
     */
    const SUBEN_EXISTENCIA = [
      /* La puerta oficial. Resuelve y ubica dentro de `registrarCompra`. */
      'catalogo/services/inventario.service.ts',
      /* Devuelve al lote original con su costo; ubica en el anden. */
      'ventas/services/devoluciones-ventas.service.ts',
      /* Anula una venta y reintegra con el costo con que salio; idem. */
      'ventas/services/anulacion-ventas.service.ts',
    ];

    const archivosQueSuben = () => {
      const encontrados: string[] = [];
      const recorrer = (dir: string) => {
        for (const entrada of readdirSync(dir, { withFileTypes: true })) {
          if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
          const camino = join(dir, entrada.name);
          if (entrada.isDirectory()) {
            /* Los comandos de base de datos siembran, no operan. */
            if (entrada.name === 'database') continue;
            recorrer(camino);
            continue;
          }
          if (!entrada.name.endsWith('.ts') || entrada.name.endsWith('.spec.ts')) continue;
          const texto = sinComentarios(readFileSync(camino, 'utf8'));
          if (/\.stockRestante\s*(=|\+=)/.test(texto)) {
            encontrados.push(relative(SRC, camino).replace(/\\/g, '/'));
          }
        }
      };
      recorrer(SRC);
      return [...new Set(encontrados)].sort();
    };

    it('las vias que suben existencia son las declaradas', () => {
      expect(archivosQueSuben()).toEqual([...SUBEN_EXISTENCIA].sort());
    });

    it('y las que no pasan por registrarCompra ubican lo que suben', () => {
      /*
       * Lo que importa no es que llamen a algo, sino que llamen a LA MISMA
       * pieza: dos implementaciones de «donde cae una entrada» divergen, y la
       * que diverge es la que nadie mira.
       */
      for (const archivo of SUBEN_EXISTENCIA) {
        if (archivo === 'catalogo/services/inventario.service.ts') continue;
        const texto = sinComentarios(leer(archivo));
        expect([archivo, /resolverPosicionDeEntrada\(/.test(texto)]).toEqual([
          archivo,
          true,
        ]);
        expect([archivo, /sumarEnPosicion\(/.test(texto)]).toEqual([archivo, true]);
        /* Y de la pieza compartida, no de una copia local. */
        expect([archivo, /una-entrada-cae-en-una-posicion/.test(texto)]).toEqual([
          archivo,
          true,
        ]);
      }
    });

    it('la pieza compartida existe y es una sola', () => {
      /* La prueba de la prueba: si el archivo no existiera, los `toMatch` de
       * arriba fallarian al leerlo, pero conviene decirlo aqui. */
      expect(
        existsSync(join(SRC, 'catalogo/utils/una-entrada-cae-en-una-posicion.ts')),
      ).toBe(true);
      /* Nadie reimplementa el upsert de `stock_ubicaciones` por su cuenta. */
      const copias: string[] = [];
      const recorrer = (dir: string) => {
        for (const entrada of readdirSync(dir, { withFileTypes: true })) {
          if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
          const camino = join(dir, entrada.name);
          if (entrada.isDirectory()) {
            if (entrada.name === 'database') continue;
            recorrer(camino);
            continue;
          }
          if (!entrada.name.endsWith('.ts') || entrada.name.endsWith('.spec.ts')) continue;
          const corto = relative(SRC, camino).replace(/\\/g, '/');
          if (
            corto === 'catalogo/utils/una-entrada-cae-en-una-posicion.ts' ||
            corto === 'catalogo/services/wms.service.ts'
          ) {
            /* El WMS mueve existencia ENTRE posiciones —reubicar, transferir,
             * contar—, que es otra operacion y tiene sus propias reglas. */
            continue;
          }
          const texto = sinComentarios(readFileSync(camino, 'utf8'));
          if (/em\.create\(StockUbicacion/.test(texto)) copias.push(corto);
        }
      };
      recorrer(SRC);
      expect(copias.sort()).toEqual([]);
    });
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
