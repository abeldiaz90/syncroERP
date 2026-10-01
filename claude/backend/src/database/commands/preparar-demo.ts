import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/*
 * La conexión se arma aquí y no se toma de `data-source.ts` a propósito: ese
 * archivo carga entidades, migraciones y suscriptores, y este comando no
 * necesita nada de eso —sólo SQL—. Con el `DataSource` completo la primera
 * corrida terminó sin imprimir una línea, y un comando de borrado que se cae
 * en silencio es lo último que quieres la noche antes de una demostración.
 *
 * Las credenciales las lee el proceso de su propio `.env.local`; no viajan por
 * ningún otro sitio.
 */
cargarEnv({ path: '.env.local' });
cargarEnv();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? process.env.DB_DATABASE,
});

/**
 * ============================================================================
 * SyncroERP · Dejar la instalación lista para una demostración
 * ----------------------------------------------------------------------------
 * QUÉ HACE Y QUÉ NO
 *
 * Borra la OPERACIÓN de una empresa —todo lo que se registró usando el ERP— y
 * conserva la CONFIGURACIÓN, que es lo que costó horas construir y no se
 * reconstruye en una noche.
 *
 * Se borra:  ventas, cobranza, compras, requisiciones, cotizaciones, almacén,
 *            inventario, pólizas, tesorería, CFDI, créditos, CRM, hotelería,
 *            movimientos de nómina, productos, clientes y proveedores, y la
 *            bandeja de integración con el mayor externo.
 *
 * Se conserva: la empresa, los roles, los usuarios, los empleados y sus
 *            contratos, el catálogo de cuentas contables, los catálogos del
 *            SAT, los almacenes y sus ubicaciones, las listas de precio, las
 *            cuentas bancarias y cajas, los impuestos, las unidades de medida,
 *            los departamentos, los puestos y la configuración de aprobaciones.
 *
 * POR QUÉ ESTE COMANDO Y NO `db:reset:operaciones`
 *
 * Aquél existe y está bien, pero cubre 26 tablas: ventas, compras, pólizas e
 * inventario. No toca CFDI, tesorería, caja, nómina, CRM, hotelería, activos,
 * auditoría ni la bandeja de integración, y conserva a propósito productos,
 * clientes y proveedores. Para una demostración limpia eso deja la mitad del
 * sistema con datos de prueba a la vista.
 *
 * TRES SEGUROS, Y NINGUNO ES DECORATIVO
 *
 *  1. Por omisión SÓLO CUENTA. Para borrar hacen falta `--execute` y
 *     `--confirm=BORRAR_OPERACION`.
 *  2. Todo ocurre en UNA transacción: si una tabla falla, no se borró nada.
 *  3. Después de borrar, VERIFICA que lo que debía conservarse sigue ahí, y
 *     si algo se llevó por delante una cascada, lo dice y deshace.
 *
 * Y un cuarto que no es del script: **haz un respaldo antes**. Un `pg_dump` de
 * dos minutos es la diferencia entre un susto y una noche perdida.
 *
 *   npx ts-node -T src/database/commands/preparar-demo.ts --empresa=<UUID>
 *   npx ts-node -T src/database/commands/preparar-demo.ts --empresa=<UUID> \
 *       --execute --confirm=BORRAR_OPERACION
 * ============================================================================
 */

const arg = (nombre: string) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];

const EMPRESA = arg('empresa');
const EJECUTAR = process.argv.includes('--execute');
const CONFIRMAR = arg('confirm');

/**
 * El orden importa: primero los hijos, después los padres.
 *
 * Se borra con DELETE y no con TRUNCATE porque la base es multiempresa y sólo
 * se limpia una: un TRUNCATE se llevaría también la operación de las demás.
 */
