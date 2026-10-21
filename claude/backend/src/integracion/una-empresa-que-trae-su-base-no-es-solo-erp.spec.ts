import { AltaEmpresasService } from './services/alta-empresas.service';
import { EstadoOrigenCore, OrigenCore } from './entities/origen-core.entity';
import { ModoCartera, ModoContabilidad } from './integracion.constants';

/**
 * ============================================================================
 * Una empresa que trae su base NO es «sólo ERP»
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 21-oct-2026 en vivo, dando de alta «Financiera Onpremise Prueba»
 * con la base del core puesta por el cliente. La consola contestó, sobre la
 * MISMA empresa y en la MISMA pantalla:
 *
 *   · la fila:              «sólo ERP»
 *   · el punto del inquilino: «No aplica: esta empresa opera sólo con el ERP.»
 *   · el panel de abajo:    «La base del core la pone el cliente. Falta
 *                            capturar la conexión a su servidor.»
 *
 * Y el paso del alta, minutos antes, había dicho: «Creada. La base del core la
 * pone el cliente: falta capturar la conexión en su ficha».
 *
 * POR QUÉ
 *
 * `usaRegistroExterno` pregunta por los DOS MODOS, o sea por lo que está
 * fluyendo. Y una empresa que trae su base nace con los dos APAGADOS a
 * propósito: su inquilino todavía no existe para el core —Fineract construye
 * el esquema de un inquilino nuevo sólo al arrancar— así que publicarle algo
 * sería mandarle hechos a una base que no está. Los modos los sube `activar`,
 * cuando el esquema ya contestó.
 *
 * O sea que la pregunta era correcta para decidir si se publica un hecho, y
 * equivocada para decir QUÉ CONTRATÓ el cliente. Son dos preguntas y había una
 * sola respuesta.
 *
 * Es el mismo defecto que esta familia ya se quitó una vez —mirar la cartera y
 * no la contabilidad— con un eje más: entonces era uno de dos, ahora dos de
 * tres.
 *
 * QUÉ CUIDA ESTA PRUEBA, además de que no vuelva:
 *
 *  1. Que la empresa de la nube de SUMA siga leyéndose igual. El arreglo añade
 *     un eje; si además cambiara lo que ya estaba bien, sería peor que el
 *     defecto.
 *  2. Que a una empresa con su propia base NUNCA se le ofrezca un inquilino de
 *     la reserva de SUMA. Es la trampa del arreglo: en cuanto `usaFineract`
 *     vale `true`, el punto del inquilino encendía el botón
 *     `ASIGNAR_INQUILINO`, y eso le entregaría un inquilino de la nube de SUMA
 *     a quien contrató precisamente no tenerlo. Un botón que hace daño es peor
 *     que un botón que lleva a un no.
 *  3. Que no se le ordene «Súbela a SOMBRA»: su cartera está apagada a
 *     propósito y subirla a mano la pondría a publicar contra una base que
 *     todavía no existe.
 * ============================================================================
 */

type Cfg = { modo: ModoCartera; modoContabilidad: ModoContabilidad } | null;
type Origen = { empresaId: string; origen: OrigenCore; estado: EstadoOrigenCore } | null;

const EMPRESA = { id: 'e1', nombreComercial: 'Financiera Onpremise Prueba', rfc: 'FOP261021AA1', activo: true };

function armar(cfg: Cfg, origen: Origen, tenantAsignado: string | null = null, libres = 3) {
  const tenant = tenantAsignado ? { empresaId: 'e1', identificador: tenantAsignado } : null;

  const empresas = {
    findOne: jest.fn(async () => EMPRESA),
    find: jest.fn(async () => [EMPRESA]),
  };
  const configs = {
    findOne: jest.fn(async () => (cfg ? { empresaId: 'e1', ...cfg } : null)),
    find: jest.fn(async () => (cfg ? [{ empresaId: 'e1', ...cfg }] : [])),
  };
  const origenes = {
    findOne: jest.fn(async () => origen),
    find: jest.fn(async () => (origen ? [origen] : [])),
  };
  const reserva = {
    findOne: jest.fn(async () => tenant),
    find: jest.fn(async () => (tenant ? [tenant] : [])),
    count: jest.fn(async () => libres),
  };
  const productos = { find: jest.fn(async () => [{ id: 'p1' }]) };
  const usuarios = {
    find: jest.fn(async () => [{ id: 'u1', email: 'a@b.c', nombreCompleto: 'A', rol: 'admin', activo: true, passwordHash: 'x' }]),
    createQueryBuilder: jest.fn(() => {
      const q = {
        select: () => q,
        addSelect: () => q,
        where: () => q,
        groupBy: () => q,
        getRawMany: async () => [{ empresaid: 'e1', total: '1' }],
      };
      return q;
    }),
  };

  const servicio = new AltaEmpresasService(
    {} as never,
    { registrar: jest.fn() } as never,
    empresas as never,
    configs as never,
    reserva as never,
    productos as never,
    usuarios as never,
    {} as never,
    {} as never,
    origenes as never,
  );

  return servicio;
}

const APAGADA = { modo: ModoCartera.APAGADO, modoContabilidad: ModoContabilidad.APAGADO };
const SOMBRA = { modo: ModoCartera.SOMBRA, modoContabilidad: ModoContabilidad.ESPEJO };
const traeSuBase = (estado: EstadoOrigenCore) => ({ empresaId: 'e1', origen: OrigenCore.CLIENTE, estado });
const laPoneSuma = { empresaId: 'e1', origen: OrigenCore.SUMA, estado: EstadoOrigenCore.ACTIVO };

const punto = (ficha: Awaited<ReturnType<AltaEmpresasService['estado']>>, clave: string) =>
  ficha.puntos.find((p) => p.clave === clave)!;

