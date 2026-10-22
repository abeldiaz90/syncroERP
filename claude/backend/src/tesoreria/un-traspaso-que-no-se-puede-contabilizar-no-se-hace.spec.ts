import { ConflictException } from '@nestjs/common';

import { TesoreriaService } from './services/tesoreria.service';

/**
 * ============================================================================
 * Un traspaso que no se puede contabilizar no se hace
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 22-oct-2026, en el PRIMER traspaso que se hizo desde la pantalla
 * recién puesta —hasta ese día `POST /tesoreria/traspasos` no lo llamaba
 * nadie—. Las dos partidas se escribieron, los saldos cambiaron (1 600 → 1 500
 * y 822.08 → 922.08), la pantalla dijo «Traspaso registrado» y el asiento se
 * quedó PENDIENTE con este motivo del motor contable:
 *
 *     «Traspaso TM-00000017: origen y destino comparten la misma cuenta
 *      contable; el asiento no reflejaría movimiento alguno.»
 *
 * El motor tiene razón: un cargo y un abono a la misma cuenta no dice nada.
 *
 * LO QUE ESTABA MAL ERA EL ORDEN
 *
 * El asiento se ENCOLA, así que esa negativa llega después y en otra pantalla.
 * Entre medias el dinero ya cambió de cuenta y los libros no se enteraron, y
 * nadie lo sabe hasta que alguien mira el tablero de asientos detenidos. Un
 * fallo diferido es peor que una negativa: la negativa se lee, el pendiente se
 * acumula.
 *
 * Y la decisión ya estaba tomada en esta casa:
 * `una-salida-sin-asiento-no-es-un-exito.spec.ts`.
 *
 * LA REGLA
 *
 * `traspasar()` pregunta lo MISMO que el motor va a preguntar luego, con las
 * dos cuentas ya bloqueadas y antes de escribir nada. Si no se puede
 * contabilizar, no se traspasa. Se comprueba contra las cuentas que ya están
 * en la mano —no con otra consulta— porque son exactamente las que se
 * bloquearon: preguntarle a la base otra vez abriría la ventana que el bloqueo
 * cierra.
 * ============================================================================
 */

type Cuenta = {
  id: string;
  nombre: string;
  activo: boolean;
  cuentaContableId: string | null;
};

function armar(cuentas: Cuenta[]) {
  const guardados: Record<string, unknown>[] = [];
  const encolados: unknown[] = [];
  const s = Object.create(TesoreriaService.prototype) as Record<string, unknown>;

  s.dataSource = {
    transaction: (cuerpo: (m: unknown) => Promise<unknown>) =>
      cuerpo({
        getRepository: () => ({
          createQueryBuilder: () => {
            const q = {
              setLock: () => q,
              where: (_s: string, p: { id: string }) => {
                q._id = p.id;
                return q;
              },
              getOne: async () => cuentas.find((c) => c.id === q._id) ?? null,
              _id: '',
            } as Record<string, unknown> & { _id: string };
            return q;
          },
          findOne: async () => ({ saldoPosterior: 10_000 }),
          save: async (x: Record<string, unknown>) => {
            guardados.push(x);
            return x;
          },
          create: (x: Record<string, unknown>) => x,
        }),
      }),
  };
  /*
   * Si la compuerta dejara pasar, el traspaso seguiría por aquí. Estos dobles
   * apuntan lo que se escribió, que es como se comprueba que NO se escribió
   * nada cuando toca negar.
   */
  s.registrarConManager = async (datos: Record<string, unknown>) => {
    guardados.push(datos);
    return { id: 'mov-' + guardados.length, folio: 'TM-999' };
  };
  s.asientos = {
    encolarEnTransaccion: async (...args: unknown[]) => {
      encolados.push(args);
    },
  };

  return { servicio: s as unknown as TesoreriaService, guardados, encolados };
}

const DTO = {
  origenId: 'c1',
  destinoId: 'c2',
  importe: 100,
  fecha: '2026-10-21',
  concepto: 'Fondeo de la caja chica',
};

const caja = (id: string, nombre: string, contable: string | null): Cuenta => ({
  id,
  nombre,
  activo: true,
  cuentaContableId: contable,
});

describe('un traspaso que no se puede contabilizar no se hace', () => {
  it('con la MISMA cuenta contable en los dos lados, se niega', async () => {
    const { servicio, guardados, encolados } = armar([
      caja('c1', 'Caja 2 · Mostrador norte', 'cc-caja'),
      caja('c2', 'Caja mostrador', 'cc-caja'),
    ]);

    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(ConflictException);
    /* Y sobre todo: no se movió nada. */
    expect([guardados, encolados]).toEqual([[], []]);
  });

  it('y lo dice con los nombres de las dos cuentas, no con un 409 pelado', async () => {
    const { servicio } = armar([
      caja('c1', 'Caja 2 · Mostrador norte', 'cc-caja'),
      caja('c2', 'Caja mostrador', 'cc-caja'),
    ]);

    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(
      /Caja 2 · Mostrador norte y Caja mostrador comparten la misma cuenta contable/,
    );
    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(
      /Dales cuentas contables distintas/,
    );
  });

  it('si a una le falta la cuenta contable, se niega nombrando a esa', async () => {
    const { servicio, guardados } = armar([
      caja('c1', 'Caja 2 · Mostrador norte', null),
      caja('c2', 'Caja mostrador', 'cc-mostrador'),
    ]);

    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(
      /Caja 2 · Mostrador norte no tiene cuenta contable asignada/,
    );
    expect(guardados).toEqual([]);
  });

  it('si les falta a las dos, las nombra a las dos', async () => {
    const { servicio } = armar([
      caja('c1', 'Caja 2 · Mostrador norte', null),
      caja('c2', 'Caja mostrador', null),
    ]);

    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(
      /Caja 2 · Mostrador norte y Caja mostrador no tienen cuenta contable/,
    );
  });

  it('con cuentas contables distintas, el traspaso se hace y encola su asiento', async () => {
    /*
     * La mitad que más importa de cualquier compuerta: que deje pasar lo que
     * tiene que pasar. Una regla que niega siempre también tendría todas las
     * pruebas de arriba en verde.
     */
    const { servicio, guardados, encolados } = armar([
      caja('c1', 'Caja 2 · Mostrador norte', 'cc-norte'),
      caja('c2', 'Caja mostrador', 'cc-mostrador'),
    ]);

    await expect(servicio.traspasar(DTO, 'e1', 'u1')).resolves.toBeDefined();
    expect(guardados).toHaveLength(2);
    expect(encolados).toHaveLength(1);
  });

  it('LA PRUEBA DE LA PRUEBA: la compuerta mira la cuenta CONTABLE, no la bancaria', async () => {
    /*
     * Dos cuentas bancarias distintas con la misma contable es exactamente el
     * caso medido, y es el que se escapaba: por el lado bancario todo se ve
     * bien. Si alguien cambiara la comprobación a comparar `id` en vez de
     * `cuentaContableId`, este renglón se pondría verde al revés —dejaría
     * pasar el traspaso que no se puede contabilizar— y las de arriba
     * seguirían pasando.
     */
    const { servicio } = armar([
      caja('c1', 'Caja A', 'cc-unica'),
      caja('c2', 'Caja B', 'cc-unica'),
    ]);

    /* Ids bancarios distintos: la compuerta de «deben ser distintas» no aplica. */
    expect(DTO.origenId).not.toBe(DTO.destinoId);
    await expect(servicio.traspasar(DTO, 'e1', 'u1')).rejects.toThrow(
      /misma cuenta contable/,
    );
  });
});
