/**
 * ============================================================================
 * Lo que ya firmé también es mío
 * ----------------------------------------------------------------------------
 * QUÉ FALTABA
 *
 * La bandeja de compras (`/dashboard/compras/aprobaciones`) sólo mostraba lo
 * PENDIENTE. En cuanto alguien aprobaba o rechazaba, el documento desaparecía
 * de su pantalla y no reaparecía en ninguna otra: quien firma no tenía forma de
 * ver qué había firmado, ni cuándo, ni con qué comentario.
 *
 * Una firma de aprobación compromete dinero de la empresa. Quien la da necesita
 * poder volver sobre ella —para contestar «¿tú autorizaste esto?», para
 * recordar por qué rechazó algo, para revisar qué dejó pasar antes de que
 * llegue la factura—. Sin historial, del acto sólo queda el efecto.
 *
 * La bandeja central ya tenía su `GET /aprobaciones/historial` para crédito y
 * convenios de hotel. Compras se había quedado sin su mitad.
 *
 * QUÉ VIGILA ESTA PRUEBA
 *
 * Las cuatro decisiones del historial, que son las que pueden salir mal en
 * silencio:
 *
 *   1. **Quién ve qué.** Un rol normal ve LO SUYO. Si esa condición se cae, el
 *      historial enseña las decisiones de todos a cualquiera que entre.
 *   2. **Qué estados entran.** Resueltos nombrados uno por uno, no «distinto de
 *      PENDIENTE»: si no, el día que exista otro estado se cuela sin que nadie
 *      lo decida. Y en adjudicaciones entra `CANCELADA`, que es como un
 *      documento se va de la bandeja sin que su firmante hiciera nada.
 *   3. **El orden.** Por fecha de resolución, que es la del acto. Por fecha de
 *      creación pondría arriba la aprobación más vieja aunque se firmara ayer.
 *   4. **El tope.** Acotado por los dos extremos: un límite de cero devolvería
 *      una lista vacía que se lee como «no has firmado nada».
 *
 * CÓMO
 *
 * Con un doble del query builder que apunta lo que se le pidió. Lo que importa
 * no es el SQL textual sino la decisión que lo produce, y ésta es la forma de
 * comprobarla sin una base de datos y, por lo tanto, en cada `npm test`.
 * ============================================================================
 */
import { RequisicionesService } from './services/requisiciones.service';
import { CotizacionesService } from './services/cotizaciones.service';

type Llamada = { sql: string; params?: Record<string, unknown> };

/** Un query builder de mentira que recuerda lo que se le fue pidiendo. */
function constructorFalso(filas: any[] = []) {
  const registro = {
    where: [] as Llamada[],
    orden: [] as string[],
    take: undefined as number | undefined,
    relaciones: [] as string[],
  };
  const qb: any = {
    leftJoinAndSelect: (rel: string) => {
      registro.relaciones.push(rel);
      return qb;
    },
    where: (sql: string, params?: any) => {
      registro.where.push({ sql, params });
      return qb;
    },
    andWhere: (sql: string, params?: any) => {
      registro.where.push({ sql, params });
      return qb;
    },
    orderBy: (campo: string, dir: string) => {
      registro.orden.push(`${campo} ${dir}`);
      return qb;
    },
    addOrderBy: (campo: string, dir: string) => {
      registro.orden.push(`${campo} ${dir}`);
      return qb;
    },
    take: (n: number) => {
      registro.take = n;
      return qb;
    },
    getMany: async () => filas,
  };
  return { qb, registro };
}

const sqlJunto = (registro: { where: Llamada[] }) =>
  registro.where.map((w) => w.sql).join(' && ');

const paramsJuntos = (registro: { where: Llamada[] }) =>
  Object.assign({}, ...registro.where.map((w) => w.params ?? {}));

// ───────────────────────── Requisiciones ─────────────────────────

