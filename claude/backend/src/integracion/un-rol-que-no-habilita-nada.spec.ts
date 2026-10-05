/**
 * ============================================================================
 * Un rol que no habilita nada
 * ----------------------------------------------------------------------------
 * Preguntado por Abel el 1-oct-2026: «¿por qué gerencia y algunos otros roles
 * no pueden entrar a Fineract?». La respuesta eran tres capas, y la tercera es
 * la que este archivo cuida.
 *
 *   1. No veía la puerta: el enlace del menú sólo se dibuja para quien puede
 *      leer `GET /integracion/estado`, y su plantilla no lo concedía.
 *   2. No podía autenticarse: el core corre con `AUTO_CREATE_USER=false` y el
 *      aprovisionamiento es manual, usuario por usuario.
 *   3. Y aunque entrara, no vería nada: los roles espejo nacen SIN permisos
 *      —a propósito, porque el ERP no puede adivinar qué permisos bancarios
 *      necesita un «Almacenista»— y con permisos vacíos el portal rechaza
 *      todas las pantallas.
 *
 * Lo grave no eran las tres capas: era que **el diagnóstico que existe para
 * detectar justo esto reportaba `NINGUNA` —«Listo»— sobre un usuario así**.
 * Existe en los dos lados, está mapeado, tiene su rol asignado: todas las
 * preguntas que hacía salían bien. Y el operador entra al core y no puede
 * hacer nada.
 *
 * Un diagnóstico que mira cuatro de las cinco cosas que importan es peor que
 * no tenerlo, porque el verde que devuelve se cree.
 * ============================================================================
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { UsuariosExternosNoConfigurado } from './ports/usuarios-externos.port';

const fuente = (...ruta: string[]) =>
  readFileSync(join(__dirname, ...ruta), 'utf8');
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('El puerto sabe preguntar si un rol habilita algo', () => {
  it('declara `permisosDeRol`', () => {
    const puerto = sinComentarios(fuente('ports', 'usuarios-externos.port.ts'));
    expect(puerto).toMatch(
      /permisosDeRol\(idRolExterno: string\): Promise<number \| null>;/,
    );
  });

  it('«no se pudo preguntar» es null, no cero', async () => {
    /*
     * La distinción es la que hace útil el diagnóstico: cero significa «ese
     * rol existe y no habilita nada», y es un trámite pendiente; null
     * significa «no sé», y sobre eso no se acusa a nadie.
     */
    const sinCore = new UsuariosExternosNoConfigurado();
    await expect(sinCore.permisosDeRol()).resolves.toBeNull();
  });

  it('el adaptador cuenta los permisos SELECCIONADOS, no las filas', () => {
    /*
     * `/v1/roles/{id}/permissions` devuelve el catálogo entero de Fineract
     * —más de mil filas— con un `selected` por cada una. Contar las filas
     * daría «1061 permisos» para un rol que no concede ninguno, que es
     * exactamente la respuesta tranquilizadora y falsa que se quiere evitar.
     */
    const adaptador = sinComentarios(
      fuente('adaptadores', 'fineract', 'fineract-usuarios.adapter.ts'),
    );
    expect(adaptador).toMatch(/\/v1\/roles\/\$\{idRolExterno\}\/permissions/);
    expect(adaptador).toMatch(/filter\(\(p\) => p\?\.selected === true\)\.length/);
  });

  it('si no se puede preguntar, devuelve null y no tumba el diagnóstico', () => {
    /*
     * Un diagnóstico que se cae por no poder contar permisos deja de
     * contestar todo lo demás, que sí sabía.
     */
    const adaptador = fuente(
      'adaptadores',
      'fineract',
      'fineract-usuarios.adapter.ts',
    );
    const metodo = adaptador.slice(
      adaptador.indexOf('async permisosDeRol('),
      adaptador.indexOf('async buscarUsuario('),
    );
    expect(metodo).toMatch(/catch \(error\)/);
    expect(metodo).toMatch(/return null;/);
    expect(metodo).not.toMatch(/throw/);
  });
});

