import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type SeveridadIntegridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO';

/**
 * Resultado de una comprobación.
 *
 * `LIMPIA` y `NO_MEDIBLE` no son lo mismo y por eso son dos valores distintos.
 * Una comprobación que no pudo ejecutarse —porque su tabla no existe en esta
 * instalación, porque la consulta falló— no aporta tranquilidad: aporta un
 * hueco. Contarla como cero hallazgos era convertir un hueco en un visto bueno.
 */
export type EstadoComprobacion = 'CON_HALLAZGOS' | 'LIMPIA' | 'NO_MEDIBLE';

export interface HallazgoIntegridad {
  codigo: string;
  modulo: string;
  severidad: SeveridadIntegridad;
  estado: EstadoComprobacion;
  cantidad: number;
  descripcion: string;
  accion: string;
  /** Por qué no se pudo medir, cuando `estado` es NO_MEDIBLE. */
  detalle?: string;
}

@Injectable()
export class IntegridadFinancieraService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Cuenta, o dice por qué no pudo.
   *
   * Antes esto iba dentro de un `Promise.all`: bastaba que una sola consulta
   * fallara —hotelería y city ledger son módulos opcionales y sus tablas
   * pueden no existir— para que la pantalla perdiera las once comprobaciones
   * restantes y mostrara un error genérico. Y la salida fácil, un
   * `.catch(() => 0)`, habría sido peor: la comprobación rota pasaría por
   * comprobación limpia.
   */
  private async contar(
    sql: string,
    empresaId: string,
  ): Promise<{ medida: boolean; cantidad: number; motivo: string }> {
    try {
      const rows = await this.dataSource.query(sql, [empresaId]);
      const crudo = rows?.[0]?.cantidad;
      if (crudo === undefined || crudo === null) {
        return {
          medida: false,
          cantidad: 0,
          motivo: 'La consulta no devolvió ninguna cuenta.',
        };
      }
      const cantidad = Number(crudo);
      if (!Number.isFinite(cantidad)) {
        return {
          medida: false,
          cantidad: 0,
          motivo: `La consulta devolvió un valor no numérico: ${String(crudo)}`,
        };
      }
      return { medida: true, cantidad, motivo: '' };
    } catch (error) {
      return {
        medida: false,
        cantidad: 0,
        motivo: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async diagnosticar(empresaId: string) {
    const definiciones: Array<{
      codigo: string;
      modulo: string;
      severidad: SeveridadIntegridad;
      descripcion: string;
      accion: string;
      sql: string;
    }> = [
      {
        codigo: 'ASIENTOS_PENDIENTES',
        modulo: 'Finanzas',
        severidad: 'CRITICA',
        descripcion:
          'Operaciones económicas sin póliza definitiva o con reintentos agotados.',
        accion:
          'Corregir el mapeo contable y reintentar desde Asientos pendientes.',
        sql: `SELECT COUNT(1) cantidad FROM asientos_pendientes
               WHERE empresaId=$1 AND estado IN ('PENDIENTE','REINTENTANDO','FALLIDO')`,
      },
      {
        codigo: 'FOLIOS_HOTEL_SIN_CONTABILIZAR',
        modulo: 'Hotelería',
        severidad: 'CRITICA',
        descripcion:
          'Folios cerrados o pendientes de pago sin asiento contable generado.',
        accion:
          'Resolver cuentas de ingreso/impuestos y reprocesar el asiento hotelero.',
        sql: `SELECT COUNT(1) cantidad FROM folios
               WHERE empresaId=$1 AND estado IN ('CERRADO','PENDIENTE_PAGO')
                 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'FOLIOS_HOTEL_DESCUADRADOS',
        modulo: 'Hotelería',
        severidad: 'CRITICA',
        descripcion:
          'Folios con saldo o aplicaciones que no coinciden con el total.',
        accion:
          'Revisar cargos, cobros y crédito antes de avanzar la auditoría nocturna.',
        sql: `SELECT COUNT(1) cantidad FROM folios
               WHERE empresaId=$1 AND (saldoPendiente<0 OR totalAplicado<0 OR totalCobrado<0
                  OR ABS(total-(totalAplicado+saldoPendiente))>0.02)`,
      },
      {
        codigo: 'CREDITO_HOTEL_SIN_CITY_LEDGER',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Folios cerrados a crédito sin una cuenta por cobrar enlazada.',
        accion:
          'Bloquear nuevos créditos y conciliar folio, póliza y convenio antes de reclasificar.',
        sql: `SELECT COUNT(DISTINCT f.id) cantidad
                FROM folios f
                INNER JOIN pagos_folio_hotel p ON p.folioId=f.id AND p.empresaId=f.empresaId
                LEFT JOIN hoteleria_city_ledger_cuentas c ON c.folioId=f.id AND c.empresaId=f.empresaId
               WHERE f.empresaId=$1 AND f.estado='CERRADO'
                 AND p.metodoPago IN ('CREDITO_EMPRESA','CREDITO_AGENCIA')
                 AND c.id IS NULL`,
      },
      {
        codigo: 'CITY_LEDGER_SALDO_INCONSISTENTE',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Cuentas por cobrar cuyo saldo no coincide con el importe original menos sus cobros.',
        accion:
          'Conciliar aplicaciones e idempotencia antes de aceptar nuevos cobros.',
        sql: `SELECT COUNT(1) cantidad
                FROM hoteleria_city_ledger_cuentas c
                LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.importe),0) cobrado
                  FROM hoteleria_city_ledger_cobros p
                 WHERE p.empresaId=c.empresaId AND p.cuentaCobrarId=c.id) x ON true
               WHERE c.empresaId=$1
                 AND ABS(c.importeOriginal-x.cobrado-c.saldoPendiente)>0.02`,
      },
      {
        codigo: 'COBROS_CITY_LEDGER_SIN_CONTABILIZAR',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Cobros del City Ledger aplicados a cartera sin póliza contable definitiva.',
        accion:
          'Reintentar el asiento y conciliar Tesorería, Clientes CxC e IVA.',
        sql: `SELECT COUNT(1) cantidad
                FROM hoteleria_city_ledger_cobros
               WHERE empresaId=$1 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'COBRANZA_SIN_CONTABILIZAR',
        modulo: 'Crédito y cobranza',
        severidad: 'CRITICA',
        descripcion:
          'Cobros aplicados al crédito sin póliza contable definitiva.',
        accion:
          'Reintentar el asiento de cobranza y conciliar tesorería contra cartera.',
        sql: `SELECT COUNT(1) cantidad FROM pagos_cobranza
               WHERE empresaId=$1 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'CFDI_PENDIENTES_O_ERROR',
        modulo: 'CFDI',
        severidad: 'ALTA',
        descripcion:
          'CFDI pendientes, con error de timbrado o cancelación inconclusa.',
        accion:
          'Revisar credenciales PAC, payload y reintentar de forma idempotente.',
        sql: `SELECT COUNT(1) cantidad FROM facturas
               WHERE empresaId=$1 AND estado IN ('PENDIENTE_TIMBRADO','ERROR_TIMBRADO','CANCELACION_PENDIENTE','ERROR_CANCELACION')`,
      },
      {
        codigo: 'STOCK_RESERVADO_INCONSISTENTE',
        modulo: 'Inventario/WMS',
        severidad: 'CRITICA',
        descripcion:
          'Stock con reservado/comprometido negativo o superior a la existencia utilizable.',
        accion:
          'Ejecutar diagnóstico WMS y reconciliar reservas antes de vender o transferir.',
        sql: `SELECT COUNT(1) cantidad FROM stock_por_almacen
               WHERE empresaId=$1 AND (cantidad<0 OR reservado<0 OR bloqueado<0 OR comprometido<>0
                  OR reservado+bloqueado>cantidad+0.0001)`,
      },
      {
        codigo: 'RESERVAS_VENCIDAS_ACTIVAS',
        modulo: 'Inventario/WMS',
        severidad: 'ALTA',
        descripcion:
          'Reservas vencidas que continúan reduciendo la disponibilidad.',
        accion:
          'Ejecutar el liberador de reservas vencidas y verificar el cron de WMS.',
        sql: `SELECT COUNT(1) cantidad FROM reservas_inventario
               WHERE empresaId=$1 AND estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')
                 AND expiraEn IS NOT NULL AND expiraEn<CURRENT_TIMESTAMP`,
      },
      /*
       * ======================================================================
       * Dos cosas que parecían una
       * ----------------------------------------------------------------------
       * Este control decía CRÍTICO y mandaba «genera la póliza de devengo antes
       * de continuar». En la instalación había un periodo pagado sin póliza, y
       * al ir a generarla la contabilidad contestaba:
       *
       *   «No se puede registrar una póliza con fecha 2026-09-30, que todavía
       *    no llega. La contabilidad registra lo que ya ocurrió.»
       *
       * Las dos reglas son correctas —el devengo pertenece al periodo, y no se
       * asientan hechos que no han ocurrido— y juntas dejaban un bloqueo sin
       * salida: el cierre exigía una póliza que el sistema se negaba a crear.
       * Un control que no se puede satisfacer no es un control, es una pared.
       *
       * El caso venía de pagar una quincena por adelantado: el periodo termina
       * el 30 y se pagó el 25. Eso es legítimo y pasa; lo que no puede pasar es
       * que se lea igual que un olvido.
       *
       * Así que son dos hallazgos distintos: el que de verdad exige acción —el
       * periodo ya terminó y nadie lo contabilizó— y el que sólo hay que
       * esperar, que se informa y no bloquea.
       * ======================================================================
       */
      {
        codigo: 'NOMINA_DEFINITIVA_SIN_POLIZA',
        modulo: 'RR. HH./Nómina',
        severidad: 'CRITICA',
        descripcion:
          'Periodos ya terminados, pagados o cerrados, sin póliza vinculada.',
        accion:
          'Bloquear el cierre y generar la póliza de devengo/pago antes de continuar.',
        sql: `SELECT COUNT(1) cantidad FROM rrhh_periodos_nomina
               WHERE empresaId=$1 AND estado IN ('PAGADO','CONTABILIZADO','CERRADO') AND polizaId IS NULL
                 AND fechaFin <= CURRENT_DATE`,
      },
      {
        codigo: 'NOMINA_PAGADA_POR_ADELANTADO',
        modulo: 'RR. HH./Nómina',
        severidad: 'MEDIA',
        descripcion:
          'Periodos pagados cuyo devengo todavía no se puede registrar: el periodo no ha terminado.',
        accion:
          'Ninguna hoy. El devengo se podrá generar cuando llegue la fecha de fin del periodo.',
        sql: `SELECT COUNT(1) cantidad FROM rrhh_periodos_nomina
               WHERE empresaId=$1 AND estado IN ('PAGADO','CONTABILIZADO','CERRADO') AND polizaId IS NULL
                 AND fechaFin > CURRENT_DATE`,
      },
      /*
       * ======================================================================
       * Una cuenta con saldo al revés de su naturaleza
       * ----------------------------------------------------------------------
       * Es lo primero que mira un contador en una balanza, y el ERP no lo
       * miraba: Bancos con saldo acreedor —sobregirado—, Clientes debiendo en
       * negativo, un pago anticipado con saldo de pasivo. Cada uno tiene una
       * explicación posible y ninguno es normal; lo que no puede ser es que
       * nadie lo señale y aparezca por primera vez en la junta.
       *
       * No se compara contra el número de cuenta sino contra la `naturaleza`
       * que cada cuenta declara, que es lo que distingue una cuenta de activo
       * de una complementaria de activo —la depreciación acumulada tiene saldo
       * acreedor y está bien—.
       *
       * Es ALTA, no crítica: hay motivos legítimos —un sobregiro real, un
       * anticipo de cliente contabilizado en su cuenta— y el juicio es del
       * contador. Lo que el sistema debe hacer es no dejar que pase inadvertido.
       * ======================================================================
       */
      {
        codigo: 'CUENTA_CON_SALDO_CONTRARIO',
        modulo: 'Contabilidad',
        severidad: 'ALTA',
        descripcion:
          'Cuentas cuyo saldo acumulado va al revés de su naturaleza (bancos sobregirados, clientes con saldo a favor, pasivos con saldo deudor).',
        accion:
          'Revisar en la balanza: suele ser un saldo inicial que falta, una póliza con las cuentas invertidas o un anticipo mal clasificado.',
        sql: `SELECT COUNT(1) cantidad FROM (
                 SELECT c.id,
                        c.naturaleza,
                        SUM(p.cargo) - SUM(p.abono) AS saldo
                   FROM partidas_poliza p
                   JOIN cuentas_contables c ON c.id = p.cuentaContableId
                   JOIN polizas z ON z.id = p.polizaId
                  WHERE c.empresaId=$1 AND z.empresaId=$1 AND z.estatus='VIGENTE'
                  GROUP BY c.id, c.naturaleza
               ) s
               WHERE (s.naturaleza='DEUDORA' AND s.saldo < -0.005)
                  OR (s.naturaleza='ACREEDORA' AND s.saldo > 0.005)`,
      },
      /*
       * ======================================================================
       * Un producto que se vende sin decir qué impuesto lleva
       * ----------------------------------------------------------------------
       * `impuestoId` admite nulo, y cuando es nulo el precio se cobra con
       * impuesto CERO, en silencio. No hay diferencia visible entre «este
       * artículo está exento» y «nadie le puso el impuesto»: las dos cosas se
       * ven igual en el ticket, en el folio del hotel y en la declaración.
       *
       * Se vio el 25-sep-2026 cargando dos tazas al folio de un huésped: la
       * renta de la habitación desglosó IVA 16 % e impuesto de hospedaje 3.5 %
       * correctamente, y el consumo entró con IVA cero. Cuatro de los siete
       * productos del catálogo están así, incluidos dos servicios.
       *
       * El sistema no puede inventar la tasa —es una decisión fiscal del
       * cliente— pero sí puede negarse a callarlo. ALTA: no impide operar, y
       * lo que está en juego es una declaración mal presentada.
       * ======================================================================
       */
      {
        codigo: 'PRODUCTO_SIN_IMPUESTO_DECLARADO',
        modulo: 'Catálogo/Fiscal',
        severidad: 'ALTA',
        descripcion:
          'Productos activos sin impuesto asignado: se venden y se cargan al folio con tasa cero, sin que nadie lo haya decidido.',
        accion:
          'Asignar el impuesto en la ficha del producto. Si de verdad está exento o es tasa 0 %, darle de alta ese impuesto y asignarlo, para que quede dicho.',
        sql: `SELECT COUNT(1) cantidad FROM productos
               WHERE empresaId=$1 AND activo=true AND impuestoId IS NULL`,
      },
      /*
       * ======================================================================
       * Un producto exento abonado a la cuenta de ventas gravadas
       * ----------------------------------------------------------------------
       * La cuenta de ingresos de cada venta sale de la CATEGORÍA del producto
       * —así se reparte en cualquier ERP— y el impuesto sale del producto. Son
       * dos ejes independientes, y por eso se pueden contradecir: un servicio
       * marcado EXENTO cuya categoría apunta a «Ventas y/o servicios gravados
       * a la tasa general» se presenta en el mayor como si estuviera gravado.
       *
       * El catálogo del SAT separa las tres familias —401.01 gravados a la
       * tasa general, 401.04 gravados al 0 %, 401.07 exentos— precisamente
       * porque el estado de resultados y la declaración las distinguen.
       *
       * No se fuerza la cuenta: puede haber motivos para una clasificación
       * distinta. Se señala la contradicción, que es lo que un contador mira.
       * ======================================================================
       */
      {
        codigo: 'INGRESO_NO_CONCUERDA_CON_EL_IMPUESTO',
        modulo: 'Catálogo/Fiscal',
        /*
         * Era MEDIA cuando la venta se abonaba a donde dijera la categoría y el
         * ingreso quedaba mal clasificado de verdad. Desde que el motor
         * contable elige la cuenta por el IMPUESTO del producto
         * —`cuentaDeIngresoSegunImpuesto`—, la póliza sale bien aunque la
         * categoría diga otra cosa, y lo que queda es una configuración
         * confusa: quien abra la categoría leerá «401.01» para una leche a
         * tasa 0 %. Merece limpiarse; no merece una alarma: queda como INFO. Un tablero que
         * enciende luces por cosas que el sistema ya resolvió deja de leerse.
         */
        severidad: 'INFO',
        descripcion:
          'Categorías cuya cuenta de ingresos no concuerda con el impuesto de los productos que contienen. La venta se contabiliza igual en la cuenta que le toca por su impuesto —401.01 gravado, 401.04 tasa 0 %, 401.07 exento—; lo que queda mal es la configuración.',
        accion:
          'Opcional: en Finanzas → Categorías contables, separar por tratamiento fiscal o dejar la cuenta general. El motor contable resuelve la cuenta por el impuesto del producto.',
        sql: `SELECT COUNT(1) cantidad
                FROM productos pr
                JOIN impuestos i ON i.id = pr.impuestoId
                JOIN categorias ca ON ca.id = pr.categoriaId
                JOIN cuentas_contables cc ON cc.id = ca.cuentaVentasId
               WHERE pr.empresaId = $1 AND pr.activo = true
                 AND cc.codigoAgrupadorSAT IS NOT NULL
                 AND (
                   (i.tipoFactor = 'TASA' AND i.porcentaje > 0
                      AND cc.codigoAgrupadorSAT NOT IN ('401.01','401.02','401.03','401.39'))
                   OR (i.tipoFactor = 'TASA' AND i.porcentaje = 0
                      AND cc.codigoAgrupadorSAT NOT IN ('401.04','401.05','401.06'))
                   OR (i.tipoFactor = 'EXENTO'
                      AND cc.codigoAgrupadorSAT NOT IN ('401.07','401.08','401.09','401.14','401.15'))
                 )`,
      },
      {
        codigo: 'NOMINA_SIN_SNAPSHOT',
        modulo: 'RR. HH./Nómina',
        severidad: 'ALTA',
        descripcion:
          'Periodos calculados o posteriores sin hash/snapshot de cálculo.',
        accion:
          'Recalcular en ambiente controlado antes de aprobar y congelar la versión.',
        sql: `SELECT COUNT(1) cantidad FROM rrhh_periodos_nomina
               WHERE empresaId=$1 AND estado<>'ABIERTO' AND (hashCalculo IS NULL OR versionCalculo<=0)`,
      },
    ];

    const hallazgos = await Promise.all(
      definiciones.map(async (d): Promise<HallazgoIntegridad> => {
        const medicion = await this.contar(d.sql, empresaId);
        return {
          codigo: d.codigo,
          modulo: d.modulo,
          severidad: d.severidad,
          estado: !medicion.medida
            ? 'NO_MEDIBLE'
            : medicion.cantidad > 0
              ? 'CON_HALLAZGOS'
              : 'LIMPIA',
          cantidad: medicion.cantidad,
          descripcion: d.descripcion,
          accion: medicion.medida
            ? d.accion
            : 'Revisa que el módulo esté instalado y que la consulta pueda ejecutarse; hasta entonces esta comprobación no dice nada.',
          ...(medicion.medida ? {} : { detalle: medicion.motivo }),
        };
      }),
    );

    const conHallazgos = hallazgos.filter((h) => h.estado === 'CON_HALLAZGOS');
    const noMedibles = hallazgos.filter((h) => h.estado === 'NO_MEDIBLE');
    const criticos = conHallazgos
      .filter((h) => h.severidad === 'CRITICA')
      .reduce((s, h) => s + h.cantidad, 0);
    const altos = conHallazgos
      .filter((h) => h.severidad === 'ALTA')
      .reduce((s, h) => s + h.cantidad, 0);

    /*
     * El orden importa: un descuadre real manda sobre un hueco de medición,
     * pero un hueco manda sobre el silencio. SALUDABLE queda reservado para
     * cuando las doce comprobaciones corrieron y ninguna encontró nada.
     */
    const estado =
      criticos > 0
        ? 'BLOQUEADO'
        : altos > 0
          ? 'CON_ALERTAS'
          : noMedibles.length > 0
            ? 'INCOMPLETO'
            : 'SALUDABLE';

    return {
      generadoEn: new Date().toISOString(),
      estado,
      resumen: {
        criticos,
        altos,
        hallazgosActivos: conHallazgos.length,
        noMedibles: noMedibles.length,
      },
      hallazgos: [...conHallazgos, ...noMedibles],
      comprobaciones: hallazgos.length,
    };
  }
}
