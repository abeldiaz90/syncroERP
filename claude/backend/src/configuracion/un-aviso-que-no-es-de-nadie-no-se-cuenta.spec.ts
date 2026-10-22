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
 * DE QUIÉN ES ESTE PENDIENTE
 *
 * De SUMA, no de un cliente. Es quien opera la integración y quien puede mirar
 * entre inquilinos. Enseñárselo al administrador de una empresa sería contarle
 * que en el core hay movimiento que no es suyo —el mismo cuidado que ya hace
 * que la ruta de huérfanos devuelva la ficha y no el cuerpo del aviso—.
 *
 * Por eso se publica sólo en el tablero de `EMPRESA_OPERADORA_ID`, y si esa
 * variable no está declarada no se publica a nadie: la misma puerta cerrada
 * que protege el alta de empresas.
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
  const guardado = process.env.EMPRESA_OPERADORA_ID;
  afterEach(() => {
    if (guardado === undefined) delete process.env.EMPRESA_OPERADORA_ID;
    else process.env.EMPRESA_OPERADORA_ID = guardado;
  });

  it('el tablero de la operadora los cuenta, y manda a la pantalla que los enseña', async () => {
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio } = armar(32);

    const p = buscar(await servicio.obtener('suma'));

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

  it('y NO aparece en el tablero de un cliente', async () => {
    /*
     * La mitad que más importa. Un huérfano puede describir a un cliente, un
     * crédito o un pago de OTRO inquilino; decirle a una empresa «tienes 32
     * pendientes» sobre eso es contarle de movimiento ajeno.
     */
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio } = armar(32);

    expect(buscar(await servicio.obtener('una-empresa-cliente'))).toBeUndefined();
  });

  it('sin EMPRESA_OPERADORA_ID declarada, no se publica a nadie', async () => {
    delete process.env.EMPRESA_OPERADORA_ID;
    const { servicio } = armar(32);

    expect(buscar(await servicio.obtener('suma'))).toBeUndefined();
  });

  it('con cero huérfanos no se publica: un pendiente en cero es ruido', async () => {
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio } = armar(0);

    expect(buscar(await servicio.obtener('suma'))).toBeUndefined();
  });

  it('se cuenta lo que pide algo: PENDIENTE y FALLIDO', async () => {
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio, consultas } = armar(1);

    await servicio.obtener('suma');

    const consulta = consultas.find((c) => /empresaid IS NULL/i.test(c));
    expect(consulta).toBeDefined();
    expect(consulta).toMatch(/estado IN \(\$1,\$2\)/);
  });

  it('si la tabla no está, se dice que no se pudo medir y no se inventa un cero', async () => {
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio } = armar(32, { tabla: false });

    const r = await servicio.obtener('suma');
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
    process.env.EMPRESA_OPERADORA_ID = 'suma';
    const { servicio, consultas } = armar(32);

    await servicio.obtener('suma');

    const sobreAvisos = consultas.filter((c) => /integracion_avisos/i.test(c));
    const porEmpresa = sobreAvisos.filter((c) => /empresaId=\$1/i.test(c));
    const sinEmpresa = sobreAvisos.filter((c) => /empresaid IS NULL/i.test(c));

    expect([porEmpresa.length, sinEmpresa.length]).toEqual([1, 1]);
    expect(porEmpresa[0]).not.toMatch(/IS NULL/i);
  });
});
