/**
 * ============================================================================
 * Lectura del catálogo de domicilios del Anexo 20 (CFDI 4.0)
 * ----------------------------------------------------------------------------
 * El SAT publica, en un solo libro de cálculo, las cinco hojas que juntas
 * describen la geografía postal de México: `c_Estado`, `c_Municipio`,
 * `c_Localidad`, `c_CodigoPostal` y `c_Colonia`. Aquí se arman en las filas
 * que el catálogo del ERP guarda: una por asentamiento.
 *
 * Por qué esta fuente y no SEPOMEX:
 *
 *  · El aviso de uso del catálogo de SEPOMEX restringe su comercialización.
 *    Como el ERP se va a vender, esa restricción alcanza al producto entero.
 *  · Los catálogos del Anexo 20 son normativos: todo emisor de CFDI está
 *    obligado a usarlos, el SAT los publica para eso y no hay licencia que
 *    negociar. Un código postal que no esté aquí no sirve para facturar,
 *    así que además es el universo correcto.
 *  · La cobertura es equivalente: `c_Colonia` trae del orden de 145 mil
 *    asentamientos, frente a los ~144 mil de SEPOMEX.
 *
 * Lo único que se pierde es el tipo de asentamiento («Colonia», «Fracc.»,
 * «Ranchería»): el SAT no lo publica. Se guarda nulo y la interfaz ya lo
 * trataba como opcional.
 *
 * Los encabezados se buscan por nombre, no por posición. El SAT ha movido
 * columnas entre revisiones y ha metido renglones de título antes de los
 * encabezados; si un archivo nuevo no trae una columna esperada, este lector
 * dice cuál falta y qué encabezados sí encontró, en lugar de leer basura.
 * ============================================================================
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { FilaCodigoPostal } from '../services/codigos-postales.service';

/** Sin acentos, sin dobles espacios, en mayúsculas. */
function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Las celdas del libro del SAT llegan como texto, como número o como fórmula
 * ya evaluada. Las claves («001», «09») son texto con ceros a la izquierda,
 * pero Excel las devuelve como número en cuanto alguien abre y guarda el
 * archivo. Por eso todo se convierte a texto aquí y el relleno de ceros se
 * decide después, según el campo.
 */
function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    const obj = valor as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => t.text).join('').trim();
    if (obj.result !== undefined) return texto(obj.result);
    if (obj.text !== undefined) return texto(obj.text);
    return '';
  }
  return String(valor).trim();
}

export class ErrorCatalogoSat extends Error {}

interface Hoja {
  nombre: string;
  encabezados: string[];
  filas: string[][];
}

/**
 * Encuentra la hoja cuyo nombre coincide con el buscado (sin acentos ni
 * mayúsculas) y, dentro de ella, el renglón de encabezados: el primero de los
 * diez primeros que contenga la columna llave.
 */
function abrirHoja(libro: Workbook, nombre: string, columnaLlave: string): Hoja {
  const buscado = normalizar(nombre);
  let hoja: Worksheet | undefined;
  libro.eachSheet((h) => {
    if (!hoja && normalizar(h.name) === buscado) hoja = h;
  });
  if (!hoja) {
    const disponibles: string[] = [];
    libro.eachSheet((h) => disponibles.push(h.name));
    throw new ErrorCatalogoSat(
      `El archivo no trae la hoja «${nombre}». Hojas encontradas: ${disponibles.join(', ') || '(ninguna)'}. ` +
        'Verifica que sea el libro de catálogos del CFDI 4.0 (catCFDI_V_4_*.xlsx) y no otro anexo.',
    );
  }

  const llave = normalizar(columnaLlave);
  const crudas: string[][] = [];
  hoja.eachRow((fila) => {
    const valores = fila.values as unknown[];
    // exceljs deja vacía la posición 0; la columna 1 vive en el índice 1.
    crudas.push(valores.slice(1).map((v) => texto(v)));
  });

  const iEncabezado = crudas
    .slice(0, 10)
    .findIndex((f) => f.some((c) => normalizar(c) === llave));
  if (iEncabezado < 0) {
    throw new ErrorCatalogoSat(
      `La hoja «${nombre}» no trae la columna «${columnaLlave}» en sus primeros diez renglones. ` +
        `Primer renglón leído: ${(crudas[0] ?? []).join(' | ') || '(vacío)'}`,
    );
  }

  return {
    nombre,
    encabezados: crudas[iEncabezado].map((c) => normalizar(c)),
    filas: crudas.slice(iEncabezado + 1),
  };
}

