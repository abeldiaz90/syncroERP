/**
 * ============================================================================
 * La reversa también llega al mayor externo
 * ----------------------------------------------------------------------------
 * 1-oct-2026. Abel pregunta lo que hay que preguntar antes de cancelar nada:
 * si cancelamos una póliza que ya se espejó, ¿la reversa llega al otro libro,
 * o el ERP queda cuadrado y Fineract con el asiento original intacto?
 *
 * Porque esa es la forma cara de equivocarse aquí: los asientos de Fineract no
 * se borran. Si la reversa no viaja, el mayor externo se queda con el cargo y
 * el abono originales para siempre, el ERP los tiene cancelados, y el control
 * de espejo del cierre no dice nada —el evento de la original sigue marcado
 * como entregado—. Dos libros distintos, en verde los dos.
 *
 * La cadena existe y es correcta, pero depende de tres piezas que nadie ata:
 *
 *   1. `cancelarPoliza` crea la reversa como una Póliza NUEVA (no como un
 *      campo de la original), que es lo que la hace visible al suscriptor.
 *   2. `PolizaEspejoSubscriber` encola en `afterInsert` SIN mirar el estatus.
 *   3. El despachador frena las CANCELADAS —su reversa viaja aparte— pero deja
 *      pasar las REVERSA.
 *
 * Basta con que alguien añada un `if (poliza.estatus === 'VIGENTE')` en el
 * punto 2, con toda la buena intención del mundo, para que las reversas dejen
 * de salir y nadie se entere hasta un cierre. Estas pruebas atan las tres.
 *
 * Se comprueba sin ejecutar ninguna cancelación contra la instalación: lo que
 * se mide es la cadena, no el dato.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { PolizaEspejoSubscriber } from './services/poliza-espejo.subscriber';

const fuente = (ruta: string) => readFileSync(join(__dirname, ruta), 'utf8');
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Un suscriptor con un publicador falso y un DataSource que sólo guarda. */
const suscriptorDePrueba = () => {
  const encoladas: Array<{ empresaId: string; polizaId: string }> = [];
  const publicador: any = {
    polizaRegistrada: async (empresaId: string, polizaId: string) => {
      encoladas.push({ empresaId, polizaId });
    },
  };
  const dataSource: any = { subscribers: [] };
  const suscriptor = new PolizaEspejoSubscriber(dataSource, publicador);
  return { suscriptor, encoladas, dataSource };
};

const insercionDe = (entity: any) => ({ entity, manager: {} }) as any;

describe('El suscriptor encola toda póliza que nace, sea del signo que sea', () => {
  it('una póliza VIGENTE se encola', async () => {
    const { suscriptor, encoladas } = suscriptorDePrueba();
    await suscriptor.afterInsert(
      insercionDe({ id: 'p-1', empresaId: 'e-1', estatus: 'VIGENTE' }),
    );
    expect(encoladas).toEqual([{ empresaId: 'e-1', polizaId: 'p-1' }]);
  });

  it('y una REVERSA también, que es justo la que podría quedarse fuera', async () => {
    /*
     * Ésta es la prueba que importa. Una reversa es una póliza como cualquier
     * otra: si el suscriptor la filtrara, el ERP quedaría cuadrado y el mayor
     * externo con el asiento original vivo.
     */
    const { suscriptor, encoladas } = suscriptorDePrueba();
    await suscriptor.afterInsert(
      insercionDe({ id: 'rev-1', empresaId: 'e-1', estatus: 'REVERSA' }),
    );
    expect(encoladas).toEqual([{ empresaId: 'e-1', polizaId: 'rev-1' }]);
  });

  it('el suscriptor no mira el estatus en absoluto', () => {
    /*
     * Escrito sobre el código y no sólo sobre el comportamiento: un filtro por
     * estatus aquí es el error exacto que esta prueba viene a impedir, y se
     * lee de un vistazo.
     */
    const codigo = sinComentarios(fuente('services/poliza-espejo.subscriber.ts'));
    expect(codigo).not.toMatch(/estatus/);
    expect(codigo).toMatch(/async afterInsert/);
    expect(codigo).toMatch(/polizaRegistrada\(\s*poliza\.empresaId,\s*poliza\.id,\s*evento\.manager,?\s*\)/);
  });

  it('se encola dentro de la transacción que creó la póliza', () => {
    /*
     * Con el `EntityManager` del evento: si la cancelación se deshace, el
     * evento de espejo se deshace con ella. Un espejo que sobrevive a su
     * póliza manda al mayor externo un asiento que en el ERP no existe.
     */
    const codigo = sinComentarios(fuente('services/poliza-espejo.subscriber.ts'));
    expect(codigo).toMatch(/evento\.manager/);
  });

  it('una póliza sin id o sin empresa no se encola', async () => {
    const { suscriptor, encoladas } = suscriptorDePrueba();
    await suscriptor.afterInsert(insercionDe({ id: 'p-2' }));
    await suscriptor.afterInsert(insercionDe({ empresaId: 'e-1' }));
    await suscriptor.afterInsert(insercionDe(undefined));
    expect(encoladas).toEqual([]);
  });
});

