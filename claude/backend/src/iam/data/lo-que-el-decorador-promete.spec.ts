/**
 * ============================================================================
 * Lo que el decorador promete, el permiso lo tiene que cumplir
 * ----------------------------------------------------------------------------
 * En este sistema conviven dos capas de autorización y sólo una concede:
 *
 *   · `PermisoEndpointGuard` mira la tabla de permisos por rol. **Concede.**
 *   · `@Roles(...)` en el controlador sólo puede **denegar**: restringe el
 *     endpoint a los roles que nombra, pero no le da el permiso a ninguno.
 *
 * De ahí un modo de fallo silencioso: un endpoint nombra a un rol en `@Roles`
 * —dejando escrito que ese trabajo es suyo— y la tabla de permisos nunca se lo
 * concede. El rol recibe 403 de la otra capa. El decorador se lee como una
 * promesa y no lo es.
 *
 * Medido el 25-sep-2026 con las nueve sesiones vivas, siete casos:
 *
 *   contador → GET /integracion/avisos                  403
 *   contador → GET /credito/productos/estado            403
 *   gerencia → GET /integracion/validacion/flujos       403
 *   gerencia → GET /integracion/validacion/capacidades  403
 *   gerencia → GET /integracion/validacion/flujos/plantilla  403
 *   gerencia → GET /integracion/validacion/tablero      403
 *   gerencia → GET /integracion/validacion/expedientes  403
 *
 * La bandeja de avisos del espejo contable es el caso que más duele: el
 * endpoint nombra al contador, la pantalla es de contabilidad, y el contador no
 * podía abrirla. Nadie miraba esos avisos.
 *
 * Esta prueba fija la otra mitad: lo que el decorador nombra, la plantilla lo
 * concede.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * Lo que cada controlador declara con `@Roles`, rol por rol. `administrador`
 * queda fuera a propósito: tiene el catálogo entero por definición.
 */
const PROMESAS: Array<{ rol: string; acciones: string[]; porque: string }> = [
  {
    rol: 'contador',
    porque:
      'La bandeja de avisos del espejo contable y la verificación contable de los productos de crédito.',
    acciones: [
      'GET /integracion/avisos',
      'PATCH /integracion/avisos/:id/resolver',
      'GET /credito/productos/estado',
      'POST /credito/productos/:id/verificar',
      'GET /integracion/conciliacion',
      'POST /integracion/conciliacion/ejecutar',
      'PATCH /integracion/conciliacion/:id/resolver',
    ],
  },
  {
    rol: 'gerencia',
    porque:
      'Deshacer una cobranza: el controlador lo reserva al mando y el permiso no estaba.',
    acciones: ['POST /credito/cobranza/pago/:id/cancelar'],
  },
  {
    rol: 'gerencia',
    porque:
      'El tablero de validación de expedientes y los flujos que lo gobiernan.',
    acciones: [
      'GET /integracion/validacion/flujos',
      'GET /integracion/validacion/flujos/:id',
      'GET /integracion/validacion/flujos/plantilla',
      'GET /integracion/validacion/capacidades',
      'GET /integracion/validacion/tablero',
      'GET /integracion/validacion/expedientes',
      'GET /integracion/validacion/expedientes/:id',
      'POST /integracion/validacion/ejecutar',
      'POST /integracion/validacion/simular',
    ],
  },
];

/**
 * La otra mitad, y la que faltaba: lo que el decorador ya NO debe nombrar.
 *
 * Siete endpoints nombraban roles de negocio que el permiso nunca les concede
 * —dirección, gerencia, cobranza— y el arreglo fue quitarlos del decorador, no
 * conceder: cambiar el plan contratado, la carga inicial, crear objetos en el
 * registro externo y la correspondencia de roles son del operador, y la capa de
 * permiso de PANTALLA ya reservaba esa pantalla al administrador. Si alguien los vuelve a nombrar sin
 * conceder, esta prueba se entera.
 */
const SOLO_DEL_ADMINISTRADOR = [
  "@Patch('configuracion')",
  "@Post('roles/mapeo')",
  "@Post('roles/aprovisionar/:usuarioId')",
  "@Post('sincronizacion-inicial')",
  "@Post('roles/espejo')",
  "@Post('roles/cuenta-servicio')",
  "@Post('evaluar-credito')",
];

const plantillaDe = (rol: string) =>
  PLANTILLAS_PERMISOS.find((p) => p.rol === rol);

describe('un rol nombrado en @Roles no recibe 403 de la otra capa', () => {
  it('los roles nombrados existen en el catálogo de plantillas', () => {
    /*
     * No es hipotético: un controlador de esta misma familia nombraba
     * `CONTABILIDAD`, que no es un rol —el rol se llama `contador`—, y al
     * encender el guardia habría dejado fuera justo a quien concilia.
     */
    const inexistentes = PROMESAS.map((p) => p.rol).filter(
      (rol) => !plantillaDe(rol),
    );
    expect(inexistentes).toEqual([]);
  });

  it('cada acción prometida está concedida', () => {
    const incumplidas: string[] = [];
    for (const promesa of PROMESAS) {
      const concedidas = plantillaDe(promesa.rol)?.accionesIrrenunciables ?? [];
      for (const accion of promesa.acciones) {
        if (!concedidas.includes(accion)) {
          incumplidas.push(`${promesa.rol} → ${accion}`);
        }
      }
    }
    expect(incumplidas.sort()).toEqual([]);
  });

  it('ninguna acción prometida está vedada a la vez', () => {
    const contradicciones: string[] = [];
    for (const promesa of PROMESAS) {
      const vedadas = plantillaDe(promesa.rol)?.accionesVedadas ?? [];
      for (const accion of promesa.acciones) {
        if (vedadas.includes(accion)) {
          contradicciones.push(`${promesa.rol} → ${accion}`);
        }
      }
    }
    expect(contradicciones).toEqual([]);
  });

  it('lo que es del operador no vuelve a nombrar a un puesto', () => {
    const texto = readFileSync(
      join(__dirname, '..', '..', 'integracion', 'controllers', 'integracion.controller.ts'),
      'utf8',
    );
    const lineas = texto.split('\n');
    const reincidentes: string[] = [];
    for (const marca of SOLO_DEL_ADMINISTRADOR) {
      const i = lineas.findIndex((l) => l.includes(marca));
      expect(i).toBeGreaterThanOrEqual(0);
      const roles = lineas[i + 1] ?? '';
      if (!/@Roles\('administrador'\)/.test(roles)) {
        reincidentes.push(`${marca} → ${roles.trim()}`);
      }
    }
    /*
     * Si esto falla porque de verdad quieres dárselo a un puesto, concédelo en
     * su plantilla y muévelo a PROMESAS, que es lo que comprueba la otra mitad.
     * Nombrarlo sin conceder deja un botón que contesta 403.
     */
    expect(reincidentes).toEqual([]);
  });
});
