import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type Estado = 'NO_INICIADO' | 'EN_PROGRESO' | 'LISTO_CON_ADVERTENCIAS' | 'LISTO' | 'BLOQUEADO';
export interface Requisito { codigo: string; titulo: string; completo: boolean; bloqueante: boolean; ruta: string; detalle?: string; }

@Injectable()
export class DiagnosticoConfiguracionService {
  constructor(private readonly ds: DataSource) {}

  private async existeTabla(tabla: string): Promise<boolean> {
    const r = await this.ds.query(`SELECT 1 ok FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=LOWER($1) LIMIT 1`, [tabla]);
    return r.length > 0;
  }

  private async tieneColumna(tabla: string, columna: string): Promise<boolean> {
    const r = await this.ds.query(`SELECT 1 ok FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER($1) AND column_name=LOWER($2) LIMIT 1`, [tabla, columna]);
    return r.length > 0;
  }

  private async contar(tabla: string, empresaId: string, extra = ''): Promise<number> {
    if (!(await this.existeTabla(tabla))) return 0;
    const filtraEmpresa = await this.tieneColumna(tabla, 'empresaId');
    if (!/^[a-z0-9_]+$/i.test(tabla)) return 0;
    const sql = `SELECT COUNT(1) total FROM "${tabla.toLowerCase()}" ${filtraEmpresa ? 'WHERE empresaId=$1' : 'WHERE 1=1'} ${extra}`;
    const r = await this.ds.query(sql, filtraEmpresa ? [empresaId] : []);
    return Number(r?.[0]?.total ?? 0);
  }

  /** Cuenta registros activos únicamente cuando la tabla realmente maneja
   * baja lógica mediante la columna `activo`. En catálogos como listas_precio
   * y configuraciones_aprobacion esa columna no existe en el esquema actual. */
  private async contarActivos(tabla: string, empresaId: string): Promise<number> {
    const tieneActivo = await this.tieneColumna(tabla, 'activo');
    return this.contar(tabla, empresaId, tieneActivo ? 'AND activo=true' : '');
  }

  async obtenerEmpresa(empresaId: string): Promise<{ id: string; nombre: string }> {
    const empresa = await this.ds.query(
      `SELECT id, nombreComercial AS nombre FROM Empresas WHERE id=$1 LIMIT 1`,
      [empresaId],
    );
    return empresa?.[0] ?? { id: empresaId, nombre: '' };
  }

  private evaluar(requisitos: Requisito[]) {
    const obligatorios = requisitos.filter(r => r.bloqueante);
    const completos = requisitos.filter(r => r.completo).length;
    const porcentaje = requisitos.length ? Math.round((completos / requisitos.length) * 100) : 0;
    const bloqueantes = obligatorios.filter(r => !r.completo);
    let estado: Estado = 'NO_INICIADO';
    if (completos > 0) estado = 'EN_PROGRESO';
    if (bloqueantes.length === 0 && completos < requisitos.length) estado = 'LISTO_CON_ADVERTENCIAS';
    if (completos === requisitos.length) estado = 'LISTO';
    if (bloqueantes.length > 0 && completos > 0) estado = 'BLOQUEADO';
    return { porcentaje, estado, requisitos, bloqueantes };
  }

