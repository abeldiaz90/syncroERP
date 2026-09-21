/**
 * ============================================================================
 * Carga del catálogo de códigos postales
 * ----------------------------------------------------------------------------
 *   npm run cp:importar -- <catCFDI_V_4_*.xlsx> [--version 2026-09]
 *                          [--forzar] [--sustituir]
 *
 *   npm run cp:importar -- --sepomex <CPdescarga.txt> [...]   (ver abajo)
 *
 * Se corre una vez, al implantar. Volver a correrlo con el mismo archivo no
 * hace nada y lo dice: la huella sha256 del archivo es lo que decide, no la
 * memoria de quien lo ejecuta. Para actualizar basta con descargar el archivo
 * nuevo y volver a correrlo.
 *
 * ── De dónde sale el archivo ────────────────────────────────────────────────
 *
 * La fuente es el libro de catálogos del CFDI 4.0 que publica el SAT
 * (`catCFDI_V_4_*.xls`), en el portal de factura electrónica. De sus hojas se
 * usan cinco: `c_Estado`, `c_Municipio`, `c_Localidad`, `c_CodigoPostal` y
 * `c_Colonia`. Juntas dan lo mismo que daba SEPOMEX —colonia, municipio,
 * ciudad y estado por código postal— salvo el tipo de asentamiento, que el
 * SAT no publica.
 *
 * El SAT lo sirve con extensión `.xls`. Si resulta ser el formato binario
 * viejo, el script lo detecta y pide abrirlo en Excel y guardarlo como
 * `.xlsx`; es un paso de una sola vez.
 *
 * ── Por qué ya no SEPOMEX ───────────────────────────────────────────────────
 *
 * El catálogo de SEPOMEX es mejor en un detalle (trae el tipo de
 * asentamiento) y peor en el que importa: su aviso de uso restringe la
 * comercialización, y este ERP se vende. Los catálogos del Anexo 20, en
 * cambio, son normativos —todo emisor de CFDI está obligado a usarlos— y el
 * SAT los publica para ser usados, sin licencia que negociar. Además acotan
 * el catálogo al universo correcto: un código postal que no está ahí no sirve
 * para facturar, así que tampoco debería poder capturarse como domicilio
 * fiscal.
 *
 * El lector de SEPOMEX se conserva, detrás de `--sepomex`, para quien tenga
 * resuelta esa licencia. No es la ruta por omisión a propósito.
 *
 * ── Una sola fuente a la vez ────────────────────────────────────────────────
 *
 * El catálogo no mezcla fuentes: el índice único es (código postal, colonia)
 * y no distingue procedencia. Cargar una fuente sobre otra exige `--sustituir`
 * y borra la anterior por completo. Sin esa bandera, el comando se detiene y
 * explica por qué, en lugar de reventar a media carga.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import {
  CodigosPostalesService,
  FilaCodigoPostal,
} from '../src/catalogo/services/codigos-postales.service';
import { FuenteCodigoPostal } from '../src/catalogo/entities/codigo-postal.entity';
import {
  ErrorCatalogoSat,
  LecturaSat,
  leerCatalogoSat,
  verificarFormato,
} from '../src/catalogo/utils/sat-anexo20';

interface Argumentos {
  archivo: string;
  fuente: FuenteCodigoPostal;
  version: string;
  forzar: boolean;
  sustituir: boolean;
}

function leerArgumentos(): Argumentos {
  const argv = process.argv.slice(2);
  const valorDe = (bandera: string) => {
    const i = argv.indexOf(bandera);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const banderas = new Set(['--version', '--sepomex', '--sat']);
  const suelto = argv.find(
    (a, i) => !a.startsWith('--') && !banderas.has(argv[i - 1] ?? ''),
  );

  const sepomex = valorDe('--sepomex');
  const archivo = sepomex ?? valorDe('--sat') ?? suelto;
  if (!archivo) {
    throw new Error(
      'Uso: npm run cp:importar -- <catCFDI_V_4_*.xlsx> [--version 2026-09] [--forzar] [--sustituir]\n' +
        '     npm run cp:importar -- --sepomex <CPdescarga.txt> [...]',
    );
  }

  const hoy = new Date();
  return {
    archivo: resolve(archivo),
    fuente: sepomex ? FuenteCodigoPostal.SEPOMEX : FuenteCodigoPostal.SAT,
    version:
      valorDe('--version') ??
      `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`,
    forzar: argv.includes('--forzar'),
    sustituir: argv.includes('--sustituir'),
  };
}

/**
 * El archivo de SEPOMEX viene en Latin-1, separado por barras verticales, con
 * dos renglones de encabezado antes de los datos. Leerlo como UTF-8 convierte
 * cada acento en un rombo y el catálogo entero queda con «Michoacn».
 */
