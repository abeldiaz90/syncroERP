/**
 * ============================================================================
 * Un proveedor que nadie importó
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ, Y FUE MÍO
 *
 * La madrugada del 1-oct-2026 inyecté `FoliosService` en cuatro servicios para
 * quitarles la carrera del `SELECT MAX(...) + 1`. `tsc --noEmit` salió limpio.
 * Las 1,772 pruebas salieron en verde. Y **la API no arrancaba**, porque tres
 * de esos cuatro módulos no importaban el módulo que exporta ese proveedor:
 *
 *     Nest can't resolve dependencies of the CrmService (..., ?).
 *     Please make sure that the argument FoliosService at index [6] is
 *     available in the CrmModule context.
 *
 * El tipo estaba bien —de ahí el silencio de `tsc`— y la inyección también. Lo
 * que faltaba era el proveedor en el contexto del módulo, que es una decisión
 * de ensamblado y no de tipos. Abel se había ido a dormir y su servidor de
 * desarrollo, que recompila solo, se quedó caído.
 *
 * Es exactamente la misma clase de defecto que el `ordenMenu: 21.5` que ya
 * tumbó esta API una vez: algo que el compilador no puede ver y que sólo se
 * manifiesta al arrancar. Y la segunda vez ya no es mala suerte.
 *
 * ## Por qué una prueba estática y no un arranque de verdad
 *
 * Montar el grafo entero de Nest exige base de datos, y una prueba que necesita
 * Postgres no corre en cada `npm test`: se convertiría en la que se salta. Esto
 * se puede comprobar leyendo: si un servicio inyecta un proveedor que exporta
 * otro módulo, el módulo que lo declara tiene que importar ese otro módulo.
 *
 * Se vigilan los proveedores de `CommonModule` porque son los que cualquier
 * módulo acaba inyectando —folios, correo, política de crédito, secretos— y
 * porque es el camino por el que se entró esta vez.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const archivos = (dir: string, filtro: (f: string) => boolean): string[] => {
  const salida: string[] = [];
  const caminar = (d: string) => {
    for (const nombre of readdirSync(d)) {
      const completo = join(d, nombre);
      if (statSync(completo).isDirectory()) caminar(completo);
      else if (filtro(completo)) salida.push(completo);
    }
  };
  caminar(dir);
  return salida;
};

/** Lo que `CommonModule` pone a disposición de los demás. */
const exportadosPorCommon = (() => {
  const modulo = sinComentarios(
    readFileSync(join(SRC, 'common', 'modules', 'common.module.ts'), 'utf8'),
  );
  const bloque = /exports:\s*\[([^\]]*)\]/.exec(modulo);
  expect(bloque).not.toBeNull();
  return bloque![1]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
})();

describe('Lo que un módulo inyecta, su módulo lo importa', () => {
  it('`CommonModule` exporta lo que creemos que exporta', () => {
    expect(exportadosPorCommon).toContain('FoliosService');
    expect(exportadosPorCommon.length).toBeGreaterThan(2);
  });

  it('ningún servicio inyecta un proveedor que su módulo no tiene', () => {
    /*
     * ========================================================================
     * La regla. Para cada módulo: se miran los servicios que DECLARA en
     * `providers`, se busca si alguno inyecta por constructor un proveedor de
     * `CommonModule`, y si lo hace se exige que el módulo importe
     * `CommonModule`.
     *
     * El día que alguien inyecte `MailService` o `FoliosService` en un módulo
     * nuevo y se olvide del import, esto se cae aquí y no en el arranque de la
     * máquina de otro.
     * ========================================================================
     */
    const modulos = archivos(SRC, (f) => f.endsWith('.module.ts'));
    expect(modulos.length).toBeGreaterThan(10);

    const culpables: string[] = [];

    for (const rutaModulo of modulos) {
      const modulo = sinComentarios(readFileSync(rutaModulo, 'utf8'));
      if (/class CommonModule/.test(modulo)) continue;

      const declarados = /providers:\s*\[([\s\S]*?)\]/.exec(modulo);
      if (!declarados) continue;
      const nombresDeclarados = new Set(
        declarados[1]
          .split(',')
          .map((x) => x.trim())
          .filter((x) => /^[A-Z]\w+$/.test(x)),
      );
      if (!nombresDeclarados.size) continue;

      const importaCommon = /\bCommonModule\b/.test(modulo);
      if (importaCommon) continue;

      /*
       * Los servicios de ese módulo. Se buscan por nombre de clase en todo el
       * árbol: la convención de carpetas no es uniforme y atarse a ella haría
       * que la regla dejara de mirar en cuanto alguien moviera un archivo.
       */
      for (const rutaServicio of archivos(
        SRC,
        (f) => f.endsWith('.service.ts') && !f.endsWith('.spec.ts'),
      )) {
        const servicio = sinComentarios(readFileSync(rutaServicio, 'utf8'));
        const clase = /export class (\w+)/.exec(servicio)?.[1];
        if (!clase || !nombresDeclarados.has(clase)) continue;

        const constructor = servicio.slice(
          servicio.indexOf('constructor('),
          servicio.indexOf(') {}', servicio.indexOf('constructor(')) + 4,
        );
        if (!constructor) continue;

        for (const proveedor of exportadosPorCommon) {
          if (new RegExp(`:\\s*${proveedor}\\b`).test(constructor)) {
            culpables.push(
              `${rutaModulo.slice(SRC.length + 1)} declara ${clase}, que inyecta ${proveedor}, y no importa CommonModule`,
            );
          }
        }
      }
    }

    expect(culpables).toEqual([]);
  });
});
