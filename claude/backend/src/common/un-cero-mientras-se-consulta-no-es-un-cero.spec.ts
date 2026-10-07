import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UN CERO MIENTRAS SE CONSULTA NO ES UN CERO
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 6-oct, barriendo los dos sistemas. En el portal, *Cartera y originación*
 * recién abierta decía durante cuatro segundos «0 solicitud(es) / préstamo(s)»
 * —y debajo, a la vez, «Consultando cartera…»—. Al llegar los datos: 28.
 *
 * Buscando la misma forma en el ERP salieron seis pantallas más, y en las dos
 * que más se miran el cero sale en blanco sobre la barra negra del encabezado:
 * «REGISTRO DE CRÉDITOS · 0 crédito(s)» y «PLAN DE CUENTAS · 0 cuenta(s)».
 *
 * POR QUÉ NO ES COSMÉTICO
 *
 * Es la familia de `el-cero-que-se-lee-como-buena-noticia`: un número sin su
 * contexto miente en la dirección tranquilizadora. «0 créditos» se lee como «no
 * hay nada que cobrar» y «0 cuentas» como «el catálogo está vacío». Cuatro
 * segundos bastan para que alguien cierre la pestaña convencido.
 *
 * Y el que lo delata es el vecino: en varias de estas pantallas el estado vacío
 * de la tabla SÍ distingue «consultando» de «no hay», dos líneas más abajo. El
 * cuidado estaba; al contador no le llegó.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * Que ninguna de estas pantallas pinte su conteo sin mirar antes si todavía
 * está consultando. No fija el texto: fija que el número no viaje solo.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** Pantalla → el conteo que pinta, por el texto que lo acompaña. */
const PANTALLAS: Array<{ ruta: string; cola: string }> = [
  { ruta: 'app/dashboard/creditos/creditos/page.tsx', cola: 'crédito(s)' },
  { ruta: 'app/dashboard/finanzas/cuentas-contables/page.tsx', cola: 'cuenta(s)' },
  { ruta: 'app/dashboard/creditos/cuentas-bancarias/page.tsx', cola: 'cuenta(s)' },
  { ruta: 'app/dashboard/compras/requisiciones/page.tsx', cola: 'registros' },
  { ruta: 'app/dashboard/reportes/inventario/page.tsx', cola: 'productos' },
  { ruta: 'app/dashboard/hoteleria/configuracion/DotacionInsumos.tsx', cola: 'producto(s)' },
];

