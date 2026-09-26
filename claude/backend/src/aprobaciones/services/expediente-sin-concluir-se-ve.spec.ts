/**
 * ============================================================================
 * Firmar a ciegas con una firma que parece informada
 * ----------------------------------------------------------------------------
 * LO QUE PASO, medido de punta a punta el 25-sep-2026 contra la instalación:
 *
 *   1. `credito` levanta un cliente con línea de 300 000.
 *   2. `gerencia` firma el nivel 1; `finanzas` firma el nivel 2.
 *   3. El cliente queda con `estadoSolicitudCredito: APROBADA` y 300 000.
 *
 * Y los dos únicos expedientes de validación de ese cliente decían:
 *
 *   estado: REVISION_MANUAL · limiteSugerido: 0
 *   «Validación de identidad (INE) no pudo resolverse y es un paso bloqueante.»
 *   «No hay proveedor de validación de identidad configurado.»
 *
 * Que REVISION_MANUAL no bloquee está DECIDIDO a propósito y está bien: quiere
 * decir «que lo mire una persona», y quien firma en esa bandeja es esa persona.
 *
 * Lo que no se sostiene es que nadie le enseñara el expediente. El veredicto
 * viajaba con `bloquea: false` y `mensaje: null`, así que la pantalla no
 * pintaba nada: una solicitud igual que cualquier otra, con su botón verde.
 * Delegar el juicio en una persona y no enseñarle en qué se basa no es
 * delegar; es recoger una firma que parece informada y no lo es.
 *
 * Estas pruebas fijan las dos mitades: que siga sin bloquear, y que lo diga.
 * ============================================================================
 */

import { EstadoEjecucion } from '../../integracion/validacion/validacion.constants';
import { AprobacionesDocumentosService } from './aprobaciones-documentos.service';

function servicio(historial: unknown[]) {
  const validacion = {
    flujoActivo: jest.fn(async () => ({ nombre: 'Originación con aprobación automática' })),
    historial: jest.fn(async () => historial),
  };
  const svc = new AprobacionesDocumentosService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    { lineaAutorizada: jest.fn() } as any,
    validacion as any,
  );
  return (limite = 300_000) =>
    (svc as any).evaluarValidacion('emp', 'cli', limite);
}

/** El expediente tal como lo dejó la instalación, sin proveedores enchufados. */
const COMO_EN_PRODUCCION = {
  estado: EstadoEjecucion.REVISION_MANUAL,
  limiteSolicitado: '300000.00',
  limiteSugerido: '0.00',
  simulacion: false,
  motivos: [
    '«Validación de identidad (INE)» no pudo resolverse y es un paso bloqueante.',
    'No hay proveedor de validación de identidad configurado.',
  ],
};

describe('Expediente sin concluir · no bloquea, pero se ve', () => {
  it('no bloquea: la decisión sigue siendo de la persona que firma', async () => {
    const veredicto = await servicio([COMO_EN_PRODUCCION])();

    expect(veredicto.bloquea).toBe(false);
  });

  it('pero deja de ser invisible: trae mensaje y motivos', async () => {
    const veredicto = await servicio([COMO_EN_PRODUCCION])();

    expect(veredicto.estado).toBe('NO_CONCLUIDO');
    expect(veredicto.mensaje).toBeTruthy();
    expect(veredicto.mensaje).toContain('REVISION_MANUAL');
    // El motivo concreto tiene que llegar a la pantalla, no sólo la etiqueta.
    expect(veredicto.motivos).toEqual(COMO_EN_PRODUCCION.motivos);
  });

  it('el mensaje le dice a quien firma que nadie más va a revisarlo', async () => {
    /*
     * Es la frase que cambia la decisión. «Pendiente de revisión» invita a
     * suponer que alguien más lo verá; nadie más lo va a ver.
     */
    const veredicto = await servicio([COMO_EN_PRODUCCION])();

    expect(veredicto.mensaje).toMatch(/nadie más va a revisarlo/i);
  });

  it('no inventa un límite validado cuando el expediente no concluyó', async () => {
    /*
     * `limiteSugerido` vale 0 mientras no hay veredicto, y eso NO significa
     * «validado por cero». Decirlo como número haría que la pantalla pintara
     * «Expediente vigente por $0.00», que es una afirmación que nadie hizo.
     */
    const veredicto = await servicio([COMO_EN_PRODUCCION])();

    expect(veredicto.limiteValidado).toBeNull();
  });

  it('un expediente EN_PROCESO se trata igual: se avisa, no se bloquea', async () => {
    const veredicto = await servicio([
      { ...COMO_EN_PRODUCCION, estado: EstadoEjecucion.EN_PROCESO, motivos: [] },
    ])();

    expect(veredicto.bloquea).toBe(false);
    expect(veredicto.estado).toBe('NO_CONCLUIDO');
    expect(veredicto.mensaje).toContain('EN_PROCESO');
  });

  it('un expediente favorable no levanta ningún aviso', async () => {
    const veredicto = await servicio([
      {
        ...COMO_EN_PRODUCCION,
        estado: EstadoEjecucion.APROBADA,
        limiteSugerido: '300000.00',
        motivos: [],
      },
    ])();

    expect(veredicto.estado).toBe('FAVORABLE');
    expect(veredicto.mensaje).toBeNull();
    expect(veredicto.limiteValidado).toBe(300_000);
  });

  it('el expediente RECHAZADA sigue bloqueando, que es lo distinto', async () => {
    const veredicto = await servicio([
      { ...COMO_EN_PRODUCCION, estado: EstadoEjecucion.RECHAZADA },
    ])();

    expect(veredicto.bloquea).toBe(true);
    expect(veredicto.estado).toBe('RECHAZADA');
  });
});
