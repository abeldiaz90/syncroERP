import { BadRequestException } from '@nestjs/common';

import { RequisicionesService } from './services/requisiciones.service';

/**
 * ============================================================================
 * Un departamento sin matriz no es una excepción de monto
 * ----------------------------------------------------------------------------
 * EL DEFECTO QUE ESTA PRUEBA VIGILA
 *
 * La ruta de aprobación de una requisición se busca por departamento. Si la
 * consulta vuelve vacía y el código sigue adelante, unas líneas más abajo
 * concluye —con un razonamiento que por sí solo es correcto— que «el monto
 * quedó por debajo de lo que exige firma», y la requisición nace lista para
 * cotizar.
 *
 * Las dos cosas son correctas por separado y juntas dicen una mentira: cuando
 * el departamento NO TIENE matriz configurada, la lista llega vacía por una
 * razón completamente distinta —nadie la configuró— y el sistema lo lee como
 * «no hace falta firma». Dar de alta un departamento nuevo apagaría el control
 * de compras de ese departamento, en silencio y sin que nadie lo decida.
 *
 * Es la familia de siempre: la ausencia de un dato interpretada como una
 * decisión.
 *
 * ── POR QUÉ SE REESCRIBIÓ ESTA PRUEBA (28-sep-2026) ──
 *
 * La versión anterior medía una CASCADA departamento → global, y llamaba a un
 * método `configuracionesDeRequisicion` que no existe: la suite entera fallaba
 * a compilar por eso. El servicio resolvió el mismo agujero por otro camino, y
 * lo dejó escrito:
 *
 *     «Se probó la cascada departamento → global y se retiró al medirlo:
 *      habría sido una rama que ninguna configuración puede alcanzar […] cada
 *      departamento nuevo necesita su matriz, y hasta que la tenga sus
 *      requisiciones se niegan.»
 *
 * Y es coherente: el servicio de configuración impone que las requisiciones
 * lleven área solicitante, así que una matriz GLOBAL de REQUISICION no puede
 * existir y la cascada nunca tendría a dónde caer.
 *
 * Así que la propiedad que hay que vigilar no es «cae en la global», sino la
 * de fondo, que sigue viva: **la ausencia de matriz NO se convierte en ausencia
 * de firma**. Se rechaza la captura y se dice qué configurar. Eso es lo que
 * mide esta prueba ahora.
 * ============================================================================
 */

function servicioCon(configuraciones: unknown[]) {
  const consultas: Array<Record<string, unknown>> = [];
  const s = Object.create(RequisicionesService.prototype) as Record<
    string,
    unknown
  >;

  s.usuarioRepo = {
    findOne: async () => ({
      id: 'u1',
      empresaId: 'e1',
      activo: true,
      departamentoId: 'd1',
      departamento: { id: 'd1', nombre: 'Almacén' },
    }),
  };
  s.productoRepo = {
    createQueryBuilder: () => ({
      select: () => ({
        where: () => ({
          andWhere: () => ({ getRawMany: async () => [] }),
        }),
      }),
      where: () => ({
        andWhere: () => ({
          andWhere: () => ({ getCount: async () => 1 }),
        }),
      }),
    }),
  };
  s.configAprobacionRepo = {
    consultas,
    find: async (opciones: { where: Record<string, unknown> }) => {
      consultas.push(opciones.where);
      return configuraciones;
    },
  };

  return { servicio: s as unknown as RequisicionesService, consultas };
}

const DTO = {
  detalles: [{ productoId: 'p1', cantidadSolicitada: 3 }],
} as never;

describe('Requisiciones · un departamento sin matriz no es una excepción de monto', () => {
  it('sin matriz del departamento, la captura se RECHAZA', async () => {
    /*
     * Lo que NO puede pasar: que siga adelante y acabe con
     * `requiereAutorizacion = false`, que es leer «nadie la configuró» como
     * «no hace falta firma».
     */
    const { servicio } = servicioCon([]);

    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('el «no» dice qué configurar y dónde, no sólo que no se puede', async () => {
    const { servicio } = servicioCon([]);

    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.toThrow(
      /ruta de aprobación/i,
    );
    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.toThrow(
      /Flujos de aprobación/i,
    );
  });

  it('y explica que no hay matriz global que la cubra', async () => {
    /*
     * Esto es lo que evita que alguien «arregle» el aviso configurando una
     * matriz global: no existe tal cosa para requisiciones, porque se autorizan
     * por área.
     */
    const { servicio } = servicioCon([]);

    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.toThrow(
      /no hay\s+matriz global/i,
    );
  });

  it('la matriz se pide por el departamento de quien solicita, y activa', async () => {
    const { servicio, consultas } = servicioCon([]);

    await servicio.crear(DTO, 'e1', 'u1').catch(() => undefined);

    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toMatchObject({
      empresaId: 'e1',
      proceso: 'REQUISICION',
      departamentoId: 'd1',
      activo: true,
    });
  });

  it('con matriz, ya no se rechaza por falta de ruta', async () => {
    /*
     * Sigue fallando más adelante —los repositorios de esta prueba no van más
     * allá—, pero NO por la ruta: es lo que distingue «no hay control» de «el
     * monto no llega al umbral», que son las dos cosas que se confundían.
     */
    const { servicio } = servicioCon([
      { orden: 1, rolAprobador: 'gerencia', montoDesde: 0, montoHasta: null },
    ]);

    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.not.toThrow(
      /ruta de aprobación/i,
    );
  });

  it('sin departamento asignado, el aviso es OTRO y le habla a quien lo lee', async () => {
    /*
     * Dos ausencias distintas, dos mensajes distintos. Quien captura no puede
     * asignarse un departamento a sí mismo, así que el aviso dice de quién es
     * el pendiente.
     */
    const { servicio } = servicioCon([]);
    (servicio as unknown as Record<string, unknown>).usuarioRepo = {
      findOne: async () => ({
        id: 'u1',
        empresaId: 'e1',
        activo: true,
        departamentoId: null,
      }),
    };

    await expect(servicio.crear(DTO, 'e1', 'u1')).rejects.toThrow(
      /departamento asignado/i,
    );
  });
});