  async obtener(empresaId: string) {
    const [almacenes, productos, categorias, unidades, impuestos, formasPago, clientes, proveedores,
      cuentas, bancos, configsAprobacion, requisiciones, cotizaciones, ordenes, ubicaciones, listasPrecio, creditos] = await Promise.all([
      this.contarActivos('almacenes', empresaId), this.contarActivos('productos', empresaId),
      this.contarActivos('categorias', empresaId), this.contarActivos('unidades_medida', empresaId),
      this.contarActivos('impuestos', empresaId), this.contarActivos('formas_pago', empresaId),
      this.contarActivos('clientes', empresaId), this.contarActivos('proveedores', empresaId),
      this.contarActivos('cuentas_contables', empresaId), this.contarActivos('cuentas_bancarias', empresaId),
      this.contarActivos('configuraciones_aprobacion', empresaId), this.contar('requisiciones', empresaId),
      this.contar('cotizaciones', empresaId), this.contar('ordenes_compra', empresaId), this.contarActivos('ubicaciones_almacen', empresaId),
      this.contarActivos('listas_precio', empresaId), this.contar('creditos_clientes', empresaId),
    ]);

    /*
     * ────────────────────────────────────────────────────────────────────────
     * UNA CUENTA BANCARIA SIN CUENTA CONTABLE NO ES UNA CUENTA LISTA
     *
     * `FIN_BANCOS` decía «Cuenta bancaria o caja: completo» con sólo contar
     * filas. Pero una caja o un banco sin cuenta contable no puede generar una
     * sola póliza: `buscarCuentaSegunMetodoPago` devuelve null y TODA operación
     * que la use —ventas, cobranza, pagos, traspasos, nómina— cae en la bandeja
     * de asientos pendientes. El alta ya lo exige desde hace tiempo, pero las
     * cuentas creadas antes de esa regla siguen ahí y nadie avisa.
     *
     * Medido el 25-sep-2026: la única cuenta de esta instalación —«PRUEBA POS
     * SIN DINERO REAL»— no tiene cuenta contable, y el diagnóstico daba
     * finanzas por lista.
     *
     * Contar filas no es comprobar que sirvan. Si la tabla no existe se avisa
     * como «no medido» en vez de devolver un cero que parece un dato.
     * ────────────────────────────────────────────────────────────────────────
     */
    const hayTablaBancos = await this.existeTabla('cuentas_bancarias');
    const bancosSinCuenta = hayTablaBancos
      ? await this.contar(
          'cuentas_bancarias',
          empresaId,
          'AND activo=true AND cuentaContableId IS NULL',
        )
      : null;

    /*
     * ────────────────────────────────────────────────────────────────────────
     * UN PRODUCTO QUE SE PUEDE VENDER Y NO SE PUEDE FACTURAR
     *
     * El CFDI 4.0 exige por cada renglón la ClaveProdServ y la ClaveUnidad del
     * catálogo del SAT. Sin ellas el PAC rechaza el comprobante entero — no la
     * línea, el comprobante—. Pero el punto de venta no las pide: vende igual,
     * cobra igual, y el problema aparece al timbrar, con el cliente delante.
     *
     * Medido el 25-sep-2026 en esta instalación: **los siete productos
     * activos, sin excepción, están sin ClaveProdServ**, y cinco de siete sin
     * ClaveUnidad. Ninguna venta de este catálogo se podía facturar, y nada lo
     * advertía en ninguna pantalla.
     *
     * Se cuenta sólo lo vendible y activo: un producto dado de baja no estorba.
     * ────────────────────────────────────────────────────────────────────────
     */
    const hayTablaProductos = await this.existeTabla('productos');
    const productosSinClaveSat = hayTablaProductos
      ? await this.contar(
          'productos',
          empresaId,
          "AND activo=true AND (claveSAT IS NULL OR TRIM(claveSAT)='' " +
            "OR claveUnidadSAT IS NULL OR TRIM(claveUnidadSAT)='')",
        )
      : null;

    /*
     * Alias entrecomillados: sin ellos `e.regimenFiscal` y `e.codigoPostal`
     * eran undefined, `fiscal` era SIEMPRE false y `GEN_FISCAL` —que bloquea—
     * decía «datos fiscales incompletos» con los datos completos.
     */
    const empresa = await this.ds.query(
      `SELECT rfc AS rfc, regimenFiscal AS "regimenFiscal", direccion AS direccion,
              codigoPostal AS "codigoPostal", onboardingCompletado AS "onboardingCompletado"
         FROM Empresas WHERE id=$1 LIMIT 1`,
      [empresaId],
    );
    const e = empresa?.[0] ?? {};
    const fiscal = Boolean(e.rfc && e.regimenFiscal && e.codigoPostal);

    const modulos = {
      general: this.evaluar([
        { codigo:'GEN_FISCAL', titulo:'Datos fiscales completos', completo:fiscal, bloqueante:true, ruta:'/configuracion-inicial' },
        { codigo:'GEN_ALMACEN', titulo:'Almacén operativo', completo:almacenes>0, bloqueante:true, ruta:'/dashboard/almacenes' },
        { codigo:'GEN_IMPUESTOS', titulo:'Impuestos configurados', completo:impuestos>0, bloqueante:true, ruta:'/dashboard/impuestos' },
      ]),
      ventas: this.evaluar([
        { codigo:'VEN_PRODUCTOS', titulo:'Productos activos', completo:productos>0, bloqueante:true, ruta:'/dashboard/productos' },
        { codigo:'VEN_CATEGORIAS', titulo:'Categorías', completo:categorias>0, bloqueante:true, ruta:'/dashboard/categorias' },
        { codigo:'VEN_UNIDADES', titulo:'Unidades de medida', completo:unidades>0, bloqueante:true, ruta:'/dashboard/unidades-medida' },
        { codigo:'VEN_FORMAS_PAGO', titulo:'Formas de pago', completo:formasPago>0, bloqueante:true, ruta:'/dashboard/catalogos/formas-pago' },
        { codigo:'VEN_LISTA_PRECIOS', titulo:'Lista de precios activa', completo:listasPrecio>0, bloqueante:true, ruta:'/dashboard/listas-precio' },
        { codigo:'VEN_CLIENTES', titulo:'Al menos un cliente', completo:clientes>0, bloqueante:false, ruta:'/dashboard/clientes' },
      ]),
      compras: this.evaluar([
        { codigo:'COM_PROVEEDORES', titulo:'Proveedores activos', completo:proveedores>0, bloqueante:true, ruta:'/dashboard/proveedores' },
        { codigo:'COM_APROBACIONES', titulo:'Flujo de aprobación', completo:configsAprobacion>0, bloqueante:true, ruta:'/dashboard/configuraciones-aprobacion' },
        { codigo:'COM_ALMACEN', titulo:'Almacén receptor', completo:almacenes>0, bloqueante:true, ruta:'/dashboard/almacenes' },
        { codigo:'COM_PRUEBA_REQ', titulo:'Requisición de prueba', completo:requisiciones>0, bloqueante:false, ruta:'/dashboard/compras/requisiciones' },
        { codigo:'COM_PRUEBA_COT', titulo:'Cotización capturada', completo:cotizaciones>0, bloqueante:false, ruta:'/dashboard/compras/cotizaciones' },
        { codigo:'COM_PRUEBA_OC', titulo:'Orden generada', completo:ordenes>0, bloqueante:false, ruta:'/dashboard/compras/ordenes' },
      ]),
      inventario: this.evaluar([
        { codigo:'INV_ALMACEN', titulo:'Almacén operativo', completo:almacenes>0, bloqueante:true, ruta:'/dashboard/almacenes' },
        { codigo:'INV_PRODUCTOS', titulo:'Productos inventariables', completo:productos>0, bloqueante:true, ruta:'/dashboard/productos' },
        { codigo:'INV_UBICACIONES', titulo:'Ubicaciones internas', completo:ubicaciones>0, bloqueante:false, ruta:'/dashboard/inventario/ubicaciones' },
      ]),
      credito: this.evaluar([
        { codigo:'CRE_CLIENTES', titulo:'Clientes activos', completo:clientes>0, bloqueante:true, ruta:'/dashboard/clientes' },
        { codigo:'CRE_BANCOS', titulo:'Cuenta bancaria para cobranza', completo:bancos>0, bloqueante:false, ruta:'/dashboard/creditos/cuentas-bancarias' },
        { codigo:'CRE_PRUEBA', titulo:'Crédito de prueba', completo:creditos>0, bloqueante:false, ruta:'/dashboard/creditos/creditos' },
      ]),
      facturacion: this.evaluar([
        {
          codigo: 'FAC_CLAVES_SAT',
          titulo:
            productosSinClaveSat === null
              ? 'Claves del SAT en los productos (no se pudo comprobar)'
              : productosSinClaveSat > 0
                ? `${productosSinClaveSat} producto(s) sin clave del SAT`
                : 'Claves del SAT en los productos',
          detalle:
            productosSinClaveSat && productosSinClaveSat > 0
              ? 'El CFDI exige ClaveProdServ y ClaveUnidad en cada renglón. Sin ' +
                'ellas el PAC rechaza el comprobante completo, y el punto de ' +
                'venta no las pide: la venta se cobra y el problema aparece al ' +
                'timbrar, con el cliente delante.'
              : undefined,
          completo: productosSinClaveSat === 0,
          /*
           * Bloquea porque no es un paso pendiente: es una venta que ya se
           * puede hacer y una factura que no se va a poder emitir.
           */
          bloqueante: (productosSinClaveSat ?? 0) > 0,
          ruta: '/dashboard/productos',
        },
      ]),
      finanzas: this.evaluar([
        { codigo:'FIN_CUENTAS', titulo:'Plan contable', completo:cuentas>0, bloqueante:true, ruta:'/configuracion-financiera' },
        {
          codigo: 'FIN_BANCOS',
          titulo:
            bancosSinCuenta === null
              ? 'Cuenta bancaria o caja (no se pudo comprobar)'
              : bancosSinCuenta > 0
                ? `${bancosSinCuenta} cuenta(s) de banco o caja sin cuenta contable`
                : 'Cuenta bancaria o caja',
          detalle:
            bancosSinCuenta && bancosSinCuenta > 0
              ? 'Sin cuenta contable, ninguna operación que use esa caja o ese ' +
                'banco puede generar su póliza: todas caen en Asientos ' +
                'pendientes y el problema se descubre al cerrar el mes.'
              : undefined,
          completo: bancos > 0 && bancosSinCuenta === 0,
          /*
           * Bloquea sólo cuando HAY cuentas y alguna está sin enlazar: eso es
           * una configuración rota que va a romper pólizas. No tener ninguna
           * todavía es un paso pendiente, no un error.
           */
          bloqueante: bancos > 0 && (bancosSinCuenta ?? 0) > 0,
          ruta: '/dashboard/creditos/cuentas-bancarias',
        },
      ]),
    };

    const todos = Object.values(modulos);
    const porcentaje = Math.round(todos.reduce((s,m)=>s+m.porcentaje,0)/todos.length);
    const bloqueantes = todos.flatMap(m=>m.bloqueantes);
    return {
      porcentajeGeneral: porcentaje,
      onboardingCompletado: bloqueantes.length === 0,
      puedeVender: modulos.general.bloqueantes.length === 0 && modulos.ventas.bloqueantes.length === 0,
      puedeComprar: modulos.general.bloqueantes.length === 0 && modulos.compras.bloqueantes.length === 0,
      puedeControlarInventario: modulos.inventario.bloqueantes.length === 0,
      puedeUsarCredito: modulos.credito.bloqueantes.length === 0,
      puedeContabilizar: modulos.finanzas.bloqueantes.length === 0,
      bloqueantes,
      modulos,
    };
  }

