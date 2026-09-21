import dataSource from './data-source';

type ContratoTabla = {
  tabla: string;
  columnas: string[];
};

const contratosCriticos: ContratoTabla[] = [
  {
    tabla: 'roles',
    columnas: ['id', 'nombre'],
  },
  {
    tabla: 'Empresas',
    columnas: [
      'id',
      'nombreComercial',
      'rfc',
      'regimenFiscal',
      'codigoPostal',
      'onboardingCompletado',
    ],
  },
  {
    tabla: 'rrhh_empleados',
    columnas: [
      'id',
      'empresaId',
      'numeroEmpleado',
      'puestoId',
      'departamentoId',
      'regimenFiscal',
      'salarioDiario',
      'banco',
      'clabe',
    ],
  },
  {
    tabla: 'rrhh_contratos_laborales',
    columnas: [
      'id',
      'empresaId',
      'empleadoId',
      'tipoContrato',
      'fechaInicio',
      'fechaFin',
      'salarioDiario',
      'salarioDiarioIntegrado',
      'puestoId',
      'departamentoId',
      'vigente',
    ],
  },
  {
    tabla: 'rrhh_movimientos_laborales',
    columnas: [
      'id',
      'empresaId',
      'empleadoId',
      'tipo',
      'fechaEfectiva',
      'valoresAnterioresJson',
      'valoresNuevosJson',
      'motivo',
      'usuarioId',
    ],
  },
  {
    tabla: 'ventas',
    columnas: [
      'id',
      'empresaId',
      'folio',
      'almacenId',
      'claveIdempotencia',
      'estado',
      'total',
    ],
  },
  {
    tabla: 'devoluciones_venta',
    columnas: [
      'id',
      'empresaId',
      'ventaId',
      'claveIdempotencia',
      'estadoFiscal',
    ],
  },
  {
    tabla: 'stock_por_almacen',
    columnas: [
      'id',
      'empresaId',
      'productoId',
      'almacenId',
      'cantidad',
      'reservado',
      'comprometido',
      'bloqueado',
      'enTransito',
    ],
  },
];

describe('contratos del esquema actual', () => {
  /*
   * Este `beforeAll` construye los metadatos de TODAS las entidades leyendo el
   * disco, y eso tarda más que los 5 s que jest da por omisión a un hook. Venía
   * rozando el límite —5.5 s en la última corrida verde— y al crecer el modelo
   * lo pasó: la suite fallaba entera con «Exceeded timeout», que no dice nada
   * sobre el esquema y manda a buscar donde no es.
   *
   * No es un problema de rendimiento que haya que resolver: es una prueba de
   * modelo, no de velocidad. Se le da el tiempo que necesita.
   */
  jest.setTimeout(60_000);

  beforeAll(async () => {
    // Construye metadatos sin conectarse a SQL Server. Detecta entidades no
    // registradas, relaciones inválidas y columnas omitidas en el modelo.
    await (
      dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  }, 60_000);

  it.each(contratosCriticos)(
    '$tabla contiene las columnas requeridas por sus flujos',
    ({ tabla, columnas }) => {
      const metadata = dataSource.entityMetadatas.find(
        (entidad) => entidad.tableName.toLowerCase() === tabla.toLowerCase(),
      );
      expect(metadata).toBeDefined();

      const actuales = new Set(
        metadata!.columns.map((columna) => columna.databaseName.toLowerCase()),
      );
      for (const columna of columnas) {
        expect(actuales).toContain(columna.toLowerCase());
      }
    },
  );
});
