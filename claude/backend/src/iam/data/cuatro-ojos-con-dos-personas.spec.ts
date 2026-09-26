/**
 * ============================================================================
 * Un control de cuatro ojos necesita dos pares de ojos
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ, medido el 25-sep-2026 contra la instalación:
 *
 *   1. `almacenista` abre un conteo cíclico de la ubicación A-01-01.
 *   2. Captura las tres existencias. El conteo pasa a PENDIENTE_AUTORIZACION.
 *   3. Intenta cerrarlo:
 *
 *      almacenista                          → 400 «La autorización del ajuste
 *                                                  debe realizarla una persona
 *                                                  distinta de quien abrió o
 *                                                  capturó el conteo.»
 *      comprador · gerencia · finanzas ·
 *      contador · tesorería                 → 403
 *
 * El conteo se queda ahí para siempre. La regla es correcta —y está bien
 * escrita— pero la acción que la satisface sólo la tenía el rol que ya había
 * contado. En una empresa con un solo almacenista, que es el caso normal,
 * NINGÚN conteo físico podía cerrarse y NINGUNA transferencia entre almacenes
 * podía autorizarse.
 *
 * Es la tercera vez que aparece esta forma en el proyecto:
 *
 *   · la primera firma de la nómina era de RRHH, que es quien la prepara;
 *   · el nivel 1 de la matriz de crédito era de `credito`, que es el único rol
 *     que origina la solicitud;
 *   · y estas dos autorizaciones del almacén.
 *
 * Por eso esta prueba no mide un caso: mide la REGLA. Cada control de cuatro
 * ojos que el sistema escribe se declara aquí con el rol que ejecuta y el que
 * autoriza, y la prueba exige que sean dos y que el segundo tenga de verdad la
 * acción concedida.
 * ============================================================================
 */

import { ENDPOINTS_NAVEGABLES } from './endpoints-navegables';
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * Los controles de cuatro ojos del sistema. `ejecuta` es quien hace el
 * documento; `autorizan` son los roles que pueden firmarlo y que NO son
 * `ejecuta`. Añadir un control aquí cuesta una línea; olvidarse de que nadie
 * puede firmarlo cuesta una entrega.
 */
const CUATRO_OJOS: Array<{
  que: string;
  accion: string;
  /** La lectura que le enseña al firmante QUÉ está firmando. */
  lee: string;
  /** La pantalla del ERP donde está el botón que firma. */
  pantalla: string;
  ejecuta: string;
  autorizan: string[];
}> = [
  {
    que: 'Cerrar un conteo físico de inventario',
    accion: 'PATCH /catalogo/wms/conteos/:id/cerrar',
    pantalla: '/dashboard/inventario/conteos',
    lee: 'GET /catalogo/wms/conteos/:id',
    ejecuta: 'almacenista',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Autorizar una transferencia entre almacenes',
    accion: 'PATCH /catalogo/wms/transferencias/:id/autorizar',
    pantalla: '/dashboard/inventario/transferencias',
    // No hay detalle propio: el listado trae las líneas de la transferencia.
    lee: 'GET /catalogo/wms/transferencias',
    ejecuta: 'almacenista',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Recibir en el destino una transferencia entre almacenes',
    accion: 'PATCH /catalogo/wms/transferencias/:id/recibir',
    pantalla: '/dashboard/inventario/transferencias',
    lee: 'GET /catalogo/wms/transferencias',
    ejecuta: 'almacenista',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Autorizar una requisición de compra',
    accion: 'PATCH /compras/requisiciones/aprobaciones/:id',
    pantalla: '/dashboard/compras/aprobaciones',
    lee: 'GET /compras/requisiciones/:id',
    ejecuta: 'almacenista',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Resolver una solicitud de vacaciones',
    accion: 'PATCH /rrhh/vacaciones/solicitudes/:id/resolver',
    pantalla: '/dashboard/rrhh/vacaciones',
    lee: 'GET /rrhh/vacaciones/solicitudes',
    ejecuta: 'rrhh',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Anular una venta',
    accion: 'PATCH /ventas/:id/anular',
    pantalla: '/dashboard/ventas/historial',
    // La bandeja del mostrador: se anula desde la venta, que ya listan.
    lee: 'GET /ventas',
    ejecuta: 'empleado',
    autorizan: ['gerencia', 'direccion'],
  },
  {
    que: 'Primera firma de la nómina',
    accion: 'PATCH /rrhh/nomina-avanzada/aprobaciones/:id',
    pantalla: '/dashboard/rrhh/nomina',
    lee: 'GET /rrhh/nomina/periodos',
    ejecuta: 'rrhh',
    autorizan: ['gerencia', 'direccion', 'finanzas'],
  },
];

const plantillaDe = (rol: string) =>
  PLANTILLAS_PERMISOS.find((p) => p.rol === rol);

/** ¿Este rol tiene esta acción concedida de forma irrenunciable? */
const tieneAccion = (rol: string, accion: string): boolean =>
  (plantillaDe(rol)?.accionesIrrenunciables ?? []).includes(accion);

/** ¿La tiene vedada? Un veto gana a cualquier concesión. */
const laTieneVedada = (rol: string, accion: string): boolean =>
  (plantillaDe(rol)?.accionesVedadas ?? []).includes(accion);

