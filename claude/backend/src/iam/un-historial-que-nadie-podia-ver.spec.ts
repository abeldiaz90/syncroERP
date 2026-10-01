/**
 * ============================================================================
 * Un historial que nadie podía ver
 * ----------------------------------------------------------------------------
 * EL DEFECTO QUE ESTO PREVIENE
 *
 * Una ruta nueva nace sin permisos. Si se agrega un `.../aprobaciones/historial`
 * y nadie hereda el permiso de su bandeja de pendientes, el efecto práctico es
 * que la función no existe: la pestaña contesta 403, quien firma concluye que
 * no se puede, y nadie reporta un error porque no hay ninguno. Es la forma más
 * silenciosa de entregar algo que no sirve.
 *
 * La bandeja central ya tenía ese acarreo escrito a mano para su propio par.
 * Al agregar los dos historiales de compras —requisiciones y adjudicaciones—
 * eso pasó a ser una lista, y esta prueba es lo que impide que el cuarto par se
 * agregue al controlador y se olvide en la lista.
 *
 * CÓMO
 *
 * Se leen los controladores y se arma la ruta real de cada handler
 * `@Get('…historial')`. Toda ruta de historial que tenga una bandeja de
 * pendientes hermana tiene que estar en `HISTORIALES_QUE_HEREDAN`, y los pares
 * declarados en esa lista tienen que corresponder a rutas que existen de
 * verdad.
 *
 * Es una prueba de texto sobre el código, con la limitación que eso tiene: dice
 * que el par está declarado, no que el acarreo funcione. Lo segundo lo cubre el
 * arranque contra una base real. Lo que esta prueba evita es el olvido, que es
 * lo que de hecho pasó.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { PermisosDinamicosService } from './services/permisos-dinamicos.service';
import { join } from 'path';

const SRC = join(__dirname, '..');

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const controladores = (): string[] => {
  const salida: string[] = [];
  const caminar = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const completo = join(dir, nombre);
      if (statSync(completo).isDirectory()) caminar(completo);
      else if (completo.endsWith('.controller.ts') && !completo.endsWith('.spec.ts'))
        salida.push(completo);
    }
  };
  caminar(SRC);
  return salida;
};

/** Las rutas GET completas de cada controlador, con su prefijo. */
const rutasGet = (): string[] => {
  const rutas: string[] = [];
  for (const archivo of controladores()) {
    const texto = sinComentarios(readFileSync(archivo, 'utf8'));
    const prefijo = /@Controller\(\s*'([^']*)'\s*\)/.exec(texto)?.[1] ?? '';
    for (const hallazgo of texto.matchAll(/@Get\(\s*'([^']*)'\s*\)/g)) {
      const cola = hallazgo[1];
      rutas.push(`/${[prefijo, cola].filter(Boolean).join('/')}`);
    }
  }
  return rutas;
};

