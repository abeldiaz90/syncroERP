import { PLANTILLAS_PERMISOS } from './data/plantillas-permisos';
import { normalizarRol } from './utils/roles.util';

/**
 * ============================================================================
 * Un botón que siempre contesta que no
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, por pantalla, con la sesión de gerencia
 *
 * La transferencia TRF-20260928192033-BD48E8 —solicitada por el almacenista—
 * se autorizó sin problema desde gerencia. Acto seguido la misma fila ofreció
 * el botón de «Enviar», y el servidor contestó **403**. Dos veces.
 *
 * Y el servidor tiene razón. El reparto es deliberado y sostiene el tercer
 * control de cuatro ojos:
 *
 *     almacenista  solicita  y  ENVÍA   (el acto físico del almacén origen)
 *     gerencia     AUTORIZA  y  RECIBE  (la firma de supervisión)
 *
 * Si gerencia pudiera enviar, podría enviar y recibir la misma transferencia,
 * y «quien envía no puede registrar su recepción» se quedaría en una frase.
 *
 * El defecto, por tanto, no era el 403: era ofrecer el botón. Es la misma
 * familia que este proyecto ya persiguió dos veces —la bandeja de
 * requisiciones que gerencia veía y no podía resolver, la pantalla que abre y
 * contesta que no—, y la cura es la misma: que la pantalla PREGUNTE en vez de
 * adivinar. De ahí `GET /admin/permisos/mis-acciones`.
 *
 * Esta prueba fija el reparto para que no se «arregle» por el lado cómodo:
 * conceder `enviar` a gerencia haría desaparecer el 403 y se llevaría por
 * delante el control de cuatro ojos, que es lo que de verdad importa.
 * ============================================================================
 */

const ENVIAR = 'PATCH /catalogo/wms/transferencias/:id/enviar';
const AUTORIZAR = 'PATCH /catalogo/wms/transferencias/:id/autorizar';
const RECIBIR = 'PATCH /catalogo/wms/transferencias/:id/recibir';
const CERRAR_CONTEO = 'PATCH /catalogo/wms/conteos/:id/cerrar';

const plantilla = (rol: string) =>
  PLANTILLAS_PERMISOS.find((p) => normalizarRol(p.rol) === normalizarRol(rol));

const concede = (rol: string, accion: string): boolean =>
  (plantilla(rol)?.accionesIrrenunciables ?? []).includes(accion);

describe('Transferencias · quien envía no es quien firma', () => {
  it('las plantillas que la prueba mide existen', () => {
    for (const rol of ['almacenista', 'gerencia', 'direccion']) {
      expect(plantilla(rol)).toBeDefined();
    }
  });

  it('gerencia y dirección firman —autorizan y reciben— pero no envían', () => {
    for (const rol of ['gerencia', 'direccion']) {
      expect({ rol, autorizar: concede(rol, AUTORIZAR) }).toEqual({
        rol,
        autorizar: true,
      });
      expect({ rol, recibir: concede(rol, RECIBIR) }).toEqual({
        rol,
        recibir: true,
      });
      /*
       * Y NO envían. Conceder esto haría desaparecer el 403 que se midió y se
       * llevaría por delante el control: la misma persona podría enviar y
       * recibir.
       */
      expect({ rol, enviar: concede(rol, ENVIAR) }).toEqual({
        rol,
        enviar: false,
      });
    }
  });

  it('cerrar un conteo también es firma, no operación', () => {
    for (const rol of ['gerencia', 'direccion']) {
      expect({ rol, cerrar: concede(rol, CERRAR_CONTEO) }).toEqual({
        rol,
        cerrar: true,
      });
    }
  });
});

describe('Permisos · una pantalla puede preguntar por sus botones', () => {
  it('el endpoint de acciones propias no pide permiso para consultarse', () => {
    /*
     * Misma decisión que `mis-rutas`, y por la misma razón: sólo revela lo que
     * el JWT de quien pregunta ya concede. Exigirle permiso lo volvería
     * inservible justo para los roles que más lo necesitan.
     */
    const fuente: string = require('fs').readFileSync(
      require('path').join(__dirname, 'controllers/admin-permisos.controller.ts'),
      'utf8',
    );
    const bloque = fuente.slice(
      fuente.indexOf('mis-acciones') - 400,
      fuente.indexOf('mis-acciones') + 200,
    );
    expect(bloque).toMatch(/@SkipPermisos\(\)/);
  });

  it('el administrador recibe el comodín, igual que en las rutas', () => {
    const fuente: string = require('fs').readFileSync(
      require('path').join(
        __dirname,
        'services/permisos-dinamicos.service.ts',
      ),
      'utf8',
    );
    const desde = fuente.indexOf('async obtenerAccionesPermitidas');
    expect(desde).toBeGreaterThan(-1);
    expect(fuente.slice(desde, desde + 400)).toMatch(
      /esRolAdministrador\(rol\)\s*\)?\s*return \['\*'\]/,
    );
  });
});
