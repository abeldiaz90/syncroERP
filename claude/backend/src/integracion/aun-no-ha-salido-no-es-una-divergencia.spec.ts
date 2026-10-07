/**
 * ============================================================================
 * «Aún no ha salido» no es una divergencia entre los dos libros
 * ----------------------------------------------------------------------------
 * La conciliación contable compara, póliza por póliza, lo que se registró en
 * el ERP contra el asiento del mayor externo. Para toda póliza con vínculo y
 * sin identificador externo marcaba `VINCULO_INCOMPLETO` y aconsejaba
 * «Reintenta desde el espejo contable».
 *
 * Medido en vivo el 7-oct-2026 con las dos pólizas de una devolución: su
 * evento del outbox estaba en REINTENTABLE porque el core todavía no llega a
 * esa fecha —«The journal entry cannot be made for a future date»— y el
 * despachador las reintenta solo cuando llegue.
 *
 *   · El consejo era imposible de seguir: reintentar AHORA no puede funcionar.
 *   · El rojo era permanente: nadie podía apagarlo haciendo nada.
 *   · Y la conciliación contaba como diferencia entre los dos libros algo que
 *     la cola de al lado ya daba por atendido y resuelto solo.
 *
 * Un control que casi siempre está encendido por lo que se arregla sin nadie
 * se acaba mirando por encima, que es lo único que un control no se puede
 * permitir.
 *
 * Ahora se le pregunta a la cola y se dice lo que de verdad pasa: «todavía no
 * ha salido, y por esto». Cuenta aparte, no abre aviso, y cierra el consejo
 * falso que quedó abierto ayer.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ContabilidadConciliacionService } from './services/contabilidad-conciliacion.service';
import { EstadoAviso } from './entities/aviso-integracion.entity';
import { EstadoEventoIntegracion, TipoEventoIntegracion } from './integracion.constants';

/**
 * Un escenario con UNA póliza vinculada y sin identificador externo: el caso
 * exacto que se reportaba mal. Lo único que cambia entre pruebas es qué dice
 * la cola de salida sobre ella.
 */
function escenario(evento: Record<string, unknown> | null) {
  const externa = {
    proveedor: 'fineract',
    configurado: () => true,
    disponible: () => true,
    consultarAsiento: jest.fn(),
  };
  const links = {
    find: jest.fn().mockResolvedValue([
      { entidadId: 'poliza-1', idExterno: null, estadoRemoto: 'NO_ENVIADO' },
    ]),
  };
  const polizas = {
    findOne: jest.fn().mockResolvedValue({ folio: 'DI-2026-00007', partidas: [] }),
  };
  const mappings = { find: jest.fn().mockResolvedValue([]) };
  const cfg = { findOne: jest.fn().mockResolvedValue({ oficinaContableExterna: '1' }) };
  const builder: any = {};
  for (const clave of ['insert', 'values', 'orIgnore']) builder[clave] = jest.fn().mockReturnValue(builder);
  builder.execute = jest.fn().mockResolvedValue({});
  const avisos = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const eventos = { findOne: jest.fn().mockResolvedValue(evento) };
  const service = new ContabilidadConciliacionService(
    externa as any, {} as any, links as any, polizas as any,
    mappings as any, cfg as any, avisos as any, eventos as any,
  );
  return { service, avisos, builder, eventos, externa };
}

