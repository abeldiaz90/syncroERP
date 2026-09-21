/**
 * Responde «¿el catálogo de códigos postales ya está cargado, y con qué?».
 *
 *   npm run cp:estatus
 *
 * Existe para no tener que abrir la base para contestar una pregunta de una
 * línea, que es justo cuando nadie la contesta.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CodigosPostalesService } from '../src/catalogo/services/codigos-postales.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const estatus = await app.get(CodigosPostalesService).estatus();
    if (!estatus.cargado) {
      console.log(
        'El catálogo de códigos postales está vacío.\n' +
          'Cárgalo con:  npm run cp:importar -- <catCFDI_V_4_*.xlsx>',
      );
      return;
    }
    console.log(
      `${estatus.codigosPostales.toLocaleString('es-MX')} códigos postales · ` +
        `${estatus.asentamientos.toLocaleString('es-MX')} asentamientos`,
    );
    console.log('\nCargas registradas:');
    for (const carga of estatus.historial) {
      console.log(
        `  ${carga.cargadoEn.toISOString().slice(0, 10)}  ${carga.fuente.padEnd(8)} ` +
          `v${carga.version}  ${carga.filas.toLocaleString('es-MX').padStart(9)} filas  ` +
          `${carga.archivo}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
