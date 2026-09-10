import 'dotenv/config';
import { randomUUID } from 'crypto';
import AppDataSource from '../data-source';

type Args = { empresa?: string; execute: boolean; reset: boolean };

const DEMO = {
  warehouseNames: ['DEMO WMS · Almacén Central', 'DEMO WMS · Sucursal Norte'],
  skuPrefix: 'DEMO-WMS-',
  folioPrefix: 'DEMO-',
  category: 'DEMO WMS · Productos',
  brand: 'DEMO WMS',
  priceList: 'DEMO WMS · Precio público',
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const read = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  return {
    empresa: read('empresa'),
    execute: args.includes('--execute'),
    reset: args.includes('--reset-demo'),
  };
}

function money(n: number): number { return Math.round(n * 100) / 100; }

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.empresa) {
    throw new Error('Falta --empresa=<UUID>. Ejemplo: npm run db:seed:wms-demo -- --empresa=... --execute');
  }
  if (!args.execute) {
    console.log('MODO SIMULACIÓN. No se modificó la base de datos.');
    console.log(`Empresa: ${args.empresa}`);
    console.log('Se crearían: 2 almacenes, 12 ubicaciones, 4 productos, 6 lotes, stock localizado, movimientos, 2 transferencias y 1 conteo.');
    console.log('Ejecuta nuevamente agregando --execute. Usa --reset-demo para limpiar primero solo los datos DEMO WMS.');
    return;
  }

  await AppDataSource.initialize();
  const q = AppDataSource.createQueryRunner();
  await q.connect();
  await q.startTransaction();

  const empresaId = args.empresa;
  const ids = {
    central: '', norte: '',
    centralRec: '', centralA1: '', centralA2: '', centralQ: '', centralEmb: '', centralB1: '',
    norteRec: '', norteA1: '', norteA2: '', norteQ: '', norteEmb: '', norteB1: '',
    category: '', brand: '', tax: '', priceList: '',
    coffee: '', yogurt: '', laptop: '', gloves: '',
    lotCoffee1: '', lotCoffee2: '', lotYogurt1: '', lotYogurtQ: '', lotLaptop: '', lotGloves: '',
  };

  const one = async <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => (await q.query(sql, params))[0];
  const scalar = async (sql: string, params: any[] = []): Promise<number> => Number((await one<any>(sql, params))?.total ?? 0);
  const insertId = async (table: string, columns: string[], values: any[]): Promise<string> => {
    const id = randomUUID();
    const cols = ['id', ...columns].map((c) => `"${c.toLowerCase()}"`).join(',');
    const placeholders = values.map((_, i) => `$${i + 2}`).join(',');
    await q.query(`INSERT INTO "${table.toLowerCase()}" (${cols}) VALUES ($1,${placeholders})`, [id, ...values]);
    return id;
  };
  const findId = async (table: string, where: string, params: any[]): Promise<string | undefined> => (await one<any>(`SELECT id FROM "${table.toLowerCase()}" WHERE ${where} LIMIT 1`, params))?.id;

  async function resetDemo(): Promise<void> {
    console.log('Limpiando exclusivamente datos DEMO WMS...');
    await q.query(`DELETE FROM conteos_inventario_detalle WHERE conteoId IN (SELECT id FROM conteos_inventario WHERE empresaId=$1 AND folio LIKE 'DEMO-%')`, [empresaId]);
    await q.query(`DELETE FROM conteos_inventario WHERE empresaId=$1 AND folio LIKE 'DEMO-%'`, [empresaId]);
    await q.query(`DELETE FROM transferencias_inventario_detalle WHERE transferenciaId IN (SELECT id FROM transferencias_inventario WHERE empresaId=$1 AND folio LIKE 'DEMO-%')`, [empresaId]);
    await q.query(`DELETE FROM transferencias_inventario WHERE empresaId=$1 AND folio LIKE 'DEMO-%'`, [empresaId]);
    await q.query(`DELETE FROM movimientos_inventario WHERE empresa_id=$1 AND motivo LIKE 'DEMO WMS:%'`, [empresaId]);
    await q.query(`DELETE FROM stock_ubicaciones WHERE empresaId=$1 AND productoId IN (SELECT id FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%')`, [empresaId]);
    await q.query(`DELETE FROM producto_ubicaciones WHERE empresaId=$1 AND productoId IN (SELECT id FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%')`, [empresaId]);
    await q.query(`DELETE FROM stock_por_almacen WHERE empresaId=$1 AND productoId IN (SELECT id FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%')`, [empresaId]);
    await q.query(`DELETE FROM lotes_inventario WHERE empresaId=$1 AND productoId IN (SELECT id FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%')`, [empresaId]);
    await q.query(`DELETE FROM productos_precios WHERE productoId IN (SELECT id FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%')`, [empresaId]);
    await q.query(`DELETE FROM productos WHERE empresaId=$1 AND sku LIKE 'DEMO-WMS-%'`, [empresaId]);
    await q.query(`DELETE FROM ubicaciones_almacen WHERE empresaId=$1 AND codigo LIKE 'DEMO-%'`, [empresaId]);
    await q.query(`DELETE FROM almacenes WHERE empresaId=$1 AND nombre LIKE 'DEMO WMS %'`, [empresaId]);
    await q.query(`DELETE FROM listas_precio WHERE empresaId=$1 AND nombre=$2`, [empresaId, DEMO.priceList]);
    await q.query(`DELETE FROM categorias WHERE empresaId=$1 AND nombre=$2`, [empresaId, DEMO.category]);
    await q.query(`DELETE FROM marcas WHERE empresaId=$1 AND nombre=$2`, [empresaId, DEMO.brand]);
  }

  try {
    const empresa = await one(`SELECT id FROM Empresas WHERE id=$1 LIMIT 1`, [empresaId]);
    if (!empresa) throw new Error(`No existe la empresa ${empresaId}`);
    if (args.reset) await resetDemo();

    async function upsertSimple(table: string, where: string, whereParams: any[], columns: string[], values: any[]): Promise<string> {
      const existing = await findId(table, where, whereParams);
      if (existing) return existing;
      return insertId(table, columns, values);
    }

    ids.category = await upsertSimple('categorias', 'empresaId=$1 AND nombre=$2', [empresaId, DEMO.category], ['empresaId','nombre','descripcion','activo'], [empresaId, DEMO.category, 'Categoría de demostración WMS', 1]);
    ids.brand = await upsertSimple('marcas', 'empresaId=$1 AND nombre=$2', [empresaId, DEMO.brand], ['empresaId','nombre','activo'], [empresaId, DEMO.brand, 1]);
    const taxExisting = await one<any>(`SELECT id FROM impuestos WHERE empresaId=$1 AND activo=true ORDER BY CASE WHEN porcentaje=16 THEN 0 ELSE 1 END LIMIT 1`, [empresaId]);
    ids.tax = taxExisting?.id ?? await insertId('impuestos', ['empresaId','nombre','porcentaje','claveImpuestoSAT','tipoFactor','objetoImpuesto','activo'], [empresaId,'IVA 16% DEMO',16,'002','TASA','02',1]);
    ids.priceList = await upsertSimple('listas_precio', 'empresaId=$1 AND nombre=$2', [empresaId, DEMO.priceList], ['empresaId','nombre','esPorDefecto'], [empresaId, DEMO.priceList, 0]);

    ids.central = await upsertSimple('almacenes', 'empresaId=$1 AND nombre=$2', [empresaId, DEMO.warehouseNames[0]], ['empresaId','nombre','ubicacion','activo'], [empresaId, DEMO.warehouseNames[0], 'Parque industrial · Nave 1', 1]);
    ids.norte = await upsertSimple('almacenes', 'empresaId=$1 AND nombre=$2', [empresaId, DEMO.warehouseNames[1]], ['empresaId','nombre','ubicacion','activo'], [empresaId, DEMO.warehouseNames[1], 'Sucursal Norte · Bodega posterior', 1]);

    async function location(almacenId: string, code: string, estado: string, zona: string, pasillo: string, rack: string, nivel: string, posicion: string, capacidad: number): Promise<string> {
      return upsertSimple('ubicaciones_almacen', 'empresaId=$1 AND almacenId=$2 AND codigo=$3', [empresaId, almacenId, code],
        ['empresaId','almacenId','codigo','zona','pasillo','rack','nivel','posicion','estado','capacidadMaxima','descripcion','activo'],
        [empresaId,almacenId,code,zona,pasillo,rack,nivel,posicion,estado,capacidad,`Ubicación demo ${code}`,1]);
    }
    ids.centralRec = await location(ids.central,'DEMO-REC-01','RECEPCION','RECEPCIÓN','00','REC','01','01',500);
    ids.centralA1 = await location(ids.central,'DEMO-A-01-01','DISPONIBLE','A','01','R01','01','01',500);
    ids.centralA2 = await location(ids.central,'DEMO-A-01-02','DISPONIBLE','A','01','R01','01','02',500);
    ids.centralB1 = await location(ids.central,'DEMO-B-02-01','DISPONIBLE','B','02','R02','01','01',500);
    ids.centralQ = await location(ids.central,'DEMO-CUA-01','CUARENTENA','CALIDAD','00','CUA','01','01',200);
    ids.centralEmb = await location(ids.central,'DEMO-EMB-01','EMBARQUE','EMBARQUE','00','EMB','01','01',300);
    ids.norteRec = await location(ids.norte,'DEMO-N-REC-01','RECEPCION','RECEPCIÓN','00','REC','01','01',300);
    ids.norteA1 = await location(ids.norte,'DEMO-N-A-01','DISPONIBLE','A','01','R01','01','01',300);
    ids.norteA2 = await location(ids.norte,'DEMO-N-A-02','DISPONIBLE','A','01','R01','01','02',300);
    ids.norteB1 = await location(ids.norte,'DEMO-N-B-01','DISPONIBLE','B','02','R02','01','01',300);
    ids.norteQ = await location(ids.norte,'DEMO-N-CUA-01','CUARENTENA','CALIDAD','00','CUA','01','01',100);
    ids.norteEmb = await location(ids.norte,'DEMO-N-EMB-01','EMBARQUE','EMBARQUE','00','EMB','01','01',200);

    async function product(sku: string, nombre: string, cost: number, sale: number, opts: { lot?: boolean; expiry?: boolean; serial?: boolean; condition?: string; min?: number; max?: number; reorder?: number } = {}): Promise<string> {
      const existing = await findId('productos', 'empresaId=$1 AND sku=$2', [empresaId, sku]);
      const id = existing ?? await insertId('productos', [
        'empresaId','nombre','nombreCorto','sku','descripcion','claveSAT','claveUnidadSAT','tipo','unidadMedida','precioCompra','monedaCosto','tipoCosto','condicionAlmacen','stockMinimo','stockMaximo','puntoReorden','requiereLote','requiereCaducidad','permiteVentaSinStock','requiereNumeroSerie','marcaId','categoriaId','impuestoId','activo'
      ], [empresaId,nombre,nombre.slice(0,60),sku,`Producto de demostración para WMS: ${nombre}`,'01010101','H87','FISICO','PIEZA',cost,'MXN','PROMEDIO',opts.condition ?? 'AMBIENTE',opts.min ?? 10,opts.max ?? 500,opts.reorder ?? 30,opts.lot?1:0,opts.expiry?1:0,0,opts.serial?1:0,ids.brand,ids.category,ids.tax,1]);
      const pp = await findId('productos_precios', 'productoId=$1 AND listaPrecioId=$2', [id, ids.priceList]);
      if (!pp) await insertId('productos_precios', ['productoId','listaPrecioId','precio'], [id,ids.priceList,sale]);
      return id;
    }
    ids.coffee = await product('DEMO-WMS-CAFE-001','Café premium 1 kg',120,199,{lot:true,expiry:true,min:40,max:500,reorder:100});
    ids.yogurt = await product('DEMO-WMS-YOG-001','Yogurt natural 1 L',28,49,{lot:true,expiry:true,condition:'REFRIGERADO',min:24,max:200,reorder:48});
    ids.laptop = await product('DEMO-WMS-LAP-001','Laptop empresarial 14 pulgadas',12500,16999,{serial:true,min:2,max:20,reorder:4});
    ids.gloves = await product('DEMO-WMS-GUA-001','Guantes de nitrilo caja 100',85,149,{lot:true,min:50,max:800,reorder:150});

    async function assign(productoId: string, almacenId: string, ubicacionId: string, main: boolean, cap: number, min: number, max: number): Promise<void> {
      const exists = await findId('producto_ubicaciones','empresaId=$1 AND productoId=$2 AND ubicacionId=$3',[empresaId,productoId,ubicacionId]);
      if (!exists) await insertId('producto_ubicaciones',['empresaId','productoId','almacenId','ubicacionId','esPrincipal','capacidadAsignada','stockMinimo','stockMaximo','observaciones','activo'],[empresaId,productoId,almacenId,ubicacionId,main?1:0,cap,min,max,'Asignación DEMO WMS',1]);
    }
    await assign(ids.coffee,ids.central,ids.centralA1,true,300,40,300); await assign(ids.coffee,ids.central,ids.centralA2,false,300,0,300); await assign(ids.coffee,ids.norte,ids.norteA1,true,200,20,200);
    await assign(ids.yogurt,ids.central,ids.centralB1,true,150,24,150); await assign(ids.yogurt,ids.central,ids.centralQ,false,100,0,100);
    await assign(ids.laptop,ids.central,ids.centralA2,true,20,2,20);
    await assign(ids.gloves,ids.central,ids.centralA1,true,500,50,500); await assign(ids.gloves,ids.norte,ids.norteB1,true,300,30,300);

    async function lot(productoId: string, almacenId: string, number: string, expiry: string | null, qty: number, cost: number): Promise<string> {
      const existing = await findId('lotes_inventario','empresaId=$1 AND productoId=$2 AND almacenId=$3 AND numeroLote=$4',[empresaId,productoId,almacenId,number]);
      if (existing) return existing;
      return insertId('lotes_inventario',['empresaId','productoId','almacenId','numeroLote','fechaCaducidad','stockRestante','costoUnitario','valorTotal','activo'],[empresaId,productoId,almacenId,number,expiry,qty,cost,money(qty*cost),1]);
    }
    ids.lotCoffee1 = await lot(ids.coffee,ids.central,'CAF-2607-A','2027-03-31',90,118);
    ids.lotCoffee2 = await lot(ids.coffee,ids.central,'CAF-2607-B','2027-07-31',60,123);
    await lot(ids.coffee,ids.norte,'CAF-2606-N','2027-01-31',40,116);
    ids.lotYogurt1 = await lot(ids.yogurt,ids.central,'YOG-260731','2026-08-12',60,28);
    ids.lotYogurtQ = await lot(ids.yogurt,ids.central,'YOG-CAL-01','2026-08-05',12,27.5);
    ids.lotLaptop = await lot(ids.laptop,ids.central,'INT-LAP-2607',null,8,12500);
    ids.lotGloves = await lot(ids.gloves,ids.central,'GUA-2607','2029-07-31',300,85);
    await lot(ids.gloves,ids.norte,'GUA-N-2606','2029-06-30',80,82);

    async function stockWarehouse(productoId: string, almacenId: string, qty: number, reserved=0, committed=0, blocked=0, transit=0): Promise<void> {
      const existing = await findId('stock_por_almacen','empresaId=$1 AND productoId=$2 AND almacenId=$3',[empresaId,productoId,almacenId]);
      if (existing) await q.query(`UPDATE stock_por_almacen SET cantidad=$1,reservado=$2,comprometido=$3,bloqueado=$4,enTransito=$5 WHERE id=$6`,[qty,reserved,committed,blocked,transit,existing]);
      else await insertId('stock_por_almacen',['empresaId','productoId','almacenId','cantidad','reservado','comprometido','bloqueado','enTransito'],[empresaId,productoId,almacenId,qty,reserved,committed,blocked,transit]);
    }
    async function stockLocation(productoId:string,almacenId:string,ubicacionId:string,loteId:string|null,state:string,qty:number,reserved=0): Promise<void> {
      const condition = loteId ? 'empresaId=$1 AND productoId=$2 AND almacenId=$3 AND ubicacionId=$4 AND loteId=$5 AND estado=$6' : 'empresaId=$1 AND productoId=$2 AND almacenId=$3 AND ubicacionId=$4 AND loteId IS NULL AND estado=$5';
      const params = loteId ? [empresaId,productoId,almacenId,ubicacionId,loteId,state] : [empresaId,productoId,almacenId,ubicacionId,state];
      const existing = await findId('stock_ubicaciones',condition,params);
      if (existing) await q.query(`UPDATE stock_ubicaciones SET cantidad=$1,reservado=$2 WHERE id=$3`,[qty,reserved,existing]);
      else await insertId('stock_ubicaciones',['empresaId','productoId','almacenId','ubicacionId','loteId','estado','cantidad','reservado'],[empresaId,productoId,almacenId,ubicacionId,loteId,state,qty,reserved]);
    }

    await stockWarehouse(ids.coffee,ids.central,150); await stockLocation(ids.coffee,ids.central,ids.centralA1,ids.lotCoffee1,'DISPONIBLE',90); await stockLocation(ids.coffee,ids.central,ids.centralA2,ids.lotCoffee2,'DISPONIBLE',60);
    await stockWarehouse(ids.coffee,ids.norte,40,0,0,0,30); const coffeeN = await findId('lotes_inventario','empresaId=$1 AND productoId=$2 AND almacenId=$3 AND numeroLote=$4',[empresaId,ids.coffee,ids.norte,'CAF-2606-N']); await stockLocation(ids.coffee,ids.norte,ids.norteA1,coffeeN!,'DISPONIBLE',40);
    await stockWarehouse(ids.yogurt,ids.central,72,0,0,12); await stockLocation(ids.yogurt,ids.central,ids.centralB1,ids.lotYogurt1,'DISPONIBLE',60); await stockLocation(ids.yogurt,ids.central,ids.centralQ,ids.lotYogurtQ,'CUARENTENA',12);
    await stockWarehouse(ids.laptop,ids.central,8); await stockLocation(ids.laptop,ids.central,ids.centralA2,ids.lotLaptop,'DISPONIBLE',8);
    await stockWarehouse(ids.gloves,ids.central,300,50); await stockLocation(ids.gloves,ids.central,ids.centralA1,ids.lotGloves,'DISPONIBLE',300,50);
    await stockWarehouse(ids.gloves,ids.norte,80); const glovesN = await findId('lotes_inventario','empresaId=$1 AND productoId=$2 AND almacenId=$3 AND numeroLote=$4',[empresaId,ids.gloves,ids.norte,'GUA-N-2606']); await stockLocation(ids.gloves,ids.norte,ids.norteB1,glovesN!,'DISPONIBLE',80);

    async function movement(productoId:string,almacenId:string,type:string,qty:number,before:number,after:number,cost:number,motive:string,loteId:string|null,lote:string|null,expiry:string|null,documentId:string|null=null,docType:string|null='DEMO_WMS'): Promise<void> {
      const exists = await scalar(`SELECT COUNT(1) total FROM movimientos_inventario WHERE empresa_id=$1 AND producto_id=$2 AND almacen_id=$3 AND motivo=$4`,[empresaId,productoId,almacenId,motive]);
      if (!exists) await insertId('movimientos_inventario',['empresa_id','producto_id','almacen_id','tipo','cantidad','stock_anterior','stock_nuevo','costo_unitario','costo_total','motivo','documento_id','tipo_documento','lote','lote_id','fechaCaducidadMovimiento'],[empresaId,productoId,almacenId,type,qty,before,after,cost,money(qty*cost),motive,documentId,docType,lote,loteId,expiry]);
    }
    await movement(ids.coffee,ids.central,'ENTRADA',180,0,180,120,'DEMO WMS: carga inicial café',ids.lotCoffee1,'CAF-2607-A','2027-03-31');
    await movement(ids.coffee,ids.central,'SALIDA',30,180,150,118,'DEMO WMS: transferencia en tránsito a Sucursal Norte',ids.lotCoffee1,'CAF-2607-A','2027-03-31');
    await movement(ids.coffee,ids.norte,'ENTRADA',40,0,40,116,'DEMO WMS: carga inicial café sucursal',coffeeN!,'CAF-2606-N','2027-01-31');
    await movement(ids.yogurt,ids.central,'ENTRADA',72,0,72,28,'DEMO WMS: recepción con control de calidad',ids.lotYogurt1,'YOG-260731','2026-08-12');
    await movement(ids.laptop,ids.central,'ENTRADA',8,0,8,12500,'DEMO WMS: recepción equipos serializados',ids.lotLaptop,'INT-LAP-2607',null);
    await movement(ids.gloves,ids.central,'ENTRADA',300,0,300,85,'DEMO WMS: carga inicial guantes',ids.lotGloves,'GUA-2607','2029-07-31');

    const transferTransit = await findId('transferencias_inventario','empresaId=$1 AND folio=$2',[empresaId,'DEMO-TRF-0001']) ?? await insertId('transferencias_inventario',['empresaId','folio','almacenOrigenId','almacenDestinoId','estado','motivo','fechaAutorizacion','fechaEnvio','valorTotal'],[empresaId,'DEMO-TRF-0001',ids.central,ids.norte,'EN_TRANSITO','Reposición de café para sucursal',new Date(),new Date(),money(30*118)]);
    if (!await findId('transferencias_inventario_detalle','transferenciaId=$1',[transferTransit])) await insertId('transferencias_inventario_detalle',['transferenciaId','productoId','ubicacionOrigenId','ubicacionDestinoId','numeroLote','fechaCaducidad','cantidad','cantidadSolicitada','cantidadEnviada','cantidadRecibida','cantidadDanada','costoUnitario','costoTotal'],[transferTransit,ids.coffee,ids.centralA1,ids.norteA2,'CAF-2607-A','2027-03-31',30,30,30,0,0,118,money(30*118)]);

    const transferPending = await findId('transferencias_inventario','empresaId=$1 AND folio=$2',[empresaId,'DEMO-TRF-0002']) ?? await insertId('transferencias_inventario',['empresaId','folio','almacenOrigenId','almacenDestinoId','estado','motivo','valorTotal'],[empresaId,'DEMO-TRF-0002',ids.central,ids.norte,'SOLICITADA','Abastecer guantes para ventas de la semana',money(50*85)]);
    if (!await findId('transferencias_inventario_detalle','transferenciaId=$1',[transferPending])) await insertId('transferencias_inventario_detalle',['transferenciaId','productoId','ubicacionOrigenId','ubicacionDestinoId','numeroLote','fechaCaducidad','cantidad','cantidadSolicitada','cantidadEnviada','cantidadRecibida','cantidadDanada','costoUnitario','costoTotal'],[transferPending,ids.gloves,ids.centralA1,ids.norteB1,'GUA-2607','2029-07-31',50,50,0,0,0,85,money(50*85)]);

    const countId = await findId('conteos_inventario','empresaId=$1 AND folio=$2',[empresaId,'DEMO-CNT-0001']) ?? await insertId('conteos_inventario',['empresaId','folio','almacenId','estado','motivo','conteoCiego','fechaApertura'],[empresaId,'DEMO-CNT-0001',ids.central,'EN_CONTEO','Conteo cíclico de refrigerados para demo',1,new Date()]);
    if (!await findId('conteos_inventario_detalle','conteoId=$1 AND productoId=$2 AND ubicacionId=$3 AND loteId=$4',[countId,ids.yogurt,ids.centralB1,ids.lotYogurt1])) await insertId('conteos_inventario_detalle',['conteoId','productoId','ubicacionId','loteId','estadoStock','existenciaTeorica','primerConteo','cantidadFinal','diferencia','observaciones'],[countId,ids.yogurt,ids.centralB1,ids.lotYogurt1,'DISPONIBLE',60,58,58,-2,'Diferencia preparada para demostrar autorización y ajuste']);

    await q.commitTransaction();
    console.log('\nDEMO WMS CREADA CORRECTAMENTE');
    console.log(`Empresa: ${empresaId}`);
    console.log(`Almacenes: ${DEMO.warehouseNames.join(' | ')}`);
    console.log('Productos: café con lotes/caducidad, yogurt refrigerado y cuarentena, laptop serializada y guantes reservados.');
    console.log('Escenarios: transferencia en tránsito, transferencia solicitada, conteo con diferencia, stock por ubicación y alertas de caducidad.');
    console.log('\nRutas sugeridas para la demo:');
    console.log('/dashboard/almacenes/centro');
    console.log('/dashboard/almacenes/existencias');
    console.log('/dashboard/inventario/transferencias');
    console.log('/dashboard/inventario/conteos');
    console.log('/dashboard/inventario/reubicaciones');
  } catch (error) {
    await q.rollbackTransaction();
    throw error;
  } finally {
    await q.release();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('No fue posible generar la demo WMS:', error instanceof Error ? error.message : error);
  process.exit(1);
});
