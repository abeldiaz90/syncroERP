import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * LAS PRUEBAS MIRABAN UN ÁRBOL CONGELADO
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Cuarenta y nueve pruebas comprueban cosas del frontend —que un botón del menú
 * apunte a un endpoint real, que la pantalla no mande un campo que el servidor
 * prohíbe, que un enlace lleve a alguna parte— y todas buscaban el árbol así:
 *
 *     ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
 *       .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')))
 *
 * En el equipo existen LOS DOS árboles:
 *
 *   · `claude/frontend`      ← el que levanta `iniciar-syncroerp.bat`
 *   · `syncro-erp-frontend`  ← código congelado desde el 10-sep-2026
 *
 * El congelado iba primero, así que ganaba siempre. Las pruebas llevaban desde
 * entonces midiendo una copia que nadie ejecuta, y diciendo que todo estaba
 * bien.
 *
 * CÓMO SALIÓ
 *
 * No lo encontró ninguna prueba: salió al abrir el navegador. Se arregló la
 * columna «Quién» del kardex, se recargó la pantalla y no estaba. El código
 * decía que sí; la pantalla decía que no. La pantalla tenía razón.
 *
 * Y HAY UNA SEGUNDA MITAD, QUE ES LA QUE LO MANTUVO INVISIBLE
 *
 * Cada una de esas pruebas termina su búsqueda con
 *
 *     if (!FRONTEND) return;
 *
 * Una prueba que no encuentra qué medir y se declara satisfecha no es una
 * prueba: es una luz verde sin nada detrás. Mientras el árbol se resolviera a
 * CUALQUIER cosa, nadie se iba a enterar.
 *
 * Esas cuarenta y nueve no se tocan una por una —cada `return` está dentro de
 * su propio `it`, con su forma—. Lo que se hace es ponerles un guardián: si el
 * árbol vivo no se puede resolver, ESTE archivo se pone rojo. Una sola prueba
 * ruidosa vale por cuarenta y nueve calladas.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');

/** El mismo orden de candidatos que usan las demás, para medir lo que ellas ven. */
const CANDIDATOS = ['claude/frontend', 'frontend', '../claude/frontend'];

const FRONTEND = CANDIDATOS.map((nombre) => join(RAIZ, nombre)).find((ruta) =>
  existsSync(join(ruta, 'app/dashboard/module-config.ts')),
);

describe('el árbol de frontend que miran las pruebas', () => {
  it('existe, y si no, esto truena en vez de pasar en silencio', () => {
    /*
     * El guardián. Las otras cuarenta y nueve se omiten solas cuando no
     * encuentran árbol; ésta no. Si alguien mueve o renombra el frontend, el
     * primer aviso sale aquí y no tres semanas después en una pantalla.
     */
    expect(FRONTEND).toBeDefined();
    expect(
      existsSync(join(FRONTEND!, 'app/dashboard/productos/page.tsx')),
    ).toBe(true);
  });

  it('no es el congelado, y ninguna prueba lo vuelve a nombrar primero', () => {
    /*
     * En negativo y sobre TODAS las pruebas: comprobar sólo que la lista de
     * aquí esté bien no impide que mañana alguien copie el patrón viejo de otro
     * archivo, que es exactamente como se propagó a cuarenta y nueve.
     */
    expect(FRONTEND).not.toMatch(/syncro-erp-frontend/);

    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === 'dist') continue;
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (nombre.endsWith('.ts')) archivos.push(ruta);
      }
    };
    recorrer(SRC);

    const culpables = archivos.filter((ruta) => {
      /*
       * Este archivo queda fuera: cita el patrón malo entre comillas para
       * explicar cuál era, y prohibirse a sí mismo nombrarlo obligaría a contar
       * el defecto sin poder enseñarlo.
       */
      if (ruta.endsWith('el-arbol-que-miraban-las-pruebas.spec.ts')) return false;
      const texto = readFileSync(ruta, 'utf8');
      /*
       * Se busca el árbol congelado usado COMO RUTA —entre comillas y seguido
       * de `/app` o cerrando la cadena—, no la palabra suelta: este archivo y
       * un par de comentarios la nombran para explicar por qué no se usa, y una
       * prueba que prohíbe hablar del defecto es una prueba que borra la
       * memoria de por qué existe.
       */
      return /'syncro-erp-frontend(\/[^']*)?'/.test(texto);
    });

    expect(culpables.map((r) => r.replace(SRC, 'src'))).toEqual([]);
  });

  it('y es el mismo que levanta el lanzador', () => {
    /*
     * LA FUENTE DE VERDAD. `iniciar-syncroerp.bat` es lo que se ejecuta de
     * verdad; cualquier otra cosa es una creencia. Si mañana el lanzador apunta
     * a otra carpeta, las pruebas tienen que seguirlo.
     *
     * El .bat vive en la raíz del repositorio, un nivel por encima de `claude`,
     * así que en el contenedor —que sólo clona `backend` y `frontend`— no está.
     * Ahí esta comprobación no aplica, y se dice en vez de fingir que se hizo.
     */
    const lanzador = join(RAIZ, '..', 'iniciar-syncroerp.bat');
    if (!existsSync(lanzador)) {
      expect(FRONTEND).toBeDefined();
      return;
    }

    const texto = readFileSync(lanzador, 'latin1');
    const raizDeclarada = /set RAIZ=(.+)/i.exec(texto)?.[1]?.trim();
    expect(raizDeclarada).toBeTruthy();

    /*
     * `D:\SUMA\...\syncroERP\claude` → la última carpeta es la que manda, y el
     * frontend cuelga de ella. Se compara por nombre de carpeta y no por ruta
     * absoluta: el repositorio está montado en sitios distintos en el equipo y
     * en el contenedor.
     */
    const carpetaRaiz = raizDeclarada!.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    expect(FRONTEND).toContain(`${carpetaRaiz}`);
  });
});

describe('y lo que se arregló en la copia muerta se arregló en la viva', () => {
  /*
   * Las tres pantallas que se tocaron el 5-oct y acabaron en el árbol
   * equivocado. Están aquí nombradas porque son la prueba de que la corrección
   * llegó a donde tenía que llegar, no sólo de que el resolvedor cambió.
   */
  const leer = (relativa: string) =>
    readFileSync(join(FRONTEND!, relativa), 'utf8');

  it('la llave del menú de «Nueva póliza» apunta al endpoint que existe', () => {
    const menu = leer('app/dashboard/module-config.ts');
    expect(menu).toMatch(/"\/api\/finanzas\/polizas\/manual"/);
    expect(menu).not.toMatch(/"\/api\/finanzas\/polizas"/);
  });

  it('el kardex tiene la columna «Quién»', () => {
    const kardex = leer('app/dashboard/productos/[id]/page.tsx');
    expect(kardex).toMatch(/usuarioNombre\?: string \| null;/);
    expect(kardex).toMatch(/>Quién</);
  });

  it('y la ventana no promete un documento que no existe', () => {
    const modal = leer(
      'app/dashboard/productos/components/ModalInventarioRapido.tsx',
    );
    expect(modal).not.toMatch(/\? 'Recepción de Mercancía'/);
    expect(modal).toMatch(/Entrada sin documento/);
  });
});
