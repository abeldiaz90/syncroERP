import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ENDPOINTS_NAVEGABLES } from './data/endpoints-navegables';
import { PLANTILLAS_PERMISOS } from './data/plantillas-permisos';

/**
 * ============================================================================
 * UNA PUERTA QUE NO ES SUYA
 * ----------------------------------------------------------------------------
 * Cuatro casos del mismo defecto, los cuatro medidos el 22-oct-2026 recorriendo
 * el front rol por rol con «Ver el ERP como otra persona» y leyendo el código
 * de respuesta real de cada consulta de cada pantalla.
 *
 * El defecto: una pantalla aparece en el menú de alguien porque tiene UNA ruta
 * que no es la que la pantalla necesita. Entra, y lo que la llena contesta 403.
 * La pantalla no falla: carga vacía, y un vacío sin explicación se lee como
 * «no hay nada», no como «esto no es tuyo».
 *
 *  1. BAJAR UNA PLANTILLA NO CONCEDE LA PANTALLA QUE LA USA.
 *     `/dashboard/inventario/stock-inicial` colgaba de `GET …/plantilla` —el
 *     Excel de ejemplo— y del listado de cargas anteriores. El `comprador`,
 *     que no puede cargar stock ni leer almacenes, la tenía en su centro de
 *     trabajo. Ahora cuelga del `POST` que carga el archivo, que es la acción
 *     que la justifica, igual que su gemela «Importar desde Excel».
 *
 *  2. UNA RUTA ABIERTA A TODOS NO CONCEDE UNA PANTALLA QUE PIDE PERMISO.
 *     `GET /catalogo/productos/atributos/:sector` va `@SkipPermisos` —es la
 *     plantilla de atributos de un sector— y apuntaba a «Atributos y
 *     variantes», que se llena con `GET /catalogo/atributos-personalizados/
 *     grupos`, que sí pide permiso. Diez de los trece roles la abrían vacía.
 *
 *  3. UN CATÁLOGO QUE NO SE PIDE NO ES UN CATÁLOGO CAÍDO.
 *     El catálogo de productos pedía `/catalogo/almacenes` siempre. Al
 *     `comprador` le contestaba 403 y la columna de filtros se pintaba en
 *     ámbar: «No se pudo consultar los almacenes. Los filtros de arriba pueden
 *     estar incompletos». Dos cosas falsas: una negativa no es una caída, y
 *     ninguno de esos filtros usa almacenes.
 *
 *  4. UN FORMULARIO QUE NO SE PUEDE LLENAR NO SE OFRECE.
 *     Pedidos de venta pintaba el alta completa a `cobranza`, que sólo tiene
 *     los tres GET: los desplegables vacíos y «Capturar pedido» contestando
 *     «Elige al menos un producto con cantidad», que no se puede obedecer.
 *
 *  5. LA LISTA LLANA NO CONCEDE LA PANTALLA DEL DIRECTORIO.
 *     «Usuarios» colgaba de `GET /usuarios` y se llena con
 *     `GET /usuarios/directorio` y `GET /admin/permisos/resumen-roles`.
 *     `gobierno` tenía la pantalla y las DOS consultas le contestaban 403.
 *
 *  6. NO PODER EDITAR NO ES NO PODER LEER.
 *     La matriz de aprobaciones pedía el padrón completo de usuarios —que es
 *     del administrador— y, al recibir 403, se declaraba sin acceso: tapaba el
 *     modo de sólo lectura que ella misma tiene escrito. Les pasaba a los cinco
 *     roles que la leen y no la escriben, `direccion` incluido. Ahora pide la
 *     lista corta y «sin acceso» significa no poder leer la matriz.
 *
 *  7. LA ACCIÓN SIN LA CONSULTA NO SIRVE, otra vez: `tesoreria` tenía la
 *     pantalla del corte de caja —el módulo `caja` es suyo— y no las ventas
 *     del día, que son la mitad de un corte. El ERP le encargaba cerrar la
 *     caja y le pedía preguntarle a otro cuánto se vendió.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

const leer = (...p: string[]) => readFileSync(join(FRONTEND!, ...p), 'utf8');
const leerBack = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('una puerta que no es suya', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  describe('1 · el stock inicial cuelga de la carga, no de la plantilla', () => {
    it('la pantalla la concede el POST', () => {
      expect(
        ENDPOINTS_NAVEGABLES['POST /catalogo/importacion/stock-inicial']
          ?.rutaFrontend,
      ).toBe('/dashboard/inventario/stock-inicial');
    });

    it('ni el listado ni la plantilla la conceden', () => {
      expect(
        ENDPOINTS_NAVEGABLES['GET /catalogo/importacion/stock-inicial'],
      ).toBeUndefined();
      const ctrl = leerBack('catalogo/controllers/importacion-stock.controller.ts');
      /*
       * La prueba de la prueba: el `@Navegable` estaba sobre `@Get('plantilla')`.
       * Que no vuelva ahí. Se mide por adyacencia, que es lo que Nest ve.
       */
      expect(ctrl).not.toMatch(/@Navegable\([\s\S]{0,120}\)\s*@Get\('plantilla'\)/);
      expect(ctrl).toMatch(/@Navegable\([\s\S]{0,120}\)\s*@Post\(\)/);
    });

    it('su gemela sigue colgando de su propia carga', () => {
      /* Es la regla que este caso copia; si se rompiera, el ejemplo dejaría de serlo. */
      expect(
        ENDPOINTS_NAVEGABLES['POST /catalogo/importacion/productos']?.rutaFrontend,
      ).toBe('/dashboard/inventario/importar');
    });
  });

  describe('2 · la plantilla por sector ya no concede «Atributos y variantes»', () => {
    it('la ruta abierta no apunta a ninguna pantalla', () => {
      expect(
        ENDPOINTS_NAVEGABLES['GET /catalogo/productos/atributos/:sector'],
      ).toBeUndefined();
    });

    it('la pantalla la concede la consulta que la llena', () => {
      const ctrl = leerBack(
        'catalogo/controllers/atributos-personalizados.controller.ts',
      );
      expect(ctrl).toMatch(
        /@Navegable\('\/dashboard\/productos\/atributos'[\s\S]{0,120}\)\s*@Get\('grupos'\)/,
      );
    });
  });

  describe('3 · los almacenes del catálogo de productos se piden sólo si se pueden', () => {
    it('la consulta va detrás del permiso, como los impuestos', () => {
      const pantalla = leer('app/dashboard/productos/page.tsx');
      expect(pantalla).toMatch(
        /tienePermiso\('GET', '\/api\/catalogo\/almacenes'\)\s*\?\s*peticion\(`\/catalogo\/almacenes`/,
      );
    });

    it('ya no se pide a secas', () => {
      /*
       * La prueba de la prueba. Esta línea exacta era la que producía el aviso
       * ámbar falso; `sinPedir` es el camino correcto cuando no hay permiso.
       */
      const pantalla = leer('app/dashboard/productos/page.tsx');
      expect(pantalla).not.toMatch(
        /\n\s+peticion\(`\/catalogo\/almacenes`, \{ headers: h \}\),/,
      );
    });
  });

  describe('4 · el alta de pedidos sólo se ofrece a quien puede capturar', () => {
    const pantalla = () => leer('app/dashboard/ventas/pedidos/page.tsx');

    it('la sección de captura va envuelta en el permiso de su POST', () => {
      expect(pantalla()).toMatch(
        /<ProtectedElement metodo="POST" ruta="\/api\/ventas\/pedidos">/,
      );
    });

    it('y sus dos catálogos ni se piden si no se puede capturar', () => {
      /*
       * El almacén y el catálogo de productos sólo alimentan los desplegables
       * del alta. Escondido el alta, pedirlos era gastar dos negativas para
       * llenar algo que ya no se pinta: es el mismo trato que los impuestos en
       * el catálogo de productos.
       */
      const t = pantalla();
      expect(t).toMatch(
        /puedeCapturar = tienePermiso\('POST', '\/api\/ventas\/pedidos'\)/,
      );
      expect(t).toMatch(
        /puedeCapturar\s*\?\s*conPermiso\(api\.get<any>\('\/catalogo\/almacenes\/para-venta'\)\)/,
      );
      expect(t).toMatch(
        /puedeCapturar\s*\?\s*conPermiso\(api\.get<any>\('\/catalogo\/productos'/,
      );
      /*
       * Y la carga se repite cuando llegan los permisos: al primer render
       * `tienePermiso` dice que no, y sin esa dependencia a quien SÍ captura le
       * faltarían los dos catálogos para siempre.
       */
      expect(t).toMatch(/\}, \[puedeCapturar\]\);/);
    });

    it('los cuatro botones del detalle también', () => {
      const t = pantalla();
      for (const [metodo, ruta] of [
        ['PATCH', '/api/ventas/pedidos/:id/confirmar'],
        ['POST', '/api/ventas/pedidos/:id/surtir'],
        ['PATCH', '/api/ventas/pedidos/:id/reintentar-apartado'],
        ['PATCH', '/api/ventas/pedidos/:id/cancelar'],
      ]) {
        expect({
          ruta,
          envuelto: t.includes(`<ProtectedElement metodo="${metodo}" ruta="${ruta}">`),
        }).toEqual({ ruta, envuelto: true });
      }
    });

    it('cada acción que la pantalla dispara tiene su envoltura', () => {
      /*
       * La prueba de la prueba, y la que aguanta el próximo botón: se cuentan
       * las escrituras que el archivo hace y se exige una envoltura por cada
       * ruta distinta. Si mañana se agrega un `api.post` sin envolver, esto
       * falla sin que nadie tenga que acordarse de venir a añadirlo.
       */
      const t = pantalla();
      const escrituras = new Set<string>();
      const re = /api\.(post|patch|put|delete)(?:<[^>]*>)?\(\s*[`']([^`']+)[`']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        escrituras.add(
          m[2].replace(/\$\{[^}]+\}/g, ':id').replace(/\/$/, ''),
        );
      }
      expect(escrituras.size).toBeGreaterThan(3);
      const sinEnvoltura = [...escrituras].filter(
        (r) => !t.includes(`ruta="/api${r}"`),
      );
      expect(sinEnvoltura.sort()).toEqual([]);
    });
  });

  describe('5 · la pantalla de usuarios cuelga del directorio', () => {
    it('la concede la consulta que la llena', () => {
      expect(
        ENDPOINTS_NAVEGABLES['GET /usuarios/directorio']?.rutaFrontend,
      ).toBe('/dashboard/usuarios');
    });

    it('la lista llana ya no la concede', () => {
      /*
       * La prueba de la prueba. `GET /usuarios` sigue existiendo y sigue
       * sirviendo —el padrón—; lo que no puede volver es a ser la llave de
       * esta pantalla.
       */
      expect(ENDPOINTS_NAVEGABLES['GET /usuarios']).toBeUndefined();
    });
  });

  describe('6 · la matriz de aprobaciones se lee sin el padrón', () => {
    const pantalla = () =>
      leer('app/dashboard/configuraciones-aprobacion/page.tsx');

    it('pide la lista corta, no el padrón del administrador', () => {
      const t = pantalla();
      expect(t).toMatch(/api\.get<Usuario\[\]>\("\/usuarios\/para-asignar"\)/);
      expect(t).not.toMatch(/api\.get<Usuario\[\]>\("\/usuarios"\)/);
    });

    it('«sin acceso» es no poder leer la matriz, no no poder editarla', () => {
      const t = pantalla();
      expect(t).toMatch(/if \(negado\(matrizRes\)\) \{\s+setSinAcceso\(true\)/);
      /* La prueba de la prueba: la condición vieja. */
      expect(t).not.toMatch(
        /if \(negado\(departamentosRes\) \|\| negado\(usuariosRes\)\) \{\s+setSinAcceso\(true\)/,
      );
      /* Y sin padrón se pasa a sólo lectura, que es lo que la pantalla ya sabía hacer. */
      expect(t).toMatch(/setPadronVedado\(negado\(departamentosRes\) \|\| negado\(usuariosRes\)\)/);
      expect(t).toMatch(/&& !padronVedado/);
    });

    it('la tienen los roles que leen la matriz, y por una sola razón escrita', () => {
      /*
       * `ACCION_ELEGIR_PERSONA` es la lista corta. Diez roles leen la matriz;
       * si a alguno le falta, su pantalla vuelve a quedarse sin a quién
       * asignar. Se exige por la CONSTANTE y no por la cadena: la razón se
       * escribe una vez.
       */
      const fuente = readFileSync(
        join(__dirname, 'data', 'plantillas-permisos.ts'),
        'utf8',
      );
      expect(fuente).toMatch(/const ACCION_ELEGIR_PERSONA = 'GET \/usuarios\/para-asignar';/);
      /* Una sola cadena literal: la de la constante. Lo demás, la constante. */
      expect(
        (fuente.match(/'GET \/usuarios\/para-asignar'/g) ?? []).length,
      ).toBe(1);

      const conLaLista = PLANTILLAS_PERMISOS.filter((p) =>
        (p.accionesIrrenunciables ?? []).includes('GET /usuarios/para-asignar'),
      ).map((p) => p.rol);
      /*
       * Los nueve roles no administradores que leen la matriz de aprobaciones
       * —medido el 22-oct-2026 contra `/admin/permisos/mis-acciones` de cada
       * uno— más hotelería, que la necesita para housekeeping.
       */
      expect(conLaLista.sort()).toEqual(
        [
          'contador',
          'credito',
          'direccion',
          'finanzas',
          'gerencia',
          'gobierno',
          'hoteleria',
          'rrhh',
          'tesoreria',
        ].sort(),
      );
    });
  });

  describe('7 · tesorería puede leer las ventas del día que cuadra', () => {
    it('la lista de ventas es irrenunciable para ese rol', () => {
      const tesoreria = PLANTILLAS_PERMISOS.find((p) => p.rol === 'tesoreria');
      expect(tesoreria).toBeDefined();
      expect(tesoreria!.accionesIrrenunciables ?? []).toContain('GET /ventas');
    });

    it('y sigue siendo sólo la lista: cobrar y anular no son suyos', () => {
      /*
       * La otra mitad del arreglo. Se le dio la CONSULTA porque sin ella el
       * corte no se puede calcular, no el módulo: una venta la cobra el
       * mostrador y la anula quien la hizo.
       */
      const tesoreria = PLANTILLAS_PERMISOS.find((p) => p.rol === 'tesoreria');
      expect(tesoreria!.modulos).not.toContain('ventas');
      const irrenunciables = tesoreria!.accionesIrrenunciables ?? [];
      expect(
        irrenunciables.filter((a) => /^(POST|PATCH|PUT|DELETE) \/ventas/.test(a)),
      ).toEqual([]);
    });
  });
});