/** Índice de una columna por su encabezado; falla diciendo qué sí había. */
function columna(hoja: Hoja, ...nombres: string[]): number {
  for (const nombre of nombres) {
    const i = hoja.encabezados.indexOf(normalizar(nombre));
    if (i >= 0) return i;
  }
  throw new ErrorCatalogoSat(
    `La hoja «${hoja.nombre}» no trae la columna «${nombres[0]}». ` +
      `Encabezados encontrados: ${hoja.encabezados.filter(Boolean).join(' | ')}`,
  );
}

/** Diccionario clave → descripción de las hojas que sólo son eso. */
function diccionario(
  hoja: Hoja,
  iClave: number,
  iDescripcion: number,
  iEstado?: number,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const fila of hoja.filas) {
    const clave = (fila[iClave] ?? '').trim();
    if (!clave) continue;
    const descripcion = (fila[iDescripcion] ?? '').trim();
    if (!descripcion) continue;
    const llave =
      iEstado === undefined ? clave : `${(fila[iEstado] ?? '').trim()}|${clave}`;
    if (!mapa.has(llave)) mapa.set(llave, descripcion);
  }
  return mapa;
}

export interface LecturaSat {
  filas: FilaCodigoPostal[];
  /** Códigos postales que existen en `c_CodigoPostal` y no tienen colonia. */
  codigosSinColonia: number;
  /** Colonias cuyo código postal no aparece en `c_CodigoPostal`. */
  coloniasHuerfanas: number;
  codigosPostales: number;
}

/**
 * Arma el catálogo a partir del libro ya abierto.
 *
 * Un código postal sin colonias en `c_Colonia` igual entra, con la colonia en
 * blanco. Parece raro y es deliberado: ese renglón es lo que permite que al
 * teclear el código postal el formulario siga deduciendo estado y municipio.
 * La consulta filtra las colonias en blanco antes de ofrecer la lista, así que
 * el usuario nunca ve una opción vacía; simplemente escribe su colonia.
 */
