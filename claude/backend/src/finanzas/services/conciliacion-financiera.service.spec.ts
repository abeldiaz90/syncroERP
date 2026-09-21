import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConciliacionFinancieraService } from './conciliacion-financiera.service';

describe('ConciliacionFinancieraService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((valor) => valor),
    save: jest.fn(async (valor) => valor),
  };
  const activacion = {
    exigirActiva: jest.fn(async () => undefined),
  };
  const dataSource = {
    query: jest.fn(async (sql: string, parametros: unknown[]) => {
      if (sql.includes('OBJECT_ID')) return [{ existe: 1 }];
      /*
       * `COUNT_BIG` era de SQL Server; en PostgreSQL el servicio pregunta con
       * `COUNT(*) registros`. Sin esta rama, las tres áreas que se apoyan en
       * esa consulta —clientes, proveedores e inventario— se reportaban «sin
       * evidencia», que es justo lo contrario de lo que esta prueba describe.
       */
      if (sql.includes('registros')) return [{ registros: 1 }];
      if (sql.includes('COUNT_BIG')) return [{ registros: 1 }];
      if (sql.includes('FROM partidas_poliza')) {
        return [
          { rolSistema: 'CAJA', cargos: 100, abonos: 0 },
          { rolSistema: 'BANCOS', cargos: 500, abonos: 0 },
          { rolSistema: 'CLIENTES_CXC', cargos: 200, abonos: 0 },
          { rolSistema: 'PROVEEDORES', cargos: 0, abonos: 300 },
          { rolSistema: 'INVENTARIO', cargos: 700, abonos: 0 },
        ];
      }
      if (sql.includes('FROM cuentas_bancarias')) {
        return [
          {
            id: 'caja-1',
            nombre: 'Caja principal',
            tipo: 'CAJA',
            numeroCuenta: null,
            cuentaContableId: 'contable-caja',
            saldo: 100,
            tieneMovimientos: 1,
          },
          {
            id: 'banco-1',
            nombre: 'Banco',
            tipo: 'BANCO',
            numeroCuenta: '1234',
            cuentaContableId: 'contable-banco',
            saldo: 450,
            tieneMovimientos: 1,
          },
        ];
      }
      if (sql.includes('FROM creditos_clientes')) {
        return [
          { id: 'cliente-1', nombre: 'Cliente', documentos: 1, saldo: 200 },
        ];
      }
      if (sql.includes('FROM ordenes_compra')) {
        return [
          { id: 'proveedor-1', nombre: 'Proveedor', documentos: 1, saldo: 300 },
        ];
      }
      if (sql.includes('FROM lotes_inventario')) {
        return [
          {
            id: 'producto-1',
            nombre: 'Producto',
            referencia: 'SKU-1',
            documentos: 1,
            cantidad: 10,
            saldo: 700,
            lotesCostoCero: 0,
          },
        ];
      }
      /*
       * `to_regclass` es como el servicio pregunta en PostgreSQL si una tabla
       * existe —antes era `OBJECT_ID`, de SQL Server— y el simulador no lo
       * contemplaba, así que la prueba moría en la primera llamada. Se responde
       * que sí existe, que es el caso que estas pruebas describen.
       */
      if (sql.includes('to_regclass')) return [{ existe: 1 }];
      throw new Error(`Consulta no simulada: ${sql} ${parametros}`);
    }),
  };

  let service: ConciliacionFinancieraService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    service = new ConciliacionFinancieraService(
      repo as any,
      dataSource as any,
      activacion as any,
    );
  });

  it('fotografía los cinco auxiliares y calcula diferencias sin crear pólizas', async () => {
    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(ahora.getDate()).padStart(2, '0')}`;

    const resultado: any = await service.iniciar('empresa-1', 'usuario-1', {
      fechaCorte: hoy,
    });

    expect(resultado.snapshot.areas).toHaveLength(5);
    expect(
      resultado.snapshot.areas.find((area: any) => area.clave === 'BANCOS')
        .diferencia,
    ).toBe(50);
    expect(resultado.snapshot.resumen).toEqual({
      cuadradas: 4,
      conDiferencia: 1,
      sinEvidencia: 0,
    });
    expect(resultado.estado).toBe('CON_DIFERENCIAS');
  });

  it('rechaza fechas históricas porque los auxiliares sólo conservan el saldo actual', async () => {
    await expect(
      service.iniciar('empresa-1', 'usuario-1', {
        fechaCorte: '2020-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('no permite confirmar como coincidente un área que tiene diferencia', async () => {
    repo.findOne.mockResolvedValue({
      id: 'conc-1',
      empresaId: 'empresa-1',
      estado: 'CON_DIFERENCIAS',
      snapshotJson: JSON.stringify({
        areas: [
          {
            clave: 'BANCOS',
            titulo: 'Bancos',
            disponible: true,
            cuadra: false,
          },
        ],
      }),
      resolucionesJson: '{}',
      version: 1,
    });

    await expect(
      service.resolverArea('empresa-1', 'conc-1', 'BANCOS', {
        estado: 'CONFIRMADA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloquea el cierre mientras exista un área marcada para ajuste', async () => {
    repo.findOne.mockResolvedValue({
      id: 'conc-1',
      empresaId: 'empresa-1',
      estado: 'CON_DIFERENCIAS',
      snapshotJson: JSON.stringify({
        areas: [{ clave: 'CAJA', titulo: 'Cajas' }],
      }),
      resolucionesJson: JSON.stringify({
        CAJA: {
          estado: 'REQUIERE_AJUSTE',
          justificacion: 'Falta registrar el movimiento.',
          fecha: new Date().toISOString(),
        },
      }),
      version: 2,
    });

    await expect(
      service.confirmar('empresa-1', 'conc-1', 'usuario-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una conciliación confirmada queda inmutable', async () => {
    repo.findOne.mockResolvedValue({
      id: 'conc-1',
      empresaId: 'empresa-1',
      estado: 'CONCILIADA',
      snapshotJson: '{"areas":[]}',
      resolucionesJson: '{}',
      version: 3,
    });

    await expect(
      service.resolverArea('empresa-1', 'conc-1', 'CAJA', {
        estado: 'JUSTIFICADA',
        justificacion: 'Justificación válida.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
