const root=require('node:path').resolve(__dirname,'..');
process.chdir(root);
process.env.CRONS_HABILITADOS='false';
process.env.DB_SYNC='false';
process.env.DB_MIGRATIONS_RUN='false';
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const {NestFactory}=require(root+'/node_modules/@nestjs/core');
const {AppModule}=require(root+'/src/app.module');
const {DataSource}=require(root+'/node_modules/typeorm');
const {ProductosCreditoSyncService}=require(root+'/src/credito/services/productos-credito-sync.service');
async function main(){
 const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
 try {
  const ds=app.get(DataSource);
  const companies=await ds.query('SELECT id FROM empresas WHERE nombrecomercial=$1',['SUMA Local']);
  if(companies.length!==1)throw new Error('Empresa ambigua o inexistente');
  const empresa=companies[0].id;
  const products=await ds.query("SELECT id,codigo FROM productos_credito WHERE empresaid=$1 AND codigo IN ('MSI','MENS-CI') ORDER BY codigo",[empresa]);
  if(products.length!==2)throw new Error('Se esperaban dos productos');
  for(const p of products){const result=await app.get(ProductosCreditoSyncService).verificar(empresa,p.id);console.log('RESULTADO',p.codigo,JSON.stringify(result));if(!result.cuadra)process.exitCode=1;}
 }finally{await app.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
