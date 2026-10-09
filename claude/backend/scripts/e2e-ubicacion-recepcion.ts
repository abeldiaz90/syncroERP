/**
 * ============================================================================
 * La existencia que entra tiene donde caer, contra la base real
 * ----------------------------------------------------------------------------
 *   npm.cmd run inventario:recepcion              (solo dice que haria)
 *   npm.cmd run inventario:recepcion -- --aplicar (lo hace)
 *   npm.cmd run inventario:recepcion -- --limpiar (desactiva lo sembrado)
 *
 * POR QUE UN SCRIPT Y NO EL NAVEGADOR
 *
 * Lo que hay que comprobar es que la mercancia que entra SIN posicion indicada
 * cae en la de recepcion. Y las cuatro puertas que no indican posicion son
 * justamente las que no tienen pantalla: la importacion de existencia inicial
 * lee un Excel, el alta de producto captura una cantidad, la transferencia por
 * la via vieja no conoce el WMS, y la reversion de consumo de receta devuelve
 * lo que se consumio. Recorrerlas a mano por la interfaz no se puede: no hay
 * interfaz que recorrer.
 *
 * Aqui se llama a los mismos servicios que usan los controladores, que es donde
 * vive la logica que interesa.
 *
 * Lo que NO cubre, y conviene saberlo: las guardas HTTP, los DTO y lo que se ve
 * en pantalla —el aviso del almacen sin anden y el boton de crearlo—. Eso se
 * mira desde la interfaz.
 *
 * ── Lo que siembra ──────────────────────────────────────────────────────────
 * Un almacen con el prefijo `UAT RECEPCION`, tres posiciones y un producto.
 * Todo idempotente: si ya existe, lo reutiliza. `--limpiar` lo desactiva.
 *
 * NO toca los almacenes de verdad: siembra el suyo y mide ahi.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Empresa } from '../src/iam/entities/empresa.entity';
import { Almacen } from '../src/catalogo/entities/almacen.entity';
import { Producto } from '../src/catalogo/entities/producto.entity';
import {
  EstadoUbicacionAlmacen,
  UbicacionAlmacen,
} from '../src/catalogo/entities/ubicacion-almacen.entity';
import { StockUbicacion } from '../src/catalogo/entities/stock-ubicacion.entity';
import { StockPorAlmacen } from '../src/catalogo/entities/stock-por-almacen.entity';
import { InventarioService } from '../src/catalogo/services/inventario.service';
import { WmsService } from '../src/catalogo/services/wms.service';
import { CODIGO_UBICACION_RECEPCION } from '../src/catalogo/utils/ubicacion-de-recepcion';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const APLICAR = process.argv.includes('--aplicar');
const LIMPIAR = process.argv.includes('--limpiar');

const MARCA = 'UAT RECEPCION';
const SKU = 'UAT-RECEPCION-001';

let fallos = 0;
const paso = (t: string) => console.log(`\n\u2500\u2500 ${t} ${'\u2500'.repeat(Math.max(0, 62 - t.length))}`);
const ok = (t: string) => console.log(`   \u2714 ${t}`);
const mal = (t: string) => { fallos += 1; console.log(`   \u2716 ${t}`); };
const dato = (t: string) => console.log(`     ${t}`);

function comparar(etiqueta: string, obtenido: unknown, esperado: unknown) {
  if (JSON.stringify(obtenido) === JSON.stringify(esperado)) ok(`${etiqueta}: ${JSON.stringify(obtenido)}`);
  else mal(`${etiqueta}: ${JSON.stringify(obtenido)} \u2014 se esperaba ${JSON.stringify(esperado)}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const ds = app.get(DataSource);
    const inventario = app.get(InventarioService);
    const wms = app.get(WmsService);

    /*
     * La empresa NO se adivina: con varias en la base, sembrar en una al azar
     * escribe movimientos de inventario donde no toca. Mismo criterio que
     * `e2e-compras`, por el mismo susto.
     */
    const activas = await ds.getRepository(Empresa).find({ where: { activo: true }, order: { nombreComercial: 'ASC' } });
    if (!activas.length) throw new Error('No hay ninguna empresa activa en la base.');
    const pedida = arg('empresa').trim().toLowerCase();
    let empresa: Empresa | undefined;
    if (pedida) {
      empresa = activas.find((e) => e.id.toLowerCase() === pedida || (e.nombreComercial ?? '').toLowerCase().includes(pedida));
      if (!empresa) { console.log('\nNo encontre esa empresa. Activas:'); for (const e of activas) console.log(`  ${e.id}  ${e.nombreComercial}`); return; }
    } else if (activas.length === 1) {
      empresa = activas[0];
    } else {
      console.log('\nHay varias empresas activas; elige una:');
      for (const e of activas) console.log(`  ${e.id}  ${e.nombreComercial}`);
      console.log('\n  npm.cmd run inventario:recepcion -- --empresa "<parte del nombre o el id>" --aplicar\n');
      return;
    }
    const empresaId = empresa.id;
    console.log(`\nEmpresa: ${empresa.nombreComercial ?? empresaId}`);

    const almacenes = ds.getRepository(Almacen);
    const ubicaciones = ds.getRepository(UbicacionAlmacen);
    const productos = ds.getRepository(Producto);

    if (LIMPIAR) {
      paso('Limpieza');
      if (!APLICAR) { console.log('   (agrega --aplicar para ejecutarla)'); return; }
      const alm = await almacenes.findOne({ where: { empresaId, nombre: MARCA } });
      if (alm) {
        await ubicaciones.update({ empresaId, almacenId: alm.id }, { activo: false });
        alm.activo = false; await almacenes.save(alm);
        ok(`Almacen «${MARCA}» y sus posiciones desactivados.`);
      } else ok('No habia nada sembrado.');
      const p = await productos.findOne({ where: { empresaId, sku: SKU } });
      if (p) { p.activo = false; await productos.save(p); ok(`Producto ${SKU} desactivado.`); }
      console.log('\n   Los movimientos de inventario NO se tocan: son historia.\n');
      return;
    }

    if (!APLICAR) {
      paso('Ensayo');
      console.log('   Sembraria un almacen «UAT RECEPCION» con tres posiciones y un producto,');
      console.log('   entraria existencia por las puertas que NO indican posicion y por las que SI,');
      console.log('   y comprobaria donde cae cada una. Vuelve a llamarlo con --aplicar.\n');
      return;
    }

    // ── 1. Un almacen que estrena posiciones ────────────────────────────────
    paso('1 \u00b7 La posicion de recepcion nace con la primera');
    let almacen = await almacenes.findOne({ where: { empresaId, nombre: MARCA } });
    if (!almacen) {
      almacen = await almacenes.save(almacenes.create({ empresaId, nombre: MARCA, activo: true }));
      dato('Almacen creado (sin ninguna posicion todavia).');
    } else {
      almacen.activo = true; await almacenes.save(almacen);
      dato('Almacen reutilizado.');
    }

    const antesDeLaPrimera = await ubicaciones.count({ where: { empresaId, almacenId: almacen.id, activo: true } });
    if (antesDeLaPrimera === 0) {
      await wms.crearUbicacion(empresaId, { almacenId: almacen.id, codigo: 'A-01-01', zona: 'A' });
      const anden = await ubicaciones.findOne({ where: { empresaId, almacenId: almacen.id, estado: EstadoUbicacionAlmacen.RECEPCION, activo: true } });
      if (anden) ok(`Al crear la PRIMERA posicion aparecio el anden: ${anden.codigo}`);
      else mal('Se creo la primera posicion y el almacen se quedo sin anden.');
    } else {
      dato('El almacen ya tenia posiciones; el anden se comprueba abajo.');
      await wms.crearUbicacion(empresaId, { almacenId: almacen.id, codigo: `A-01-${String(antesDeLaPrimera + 1).padStart(2, '0')}`, zona: 'A' });
    }

    const anden = await ubicaciones.findOne({ where: { empresaId, almacenId: almacen.id, estado: EstadoUbicacionAlmacen.RECEPCION, activo: true } });
    if (!anden) { mal('El almacen no tiene posicion de recepcion; lo demas no se puede medir.'); return; }
    comparar('Codigo del anden', anden.codigo, CODIGO_UBICACION_RECEPCION);

    const estante = await ubicaciones.findOne({ where: { empresaId, almacenId: almacen.id, codigo: 'A-01-01' } });
    if (!estante) { mal('No encuentro la posicion A-01-01.'); return; }

    // ── 2. Un producto para mover ───────────────────────────────────────────
    paso('2 \u00b7 Producto de prueba');
    let producto = await productos.findOne({ where: { empresaId, sku: SKU } });
    if (!producto) {
      /*
       * La categoria, el impuesto y la unidad se COPIAN de un producto que ya
       * exista en la empresa, en vez de inventarlos: sembrar catalogos
       * fiscales para una prueba de ubicaciones es ensuciar lo que no toca, y
       * un impuesto inventado acaba saliendo en un CFDI.
       */
      const molde = await productos.findOne({ where: { empresaId, activo: true }, order: { fechaCreacion: 'ASC' } });
      if (!molde) { mal('La empresa no tiene ningun producto del que copiar categoria e impuesto.'); return; }
      producto = await productos.save(productos.create({
        empresaId,
        sku: SKU,
        nombre: `${MARCA} \u00b7 producto`,
        unidadMedida: molde.unidadMedida,
        categoriaId: molde.categoriaId,
        impuestoId: molde.impuestoId,
        precioCompra: 10,
        precioVenta: 14,
        activo: true,
      } as Partial<Producto>) as Producto);
      dato(`Producto creado, copiando catalogo de ${molde.sku}.`);
    } else { producto.activo = true; await productos.save(producto); dato('Producto reutilizado.'); }

    const enAnden = async () => {
      const r = await ds.getRepository(StockUbicacion)
        .createQueryBuilder('su')
        .select('COALESCE(SUM(su.cantidad),0)', 'total')
        .where('su.empresaId=:empresaId AND su.productoId=:productoId AND su.ubicacionId=:u', { empresaId, productoId: producto!.id, u: anden.id })
        .getRawOne();
      return Number(r?.total ?? 0);
    };
    const enEstante = async () => {
      const r = await ds.getRepository(StockUbicacion)
        .createQueryBuilder('su')
        .select('COALESCE(SUM(su.cantidad),0)', 'total')
        .where('su.empresaId=:empresaId AND su.productoId=:productoId AND su.ubicacionId=:u', { empresaId, productoId: producto!.id, u: estante.id })
        .getRawOne();
      return Number(r?.total ?? 0);
    };
    const enAlmacen = async () => {
      const s = await ds.getRepository(StockPorAlmacen).findOne({ where: { empresaId, productoId: producto!.id, almacenId: almacen!.id } });
      return Number(s?.cantidad ?? 0);
    };

    const andenAntes = await enAnden();
    const estanteAntes = await enEstante();
    const almacenAntes = await enAlmacen();
    dato(`Punto de partida \u2014 almacen ${almacenAntes}, anden ${andenAntes}, A-01-01 ${estanteAntes}`);

    // ── 3. La puerta que NO indica posicion ─────────────────────────────────
    paso('3 \u00b7 Entra SIN decir donde (las cuatro puertas sin pantalla)');
    await inventario.registrarCompra(
      producto.id, almacen.id, 7, `${MARCA} \u00b7 entrada sin posicion`, empresaId,
      undefined, undefined, undefined, undefined, 10,
      { tipo: 'UAT_SIN_UBICACION' },
      /* ubicacionId */ undefined,
    );
    comparar('Subio al almacen', (await enAlmacen()) - almacenAntes, 7);
    comparar('Cayo en el anden', (await enAnden()) - andenAntes, 7);
    comparar('No toco A-01-01', (await enEstante()) - estanteAntes, 0);

    // ── 4. La puerta que SI indica posicion ─────────────────────────────────
    paso('4 \u00b7 Entra DICIENDO donde (las cuatro con pantalla)');
    const andenTrasPaso3 = await enAnden();
    const almacenTrasPaso3 = await enAlmacen();
    await inventario.registrarCompra(
      producto.id, almacen.id, 5, `${MARCA} \u00b7 entrada con posicion`, empresaId,
      undefined, undefined, undefined, undefined, 10,
      { tipo: 'UAT_CON_UBICACION' },
      estante.id,
    );
    comparar('Subio al almacen', (await enAlmacen()) - almacenTrasPaso3, 5);
    comparar('Cayo en A-01-01', (await enEstante()) - estanteAntes, 5);
    comparar('NO se desvio al anden', (await enAnden()) - andenTrasPaso3, 0);

    // ── 5. El invariante ────────────────────────────────────────────────────
    paso('5 \u00b7 Consolidado y localizado no se separan');
    const total = await enAlmacen();
    const localizado = (await enAnden()) + (await enEstante());
    comparar('Almacen = anden + estante', [total, localizado], [total, total]);
    if (total !== localizado) {
      dato('Esto es exactamente el defecto que se venia a arreglar: 124 contra 119.');
    }

    // ── 6. La ultima posicion de recepcion no se libera ──────────────────────
    paso('6 \u00b7 El anden no se puede dejar sin sustituto');
    try {
      await wms.actualizarUbicacion(empresaId, anden.id, { activo: false });
      mal('Dejo apagar la unica posicion de recepcion del almacen.');
      await wms.actualizarUbicacion(empresaId, anden.id, { activo: true, estado: EstadoUbicacionAlmacen.RECEPCION });
    } catch (e: any) {
      ok(`Se nego, y lo explico: ${String(e?.message ?? e).slice(0, 110)}\u2026`);
    }

    // ── 7. El diagnostico nombra la causa ───────────────────────────────────
    paso('7 \u00b7 El diagnostico de integridad');
    const diag: any = await wms.verificarConsistenciaUbicaciones(empresaId);
    dato(`Diferencias en la empresa: ${diag.totalDiferencias}`);
    dato(`Almacenes sin posicion de recepcion: ${diag.almacenesSinPosicionDeRecepcion?.length ?? 0}`);
    if (!Array.isArray(diag.almacenesSinPosicionDeRecepcion)) {
      mal('El diagnostico no devuelve la lista de almacenes sin anden.');
    } else {
      ok('El diagnostico distingue los almacenes sin anden.');
    }
    const conCausa = (diag.diferencias ?? []).filter((d: any) => d.causa);
    if (conCausa.length) {
      ok(`${conCausa.length} diferencia(s) traen causa y remedio.`);
      dato(String(conCausa[0].causa).slice(0, 140) + '\u2026');
    } else if (diag.totalDiferencias) {
      dato('Hay diferencias, pero en almacenes que SI tienen anden: vienen de otra cosa.');
      /*
       * Y se nombran. Lo que entro ANTES de que existiera el anden sigue sin
       * ubicar: el arreglo impide las nuevas, no corrige las viejas, y eso hay
       * que poder leerlo en vez de suponerlo.
       */
      for (const d of (diag.diferencias ?? []).slice(0, 5)) {
        dato(`${d.sku ?? '?'} \u00b7 ${d.almacen ?? '?'} \u00b7 almacen ${d.stockAlmacen} \u00b7 ubicado ${d.stockUbicado} \u00b7 sin ubicar ${d.sinUbicar}`);
      }
    } else {
      ok('No hay diferencias que explicar.');
    }

    // ── Cierre ──────────────────────────────────────────────────────────────
    paso('Resultado');
    console.log(`   Almacen de prueba: ${almacen.id}`);
    console.log(`   Anden:             ${anden.codigo} (${anden.id})`);
    console.log(`   Sembrado con el prefijo \u00ab${MARCA}\u00bb \u2014 desactivalo con --limpiar.`);
    console.log(fallos ? `\n   ${fallos} comprobacion(es) FALLARON.\n` : '\n   Las comprobaciones pasaron todas.\n');
  } finally {
    await app.close();
  }
  if (fallos) process.exit(1);
}

main().catch((error) => {
  console.error(`\n\u2716 ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