function leerSepomex(ruta: string): {
  filas: FilaCodigoPostal[];
  sha256: string;
} {
  const crudo = readFileSync(ruta);
  const sha256 = createHash('sha256').update(crudo).digest('hex');
  const texto = new TextDecoder('windows-1252').decode(crudo);
  const lineas = texto.split(/\r?\n/);

  const iEncabezado = lineas.findIndex((l) => l.startsWith('d_codigo|'));
  if (iEncabezado < 0) {
    throw new Error(
      'Ese archivo no parece el catálogo de SEPOMEX: no trae el renglón de encabezados «d_codigo|…».',
    );
  }
  const columnas = lineas[iEncabezado].split('|').map((c) => c.trim());
  const idx = (nombre: string) => columnas.indexOf(nombre);

  const iCp = idx('d_codigo');
  const iColonia = idx('d_asenta');
  const iTipo = idx('d_tipo_asenta');
  const iMunicipio = idx('D_mnpio');
  const iEstado = idx('d_estado');
  const iCiudad = idx('d_ciudad');
  const iEstadoClave = idx('c_estado');
  const iMunicipioClave = idx('c_mnpio');

  if (iCp < 0 || iColonia < 0 || iMunicipio < 0 || iEstado < 0) {
    throw new Error(
      'El encabezado de SEPOMEX no trae las columnas esperadas (d_codigo, d_asenta, D_mnpio, d_estado).',
    );
  }

  const filas: FilaCodigoPostal[] = [];
  for (const linea of lineas.slice(iEncabezado + 1)) {
    if (!linea.trim()) continue;
    const c = linea.split('|');
    const cp = (c[iCp] ?? '').trim();
    if (!/^\d{4,5}$/.test(cp)) continue;
    filas.push({
      cp: cp.padStart(5, '0'),
      estadoClave: (c[iEstadoClave] ?? '').trim(),
      estadoNombre: (c[iEstado] ?? '').trim(),
      municipioClave: (c[iMunicipioClave] ?? '').trim() || null,
      municipioNombre: (c[iMunicipio] ?? '').trim(),
      ciudad: (c[iCiudad] ?? '').trim() || null,
      colonia: (c[iColonia] ?? '').trim(),
      tipoAsentamiento: (c[iTipo] ?? '').trim() || null,
    });
  }
  return { filas, sha256 };
}

/**
 * Abre el libro del SAT y lo convierte en filas del catálogo. La huella se
 * calcula sobre los bytes del archivo, no sobre las filas: es lo que permite
 * reconocer que ya se cargó ese mismo archivo aunque el lector cambie.
 */
async function leerSat(
  ruta: string,
): Promise<{ lectura: LecturaSat; sha256: string }> {
  const crudo = readFileSync(ruta);
  verificarFormato(crudo);
  const sha256 = createHash('sha256').update(crudo).digest('hex');

  const ExcelJS = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(crudo as unknown as ArrayBuffer);
  return { lectura: leerCatalogoSat(libro), sha256 };
}

async function main() {
  const args = leerArgumentos();
  const esSat = args.fuente === FuenteCodigoPostal.SAT;

  console.log(`Leyendo ${args.fuente}: ${args.archivo}`);

  let filas: FilaCodigoPostal[];
  let sha256: string;
  let detalle = '';

  if (esSat) {
    const { lectura, sha256: huella } = await leerSat(args.archivo);
    filas = lectura.filas;
    sha256 = huella;
    detalle =
      `  ${lectura.codigosPostales.toLocaleString('es-MX')} códigos postales · ` +
      `${(filas.length - lectura.codigosSinColonia).toLocaleString('es-MX')} asentamientos`;
    if (lectura.codigosSinColonia) {
      detalle +=
        `\n  ${lectura.codigosSinColonia.toLocaleString('es-MX')} códigos sin colonia publicada: ` +
        'se guardan igual para deducir estado y municipio, y la colonia se escribe a mano.';
    }
    if (lectura.coloniasHuerfanas) {
      detalle +=
        `\n  ${lectura.coloniasHuerfanas.toLocaleString('es-MX')} colonias con un código postal que no está en c_CodigoPostal: se descartan.`;
    }
  } else {
    console.log(
      '  Atención: el aviso de uso de SEPOMEX restringe la comercialización del catálogo.\n' +
        '  Úsalo sólo si esa licencia está resuelta para esta instalación.',
    );
    const leido = leerSepomex(args.archivo);
    filas = leido.filas;
    sha256 = leido.sha256;
    detalle = `  ${filas.length.toLocaleString('es-MX')} asentamientos`;
  }

  console.log(`${detalle} · huella ${sha256.slice(0, 12)}…`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const servicio = app.get(CodigosPostalesService);
    const resultado = await servicio.importar(
      filas,
      {
        fuente: args.fuente,
        archivo: basename(args.archivo),
        sha256,
        version: args.version,
        cargadoPor: 'importar-codigos-postales',
        notas: esSat ? 'Anexo 20 · catálogos del CFDI 4.0' : null,
      },
      { forzar: args.forzar, exclusiva: args.sustituir },
    );

    console.log(
      resultado.aplicada
        ? `✔ ${resultado.filas.toLocaleString('es-MX')} renglones cargados desde ${resultado.fuente} (versión ${resultado.version}).`
        : `· Sin cambios: ${resultado.motivo}`,
    );

    const estatus = await servicio.estatus();
    console.log(
      `\nCatálogo vigente: ${estatus.codigosPostales.toLocaleString('es-MX')} códigos postales, ` +
        `${estatus.asentamientos.toLocaleString('es-MX')} renglones.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  if (error instanceof ErrorCatalogoSat) {
    console.error(`\n✖ ${error.message}`);
    process.exit(1);
  }
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