describe('Historial de aprobaciones de requisiciones', () => {
  const nuevoServicio = (filas: any[] = []) => {
    const { qb, registro } = constructorFalso(filas);
    const servicio = Object.create(
      RequisicionesService.prototype,
    ) as RequisicionesService;
    (servicio as any).aprobacionRepo = { createQueryBuilder: () => qb };
    return { servicio, registro };
  };

  it('a un rol normal le enseña sólo lo que resolvió él', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.obtenerHistorialAprobaciones('yo', 'empresa', 'COMPRADOR');

    expect(sqlJunto(registro)).toContain('a.usuarioId = :usuarioId');
    expect(paramsJuntos(registro)).toMatchObject({
      usuarioId: 'yo',
      empresaId: 'empresa',
    });
  });

  it('al administrador y a gobierno les enseña todo lo resuelto de la empresa', async () => {
    for (const rol of ['ADMINISTRADOR', 'gobierno', 'Gobierno']) {
      const { servicio, registro } = nuevoServicio();
      await servicio.obtenerHistorialAprobaciones('yo', 'empresa', rol);
      expect(sqlJunto(registro)).not.toContain('a.usuarioId = :usuarioId');
      /* Pero nunca sin empresa: la traza completa es la de SU empresa. */
      expect(sqlJunto(registro)).toContain('r.empresaId = :empresaId');
    }
  });

  it('sin rol se comporta como un rol normal, no como administrador', async () => {
    /*
     * El caso que importa de los bordes: si un token sin rol cayera del lado
     * de «ve todo», bastaría perder un campo para abrir el historial entero.
     */
    const { servicio, registro } = nuevoServicio();
    await servicio.obtenerHistorialAprobaciones('yo', 'empresa', undefined);
    expect(sqlJunto(registro)).toContain('a.usuarioId = :usuarioId');
  });

  it('sólo trae las resueltas, y las nombra una por una', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.obtenerHistorialAprobaciones('yo', 'empresa', 'COMPRADOR');

    const estados = paramsJuntos(registro).estados as string[];
    expect(estados.sort()).toEqual(['APROBADO', 'RECHAZADO']);
    /* Nunca lo pendiente: eso es la otra pestaña. */
    expect(estados).not.toContain('PENDIENTE');
    /* Y no por exclusión, que dejaría entrar cualquier estado futuro. */
    expect(sqlJunto(registro)).not.toContain('<>');
  });

  it('ordena por la fecha del acto, no por la de creación', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.obtenerHistorialAprobaciones('yo', 'empresa', 'COMPRADOR');
    expect(registro.orden[0]).toBe('a.fechaResolucion DESC');
    expect(registro.orden).toContain('a.fechaCreacion DESC');
  });

  it('acota el tope por los dos extremos', async () => {
    const casos: Array<[any, number]> = [
      [undefined, 100],
      [0, 100],      // cero se lee como «no has firmado nada»: no se permite
      [-5, 100],
      [25, 25],
      [100000, 500], // ni la historia entera de la empresa de un tirón
    ];
    for (const [pedido, esperado] of casos) {
      const { servicio, registro } = nuevoServicio();
      await servicio.obtenerHistorialAprobaciones(
        'yo',
        'empresa',
        'COMPRADOR',
        pedido,
      );
      expect(registro.take).toBe(esperado);
    }
  });

  it('trae el documento y sus personas, para que la fila se pueda leer', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.obtenerHistorialAprobaciones('yo', 'empresa', 'COMPRADOR');
    /* Sin la requisición, la fila sería un identificador y una fecha. */
    expect(registro.relaciones).toContain('a.requisicion');
    expect(registro.relaciones).toContain('r.usuarioSolicitante');
  });
});

// ───────────────────────── Adjudicaciones ─────────────────────────

