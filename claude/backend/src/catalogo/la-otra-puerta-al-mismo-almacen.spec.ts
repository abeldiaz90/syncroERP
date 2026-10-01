/**
 * ============================================================================
 * La otra puerta al mismo almacén
 * ----------------------------------------------------------------------------
 * Mover mercancía entre almacenes tiene un circuito con dos firmas:
 *
 *     SOLICITADA → AUTORIZADA → EN_TRANSITO → RECIBIDA
 *
 * y dos reglas que el servicio hace cumplir:
 *   · «Quien solicita la transferencia no puede autorizarla.»
 *   · «Quien envía la mercancía no puede registrar su recepción.»
 *
 * Para que ese circuito pudiera recorrerse, el 25-sep-2026 se le concedieron a
 * gerencia y dirección las acciones de autorizar y recibir.
 *
 * Y existía una SEGUNDA PUERTA a la misma habitación:
 * `POST /catalogo/inventario/productos/transferir` crea la transferencia ya en
 * `COMPLETADA`, mueve la existencia y no pide ninguna firma. Cuelga del módulo
 * `inventario`, que el almacenista tiene con escritura. La misma persona a la
 * que el circuito excluye podía mover el mismo stock entre los mismos
 * almacenes en una sola llamada.
 *
 * Un control que se puede rodear es peor que no tenerlo: el ERP aparenta
 * separación de funciones y no la tiene.
 *
 * Comprobado el 30-sep-2026: ese endpoint no lo llama el frontend ni ningún
 * otro servicio del backend. Cerrarlo no le quita nada a nadie.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

const ACCION_DIRECTA = 'POST /catalogo/inventario/productos/transferir';
const ACCION_CANCELAR_REQ = 'PATCH /compras/requisiciones/:id/cancelar';

const plantilla = (rol: string) => PLANTILLAS_PERMISOS.find((p) => p.rol === rol);
const vedadas = (rol: string) => plantilla(rol)?.accionesVedadas ?? [];
const irrenunciables = (rol: string) => plantilla(rol)?.accionesIrrenunciables ?? [];
const modulos = (rol: string) => plantilla(rol)?.modulos ?? [];

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const wms = sinComentarios(
  readFileSync(join(__dirname, 'services', 'wms.service.ts'), 'utf8'),
);
const inventario = sinComentarios(
  readFileSync(join(__dirname, 'services', 'inventario.service.ts'), 'utf8'),
);

describe('El circuito de transferencia conserva sus dos firmas', () => {
  it('quien solicita no autoriza', () => {
    expect(wms).toContain('Quien solicita la transferencia no puede autorizarla.');
  });

  it('quien envía no recibe', () => {
    expect(wms).toContain('Quien envía la mercancía no puede registrar su recepción.');
  });
});

describe('Y no hay una segunda puerta para quien el circuito excluye', () => {
  it('el almacenista tiene vedada la transferencia directa', () => {
    expect(vedadas('almacenista')).toContain(ACCION_DIRECTA);
  });

  it('ningún otro rol la gana por módulo', () => {
    /*
     * La transferencia directa cuelga de `inventario`. Si mañana otro rol
     * recibe ese módulo con escritura, vuelve a abrirse la puerta sin que
     * nadie lo note, así que la prueba mira quién lo tiene, no sólo al
     * almacenista.
     */
    const conInventarioEscritura = PLANTILLAS_PERMISOS.filter((p) =>
      (p.modulos ?? []).includes('inventario'),
    ).map((p) => p.rol);
    expect(conInventarioEscritura).toEqual(['almacenista']);
  });

  it('la transferencia directa sigue creándose ya COMPLETADA, que es el porqué', () => {
    expect(inventario).toMatch(/estado: EstadoTransferenciaInventario\.COMPLETADA/);
  });

  it('el circuito con firmas sigue siendo alcanzable por quien autoriza', () => {
    for (const rol of ['gerencia', 'direccion']) {
      expect(irrenunciables(rol)).toContain(
        'PATCH /catalogo/wms/transferencias/:id/autorizar',
      );
      expect(irrenunciables(rol)).toContain(
        'PATCH /catalogo/wms/transferencias/:id/recibir',
      );
    }
  });

  it('y el almacenista conserva el almacén: no se le quitó el módulo', () => {
    expect(modulos('almacenista')).toContain('inventario');
    expect(modulos('almacenista')).toContain('almacenes');
  });
});

describe('Quien levanta una requisición puede cancelar la suya', () => {
  const requisiciones = sinComentarios(
    readFileSync(
      join(__dirname, '..', 'compras', 'services', 'requisiciones.service.ts'),
      'utf8',
    ),
  );

  it('el servicio nombra al solicitante', () => {
    expect(requisiciones).toContain(
      'Sólo el solicitante o Compras pueden cancelar esta requisición.',
    );
    expect(requisiciones).toMatch(/req\.usuarioSolicitanteId !== usuarioId/);
  });

  it('y el almacenista, que es quien la levanta, alcanza el endpoint', () => {
    expect(irrenunciables('almacenista')).toContain('POST /compras/requisiciones');
    expect(irrenunciables('almacenista')).toContain(ACCION_CANCELAR_REQ);
    /*
     * Y no está vedada, que es la mitad que faltaba. `accionesVedadas` GANA
     * sobre `accionesIrrenunciables`, así que añadirla ahí deshace la
     * concesión sin tocarla: el mutante que lo hacía sobrevivía a la primera
     * versión de esta prueba.
     */
    expect(vedadas('almacenista')).not.toContain(ACCION_CANCELAR_REQ);
  });

  it('lo mismo para cualquier acción concedida: vedada y concedida se contradicen', () => {
    /*
     * Una acción en las dos listas es siempre un error de edición: alguien
     * quiso conceder y alguien quiso quitar, y gana quitar sin que la lista de
     * concesiones lo diga. Se revisa en todos los roles, no sólo aquí.
     */
    for (const p of PLANTILLAS_PERMISOS) {
      const enAmbas = (p.accionesIrrenunciables ?? []).filter((a) =>
        (p.accionesVedadas ?? []).includes(a),
      );
      expect({ rol: p.rol, enAmbas }).toEqual({ rol: p.rol, enAmbas: [] });
    }
  });

  it('pero sigue sin poder resolver aprobaciones de requisición', () => {
    /*
     * Cancelar la propia no es autorizar. La veda de la bandeja se queda.
     */
    expect(vedadas('almacenista')).toContain('PATCH /compras/requisiciones/aprobaciones/:id');
  });
});
