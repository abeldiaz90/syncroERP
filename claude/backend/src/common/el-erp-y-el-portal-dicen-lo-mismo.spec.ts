import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * EL ERP Y EL PORTAL LE DICEN LO MISMO A LA MISMA PERSONA
 * ----------------------------------------------------------------------------
 * DE DÓNDE SALE
 *
 * Del 6-oct-2026, mirando las dos pantallas a la vez. El portal de Fineract
 * llamaba «maker-checker» a lo que el ERP llama «Bandeja central de
 * aprobaciones», y «tenant» a lo que el ERP llamaba, según dónde, «inquilino» o
 * «libro». Quien aprueba una línea de crédito en el ERP por la mañana y
 * autoriza un desembolso en el portal por la tarde está haciendo lo mismo, y
 * tenía que aprender dos vocabularios para saberlo.
 *
 * El portal se corrigió entero —65 textos— y su propio trinquete está en
 * `pruebas/la-pantalla-habla-el-idioma-de-quien-la-usa.test.ts`. Esto es el
 * lado del ERP.
 *
 * LO QUE SE ENCONTRÓ AQUÍ
 *
 * Poco, y era de esperar: el ERP se escribió en español desde el principio.
 * Tres textos visibles con una palabra que no significa nada para quien la lee:
 *
 *  · «Endpoint» como rótulo en el detalle de auditoría — quien audita quiere
 *    saber qué ruta se llamó, y «Ruta» lo dice;
 *  · «Dashboard Ejecutivo» en el menú de reportes;
 *  · «El backend descontará…» en la solicitud de vacaciones, dicho al empleado
 *    que la está capturando.
 *
 * POR QUÉ LA LISTA ES CORTA Y NO LARGA
 *
 * La tentación es meter todo el inglés que a uno se le ocurra. No sirve: en
 * español se escriben igual «error», «balance», «total», «normal» o «status
 * quo», y un trinquete que grita en falso lo primero que provoca es que alguien
 * lo borre. Aquí sólo van palabras que **no existen en español** y que vienen
 * una por una del vocabulario del core. Si mañana entra otra, se agrega.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** Palabras del core que no existen en español. Nada ambiguo entra aquí. */
const DEL_CORE = [
  'tenant',
  'endpoint',
  'backend',
  'frontend',
  'dashboard',
  'workspace',
  'maker-checker',
  'checker',
  'teller',
  'cashier',
  'staff',
  'savings',
  'loan officer',
];

const JERGA = new RegExp(
  `(?<![a-zá-úñ])(${DEL_CORE.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-zá-úñ])`,
  'i',
);

/*
 * El `>` de apertura no puede venir detrás de un `=`: entre el `>` de una
 * flecha y el `<` de una comparación cabe código que no pinta nada. El mismo
 * cuidado que en `un-boton-que-no-dice-que-hace.spec.ts`.
 */
const ENTRE_ETIQUETAS = /(?<!=)>([^<>\n]{3,300})</g;
const ATRIBUTOS = /\b(?:placeholder|title|aria-label|label|alt)\s*=\s*"([^"]{2,160})"/g;
const ROTULOS =
  /(?:titulo|label|etiqueta|desc|descripcion|detalle|mensaje|texto)\s*:\s*'([^']{3,200})'/g;

/**
 * Lo que un archivo pinta en pantalla, sin las expresiones.
 *
 * Las llaves se quitan de dentro hacia fuera porque se anidan: una sola pasada
 * deja la de fuera entera, con el nombre de la variable dentro —que nadie ve y
 * el detector sí—.
 */
function visiblesDe(s: string): Array<[string, number]> {
  const visibles: Array<[string, number]> = [];
  for (const re of [ENTRE_ETIQUETAS, ATRIBUTOS, ROTULOS]) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      let texto = m[1];
      for (let antes = ''; antes !== texto; ) {
        antes = texto;
        texto = texto.replace(/\{[^{}]*\}/g, ' ');
      }
      visibles.push([texto, s.slice(0, m.index).split('\n').length]);
    }
  }
  return visibles;
}

