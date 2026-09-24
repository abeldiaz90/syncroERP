import { ModoContabilidad } from '../integracion.constants';
import { IntegracionModoService } from './integracion-modo.service';

/**
 * ============================================================================
 * Apagar es la dirección peligrosa, y la contabilidad no tenía la regla
 * ----------------------------------------------------------------------------
 * `establecerModoCartera` razona por qué: los eventos sin entregar quedan
 * huérfanos —el despachador ignora los ejes apagados y no avisa— y las
 * discrepancias abiertas se vuelven irreconciliables, porque ya no hay contra
 * qué compararlas. En los dos casos el daño es silencioso, que es lo que lo
 * hace grave: un error ruidoso se corrige el mismo día.
 *
 * Todo eso vale igual para el espejo contable, que no comprobaba nada. Medido
 * en vivo el 2026-09-24, con dos pólizas de nómina sin entregar y tres
 * diferencias abiertas entre los dos mayores:
 *
 *   PATCH modo: APAGADO            → 409 «Hay 2 evento(s) sin entregar…»
 *   PATCH modoContabilidad: APAGADO → 200, sin un solo aviso
 *
 * El eje dueño de esos dos eventos era justo el único que los dejaba tirados.
 * Y el que se negó lo hizo por unos asientos que no son suyos y que su propio
 * eje iba a seguir despachando.
 * ============================================================================
 */
describe('Apagar el espejo contable', () => {
  function servicioCon(modoActual: ModoContabilidad) {
    const repo = {
      findOne: jest.fn(async () => ({
        empresaId: 'e1',
        modoContabilidad: modoActual,
      })),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
    };
    const config = { get: () => 'ESPEJO' };
    return {
      repo,
      servicio: new IntegracionModoService(
        config as never,
        repo as never,
      ),
    };
  }

  const sondas = (eventos: number, discrepancias: number) => ({
    eventosSinResolver: jest.fn(async () => eventos),
    discrepanciasAbiertas: jest.fn(async () => discrepancias),
  });

  it('se niega mientras haya asientos sin llegar al mayor externo', async () => {
    const { servicio, repo } = servicioCon(ModoContabilidad.ESPEJO);
    const r = await servicio.establecerModoContabilidad(
      'e1',
      ModoContabilidad.APAGADO,
      sondas(2, 0),
    );
    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/2 asiento/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('se niega mientras las dos contabilidades no cuadren', async () => {
    const { servicio, repo } = servicioCon(ModoContabilidad.ESPEJO);
    const r = await servicio.establecerModoContabilidad(
      'e1',
      ModoContabilidad.APAGADO,
      sondas(0, 3),
    );
    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/3 diferencia/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('con la cola limpia y sin diferencias, se apaga', async () => {
    const { servicio, repo } = servicioCon(ModoContabilidad.ESPEJO);
    const r = await servicio.establecerModoContabilidad(
      'e1',
      ModoContabilidad.APAGADO,
      sondas(0, 0),
    );
    expect(r.aplicado).toBe(true);
    expect(repo.save).toHaveBeenCalled();
  });

  /*
   * Encender no arrastra nada: la comprobación es sobre lo que se deja tirado
   * al apagar. Y volver a apagar algo ya apagado no mueve nada, así que
   * tampoco tiene por qué fallar — una regla que rechaza operaciones que no
   * cambian nada acaba enseñando a la gente a ignorar el mensaje.
   */
  it('encender no pide nada, y apagar lo ya apagado tampoco', async () => {
    const encender = servicioCon(ModoContabilidad.APAGADO);
    const sondasEncender = sondas(9, 9);
    await expect(
      encender.servicio.establecerModoContabilidad(
        'e1',
        ModoContabilidad.ESPEJO,
        sondasEncender,
      ),
    ).resolves.toEqual({ aplicado: true });
    expect(sondasEncender.eventosSinResolver).not.toHaveBeenCalled();

    const yaApagado = servicioCon(ModoContabilidad.APAGADO);
    const sondasIdempotente = sondas(9, 9);
    await expect(
      yaApagado.servicio.establecerModoContabilidad(
        'e1',
        ModoContabilidad.APAGADO,
        sondasIdempotente,
      ),
    ).resolves.toEqual({ aplicado: true });
    expect(sondasIdempotente.eventosSinResolver).not.toHaveBeenCalled();
  });
});