describe('El publicador no discrimina por estatus', () => {
  it('`polizaRegistrada` encola con la clave de la póliza y nada más', () => {
    const codigo = sinComentarios(
      fuente('services/contabilidad-publicador.service.ts'),
    );
    const cuerpo = codigo.slice(
      codigo.indexOf('async polizaRegistrada('),
      codigo.indexOf('async polizaRegistrada(') + 900,
    );
    expect(cuerpo).toMatch(/claveIdempotencia: `poliza:\$\{polizaId\}`/);
    expect(cuerpo).not.toMatch(/estatus/);
  });
});

describe('El despachador frena la cancelada y deja pasar la reversa', () => {
  const despachador = sinComentarios(
    fuente('services/integracion-despachador.service.ts'),
  );

  it('la CANCELADA no se espeja, y se dice por qué', () => {
    /*
     * No es un fallo: es un evento sin destino. La original ya viajó en su
     * día; lo que corrige el otro libro es la reversa, con su propio evento.
     */
    expect(despachador).toMatch(
      /if \(poliza\.estatus === 'CANCELADA'\) \{\s*throw new EventoSinDestino\(/,
    );
  });

  it('y el freno es SÓLO para la cancelada: ningún otro estatus se filtra', () => {
    /*
     * La prueba en negativo. Si mañana alguien ampliara la condición a
     * «distinto de VIGENTE», las reversas empezarían a descartarse como
     * «sin destino» —en verde, sin aviso— y los dos libros se separarían.
     */
    const bloque = /if \(poliza\.estatus[\s\S]{0,400}?\}/.exec(despachador)?.[0] ?? '';
    expect(bloque).toContain("=== 'CANCELADA'");
    expect(bloque).not.toContain("!== 'VIGENTE'");
    expect(bloque).not.toContain("'REVERSA'");
  });
});

describe('La cancelación crea la reversa como póliza propia', () => {
  /*
   * Si la reversa se guardara como un campo de la original —o con un `insert()`
   * crudo que no dispara suscriptores— toda la cadena de arriba daría igual: no
   * habría inserción que escuchar.
   */
  const polizas = sinComentarios(
    readFileSync(
      join(__dirname, '..', 'finanzas', 'services', 'polizas.service.ts'),
      'utf8',
    ),
  );

  it('se guarda con `save`, que es lo que ve el suscriptor', () => {
    expect(polizas).toMatch(/const guardada = await qr\.manager\.save\(reversa\)/);
  });

  it('nace con estatus REVERSA y apunta a su origen', () => {
    expect(polizas).toMatch(/estatus: 'REVERSA' as const/);
    expect(polizas).toMatch(/polizaOrigenId: original\.id/);
  });

  it('y la original se marca, nunca se borra', () => {
    expect(polizas).toMatch(/estatus: 'CANCELADA' as const/);
    expect(polizas).toMatch(/polizaReversaId: guardada\.id/);
  });
});