export function leerCatalogoSat(libro: Workbook): LecturaSat {
  const hEstado = abrirHoja(libro, 'c_Estado', 'c_Estado');
  const hMunicipio = abrirHoja(libro, 'c_Municipio', 'c_Municipio');
  const hCodigo = abrirHoja(libro, 'c_CodigoPostal', 'c_CodigoPostal');
  const hColonia = abrirHoja(libro, 'c_Colonia', 'c_Colonia');

  // La localidad es opcional: no todas las revisiones del anexo la publican.
  let localidades = new Map<string, string>();
  try {
    const hLocalidad = abrirHoja(libro, 'c_Localidad', 'c_Localidad');
    localidades = diccionario(
      hLocalidad,
      columna(hLocalidad, 'c_Localidad'),
      columna(hLocalidad, 'Descripción', 'Descripcion'),
      columna(hLocalidad, 'c_Estado'),
    );
  } catch {
    localidades = new Map();
  }

  const estados = diccionario(
    hEstado,
    columna(hEstado, 'c_Estado'),
    columna(hEstado, 'Descripción', 'Descripcion'),
  );
  const municipios = diccionario(
    hMunicipio,
    columna(hMunicipio, 'c_Municipio'),
    columna(hMunicipio, 'Descripción', 'Descripcion'),
    columna(hMunicipio, 'c_Estado'),
  );

  const iCp = columna(hCodigo, 'c_CodigoPostal');
  const iCpEstado = columna(hCodigo, 'c_Estado');
  const iCpMunicipio = columna(hCodigo, 'c_Municipio');
  let iCpLocalidad = -1;
  try {
    iCpLocalidad = columna(hCodigo, 'c_Localidad');
  } catch {
    iCpLocalidad = -1;
  }

  interface Geografia {
    estadoClave: string;
    estadoNombre: string;
    municipioClave: string | null;
    municipioNombre: string;
    ciudad: string | null;
  }
  const geografia = new Map<string, Geografia>();

  for (const fila of hCodigo.filas) {
    const cp = (fila[iCp] ?? '').trim().padStart(5, '0');
    if (!/^\d{5}$/.test(cp)) continue;
    if (geografia.has(cp)) continue;

    const estadoClave = (fila[iCpEstado] ?? '').trim();
    const municipioClave = (fila[iCpMunicipio] ?? '').trim();
    const localidadClave = iCpLocalidad >= 0 ? (fila[iCpLocalidad] ?? '').trim() : '';

    geografia.set(cp, {
      estadoClave,
      estadoNombre: estados.get(estadoClave) ?? estadoClave,
      municipioClave: municipioClave || null,
      municipioNombre:
        municipios.get(`${estadoClave}|${municipioClave}`) ?? municipioClave,
      ciudad: localidadClave
        ? (localidades.get(`${estadoClave}|${localidadClave}`) ?? null)
        : null,
    });
  }

  if (geografia.size === 0) {
    throw new ErrorCatalogoSat(
      'La hoja «c_CodigoPostal» no trajo ningún código postal de cinco dígitos. ' +
        'Es el síntoma típico de un archivo truncado o de una hoja filtrada.',
    );
  }

  const iColonia = columna(hColonia, 'Nombre del asentamiento', 'Descripción', 'Descripcion');
  const iColoniaCp = columna(hColonia, 'c_CodigoPostal');

  const filas: FilaCodigoPostal[] = [];
  const conColonia = new Set<string>();
  let coloniasHuerfanas = 0;

  for (const fila of hColonia.filas) {
    const cp = (fila[iColoniaCp] ?? '').trim().padStart(5, '0');
    if (!/^\d{5}$/.test(cp)) continue;
    const colonia = (fila[iColonia] ?? '').trim();
    if (!colonia) continue;

    const geo = geografia.get(cp);
    if (!geo) {
      coloniasHuerfanas += 1;
      continue;
    }
    conColonia.add(cp);
    filas.push({ cp, colonia, tipoAsentamiento: null, ...geo });
  }

  let codigosSinColonia = 0;
  for (const [cp, geo] of geografia) {
    if (conColonia.has(cp)) continue;
    codigosSinColonia += 1;
    filas.push({ cp, colonia: '', tipoAsentamiento: null, ...geo });
  }

  return {
    filas,
    codigosSinColonia,
    coloniasHuerfanas,
    codigosPostales: geografia.size,
  };
}

/**
 * El SAT publica el libro con extensión `.xls`. A veces es realmente un `.xlsx`
 * renombrado y se abre sin más; a veces es el formato binario viejo, que
 * ninguna biblioteca de JavaScript lee de forma confiable. Distinguirlo por los
 * primeros bytes evita el error incomprensible de la biblioteca y permite decir
 * qué hacer: abrirlo en Excel y guardarlo como `.xlsx`, una sola vez.
 */
export function verificarFormato(crudo: Buffer): void {
  const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
  if (crudo.subarray(0, 4).equals(ole2)) {
    throw new ErrorCatalogoSat(
      'Ese archivo está en el formato binario viejo de Excel (.xls real), que no se puede leer aquí. ' +
        'Ábrelo en Excel y guárdalo como «Libro de Excel (*.xlsx)»; después vuelve a correr el comando con el archivo nuevo.',
    );
  }
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (!crudo.subarray(0, 4).equals(zip)) {
    throw new ErrorCatalogoSat(
      'Ese archivo no es un libro de Excel moderno (.xlsx). Verifica que la descarga haya terminado y no sea una página de error.',
    );
  }
}
