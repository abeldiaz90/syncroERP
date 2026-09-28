import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un centinela que no es un identificador
 * ----------------------------------------------------------------------------
 * TypeORM genera SQL inválido cuando un `In([])` recibe la lista vacía, y la
 * salida fácil es meter un valor de relleno para que nunca lo esté:
 *
 *     In(cerradas.map((o) => o.id).concat(''))
 *
 * La columna es `uuid`. PostgreSQL no convierte la cadena vacía:
 *
 *     invalid input syntax for type uuid: ""
 *
 * y el filtro global lo traduce a un 400 «El identificador o alguno de los
 * valores no tiene el formato esperado», que no señala a ninguna parte.
 *
 * Lo peor es que el relleno viaja SIEMPRE, no sólo cuando la lista está
 * vacía: la consulta falla con datos y sin ellos. `GET /crm/metricas`
 * —conversión, ciclo de venta y motivos de pérdida, el reporte entero del
 * embudo— no funcionó NUNCA desde que se escribió. Se vio el 27-sep-2026
 * cerrando una oportunidad como ganada y pidiendo las métricas del mes.
 *
 * LA REGLA: una lista vacía se resuelve NO PREGUNTANDO, no inventando un
 * elemento. Si no hay ids, no hay filas que traer.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

/*
 * Rellenos que se cuelan en una lista de identificadores. La cadena vacía es
 * la que costó el reporte; los otros dos son la misma idea escrita distinto y
 * fallan igual contra una columna `uuid`.
 */
const CENTINELAS = [
  { patron: /\.concat\(\s*(['"`])\1\s*\)/, motivo: "`.concat('')` sobre una lista de ids" },
  { patron: /In\(\s*\[[^\]]*,\s*(['"`])\1\s*\]/, motivo: "un `''` dentro del `In([...])`" },
  { patron: /In\(\s*\[\s*(['"`])\1\s*,/, motivo: "un `''` al frente del `In([...])`" },
  { patron: /In\([^)]*\|\|\s*\[\s*(['"`])\1\s*\]/, motivo: "un `|| ['']` de respaldo" },
];

describe('Consultas · una lista vacía no se rellena con un centinela', () => {
  const fuentes = archivos(SRC);

  it('encuentra el árbol', () => {
    expect(fuentes.length).toBeGreaterThan(100);
  });

  it('ninguna consulta mete un valor de relleno en una lista de ids', () => {
    const culpables: string[] = [];
    for (const ruta of fuentes) {
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        /*
         * Los comentarios quedan fuera: esta misma prueba nació de un defecto
         * cuyo arreglo lo explica citando la forma mala, y acusar a la
         * explicación de ser el defecto es cómo una prueba se vuelve ruido.
         */
        const limpia = linea.trim();
        if (limpia.startsWith('*') || limpia.startsWith('//') || limpia.startsWith('/*')) {
          return;
        }
        if (!/\bIn\(/.test(linea) && !/\.concat\(/.test(linea)) return;
        for (const { patron, motivo } of CENTINELAS) {
          if (!patron.test(linea)) continue;
          culpables.push(
            `${ruta.slice(SRC.length + 1).replace(/\\/g, '/')}:${i + 1} → ${motivo}`,
          );
        }
      });
    }

    expect(culpables.sort()).toEqual([]);
  });
});
