const fs = require('fs');
const path = require('path');

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  throw new Error(
    'Uso: node scripts/generar-catalogos-anexo24.js <anexo24.txt> <salida.ts>',
  );
}

const input = fs.readFileSync(path.resolve(inputArg), 'utf8');
const lines = input.split(/\r?\n/);

function between(startText, endText) {
  const start = lines.findIndex((line) => line.includes(startText));
  const end = lines.findIndex(
    (line, index) => index > start && line.includes(endText),
  );
  if (start < 0 || end < 0) {
    throw new Error(`No se encontró la sección ${startText} → ${endText}.`);
  }
  return lines.slice(start + 1, end);
}

function isPageNoise(line) {
  const value = line.trim();
  return (
    !value ||
    value === 'Nivel   Código           Nombre de la cuenta y/o subcuenta' ||
    value === 'agrupador' ||
    value.includes('DIARIO OFICIAL') ||
    /Martes 13 de enero de 2026/.test(value)
  );
}

function parseAgrupadores() {
  const section = between(
    'Código agrupador de cuentas del SAT.',
    'B.   BALANZA DE COMPROBACIÓN',
  );
  const result = [];
  let current = null;

  for (const raw of section) {
    if (isPageNoise(raw)) continue;
    const sectorFinanciero = raw.match(/^\s*n\*\s+000\s+(.+?)\s*$/);
    if (sectorFinanciero) {
      current = {
        nivel: 0,
        codigo: '000',
        nombre: sectorFinanciero[1].trim(),
      };
      result.push(current);
      continue;
    }
    const match = raw.match(/^\s*(?:(1|2)\s+)?(\d{3}(?:\.\d{2})?)\s+(.+?)\s*$/);
    if (match) {
      current = {
        nivel: match[1] ? Number(match[1]) : 0,
        codigo: match[2],
        nombre: match[3].trim(),
      };
      result.push(current);
      continue;
    }

    // Los nombres extensos continúan en la línea siguiente dentro de la tabla.
    const continuation = raw.trim();
    if (
      current &&
      continuation &&
      !continuation.startsWith('-') &&
      !continuation.startsWith('n* =') &&
      !continuation.startsWith('contribuyente. (Ejemplo:') &&
      !continuation.startsWith('El catálogo') &&
      !continuation.startsWith('La balanza')
    ) {
      current.nombre = `${current.nombre} ${continuation}`.replace(/\s+/g, ' ');
    }
  }

  const unique = new Map(result.map((row) => [row.codigo, row]));
  return [...unique.values()].map((row) => ({
    ...row,
    codigoPadre:
      row.codigo.includes('.') && row.nivel === 2
        ? row.codigo.split('.')[0]
        : null,
  }));
}

function parseMonedas() {
  const section = between(
    'F.- Catálogo de códigos de monedas',
    'G.   CATÁLOGO DE BANCOS',
  );
  const result = [];
  for (const raw of section) {
    const match = raw.match(/^\s*([A-Z]{3})\s+(.+?)\s*$/);
    if (match) result.push({ clave: match[1], nombre: match[2] });
  }
  return [...new Map(result.map((row) => [row.clave, row])).values()];
}

function parseBancos() {
  const section = between('G.- Catálogo de bancos', 'H.   CATÁLOGO DE MÉTODOS');
  const result = [];

  for (const raw of section) {
    if (isPageNoise(raw) || raw.trim().startsWith('Clave')) continue;
    const match = raw.match(/^\s*(\d{3})\s+(.+?)(?:\s{2,}.*)?\s*$/);
    if (match) {
      // El extractor del PDF intercala algunas razones sociales antes de la
      // clave. "Nombre corto" ocupa su propia columna y es la referencia
      // estable que el ERP necesita; no anexamos líneas vecinas.
      const nombreCorto = match[2].trim();
      result.push({
        clave: match[1],
        nombre:
          match[1] === '659' ? 'OPCIONES EMPRESARIALES NOROESTE' : nombreCorto,
      });
    }
  }
  return [...new Map(result.map((row) => [row.clave, row])).values()];
}

function parseMetodosPago() {
  const start = lines.findIndex((line) =>
    line.includes('H.- Catálogo de método de pago.'),
  );
  if (start < 0) throw new Error('No se encontró el catálogo de métodos.');
  const result = [];
  for (const raw of lines.slice(start + 1)) {
    if (raw.includes('La referencia técnica')) break;
    const match = raw.match(/^\s*(\d{2})\s+(.+?)\s*$/);
    if (match) {
      result.push({
        clave: match[1],
        nombre: match[2].replace(/^"|"$/g, ''),
      });
    }
  }
  return result;
}

const agrupadores = parseAgrupadores();
const monedas = parseMonedas();
const bancos = parseBancos();
const metodos = parseMetodosPago();

if (agrupadores.length < 900) {
  throw new Error(`Catálogo agrupador incompleto: ${agrupadores.length}.`);
}
if (!agrupadores.some((row) => row.codigo === '118.01')) {
  throw new Error('Falta el código 118.01.');
}
if (!agrupadores.some((row) => row.codigo === '209.01')) {
  throw new Error('Falta el código 209.01.');
}
if (monedas.length < 150 || bancos.length < 50 || metodos.length < 15) {
  throw new Error(
    `Catálogos incompletos: monedas=${monedas.length}, bancos=${bancos.length}, métodos=${metodos.length}.`,
  );
}

const source = `/**
 * Catálogos oficiales extraídos del Anexo 24 de la RMF 2026, publicado en el
 * DOF el 13 de enero de 2026. Archivo generado; no editar manualmente.
 *
 * Fuente:
 * https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo_24_RMF2026-13012026.pdf
 */
export const SAT_ANEXO_24_2026 = {
  clave: 'MX-SAT-ANEXO24-2026-01-13',
  jurisdiccion: 'MX',
  autoridad: 'SAT',
  ejercicio: 2026,
  fechaPublicacion: '2026-01-13',
  vigenciaDesde: '2026-01-01',
  fuenteUrl:
    'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo_24_RMF2026-13012026.pdf',
  sha256:
    '689d323d0a5fe517c69abf05c246b054445febb865b2da185cbb9079bcc166e2',
} as const;

export const CODIGOS_AGRUPADORES_SAT_2026 = ${JSON.stringify(agrupadores, null, 2)} as const;

export const MONEDAS_ANEXO_24_2026 = ${JSON.stringify(monedas, null, 2)} as const;

export const BANCOS_ANEXO_24_2026 = ${JSON.stringify(bancos, null, 2)} as const;

export const METODOS_PAGO_ANEXO_24_2026 = ${JSON.stringify(metodos, null, 2)} as const;
`;

fs.writeFileSync(path.resolve(outputArg), source);
console.log(
  JSON.stringify({
    agrupadores: agrupadores.length,
    monedas: monedas.length,
    bancos: bancos.length,
    metodosPago: metodos.length,
  }),
);
