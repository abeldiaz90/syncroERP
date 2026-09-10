import 'reflect-metadata';
import AppDataSource from '../data-source';

const EMPRESA = process.argv.find(a=>a.startsWith('--empresa='))?.split('=')[1];
const EJECUTAR = process.argv.includes('--execute');
const CONFIRMAR = process.argv.find(a=>a.startsWith('--confirm='))?.split('=')[1];

const TABLAS = [
  'partidas_poliza','polizas','pagos_cobranza','amortizacion_cuotas','creditos_clientes',
  'pagos_proveedor','recepciones_compra','detalles_orden_compra','ordenes_compra','detalles_cotizacion','cotizaciones','aprobaciones','detalles_requisicion','requisiciones',
  'aplicaciones_lote_devolucion','detalles_devolucion_venta','devoluciones_venta','detalles_venta','ventas',
  'conteos_inventario_detalle','conteos_inventario','reservas_inventario','transferencias_inventario_detalle','transferencias_inventario',
  'movimientos_inventario','stock_por_almacen','lotes_inventario',
];

async function main(){
 if(!EMPRESA) throw new Error('Falta --empresa=<UUID>.');
 if(process.env.NODE_ENV==='production') throw new Error('Este comando está bloqueado en producción.');
 await AppDataSource.initialize(); const qr=AppDataSource.createQueryRunner(); await qr.connect();
 try{
  const existentes:string[]=[];
  for(const t of TABLAS){const r=await qr.query(`SELECT 1 ok FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER($1) AND column_name='empresaid' LIMIT 1`,[t]);if(r.length) existentes.push(t)}
  console.log(`Empresa: ${EMPRESA}`); console.log(`Modo: ${EJECUTAR?'EJECUCIÓN':'SIMULACIÓN'}`); console.log('Tablas:',existentes.join(', '));
  if(!EJECUTAR){console.log('No se eliminó nada. Usa --execute --confirm=ELIMINAR_OPERACIONES para ejecutar.');return}
  if(CONFIRMAR!=='ELIMINAR_OPERACIONES') throw new Error('Confirmación inválida.');
  await qr.startTransaction();
  for(const t of existentes){const r=await qr.query(`DELETE FROM "${t.toLowerCase()}" WHERE empresaId=$1`,[EMPRESA]);console.log(`Limpieza ${t}:`,r)}
  await qr.commitTransaction(); console.log('Limpieza terminada. Catálogos, usuarios, productos, clientes, proveedores y configuración se conservaron.');
 }catch(e){if(qr.isTransactionActive)await qr.rollbackTransaction();throw e}finally{await qr.release();await AppDataSource.destroy()}
}
main().catch(e=>{console.error(e);process.exit(1)});
