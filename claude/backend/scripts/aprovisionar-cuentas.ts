/**
 * ============================================================================
 * SyncroERP · Crea en el mayor externo las cuentas que faltan
 * ----------------------------------------------------------------------------
 * Usa el mismo código de cuenta en los dos lados, para que la correspondencia
 * sea evidente para cualquiera que abra los dos catálogos.
 *
 *   npm.cmd run cuentas:aprovisionar            ← sólo dice qué haría
 *   npm.cmd run cuentas:aprovisionar -- --aplicar
 *
 * Por omisión NO escribe nada. Crear cuentas en un mayor contable sin verlas
 * antes es la clase de operación de la que uno se arrepiente.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MapeoCuentasService } from '../src/integracion/services/mapeo-cuentas.service';

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const todas = process.argv.includes('--todas');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const mapeo = app.get(MapeoCuentasService);
  const dataSource = app.get(DataSource);

  const [empresa] = await dataSource.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  if (!empresa) {
    console.error('No hay ninguna empresa activa.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa: ${empresa.nombre}`);
  console.log(
    aplicar
      ? '\x1b[33mMODO APLICAR: se van a crear cuentas en el mayor externo.\x1b[0m\n'
      : 'Modo simulación. Nada se escribe. Agrega --aplicar para hacerlo de verdad.\n',
  );

  try {
    const r = await mapeo.aprovisionar(empresa.id, {
      simular: !aplicar,
      soloUsadas: !todas,
    });

    const linea = (c: Record<string, string>) =>
      `  ${String(c.codigo).padEnd(12)} ${c.nombre}${c.idExterno ? '  → id ' + c.idExterno : ''}`;

    if (r.creadas.length) {
      console.log(aplicar ? 'Creadas:' : 'Se crearían:');
      r.creadas.forEach((c) => console.log(linea(c)));
    }
    if (r.reutilizadas.length) {
      console.log('\nYa existían y sólo se mapearon:');
      r.reutilizadas.forEach((c) => console.log(linea(c)));
    }
    if (r.problemas.length) {
      console.log('\n\x1b[31mNo se pudieron resolver:\x1b[0m');
      r.problemas.forEach((c) =>
        console.log(`  ${String(c.codigo).padEnd(12)} ${c.error}`),
      );
    }
    console.log(`\nCuentas en pólizas todavía sin mapear: ${r.pendientesDespues}`);
  } catch (e) {
    console.error('\nFalló:', e instanceof Error ? e.message : e);
    await app.close();
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSe cayó:', e);
  process.exit(1);
});
