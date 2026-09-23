import { Repository } from 'typeorm';
import { EventoIntegracion } from '../entities/evento-integracion.entity';
import {
  EstadoEventoIntegracion,
  EVENTOS_DE_CONTABILIDAD,
  TipoEventoIntegracion,
} from '../integracion.constants';
import { IntegracionOutboxService } from './integracion-outbox.service';
import { IntegracionDespachadorService } from './integracion-despachador.service';

/**
 * ============================================================================
 * El outbox es uno y lo que lleva dentro es de dos dueños
 * ----------------------------------------------------------------------------
 * Contabilidad reenvía sus asientos; la cartera —altas de cliente,
 * originaciones, cobranza— es de Administración. Hasta que esto existió, el
 * reparto se hacía negando la pantalla entera, con el resultado medido en la
 * nómina del periodo 19: el contador creó la correspondencia de las diez
 * cuentas y no pudo despachar las dos pólizas que esperaban por ella.
 *
 * Y el segundo hallazgo, más callado: cuando no se movía nada, el servidor
 * devolvía `{0, 0}` en cuatro situaciones distintas y la pantalla las resumía
 * todas en «Cola despachada» — un mensaje que dice que el trabajo se hizo.
 * ============================================================================
 */

function repoFalso(eventos: Partial<EventoIntegracion>[]) {
  const llamadas: { find?: unknown; count?: unknown; update?: unknown } = {};
  return {
    llamadas,
    repo: {
      find: jest.fn(async (opciones: unknown) => {
        llamadas.find = opciones;
        return eventos as EventoIntegracion[];
      }),
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        (eventos.find((e) => e.id === where.id) as EventoIntegracion) ?? null,
      ),
      count: jest.fn(async (opciones: unknown) => {
        llamadas.count = opciones;
        return eventos.filter(
          (e) => e.estado === EstadoEventoIntegracion.FALLIDO,
        ).length;
      }),
      update: jest.fn(async (criterio: unknown) => {
        llamadas.update = criterio;
        return { affected: 1 };
      }),
    } as unknown as Repository<EventoIntegracion>,
  };
}

describe('El alcance contable del outbox', () => {
  const poliza = {
    id: 'p1',
    empresaId: 'e1',
    tipo: TipoEventoIntegracion.POLIZA_REGISTRADA,
    estado: EstadoEventoIntegracion.FALLIDO,
  };
  const cartera = {
    id: 'c1',
    empresaId: 'e1',
    tipo: TipoEventoIntegracion.CREDITO_ORIGINADO,
    estado: EstadoEventoIntegracion.FALLIDO,
  };

  it('deja reencolar una póliza a quien sólo alcanza la contabilidad', async () => {
    const { repo } = repoFalso([poliza, cartera]);
    const outbox = new IntegracionOutboxService(repo);
    await expect(
      outbox.reencolar('p1', 'e1', EVENTOS_DE_CONTABILIDAD),
    ).resolves.toBe('REENCOLADO');
  });

  /*
   * Y lo dice como es. Devolvía un booleano, y el controlador traducía el
   * `false` a «Evento no encontrado»: un mensaje falso que manda a buscar el
   * problema donde no está.
   */
  it('no confunde «no es tuyo» con «no existe»', async () => {
    const { repo } = repoFalso([poliza, cartera]);
    const outbox = new IntegracionOutboxService(repo);
    await expect(
      outbox.reencolar('c1', 'e1', EVENTOS_DE_CONTABILIDAD),
    ).resolves.toBe('FUERA_DE_ALCANCE');
    await expect(
      outbox.reencolar('no-existe', 'e1', EVENTOS_DE_CONTABILIDAD),
    ).resolves.toBe('NO_EXISTE');
  });

  it('sin acotar, el administrador sigue alcanzando la cola entera', async () => {
    const { repo } = repoFalso([poliza, cartera]);
    const outbox = new IntegracionOutboxService(repo);
    await expect(outbox.reencolar('c1', 'e1')).resolves.toBe('REENCOLADO');
  });

  it('el filtro por tipo llega a la consulta, no se queda en la puerta', async () => {
    const { repo, llamadas } = repoFalso([]);
    const outbox = new IntegracionOutboxService(repo);
    await outbox.pendientes(10, 'e1', EVENTOS_DE_CONTABILIDAD);
    const where = (llamadas.find as { where: Record<string, unknown>[] }).where;
    expect(where).toHaveLength(2);
    for (const rama of where) expect(rama.tipo).toBeDefined();
  });
});

describe('Un despacho que no mueve nada explica por qué', () => {
  function despachadorCon(
    enlace: boolean,
    outbox: Partial<IntegracionOutboxService>,
  ) {
    /*
     * Se arma sobre el prototipo en vez de por el constructor: este servicio
     * pide once colaboradores y aquí sólo se ejercen los cuatro caminos por
     * los que NO se despacha nada. Montar los once para eso sería una prueba
     * que se rompe cada vez que el servicio gana una dependencia, sin vigilar
     * nada más.
     */
    const d = Object.create(
      IntegracionDespachadorService.prototype,
    ) as IntegracionDespachadorService;
    const puerto = {
      configurado: () => enlace,
      disponible: () => enlace,
    };
    const campos = d as unknown as Record<string, unknown>;
    campos.externa = puerto;
    campos.contabilidad = puerto;
    campos.outbox = outbox;
    campos.despachando = false;
    campos.logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    return d;
  }

  it('dice que no hay enlace en vez de dar el trabajo por hecho', async () => {
    const d = despachadorCon(false, {});
    await expect(d.despacharLote(50, 'e1')).resolves.toEqual({
      procesados: 0,
      fallidos: 0,
      motivo: 'SIN_ENLACE',
    });
  });

  /*
   * El caso que estrenó esto: el contador corrige la correspondencia, pulsa
   * «Despachar la cola» y las pólizas siguen en FALLIDO, que es un estado del
   * que no se sale solo. La cola de pendientes no las ve, así que el despacho
   * es honesto al no moverlas — lo deshonesto era felicitar por ello.
   */
  it('distingue «no había nada» de «hay dos detenidos que nadie recoge»', async () => {
    const detenido = despachadorCon(true, {
      pendientes: jest.fn(async () => []),
      contarDetenidos: jest.fn(async () => 2),
    });
    await expect(detenido.despacharLote(50, 'e1')).resolves.toEqual({
      procesados: 0,
      fallidos: 0,
      detenidos: 2,
      motivo: 'SOLO_DETENIDOS',
    });

    const limpio = despachadorCon(true, {
      pendientes: jest.fn(async () => []),
      contarDetenidos: jest.fn(async () => 0),
    });
    await expect(limpio.despacharLote(50, 'e1')).resolves.toEqual({
      procesados: 0,
      fallidos: 0,
      detenidos: 0,
      motivo: 'NADA_PENDIENTE',
    });
  });

  it('el despacho automático no cuenta detenidos: no le habla a nadie', async () => {
    const contar = jest.fn(async () => 5);
    const d = despachadorCon(true, {
      pendientes: jest.fn(async () => []),
      contarDetenidos: contar,
    });
    await expect(d.despacharLote()).resolves.toEqual({
      procesados: 0,
      fallidos: 0,
    });
    expect(contar).not.toHaveBeenCalled();
  });
});