describe('Una póliza que espera su fecha no es una diferencia', () => {
  it('no cuenta como discrepancia, y se dice aparte con su motivo', async () => {
    const s = escenario({
      estado: EstadoEventoIntegracion.REINTENTABLE,
      proximoIntento: new Date('2026-10-09T00:00:00Z'),
      ultimoError: 'The journal entry cannot be made for a future date',
    });
    const r = await s.service.conciliarEmpresa('empresa');

    // Lo que importa: el contador que mira una persona no se enciende.
    expect(r.discrepancias).toBe(0);
    expect(r.hallazgos).toHaveLength(0);

    // Y no desaparece: se dice, aparte, con el motivo que escribió la cola.
    expect(r.enCamino).toHaveLength(1);
    expect(r.enCamino[0].codigo).toBe('PENDIENTE_DE_SALIR');
    expect(r.enCamino[0].folio).toBe('DI-2026-00007');
    expect(r.enCamino[0].detalle).toContain('Todavía no ha salido');
    expect(r.enCamino[0].detalle).toContain('2026-10-09');
    expect(r.enCamino[0].detalle).toContain('cannot be made for a future date');
    /*
     * Y UNA SOLA VEZ cada cosa. Medido por pantalla el 7-oct: el motivo de la
     * cola ya es una frase escrita para una persona, y anteponerle un «Dijo:»
     * propio dejaba tres «se reintenta» y dos «Dijo:» en el mismo renglón.
     */
    expect(r.enCamino[0].detalle).not.toContain('Dijo:');
  });

  it('un motivo largo se corta en una palabra, no a media palabra', async () => {
    /*
     * El corte anterior era a 200 caracteres a secas y dejaba cosas como
     * «…cannot be made for a future ». Un mensaje técnico cortado así se lee
     * como una avería del sistema en vez de como una explicación.
     */
    const largo = 'La fecha de este documento todavía no ha llegado. '.repeat(12);
    const s = escenario({
      estado: EstadoEventoIntegracion.REINTENTABLE,
      proximoIntento: null,
      ultimoError: largo,
    });
    const r = await s.service.conciliarEmpresa('empresa');
    const detalle: string = r.enCamino[0].detalle;
    expect(detalle.endsWith('…')).toBe(true);
    // Termina en una palabra completa, no partida.
    expect(detalle.slice(0, -1)).toMatch(/[\wáéíóúñ]$/i);
    expect(detalle.length).toBeLessThan(320);
  });

  it('no abre aviso: no hay nada que pedirle a nadie', async () => {
    const s = escenario({
      estado: EstadoEventoIntegracion.PENDIENTE,
      proximoIntento: null,
      ultimoError: null,
    });
    const r = await s.service.conciliarEmpresa('empresa', true);
    expect(r.enCamino).toHaveLength(1);
    expect(r.enCamino[0].detalle).toContain('siguiente despacho');
    expect(s.builder.values).not.toHaveBeenCalled();
  });

  it('y cierra el consejo falso que quedó abierto ayer', async () => {
    /*
     * El aviso de ayer decía «reintenta desde el espejo contable». Dejarlo
     * abierto es mandar a una persona a pulsar un botón que no puede funcionar
     * hasta que el core llegue a la fecha.
     */
    const s = escenario({
      estado: EstadoEventoIntegracion.REINTENTABLE,
      proximoIntento: new Date('2026-10-09T00:00:00Z'),
      ultimoError: 'future date',
    });
    await s.service.conciliarEmpresa('empresa', true);
    expect(s.avisos.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado: EstadoAviso.PENDIENTE }),
      // Sin `resueltoPor`: no lo resolvió una persona.
      expect.objectContaining({ estado: EstadoAviso.PROCESADO, resueltoPor: null }),
    );
  });

  it('le pregunta a la cola por el hecho correcto, no por cualquiera', async () => {
    /*
     * El outbox es UNO solo y lleva dentro cartera y contabilidad. Mirar la
     * fila equivocada daría un «ya va en camino» sobre otro hecho: un control
     * que mira mal es peor que no mirar.
     */
    const s = escenario(null);
    await s.service.conciliarEmpresa('empresa');
    expect(s.eventos.findOne).toHaveBeenCalledWith({
      where: {
        empresaId: 'empresa',
        entidadId: 'poliza-1',
        tipo: TipoEventoIntegracion.POLIZA_REGISTRADA,
      },
      order: { fechaCreacion: 'DESC' },
    });
  });
});

