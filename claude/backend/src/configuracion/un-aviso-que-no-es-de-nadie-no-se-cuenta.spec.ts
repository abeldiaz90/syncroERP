import { OperacionesPendientesService } from './services/operaciones-pendientes.service';

/**
 * ============================================================================
 * Un aviso que no es de nadie no lo contaba nadie
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 21-oct-2026: la instalación tenía 32 avisos huérfanos y NINGÚN
 * contador los veía. Un aviso huérfano es uno que el ERP no pudo atribuir a
 * ninguna empresa —existe en el core un recurso que el ERP nunca creó, o su
 * identificador apunta a dos inquilinos—, así que no tiene `empresaid`.
 *
 * Y `contar`, con razón, filtra por `empresaid`: un pendiente es de alguien.
 * De modo que lo que define a un huérfano es exactamente lo que lo hacía
 * invisible en el tablero. La pantalla que sí los lista existe desde hace
 * semanas y los suma en su titular; lo que faltaba era que alguien supiera que
 * hay que ir.
 *
 * A QUIÉN SE LE PUBLICA
 *
 * A quien puede abrir la pantalla, y a nadie más. La ruta que los lista es
 * `@Roles('administrador')`, así que este renglón también: un pendiente cuyo
 * enlace le va a contestar que no al que lo lee es otra forma de «un botón que
 * lleva a un no». Y un huérfano puede describir a un cliente, un crédito o un
 * pago de otro inquilino —el mismo cuidado que ya hace que esa ruta devuelva
 * la ficha y no el cuerpo del aviso—.
 *
 * LA PRIMERA VERSIÓN LO GATEABA CON `EMPRESA_OPERADORA_ID`, y se cambió al
 * comprobarlo: esa variable no está definida en ninguna instalación. Sólo la
 * nombra un comentario viejo de `alta-empresas.service.ts`, de cuando el alta
 * se cerraba así; hoy se cierra con una clave de servicio. El contador habría
 * quedado escrito y apagado para siempre, que es peor que no tenerlo: nadie
 * echa de menos lo que nunca vio.
 * ============================================================================
 */

function armar(huerfanos: number, opciones: { tabla?: boolean; columna?: boolean } = {}) {
  const tabla = opciones.tabla ?? true;
  const columna = opciones.columna ?? true;
  const consultas: string[] = [];

  const ds = {
    query: jest.fn(async (sql: string) => {
      consultas.push(sql);
      if (/information_schema/i.test(sql)) {
        if (!tabla) return [];
        return [
          { tabla: 'integracion_avisos', columna: 'id' },
          { tabla: 'integracion_avisos', columna: 'estado' },
          ...(columna ? [{ tabla: 'integracion_avisos', columna: 'empresaid' }] : []),
        ];
      }
      if (/empresaid IS NULL/i.test(sql)) return [{ total: String(huerfanos) }];
      /* Cualquier otro conteo por empresa: cero, para no ensuciar la lista. */
      return [{ total: '0' }];
    }),
  };

  return {
    servicio: new OperacionesPendientesService(ds as never),
    consultas,
  };
}

const buscar = (r: { pendientes: Array<{ codigo: string }> }) =>
  r.pendientes.find((p) => p.codigo === 'AVISOS_HUERFANOS');

