const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..');
process.chdir(root);Object.assign(process.env,{CRONS_HABILITADOS:'false',DB_SYNC:'false',DB_MIGRATIONS_RUN:'false'});
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const load=p=>require(root+'/src/'+p);
const {NestFactory}=require(root+'/node_modules/@nestjs/core');
const {DataSource}=require(root+'/node_modules/typeorm');
const {AppModule}=load('app.module');
const {CreditosService}=load('credito/services/creditos.service');
const {CobranzaService}=load('credito/services/cobranza.service');
const {Cliente}=load('clientes/entities/cliente.entity');
const {CuentaBancaria}=load('credito/entities/cuenta-bancaria.entity');
const {CreditoCliente}=load('credito/entities/credito-cliente.entity');
const {AmortizacionCuota}=load('credito/entities/amortizacion-cuota.entity');
const {PagoCobranza}=load('credito/entities/pago-cobranza.entity');
async function main(){
 const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
 const ds=app.get(DataSource),qr=ds.createQueryRunner();
 const clientId=randomUUID(),accountId=randomUUID();
 let tested=0; const creditIds=[];
 try {
  await qr.connect();await qr.startTransaction();const em=qr.manager;
  await em.query("SET LOCAL statement_timeout='30s'");
  await em.query("SET LOCAL lock_timeout='5s'");
  const [empresa]=await em.query("SELECT id FROM empresas WHERE nombrecomercial='SUMA Local'");assert(empresa);
  const company=empresa.id;
  const products=await em.query("SELECT id,codigo FROM productos_credito WHERE empresaid=$1 AND codigo IN ('MSI','MENS-CI') AND verificadoen IS NOT NULL",[company]);assert.equal(products.length,2);
  await em.save(Cliente,em.create(Cliente,{id:clientId,empresaId:company,nombre:'PRUEBA TRANSACCIONAL CODEX',activo:true,estadoCredito:'AUTORIZADO',limiteCredito:1000000,diasCredito:3650}));
  await em.save(CuentaBancaria,em.create(CuentaBancaria,{id:accountId,empresaId:company,nombre:'CUENTA TEMPORAL PRUEBA',tipo:'BANCO',activo:true}));
  const original=app.get(CobranzaService);
  // La contabilización diferida y el timbrado no forman parte de esta prueba.
  // Los eventos reales sí se escriben en la transacción y se comprueban abajo.
  const deferred=Object.create(original.asientos);
  deferred.reintentarAhora=async()=>({generado:false});
  const cobranza=new CobranzaService(em.getRepository(CreditoCliente),em.getRepository(AmortizacionCuota),em.getRepository(PagoCobranza),{transaction:async(_level,fn)=>fn(em)},deferred,original.notificaciones,original.tesoreria,original.caja,{crearComplementoPagoDesdeCobranza:async()=>null},original.cartera);
  for(const product of products){
   await em.query("UPDATE productos_credito SET estado='ACTIVO' WHERE id=$1",[product.id]);
   const credit=await app.get(CreditosService).crearCredito({empresaId:company,clienteId:clientId,productoCreditoId:product.id,montoVenta:12345.67,enganche:0,numeroCuotas:6,fechaInicio:'2026-09-12'},em);
   assert(credit.id);creditIds.push(credit.id);const initial=Number(credit.saldoPendiente);assert(initial>=12345.67);
   const input={creditoId:credit.id,cuentaBancariaId:accountId,montoPagado:1000,fechaPago:'2026-09-12',metodoPago:'TRANSFERENCIA',referencia:'PRUEBA-SIN-DINERO-REAL',claveIdempotencia:randomUUID()};
   const partial=await cobranza.registrarPago(input,company);assert.equal(partial.idempotente,false);assert(Math.abs(Number(partial.credito.saldoPendiente)-(initial-1000))<0.01);
   const duplicate=await cobranza.registrarPago(input,company);assert.equal(duplicate.idempotente,true);assert.equal(duplicate.pago.id,partial.pago.id);
   const final=await cobranza.registrarPago({...input,montoPagado:Number(partial.credito.saldoPendiente),claveIdempotencia:randomUUID()},company);
   assert.equal(final.credito.estado,'LIQUIDADO');assert.equal(Number(final.credito.saldoPendiente),0);
   const [{n}]=await em.query('SELECT count(*) n FROM pagos_cobranza WHERE creditoid=$1',[credit.id]);assert.equal(Number(n),2);
   const [{total}]=await em.query("SELECT count(*) total FROM integracion_eventos WHERE empresaid=$1 AND (entidadid=$2::uuid OR carga->>'creditoId'=$2::text)",[company,credit.id]);assert.equal(Number(total),3);
   console.log('PASA',product.codigo,'originación, pago parcial, reintento sin duplicado y liquidación');tested++;
  }
 }finally{
  if(qr.isTransactionActive)await qr.rollbackTransaction();await qr.release();
  const [{n}]=await ds.query('SELECT count(*) n FROM clientes WHERE id=$1',[clientId]);assert.equal(Number(n),0);
  const [{n:accounts}]=await ds.query('SELECT count(*) n FROM cuentas_bancarias WHERE id=$1',[accountId]);assert.equal(Number(accounts),0);
  const [{n:credits}]=await ds.query('SELECT count(*) n FROM creditos_clientes WHERE id=ANY($1::uuid[])',[creditIds]);assert.equal(Number(credits),0);
  console.log('ROLLBACK comprobado: cliente y cuenta temporales no persistieron');await app.close();
 }
 assert.equal(tested,2);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