describe('Historial de adjudicaciones de cotización', () => {
  const nuevoServicio = (pasos: any[] = []) => {
    const { qb, registro } = constructorFalso(pasos);
    const servicio = Object.create(
      CotizacionesService.prototype,
    ) as CotizacionesService;
    (servicio as any).aprobacionRepo = { createQueryBuilder: () => qb };
    (servicio as any).cotizacionRepo = { find: async () => [] };
    (servicio as any).dataSource = {
      getRepository: () => ({ find: async () => [] }),
    };
    return { servicio, registro };
  };

  it('a un rol normal le enseña lo que resolvió y lo que le tocaba', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.historialDeAdjudicaciones('yo', 'COMPRADOR', 'empresa');

    const sql = sqlJunto(registro);
    expect(sql).toContain('a.resueltoPorId = :usuarioId');
    /*
     * Los dos campos, no uno. Un nivel que estaba a mi nombre y cerró otro
     * sigue siendo parte de mi rastro: si sólo se mirara `resueltoPorId`, el
     * documento se iría de la bandeja y no aparecería en ningún lado, que es
     * exactamente el defecto que este historial viene a cerrar.
     */
    expect(sql).toContain('a.usuarioAprobadorId = :usuarioId');
  });

  it('incluye las canceladas', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.historialDeAdjudicaciones('yo', 'COMPRADOR', 'empresa');

    const estados = paramsJuntos(registro).estados as string[];
    expect(estados.sort()).toEqual(['APROBADA', 'CANCELADA', 'RECHAZADA']);
    expect(estados).not.toContain('PENDIENTE');
  });

  it('a gobierno no le recorta por persona', async () => {
    const { servicio, registro } = nuevoServicio();
    await servicio.historialDeAdjudicaciones('yo', 'gobierno', 'empresa');
    expect(sqlJunto(registro)).not.toContain('a.resueltoPorId = :usuarioId');
    expect(sqlJunto(registro)).toContain('a.empresaId = :empresaId');
  });

  it('distingue lo que firmé yo de lo que cerró alguien más', async () => {
    const base = {
      id: 'paso-1',
      ciclo: 1,
      nivel: 2,
      estado: 'APROBADA',
      solicitadoPorId: 'compras',
      documentoId: 'cot-1',
      importeSolicitado: 1000,
      fechaCreacion: new Date('2026-09-30T10:00:00Z'),
      fechaResolucion: new Date('2026-09-30T12:00:00Z'),
    };
    const { servicio } = nuevoServicio([
      { ...base, id: 'mia', resueltoPorId: 'yo' },
      { ...base, id: 'ajena', resueltoPorId: 'otro' },
    ]);
    const filas: any[] = await servicio.historialDeAdjudicaciones(
      'yo',
      'COMPRADOR',
      'empresa',
    );
    expect(filas.find((f) => f.aprobacionId === 'mia')!.resueltaPorMi).toBe(true);
    expect(filas.find((f) => f.aprobacionId === 'ajena')!.resueltaPorMi).toBe(
      false,
    );
  });

  it('una fila cuya cotización ya no existe se muestra igual', async () => {
    /*
     * El paso ocurrió. Esconder la fila porque el documento se borró sería
     * perder el rastro justamente en el caso en que más falta hace.
     */
    const { servicio } = nuevoServicio([
      {
        id: 'huerfana',
        ciclo: 1,
        nivel: 1,
        estado: 'RECHAZADA',
        solicitadoPorId: 'compras',
        resueltoPorId: 'yo',
        documentoId: 'cot-borrada',
        importeSolicitado: 500,
        fechaCreacion: new Date(),
        fechaResolucion: new Date(),
      },
    ]);
    const filas: any[] = await servicio.historialDeAdjudicaciones(
      'yo',
      'COMPRADOR',
      'empresa',
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].cotizacion).toBeNull();
    expect(filas[0].importeSolicitado).toBe(500);
  });

  it('sin pasos resueltos no va a buscar cotizaciones ni usuarios', async () => {
    const { servicio } = nuevoServicio([]);
    let busquedas = 0;
    (servicio as any).cotizacionRepo = {
      find: async () => {
        busquedas += 1;
        return [];
      },
    };
    const filas = await servicio.historialDeAdjudicaciones(
      'yo',
      'COMPRADOR',
      'empresa',
    );
    expect(filas).toEqual([]);
    expect(busquedas).toBe(0);
  });
});