const OPERACION: string[] = [
  // ── Integración con el mayor externo ──
  // Va primero: sus filas apuntan a pólizas, clientes y créditos que se van.
  'integracion_discrepancias',
  'integracion_avisos',
  'integracion_eventos',
  'integracion_vinculos',

  // ── Contabilidad ──
  'revisiones_cierre_mensual',
  'eventos_cierre_contable',
  'cierres_contables',
  'conciliaciones_financieras',
  'asientos_pendientes',
  'partidas_poliza',
  'polizas',

  // ── CFDI ──
  'partidas_factura',
  'facturas',

  // ── Cobranza y crédito ──
  'saldos_favor_clientes_movimientos',
  'pagos_cobranza',
  'amortizacion_cuotas',
  'creditos_clientes',

  // ── Tesorería y caja ──
  'tesoreria_lineas_estado_cuenta',
  'tesoreria_estados_cuenta',
  'tesoreria_movimientos',
  'caja_movimientos',
  'caja_turnos',

  // ── Ventas ──
  'aplicaciones_lote_devolucion',
  'detalles_devolucion_venta',
  'devoluciones_venta',
  'detalles_venta',
  'ventas',

  // ── Compras ──
  'pagos_proveedor',
  'devoluciones_proveedor_detalle',
  'devoluciones_proveedor',
  'recepciones_compra_detalle',
  'recepciones_compra',
  'detalles_orden_compra',
  'ordenes_compra',
  'detalles_cotizacion',
  'cotizaciones',
  'aprobaciones_documentos',
  'aprobaciones',
  'detalles_requisicion',
  'requisiciones',

  // ── Almacén e inventario ──
  'conteos_inventario_detalle',
  'conteos_inventario',
  'reservas_inventario',
  'transferencias_inventario_detalle',
  'transferencias_inventario',
  'movimientos_inventario',
  'stock_ubicaciones',
  'stock_por_almacen',
  'lotes_inventario',
  'producto_ubicaciones',
  'importaciones_inventario_filas_aplicadas',
  'importaciones_inventario_errores',
  'importaciones_inventario',

  // ── Hotelería ──
  'hoteleria_city_ledger_cobros',
  'hoteleria_city_ledger_cuentas',
  'pagos_folio_hotel',
  'cargos_folio',
  'folios',
  'reservaciones',
  'tareas_housekeeping',

  // ── CRM ──
  'crm_actividades',
  'crm_historial_etapas',
  'crm_oportunidades',
  'crm_prospectos',

  // ── Nómina: los MOVIMIENTOS. Empleados y contratos se conservan. ──
  'rrhh_aplicaciones_obligacion_nomina',
  'rrhh_aplicaciones_pago_nomina',
  'rrhh_movimientos_prestamo_nomina',
  'rrhh_prestamos',
  'rrhh_polizas_nomina_detalle',
  'rrhh_dispersiones_nomina_detalle',
  'rrhh_dispersiones_nomina',
  'rrhh_cfdi_nomina',
  'rrhh_partidas_recibo',
  'rrhh_recibos_nomina',
  'rrhh_pagos_nomina',
  'rrhh_aprobaciones_nomina',
  'rrhh_cierres_nomina',
  'rrhh_eventos_nomina',
  'rrhh_periodos_nomina',
  'rrhh_incidencias',
  'rrhh_asistencias',
  'rrhh_solicitudes_vacaciones',
  'rrhh_saldos_vacaciones',
  'rrhh_solicitudes_estructura',

  // ── Activos fijos ──
  'activos_depreciaciones',
  'activos_fijos',

  // ── Validaciones y auditoría de las corridas de prueba ──
  'validacion_resultados_paso',
  'validacion_ejecuciones',
  'registros_auditoria',

  // ── Maestros que se recargan para la demostración ──
  'productos_equivalencias',
  'producto_atributos',
  'imagenes_producto',
  'productos_precios',
  'productos',
  'cliente_identificaciones',
  'clientes',
  'proveedores',
  'categorias',
  'marcas',
];

/** Lo que TIENE que seguir ahí cuando esto termine. */
const CONFIGURACION: string[] = [
  'Empresas',
  'Usuarios',
  'roles',
  'rol_endpoint_permisos',
  'cuentas_contables',
  'catalogos_sat_entradas',
  'almacenes',
  'ubicaciones_almacen',
  'listas_precio',
  'cuentas_bancarias',
  'impuestos',
  'unidades_medida',
  'departamentos',
  'rrhh_puestos',
  'rrhh_empleados',
  'rrhh_contratos_laborales',
  'configuraciones_aprobacion',
  'integracion_configuracion_empresa',
  'integracion_mapeo_cuentas',
];

