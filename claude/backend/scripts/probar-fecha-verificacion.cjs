const assert = require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const {ProductosCreditoSyncService}=require(root+'/src/credito/services/productos-credito-sync.service.ts');
const {diaCalendario}=require(root+'/src/common/utils/fecha-calendario.util.ts');
async function scenario(minima, expected, failure=false) {
 let localDate, remoteDate, saved;
 const catalogo={obtener:async()=>({codigo:'PRUEBA',cuotasMaximas:1,cuotasMinimas:1,tasaInteresMensual:0,sinInteres:true,unidadPlazo:'DIAS',cadaCuantos:30}),registrarVerificacion:async(_e,_p,result)=>{saved=result;}};
 const creditos={calcularAmortizacion:input=>{localDate=input.fechaInicio;return [{numeroCuota:1,fechaVencimiento:input.fechaInicio,montoCapital:12345.67,montoInteres:0,montoCuota:12345.67}];}};
 const externo={fechaMinimaProyeccion:async()=>{if(failure)throw new Error('No se pudo consultar activación');return minima;},proyectarAmortizacion:async input=>{remoteDate=input.fechaInicio;return [{numeroCuota:1,fechaVencimiento:input.fechaInicio,montoCapital:12345.67,montoInteres:0,montoCuota:12345.67}];}};
 const service=new ProductosCreditoSyncService(catalogo,creditos,{ajustadorDe:async()=>undefined},{idExterno:async()=> '1',clientesVinculados:async()=>[{idExterno:'2'}]},{modoDe:async()=> 'SOMBRA'},externo);
 const result=await service.verificar('empresa','producto');
 if(failure){assert.equal(result.cuadra,false);assert.equal(saved.cuadra,false);assert.equal(remoteDate,undefined);}
 else {assert.equal(localDate,expected);assert.equal(remoteDate,expected);assert.equal(result.cuadra,true);assert.equal(saved.detalle.fechaInicio,expected);}
}
(async()=>{
 const today=diaCalendario(new Date());
 await scenario('2099-09-12','2099-09-12');
 await scenario('2000-01-01',today);
 await scenario(null,today);
 await scenario(null,undefined,true);
 console.log('4 comprobaciones correctas: activación posterior, anterior, ausente y error de lectura.');
})().catch(e=>{console.error(e);process.exitCode=1;});
