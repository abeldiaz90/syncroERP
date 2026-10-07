import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SE LEE EL ÁRBOL, NO EL TEXTO — 7-oct-2026
 * --------------------------------------------------------------------------
 * Esto buscaba el texto visible con tres expresiones regulares. Una de ellas,
 * la de entre etiquetas, era `/(?<!=)>([^<>\n]{3,300})</g`: **no cruzaba
 * saltos de línea**. Y un párrafo largo en JSX se escribe así:
 *
 *     …riesgo <strong>{nivel}</strong> y política de vencidos se enviará al
 *     flujo maker-checker. Una línea ya autorizada seguirá vigente…
 *     </div>
 *
 * El cierre está en la línea siguiente, así que el trozo no encajaba y el
 * detector no veía nada. La prueba llevaba en verde con «maker-checker» en la
 * pantalla de clientes —el mismo texto que el portal corrigió entero— y con
 * «el backend impedirá guardar» en la de configuraciones de aprobación.
 *
 * Es la avería que este proyecto persigue, aplicada a su propio control: algo
 * que se cree puesto y no está. Y no era del idioma: era de intentar entender
 * TSX con expresiones regulares. El portal ya lo había aprendido —cuatro
 * agujeros seguidos— y acabó leyendo el árbol de sintaxis. Aquí se hace lo
 * mismo, con el TypeScript que ya compila el proyecto.
 *
 * Un `JsxText` es texto que se pinta; una expresión no lo es. Sin heurísticas.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Atributos que se pintan o los lee la tecnología de apoyo. */
const ATRIBUTOS_VISIBLES = new Set(['placeholder', 'title', 'aria-label', 'label', 'alt']);

/** Propiedades que alimentan rótulos: menús, diálogos, tiras de indicadores. */
const ROTULOS = new Set([
  /*
   * `pie` se añadió el 7-oct: la pantalla de clientes tiene cuatro recuadros de
   * situación cuyo pie decía «esperan maker-checker», y la propiedad no estaba
   * en esta lista, así que el detector pasaba de largo. Lo cazó una prueba de
   * fuerza bruta —`not.toContain`— sobre ese archivo, no el barrido. Una lista
   * de nombres de propiedad siempre se queda corta; por eso el barrido mira
   * además el texto entre etiquetas, que es donde vive casi todo.
   */
  'pie',
  'subtitulo',
  'leyenda',
  'titulo',
  'title',
  'label',
  'etiqueta',
  'desc',
  'descripcion',
  'description',
  'detalle',
  'mensaje',
  'texto',
  'placeholder',
  'ayuda',
  'nota',
]);

/**
 * Lo que un archivo pinta en pantalla, con su línea.
 *
 * Se saca aparte porque es la pieza que un mutante puede vaciar sin que nada se
 * ponga rojo: dejar de mirar los atributos esconde los `aria-label` y la prueba
 * sigue verde con la jerga delante. Por eso se mide por su cuenta más abajo.
 */