const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este comando está bloqueado en producción.');
  }

  console.log(
    `Conectando a ${process.env.DB_HOST}:${process.env.DB_PORT} / ` +
      `${process.env.DB_NAME ?? process.env.DB_DATABASE}…`,
  );
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();

  try {
    /*
     * Sin empresa no se adivina: se enseñan las que hay. Pedir un UUID que
     * nadie recuerda y contestar «falta --empresa» es mandar a alguien a
     * buscar a oscuras algo que este proceso ya tiene delante.
     */
    if (!EMPRESA) {
      titulo('¿Cuál empresa?');
      console.table(
        await qr.query(
          `SELECT id, nombrecomercial, activo FROM empresas ORDER BY nombrecomercial`,
        ),
      );
      nota('Vuelve a llamarlo con --empresa=<el id de arriba>.');
      return;
    }
    /*
     * La columna de empresa NO se llama igual en todas partes.
     *
     * La estrategia de nombres pasa `empresaId` a `empresaid`, pero varias
     * entidades declaran `@Column({ name: 'empresa_id' })` a mano —
     * `importaciones_inventario` y `movimientos_inventario` entre ellas— y esa
     * forma convive con la otra en la misma base.
     *
     * Buscar sólo `empresaid` las daba por «no se pueden limpiar por empresa»
     * y las dejaba intactas: datos de prueba sobreviviendo a una limpieza que
     * decía haber terminado. Se aceptan las dos y se recuerda cuál es.
     */
    const columnaEmpresa = new Map<string, string>();
    const porEmpresa = async (tablas: string[]) => {
      const vivas: string[] = [];
      for (const t of tablas) {
        const r = (await qr.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = LOWER($1)
              AND column_name IN ('empresaid', 'empresa_id')
            ORDER BY column_name LIMIT 1`,
          [t],
        )) as { column_name: string }[];
        if (r.length) {
          columnaEmpresa.set(t.toLowerCase(), r[0].column_name);
          vivas.push(t.toLowerCase());
        }
      }
      return vivas;
    };
    const colEmp = (t: string) => columnaEmpresa.get(t) ?? 'empresaid';

    const contar = async (tablas: string[]) => {
      const filas: { tabla: string; filas: number }[] = [];
      for (const t of tablas) {
        const r = await qr.query(
          `SELECT COUNT(*)::int AS n FROM "${t}" WHERE "${colEmp(t)}" = $1`,
          [EMPRESA],
        );
        filas.push({ tabla: t, filas: Number(r[0]?.n ?? 0) });
      }
      return filas;
    };

    /*
     * ════════════════════════════════════════════════════════════════════════
     * Las hijas no saben de qué empresa son, y hay que borrarlas igual
     * ------------------------------------------------------------------------
     * Medido el 30-sep-2026 en la primera corrida de conteo: 21 tablas de la
     * lista NO tienen `empresaid` —`detalles_venta`, `partidas_poliza`,
     * `movimientos_inventario`, `productos_precios`…—. Son las hijas: su
     * empresa es la de su padre.
     *
     * Dejarlas fuera tenía dos desenlaces, y ninguno bueno: con borrado en
     * cascada, desaparecían sin que este script lo dijera —2 051 filas
     * anunciadas y muchas más borradas—; sin cascada, el DELETE del padre
     * reventaba por llave foránea y la limpieza entera se venía abajo.
     *
     * Así que se descubren, no se adivinan: se le pregunta al catálogo de la
     * base por las llaves foráneas de cada hija y se borra acotando por el
     * padre. Una hija cuyo padre no esté en la lista de borrado se NOMBRA en
     * voz alta en lugar de suponer nada sobre ella.
     * ════════════════════════════════════════════════════════════════════════
     */
    const llavesForaneas = async (tabla: string) =>
      (await qr.query(
        `SELECT kcu.column_name AS hija_col,
                ccu.table_name  AS padre,
                ccu.column_name AS padre_col
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = current_schema()
            AND tc.table_name = LOWER($1)`,
        [tabla],
      )) as { hija_col: string; padre: string; padre_col: string }[];

    const aBorrar = await porEmpresa(OPERACION);
    const aConservar = await porEmpresa(CONFIGURACION);

    /*
     * Una tabla de la lista que no existe, o que no tiene `empresaid`, no es
     * un detalle: significa que el borrado la va a dejar intacta y nadie se
     * va a enterar. Se dice por su nombre.
     */
    const noEncontradas = OPERACION.filter(
      (t) => !aBorrar.includes(t.toLowerCase()),
    );

    /* Cada hija, con el padre por el que se va a acotar su borrado. */
    const plan: { hija: string; padre: string; hija_col: string; padre_col: string }[] = [];
    const sinPadre: string[] = [];
    for (const t of noEncontradas) {
      const existe = await qr.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = LOWER($1) LIMIT 1`,
        [t],
      );
      if (!existe.length) {
        sinPadre.push(`${t} (no existe)`);
        continue;
      }
      const fks = await llavesForaneas(t);
      /*
       * Y las que no declaran la llave en la base. `validacion_resultados_paso`
       * guarda `ejecucionid` sin `@ManyToOne`, así que el catálogo de Postgres
       * no sabe que es hija de nadie. Lo mismo `importaciones_inventario_errores`
       * con `importacion_id`. Se declaran aquí, a mano y nombradas, en lugar de
       * quedar fuera de la limpieza sin que nadie se entere.
       */
      const DECLARADAS: Record<string, { padre: string; hija_col: string; padre_col: string }> = {
        validacion_resultados_paso: {
          padre: 'validacion_ejecuciones',
          hija_col: 'ejecucionid',
          padre_col: 'id',
        },
        importaciones_inventario_errores: {
          padre: 'importaciones_inventario',
          hija_col: 'importacion_id',
          padre_col: 'id',
        },
      };
      const aMano = DECLARADAS[t.toLowerCase()];
      const util =
        fks.find((f) => aBorrar.includes(String(f.padre).toLowerCase())) ??
        (aMano && aBorrar.includes(aMano.padre) ? aMano : undefined);
      if (util) {
        plan.push({
          hija: t.toLowerCase(),
          padre: String(util.padre).toLowerCase(),
          hija_col: util.hija_col,
          padre_col: util.padre_col,
        });
      } else {
        sinPadre.push(
          `${t} (sus llaves apuntan a: ${fks.map((f) => f.padre).join(', ') || 'ninguna'})`,
        );
      }
    }

    titulo(`EMPRESA ${EMPRESA}`);
    console.log(`Modo: ${EJECUTAR ? '\x1b[31mBORRADO REAL\x1b[0m' : 'sólo contar'}`);

    titulo('OPERACIÓN · lo que se va');
    const antes = await contar(aBorrar);
    const conDatos = antes.filter((f) => f.filas > 0);
    if (!conDatos.length) nota('(ya está limpio)');
    else console.table(conDatos);
    console.log(
      `Total a borrar: ${antes.reduce((a, f) => a + f.filas, 0)} fila(s) en ` +
        `${conDatos.length} tabla(s).`,
    );

    if (plan.length) {
      titulo('HIJAS · se borran acotando por su padre');
      console.table(
        await Promise.all(
          plan.map(async (h) => ({
            tabla: h.hija,
            acotada_por: `${h.padre}.${h.padre_col} = ${h.hija}.${h.hija_col}`,
            filas: Number(
              (
                await qr.query(
                  `SELECT COUNT(*)::int AS n FROM "${h.hija}"
                    WHERE "${h.hija_col}" IN (
                      SELECT "${h.padre_col}" FROM "${h.padre}" WHERE "${colEmp(h.padre)}" = $1)`,
                  [EMPRESA],
                )
              )[0]?.n ?? 0,
            ),
          })),
        ),
      );
    }

    if (sinPadre.length) {
      titulo('ALTO · tablas que NO se van a poder limpiar');
      for (const t of sinPadre) nota(t);
      nota('Quedarán intactas. Si alguna tiene datos de prueba, dilo antes de ejecutar.');
    }

    titulo('CONFIGURACIÓN · lo que se queda');
    const configAntes = await contar(aConservar);
    console.table(configAntes.filter((f) => f.filas > 0));

    if (!EJECUTAR) {
      titulo('No se borró nada');
      nota('Para borrar de verdad:');
      nota(
        `npx ts-node -T src/database/commands/preparar-demo.ts --empresa=${EMPRESA} --execute --confirm=BORRAR_OPERACION`,
      );
      nota('Antes, un respaldo: pg_dump vale dos minutos.');
      return;
    }
    if (CONFIRMAR !== 'BORRAR_OPERACION') {
      throw new Error(
        'Falta --confirm=BORRAR_OPERACION. No se borró nada.',
      );
    }

    await qr.startTransaction();
    let borradas = 0;

    /*
     * ════════════════════════════════════════════════════════════════════════
     * El orden de borrado no se escribe a mano: se descubre borrando
     * ------------------------------------------------------------------------
     * La primera corrida real se cayó aquí:
     *
     *   update or delete on table "detalles_orden_compra" violates foreign key
     *   constraint on table "recepciones_compra_detalle"
     *
     * Y tenía razón. Yo había puesto las hijas antes que los padres, pero el
     * grafo de llaves foráneas de un ERP no es de dos niveles: hay hijas que
     * son madres. `detalles_orden_compra` se borra acotada por su orden, y
     * `recepciones_compra_detalle` —que va después, con las tablas que tienen
     * empresa— todavía la señala.
     *
     * Reordenar la lista a mano habría arreglado ESTE caso y dejado el
     * siguiente esperando: cualquiera que añada una tabla mañana vuelve a
     * pisar la misma piedra, y el síntoma aparece a mitad de un borrado.
     *
     * Así que el orden deja de ser mío. Se intenta todo; lo que choca con una
     * llave foránea se deshace hasta su punto de guardado y se vuelve a
     * intentar en la ronda siguiente, cuando lo que lo señalaba ya no está.
     * Si una ronda entera no consigue borrar nada, se detiene y NOMBRA lo que
     * quedó trabado en lugar de girar para siempre.
     * ════════════════════════════════════════════════════════════════════════
     */
    type Tarea = { nombre: string; sql: string };
    const tareas: Tarea[] = [
      ...plan.map((h) => ({
        nombre: `${h.hija} (por ${h.padre})`,
        sql: `DELETE FROM "${h.hija}"
               WHERE "${h.hija_col}" IN (
                 SELECT "${h.padre_col}" FROM "${h.padre}"
                  WHERE "${colEmp(h.padre)}" = $1)`,
      })),
      ...aBorrar.map((t) => ({
        nombre: t,
        sql: `DELETE FROM "${t}" WHERE "${colEmp(t)}" = $1`,
      })),
    ];

    let pendientes = tareas;
    let ronda = 0;
    while (pendientes.length) {
      ronda += 1;
      const trabadas: Tarea[] = [];
      const motivos = new Map<string, string>();
      for (const tarea of pendientes) {
        await qr.query('SAVEPOINT paso');
        try {
          const r = await qr.query(tarea.sql, [EMPRESA]);
          await qr.query('RELEASE SAVEPOINT paso');
          const n = Array.isArray(r) ? (r[1] ?? 0) : 0;
          if (n) console.log(`  ${tarea.nombre}: ${n}`);
          borradas += Number(n) || 0;
        } catch (error) {
          await qr.query('ROLLBACK TO SAVEPOINT paso');
          trabadas.push(tarea);
          motivos.set(
            tarea.nombre,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      if (!trabadas.length) break;
      if (trabadas.length === pendientes.length) {
        await qr.rollbackTransaction();
        titulo('SE DESHIZO TODO · hay tablas que no se pueden borrar');
        for (const t of trabadas) nota(`${t.nombre}: ${motivos.get(t.nombre)}`);
        throw new Error(
          'Una ronda completa no consiguió borrar nada. Nada se aplicó.',
        );
      }
      pendientes = trabadas;
    }
    if (ronda > 1) nota(`Hicieron falta ${ronda} ronda(s) por las llaves foráneas.`);

    /*
     * La comprobación que justifica la transacción: si una cascada se llevó
     * configuración por delante, se deshace TODO. Es la diferencia entre una
     * demostración y una noche reconstruyendo el catálogo de cuentas.
     */
    const configDespues = await contar(aConservar);
    const perdidas = configAntes
      .map((a, i) => ({ tabla: a.tabla, antes: a.filas, despues: configDespues[i].filas }))
      .filter((c) => c.despues < c.antes);

    if (perdidas.length) {
      await qr.rollbackTransaction();
      titulo('SE DESHIZO TODO');
      console.table(perdidas);
      throw new Error(
        'El borrado se llevó configuración por delante (cascada). Nada se aplicó.',
      );
    }

    await qr.commitTransaction();
    titulo('LISTO');
    console.log(`${borradas} fila(s) de operación borradas.`);
    nota('La configuración quedó verificada fila por fila: nada se perdió.');
    nota('Siguiente paso: cargar el catálogo de productos desde la plantilla.');
  } catch (e) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e?.message ?? e}\x1b[0m`);
  process.exit(1);
});
