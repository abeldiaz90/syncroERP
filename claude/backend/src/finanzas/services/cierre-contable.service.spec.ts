import { BadRequestException } from '@nestjs/common';
import { CierreContableService } from './cierre-contable.service';

describe('CierreContableService — cierre mensual guiado', () => {
  const cierreRepo = {
    findOne: jest.fn(),
    find: jest.fn(async () => []),
  };
  const revisionRepo = {
    findOne: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((valor) => valor),
    save: jest.fn(async (valor) => ({
      id: 'revision-1',
      fechaCreacion: new Date(),
      ...valor,
    })),
  };
  const eventoRepo = { find: jest.fn(async () => []) };
  const activacion = { exigirActiva: jest.fn(async () => undefined) };
  let pendientes: any[] = [];
  /** Lo que responde la consulta del espejo contable. Vacio = empresa sin espejo. */
  let espejoFilas: any[] = [];

  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('WITH totales')) {
        return [
          {
            totalPolizas: 3,
            totalPartidas: 9,
            totalDebe: 1000,
            totalHaber: 1000,
            polizasSinPartidas: 0,
            polizasDescuadradas: 0,
          },
        ];
      }
      if (sql.includes('FROM asientos_pendientes')) return pendientes;
      if (sql.includes("c.rolSistema = 'IVA_TRASLADADO_COBRADO'")) {
        // Ya representa importes netos: las reversas restan.
        return [
          {
            trasladado: 160,
            acreditable: 60,
            trasladadoNoCobrado: 32,
            acreditablePendiente: 16,
            movimientos: 6,
          },
        ];
      }
      if (sql.includes('FROM cuentas_bancarias'))
        return [{ cuentasActivas: 1 }];
      if (sql.includes('FROM tesoreria_estados_cuenta'))
        return [{ estadosCerrados: 1 }];
      if (sql.includes('FROM conciliaciones_financieras')) {
        return [
          {
            fechaCorte: '2026-07-30',
            fechaConfirmacion: new Date('2026-07-30T12:00:00'),
          },
        ];
      }
      if (sql.includes('FROM polizas') && sql.includes('GROUP BY anio, mes')) {
        return [];
      }
      /*
       * Las operaciones sin contabilizar. Faltaba, y la prueba pasaba igual
       * porque el servicio remataba esa consulta con `.catch(() => [])`: el
       * error se tragaba y el control salia en verde. Al quitar el catch mudo,
       * esta prueba empezo a fallar —correctamente— y quedo claro que su
       * simulador nunca habia cubierto esta consulta.
       */
      if (sql.includes('resultado WHERE cantidad > 0')) return [];
      /*
       * El espejo contable. La empresa de esta prueba NO tiene el espejo
       * encendido —no hay fila de configuracion—, asi que el control no
       * aparece y el diagnostico sale sin bloqueos. Devolver `[]` es
       * justamente lo que responde Postgres cuando la empresa no contrato
       * la integracion.
       */
      if (sql.includes('integracion_configuracion_empresa')) return espejoFilas;
      throw new Error(`Consulta no simulada: ${sql}`);
    }),
  };

  /*
   * El respaldo se simula: esta suite mide las reglas del cierre, no el
   * volcado. Que el volcado se verifique de verdad lo miden las pruebas de
   * `RespaldoCierreService`.
   */
  const respaldo = {
    generar: jest.fn().mockResolvedValue({
      archivo: '/tmp/cierre.sql',
      bytes: 1234,
      sha256: 'abc',
      generadoEn: new Date().toISOString(),
      duracionMs: 10,
      origen: 'pg_dump',
    }),
  };

  let service: CierreContableService;

  beforeEach(() => {
    jest.clearAllMocks();
    pendientes = [];
    cierreRepo.findOne.mockResolvedValue(null);
    revisionRepo.findOne.mockResolvedValue(null);
    espejoFilas = [];
    delete process.env.CONTABILIDAD_EXTERNA_MODO;
    service = new CierreContableService(
      cierreRepo as any,
      revisionRepo as any,
      eventoRepo as any,
      dataSource as any,
      activacion as any,
      respaldo as any,
    );
  });

  function periodoAnterior() {
    const fecha = new Date();
    fecha.setDate(1);
    fecha.setMonth(fecha.getMonth() - 1);
    return { mes: fecha.getMonth() + 1, anio: fecha.getFullYear() };
  }

  it('calcula IVA neto y produce un diagnóstico sin bloqueos', async () => {
    const periodo = periodoAnterior();
    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodo,
    );

    expect(resultado.snapshot.bloqueos).toBe(0);
    expect(resultado.snapshot.iva).toEqual(
      expect.objectContaining({
        trasladado: 160,
        acreditable: 60,
        ivaAPagar: 100,
        saldoAFavor: 0,
      }),
    );
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   * EL ESPEJO CONTABLE, QUE NINGUN CONTROL MIRABA
   *
   * Medido el 25-sep-2026 contra la instalacion en modo ESPEJO: 5 asientos
   * FALLIDOS en la bandeja de salida —tres por cuentas sin mapear, dos
   * rechazados por Fineract— y un diagnostico de cierre con OCHO controles,
   * ninguno de los cuales preguntaba por el mayor externo. Agosto se cerro asi,
   * con los dos libros diferentes y el mes certificado como correcto.
   * ────────────────────────────────────────────────────────────────────────
   */
  it('con el espejo encendido y asientos sin entregar, el mes no se cierra', async () => {
    process.env.CONTABILIDAD_EXTERNA_MODO = 'ESPEJO';
    espejoFilas = [
      { fallidos: 5, reintentables: 0, pendientes: 0, modoEmpresa: 'ESPEJO' },
    ];

    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodoAnterior(),
    );

    const espejo = resultado.snapshot.controles.find(
      (control: any) => control.clave === 'ESPEJO_CONTABLE',
    );
    expect(espejo?.bloquea).toBe(true);
    expect(espejo?.descripcion).toContain('5 asiento(s)');
    expect(resultado.snapshot.bloqueos).toBeGreaterThan(0);
  });

  it('un asiento PENDIENTE también bloquea, no sólo un fallido', async () => {
    /*
     * Contar sólo los FALLIDOS dejaría pasar el caso peor: un asiento que se
     * envió y del que nunca se supo la respuesta se queda PENDIENTE, y ésa es
     * exactamente la divergencia de la que nadie se entera.
     */
    process.env.CONTABILIDAD_EXTERNA_MODO = 'ESPEJO';
    espejoFilas = [
      { fallidos: 0, reintentables: 1, pendientes: 1, modoEmpresa: 'ESPEJO' },
    ];

    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodoAnterior(),
    );

    const espejo = resultado.snapshot.controles.find(
      (control: any) => control.clave === 'ESPEJO_CONTABLE',
    );
    expect(espejo?.bloquea).toBe(true);
    expect(espejo?.descripcion).toContain('2 asiento(s)');
  });

  it('con el espejo encendido y la bandeja limpia, el control pasa', async () => {
    process.env.CONTABILIDAD_EXTERNA_MODO = 'ESPEJO';
    espejoFilas = [
      { fallidos: 0, reintentables: 0, pendientes: 0, modoEmpresa: 'ESPEJO' },
    ];

    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodoAnterior(),
    );

    const espejo = resultado.snapshot.controles.find(
      (control: any) => control.clave === 'ESPEJO_CONTABLE',
    );
    expect(espejo?.estado).toBe('CORRECTO');
    expect(resultado.snapshot.bloqueos).toBe(0);
  });

  it('sin espejo contratado, el control ni aparece', async () => {
    /*
     * Quien instalo el ERP solo no tiene por que ver un control que no le
     * toca. Un control que no puede fallar es ruido, y el ruido tapa a los
     * que si importan.
     */
    process.env.CONTABILIDAD_EXTERNA_MODO = 'ESPEJO';
    espejoFilas = [
      { fallidos: 9, reintentables: 0, pendientes: 0, modoEmpresa: 'APAGADO' },
    ];

    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodoAnterior(),
    );

    expect(
      resultado.snapshot.controles.find(
        (control: any) => control.clave === 'ESPEJO_CONTABLE',
      ),
    ).toBeUndefined();
    expect(resultado.snapshot.bloqueos).toBe(0);
  });

  it('un asiento pendiente del período bloquea la preparación', async () => {
    const periodo = periodoAnterior();
    pendientes = [
      {
        id: 'pendiente-1',
        tipo: 'VENTA',
        folioDocumento: 'VENTA-8',
        estado: 'FALLIDO',
        ultimoError: 'Falta una cuenta.',
      },
    ];
    revisionRepo.findOne.mockResolvedValue({
      id: 'revision-1',
      empresaId: 'empresa-1',
      ...periodo,
      estado: 'BORRADOR',
      snapshotJson: '{}',
      confirmacionesJson: '{}',
      version: 1,
    });

    await expect(
      service.prepararRevision('empresa-1', 'usuario-1', 'revision-1', {
        confirmaciones: {
          bancosRevisados: true,
          ivaRevisado: true,
          documentosCompletos: true,
          respaldoConfirmado: true,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no acepta confirmaciones humanas incompletas', async () => {
    const periodo = periodoAnterior();
    revisionRepo.findOne.mockResolvedValue({
      id: 'revision-1',
      empresaId: 'empresa-1',
      ...periodo,
      estado: 'BORRADOR',
      snapshotJson: '{}',
      confirmacionesJson: '{}',
      version: 1,
    });

    await expect(
      service.prepararRevision('empresa-1', 'usuario-1', 'revision-1', {
        confirmaciones: {
          bancosRevisados: true,
          ivaRevisado: false,
          documentosCompletos: true,
          respaldoConfirmado: true,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide cerrar el mes actual aunque tenga pólizas', async () => {
    const hoy = new Date();
    await expect(
      service.iniciarRevision('empresa-1', 'usuario-1', {
        mes: hoy.getMonth() + 1,
        anio: hoy.getFullYear(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