describe('El diagnóstico deja de decir «Listo» sobre un rol inerte', () => {
  const servicio = fuente('services', 'roles-externos.service.ts');
  const codigo = sinComentarios(servicio);

  it('existe el veredicto `ROL_SIN_PERMISOS`', () => {
    expect(codigo).toMatch(/\| 'ROL_SIN_PERMISOS';/);
  });

  it('se consulta por cada rol que el usuario tiene asignado', () => {
    expect(codigo).toMatch(/for \(const idRol of rolesActuales\)/);
    expect(codigo).toMatch(/this\.externos\.permisosDeRol\(idRol\)/);
  });

  it('sólo cuenta como inerte el que devolvió CERO, no el que no se pudo leer', () => {
    /*
     * Con `!permisosPorRol.get(idRol)` un `null` —«no se pudo preguntar»—
     * contaría como rol sin permisos y el diagnóstico acusaría a un usuario
     * que quizá está perfecto. La comparación es estricta a propósito.
     */
    expect(codigo).toMatch(/permisosPorRol\.get\(idRol\) === 0/);
  });

  it('se cachea por rol: varios usuarios comparten rol y preguntar cuesta caro', () => {
    /*
     * El catálogo de permisos de Fineract pasa de mil filas. Sin caché, una
     * empresa de treinta operadores con seis roles haría treinta llamadas
     * para contestar seis preguntas distintas.
     */
    expect(codigo).toMatch(
      /const permisosPorRol = new Map<string, number \| null>\(\);/,
    );
    expect(codigo).toMatch(/if \(!permisosPorRol\.has\(idRol\)\)/);
  });

  it('va DESPUÉS de corregir roles: arreglar el permiso del rol equivocado no sirve', () => {
    const cadena = codigo.slice(codigo.indexOf('accion:'), codigo.indexOf("'NINGUNA',") + 20);
    expect(cadena.indexOf("'CORREGIR_ROLES'")).toBeGreaterThan(-1);
    expect(cadena.indexOf("'ROL_SIN_PERMISOS'")).toBeGreaterThan(
      cadena.indexOf("'CORREGIR_ROLES'"),
    );
  });

  it('y `NINGUNA` ya no se alcanza con un rol vacío', () => {
    /*
     * La prueba en negativo, que es la que de verdad cierra el agujero: si
     * alguien vuelve a poner `NINGUNA` antes de mirar los permisos, el verde
     * falso regresa.
     */
    expect(codigo).toMatch(
      /sinPermisos\.length > 0\s*\?\s*'ROL_SIN_PERMISOS'\s*:\s*'NINGUNA',/,
    );
  });

  it('se nombran los roles inertes, no sólo se cuenta cuántos hay', () => {
    expect(codigo).toMatch(/rolesSinPermisos: sinPermisos,/);
  });
});

describe('Los roles que miran los libros ven la puerta al core', () => {
  const plantillas = fuente('..', 'iam', 'data', 'plantillas-permisos.ts');

  it('la lectura mínima está separada de las acciones del espejo', () => {
    /*
     * Dar `ACCIONES_ESPEJO_CONTABLE` entero para que aparezca un enlace sería
     * pasarse de largo: ahí van el mapeo de cuentas, el aprovisionamiento y el
     * despacho de la cola, que siguen siendo de contabilidad y finanzas.
     */
    expect(plantillas).toMatch(
      /const VER_QUE_HAY_CORE = 'GET \/integracion\/estado';/,
    );
  });

  it('gerencia y tesorería la tienen', () => {
    const veces = (plantillas.match(/^\s*VER_QUE_HAY_CORE,$/gm) ?? []).length;
    expect(veces).toBe(2);
  });

  it('y no se concedió por módulo, que habría abierto todo /integracion', () => {
    /*
     * Meter `'integracion'` en `modulosConsulta` de gerencia le habría dado
     * de regalo el outbox, el mapeo de cuentas y la conciliación. Se concede
     * la acción, no el módulo.
     */
    const bloqueGerencia = plantillas.slice(
      plantillas.indexOf("rol: 'gerencia'"),
      plantillas.indexOf("rol: 'direccion'"),
    );
    expect(bloqueGerencia).not.toMatch(/'integracion',/);
    expect(bloqueGerencia).toMatch(/VER_QUE_HAY_CORE,/);
  });
});

describe('La pantalla del diagnóstico enseña el estado nuevo', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/permisos/correspondencia/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('conoce el veredicto', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/\| 'ROL_SIN_PERMISOS';/);
    expect(pantalla).toMatch(/ROL_SIN_PERMISOS: \{/);
  });

  it('explica qué pasa y dónde se arregla', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/no concede ni un permiso/);
    expect(pantalla).toMatch(/los permisos se asignan dentro del core/);
  });

  it('nombra el rol inerte en vez de dejarlo a la búsqueda', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/Sin permisos en el core:/);
    expect(pantalla).toMatch(/u\.rolesSinPermisos!/);
  });

  it('no se pinta de rojo: es un trámite pendiente, no una avería', () => {
    /*
     * Los roles espejo nacen así por diseño. Pintarlo como fallo invita a
     * buscar un error que no existe.
     */
    if (!hay) return;
    const bloque = pantalla.slice(
      pantalla.indexOf('ROL_SIN_PERMISOS: {'),
      pantalla.indexOf('OTRA_OFICINA: {'),
    );
    expect(bloque).toMatch(/amber/);
    expect(bloque).not.toMatch(/rose/);
  });
});