describe('Controles de cuatro ojos · alguien más tiene que poder firmar', () => {
  it('los roles declarados existen', () => {
    // Un rol mal escrito dejaría el control sin medir sin que nadie lo notara.
    const inexistentes = CUATRO_OJOS.flatMap((control) =>
      [control.ejecuta, ...control.autorizan].filter((rol) => !plantillaDe(rol)),
    );

    expect([...new Set(inexistentes)]).toEqual([]);
  });

  it('cada control tiene al menos un autorizador que no es quien ejecuta', () => {
    const rotos = CUATRO_OJOS.filter(
      (c) => c.autorizan.filter((rol) => rol !== c.ejecuta).length === 0,
    ).map((c) => c.que);

    expect(rotos).toEqual([]);
  });

  it('el autorizador tiene la acción concedida, no sólo el encargo', () => {
    /*
     * Designar a alguien como autorizador y no darle el permiso produce el peor
     * resultado: el documento se le asigna, lo ve, y al firmar recibe un 403.
     * Es lo que le pasó a Tesorería con la nómina —«podía firmar el pago y no
     * ver qué pagar»— y a gerencia con el conteo.
     */
    const sinPermiso: string[] = [];
    for (const control of CUATRO_OJOS) {
      for (const rol of control.autorizan) {
        if (!tieneAccion(rol, control.accion)) {
          sinPermiso.push(`${rol} no puede «${control.que}» (${control.accion})`);
        }
      }
    }

    expect(sinPermiso.sort()).toEqual([]);
  });

  it('nadie tiene vedada una acción que se le encarga autorizar', () => {
    // Un veto y una concesión sobre la misma acción es una contradicción que
    // gana el veto: el rol aparece como firmante y no puede firmar.
    const contradicciones: string[] = [];
    for (const control of CUATRO_OJOS) {
      for (const rol of control.autorizan) {
        if (laTieneVedada(rol, control.accion)) {
          contradicciones.push(`${rol} tiene vedada la acción que debe autorizar: ${control.accion}`);
        }
      }
    }

    expect(contradicciones).toEqual([]);
  });

  it('quien ejecuta no aparece entre quienes autorizan', () => {
    const mezclados = CUATRO_OJOS.filter((c) =>
      c.autorizan.includes(c.ejecuta),
    ).map((c) => c.que);

    expect(mezclados).toEqual([]);
  });

  it('quien firma puede leer lo que firma', () => {
    /*
     * Firmar sin poder abrir el documento es peor que no poder firmar: no da
     * un 403 que obligue a corregir, da una autorización a ciegas. Medido el
     * 25-sep-2026: `gerencia` tenía en la bandeja la requisición y la acción
     * para resolverla, y `GET /compras/requisiciones/:id` —la pantalla que el
     * propio botón abre— le contestaba 403. Podía aprobar sin ver qué.
     *
     * La concesión de autorizar y la de leer el documento son una sola cosa y
     * se declaran juntas. Esta prueba es la que lo exige.
     */
    const aCiegas: string[] = [];
    for (const control of CUATRO_OJOS) {
      for (const rol of control.autorizan) {
        if (!tieneAccion(rol, control.accion)) continue; // ya lo cubre otra prueba
        if (!tieneAccion(rol, control.lee) || laTieneVedada(rol, control.lee)) {
          aCiegas.push(
            `${rol} firma «${control.que}» sin poder leerla (${control.lee})`,
          );
        }
      }
    }

    expect(aCiegas.sort()).toEqual([]);
  });
  it('quien firma tiene puerta a la pantalla donde se firma', () => {
    /*
     * Tener la acción y la lectura no basta: al menú y al guardia de rutas del
     * frontend los alimenta `ENDPOINTS_NAVEGABLES`, que traduce «tengo este
     * endpoint» a «veo esta pantalla». Si ninguna de las acciones concedidas al
     * firmante apunta a la pantalla donde está el botón, la pantalla contesta
     * «Esta sección no está en tu perfil» y la firma es inalcanzable.
     *
     * Medido el 26-sep-2026: `/dashboard/inventario/transferencias` sólo se
     * abría con `POST /catalogo/inventario/productos/transferir` —o sea, con
     * poder CREAR la transferencia—, y quien crea es justo quien NO puede
     * autorizarla ni recibirla. La mercancía se quedó en tránsito: fuera del
     * almacén de origen y sin llegar al destino.
     */
    const sinPuerta: string[] = [];
    for (const control of CUATRO_OJOS) {
      const puertas = Object.entries(ENDPOINTS_NAVEGABLES)
        .filter(
          ([, meta]) =>
            meta.rutaFrontend === control.pantalla ||
            (meta.rutasAdicionales ?? []).includes(control.pantalla),
        )
        .map(([endpoint]) => endpoint);

      if (!puertas.length) {
        sinPuerta.push(
          `«${control.que}» se firma en ${control.pantalla}, que no está en ENDPOINTS_NAVEGABLES`,
        );
        continue;
      }

      for (const rol of control.autorizan) {
        const abre = puertas.some(
          (endpoint) => tieneAccion(rol, endpoint) && !laTieneVedada(rol, endpoint),
        );
        if (!abre) {
          sinPuerta.push(
            `${rol} firma «${control.que}» y no puede abrir ${control.pantalla}`,
          );
        }
      }
    }

    expect(sinPuerta.sort()).toEqual([]);
  });
});
