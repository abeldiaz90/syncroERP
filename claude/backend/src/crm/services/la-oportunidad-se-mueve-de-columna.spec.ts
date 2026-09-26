import { CrmService } from './crm.service';
import {
  EtapaEmbudo,
  HistorialEtapa,
  Oportunidad,
  Prospecto,
  TipoEtapa,
} from '../entities/crm.entity';

/**
 * ============================================================================
 * La oportunidad se movía de probabilidad, no de columna
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se movió OPP-000002 de «Prospecto» a «Contactado» desde el tablero. La
 * llamada contestó 200. El pronóstico ponderado de arriba cambió —de $6,125 a
 * $8,038, que es exactamente lo que da si esa oportunidad pasa del 10 % al
 * 25 %—. Y la tarjeta se quedó en la columna de la que salió.
 *
 * La entidad se carga con `relations: ['etapa']`, así que lleva las dos caras
 * de lo mismo: la columna `etapaId` y el objeto `etapa`. Al guardar, TypeORM
 * escribe la llave que trae la RELACIÓN, no la columna suelta, y la relación
 * seguía apuntando a la etapa vieja. La probabilidad, que es una columna
 * normal, sí se guardaba: de ahí que el número de arriba se moviera y las
 * tarjetas no.
 *
 * El tablero es la pantalla entera de este módulo. Enseñaba una cosa distinta
 * de la que decía su propio total.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que al mover una oportunidad se guarden las dos caras apuntando al destino,
 * y que el historial conserve el nombre de la etapa de la que salió —que
 * también se leía después de pisarlo—.
 * ============================================================================
 */

const PROSPECTO_ETAPA = {
  id: 'etapa-prospecto',
  empresaId: 'e1',
  nombre: 'Prospecto',
  probabilidad: 10,
  tipo: TipoEtapa.ABIERTA,
} as unknown as EtapaEmbudo;

const CONTACTADO = {
  id: 'etapa-contactado',
  empresaId: 'e1',
  nombre: 'Contactado',
  probabilidad: 25,
  tipo: TipoEtapa.ABIERTA,
} as unknown as EtapaEmbudo;

function crear() {
  const oportunidad = {
    id: 'o1',
    empresaId: 'e1',
    folio: 'OPP-000002',
    etapaId: PROSPECTO_ETAPA.id,
    etapa: PROSPECTO_ETAPA,
    probabilidad: 10,
    fechaCreacion: new Date(),
    fechaUltimoMovimiento: new Date(),
    prospectoId: null,
  } as unknown as Oportunidad;

  const guardadas: Oportunidad[] = [];
  const historial: HistorialEtapa[] = [];

  const repos = new Map<unknown, unknown>([
    [
      Oportunidad,
      {
        findOne: async () => oportunidad,
        save: async (o: Oportunidad) => {
          guardadas.push({ ...o } as Oportunidad);
          return o;
        },
      },
    ],
    [
      EtapaEmbudo,
      { findOne: async () => CONTACTADO },
    ],
    [
      HistorialEtapa,
      {
        create: (h: HistorialEtapa) => h,
        save: async (h: HistorialEtapa) => {
          historial.push(h);
          return h;
        },
      },
    ],
    [Prospecto, { findOne: async () => null }],
  ]);

  const manager = {
    getRepository: (entidad: unknown) => {
      const r = repos.get(entidad);
      if (!r) throw new Error('Repositorio no esperado');
      return r;
    },
  };
  const dataSource = { transaction: async (cb: any) => cb(manager) };

  const servicio = new CrmService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
  );
  return { servicio, guardadas, historial };
}

describe('CRM · la oportunidad se mueve de columna, no sólo de probabilidad', () => {
  it('guarda la columna Y la relación apuntando a la etapa destino', async () => {
    const { servicio, guardadas } = crear();

    await servicio.moverEtapa('o1', { etapaId: CONTACTADO.id }, 'e1', 'u1');

    expect(guardadas).toHaveLength(1);
    const guardada = guardadas[0] as unknown as {
      etapaId: string;
      etapa: { id: string };
      probabilidad: number;
    };
    expect(guardada.etapaId).toBe(CONTACTADO.id);
    /* Ésta es la que faltaba: sin ella TypeORM reescribe la llave vieja. */
    expect(guardada.etapa.id).toBe(CONTACTADO.id);
    expect(guardada.probabilidad).toBe(25);
  });

  it('el historial conserva el nombre de la etapa de la que salió', async () => {
    const { servicio, historial } = crear();

    const r = await servicio.moverEtapa(
      'o1',
      { etapaId: CONTACTADO.id },
      'e1',
      'u1',
    );

    expect(historial).toHaveLength(1);
    expect(historial[0].nombreEtapaAnterior).toBe('Prospecto');
    expect(historial[0].nombreEtapaNueva).toBe('Contactado');
    expect(r.etapaAnterior).toBe('Prospecto');
    expect(r.etapaNueva).toBe('Contactado');
  });
});
