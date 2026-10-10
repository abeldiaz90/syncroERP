import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El directorio de la empresa, no el del entorno
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Con un realm por empresa, el cliente y el secreto con los que se administra
 * el directorio dependen de QUÉ empresa se esté atendiendo.
 * `DirectorioIdentidadService.paraIdentidad()` existe desde que se escribió el
 * servicio, y el 10-oct-2026 —con el primer realm propio ya creado— resultó
 * que **no la llamaba nadie**. La pieza buena estaba hecha y el camino real
 * seguía usando el entorno:
 *
 *   · `UsuariosService.crear` creaba la identidad con el provisionador del
 *     entorno, o sea **en el realm común**. Y no falla: Keycloak contesta 201,
 *     el ERP guarda el `sub`, y la persona queda sellada con un directorio que
 *     no es el de su empresa. Nadie se entera hasta que intenta entrar — y para
 *     entonces el `sub` ya está escrito, porque una identidad no se muda de
 *     realm.
 *   · El diagnóstico de la pantalla informaba del realm del entorno mientras el
 *     alta escribía en otro: un control que se cree puesto, diciendo «todo
 *     bien» de un directorio que no es el que se va a usar.
 *   · `RolesExternosService.diagnostico` preguntaba por la gente de la empresa
 *     al directorio equivocado, y habría contestado «no está en el directorio»
 *     para todo el mundo: una alarma falsa en la pantalla que existe para dar
 *     alarmas de verdad.
 *
 * Es el defecto gemelo del que apareció el mismo día en la consola, con otra
 * cara: allí la ruta era correcta y la llave equivocada y Keycloak contestaba
 * 403; aquí la llave es «correcta» para el realm equivocado y **no contesta
 * nada**, que es peor.
 *
 * LO QUE ESTA PRUEBA MIDE
 *
 * Que nadie vuelva a hablarle al directorio sin decir de qué empresa. No el
 * nombre de una función: la forma de la llamada, que es lo que determina a qué
 * realm va. Si mañana nace un módulo que haga `this.directorio.crearIdentidad`,
 * esto se pone rojo antes de que llegue a un cliente.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..');

/** Lo que habla con un realm concreto. `configurado` y los getters, no. */
const METODOS_QUE_TOCAN_UN_REALM = ['crearIdentidad', 'buscarPorCorreo', 'diagnostico'];

/** El propio servicio, que es donde `this` SÍ es el directorio. */
const EL_SERVICIO = join('iam', 'services', 'directorio-identidad.service.ts');

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === 'migrations') continue;
      archivos(ruta, salida);
      continue;
    }
    if (!entrada.endsWith('.ts')) continue;
    if (entrada.endsWith('.spec.ts')) continue;
    salida.push(ruta);
  }
  return salida;
}

const FUENTES = archivos(RAIZ)
  .filter((f) => !f.endsWith(EL_SERVICIO))
  .map((f) => ({ ruta: f.slice(RAIZ.length + 1), texto: readFileSync(f, 'utf8') }));

describe('el directorio de la empresa, no el del entorno', () => {
  it('nadie llama al directorio del entorno para operar sobre un realm', () => {
    /*
     * `this.directorio.<metodo>(` es la forma que usa el provisionador del
     * entorno. La forma buena es atarlo antes con `paraIdentidad()` y llamar a
     * la copia, que es una variable local y no `this`.
     */
    const culpables: string[] = [];
    for (const { ruta, texto } of FUENTES) {
      const sinComentarios = texto
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      for (const metodo of METODOS_QUE_TOCAN_UN_REALM) {
        const patron = new RegExp(`this\\.directorio\\s*\\.\\s*${metodo}\\s*\\(`);
        if (patron.test(sinComentarios)) culpables.push(`${ruta} → ${metodo}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('quien usa el directorio lo ata antes a la identidad de la empresa', () => {
    /*
     * El complemento del anterior. Sin esto, alguien podría «arreglar» la
     * prueba de arriba guardando `const directorio = this.directorio` — mismo
     * realm equivocado, otra forma de escribirlo.
     */
    const sinAtar: string[] = [];
    for (const { ruta, texto } of FUENTES) {
      const sinComentarios = texto
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      const usaAlguno = METODOS_QUE_TOCAN_UN_REALM.some((m) =>
        new RegExp(`directorio\\s*\\.\\s*${m}\\s*\\(`).test(sinComentarios),
      );
      if (!usaAlguno) continue;
      if (!/paraIdentidad\s*\(/.test(sinComentarios)) sinAtar.push(ruta);
      /* Y el alias perezoso, que esquivaría la prueba anterior sin arreglar nada. */
      if (/const\s+directorio\s*=\s*this\.directorio\s*;/.test(sinComentarios)) {
        sinAtar.push(`${ruta} (alias de this.directorio sin atar)`);
      }
    }
    expect(sinAtar).toEqual([]);
  });

  it('la identidad que se le pasa sale de la empresa que se está atendiendo', () => {
    /*
     * `deEmpresa(empresaId)` es la única fuente legítima: lee la fila de la
     * empresa y cae al entorno cuando no la hay. Pasarle a `paraIdentidad` algo
     * armado a mano sería volver a elegir el realm por otra vía.
     */
    const malaFuente: string[] = [];
    for (const { ruta, texto } of FUENTES) {
      if (!/paraIdentidad\s*\(/.test(texto)) continue;
      if (!/deEmpresa\s*\(\s*empresaId\s*\)/.test(texto)) malaFuente.push(ruta);
    }
    expect(malaFuente).toEqual([]);
  });

  describe('la prueba de la prueba', () => {
    it('con el defecto dentro, el detector lo ve', () => {
      const conElDefecto = `
        const alta = await this.directorio.crearIdentidad({ email });
      `;
      expect(/this\.directorio\s*\.\s*crearIdentidad\s*\(/.test(conElDefecto)).toBe(true);

      const arreglado = `
        const directorio = this.directorio.paraIdentidad(id);
        const alta = await directorio.crearIdentidad({ email });
      `;
      expect(/this\.directorio\s*\.\s*crearIdentidad\s*\(/.test(arreglado)).toBe(false);
      expect(/paraIdentidad\s*\(/.test(arreglado)).toBe(true);
    });

    it('y el detector mira archivos de verdad, no una lista escrita a mano', () => {
      /* Si el barrido no encontrara nada, las tres pruebas pasarían vacías. */
      expect(FUENTES.length).toBeGreaterThan(100);
      expect(FUENTES.some((f) => f.ruta.includes('usuarios.service.ts'))).toBe(true);
    });
  });
});
