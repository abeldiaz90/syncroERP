import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Cada puerta sin llave está declarada
 * ----------------------------------------------------------------------------
 * QUÉ ES `@Public()`
 *
 * El ERP monta cinco guardias globales —límite de peticiones, sesión,
 * suplantación, permisos por endpoint y roles— y `@Public()` **los salta
 * todos**. Es la única forma de que una ruta de este sistema conteste sin que
 * nadie haya demostrado quién es.
 *
 * Hay diecinueve, y todas tienen su razón. Doce de ellas son el
 * aprovisionamiento: crean empresas, escriben la identidad de un realm con sus
 * secretos, activan y suspenden identidades. Una sola de esas doce sin su
 * candado convertiría a cualquiera que alcance el puerto en administrador de
 * todos los inquilinos.
 *
 * Lo que las protege no es la sesión: es una clave de servicio
 * (`APROVISIONAMIENTO_TOKEN` en la cabecera, `FINERACT_WEBHOOK_TOKEN` en la
 * dirección del hook, que no admite cabeceras propias). Sin la variable
 * configurada, las rutas contestan 404 como si no existieran — que es el
 * estado correcto para una instalación a medio montar.
 *
 * POR QUÉ ESTA PRUEBA
 *
 * Porque `@Public()` son doce caracteres y se añade sin querer. Una ruta nueva
 * dentro de un controlador que ya tiene candados **no hereda ninguno**: hay que
 * llamarlo a mano, y olvidarlo no da error ni aviso. Esta prueba es el aviso.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..');

/**
 * Las rutas abiertas, con qué las protege cada una. Sin entrada aquí, la
 * prueba falla: declararla obliga a mirarla.
 */
const PUERTAS: Record<string, { candado: RegExp | null; razon: string }> = {
  'app.controller.ts': {
    candado: null,
    razon:
      'Sondas de salud. No leen ni escriben nada del negocio y el orquestador ' +
      'las consulta antes de que exista ninguna sesión.',
  },
  'iam/controllers/auth.controller.ts': {
    candado: null,
    razon: 'El inicio de sesión. Es la puerta por definición: pedir sesión aquí sería circular.',
  },
  'iam/controllers/usuarios.controller.ts': {
    candado: /tokenVerificacion|hashToken|token/,
    razon:
      'Aceptar la invitación. Quien llega no tiene sesión todavía —ésa es la idea— ' +
      'y lo que lo autoriza es el token de un solo uso que recibió por correo.',
  },
  'integracion/controllers/alta-empresas.controller.ts': {
    candado: /exigirServicio\s*\(/,
    razon:
      'El aprovisionamiento que usa la consola de SUMA. Clave de servicio en la ' +
      'cabecera: no se hereda de una sesión robada, no aparece en un navegador y ' +
      'no depende de los roles que alguien se haya otorgado.',
  },
  'integracion/controllers/avisos-integracion.controller.ts': {
    candado: /claveValida\s*\(/,
    razon:
      'El hook del core. Fineract no permite cabeceras propias, así que la clave ' +
      'larga viaja en la dirección, que es donde se puede poner.',
  },
};

function controladores(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules') continue;
      controladores(ruta, salida);
      continue;
    }
    if (entrada.endsWith('.controller.ts')) salida.push(ruta);
  }
  return salida;
}

const CON_PUBLICO = controladores(RAIZ)
  .map((ruta) => ({
    relativa: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'),
    texto: readFileSync(ruta, 'utf8'),
  }))
  .filter(({ texto }) => /@Public\(\)/.test(texto));

describe('cada puerta sin llave está declarada', () => {
  it('no hay ningún controlador abierto que no esté en la lista', () => {
    const noDeclarados = CON_PUBLICO.map((c) => c.relativa).filter((r) => !PUERTAS[r]);
    expect(noDeclarados).toEqual([]);
  });

  it('y la lista no nombra controladores que ya no existen', () => {
    /* Una razón escrita para una puerta que se cerró es ruido que despista. */
    const abiertos = new Set(CON_PUBLICO.map((c) => c.relativa));
    expect(Object.keys(PUERTAS).filter((r) => !abiertos.has(r))).toEqual([]);
  });

  it('cada ruta abierta con candado lo llama de verdad', () => {
    /*
     * No basta con que el controlador tenga el candado escrito en alguna
     * parte: cada método público tiene que llamarlo. Un método nuevo entre dos
     * que sí lo llaman es exactamente como se cuela una puerta abierta.
     */
    const sinCandado: string[] = [];
    for (const { relativa, texto } of CON_PUBLICO) {
      const { candado } = PUERTAS[relativa] ?? {};
      if (!candado) continue;
      for (const metodo of texto.split(/(?=@Public\(\))/).slice(1)) {
        if (candado.test(metodo)) continue;
        const firma =
          metodo.match(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/)?.[0] ?? '(sin verbo)';
        const nombre = metodo.match(/async\s+(\w+)\s*\(/)?.[1] ?? '?';
        sinCandado.push(`${relativa} → ${firma} ${nombre}`);
      }
    }
    expect(sinCandado).toEqual([]);
  });

  it('el aprovisionamiento no abre si la clave no está puesta o es corta', () => {
    /*
     * El agujero clásico: la variable sin configurar y la comparación con la
     * cadena vacía, que acierta siempre. Aquí responde 404 —como si la ruta no
     * existiera— y exige al menos 32 caracteres.
     */
    const texto = readFileSync(
      join(RAIZ, 'integracion', 'controllers', 'alta-empresas.controller.ts'),
      'utf8',
    );
    const fn = texto.slice(texto.indexOf('private exigirServicio'));
    expect(fn).toMatch(/if \(!esperada \|\| esperada\.length < 32\) throw new NotFoundException/);
    /* Y la comparación recorre la clave entera: salir antes delata cuánto se acertó. */
    expect(fn).toMatch(/diferencia \|=/);
    expect(fn).not.toMatch(/esperada === dada|dada === esperada/);
  });

  it('cada razón está escrita, no sólo nombrada', () => {
    for (const [ruta, { razon }] of Object.entries(PUERTAS)) {
      expect(razon.length).toBeGreaterThan(60);
      expect(ruta.endsWith('.controller.ts')).toBe(true);
    }
  });

  describe('la prueba de la prueba', () => {
    it('un método público nuevo sin candado se vería', () => {
      const inventado = `@Public()
  @Post('borrar-todo')
  async borrarTodo() { return this.alta.borrarTodo(); }`;
      expect(/exigirServicio\s*\(/.test(inventado)).toBe(false);
    });

    it('y el barrido mira controladores de verdad', () => {
      expect(CON_PUBLICO.length).toBeGreaterThanOrEqual(5);
      expect(controladores(RAIZ).length).toBeGreaterThan(40);
    });
  });
});