  async verificarIntegridad(empresaId: string) {
    const hallazgos: Array<{ codigo: string; severidad: 'ERROR' | 'ADVERTENCIA'; titulo: string; cantidad: number; detalle: string; ruta?: string }> = [];

    const agregar = (codigo: string, severidad: 'ERROR' | 'ADVERTENCIA', titulo: string, cantidad: number, detalle: string, ruta?: string) => {
      if (cantidad > 0) hallazgos.push({ codigo, severidad, titulo, cantidad, detalle, ruta });
    };

    if (await this.existeTabla('stock_por_almacen')) {
      const negativos = await this.ds.query(
        `SELECT COUNT(1) total FROM stock_por_almacen WHERE empresaId=$1 AND (cantidad < 0 OR reservado < 0 OR comprometido < 0 OR bloqueado < 0 OR enTransito < 0)`,
        [empresaId],
      );
      agregar('INV_NEGATIVOS', 'ERROR', 'Existencias o apartados negativos', Number(negativos?.[0]?.total ?? 0), 'Hay cantidades negativas que deben corregirse antes de operar.', '/dashboard/inventario/ajustes');

      const duplicados = await this.ds.query(
        `SELECT COUNT(1) total FROM (SELECT productoId, almacenId FROM stock_por_almacen WHERE empresaId=$1 GROUP BY productoId, almacenId HAVING COUNT(1)>1) d`,
        [empresaId],
      );
      agregar('INV_DUPLICADOS', 'ERROR', 'Stock duplicado por producto y almacén', Number(duplicados?.[0]?.total ?? 0), 'Debe existir una sola fila de stock por producto y almacén.', '/dashboard/almacenes');
    }

    if (await this.existeTabla('ordenes_compra') && await this.tieneColumna('ordenes_compra', 'cotizacionId')) {
      const duplicadas = await this.ds.query(
        `SELECT COUNT(1) total FROM (SELECT cotizacionId FROM ordenes_compra WHERE empresaId=$1 AND cotizacionId IS NOT NULL GROUP BY cotizacionId HAVING COUNT(1)>1) d`,
        [empresaId],
      );
      agregar('COM_OC_DUPLICADA', 'ERROR', 'Órdenes duplicadas para una cotización', Number(duplicadas?.[0]?.total ?? 0), 'Una cotización adjudicada solo puede originar una orden.', '/dashboard/compras/ordenes');
    }

    if (await this.existeTabla('transferencias_inventario_detalle') && await this.existeTabla('transferencias_inventario')) {
      /*
       * ======================================================================
       * Un error de otra empresa no es un error tuyo
       * ----------------------------------------------------------------------
       * Esta era la UNICA comprobacion del diagnostico que no filtraba por
       * empresa: contaba los detalles huerfanos de TODAS. Dos consecuencias, y
       * la segunda es peor que la primera.
       *
       * Se filtraba un dato de otra empresa —cuantos documentos rotos tiene—,
       * que en multiempresa ya es de por si inaceptable. Y ademas el
       * diagnostico mentia: a una empresa limpia se le reportaba un ERROR con
       * un enlace a su pantalla de transferencias, donde no encontraria nada
       * que arreglar. Un error que no se puede resolver acaba ignorandose, y
       * con el se ignoran los que si eran suyos.
       *
       * Nadie lo filtro porque la tabla de detalle NO tiene `empresaId`: cuelga
       * de su transferencia, y un huerfano es justo el que la perdio. Pero
       * conserva el producto, y el producto si tiene dueño. Por ahi se le
       * devuelve.
       * ======================================================================
       */
      const huerfanos = await this.ds.query(
        `SELECT COUNT(1) total
           FROM transferencias_inventario_detalle d
           LEFT JOIN transferencias_inventario t ON t.id = d.transferenciaId
           INNER JOIN productos p ON p.id = d.productoId
          WHERE t.id IS NULL AND p.empresaId = $1`,
        [empresaId],
      );
      agregar('INV_TRANSFER_HUERFANA', 'ERROR', 'Detalles de transferencia huérfanos', Number(huerfanos?.[0]?.total ?? 0), 'Existen detalles sin documento de transferencia principal.', '/dashboard/inventario/transferencias');
    }


    if (await this.existeTabla('stock_por_almacen') && await this.existeTabla('stock_ubicaciones')) {
      const diferenciasUbicacion = await this.ds.query(
        `SELECT COUNT(1) total
         FROM (
           SELECT s.productoId, s.almacenId
           FROM stock_por_almacen s
           LEFT JOIN stock_ubicaciones su
             ON su.empresaId=s.empresaId
            AND su.productoId=s.productoId
            AND su.almacenId=s.almacenId
           WHERE s.empresaId=$1
           GROUP BY s.productoId,s.almacenId,s.cantidad
           HAVING ABS(CAST(s.cantidad AS float)-CAST(COALESCE(SUM(su.cantidad),0) AS float))>0.0001
         ) d`,
        [empresaId],
      );
      agregar(
        'INV_STOCK_UBICACION_DIFERENTE',
        'ERROR',
        'Stock consolidado distinto al localizado',
        Number(diferenciasUbicacion?.[0]?.total ?? 0),
        'La existencia por almacén debe coincidir con la suma de sus ubicaciones.',
        '/dashboard/inventario/ubicaciones',
      );

      const stockSinUbicacion = await this.ds.query(
        `SELECT COUNT(1) total
         FROM stock_por_almacen s
         LEFT JOIN stock_ubicaciones su
           ON su.empresaId=s.empresaId
          AND su.productoId=s.productoId
          AND su.almacenId=s.almacenId
         WHERE s.empresaId=$1 AND s.cantidad>0 AND su.id IS NULL`,
        [empresaId],
      );
      agregar(
        'INV_STOCK_SIN_UBICACION',
        'ERROR',
        'Existencia positiva sin ubicación física',
        Number(stockSinUbicacion?.[0]?.total ?? 0),
        'Toda existencia operativa debe estar localizada dentro del almacén.',
        '/dashboard/inventario/ubicaciones',
      );
    }

    if (await this.existeTabla('stock_por_almacen')) {
      const reservasExcedidas = await this.ds.query(
        `SELECT COUNT(1) total
         FROM stock_por_almacen
         WHERE empresaId=$1
           AND (reservado + comprometido + bloqueado) > cantidad + 0.0001`,
        [empresaId],
      );
      agregar(
        'INV_APARTADOS_EXCEDIDOS',
        'ERROR',
        'Reservas o bloqueos mayores a la existencia',
        Number(reservasExcedidas?.[0]?.total ?? 0),
        'La suma reservada, comprometida y bloqueada no puede superar la existencia física.',
        '/dashboard/inventario',
      );
    }

    if (await this.existeTabla('recepciones_compra') && await this.tieneColumna('recepciones_compra', 'claveIdempotencia')) {
      const recepcionesDuplicadas = await this.ds.query(
        `SELECT COUNT(1) total
         FROM (
           SELECT empresaId,ordenCompraId,claveIdempotencia
           FROM recepciones_compra
           WHERE empresaId=$1 AND claveIdempotencia IS NOT NULL
           GROUP BY empresaId,ordenCompraId,claveIdempotencia
           HAVING COUNT(1)>1
         ) d`,
        [empresaId],
      );
      agregar(
        'COM_RECEPCION_DUPLICADA',
        'ERROR',
        'Recepciones duplicadas por idempotencia',
        Number(recepcionesDuplicadas?.[0]?.total ?? 0),
        'Una misma solicitud de recepción no debe aplicarse más de una vez.',
        '/dashboard/inventario/recepciones',
      );
    }

    if (await this.existeTabla('pagos_proveedor') && await this.tieneColumna('pagos_proveedor', 'claveIdempotencia')) {
      const pagosDuplicados = await this.ds.query(
        `SELECT COUNT(1) total
         FROM (
           SELECT empresaId,ordenCompraId,claveIdempotencia
           FROM pagos_proveedor
           WHERE empresaId=$1 AND claveIdempotencia IS NOT NULL
           GROUP BY empresaId,ordenCompraId,claveIdempotencia
           HAVING COUNT(1)>1
         ) d`,
        [empresaId],
      );
      agregar(
        'COM_PAGO_DUPLICADO',
        'ERROR',
        'Pagos de proveedor duplicados por idempotencia',
        Number(pagosDuplicados?.[0]?.total ?? 0),
        'Una misma solicitud de pago no debe generar movimientos repetidos.',
        '/dashboard/compras/pago-proveedores',
      );
    }

    if (await this.existeTabla('productos')) {
      const sinSku = await this.ds.query(
        `SELECT COUNT(1) total FROM productos WHERE empresaId=$1 AND activo=true AND (sku IS NULL OR LTRIM(RTRIM(sku))='')`,
        [empresaId],
      );
      agregar('CAT_PRODUCTO_SIN_SKU', 'ADVERTENCIA', 'Productos activos sin SKU', Number(sinSku?.[0]?.total ?? 0), 'El SKU facilita inventario, importación y trazabilidad.', '/dashboard/productos');
    }

    const errores = hallazgos.filter(h => h.severidad === 'ERROR').length;
    return {
      valido: errores === 0,
      fechaValidacion: new Date().toISOString(),
      resumen: { errores, advertencias: hallazgos.length - errores, hallazgos: hallazgos.length },
      hallazgos,
    };
  }

}
