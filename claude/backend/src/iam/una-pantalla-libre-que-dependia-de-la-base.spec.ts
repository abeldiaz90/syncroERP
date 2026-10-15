import { readFileSync } from 'fs';
import { join } from 'path';
import { Reflector } from '@nestjs/core';

import { PermisosDinamicosService } from './services/permisos-dinamicos.service';
import { DocumentacionController } from '../documentacion/documentacion.controller';

/**
 * ============================================================================
 * UNA PANTALLA LIBRE QUE DEPENDÍA DE LA BASE
 * ----------------------------------------------------------------------------
 * MEDIDO el 15-oct-2026 con «Ver el ERP como otra persona», con el rol
 * empleado, en la instalación de Abel:
 *
 *   · «Ayuda y documentación» NO salía en el menú lateral.
 *   · `/dashboard/ayuda` contestaba «Esta sección no está en tu perfil».
 *
 * A los trece roles. Los cuatro manuales de usuario —que el propio
 * `DocumentacionController` marca `@SkipPermisos()` con una nota explicando
 * que son «material de consulta que cualquier sesión válida puede leer»— no
 * los leía nadie más que el administrador.
 *
 * Y la negativa remataba el defecto: «pide al administrador que la agregue
 * desde Roles y permisos». Ahí no hay nada que agregar. Un endpoint sin
 * permiso no tiene renglón que conceder, así que la pantalla mandaba a pedir
 * algo que nadie podía dar — *un control que no se puede satisfacer*.
 *
 * LA CAUSA
 *
 * `pantallasSinPermiso` —el conjunto de pantallas que se conceden a todos— se
 * llenaba DENTRO de `sincronizarControladoresYEndpoints()`, la reconciliación
 * que recorre la base endpoint por endpoint. Esa reconciliación se puede
 * saltar con `IAM_SYNC_AL_ARRANCAR=false`, que es justo lo que esta
 * instalación lleva puesto desde que el arranque dejó de terminar el 1-oct.
 * Con la bandera apagada el conjunto quedaba vacío y las pantallas libres
 * desaparecían del menú de todos.
 *
 * El atajo era legítimo y está documentado. Lo que no era legítimo es que
 * **una propiedad del código dependiera de una ida a la base**: qué pantallas
 * no piden permiso lo dice un decorador, se sabe leyendo los handlers, y
 * contarlas no cuesta una sola consulta.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el censo corra SIEMPRE —antes del atajo— y que siga siendo de memoria.
 * ============================================================================
 */

/** Un contenedor de módulos de juguete con un solo controlador: el de verdad. */
function contenedorCon(controlador: any, instancia: any) {
  const controllers = new Map([[controlador.name, { instance: instancia, metatype: controlador }]]);
  return {
    entries: () => new Map([['modulo', { controllers }]]).entries(),
  } as any;
}

function servicio() {
  const container = contenedorCon(
    DocumentacionController,
    new DocumentacionController({} as any),
  );
  const svc = new PermisosDinamicosService(
    {} as any,
    {} as any,
    {} as any,
    container,
    new Reflector(),
    /* El dataSource queda sin usar a propósito: si el censo lo tocara, esto
       reventaría, y eso es exactamente lo que se quiere comprobar. */
    null as any,
  );
  return svc;
}

describe('Permisos · una pantalla libre que dependía de la base', () => {
  it('el censo encuentra la pantalla de los manuales sin tocar la base', () => {
    const svc = servicio();
    const cuantas = svc.censarPantallasSinPermiso();
    expect(cuantas).toBeGreaterThan(0);
    const rutas = (svc as any).pantallasSinPermiso as Set<string>;
    expect([...rutas]).toContain('/dashboard/ayuda');
  });

  it('y las pantallas libres entran en las rutas de cualquier rol', async () => {
    /*
     * `obtenerRutasPermitidas` consulta la base para lo concedido y añade las
     * libres al final, «sin condición». Aquí la consulta devuelve cero filas
     * —un rol sin un solo permiso— y aun así la pantalla de los manuales
     * tiene que estar: ésa es la promesa que se rompió.
     */
    const svc = servicio();
    svc.censarPantallasSinPermiso();
    (svc as any).permisoRepo = {
      createQueryBuilder: () => {
        const qb: any = {};
        for (const m of ['innerJoin', 'where', 'andWhere', 'select', 'addSelect']) qb[m] = () => qb;
        qb.getRawMany = async () => [];
        return qb;
      },
    };
    const rutas = await svc.obtenerRutasPermitidas('empleado', 'e1');
    expect(rutas).toContain('/dashboard/ayuda');
  });

  it('el censo corre ANTES del atajo, no dentro de la reconciliación', () => {
    /*
     * La prueba de la prueba. Lo de arriba seguiría verde si alguien volviera
     * a meter el censo dentro de `sincronizarControladoresYEndpoints()`: el
     * conjunto se llenaría igual *cuando esa función corre*. El defecto era
     * que no corre siempre.
     */
    const fuente = readFileSync(
      join(__dirname, 'services', 'permisos-dinamicos.service.ts'),
      'utf8',
    );
    const arranque = fuente.slice(
      fuente.indexOf('async onApplicationBootstrap()'),
      fuente.indexOf('censarPantallasSinPermiso(): number'),
    );
    const censo = arranque.indexOf('this.censarPantallasSinPermiso()');
    const atajo = arranque.indexOf("IAM_SYNC_AL_ARRANCAR === 'false'");
    expect(censo).toBeGreaterThan(-1);
    expect(atajo).toBeGreaterThan(-1);
    expect(censo).toBeLessThan(atajo);
  });

  it('y no se calcula en dos sitios, que es como vuelven a separarse', () => {
    const fuente = readFileSync(
      join(__dirname, 'services', 'permisos-dinamicos.service.ts'),
      'utf8',
    );
    const veces = [...fuente.matchAll(/pantallasSinPermiso\.add\(/g)].length;
    /* Sólo dentro del censo: la ruta principal y sus rutas adicionales. */
    expect(veces).toBe(2);
  });
});
