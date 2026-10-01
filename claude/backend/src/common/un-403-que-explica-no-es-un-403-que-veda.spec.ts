/**
 * ============================================================================
 * Un 403 que explica no es un 403 que veda
 * ----------------------------------------------------------------------------
 * En la pantalla de vacaciones, con la sesión de RRHH, se pulsó «Aprobar
 * nivel» sobre una solicitud capturada por esa misma persona. El servidor
 * contestó 403 con el texto exacto de la regla:
 *
 *     «Quien solicita vacaciones no puede aprobarlas.»
 *
 * La pantalla enseñó «Tu perfil no incluye esta acción. Pide acceso al
 * administrador.» El cliente HTTP tapaba el mensaje del servidor con un texto
 * fijo para TODOS los 403, y `conPermiso()` se los tragaba todos por igual.
 *
 * Las dos negativas viajan iguales por el cable y no son lo mismo:
 *   · la de la guardia dice «pide acceso»;
 *   · la de la regla dice «que lo apruebe otra persona».
 * Quien lea la primera cuando le tocaba la segunda irá a pedir un permiso que
 * ya tiene, y volverá igual de atascado.
 *
 * Esta prueba NO copia la lógica: la extrae del fuente que se despliega y la
 * ejecuta. Si alguien cambia `frontend/lib/api.ts`, cambia lo que aquí corre.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RUTA_API = join(__dirname, '..', '..', '..', 'frontend', 'lib', 'api.ts');
const fuente = readFileSync(RUTA_API, 'utf8');

/** El fuente sin comentarios: una prueba no debe medir lo que sólo se narra. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const codigo = sinComentarios(fuente);

/* ── Se extrae del fuente real lo que se va a ejecutar ──────────────────── */

function conjuntoDeGuardia(): Set<string> {
  const m = codigo.match(/const MENSAJES_DE_GUARDIA = new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('No se encontró MENSAJES_DE_GUARDIA en frontend/lib/api.ts');
  return new Function(`return new Set([${m[1]}])`)() as Set<string>;
}

function predicadoDelFuente(): (status: number, message: string) => boolean {
  const m = codigo.match(/get esNegacionDeRegla\(\) \{([\s\S]*?)\n  \}/);
  if (!m) throw new Error('No se encontró el getter esNegacionDeRegla en frontend/lib/api.ts');
  const cuerpo = m[1].replace(/this\./g, 'yo.');
  return new Function(
    'MENSAJES_DE_GUARDIA',
    `return function (status, message) { const yo = { status, message }; ${cuerpo} };`,
  )(conjuntoDeGuardia()) as (status: number, message: string) => boolean;
}

const MENSAJES_DE_GUARDIA = conjuntoDeGuardia();
const esNegacionDeRegla = predicadoDelFuente();

describe('esNegacionDeRegla · distinguir «pide acceso» de «así no se hace»', () => {
  const reglas = [
    'Quien solicita vacaciones no puede aprobarlas.',
    'Este nivel de aprobación corresponde a otro usuario o rol.',
    'Quien captura la incidencia no puede autorizarla.',
    'El monto supera tu autoridad de autorización.',
  ];

  it.each(reglas)('deja pasar la regla de negocio: %s', (mensaje) => {
    expect(esNegacionDeRegla(403, mensaje)).toBe(true);
  });

  it.each([...MENSAJES_DE_GUARDIA])('calla la negativa de la guardia: %s', (mensaje) => {
    expect(esNegacionDeRegla(403, mensaje)).toBe(false);
  });

  it('el punto final no cambia de qué negativa se trata', () => {
    expect(esNegacionDeRegla(403, 'No tienes permisos suficientes para esta acción')).toBe(false);
    expect(esNegacionDeRegla(403, 'No tienes permisos suficientes para esta acción.')).toBe(false);
    expect(esNegacionDeRegla(403, 'No tienes permisos suficientes para esta acción...')).toBe(false);
  });

  it('las mayúsculas tampoco', () => {
    expect(esNegacionDeRegla(403, 'FORBIDDEN RESOURCE')).toBe(false);
    expect(esNegacionDeRegla(403, 'Forbidden Resource')).toBe(false);
  });

  it('un 403 sin texto no inventa explicación', () => {
    expect(esNegacionDeRegla(403, '')).toBe(false);
    expect(esNegacionDeRegla(403, '   ')).toBe(false);
  });

  it('sólo aplica al 403: un 409 con el mismo texto no es esto', () => {
    expect(esNegacionDeRegla(409, 'Quien solicita vacaciones no puede aprobarlas.')).toBe(false);
    expect(esNegacionDeRegla(400, 'Quien solicita vacaciones no puede aprobarlas.')).toBe(false);
    expect(esNegacionDeRegla(0, 'Quien solicita vacaciones no puede aprobarlas.')).toBe(false);
  });

  it('la lista cubre las cuatro negativas que el backend levanta hoy', () => {
    for (const texto of [
      'No tienes permisos suficientes para esta acción',
      'No fue posible validar el permiso de esta ruta',
      'Usuario no autenticado o sin empresa asociada',
      'Esta operación es de administración y tu perfil no la incluye',
    ]) {
      expect(MENSAJES_DE_GUARDIA.has(texto.toLowerCase())).toBe(true);
    }
  });
});

describe('quien consume el 403 respeta la distinción', () => {
  it('mensajeParaPantalla sólo tapa el 403 cuando NO explica una regla', () => {
    expect(codigo).toMatch(/if \(this\.esSinPermisos && !this\.esNegacionDeRegla\)/);
  });

  it('conPermiso sólo se traga la negativa de la guardia', () => {
    expect(codigo).toMatch(
      /error instanceof ApiError && error\.esSinPermisos && !error\.esNegacionDeRegla/,
    );
  });

  it('ya no queda ningún 403 tapado sin condición', () => {
    expect(codigo).not.toMatch(/if \(this\.esSinPermisos\) \{/);
    expect(codigo).not.toMatch(/error instanceof ApiError && error\.esSinPermisos\) \{/);
  });
});