describe('un aviso que no es de nadie no lo contaba nadie', () => {
  it('el administrador los cuenta, y va a la pantalla que los enseña', async () => {
    const { servicio } = armar(32);

    const p = buscar(await servicio.obtener('suma', 'administrador'));

    expect(p).toMatchObject({
      codigo: 'AVISOS_HUERFANOS',
      cantidad: 32,
      prioridad: 'ALTA',
      /*
       * A la pantalla que YA los enseña. Una ruta `/huerfanos` propia no
       * existe, y publicarla sería mandar a quien lee el tablero a un 404:
       * el defecto que este proyecto llama «un botón que lleva a un no».
       */
      ruta: '/dashboard/creditos/avisos',
    });
  });

  it.each(['credito', 'cobranza', 'direccion', '', undefined])(
    'y NO se le publica a %p, que no puede abrir esa pantalla',
    async (rol) => {
      /*
       * La mitad que más importa. `direccion` entra en la lista a propósito:
       * es un rol alto y la ruta de huérfanos no se lo concede. El criterio no
       * es la jerarquía, es quién puede abrir el enlace.
       */
      const { servicio } = armar(32);

      expect(buscar(await servicio.obtener('suma', rol))).toBeUndefined();
    },
  );

  it.each(['administrador', 'admin', '  Administrador ', 'SUPER_ADMIN', 'administrator'])(
    'reconoce al administrador escrito %p, como lo hace el guardia',
    async (rol) => {
      /*
       * MEDIDO EN VIVO el 22-oct-2026, y es lo que hizo falta arreglar: el
       * token de esta instalación dice `admin`. La primera versión comparó
       * `rol === 'administrador'` a mano y el renglón no salió en el tablero
       * de quien SÍ puede abrir la pantalla —un pendiente escrito y apagado,
       * que es como si no estuviera—.
       *
       * `roles.util.ts` lleva en su cabecera la lista de las tres veces
       * anteriores que alguien comparó el rol a mano. Ésta fue la cuarta, y
       * esta prueba es para que no haya quinta: se pregunta con
       * `esRolAdministrador`, que es lo que pregunta el guardia, y aquí se
       * fijan las escrituras que el sistema reconoce.
       */
      const { servicio } = armar(32);

      expect(buscar(await servicio.obtener('suma', rol))).toBeDefined();
    },
  );

  it('con cero huérfanos no se publica: un pendiente en cero es ruido', async () => {
    const { servicio } = armar(0);

    expect(buscar(await servicio.obtener('suma', 'administrador'))).toBeUndefined();
  });

  it('se cuenta lo que pide algo: PENDIENTE y FALLIDO', async () => {
    const { servicio, consultas } = armar(1);

    await servicio.obtener('suma', 'administrador');

    const consulta = consultas.find((c) => /empresaid IS NULL/i.test(c));
    expect(consulta).toBeDefined();
    expect(consulta).toMatch(/estado IN \(\$1,\$2\)/);
  });

  it('si la tabla no está, se dice que no se pudo medir y no se inventa un cero', async () => {
    const { servicio } = armar(32, { tabla: false });

    const r = await servicio.obtener('suma', 'administrador');
    expect(buscar(r)).toBeUndefined();
    expect(r.noVerificados).toContain('AVISOS_HUERFANOS');
  });

  it('LA PRUEBA DE LA PRUEBA: el contador por empresa sigue sin verlos', async () => {
    /*
     * Es lo que justifica todo lo anterior. `contar` filtra por `empresaid` y
     * hace bien; si un día empezara a ver los huérfanos, este pendiente
     * estaría contando dos veces y, peor, el contador de una empresa estaría
     * incluyendo avisos que no son suyos.
     *
     * Se comprueba leyendo las consultas que de verdad se emitieron sobre la
     * MISMA tabla: `integracion_avisos` es también una definición del tablero
     * —CORE_AVISO— así que se cuenta dos veces, y cada una tiene que preguntar
     * por lo suyo: una por `empresaId=$1`, la otra por `empresaid IS NULL`.
     */
    const { servicio, consultas } = armar(32);

    await servicio.obtener('suma', 'administrador');

    const sobreAvisos = consultas.filter((c) => /integracion_avisos/i.test(c));
    const porEmpresa = sobreAvisos.filter((c) => /empresaId=\$1/i.test(c));
    const sinEmpresa = sobreAvisos.filter((c) => /empresaid IS NULL/i.test(c));

    expect([porEmpresa.length, sinEmpresa.length]).toEqual([1, 1]);
    expect(porEmpresa[0]).not.toMatch(/IS NULL/i);
  });
});
