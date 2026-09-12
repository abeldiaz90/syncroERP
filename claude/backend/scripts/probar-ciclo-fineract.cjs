const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..');
if(!process.argv.includes('--aplicar-prueba-local'))throw new Error('Usa --aplicar-prueba-local: crea registros sintéticos en Fineract.');
const testDate=process.argv.find(a=>a.startsWith('--fecha='))?.slice(8);
const output=process.argv.find(a=>a.startsWith('--resultado='))?.slice(12);
if(!testDate || !/^\d{4}-\d{2}-\d{2}$/.test(testDate) || !output)throw new Error('Indica --fecha=YYYY-MM-DD y --resultado=ruta.json');
if(process.env.NODE_ENV==='production')throw new Error('No se permite en producción');
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
const {FineractCarteraAdapter}=load('integracion/adaptadores/fineract/fineract-cartera.adapter');
const fs=require('node:fs');
const journalPath=require('node:path').resolve(output);
if(fs.existsSync(journalPath))throw new Error('El archivo de resultados ya existe; conserva la evidencia anterior.');
const journal={inicio:new Date().toISOString(),prestamos:[]};
const guardar=()=>fs.writeFileSync(journalPath,JSON.stringify(journal,null,2));
async function main(){
 const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
 const ds=app.get(DataSource),qr=ds.createQueryRunner();
 const clientId=randomUUID(),accountId=randomUUID();
 let tested=0; const creditIds=[]; const externa=app.get(load('integracion/integracion.constants').PUERTO_CARTERA_EXTERNA);
 try {
  const config=app.get(load('integracion/adaptadores/fineract/fineract.config').FineractConfig);
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(config.url).hostname))throw new Error('La prueba exige Fineract local');
  await qr.connect();await qr.startTransaction();const em=qr.manager;
  await em.query("SET LOCAL statement_timeout='30s'");
  await em.query("SET LOCAL lock_timeout='5s'");
  const [empresa]=await em.query("SELECT id FROM empresas WHERE nombrecomercial='SUMA Local'");assert(empresa);
  const company=empresa.id;
  const products=await em.query("SELECT id,codigo FROM productos_credito WHERE empresaid=$1 AND codigo IN ('MSI','MENS-CI') AND verificadoen IS NOT NULL",[company]);assert.equal(products.length,2);
  await em.save(Cliente,em.create(Cliente,{id:clientId,empresaId:company,nombre:'PRUEBA TRANSACCIONAL CODEX',activo:true,estadoCredito:'AUTORIZADO',limiteCredito:1000000,diasCredito:3650}));
  await em.save(CuentaBancaria,em.create(CuentaBancaria,{id:accountId,empresaId:company,nombre:'CUENTA TEMPORAL PRUEBA',tipo:'BANCO',activo:true}));
  const remoteClient=await externa.asegurarCliente({empresaId:company,clienteId:clientId,nombre:'PRUEBA CODEX CICLO AUTOMATIZADO',esPersonaMoral:false,fechaAlta:testDate});
  journal.clienteExterno=remoteClient;guardar();
  assert.equal(await externa.asegurarCliente({empresaId:company,clienteId:clientId,nombre:'PRUEBA CODEX CICLO AUTOMATIZADO',esPersonaMoral:false,fechaAlta:testDate}),remoteClient);
  const original=app.get(CobranzaService);
  // La contabilización diferida y el timbrado no forman parte de esta prueba.
  // Los eventos reales sí se escriben en la transacción y se comprueban abajo.
  const deferred=Object.create(original.asientos);
  deferred.reintentarAhora=async()=>({generado:false});
  const cobranza=new CobranzaService(em.getRepository(CreditoCliente),em.getRepository(AmortizacionCuota),em.getRepository(PagoCobranza),{transaction:async(_level,fn)=>fn(em)},deferred,original.notificaciones,original.tesoreria,original.caja,{crearComplementoPagoDesdeCobranza:async()=>null},original.cartera);
  for(const product of products){
   await em.query("UPDATE productos_credito SET estado='ACTIVO' WHERE id=$1",[product.id]);
   const credit=await app.get(CreditosService).crearCredito({empresaId:company,clienteId:clientId,productoCreditoId:product.id,montoVenta:12345.67,enganche:0,numeroCuotas:6,fechaInicio:testDate},em);
   assert(credit.id);creditIds.push(credit.id);const initial=Number(credit.saldoPendiente);assert(initial>=12345.67);
   const productData=await em.query('SELECT * FROM productos_credito WHERE id=$1',[product.id]);
   const p=productData[0];
   const originacion={empresaId:company,creditoId:credit.id,clienteId:clientId,clienteIdExterno:remoteClient,productoCreditoId:product.id,capital:12345.67,numeroCuotas:6,tasaInteresMensual:Number(p.tasainteresmensual),sinInteres:p.sininteres,fechaInicio:testDate,unidadPlazo:p.unidadplazo,cadaCuantos:p.cadacuantos,tipoCredito:credit.tipoCredito,folio:'PRUEBA-CODEX-'+product.codigo};
   let remoto;
   try{remoto=await externa.originarCredito(originacion);}catch(error){
    const {referenciaDe}=load('integracion/entities/vinculo-integracion.entity');
    const found=await externa.buscarPorReferencia('loans',referenciaDe('CREDITO',credit.id));
    if(found){journal.prestamos.push({producto:product.codigo,creditoExterno:found,estado:'ORIGINACION_INCOMPLETA',pagos:[]});guardar();}
    throw error;
   }
   const record={producto:product.codigo,creditoExterno:remoto,estado:'ORIGINADO',pagos:[]};journal.prestamos.push(record);guardar();
   assert.equal(await externa.originarCredito(originacion),remoto);
   assert(Math.abs((await externa.saldoCredito(remoto)).saldoTotal-initial)<0.01);
   const input={creditoId:credit.id,cuentaBancariaId:accountId,montoPagado:1000,fechaPago:testDate,metodoPago:'TRANSFERENCIA',referencia:'PRUEBA-SIN-DINERO-REAL',claveIdempotencia:randomUUID()};
   const partial=await cobranza.registrarPago(input,company);assert.equal(partial.idempotente,false);assert(Math.abs(Number(partial.credito.saldoPendiente)-(initial-1000))<0.01);
   const pagoRemoto={empresaId:company,creditoId:credit.id,creditoIdExterno:remoto,pagoId:partial.pago.id,monto:1000,fechaPago:testDate,referencia:'PRUEBA-CODEX'};
   const pagoExterno=await externa.registrarPago(pagoRemoto);record.pagos.push(pagoExterno);guardar();
   assert(Math.abs((await externa.saldoCredito(remoto)).saldoTotal-Number(partial.credito.saldoPendiente))<0.01);
   assert.equal(await externa.registrarPago(pagoRemoto),pagoExterno);
   const duplicate=await cobranza.registrarPago(input,company);assert.equal(duplicate.idempotente,true);assert.equal(duplicate.pago.id,partial.pago.id);
   const final=await cobranza.registrarPago({...input,montoPagado:Number(partial.credito.saldoPendiente),claveIdempotencia:randomUUID()},company);
   const finalId=await externa.registrarPago({...pagoRemoto,pagoId:final.pago.id,monto:Number(partial.credito.saldoPendiente)});record.pagos.push(finalId);guardar();
   const saldoRemoto=await externa.saldoCredito(remoto);assert.equal(saldoRemoto.saldoTotal,0);assert.equal(saldoRemoto.activo,false);record.estado='LIQUIDADO';guardar();
   assert.equal(final.credito.estado,'LIQUIDADO');assert.equal(Number(final.credito.saldoPendiente),0);
   const [{n}]=await em.query('SELECT count(*) n FROM pagos_cobranza WHERE creditoid=$1',[credit.id]);assert.equal(Number(n),2);
   const [{total}]=await em.query("SELECT count(*) total FROM integracion_eventos WHERE empresaid=$1 AND (entidadid=$2::uuid OR carga->>'creditoId'=$2::text)",[company,credit.id]);assert.equal(Number(total),3);
   console.log('PASA ERP Y FINERACT',product.codigo,'originación, pago parcial, reintento sin duplicado y liquidación');tested++;
  }
 }finally{
  // Solo se limpian préstamos de esta corrida, identificados en el diario.
  for(const record of journal.prestamos){
   if(record.estado==='LIQUIDADO')continue;
   try{
    for(const id of [...record.pagos].reverse())if(id)await externa.revertirPago({empresaId:'7dfc9526-986f-47e5-9503-f896646e347b',creditoIdExterno:record.creditoExterno,pagoId:'PRUEBA-CODEX',pagoIdExterno:id,fecha:testDate,motivo:'Limpieza de prueba automatizada'});
    await externa.cancelarCredito({empresaId:'7dfc9526-986f-47e5-9503-f896646e347b',creditoId:'PRUEBA-CODEX',creditoIdExterno:record.creditoExterno,fecha:testDate,motivo:'Limpieza de prueba automatizada'});
    record.estado='CANCELADO';
   }catch(error){record.limpiezaPendiente=error.message;process.exitCode=1;}
   guardar();
  }
  if(qr.isTransactionActive)await qr.rollbackTransaction();await qr.release();
  const [{n}]=await ds.query('SELECT count(*) n FROM clientes WHERE id=$1',[clientId]);assert.equal(Number(n),0);
  const [{n:accounts}]=await ds.query('SELECT count(*) n FROM cuentas_bancarias WHERE id=$1',[accountId]);assert.equal(Number(accounts),0);
  const [{n:credits}]=await ds.query('SELECT count(*) n FROM creditos_clientes WHERE id=ANY($1::uuid[])',[creditIds]);assert.equal(Number(credits),0);
  console.log('ROLLBACK comprobado: cliente y cuenta temporales no persistieron');await app.close();
 }
 assert.equal(tested,2);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
