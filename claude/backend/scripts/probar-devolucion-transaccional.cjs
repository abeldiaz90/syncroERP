const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const root=process.env.ERP_BACKEND_ROOT||require('node:path').resolve(__dirname,'..');
if(!process.argv.includes('--aplicar-prueba-local')||process.env.NODE_ENV==='production')throw new Error('Requiere --aplicar-prueba-local en entorno de pruebas');
process.chdir(root);
Object.assign(process.env,{CRONS_HABILITADOS:'false',DB_SYNC:'false',DB_MIGRATIONS_RUN:'false'});
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const load=p=>require(root+'/src/'+p);
const {DataSource}=require(root+'/node_modules/typeorm');
const {Cliente}=load('clientes/entities/cliente.entity');
const {Producto}=load('catalogo/entities/producto.entity');
const {Venta}=load('ventas/entities/venta.entity');
const {DetalleVenta}=load('ventas/entities/detalle-venta.entity');
const {DevolucionVenta}=load('ventas/entities/devolucion-venta.entity');
const {CreditoCliente}=load('credito/entities/credito-cliente.entity');
const {DevolucionesVentasService}=load('ventas/services/devoluciones-ventas.service');
async function main(){
 const app=await require(root+'/node_modules/@nestjs/core').NestFactory.createApplicationContext(load('app.module').AppModule,{logger:['error']});
 const ds=app.get(DataSource),qr=ds.createQueryRunner();
 const clientId=randomUUID(),saleId=randomUUID(),productId=randomUUID();
 try{
  assert(['localhost','127.0.0.1','::1'].includes(ds.options.host),'Exige PostgreSQL local');
  await qr.connect();await qr.startTransaction();const em=qr.manager;
  await em.query("SET LOCAL statement_timeout='30s'");await em.query("SET LOCAL lock_timeout='5s'");
  const companies=await em.query("SELECT id FROM empresas WHERE nombrecomercial='SUMA Local'");assert.equal(companies.length,1);const empresaId=companies[0].id;
  const [product]=await em.query("SELECT id FROM productos_credito WHERE empresaid=$1 AND codigo='MSI' AND verificadoen IS NOT NULL",[empresaId]);assert(product);
  await em.save(Cliente,em.create(Cliente,{id:clientId,empresaId,nombre:'PRUEBA DEVOLUCION SIN DINERO REAL',estadoCredito:'AUTORIZADO',limiteCredito:10000,diasCredito:3650,activo:true}));
  await em.save(Producto,em.create(Producto,{id:productId,empresaId,nombre:'SERVICIO SINTETICO DEVOLUCION',sku:'TEST-'+productId,tipo:'SERVICIO'}));
  const [{folio}]=await em.query('SELECT COALESCE(MAX(folio),0)+1 folio FROM ventas WHERE empresaid=$1',[empresaId]);
  await em.save(Venta,em.create(Venta,{id:saleId,empresaId,clienteId:clientId,folio:Number(folio),subtotal:1200,total:1200,metodoPago:'CREDITO',estado:'COMPLETADA',fechaVenta:new Date()}));
  const detail=await em.save(DetalleVenta,em.create(DetalleVenta,{ventaId:saleId,productoId:productId,cantidad:2,precioUnitario:600,subtotal:1200,impuestoMonto:0}));
  await em.query("UPDATE productos_credito SET estado='ACTIVO' WHERE id=$1",[product.id]);
  const fecha=load('common/utils/business-time.util').fechaCalendarioNegocio();
  const credit=await app.get(load('credito/services/creditos.service').CreditosService).crearCredito({empresaId,clienteId:clientId,ventaId:saleId,productoCreditoId:product.id,montoVenta:1200,enganche:0,numeroCuotas:6,fechaInicio:fecha},em);
  const original=app.get(DevolucionesVentasService);
  const deferred=Object.create(original.asientos);deferred.reintentarAhora=async()=>({generado:false});
  // El servicio completo usa la transacción de prueba. Sólo se difiere generar
  // la póliza tras commit; el evento contable real sí se escribe y se revierte.
  const service=new DevolucionesVentasService(em.getRepository(DevolucionVenta),{transaction:async fn=>fn(em)},original.stock,deferred,original.tesoreria,original.caja,original.saldosFavorService,original.cfdi,original.cartera);
  const dto={motivo:'DEVOLUCION SINTETICA SIN DINERO REAL',destinoImporte:'SALDO_FAVOR',claveIdempotencia:randomUUID(),detalles:[{detalleVentaId:detail.id,cantidad:1,condicion:'NO_REINTEGRABLE'}]};
  const partial=await service.crear(saleId,dto,empresaId,undefined,'ADMIN');
  assert.equal(Number(partial.ajusteCxC),600);assert.equal(Number(partial.importeReembolso),0);
  assert.equal(Number((await em.findOneByOrFail(CreditoCliente,{id:credit.id})).saldoPendiente),600);
  assert.equal((await em.findOneByOrFail(Venta,{id:saleId})).estado,'PARCIALMENTE_DEVUELTA');
  const duplicate=await service.crear(saleId,dto,empresaId,undefined,'ADMIN');assert.equal(duplicate.id,partial.id);
  const final=await service.crear(saleId,{...dto,claveIdempotencia:randomUUID()},empresaId,undefined,'ADMIN');assert.notEqual(final.id,partial.id);
  const liquidated=await em.findOneByOrFail(CreditoCliente,{id:credit.id});assert.equal(Number(liquidated.saldoPendiente),0);assert.equal(liquidated.estado,'LIQUIDADO');
  assert.equal((await em.findOneByOrFail(Venta,{id:saleId})).estado,'DEVUELTA');
  assert.equal(await em.count(DevolucionVenta,{where:{ventaId:saleId}}),2);
  const events=await em.query("SELECT tipo,carga FROM integracion_eventos WHERE empresaid=$1 AND carga->>'creditoId'=$2",[empresaId,credit.id]);
  assert.equal(events.length,3);assert.equal(events.filter(e=>e.tipo.includes('DEVOLUCION')).length,2);
  await assert.rejects(service.crear(saleId,{...dto,claveIdempotencia:randomUUID()},empresaId,undefined,'ADMIN'),/no admite devoluciones/);
  console.log('PASA: devolución parcial, repetición idempotente, devolución total, crédito liquidado, dos eventos de devolución y rechazo de exceso.');
 }finally{
  try{if(qr.isTransactionActive)await qr.rollbackTransaction();await qr.release();
   assert.equal(await ds.getRepository(Cliente).countBy({id:clientId}),0);assert.equal(await ds.getRepository(Venta).countBy({id:saleId}),0);assert.equal(await ds.getRepository(Producto).countBy({id:productId}),0);
   console.log('ROLLBACK comprobado: cliente, venta y producto sintéticos no persistieron.');
  }finally{await app.close();}
 }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