describe('una empresa que trae su base no es «sólo ERP»', () => {
  describe('recién dada de alta, con su origen DECLARADO', () => {
    it('la ficha dice que SÍ contrató el registro externo', async () => {
      const ficha = await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).estado('e1');
      expect(ficha.servicios.fineract).toBe(true);
    });

    it('y la fila de la lista también, con de dónde sale su base', async () => {
      const [fila] = await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).listar();
      expect(fila).toMatchObject({
        usaFineract: true,
        origenCore: 'CLIENTE',
        estadoOrigenCore: 'DECLARADO',
      });
    });

    it('el punto del inquilino NO dice «opera sólo con el ERP»', async () => {
      const p = punto(await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).estado('e1'), 'tenant');
      expect(p.detalle).not.toMatch(/sólo con el ERP/i);
      expect(p.detalle).toMatch(/la pone el cliente/i);
      expect(p.listo).toBe(false);
    });

    it('y NUNCA le ofrece un inquilino de la reserva de SUMA', async () => {
      /*
       * La trampa del arreglo. Hay tres libres en la reserva y el botón las
       * entregaría de un clic a quien contrató no tenerlas.
       *
       * LA PRIMERA VERSIÓN DE ESTA ASERCIÓN BUSCABA «reserva.» Y SEÑALÓ LA
       * FRASE CORRECTA: «No se le entrega un inquilino de la reserva» también
       * termina en esa palabra. Una regla que no distingue la negativa del
       * ofrecimiento manda a «arreglar» justo lo que vino a proteger, y la
       * forma de que eso no vuelva a pasar es nombrar el ofrecimiento, no la
       * palabra que los dos comparten.
       */
      const p = punto(await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).estado('e1'), 'tenant');
      expect(p.accionAutomatica).toBeNull();
      expect(p.accion ?? '').not.toMatch(/Entregarle|libres en la reserva/i);
      expect(p.accion ?? '').toMatch(/No se le entrega un inquilino de la reserva/i);
    });

    it('ni le ordena subir la cartera a SOMBRA', async () => {
      const p = punto(await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).estado('e1'), 'conciliacion');
      expect(p.accion ?? '').not.toMatch(/SOMBRA/);
      expect(p.detalle).toMatch(/a propósito/i);
    });
  });

  describe('con su origen ya ACTIVO', () => {
    it('el punto del inquilino queda resuelto sin inquilino de la reserva', async () => {
      const ficha = await armar(SOMBRA, traeSuBase(EstadoOrigenCore.ACTIVO)).estado('e1');
      const p = punto(ficha, 'tenant');
      expect([p.listo, p.accion, p.accionAutomatica]).toEqual([true, null, null]);
      expect(ficha.servicios.fineract).toBe(true);
    });
  });

  describe('lo que ya estaba bien sigue igual', () => {
    it('la empresa de la nube de SUMA con inquilino se lee como siempre', async () => {
      const ficha = await armar(SOMBRA, laPoneSuma, 'suma-07').estado('e1');
      expect(ficha.servicios.fineract).toBe(true);
      expect(punto(ficha, 'tenant')).toMatchObject({ listo: true, detalle: 'Asignado: suma-07.' });
    });

    it('la empresa de la nube de SUMA que contrató y no tiene inquilino sigue pudiendo recibir uno', async () => {
      const p = punto(await armar(SOMBRA, laPoneSuma, null, 3).estado('e1'), 'tenant');
      expect(p.accionAutomatica).toBe('ASIGNAR_INQUILINO');
    });

    it('la empresa de SÓLO ERP sigue diciendo que opera sólo con el ERP', async () => {
      /*
       * Es la mitad que más importa del arreglo: la mayoría de las empresas no
       * tienen renglón de origen, y si la ausencia se leyera como «contrató»,
       * esta ficha les pediría a todas un inquilino que nadie compró.
       */
      const ficha = await armar(APAGADA, null).estado('e1');
      expect(ficha.servicios.fineract).toBe(false);
      expect(punto(ficha, 'tenant')).toMatchObject({
        aplica: false,
        listo: true,
        detalle: 'No aplica: esta empresa opera sólo con el ERP.',
      });
      const [fila] = await armar(APAGADA, null).listar();
      expect(fila).toMatchObject({ usaFineract: false, origenCore: null });
    });

    it('y una empresa sin configuración tampoco se inventa un core', async () => {
      const ficha = await armar(null, null).estado('e1');
      expect(ficha.servicios.fineract).toBe(false);
    });
  });

  it('LA PRUEBA DE LA PRUEBA: con la pregunta a medias, estas pruebas fallan', async () => {
    /*
     * Lo que distingue el arreglo del defecto es UNA condición. Si alguien la
     * quitara, lo que arriba se mide tiene que ponerse rojo; si no, estas doce
     * pruebas estarían pasando por otra razón y la regla no vigilaría nada.
     *
     * Se reproduce aquí la pregunta ANTIGUA —los dos modos y nada más— sobre
     * exactamente el caso medido en vivo, y se comprueba que daba la respuesta
     * equivocada. Es la diferencia que sostiene todo lo de arriba.
     */
    const comoAntes = (cfg: { modo: ModoCartera; modoContabilidad: ModoContabilidad }) =>
      cfg.modo !== ModoCartera.APAGADO || cfg.modoContabilidad !== ModoContabilidad.APAGADO;

    expect(comoAntes(APAGADA)).toBe(false);

    const ficha = await armar(APAGADA, traeSuBase(EstadoOrigenCore.DECLARADO)).estado('e1');
    expect(ficha.servicios.fineract).toBe(true);
  });
});