describe('Lo que sí es una divergencia sigue siéndolo', () => {
  it('sin evento en la cola: el vínculo incompleto se reporta como antes', async () => {
    const s = escenario(null);
    const r = await s.service.conciliarEmpresa('empresa');
    expect(r.discrepancias).toBe(1);
    expect(r.hallazgos[0].codigo).toBe('VINCULO_INCOMPLETO');
    expect(r.enCamino).toHaveLength(0);
  });

  it('un evento ya cerrado no excusa nada', async () => {
    /*
     * ENVIADO, FALLIDO y DESCARTADO no vuelven solos. Si el vínculo sigue sin
     * identificador con el evento en ese estado, hay algo que mirar de verdad,
     * y taparlo con «ya va en camino» sería peor que el defecto original.
     */
    for (const estado of [
      EstadoEventoIntegracion.ENVIADO,
      EstadoEventoIntegracion.FALLIDO,
      EstadoEventoIntegracion.DESCARTADO,
    ]) {
      const s = escenario({ estado, proximoIntento: null, ultimoError: 'x' });
      const r = await s.service.conciliarEmpresa('empresa');
      expect(r.discrepancias).toBe(1);
      expect(r.hallazgos[0].codigo).toBe('VINCULO_INCOMPLETO');
      expect(r.enCamino).toHaveLength(0);
    }
  });
});

describe('Y la puerta de salir del espejo no se queda sin guardia', () => {
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Bajar de ESPEJO se bloquea con dos preguntas, no con una.
   *
   * Una de ellas es `discrepanciasAbiertas`, y a partir de hoy ya no cuenta
   * las pólizas que sólo esperan su fecha. Si ésa fuera la única guardia,
   * cualquiera podría apagar el espejo dejando asientos a medio salir.
   *
   * No lo es: la otra pregunta, `eventosSinResolver`, cuenta exactamente
   * PENDIENTE, REINTENTABLE y FALLIDO, que son esos mismos. Esta prueba fija
   * las dos a la vez para que quitar una «porque la otra ya lo mira» deje de
   * ser un cambio inocente.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const leer = (...partes: string[]) => readFileSync(join(__dirname, ...partes), 'utf8');
  const controlador = leer('controllers', 'integracion.controller.ts');
  const outbox = leer('services', 'integracion-outbox.service.ts');

  it('siguen siendo dos preguntas, no una', () => {
    expect(controlador).toMatch(/discrepanciasAbiertas: async \(id\)/);
    expect(controlador).toMatch(/eventosSinResolver: \(id\)/);
  });

  it('y la segunda cuenta justo los estados que la primera ya no cuenta', () => {
    const i = outbox.indexOf('async contarSinEntregar');
    expect(i).toBeGreaterThan(-1); // si se renombra, esto no mide nada
    const cuenta = outbox.slice(i, i + 500);
    for (const estado of ['PENDIENTE', 'REINTENTABLE', 'FALLIDO']) {
      expect(cuenta).toContain(`EstadoEventoIntegracion.${estado}`);
    }
  });
});

describe('Y la pantalla las dice con dos palabras distintas', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/finanzas/espejo-contable/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('la pantalla que se mide es la que está viva', () => {
    // Si esta ruta se mueve, las tres pruebas de abajo medirían la nada.
    expect(hay).toBe(true);
  });

  it('las enseña, y no en el mismo ámbar que un «no coincide»', () => {
    expect(pantalla).toMatch(/enCamino\?: Hallazgo\[\]/);
    expect(pantalla).toMatch(/Todavía no han salido \(/);
    expect(pantalla).toMatch(/Por qué no ha salido/);
  });

  it('el verde no se lee como «ya está todo» cuando faltan por salir', () => {
    /*
     * Con cero discrepancias la pantalla dice «Coinciden». Si además hay
     * pólizas que ni han salido, decirlo sólo abajo deja la frase de arriba
     * afirmando más de lo que se midió.
     */
    const iCoinciden = pantalla.indexOf('Coinciden en las');
    const iAviso = pantalla.indexOf('Faltan {conciliacion.enCamino!.length} por salir');
    expect(iCoinciden).toBeGreaterThan(-1);
    expect(iAviso).toBeGreaterThan(iCoinciden);
  });
});
