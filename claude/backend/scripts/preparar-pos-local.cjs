const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),path=require('node:path');
const root=process.env.ERP_BACKEND_ROOT||path.resolve(__dirname,'..');
const output=process.argv.find(a=>a.startsWith('--resultado='))?.slice(12);
if(!process.argv.includes('--aplicar-prueba-local')||!output||process.env.NODE_ENV==='production')throw new Error('Requiere --aplicar-prueba-local --resultado=ruta-nueva.json');
const file=path.resolve(output);if(fs.existsSync(file))throw new Error('Ya existe evidencia: retoma esos registros, no dupliques el escenario');
process.chdir(root);Object.assign(process.env,{CRONS_HABILITADOS:'false',DB_SYNC:'false',DB_MIGRATIONS_RUN:'false'});
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const load=p=>require(root+'/src/'+p);
const e={fecha:new Date().toISOString(),alcance:'Preparación técnica sintética para POS; no es una venta ni una aprobación comercial real.',estado:'INICIADO',clienteId:randomUUID(),productoId:randomUUID(),categoriaId:randomUUID(),almacenId:randomUUID(),cuentaId:randomUUID(),listaId:randomUUID()};
const save=()=>fs.writeFileSync(file,JSON.stringify(e,null,2));
(async()=>{
 const app=await require(root+'/node_modules/@nestjs/core').NestFactory.createApplicationContext(load('app.module').AppModule,{logger:['error']});
 try{
  const ds=app.get(require(root+'/node_modules/typeorm').DataSource);assert(['localhost','127.0.0.1','::1'].includes(ds.options.host));
  const companies=await ds.query("SELECT id FROM empresas WHERE nombrecomercial='SUMA Local'");assert.equal(companies.length,1);e.empresaId=companies[0].id;save();
  await ds.transaction(async em=>{
   const [existing]=await em.query('SELECT count(*) n FROM listas_precio WHERE empresaid=$1',[e.empresaId]);assert.equal(Number(existing.n),0,'Ya hay listas: no modificar la configuración existente');
   const cuentas=await em.query("SELECT id,numerocuenta FROM cuentas_contables WHERE empresaid=$1 AND numerocuenta IN ('401.01','402.01') AND activo=true",[e.empresaId]);assert.equal(cuentas.length,2,'Faltan cuentas de venta y devolución');
   const account=code=>cuentas.find(c=>c.numerocuenta===code).id;
   const {Categoria}=load('catalogo/entities/categoria.entity'),{Producto}=load('catalogo/entities/producto.entity'),{Almacen}=load('catalogo/entities/almacen.entity'),{ListaPrecio}=load('catalogo/entities/lista-precio.entity'),{ProductoPrecio}=load('catalogo/entities/producto-precio.entity'),{Cliente}=load('clientes/entities/cliente.entity'),{CuentaBancaria}=load('credito/entities/cuenta-bancaria.entity');
   await em.save(Categoria,em.create(Categoria,{id:e.categoriaId,empresaId:e.empresaId,nombre:'PRUEBA POS CODEX',cuentaVentasId:account('401.01'),cuentaDevolucionesId:account('402.01'),activo:true}));
   await em.save(Almacen,em.create(Almacen,{id:e.almacenId,empresaId:e.empresaId,nombre:'PRUEBA POS SIN INVENTARIO REAL',activo:true}));
   await em.save(ListaPrecio,em.create(ListaPrecio,{id:e.listaId,empresaId:e.empresaId,nombre:'PRUEBA POS CODEX',esPorDefecto:true}));
   await em.save(Producto,em.create(Producto,{id:e.productoId,empresaId:e.empresaId,nombre:'SERVICIO PRUEBA POS CODEX',sku:'TEST-POS-CODEX',tipo:'SERVICIO',categoriaId:e.categoriaId,activo:true}));
   await em.save(ProductoPrecio,em.create(ProductoPrecio,{productoId:e.productoId,listaPrecioId:e.listaId,precio:600}));
   await em.save(CuentaBancaria,em.create(CuentaBancaria,{id:e.cuentaId,empresaId:e.empresaId,nombre:'PRUEBA POS SIN DINERO REAL',tipo:'BANCO',activo:true}));
   await em.save(Cliente,em.create(Cliente,{id:e.clienteId,empresaId:e.empresaId,nombre:'CLIENTE SINTETICO PRUEBA POS',estadoCredito:'AUTORIZADO',limiteCredito:1200,diasCredito:3650,activo:true}));
   await app.get(load('integracion/services/cartera-publicador.service').CarteraPublicadorService).clienteAlta(e.empresaId,e.clienteId,em);
  });
  e.estado='PREPARADO';save();console.log(JSON.stringify(e));
 }catch(error){e.error=error.message;save();throw error;}finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