/** Sin comentarios: aquí se mide código, no explicaciones. */
const sinComentarios = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('ninguna pantalla afirma un cero mientras sigue consultando', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  for (const { ruta, cola } of PANTALLAS) {
    it(`${ruta} espera a saber antes de contar`, () => {
      const s = sinComentarios(readFileSync(join(FRONTEND!, ruta), 'utf8'));

      /* Que el archivo sea el que creo: si se renombra, esto truena. */
      expect(s).toMatch(/const \[cargando, setCargando\]/);

      /*
       * EL NÚCLEO. La forma mala es un número pelado seguido del texto:
       * `{filtrados.length} crédito(s)`. Se exige que el que quede lleve la
       * guarda delante.
       */
      const escape = cola.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      /*
       * El `(?<!\$)` NO es un detalle: sin él, el patrón encuentra el hueco de
       * la plantilla que ya lleva la guarda —`${filtrados.length} crédito(s)`
       * dentro de un literal— y la prueba sale roja con el arreglo puesto. Se
       * descubrió al escribirla, y es la razón de la última comprobación de
       * este archivo.
       */
      const pelado = new RegExp(`(?<!\\$)\\{\\s*[A-Za-z_$][\\w$.]*(?:\\.length)?\\s*\\}\\s*${escape}`);
      expect(s).not.toMatch(pelado);
      expect(s).toMatch(new RegExp(`cargando \\? 'Consultando…' : \`\\$\\{[^}]+\\} ${escape}`));
    });
  }

  it('los cuatro recuadros de requisiciones esperan igual que su tabla', () => {
    /*
     * LO QUE LA LISTA DE ARRIBA NO MIRABA, y es lo que de verdad se lee.
     *
     * Medido el 7-oct con el rol de comprador: esta pantalla ya estaba en la
     * lista —por el «N registros» de la barra de la tabla, que sí esperaba—
     * y al abrirla los cuatro recuadros grandes decían 0 / 0 / 0 / 0 en letra
     * de 30 px mientras, dos líneas más abajo, ponía «Consultando…». Al
     * llegar los datos: 3 / 2 / 0 / 1.
     *
     * «Pendientes 0» se lee como «no tengo nada que hacer». El cuidado
     * estaba en la línea pequeña y no en la grande, que es la única que se
     * mira de lejos —la misma asimetría que destapó esta prueba—.
     */
    const s = sinComentarios(
      readFileSync(
        join(FRONTEND!, 'app/dashboard/compras/requisiciones/page.tsx'),
        'utf8',
      ),
    );
    /* El valor del recuadro pasa por la guarda. */
    expect(s).toMatch(/cargando \? \([\s\S]{0,400}\u2014[\s\S]{0,200}\) : \([\s\S]{0,200}\{k\.val\}/);
    /* Y no queda la forma vieja: el número pelado como único hijo. */
    expect(s).not.toMatch(
      /<p className=\{`text-3xl font-black text-\$\{k\.color\}-600`\}>\{k\.val\}<\/p>\s*<\/button>/,
    );
    /*
     * Y no se pueden pulsar mientras tanto: filtrar por un estado cuyo conteo
     * no se sabe deja la tabla vacía sin que nada diga por qué.
     */
    expect(s).toMatch(/<button key=\{k\.label\} disabled=\{cargando\}/);
  });

  it('y el detector reconoce la forma mala cuando la ve', () => {
    /*
     * La prueba de la prueba. Sin esto, cambiar el patrón por uno que no
     * encuentra nada dejaría las seis en verde para siempre.
     */
    const pelado = /(?<!\$)\{\s*[A-Za-z_$][\w$.]*(?:\.length)?\s*\}\s*crédito\(s\)/;
    expect(pelado.test('<p>{filtrados.length} crédito(s)</p>')).toBe(true);
    expect(
      pelado.test("<p>{cargando ? 'Consultando…' : `${filtrados.length} crédito(s)`}</p>"),
    ).toBe(false);
  });

  it('el indicador de stock bajo tampoco afirma un cero mientras consulta', () => {
    /*
     * EL CERO MÁS TRANQUILIZADOR DE TODOS, y el único que no es un conteo de
     * lista: la tarjeta «Stock bajo mínimo» sale blanca y en gris con el 0 de
     * la carga, que se lee como «no falta nada» en un almacén. Aquí no se
     * escribe «Consultando…» porque es un número grande en una tarjeta: un
     * guion dice lo mismo sin romper la tira de indicadores.
     */
    const s = sinComentarios(
      readFileSync(join(FRONTEND!, 'app/dashboard/reportes/inventario/page.tsx'), 'utf8'),
    );
    expect(s).toMatch(/\{cargando \? '—' : `\$\{stockBajo\} productos`\}/);
    expect(s).not.toMatch(/>\{stockBajo\} productos</);
  });

  it('un conteo ya protegido por su propio `&&` no se toca', () => {
    /*
     * En *Pólizas* el bloque entero se pinta con `{filtradas.length > 0 && …}`,
     * así que durante la carga no hay nada que leer y el cero no aparece. Esa
     * forma también es correcta, y esta prueba no la persigue: se deja escrita
     * aquí para que nadie la "arregle" por parecerse.
     */
    const s = readFileSync(join(FRONTEND!, 'app/dashboard/finanzas/polizas/page.tsx'), 'utf8');
    expect(s).toMatch(/\{filtradas\.length > 0 && \(/);
  });
});