/** La lista declarada en el servicio de permisos, leída de su texto. */
const paresDeclarados = (): Array<{ pendientes: string; historial: string }> => {
  const texto = sinComentarios(
    readFileSync(
      join(SRC, 'iam', 'services', 'permisos-dinamicos.service.ts'),
      'utf8',
    ),
  );
  const bloque = /HISTORIALES_QUE_HEREDAN[^[]*\[([\s\S]*?)\n  \];/.exec(texto);
  expect(bloque).not.toBeNull();
  const pares: Array<{ pendientes: string; historial: string }> = [];
  for (const hallazgo of bloque![1].matchAll(
    /pendientes:\s*'([^']+)'\s*,\s*historial:\s*'([^']+)'/g,
  )) {
    pares.push({ pendientes: hallazgo[1], historial: hallazgo[2] });
  }
  return pares;
};

describe('Todo historial hereda el permiso de su bandeja', () => {
  it('la lista no está vacía y se lee bien', () => {
    const pares = paresDeclarados();
    expect(pares.length).toBeGreaterThanOrEqual(3);
    expect(pares.map((p) => p.historial)).toContain('/aprobaciones/historial');
  });

  it('cada par declarado corresponde a dos rutas que existen', () => {
    const rutas = new Set(rutasGet());
    const faltantes: string[] = [];
    for (const par of paresDeclarados()) {
      if (!rutas.has(par.pendientes)) faltantes.push(`no existe ${par.pendientes}`);
      if (!rutas.has(par.historial)) faltantes.push(`no existe ${par.historial}`);
    }
    expect(faltantes).toEqual([]);
  });

  it('ningún historial con bandeja hermana se queda fuera de la lista', () => {
    /*
     * Ésta es la prueba que importa. El día que alguien agregue
     * `.../aprobaciones/historial` a un controlador nuevo y olvide la lista,
     * esto falla aquí y no en la pantalla de quien tenía que firmar.
     */
    const rutas = rutasGet();
    const heredados = new Set(paresDeclarados().map((p) => p.historial));
    const olvidados = rutas.filter((ruta) => {
      if (!ruta.endsWith('/historial')) return false;
      const hermana = ruta.replace(/\/historial$/, '/pendientes');
      return rutas.includes(hermana) && !heredados.has(ruta);
    });
    expect(olvidados).toEqual([]);
  });

  it('los dos historiales de compras están cubiertos', () => {
    const heredados = paresDeclarados().map((p) => p.historial);
    expect(heredados).toContain('/compras/requisiciones/aprobaciones/historial');
    expect(heredados).toContain('/compras/cotizaciones/aprobaciones/historial');
  });
});

/*
 * ============================================================================
 * Y ahora ejecutándolo, no leyéndolo
 * ----------------------------------------------------------------------------
 * Las pruebas de arriba miran el texto del código: dicen que el par está
 * declarado. Comprobé que con eso NO basta —vacié el cuerpo del bucle, de modo
 * que la lista seguía escrita y el acarreo no ocurría, y las cuatro seguían en
 * verde—. Es exactamente el error que ya se cometió en este ERP con la regla de
 * la traza completa: escrita, documentada, cubierta, y al revés.
 *
 * Así que esto corre el método con repositorios de mentira y comprueba lo
 * único que importa: que quien podía ver la bandeja acabe pudiendo ver su
 * historial.
 * ============================================================================
 */
describe('El acarreo del permiso, ejecutado', () => {
  const PARES = [
    ['/aprobaciones/pendientes', '/aprobaciones/historial'],
    [
      '/compras/requisiciones/aprobaciones/pendientes',
      '/compras/requisiciones/aprobaciones/historial',
    ],
    [
      '/compras/cotizaciones/aprobaciones/pendientes',
      '/compras/cotizaciones/aprobaciones/historial',
    ],
  ];

  /** Un mundo con los seis endpoints y un permiso sobre cada bandeja. */
  const nuevoMundo = () => {
    const endpoints = PARES.flat().map((ruta, i) => ({
      id: `ep-${i}`,
      metodo: 'GET',
      ruta,
      activo: true,
    }));
    const permisos: any[] = PARES.map(([pendientes], i) => ({
      id: `perm-${i}`,
      empresaId: 'empresa',
      rol: 'COMPRADOR',
      endpointId: endpoints.find((e) => e.ruta === pendientes)!.id,
      permitido: true,
    }));

    const servicio: any = Object.create(PermisosDinamicosService.prototype);
    servicio.endpointRepo = {
      findOne: async ({ where }: any) =>
        endpoints.find(
          (e) =>
            e.metodo === where.metodo &&
            e.ruta === where.ruta &&
            e.activo === where.activo,
        ) ?? null,
    };
    servicio.permisoRepo = {
      find: async ({ where }: any) =>
        permisos.filter(
          (p) =>
            p.endpointId === where.endpointId && p.permitido === where.permitido,
        ),
      findOne: async ({ where }: any) =>
        permisos.find(
          (p) =>
            p.empresaId === where.empresaId &&
            p.rol === where.rol &&
            p.endpointId === where.endpointId,
        ) ?? null,
      create: (datos: any) => ({ ...datos }),
      save: async (fila: any) => {
        const i = permisos.findIndex(
          (p) =>
            p.empresaId === fila.empresaId &&
            p.rol === fila.rol &&
            p.endpointId === fila.endpointId,
        );
        if (i >= 0) permisos[i] = { ...permisos[i], ...fila };
        else permisos.push({ ...fila });
        return fila;
      },
    };
    return { servicio, endpoints, permisos };
  };

  const puede = (permisos: any[], endpoints: any[], ruta: string) => {
    const ep = endpoints.find((e) => e.ruta === ruta)!;
    return Boolean(
      permisos.find((p) => p.endpointId === ep.id && p.permitido === true),
    );
  };

  it('quien podía ver la bandeja acaba pudiendo ver su historial, en los tres pares', async () => {
    const { servicio, endpoints, permisos } = nuevoMundo();
    for (const [, historial] of PARES) {
      expect(puede(permisos, endpoints, historial)).toBe(false);
    }

    await servicio.sincronizarPermisoHistorialAprobaciones();

    for (const [, historial] of PARES) {
      expect(puede(permisos, endpoints, historial)).toBe(true);
    }
  });

  it('un permiso de historial apagado a mano se vuelve a encender', async () => {
    const { servicio, endpoints, permisos } = nuevoMundo();
    const ep = endpoints.find((e) => e.ruta === '/aprobaciones/historial')!;
    permisos.push({
      empresaId: 'empresa',
      rol: 'COMPRADOR',
      endpointId: ep.id,
      permitido: false,
    });

    await servicio.sincronizarPermisoHistorialAprobaciones();
    expect(puede(permisos, endpoints, '/aprobaciones/historial')).toBe(true);
  });

  it('no inventa permisos para quien no tenía la bandeja', async () => {
    /*
     * Hereda, no reparte. Si el acarreo diera acceso a roles que no atienden
     * la bandeja, estaría abriendo decisiones ajenas a quien nadie autorizó.
     */
    const { servicio, permisos } = nuevoMundo();
    const antes = new Set(permisos.map((p) => p.rol));
    await servicio.sincronizarPermisoHistorialAprobaciones();
    expect(new Set(permisos.map((p) => p.rol))).toEqual(antes);
  });
});
