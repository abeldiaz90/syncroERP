const assert=require('node:assert/strict');
const root=process.env.SYNCRO_BACKEND_ROOT || require('node:path').resolve(__dirname,'..');
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const {FineractCarteraAdapter}=require(root+'/src/integracion/adaptadores/fineract/fineract-cartera.adapter');
const {ErrorFineract}=require(root+'/src/integracion/adaptadores/fineract/fineract-http.service');
async function test(method,remote,reject=true,status=403){
 const http={post:async()=>{throw new ErrorFineract('Rechazo original',status,{},false);},get:async()=>{if(remote instanceof Error)throw remote;return remote;}};
 const adapter=new FineractCarteraAdapter(http,{localePorDefecto:'es',formatoFecha:'yyyy-MM-dd'},null,null);
 const promise=adapter[method]({creditoIdExterno:'10',pagoId:'pago',devolucionId:'devolucion',monto:100,fechaPago:'2026-09-12',fecha:'2026-09-12'});
 if(reject)await assert.rejects(promise);else assert.equal(await promise,'7');
}
(async()=>{
 const valid={id:7,amount:100,date:[2026,9,12]};
 for(const method of ['registrarPago','registrarDevolucion']){
  await test(method,valid,false);
  await test(method,new ErrorFineract('No existe',404,{},false));
  await test(method,new ErrorFineract('Sin permiso',403,{},false));
  await test(method,new ErrorFineract('Temporal',503,{},true));
  await test(method,{...valid,amount:101});
  await test(method,{...valid,date:[2026,9,11]});
  await test(method,{...valid,reversedOnDate:[2026,9,12]});
  await test(method,{...valid,amount:undefined});
  await test(method,valid,false,400);
  await test(method,valid,false,409);
  await test(method,new ErrorFineract('No existe',404,{},false),true,400);
 }
 let request;
 const adapter=new FineractCarteraAdapter({post:async(url,body)=>{request={url,body};}},{localePorDefecto:'es',formatoFecha:'yyyy-MM-dd'},null,null);
 assert.equal(await adapter.revertirPago({creditoIdExterno:'10',pagoId:'pago',pagoIdExterno:'7',fecha:'2026-09-12'}),true);
 assert.equal(request.url,'/v1/loans/10/transactions/7');assert.equal(request.body.transactionAmount,0);
 console.log('23 comprobaciones correctas: duplicados 400/403/409, rechazos y reversa con importe cero.');
})().catch(e=>{console.error(e);process.exitCode=1;});
