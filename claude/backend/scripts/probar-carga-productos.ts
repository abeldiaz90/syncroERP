/**
 * ============================================================================
 * SyncroERP · Probar la carga masiva de productos con un archivo real
 * ----------------------------------------------------------------------------
 * Llama al MISMO servicio que usa el controlador (`ImportacionProductosService`),
 * con el mismo Excel que se va a subir por la pantalla. No sustituye a la
 * prueba por interfaz —esa además ejercita la guarda HTTP y el selector de
 * archivos— pero contesta hoy la pregunta que importa: ¿los datos entran?
 *
 * Por omisión SÓLO VALIDA: no escribe nada.
 *
 *   npx ts-node -T scripts/probar-carga-productos.ts --empresa=<UUID> --archivo=<ruta>
 *   ... --aplicar
 * ============================================================================
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ImportacionProductosService } from '../src/catalogo/services/importacion-productos.service';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const EMPRESA = arg('empresa');
const ARCHIVO = arg('archivo');
const APLICAR = process.argv.includes('--aplicar');
const t = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);

async function main() {
  if (!EMPRESA) throw new Error('Falta --empresa=<UUID>.');
  if (!ARCHIVO) throw new Error('Falta --archivo=<ruta al .xlsx>.');

  const buffer = readFileSync(ARCHIVO);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const servicio = app.get(ImportacionProductosService);

  t(`CARGA · ${APLICAR ? '\x1b[31mAPLICAR\x1b[0m' : 'sólo validar'}`);
  nota(`${ARCHIVO} · ${buffer.length} bytes`);

  const r: any = await servicio.procesar(buffer, EMPRESA, APLICAR ? 'aplicar' : 'validar');

  t('RESUMEN');
  console.log(
    `  filas leídas: ${r.totalFilas ?? '?'} · creados: ${r.creados ?? 0} · ` +
      `actualizados: ${r.actualizados ?? 0} · errores: ${r.errores?.length ?? 0} · ` +
      `advertencias: ${r.advertencias?.length ?? 0}`,
  );

  if (r.errores?.length) {
    t('ERRORES · estas filas NO entran');
    console.table(r.errores);
  }
  if (r.advertencias?.length) {
    t('ADVERTENCIAS · entran, pero conviene mirarlas');
    console.table(r.advertencias);
  }
  if (!r.errores?.length && !r.advertencias?.length) {
    t('Sin errores ni advertencias');
  }
  await app.close();
}
main().catch((e) => { console.error(`\n\x1b[31m${e?.message ?? e}\x1b[0m`); process.exit(1); });
