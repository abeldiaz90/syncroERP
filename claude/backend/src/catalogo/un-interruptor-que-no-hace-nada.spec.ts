/**
 * ============================================================================
 * Un interruptor que no hace nada
 * ----------------------------------------------------------------------------
 * La ficha del producto tenía un panel, «Políticas de Inventario», con cinco
 * interruptores. **Tres no hacían nada.**
 *
 *   · «Producto a Granel — Venta por peso variable»
 *   · «Número de Serie — Cada unidad tiene ID único»
 *   · «Permitir Venta en Negativo — Genera backorders»
 *
 * Los tres se guardaban en su columna y **nadie los leía nunca**: ni el
 * almacén, ni el mostrador, ni las compras. El peor de los tres es el último,
 * por dos razones. La primera es que su descripción prometía «backorders», y
 * la palabra «backorder» no aparece en ninguna línea del sistema. La segunda es
 * la forma en que falla: el encargado lo activa, cree que ese producto ya se
 * puede vender sin existencia, y el mostrador se lo niega **delante del
 * cliente**. El sistema no se equivoca al negarse —una venta sin existencia no
 * tiene lotes que consumir, así que no tiene costo, y sin costo el asiento de
 * la venta sería falso—. Se equivocaba al prometer.
 *
 * El arreglo no es implementar la venta en negativo a las carreras: eso es una
 * función con decisiones de costeo y de cartera, no un defecto. El arreglo es
 * **dejar de prometer lo que no se hace**, y decir en su lugar qué hace el
 * sistema hoy. Las columnas se quedan en la entidad y en la plantilla de
 * importación: no se destruye nada de lo ya capturado, y el día que el motor de
 * inventario las lea, el interruptor vuelve con significado.
 *
 * La regla que esto deja escrita es la que importa más que los tres casos:
 * **todo interruptor que la pantalla ofrezca tiene que estar honrado por el
 * servidor.** La última prueba de este archivo lo comprueba sola, así que el
 * día que alguien agregue un cuarto interruptor decorativo, se cae aquí.
 * ============================================================================
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const ruta = FRONTEND
  ? join(FRONTEND, 'app/dashboard/productos/components/ModalFichaProducto.tsx')
  : '';
const hay = Boolean(ruta && existsSync(ruta));
const ficha = hay ? readFileSync(ruta, 'utf8') : '';
const sinComentarios = (t: string) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** El arreglo literal de interruptores del panel «Políticas de Inventario». */
const panel = (() => {
  if (!hay) return '';
  const codigo = sinComentarios(ficha);
  const inicio = codigo.indexOf('Políticas de Inventario');
  if (inicio < 0) return '';
  return codigo.slice(inicio, codigo.indexOf('].map(', inicio));
})();

/** Las claves que el panel ofrece hoy. */
const clavesOfrecidas = [...panel.matchAll(/\{ key: '([A-Za-z0-9_]+)'/g)].map(
  (m) => m[1],
);

describe('El panel ya no ofrece lo que el sistema no hace', () => {
  it('el panel se encontró: si cambia de nombre, esta prueba deja de vigilar', () => {
    /*
     * Un archivo de pruebas que no encuentra lo que mide pasa en verde sin
     * medir nada. Se comprueba primero que hay algo que mirar.
     */
    if (!hay) return;
    expect(panel).not.toBe('');
    expect(clavesOfrecidas.length).toBeGreaterThan(0);
  });

  it('«Permitir Venta en Negativo» ya no se ofrece', () => {
    if (!hay) return;
    expect(clavesOfrecidas).not.toContain('permiteVentaSinStock');
  });

  it('«Número de Serie» tampoco', () => {
    if (!hay) return;
    expect(clavesOfrecidas).not.toContain('requiereNumeroSerie');
  });

  it('ni «Producto a Granel»', () => {
    if (!hay) return;
    expect(clavesOfrecidas).not.toContain('esGranel');
  });

  it('y ya no se promete «Genera backorders»', () => {
    /*
     * La palabra sí aparece —en la nota de abajo, nombrando lo que NO está en
     * vigor—. Lo que no puede volver es la promesa: un interruptor cuya
     * descripción afirma que genera backorders cuando la palabra no existe en
     * ninguna otra línea del sistema.
     */
    if (!hay) return;
    expect(ficha).not.toMatch(/desc: '[^']*backorder/i);
    expect(ficha).toMatch(/no están en vigor todavía/);
  });

  it('los dos que sí se honran siguen ahí', () => {
    /*
     * La prueba en el otro sentido. «Quitar lo que no sirve» se convierte muy
     * fácil en «quitar», y lotes y caducidad son lo que exige la recepción de
     * mercancía: sin ellos el almacenista no sabría por qué se le pide el lote.
     */
    if (!hay) return;
    expect(clavesOfrecidas).toContain('requiereLote');
    expect(clavesOfrecidas).toContain('requiereCaducidad');
  });
});

