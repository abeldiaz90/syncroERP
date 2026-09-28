import { WmsService } from './services/wms.service';

/**
 * ============================================================================
 * Un conteo que decía tener cero posiciones
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, con la sesión del almacenista
 *
 * Se abrió un conteo ciego sobre el Almacén Sucursal Norte. El servidor lo
 * creó —y sólo lo crea si encuentra inventario localizado: si no hay nada que
 * contar responde «No existe inventario localizado para los filtros del
 * conteo»—. Al pulsar «Capturar», el conteo tenía su partida: *Termo de acero
 * 1 L, posición N-01-01, lote ÚNICO*.
 *
 * Y la lista decía, en ése y en los tres conteos anteriores:
 *
 *     0 posiciones/lotes
 *
 * El motivo es de una línea: `listarConteos` trae `relations: ['almacen']` y
 * nada más, así que `detalles` llega `undefined` y la pantalla, que imprime
 * `c.detalles?.length || 0`, escribe cero **siempre**. No es que el conteo
 * estuviera vacío: es que la lista no preguntó.
 *
 * Por qué importa más de lo que parece: el almacenista decide desde esa lista
 * si el conteo que abrió cubre lo que quería contar —un rack, un producto, el
 * almacén entero—. Un cero en todas las filas no es un dato pobre, es un dato
 * falso, y el que lo lee no tiene forma de distinguir «este conteo está vacío,
 * lo abrí mal» de «este conteo tiene cuarenta posiciones». Los tres conteos
 * cerrados de la instalación dicen cero y dos de ellos aplicaron ajustes.
 *
 * LA DECISIÓN: se cuenta, no se trae. Cargar todos los detalles de todos los
 * conteos para escribir un número sería pagar la lista entera por una cifra;
 * `loadRelationCountAndMap` la resuelve en la misma consulta. La pantalla
 * recibe `partidas` y deja de inferir de una relación que no pidió.
 * ============================================================================
 */

function servicioConConteos(filas: any[]) {
  const qb: any = {
    llamadas: { count: [] as string[] },
    leftJoinAndSelect: jest.fn(() => qb),
    loadRelationCountAndMap: jest.fn((destino: string, relacion: string) => {
      qb.llamadas.count.push(`${destino}|${relacion}`);
      return qb;
    }),
    where: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn(async () => filas),
  };
  const conteos: any = {
    find: jest.fn(async () => filas),
    createQueryBuilder: jest.fn(() => qb),
  };
  const servicio = Object.create(WmsService.prototype);
  (servicio as any).conteos = conteos;
  return { servicio: servicio as WmsService, conteos, qb };
}

describe('WMS · un conteo que decía tener cero posiciones', () => {
  it('la lista trae cuántas partidas tiene cada conteo', async () => {
    const { servicio, qb } = servicioConConteos([
      { id: 'c1', folio: 'CNT-1', partidas: 1 },
    ]);

    const lista: any = await servicio.listarConteos('emp-1');

    expect(qb.llamadas.count).toContain('conteo.partidas|conteo.detalles');
    expect(lista[0].partidas).toBe(1);
  });

  it('no arrastra los detalles enteros para escribir un número', async () => {
    /*
     * Traer `detalles` de todos los conteos resolvería el síntoma y cambiaría
     * una lista barata por una cara: un almacén con conteos de cientos de
     * posiciones acabaría cargándolas todas para imprimir una cifra por fila.
     */
    const { servicio, qb } = servicioConConteos([]);

    await servicio.listarConteos('emp-1');

    const relacionesTraidas = qb.leftJoinAndSelect.mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(relacionesTraidas).not.toContain('conteo.detalles');
    expect(relacionesTraidas).toContain('conteo.almacen');
  });

  it('sigue acotada a la empresa de quien pregunta', async () => {
    const { servicio, qb } = servicioConConteos([]);

    await servicio.listarConteos('emp-1');

    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('empresaId'),
      expect.objectContaining({ empresaId: 'emp-1' }),
    );
  });
});