/** `.ts` también: el menú entero vive en `app/dashboard/module-config.ts`. */
function archivos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (nombre.endsWith('.tsx') || nombre.endsWith('.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

function fuera(): string[] {
  const lista: string[] = [];
  for (const ruta of archivos(join(FRONTEND!, 'app'))) {
    const s = readFileSync(ruta, 'utf8');
    for (const [crudo, linea] of visiblesDe(s)) {
      const texto = crudo.trim();
      if (texto && JERGA.test(texto)) {
        lista.push(`${ruta.replace(FRONTEND!, '')}:${linea}  ${texto.slice(0, 90)}`);
      }
    }
  }
  return lista;
}

describe('ninguna pantalla del ERP le habla al usuario en el idioma del core', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    /*
     * Una prueba que no encuentra qué medir y se declara satisfecha es una luz
     * verde sin nada detrás. Esto ya costó tres commits escritos en el árbol
     * congelado.
     */
    expect(FRONTEND).toBeDefined();
  });

  it('el detector encuentra la jerga cuando la hay', () => {
    /*
     * La prueba de la prueba, con los tres textos exactos que tenía el ERP
     * antes del arreglo.
     */
    expect(JERGA.test('Endpoint')).toBe(true);
    expect(JERGA.test('Dashboard Ejecutivo')).toBe(true);
    expect(JERGA.test('El backend descontará exclusivamente los días laborables')).toBe(
      true,
    );
    /* Y no se dispara con lo que sí es español. */
    expect(JERGA.test('Balance general')).toBe(false);
    expect(JERGA.test('Error de conteo (Negativo)')).toBe(false);
  });

  it('mira las tres formas en que una pantalla pinta texto', () => {
    const muestra = [
      '<p>uno del tenant</p>',
      '<input aria-label="dos del maker-checker" />',
      "{ titulo: 'tres del dashboard' }",
    ].join('\n');
    expect(
      visiblesDe(muestra)
        .map(([t]) => t.trim())
        .filter((t) => JERGA.test(t)),
    ).toHaveLength(3);
  });

  it('y no confunde una flecha de función con una etiqueta', () => {
    /*
     * `x.filter(staff => n(staff.id) < 0)` encaja de maravilla entre un `>` y
     * un `<`. Contarlo llenaría la lista de nombres de variables, y la primera
     * reacción de quien se encuentre esa lista será quitar la prueba.
     */
    expect(visiblesDe('empleados.filter(staff => valor(staff.id) < 0)')).toEqual([]);
  });

  it('y mira los `.ts`, no sólo los componentes', () => {
    /*
     * ESTO LO DESTAPÓ UN MUTANTE QUE SOBREVIVIÓ: recortar el barrido a `.tsx`
     * no rompía nada, porque hoy ningún `.ts` del ERP tiene jerga. Pero el menú
     * entero —el texto que más gente ve, todos los días— vive en
     * `module-config.ts`, y en el portal este mismo recorte dejaba fuera el
     * subtítulo de la pantalla de inicio de sesión.
     *
     * Que hoy esté limpio es la razón para atarlo, no para no mirarlo.
     */
    const todos = archivos(join(FRONTEND!, 'app'));
    expect(todos.some((r) => r.endsWith('module-config.ts'))).toBe(true);
    expect(todos.filter((r) => r.endsWith('.ts')).length).toBeGreaterThan(1);
  });

  it('ni una sola en todo el ERP', () => {
    expect(fuera()).toEqual([]);
  });
});

describe('y los tres textos dicen ahora lo que pasa', () => {
  const leer = (relativa: string) => readFileSync(join(FRONTEND!, relativa), 'utf8');

  it('la auditoría dice qué ruta se llamó', () => {
    expect(leer('app/dashboard/auditoria/page.tsx')).toContain(
      '<Campo label="Ruta" valor={detalle.endpoint} mono />',
    );
  });

  it('el menú de reportes dice «Tablero ejecutivo»', () => {
    expect(leer('app/dashboard/reportes/page.tsx')).toContain(
      "titulo:  'Tablero ejecutivo',",
    );
  });

  it('y la solicitud de vacaciones le habla al empleado, no al programador', () => {
    /*
     * Lo lee quien está pidiendo sus días. «El backend» no le dice nada sobre
     * si le van a descontar el sábado.
     */
    const vacaciones = leer('app/dashboard/rrhh/vacaciones/page.tsx');
    expect(vacaciones).toContain(
      'El sistema descontará exclusivamente los días laborables',
    );
    expect(vacaciones).not.toContain('El backend descontará');
  });
});
