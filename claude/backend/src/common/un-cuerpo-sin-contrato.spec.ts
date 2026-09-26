/**
 * ============================================================================
 * Un cuerpo sin contrato no lo valida nadie
 * ----------------------------------------------------------------------------
 * `main.ts` instala un `ValidationPipe` global con `whitelist` y
 * `forbidNonWhitelisted` encendidos. Suena a que todo lo que entra está
 * revisado, y no es así: ese pipe sólo actúa cuando el parámetro está tipado
 * con una CLASE que tenga decoradores. Un tipo literal —`@Body() cuerpo:
 * { decision?: 'PROCESADO' | 'DESCARTADO' }`— es sólo TypeScript: desaparece
 * al compilar y el pipe lo deja pasar entero, sin validar y sin recortar
 * campos de más.
 *
 * Es una trampa silenciosa porque el tipo se lee como si fuera una garantía.
 * Medido el 25-sep-2026: `PATCH /integracion/avisos/:id/resolver` recibía la
 * decisión así y la derivaba con
 * `cuerpo?.decision === 'DESCARTADO' ? 'DESCARTADO' : 'PROCESADO'`. Un dedazo,
 * un cuerpo vacío o una petición sin cuerpo marcaban el aviso del espejo
 * contable como **PROCESADO**: la bandeja se vaciaba sin que nadie decidiera.
 *
 * La regla: todo `@Body()` va tipado con una clase DTO. Si un endpoint tiene
 * una razón para no hacerlo —valida a mano dentro del propio manejador, que es
 * defensa en profundidad válida— se anota aquí con su motivo.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

/**
 * Excepciones justificadas una por una. No es una lista para crecer sin
 * pensar: cada línea dice por qué ese endpoint puede prescindir del DTO.
 */
const JUSTIFICADOS: Record<string, string> = {
  'credito/controllers/cobranza.controller.ts:cancelarPago':
    'El servicio exige el motivo y su longitud mínima antes de tocar nada; la validación vive donde está la regla.',
  'integracion/controllers/alta-empresas.controller.ts:registrarReserva':
    'Endpoint de aprovisionamiento con clave de servicio; normaliza a [] y el servicio valida cada identificador.',
  'integracion/controllers/alta-empresas.controller.ts:activarIdentidad':
    'Rechaza explícitamente si falta `solicitadoPor`, antes de cualquier efecto.',
  'integracion/controllers/alta-empresas.controller.ts:suspenderIdentidad':
    'Rechaza explícitamente si falta `solicitadoPor`, antes de cualquier efecto.',
  'integracion/controllers/integracion.controller.ts:aprovisionarCuentas':
    'Acepta las banderas por cuerpo o por cadena de consulta y valida el alcance contra una lista cerrada en el propio manejador.',
};

function controladores(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'migrations' || entrada === 'node_modules') return [];
      return controladores(ruta);
    }
    return entrada.endsWith('.controller.ts') ? [ruta] : [];
  });
}

describe('todo cuerpo de petición llega con un contrato que validar', () => {
  const sinContrato: string[] = [];
  let revisados = 0;

  for (const ruta of controladores(RAIZ)) {
    const relativa = ruta.slice(RAIZ.length + 1).split('\\').join('/');
    const lineas = readFileSync(ruta, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      const cuerpo = linea.match(/@Body\(\s*\)\s*\w+\s*[?!]?\s*:\s*(.+?)[,)]\s*$/);
      if (!cuerpo) return;
      revisados++;
      const tipo = cuerpo[1].trim();
      // Una clase DTO se reconoce por el nombre; lo demás es tipo estructural.
      if (/^[A-Z]\w*(\[\])?$/.test(tipo.replace(/\s*\|\s*undefined$/, ''))) return;

      // El manejador al que pertenece: la primera firma por encima.
      let manejador = '(desconocido)';
      for (let j = i; j >= 0 && j > i - 12; j--) {
        const m = lineas[j].match(/^\s*(?:async\s+)?(\w+)\s*\(\s*$/);
        if (m && !['if', 'for', 'while', 'switch', 'catch'].includes(m[1])) {
          manejador = m[1];
          break;
        }
      }
      const clave = `${relativa}:${manejador}`;
      if (JUSTIFICADOS[clave]) return;
      sinContrato.push(`${relativa}:${i + 1} · ${manejador}() recibe «${tipo}»`);
    });
  }

  it('encuentra cuerpos que revisar', () => {
    // Si el reconocimiento se rompe, la prueba se volvería verde por vacía.
    expect(revisados).toBeGreaterThanOrEqual(100);
  });

  it('ninguno llega sin clase DTO, salvo los justificados', () => {
    expect(sinContrato.sort()).toEqual([]);
  });

  it('cada justificación sigue apuntando a un endpoint que existe', () => {
    // Una excepción que sobrevive al endpoint que la motivó es una regla que
    // dejó de aplicarse sin que nadie lo notara.
    const huerfanas = Object.keys(JUSTIFICADOS).filter((clave) => {
      const [archivo, manejador] = clave.split(':');
      const ruta = join(RAIZ, archivo);
      try {
        return !new RegExp(`\\b${manejador}\\s*\\(`).test(
          readFileSync(ruta, 'utf8'),
        );
      } catch {
        return true;
      }
    });
    expect(huerfanas).toEqual([]);
  });
});
