import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * El aviso que se borraba solo
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se cerró un turno de caja con un sobrante. El turno se cerró de verdad —la
 * caja desapareció de la pantalla— y no quedó ni una palabra en pantalla: ni
 * de cuánto fue la diferencia, ni de si se registró en una póliza.
 *
 * El mensaje sí existía. La pantalla hace esto:
 *
 *   setAviso({ texto, ok: true });   // aquí se escribe
 *   await cargar();                  // y aquí se borra
 *
 * porque `cargar()` empezaba con `setAviso(null)`. Los cuatro avisos de éxito
 * de la caja —abrir turno, entrada manual, retiro manual y cierre— se
 * escribían y se borraban unos milisegundos después. Ninguno se había visto
 * nunca. Lo mismo en la pantalla de cumplimiento de nómina.
 *
 * Es un defecto que sobrevive a cualquier prueba de API: la llamada devuelve
 * 200, el dato se guarda, y sólo mirando la pantalla se ve que el usuario se
 * queda sin saber qué pasó. Se encontró cerrando una caja a mano.
 *
 * LA REGLA
 *
 * Quien EMPIEZA una acción limpia el aviso anterior. Quien REFRESCA datos no
 * lo toca: refrescar es la consecuencia de la acción, no una acción nueva.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ninguna función de carga vuelva a limpiar el aviso en una pantalla donde
 * el refresco ocurre después de fijarlo.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function pantallas(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) pantallas(ruta, acumulado);
    else if (nombre.endsWith('.tsx')) acumulado.push(ruta);
  }
  return acumulado;
}

/**
 * El cuerpo de la función que empieza en `desde`, contando llaves. Recortar
 * por un número fijo de líneas —o hasta la siguiente palabra que suene a
 * final— es lo que hizo que la primera versión de esta prueba pasara con el
 * defecto delante: se quedaba con un trozo vacío y no encontraba nada.
 */
function cuerpoDeFuncion(texto: string, desde: number): string {
  const abre = texto.indexOf('{', desde);
  if (abre < 0) return '';
  let nivel = 0;
  for (let i = abre; i < texto.length; i += 1) {
    if (texto[i] === '{') nivel += 1;
    else if (texto[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return texto.slice(abre, i + 1);
    }
  }
  return texto.slice(abre);
}

const LIMPIA = /set(?:Aviso|Mensaje|Exito|Éxito|Feedback|Alerta)\w*\(\s*null\s*\)/;

describe('Pantallas · el aviso no se borra al refrescar', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const archivos = pantallas(join(FRONTEND, 'app')).map((ruta) => ({
    ruta: relative(FRONTEND, ruta).split(sep).join('/'),
    texto: readFileSync(ruta, 'utf8'),
  }));

  it('ninguna función de carga limpia el aviso que acaba de fijarse', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of archivos) {
      /*
       * Sólo importa donde el refresco ocurre DESPUÉS de fijar el aviso: ése
       * es el orden que borra el mensaje. Si la pantalla no hace eso, limpiar
       * al cargar es inofensivo.
       */
      const fijaYRefresca =
        /set(?:Aviso|Mensaje|Exito|Éxito|Feedback|Alerta)\w*\(\s*\{[\s\S]{0,200}?\}\s*\)[\s\S]{0,200}?await\s+cargar\w*\(/.test(
          texto,
        );
      if (!fijaYRefresca) continue;

      /* El cuerpo de cada función de carga, contando llaves. */
      for (const inicio of texto.matchAll(
        /(?:const|async function)\s+(cargar\w*)\b/g,
      )) {
        const cuerpo = cuerpoDeFuncion(texto, inicio.index ?? 0)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '');
        if (LIMPIA.test(cuerpo)) culpables.push(`${ruta} → ${inicio[1]}()`);
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('la caja sigue pudiendo enseñar lo que pasó con la diferencia', () => {
    /* El caso concreto que lo destapó. */
    const caja = archivos.find((a) =>
      a.ruta.endsWith('dashboard/tesoreria/caja/page.tsx'),
    );
    expect(caja).toBeDefined();
    const i = caja!.texto.indexOf('const cargar = useCallback');
    expect(i).toBeGreaterThan(-1);
    const cuerpoCargar = cuerpoDeFuncion(caja!.texto, i).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(cuerpoCargar).toContain('caja/turnos/abiertos');
    expect(LIMPIA.test(cuerpoCargar)).toBe(false);
  });
});
