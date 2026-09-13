const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = process.env.ERP_BACKEND_ROOT || path.resolve(__dirname, '..');
const output = process.argv.find(a => a.startsWith('--resultado='))?.slice(12);
if (!process.argv.includes('--aplicar-prueba-local') || !output) throw new Error('Requiere --aplicar-prueba-local --resultado=ruta.json. Conserva un cliente sintético sin crédito en ERP y Fineract.');
if (process.env.NODE_ENV === 'production') throw new Error('No se permite en producción');
const journalPath = path.resolve(output);
if (fs.existsSync(journalPath)) throw new Error('La evidencia ya existe');
process.chdir(root);
Object.assign(process.env, { CRONS_HABILITADOS: 'false', DB_SYNC: 'false', DB_MIGRATIONS_RUN: 'false' });
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/tsconfig.json' });
const load = p => require(root + '/src/' + p);
const { NestFactory } = require(root + '/node_modules/@nestjs/core');
const { DataSource } = require(root + '/node_modules/typeorm');
const { Cliente } = load('clientes/entities/cliente.entity');
const { EventoIntegracion } = load('integracion/entities/evento-integracion.entity');
const { CarteraPublicadorService } = load('integracion/services/cartera-publicador.service');
const { CarteraConciliacionService } = load('integracion/services/cartera-conciliacion.service');
const { IntegracionVinculosService } = load('integracion/services/integracion-vinculos.service');
const { TipoVinculo, PUERTO_CARTERA_EXTERNA } = load('integracion/integracion.constants');
const journal = { inicio: new Date().toISOString(), clienteId: randomUUID(), alcance: 'Alta, originación y cancelación sintéticas persistentes por cron real. Crédito por servicio; cancelación preparada técnicamente. No POS, pago ni devolución.' };
const save = () => fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
async function main() {
  const app = await NestFactory.createApplicationContext(load('app.module').AppModule, { logger: ['error'] });
  try {
    const ds = app.get(DataSource);
    const cfg = app.get(load('integracion/adaptadores/fineract/fineract.config').FineractConfig);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(cfg.url).hostname), 'Fineract debe ser local');
    assert(['localhost', '127.0.0.1', '::1'].includes(ds.options.host), 'PostgreSQL debe ser local');
    const companies = await ds.query("SELECT id FROM empresas WHERE nombrecomercial='SUMA Local'");
    assert.equal(companies.length, 1);
    journal.empresaId = companies[0].id;
    const publisher = app.get(CarteraPublicadorService);
    assert(await publisher.activoPara(journal.empresaId));
    save();
    await ds.transaction(async em => {
      await em.save(Cliente, em.create(Cliente, { id: journal.clienteId, empresaId: journal.empresaId, nombre: 'PRUEBA CODEX OUTBOX SIN CREDITO', activo: true, limiteCredito: 0, diasCredito: 0, estadoCredito: 'SIN_CREDITO' }));
      await publisher.clienteAlta(journal.empresaId, journal.clienteId, em);
      await publisher.clienteAlta(journal.empresaId, journal.clienteId, em);
      const events = await em.getRepository(EventoIntegracion).find({ where: { empresaId: journal.empresaId, entidadId: journal.clienteId } });
      assert.equal(events.length, 1, 'La publicación repetida no debe duplicar el evento');
      journal.eventoId = events[0].id;
    });
    save();
    console.log('PUBLICADO', journal.eventoId, 'Esperando al cron del backend; este script no invoca al despachador.');
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const event = await ds.getRepository(EventoIntegracion).findOneByOrFail({ id: journal.eventoId });
      journal.estado = event.estado; journal.intentos = event.intentos; save();
      if (event.estado === 'ENVIADO') break;
      assert.notEqual(event.estado, 'FALLIDO', event.ultimoError || 'Evento fallido');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    assert.equal(journal.estado, 'ENVIADO', 'El proceso automático no envió el evento en 90 segundos');
    const link = await app.get(IntegracionVinculosService).buscar(journal.empresaId, TipoVinculo.CLIENTE, journal.clienteId);
    assert(link?.idExterno);
    journal.clienteExterno = link.idExterno;
    const summary = await app.get(PUERTO_CARTERA_EXTERNA).resumenCliente(link.idExterno);
    assert.equal(summary.saldoTotal, 0);
    const externa=app.get(PUERTO_CARTERA_EXTERNA);
    const {CreditoCliente}=load('credito/entities/credito-cliente.entity');
    const waitEvent=async key=>{
      const deadline=Date.now()+90000;
      while(Date.now()<deadline){
        const event=await ds.getRepository(EventoIntegracion).findOneBy({empresaId:journal.empresaId,claveIdempotencia:key});
        assert(event,'Falta el evento '+key);
        if(event.estado==='ENVIADO')return event.id;
        assert.notEqual(event.estado,'FALLIDO',event.ultimoError||'Evento fallido');
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
      throw new Error('El cron no completó '+key+' en 90 segundos');
    };
    const fecha=await externa.fechaMinimaProyeccion(link.idExterno);
    const hoy=load('common/utils/fecha-calendario.util').diaCalendario();
    journal.fechaCredito=fecha&&fecha>hoy?fecha:hoy;
    await ds.transaction(async em=>{
      await em.update(Cliente,{id:journal.clienteId},{estadoCredito:'AUTORIZADO',limiteCredito:1200,diasCredito:3650});
      const products=await em.query("SELECT id,estado FROM productos_credito WHERE empresaid=$1 AND codigo='MSI' AND verificadoen IS NOT NULL FOR UPDATE",[journal.empresaId]);
      assert.equal(products.length,1);const product=products[0];
      await em.query("UPDATE productos_credito SET estado='ACTIVO' WHERE id=$1",[product.id]);
      const credit=await app.get(load('credito/services/creditos.service').CreditosService).crearCredito({empresaId:journal.empresaId,clienteId:journal.clienteId,productoCreditoId:product.id,montoVenta:1200,enganche:0,numeroCuotas:6,fechaInicio:journal.fechaCredito},em);
      journal.creditoId=credit.id;
      await em.query('UPDATE productos_credito SET estado=$2 WHERE id=$1',[product.id,product.estado]);
    });
    save();console.log('CREDITO PUBLICADO',journal.creditoId);
    try{
      journal.eventoOriginacion=await waitEvent('credito:'+journal.creditoId);
      const creditLink=await app.get(IntegracionVinculosService).buscar(journal.empresaId,TipoVinculo.CREDITO,journal.creditoId);
      assert(creditLink?.idExterno);journal.creditoExterno=creditLink.idExterno;save();
      assert.equal((await externa.saldoCredito(creditLink.idExterno)).saldoTotal,1200);
      journal.conciliacionActivo=await app.get(CarteraConciliacionService).conciliarEmpresa(journal.empresaId);
      assert.equal(journal.conciliacionActivo.discrepancias,0);save();
    }finally{
      // Preparación técnica del hecho de cancelación para probar el consumidor;
      // no reemplaza la prueba de anulación comercial desde una venta.
      await ds.transaction(async em=>{
        await em.update(CreditoCliente,{id:journal.creditoId},{estado:'CANCELADO',saldoPendiente:0});
        await publisher.creditoCancelado(journal.empresaId,{creditoId:journal.creditoId,fecha:journal.fechaCredito,motivo:'Cierre del crédito sintético de prueba de outbox'},em);
        await em.update(Cliente,{id:journal.clienteId},{estadoCredito:'SIN_CREDITO',limiteCredito:0,diasCredito:0});
      });
      save();console.log('CANCELACION PUBLICADA');
      journal.eventoCancelacion=await waitEvent('credito-cancelado:'+journal.creditoId);
      if(journal.creditoExterno){const closed=await externa.saldoCredito(journal.creditoExterno);assert.equal(closed.saldoTotal,0);assert.equal(closed.activo,false);journal.estadoCredito=closed.estado;}
      save();
    }
    journal.conciliacion = await app.get(CarteraConciliacionService).conciliarEmpresa(journal.empresaId);
    assert.equal(journal.conciliacion.discrepancias, 0);
    journal.fin = new Date().toISOString(); save();
    console.log('PASA', JSON.stringify(journal));
  } catch (error) { journal.error = error.message; save(); throw error; }
  finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