export function visiblesDe(fuente: string, nombre = 'x.tsx'): Array<[string, number]> {
  const sf = ts.createSourceFile(nombre, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visibles: Array<[string, number]> = [];
  const vistos = new Set<number>();
  const anotar = (texto: string, nodo: ts.Node) => {
    if (vistos.has(nodo.getStart(sf))) return;
    vistos.add(nodo.getStart(sf));
    const limpio = texto.replace(/\s+/g, ' ').trim();
    if (!limpio) return;
    /*
     * Una cadena sin espacios y con `/`, `?`, `=` o `#` es una ruta o una
     * clave, no una frase. `/dashboard/clientes/` no se le dice a nadie.
     */
    if (!/\s/.test(limpio) && /[/?=#]/.test(limpio)) return;
    visibles.push([limpio, sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1]);
  };
  const enPosicionDeValor = (m: ts.Node): void => {
    if (ts.isParenthesizedExpression(m)) return enPosicionDeValor(m.expression);
    if (ts.isStringLiteral(m) || ts.isNoSubstitutionTemplateLiteral(m)) {
      anotar(m.text, m);
      return;
    }
    // Una plantilla con huecos —`Cliente ${id}`— es la forma normal de un rótulo.
    if (ts.isTemplateExpression(m)) {
      anotar(m.head.text, m.head);
      for (const trozo of m.templateSpans) anotar(trozo.literal.text, trozo.literal);
      return;
    }
    if (ts.isConditionalExpression(m)) {
      enPosicionDeValor(m.whenTrue);
      enPosicionDeValor(m.whenFalse);
      return;
    }
    if (
      ts.isBinaryExpression(m) &&
      (m.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        m.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      enPosicionDeValor(m.left);
      enPosicionDeValor(m.right);
    }
  };
  const visitar = (n: ts.Node): void => {
    if (ts.isJsxText(n)) anotar(n.text, n);
    else if (ts.isJsxExpression(n) && n.expression) {
      /*
       * Un `{…}` dentro de un atributo sólo cuenta si el atributo se pinta.
       * Sin esto, `className={activo ? 'flex items-center' : '…'}` entra como
       * texto visible y el detector se llena de clases de Tailwind: doscientas
       * cuarenta apariciones de ruido que vacían la prueba de sentido.
       */
      const padre = n.parent;
      const esAtributo = padre && ts.isJsxAttribute(padre);
      if (!esAtributo || ATRIBUTOS_VISIBLES.has(padre.name.getText(sf))) {
        enPosicionDeValor(n.expression);
      }
    } else if (
      ts.isJsxAttribute(n) &&
      n.initializer &&
      ATRIBUTOS_VISIBLES.has(n.name.getText(sf))
    ) {
      if (ts.isStringLiteral(n.initializer)) anotar(n.initializer.text, n.initializer);
    } else if (
      ts.isPropertyAssignment(n) &&
      ROTULOS.has(n.name.getText(sf).replace(/['"]/g, ''))
    ) {
      enPosicionDeValor(n.initializer);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
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
    for (const [crudo, linea] of visiblesDe(s, ruta)) {
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

  it('mira las cuatro formas en que una pantalla pinta texto', () => {
    const muestra = [
      '<p>uno del tenant</p>',
      '<input aria-label="dos del maker-checker" />',
      "const menu = { titulo: 'tres del dashboard' };",
      "const x = <p>{cargando ? 'cuatro del tenant' : 'listo'}</p>;",
    ].join('\n');
    expect(
      visiblesDe(muestra)
        .map(([t]) => t.trim())
        .filter((t) => JERGA.test(t)),
    ).toHaveLength(4);
  });

  it('y ve el texto cuyo cierre está en la línea siguiente', () => {
    /*
     * ESTE ES EL AGUJERO QUE TENÍA, y por el que esta prueba llevaba en verde
     * con «maker-checker» en la pantalla de clientes. El detector anterior
     * exigía que el `<` de cierre estuviera en la MISMA línea que el texto, y
     * un párrafo largo de JSX nunca lo está.
     */
    const muestra = [
      '<div>',
      '  riesgo <strong>{nivel}</strong> y la propuesta se envía al flujo',
      '  maker-checker. Una línea ya autorizada sigue vigente.',
      '</div>',
    ].join('\n');
    expect(visiblesDe(muestra).some(([t]) => JERGA.test(t))).toBe(true);
  });

  it('y no confunde una flecha de función con una etiqueta', () => {
    /*
     * `x.filter(staff => n(staff.id) < 0)` encaja de maravilla entre un `>` y
     * un `<`. Contarlo llenaría la lista de nombres de variables, y la primera
     * reacción de quien se encuentre esa lista será quitar la prueba.
     */
    expect(visiblesDe('empleados.filter(staff => valor(staff.id) < 0)')).toEqual([]);
  });

  it('ni una clase de Tailwind con una expresión dentro', () => {
    /*
     * `className={a ? 'flex items-center' : 'grid place-items-center'}` es un
     * `{…}` que NO se pinta. Recogerlo metía 240 apariciones de ruido —todas
     * de `items-center`— y una lista así se borra en vez de leerse.
     */
    const muestra = "const x = <div className={activo ? 'flex items-center' : 'hidden'} />;";
    expect(visiblesDe(muestra)).toEqual([]);
  });

  it('pero sí el texto de un atributo que se lee en voz alta', () => {
    // Quitar esta rama deja los `aria-label` sin mirar y la prueba en verde.
    const muestra = '<input aria-label="dos del tenant" placeholder="y del dashboard" />';
    expect(visiblesDe(muestra).map(([t]) => t).filter((t) => JERGA.test(t))).toHaveLength(2);
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

  it('la propuesta de línea de crédito nombra la bandeja, no el mecanismo del core', () => {
    /*
     * Encontrado el 7-oct al cambiar el detector: llevaba invisible porque su
     * `</div>` estaba en la línea siguiente. Lo lee quien captura un cliente, y
     * «maker-checker» no le dice quién tiene que autorizar la línea.
     */
    const clientes = leer('app/dashboard/clientes/page.tsx');
    expect(clientes).toContain('se enviará a la bandeja de aprobaciones');
    expect(clientes).not.toContain('maker-checker');
  });

  it('y la matriz de aprobación no le habla al programador', () => {
    const matriz = leer('app/dashboard/configuraciones-aprobacion/page.tsx');
    expect(matriz).toContain('pero el sistema impedirá guardar una');
    expect(matriz).not.toContain('el backend impedirá');
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