describe('En su lugar se dice qué hace el sistema hoy', () => {
  it('se explica que no se vende por debajo de la existencia', () => {
    /*
     * Quitar el interruptor sin decir nada deja al encargado buscándolo. La
     * pregunta que venía a resolver —«¿puedo vender sin existencia?»— sigue
     * teniendo respuesta, y ahora es la verdadera.
     */
    if (!hay) return;
    expect(ficha).toMatch(/Ningún producto se vende por debajo de su\s*\n?\s*existencia/);
  });

  it('y que las otras dos políticas no están en vigor todavía', () => {
    if (!hay) return;
    expect(ficha).toMatch(/no están en vigor todavía/);
  });
});

describe('Las columnas no se destruyeron', () => {
  const entidad = readFileSync(
    join(__dirname, 'entities', 'producto.entity.ts'),
    'utf8',
  );
  const plantilla = readFileSync(
    join(__dirname, 'services', 'plantilla-inventario.service.ts'),
    'utf8',
  );

  it('la entidad las conserva', () => {
    /*
     * Lo capturado por importación sigue guardado, y el día que el motor de
     * inventario las lea no hace falta una migración para recuperarlas.
     */
    for (const campo of [
      'esGranel',
      'requiereNumeroSerie',
      'permiteVentaSinStock',
    ]) {
      expect(entidad).toContain(campo);
    }
  });

  it('y la plantilla de importación sigue aceptándolas', () => {
    expect(plantilla).toContain('permiteVentaSinStock');
  });

  it('pero la plantilla avisa que esa columna todavía no rige', () => {
    /*
     * La otra puerta a la misma promesa. Una columna que se acepta en silencio
     * se lee como una columna que hace algo; es el mismo defecto que el
     * interruptor, entrando por el Excel.
     */
    expect(plantilla).toMatch(/permiteVentaSinStock se guarda pero AÚN NO RIGE/);
  });
});

describe('La regla, no los tres casos', () => {
  it('todo interruptor que la pantalla ofrece está honrado por el servidor', () => {
    /*
     * ========================================================================
     * Ésta es la prueba que vale, porque no vigila tres nombres: vigila la
     * regla. Lee las claves que el panel ofrece HOY y exige que cada una
     * aparezca en código del servidor que las LEA, no sólo que las guarde.
     *
     * Por eso se excluyen las entidades, los DTO, la plantilla, la
     * importación y las semillas: ahí es donde viven las columnas inertes, y
     * contarlas como «honrado» es exactamente el error que dejó pasar estos
     * tres durante meses.
     *
     * Si mañana alguien agrega un cuarto interruptor decorativo, este caso se
     * cae y nombra la clave.
     * ========================================================================
     */
    if (!hay) return;

    const SRC = join(__dirname, '..');
    const IGNORAR =
      /(\.spec\.ts$|[\\/]dto[\\/]|[\\/]entities[\\/]|[\\/]database[\\/]|plantilla-inventario\.service\.ts$|importacion-productos\.service\.ts$|fila-producto\.dto\.ts$)/;

    const archivos: string[] = [];
    const caminar = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const completo = join(dir, nombre);
        if (statSync(completo).isDirectory()) caminar(completo);
        else if (completo.endsWith('.ts') && !IGNORAR.test(completo))
          archivos.push(completo);
      }
    };
    caminar(SRC);
    expect(archivos.length).toBeGreaterThan(100);

    const codigoServidor = archivos
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const decorativos = clavesOfrecidas.filter(
      (clave) => !codigoServidor.includes(clave),
    );
    expect(decorativos).toEqual([]);
  });
});
