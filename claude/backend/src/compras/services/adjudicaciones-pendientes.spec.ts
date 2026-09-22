import { CotizacionesService } from './cotizaciones.service';

/**
 * La bandeja de adjudicaciones.
 *
 * Existe porque NO existia: `/dashboard/compras/aprobaciones` solo listaba
 * requisiciones, asi que una adjudicacion esperando firma no aparecia en
 * ninguna pantalla. Se comprobo en vivo el 22-sep: Gerencia pudo firmar porque
 * se le paso la URL de la requisicion a mano.
 *
 * Las pruebas fijan el filtrado, que es donde esto se rompe en silencio: de
 * mas, y alguien ve trabajo que no le toca; de menos, y el documento se queda
 * esperando sin que nadie lo sepa.
 */
describe('adjudicaciones que esperan mi firma', () => {
  const COT = (id: string) => ({
    id,
    requisicionId: 'req-1',
    total: 100,
    estado: 'PENDIENTE_APROBACION',
  });

  function servicio(pasos: unknown[], cotizaciones: unknown[] = [COT('cot-1')]) {
    const aprobacionRepo = { find: jest.fn(async () => pasos) };
    const cotizacionRepo = { find: jest.fn(async () => cotizaciones) };
    const dataSource = {
      getRepository: jest.fn(() => ({
        find: jest.fn(async () => [
          { id: 'compras', nombreCompleto: 'Compras Prueba' },
        ]),
      })),
    };
    return new CotizacionesService(
      cotizacionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aprobacionRepo as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
  }

  const paso = (extra: Record<string, unknown> = {}) => ({
    id: 'paso-1',
    documentoId: 'cot-1',
    ciclo: 1,
    nivel: 1,
    estado: 'PENDIENTE',
    solicitadoPorId: 'compras',
    usuarioAprobadorId: null,
    rolAprobador: 'gerencia',
    importeSolicitado: 110.2,
    ...extra,
  });

  it('llega por rol, sin importar la grafia', async () => {
    for (const rol of ['gerencia', 'GERENCIA', 'Gerencia']) {
      const s = servicio([paso()]);
      const r = await s.adjudicacionesPendientesDe('quien-firma', rol, 'emp');
      expect(r).toHaveLength(1);
      expect(r[0].importeSolicitado).toBe(110.2);
    }
  });

  /*
   * Quien PIDIO la adjudicacion, no quien levanto la requisicion. La primera
   * version pintaba al solicitante de la requisicion y la pantalla decia
   * «Solicitada por Almacen Prueba» cuando la firma la habia pedido Compras
   * Prueba. Nombrar a quien no fue, en una pantalla de firma, es peor que no
   * nombrar a nadie.
   */
  it('nombra a quien pidio la adjudicacion', async () => {
    const [item] = await servicio([paso()]).adjudicacionesPendientesDe(
      'quien-firma',
      'gerencia',
      'emp',
    );
    expect(item.solicitadaPor).toBe('Compras Prueba');
  });

  it('no llega a un rol distinto', async () => {
    const s = servicio([paso()]);
    expect(await s.adjudicacionesPendientesDe('otro', 'contador', 'emp')).toEqual([]);
  });

  /*
   * Cuando el nivel nombra a una persona, manda la persona. Un rol que
   * coincida no da derecho a firmar lo que se asigno a alguien concreto.
   */
  it('con usuario asignado manda el usuario, no el rol', async () => {
    const conUsuario = paso({ usuarioAprobadorId: 'ana', rolAprobador: 'gerencia' });
    expect(
      await servicio([conUsuario]).adjudicacionesPendientesDe('ana', 'otro', 'emp'),
    ).toHaveLength(1);
    expect(
      await servicio([conUsuario]).adjudicacionesPendientesDe('beto', 'gerencia', 'emp'),
    ).toEqual([]);
  });

  /*
   * Quien pidio la adjudicacion no puede resolverla —lo impide
   * `exigirFacultadDeResolver`—, asi que verla en su propia bandeja solo
   * invita a intentarlo y a no entender por que falla.
   */
  it('no muestra lo que uno mismo solicito', async () => {
    const s = servicio([paso({ solicitadoPorId: 'yo' })]);
    expect(await s.adjudicacionesPendientesDe('yo', 'gerencia', 'emp')).toEqual([]);
  });

  /*
   * Con varios niveles solo toca el siguiente. Mostrar el nivel 2 antes de que
   * el 1 firme es pedirle a alguien que autorice algo que todavia puede caerse.
   */
  it('solo el siguiente nivel de cada ciclo', async () => {
    const s = servicio([
      paso({ id: 'n1', nivel: 1, rolAprobador: 'gerencia' }),
      paso({ id: 'n2', nivel: 2, rolAprobador: 'gerencia' }),
    ]);
    const r = await s.adjudicacionesPendientesDe('quien-firma', 'gerencia', 'emp');
    expect(r).toHaveLength(1);
    expect(r[0].nivel).toBe(1);
  });

  /*
   * El paso puede seguir PENDIENTE y el documento haber cambiado de estado por
   * otra via —lo adjudico otro ciclo, se descarto—. Si se muestra igualmente,
   * la bandeja ofrece firmar algo que ya no admite firma.
   */
  it('no muestra pasos de cotizaciones que ya no esperan aprobacion', async () => {
    const s = servicio([paso()], [{ ...COT('cot-1'), estado: 'DESCARTADA' }]);
    expect(await s.adjudicacionesPendientesDe('quien-firma', 'gerencia', 'emp')).toEqual([]);
  });

  it('sin rol y sin usuario asignado no le toca a nadie por rol', async () => {
    const s = servicio([paso({ rolAprobador: null })]);
    expect(await s.adjudicacionesPendientesDe('quien-firma', '', 'emp')).toEqual([]);
  });
});
