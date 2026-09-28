/**
 * ============================================================================
 * SyncroERP · Tesorería — servicio
 * ----------------------------------------------------------------------------
 * Decisiones deliberadas:
 *
 * · El saldo se encadena por movimiento (`saldoPosterior`). Recalcular la suma
 *   completa en cada consulta funciona con 500 movimientos y se cae con
 *   50,000. A cambio, insertar un movimiento con fecha retroactiva obliga a
 *   recalcular la cadena desde ahí: eso lo hace `recalcularSaldos()`, dentro
 *   de la misma transacción.
 *
 * · La conciliación automática empareja por importe + ventana de fechas. No
 *   inventa coincidencias: si un importe casa con dos movimientos, los deja
 *   ambos pendientes y los reporta como ambiguos para que decida una persona.
 *
 * · Un movimiento no se borra nunca; se cancela con un movimiento inverso.
 *   Borrar rompe la cadena de saldos y la auditoría.
 * ============================================================================
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';

import {
  EstadoCierre,
  EstadoConciliacion,
  EstadoCuentaBancario,
  LineaEstadoCuenta,
  MovimientoTesoreria,
  OrigenMovimiento,
  TipoMovimiento,
} from '../entities/tesoreria.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import { CrearMovimientoTesoreriaDto } from '../dto/tesoreria.dto';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { exigirRangoDeFechas } from '../../common/utils/business-time.util';

const aCent = (v: number | string) => Math.round(Number(v ?? 0) * 100);
const aPesos = (c: number) => Math.round(c) / 100;

/** Los ingresos suman, los egresos restan. */
/**
 * Orígenes cuya póliza nace AQUÍ. El resto (venta, cobranza, pago a proveedor,
 * hospedaje, devolución) ya la genera el módulo que produce el movimiento;
 * contabilizarlos otra vez desde tesorería duplicaría el importe en el mayor.
 */
const ORIGENES_CONTABILIZA_TESORERIA = new Set<OrigenMovimiento>([
  OrigenMovimiento.MANUAL,
  OrigenMovimiento.COMISION_BANCARIA,
  OrigenMovimiento.IMPUESTO,
]);

/**
 * Los documentos que generan movimientos de tesorería, y dónde se deshace cada
 * uno.
 *
 * Existe para que la negativa de `cancelar()` diga algo útil. Se declara a mano
 * —no se deduce— porque la respuesta correcta no está en el código: es dónde
 * está la pantalla, y en varios casos la respuesta honesta es «no hay».
 *
 * Los `tipoDocumento` salen de quien crea el movimiento; buscarlos es
 * `grep "tipoDocumento:" src`.
 */
const DOCUMENTOS_DE_ORIGEN: Record<string, { que: string; donde: string }> = {
  VENTA: {
    que: 'una venta',
    donde: 'Anula la venta en Ventas → Historial: la anulación devuelve el dinero y deshace el movimiento.',
  },
  ENGANCHE_VENTA: {
    que: 'el enganche de una venta a crédito',
    donde: 'Anula la venta en Ventas → Historial; el enganche se deshace con ella.',
  },
  DEVOLUCION_VENTA: {
    que: 'una devolución de venta',
    donde:
      'Una devolución no se deshace: si se hizo mal, lo correcto es una nueva venta por lo devuelto, no borrar el reembolso.',
  },
  CANCELACION_TESORERIA: {
    que: 'la cancelación de otro movimiento',
    donde:
      'Es ya el movimiento que deshace otro. Cancelarlo devolvería el dinero a los libros de algo ' +
      'que se dio por cancelado; si la cancelación estuvo mal, lo que corresponde es registrar de ' +
      'nuevo el movimiento con su explicación.',
  },
  ANULACION_VENTA: {
    que: 'la anulación de una venta',
    donde:
      'Es ya el movimiento que deshace otro. Cancelarlo dejaría la venta anulada y el dinero fuera.',
  },
  PAGO_COBRANZA: {
    que: 'un pago de cobranza',
    donde:
      'Cancela el pago en Créditos → Cobranza: desde ahí se rehace el reparto entre cuotas y se cancela este movimiento.',
  },
  PAGO_PROVEEDOR: {
    que: 'un pago a proveedor',
    donde:
      'El ERP todavía no tiene reversa de pagos a proveedor, así que esto no se deshace desde ninguna pantalla: el ajuste va por una póliza, con su explicación.',
  },
  PAGO_NOMINA: {
    que: 'la dispersión de un periodo de nómina',
    donde:
      'Se atiende en RRHH → Pagos, sobre el periodo. Cancelar aquí dejaría el periodo diciendo que se pagó.',
  },
  MOVIMIENTO_CAJA: {
    que: 'un movimiento del turno de caja',
    donde: 'Se corrige en Tesorería → Caja, dentro del turno al que pertenece.',
  },
  COBRO_CITY_LEDGER: {
    que: 'un cobro de City Ledger',
    donde: 'Se deshace en Hotelería → City Ledger, sobre el cobro.',
  },
  FOLIO_HOTEL: {
    que: 'el cierre de un folio de hotel',
    donde: 'Se atiende en Hotelería, sobre el folio.',
  },
  TESORERIA_HOSPEDAJE: {
    que: 'un cobro de hospedaje',
    donde: 'Se atiende en Hotelería, sobre el folio que lo generó.',
  },
  CONSUMO_RECETA: {
    que: 'un consumo de receta',
    donde: 'Se atiende en Recetas, sobre el consumo.',
  },
  MERMA_DEVOLUCION: {
    que: 'la merma de una devolución',
    donde: 'Se atiende junto con la devolución que la produjo.',
  },
};

const SIGNO: Record<TipoMovimiento, 1 | -1> = {
  [TipoMovimiento.INGRESO]: 1,
  [TipoMovimiento.TRASPASO_ENTRADA]: 1,
  [TipoMovimiento.EGRESO]: -1,
  [TipoMovimiento.TRASPASO_SALIDA]: -1,
};


@Injectable()
export class TesoreriaService {
  private readonly logger = new Logger(TesoreriaService.name);

  constructor(
    @InjectRepository(MovimientoTesoreria)
    private readonly movimientos: Repository<MovimientoTesoreria>,
    @InjectRepository(EstadoCuentaBancario)
    private readonly estados: Repository<EstadoCuentaBancario>,
    @InjectRepository(LineaEstadoCuenta)
    private readonly lineas: Repository<LineaEstadoCuenta>,
    @InjectRepository(CuentaBancaria)
    private readonly cuentas: Repository<CuentaBancaria>,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
  ) {}

  /* ══ MOVIMIENTOS ═════════════════════════════════════════════════════════ */

  async registrar(
    dto: CrearMovimientoTesoreriaDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    if (!Number.isFinite(Number(dto.importe)) || Number(dto.importe) <= 0) {
      throw new BadRequestException(
        'El importe debe ser positivo. El signo lo determina el tipo de movimiento.',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      return this.registrarConManager(dto, empresaId, usuarioId, manager);
    });
  }

  /**
   * Integra movimientos originados por otros módulos en la MISMA transacción
   * de negocio. Evita que exista un reembolso sin salida de tesorería o una
   * salida bancaria sin devolución.
   */
  async registrarEnTransaccion(
    dto: CrearMovimientoTesoreriaDto,
    empresaId: string,
    usuarioId: string | undefined,
    manager: EntityManager,
  ) {
    if (!Number.isFinite(Number(dto.importe)) || Number(dto.importe) <= 0) {
      throw new BadRequestException(
        'El importe de tesorería debe ser positivo.',
      );
    }
    return this.registrarConManager(dto, empresaId, usuarioId, manager);
  }

  /**
   * Todas las altas pasan por este método y bloquean la cuenta bancaria.
   * Así dos cajas no pueden leer el mismo saldo y escribir cadenas distintas.
   */
  private async registrarConManager(
    dto: CrearMovimientoTesoreriaDto,
    empresaId: string,
    usuarioId: string | undefined,
    manager: EntityManager,
    cuentaYaBloqueada = false,
  ) {
    const fecha = new Date(dto.fecha);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('La fecha del movimiento no es válida.');
    }

    if (!cuentaYaBloqueada) {
      const cuenta = await manager
        .getRepository(CuentaBancaria)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.empresaId = :empresaId', {
          id: dto.cuentaBancariaId,
          empresaId,
        })
        .getOne();
      if (!cuenta) throw new NotFoundException('La cuenta bancaria no existe.');
      if (!cuenta.activo)
        throw new ConflictException('La cuenta bancaria está inactiva.');
    }

    /*
     * Falla rápido: sin contrapartida el asiento no se puede generar y el
     * movimiento acabaría en la cola de asientos fallidos, con el dinero ya
     * movido en el auxiliar y sin reflejo en el mayor. Es preferible rechazar
     * la captura.
     */
    const origenMovimiento = dto.origen ?? OrigenMovimiento.MANUAL;
    if (
      ORIGENES_CONTABILIZA_TESORERIA.has(origenMovimiento) &&
      !dto.cuentaContrapartidaId
    ) {
      throw new BadRequestException(
        'Indica la cuenta contable de contrapartida. Un movimiento manual de ' +
          'tesorería genera póliza y el sistema no puede deducir contra qué ' +
          'cuenta se registra.',
      );
    }

    const repo = manager.getRepository(MovimientoTesoreria);
    // `cuentaContrapartidaId` es un dato del asiento, no una columna del
    // movimiento: se extrae para no arrastrarlo al INSERT.
    const { cuentaContrapartidaId: _contrapartida, ...datosMovimiento } = dto;
    const movimiento = await repo.save(
      repo.create({
        ...datosMovimiento,
        importe: Number(dto.importe),
        empresaId,
        fecha,
        folio: await this.siguienteFolio(empresaId, repo),
        origen: dto.origen ?? OrigenMovimiento.MANUAL,
        registradoPorId: usuarioId,
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        saldoPosterior: 0,
      }),
    );

    await this.recalcularSaldos(
      dto.cuentaBancariaId,
      empresaId,
      fecha,
      manager,
    );

    /*
     * Sólo se contabilizan los movimientos cuyo origen es la propia tesorería.
     * Los que llegan desde ventas, cobranza, compras u hotelería ya generan su
     * póliza en el módulo que los produce; encolar otra aquí duplicaría el
     * ingreso o el egreso en el mayor.
     */
    if (ORIGENES_CONTABILIZA_TESORERIA.has(movimiento.origen)) {
      await this.asientos.encolarEnTransaccion(
        manager,
        TipoAsiento.TESORERIA,
        {
          movimientoId: movimiento.id,
          empresaId,
          fecha,
          folio: movimiento.folio,
          concepto: movimiento.concepto,
          importe: Number(movimiento.importe),
          operacion: 'MOVIMIENTO',
          tipo:
            movimiento.tipo === TipoMovimiento.INGRESO ? 'INGRESO' : 'EGRESO',
          cuentaBancariaId: dto.cuentaBancariaId,
          cuentaContrapartidaId: dto.cuentaContrapartidaId,
        },
        empresaId,
        movimiento.folio,
        movimiento.id,
      );
    }

    return repo.findOne({ where: { id: movimiento.id } });
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * Un BIGINT de PostgreSQL llega como TEXTO, y «texto + 1» concatena
   * --------------------------------------------------------------------------
   * Aquí ponía:
   *
   *   .select('MAX(CAST(SUBSTRING(m.folio, 4, 12) AS BIGINT))', 'maximo')
   *   return `TM-${String((fila?.maximo ?? 0) + 1).padStart(8, '0')}`;
   *
   * `node-postgres` devuelve BIGINT como `string` —no cabe en un `number` de
   * JavaScript, así que no lo convierte—. Y en JavaScript `'1' + 1` no es 2:
   * es `'11'`. El resultado no es un folio equivocado de vez en cuando, es una
   * progresión que se dispara y termina clavada:
   *
   *   TM-00000001  →  '1' + 1 = '11'   →  TM-00000011
   *   TM-00000011  →  '11' + 1 = '111' →  TM-00000111
   *   …
   *   TM-1111111111111 → '111111111111' + 1 = '1111111111111' → el MISMO
   *
   * A partir de los trece unos el folio ya no crece: `SUBSTRING(...,4,12)`
   * corta a doce, se le pega un uno y vuelve a salir trece. Un punto fijo.
   *
   * Medido el 26-sep-2026 contra la instalación: los DOCE movimientos de
   * tesorería de la cuenta «Caja mostrador (UAT)» tenían el mismo folio,
   * `TM-1111111111111`, y el reporte de conciliación los listaba como doce
   * renglones con el mismo número de documento. Un folio que no identifica
   * nada no es un folio.
   *
   * `Number(...)` antes de sumar. Y el máximo se calcula sobre el número, no
   * sobre el texto, para que 'TM-00000009' no parezca mayor que 'TM-00000010'.
   * ══════════════════════════════════════════════════════════════════════════
   */
  private async siguienteFolio(
    empresaId: string,
    repo: Repository<MovimientoTesoreria>,
  ): Promise<string> {
    const fila = await repo
      .createQueryBuilder('m')
      .select('MAX(CAST(SUBSTRING(m.folio, 4, 12) AS BIGINT))', 'maximo')
      .where('m.empresaId = :empresaId', { empresaId })
      .andWhere("m.folio LIKE 'TM-%'")
      /* Los folios rotos de antes del arreglo no pueden marcar el siguiente. */
      .andWhere("m.folio ~ '^TM-[0-9]{1,12}$'")
      .getRawOne<{ maximo: number | string | null }>();

    const maximo = Number(fila?.maximo ?? 0);
    const siguiente = Number.isFinite(maximo) && maximo > 0 ? maximo + 1 : 1;
    return `TM-${String(siguiente).padStart(8, '0')}`;
  }

  /**
   * Recalcula `saldoPosterior` de todos los movimientos de la cuenta a partir
   * de `desde`. Necesario porque se permite capturar con fecha retroactiva.
   */
  private async recalcularSaldos(
    cuentaBancariaId: string,
    empresaId: string,
    desde: Date,
    manager: EntityManager,
  ) {
    const repo = manager.getRepository(MovimientoTesoreria);

    // Saldo justo antes de `desde`.
    const anterior = await repo
      .createQueryBuilder('m')
      .where('m.cuentaBancariaId = :cta', { cta: cuentaBancariaId })
      .andWhere('m.empresaId = :empresaId', { empresaId })
      .andWhere('m.fecha < :desde', { desde })
      .andWhere('m.cancelado = false')
      .orderBy('m.fecha', 'DESC')
      .addOrderBy('m.fechaCreacion', 'DESC')
      .getOne();

    let saldoCent = anterior ? aCent(anterior.saldoPosterior) : 0;

    const posteriores = await repo.find({
      where: { cuentaBancariaId, empresaId },
      order: { fecha: 'ASC', fechaCreacion: 'ASC' },
    });

    for (const m of posteriores) {
      if (new Date(m.fecha) < desde) continue;
      if (m.cancelado) {
        m.saldoPosterior = aPesos(saldoCent);
        await repo.save(m);
        continue;
      }
      saldoCent += SIGNO[m.tipo] * aCent(m.importe);
      m.saldoPosterior = aPesos(saldoCent);
      await repo.save(m);
    }
  }

  async listarMovimientos(
    empresaId: string,
    filtros: {
      cuentaBancariaId?: string;
      desde?: string;
      hasta?: string;
      tipo?: TipoMovimiento;
      conciliacion?: EstadoConciliacion;
      busqueda?: string;
    } = {},
  ) {
    const q = this.movimientos
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.cuentaBancaria', 'c')
      .where('m.empresaId = :empresaId', { empresaId });

    if (filtros.cuentaBancariaId)
      q.andWhere('m.cuentaBancariaId = :cta', {
        cta: filtros.cuentaBancariaId,
      });
    if (filtros.tipo) q.andWhere('m.tipo = :tipo', { tipo: filtros.tipo });
    if (filtros.conciliacion)
      q.andWhere('m.estadoConciliacion = :ec', { ec: filtros.conciliacion });
    if (filtros.desde && filtros.hasta) {
      q.andWhere('m.fecha BETWEEN :desde AND :hasta', {
        desde: new Date(filtros.desde),
        hasta: new Date(filtros.hasta),
      });
    }
    if (filtros.busqueda) {
      q.andWhere(
        '(m.concepto ILIKE :b OR m.referencia ILIKE :b OR m.folio ILIKE :b OR m.nombreTercero ILIKE :b)',
        {
          b: `%${filtros.busqueda}%`,
        },
      );
    }

    return q
      .orderBy('m.fecha', 'DESC')
      .addOrderBy('m.fechaCreacion', 'DESC')
      .getMany();
  }

  /** Cancela con contrapartida en lugar de borrar: la auditoría se conserva. */
  async cancelar(
    id: string,
    motivo: string,
    empresaId: string,
    usuarioId?: string,
  ) {
    const original = await this.movimientos.findOne({
      where: { id, empresaId },
    });
    if (!original) throw new NotFoundException('El movimiento no existe.');
    if (original.cancelado)
      throw new ConflictException('El movimiento ya está cancelado.');
    if (original.estadoConciliacion === EstadoConciliacion.CONCILIADO) {
      throw new ConflictException(
        'El movimiento ya está conciliado con el banco. Desconcílialo antes de cancelarlo.',
      );
    }

    /*
     * ──────────────────────────────────────────────────────────────────────
     * UN MOVIMIENTO QUE NACIÓ DE UN DOCUMENTO NO SE CANCELA DESDE AQUÍ
     *
     * Cancelar escribe una contrapartida en tesorería y NADA MÁS: no toca el
     * documento que lo originó, y nadie en el sistema mira después si el
     * movimiento quedó cancelado —los documentos guardan
     * `movimientoTesoreriaId` y no vuelven a leerlo nunca—.
     *
     * Así que cancelar aquí el movimiento de un pago a proveedor devolvía el
     * saldo al banco y dejaba la orden de compra diciendo que está pagada. Dos
     * subsistemas afirmando cosas contrarias, cada uno coherente por dentro y
     * ninguna pantalla donde se vea la diferencia: aparece meses después, en
     * una conciliación, cuando ya nadie recuerda qué pasó. Igual con una venta,
     * con un cobro de cobranza o con una dispersión de nómina. Y el botón
     * estaba en TODOS los renglones de la pantalla de movimientos, así que
     * hacían falta dos clics.
     *
     * La regla que el propio sistema ya sigue en el otro sentido: se cancela el
     * DOCUMENTO y el documento cancela su movimiento —es lo que hace
     * `CobranzaService.cancelarPago`—. Aquí se sostiene esa misma regla en vez
     * de dejar abierta la puerta de atrás.
     *
     * Donde el ERP tiene esa salida se nombra; donde NO la tiene se dice que no
     * la tiene. Mandar a alguien a una pantalla que no existe cuesta más que la
     * propia negativa, y es un error que este proyecto ya ha pagado varias
     * veces.
     * ──────────────────────────────────────────────────────────────────────
     */
    if (original.tipoDocumento) {
      throw new ConflictException(
        `Este movimiento no se registró a mano: lo generó ${DOCUMENTOS_DE_ORIGEN[original.tipoDocumento]?.que ?? `un documento del sistema (${original.tipoDocumento})`}. ` +
          'Cancelarlo aquí devolvería el saldo al banco y dejaría ese documento diciendo que el ' +
          'dinero sí se movió, y ninguna pantalla enseña esa diferencia. ' +
          (DOCUMENTOS_DE_ORIGEN[original.tipoDocumento]?.donde ??
            'Hay que deshacerlo donde se creó; si ese documento no admite reversa, el ajuste ' +
              'tiene que hacerse por una póliza, no borrando el movimiento.'),
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MovimientoTesoreria);

      original.cancelado = true;
      original.motivoCancelacion = motivo;
      await repo.save(original);

      const inverso: Record<TipoMovimiento, TipoMovimiento> = {
        [TipoMovimiento.INGRESO]: TipoMovimiento.EGRESO,
        [TipoMovimiento.EGRESO]: TipoMovimiento.INGRESO,
        [TipoMovimiento.TRASPASO_ENTRADA]: TipoMovimiento.TRASPASO_SALIDA,
        [TipoMovimiento.TRASPASO_SALIDA]: TipoMovimiento.TRASPASO_ENTRADA,
      };

      const contra = await repo.save(
        repo.create({
          empresaId,
          folio: await this.siguienteFolio(empresaId, repo),
          cuentaBancariaId: original.cuentaBancariaId,
          fecha: new Date(),
          tipo: inverso[original.tipo],
          origen: original.origen,
          importe: original.importe,
          concepto: `Cancelación de ${original.folio}: ${motivo}`,
          referencia: original.folio,
          /*
           * La contrapartida apunta al movimiento que deshace. Antes sólo lo
           * nombraba en el concepto y en la referencia, que es texto: nada
           * enlazaba los dos, y sobre todo NADA impedía cancelar la
           * contrapartida. Hacerlo devolvería el dinero a los libros de un
           * documento que ya se dio por cancelado —un nudo, no una corrección—.
           * Con esto entra por la misma puerta que los demás documentos y la
           * negativa lo explica.
           */
          documentoId: original.id,
          tipoDocumento: 'CANCELACION_TESORERIA',
          registradoPorId: usuarioId,
          estadoConciliacion: EstadoConciliacion.PENDIENTE,
          saldoPosterior: 0,
        }),
      );

      await this.recalcularSaldos(
        original.cuentaBancariaId,
        empresaId,
        new Date(original.fecha),
        manager,
      );
      return { original, contrapartida: contra };
    });
  }

  /** Traspaso entre cuentas propias: dos movimientos, una sola transacción. */
  async traspasar(
    dto: {
      origenId: string;
      destinoId: string;
      importe: number;
      fecha: string;
      concepto: string;
    },
    empresaId: string,
    usuarioId?: string,
  ) {
    if (dto.origenId === dto.destinoId) {
      throw new BadRequestException(
        'La cuenta de origen y la de destino deben ser distintas.',
      );
    }
    if (dto.importe <= 0) {
      throw new BadRequestException(
        'El importe del traspaso debe ser mayor que cero.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Orden estable para evitar interbloqueos entre traspasos cruzados.
      const ids = [dto.origenId, dto.destinoId].sort();
      const bloqueadas: CuentaBancaria[] = [];
      for (const id of ids) {
        const cuenta = await manager
          .getRepository(CuentaBancaria)
          .createQueryBuilder('c')
          .setLock('pessimistic_write')
          .where('c.id = :id AND c.empresaId = :empresaId', { id, empresaId })
          .getOne();
        if (!cuenta)
          throw new NotFoundException(
            'Una de las cuentas bancarias no existe.',
          );
        if (!cuenta.activo)
          throw new ConflictException(
            `La cuenta ${cuenta.nombre} está inactiva.`,
          );
        bloqueadas.push(cuenta);
      }

      const repo = manager.getRepository(MovimientoTesoreria);
      const ultimo = await repo.findOne({
        where: {
          cuentaBancariaId: dto.origenId,
          empresaId,
          cancelado: false,
        },
        order: { fecha: 'DESC', fechaCreacion: 'DESC' },
      });
      const saldoOrigen = ultimo ? Number(ultimo.saldoPosterior) : 0;
      if (saldoOrigen < Number(dto.importe)) {
        throw new ConflictException(
          `Saldo insuficiente en la cuenta de origen. Disponible: ${saldoOrigen.toFixed(2)}.`,
        );
      }

      const salida = await this.registrarConManager(
        {
          cuentaBancariaId: dto.origenId,
          fecha: dto.fecha,
          tipo: TipoMovimiento.TRASPASO_SALIDA,
          importe: dto.importe,
          concepto: dto.concepto,
          origen: OrigenMovimiento.TRASPASO,
        },
        empresaId,
        usuarioId,
        manager,
        true,
      );
      const entrada = await this.registrarConManager(
        {
          cuentaBancariaId: dto.destinoId,
          fecha: dto.fecha,
          tipo: TipoMovimiento.TRASPASO_ENTRADA,
          importe: dto.importe,
          concepto: dto.concepto,
          origen: OrigenMovimiento.TRASPASO,
          referencia: salida?.folio,
        },
        empresaId,
        usuarioId,
        manager,
        true,
      );

      /*
       * Una sola póliza con los dos lados (Dr. destino / Cr. origen). Dos
       * pólizas independientes dejarían medio traspaso contabilizado si la
       * segunda fallaba.
       */
      await this.asientos.encolarEnTransaccion(
        manager,
        TipoAsiento.TESORERIA,
        {
          movimientoId: salida!.id,
          empresaId,
          fecha: new Date(dto.fecha),
          folio: salida!.folio,
          concepto: dto.concepto,
          importe: Number(dto.importe),
          operacion: 'TRASPASO',
          cuentaBancariaOrigenId: dto.origenId,
          cuentaBancariaDestinoId: dto.destinoId,
        },
        empresaId,
        salida!.folio,
        salida!.id,
      );

      return { salida, entrada };
    });
  }

  async saldoActual(
    cuentaBancariaId: string,
    empresaId: string,
  ): Promise<number> {
    const ultimo = await this.movimientos.findOne({
      where: { cuentaBancariaId, empresaId, cancelado: false },
      order: { fecha: 'DESC', fechaCreacion: 'DESC' },
    });
    return ultimo ? Number(ultimo.saldoPosterior) : 0;
  }

  async saldosPorCuenta(empresaId: string) {
    const cuentas = await this.cuentas.find({
      where: { empresaId, activo: true },
    });
    return Promise.all(
      cuentas.map(async (c) => ({
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        numeroCuenta: c.numeroCuenta,
        saldo: await this.saldoActual(c.id, empresaId),
        pendientesConciliar: await this.movimientos.count({
          where: {
            cuentaBancariaId: c.id,
            empresaId,
            estadoConciliacion: EstadoConciliacion.PENDIENTE,
            cancelado: false,
          },
        }),
      })),
    );
  }

  /* ══ CONCILIACIÓN ════════════════════════════════════════════════════════ */

  async crearEstadoCuenta(
    dto: {
      cuentaBancariaId: string;
      ejercicio: number;
      mes: number;
      saldoInicialBanco: number;
      saldoFinalBanco: number;
      lineas: Array<{
        fecha: string;
        descripcion: string;
        referencia?: string;
        cargo?: number;
        abono?: number;
      }>;
    },
    empresaId: string,
  ) {
    const existe = await this.estados.findOne({
      where: {
        empresaId,
        cuentaBancariaId: dto.cuentaBancariaId,
        ejercicio: dto.ejercicio,
        mes: dto.mes,
      },
    });
    if (existe) {
      throw new ConflictException(
        'Ya hay un estado de cuenta cargado para esa cuenta y periodo.',
      );
    }

    // El estado de cuenta debe cuadrar consigo mismo antes de conciliar nada.
    const sumaCargos = dto.lineas.reduce((s, l) => s + aCent(l.cargo ?? 0), 0);
    const sumaAbonos = dto.lineas.reduce((s, l) => s + aCent(l.abono ?? 0), 0);
    const esperado = aCent(dto.saldoInicialBanco) + sumaAbonos - sumaCargos;

    if (Math.abs(esperado - aCent(dto.saldoFinalBanco)) > 1) {
      throw new BadRequestException(
        `El estado de cuenta no cuadra. Saldo inicial más abonos menos cargos da ` +
          `${aPesos(esperado).toFixed(2)}, pero el saldo final declarado es ` +
          `${Number(dto.saldoFinalBanco).toFixed(2)}.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const estado = await manager.getRepository(EstadoCuentaBancario).save({
        empresaId,
        cuentaBancariaId: dto.cuentaBancariaId,
        ejercicio: dto.ejercicio,
        mes: dto.mes,
        saldoInicialBanco: dto.saldoInicialBanco,
        saldoFinalBanco: dto.saldoFinalBanco,
        estado: EstadoCierre.ABIERTA,
      });

      const repoLineas = manager.getRepository(LineaEstadoCuenta);
      await repoLineas.save(
        dto.lineas.map((l) =>
          repoLineas.create({
            empresaId,
            estadoCuentaId: estado.id,
            fecha: new Date(l.fecha),
            descripcion: l.descripcion,
            referencia: l.referencia,
            cargo: l.cargo ?? 0,
            abono: l.abono ?? 0,
          }),
        ),
      );

      return estado;
    });
  }

  /**
   * Empareja automáticamente por importe exacto dentro de una ventana de días.
   * Si un importe casa con más de un candidato, no adivina: lo reporta.
   */
  async conciliarAutomatico(
    estadoCuentaId: string,
    empresaId: string,
    ventanaDias = 5,
  ) {
    const estado = await this.estados.findOne({
      where: { id: estadoCuentaId, empresaId },
    });
    if (!estado) throw new NotFoundException('El estado de cuenta no existe.');
    if (estado.estado === EstadoCierre.CERRADA) {
      throw new ConflictException('El estado de cuenta ya está cerrado.');
    }

    const lineas = await this.lineas.find({
      where: { estadoCuentaId, conciliada: false },
      order: { fecha: 'ASC' },
    });

    const pendientes = await this.movimientos.find({
      where: {
        empresaId,
        cuentaBancariaId: estado.cuentaBancariaId,
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        cancelado: false,
      },
    });

    const usados = new Set<string>();
    let emparejadas = 0;
    const ambiguas: Array<{ linea: string; candidatos: number }> = [];

    await this.dataSource.transaction(async (manager) => {
      const repoMov = manager.getRepository(MovimientoTesoreria);
      const repoLin = manager.getRepository(LineaEstadoCuenta);

      for (const linea of lineas) {
        const importeCent =
          aCent(linea.cargo) > 0 ? aCent(linea.cargo) : aCent(linea.abono);
        const esCargo = aCent(linea.cargo) > 0;
        const fechaLinea = new Date(linea.fecha).getTime();

        const candidatos = pendientes.filter((m) => {
          if (usados.has(m.id)) return false;
          if (aCent(m.importe) !== importeCent) return false;
          // Un cargo del banco corresponde a un egreso nuestro.
          const esEgreso = SIGNO[m.tipo] === -1;
          if (esCargo !== esEgreso) return false;
          const dif =
            Math.abs(new Date(m.fecha).getTime() - fechaLinea) / 86_400_000;
          return dif <= ventanaDias;
        });

        if (candidatos.length === 0) continue;

        if (candidatos.length > 1) {
          // Desempate por referencia idéntica; si sigue ambiguo, lo deja a criterio humano.
          const porReferencia = candidatos.filter(
            (m) => linea.referencia && m.referencia === linea.referencia,
          );
          if (porReferencia.length !== 1) {
            ambiguas.push({
              linea: linea.descripcion,
              candidatos: candidatos.length,
            });
            continue;
          }
          candidatos.splice(0, candidatos.length, porReferencia[0]);
        }

        const movimiento = candidatos[0];
        usados.add(movimiento.id);

        movimiento.estadoConciliacion = EstadoConciliacion.CONCILIADO;
        movimiento.fechaConciliacion = new Date();
        movimiento.lineaEstadoCuentaId = linea.id;
        await repoMov.save(movimiento);

        linea.conciliada = true;
        linea.movimientoId = movimiento.id;
        await repoLin.save(linea);

        emparejadas++;
      }
    });

    return {
      emparejadas,
      lineasSinConciliar: lineas.length - emparejadas - ambiguas.length,
      ambiguas,
      mensaje: ambiguas.length
        ? `${ambiguas.length} líneas tienen más de un movimiento posible. Concílialas a mano.`
        : undefined,
    };
  }

  /** Empareja una línea con un movimiento elegido por la persona. */
  async conciliarManual(
    lineaId: string,
    movimientoId: string,
    empresaId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const linea = await manager
        .getRepository(LineaEstadoCuenta)
        .findOne({ where: { id: lineaId, empresaId } });
      const movimiento = await manager
        .getRepository(MovimientoTesoreria)
        .findOne({ where: { id: movimientoId, empresaId } });

      if (!linea)
        throw new NotFoundException('La línea del estado de cuenta no existe.');
      if (!movimiento) throw new NotFoundException('El movimiento no existe.');
      if (linea.conciliada)
        throw new ConflictException('La línea ya está conciliada.');
      if (movimiento.estadoConciliacion === EstadoConciliacion.CONCILIADO) {
        throw new ConflictException(
          'El movimiento ya está conciliado con otra línea.',
        );
      }

      const estado = await manager
        .getRepository(EstadoCuentaBancario)
        .findOne({ where: { id: linea.estadoCuentaId, empresaId } });
      if (!estado)
        throw new NotFoundException('El estado de cuenta no existe.');
      if (estado.estado === EstadoCierre.CERRADA)
        throw new ConflictException('El estado de cuenta ya está cerrado.');
      if (movimiento.cuentaBancariaId !== estado.cuentaBancariaId) {
        throw new BadRequestException(
          'La línea y el movimiento pertenecen a cuentas bancarias distintas.',
        );
      }

      const importeLinea =
        aCent(linea.cargo) > 0 ? aCent(linea.cargo) : aCent(linea.abono);
      if (importeLinea !== aCent(movimiento.importe)) {
        throw new BadRequestException(
          `Los importes no coinciden: el banco reporta ${aPesos(importeLinea).toFixed(2)} ` +
            `y el movimiento es de ${Number(movimiento.importe).toFixed(2)}.`,
        );
      }

      movimiento.estadoConciliacion = EstadoConciliacion.CONCILIADO;
      movimiento.fechaConciliacion = new Date();
      movimiento.lineaEstadoCuentaId = linea.id;
      await manager.getRepository(MovimientoTesoreria).save(movimiento);

      linea.conciliada = true;
      linea.movimientoId = movimiento.id;
      await manager.getRepository(LineaEstadoCuenta).save(linea);

      return { linea, movimiento };
    });
  }

  /** El reporte que firma el contador: explica la diferencia contra el banco. */
  /**
   * El estado de cuenta ya cargado para esa cuenta y periodo, si lo hay.
   *
   * Sin esto la conciliación sólo existía mientras durara la pestaña: el id
   * vivía en el estado de React y al recargar la pantalla no había forma de
   * volver a encontrarlo. Ver el comentario del controlador.
   */
  async estadoCuentaDelPeriodo(
    empresaId: string,
    cuentaBancariaId: string,
    ejercicio: number,
    mes: number,
  ) {
    if (!cuentaBancariaId || !Number.isFinite(ejercicio) || !Number.isFinite(mes)) {
      return null;
    }
    const estado = await this.estados.findOne({
      where: { empresaId, cuentaBancariaId, ejercicio, mes },
      order: { fechaCreacion: 'DESC' },
    });
    if (!estado) return null;
    const lineas = await this.lineas.count({
      where: { estadoCuentaId: estado.id },
    });
    return {
      id: estado.id,
      ejercicio: estado.ejercicio,
      mes: estado.mes,
      estado: estado.estado,
      saldoInicialBanco: Number(estado.saldoInicialBanco),
      saldoFinalBanco: Number(estado.saldoFinalBanco),
      fechaCierre: estado.fechaCierre,
      lineas,
    };
  }

  async reporteConciliacion(estadoCuentaId: string, empresaId: string) {
    const estado = await this.estados.findOne({
      where: { id: estadoCuentaId, empresaId },
    });
    if (!estado) throw new NotFoundException('El estado de cuenta no existe.');

    const primerDia = new Date(estado.ejercicio, estado.mes - 1, 1);
    const ultimoDia = new Date(estado.ejercicio, estado.mes, 0);

    const movimientos = await this.movimientos.find({
      where: {
        empresaId,
        cuentaBancariaId: estado.cuentaBancariaId,
        fecha: Between(primerDia, ultimoDia),
        cancelado: false,
      },
    });

    const lineas = await this.lineas.find({ where: { estadoCuentaId } });

    // Nuestros movimientos que el banco todavía no refleja.
    const enTransito = movimientos.filter(
      (m) => m.estadoConciliacion !== EstadoConciliacion.CONCILIADO,
    );
    // Movimientos del banco que no tenemos registrados.
    const noRegistrados = lineas.filter((l) => !l.conciliada);

    const saldoLibrosCent = movimientos.length
      ? aCent(movimientos[movimientos.length - 1].saldoPosterior)
      : 0;

    const depositosEnTransitoCent = enTransito
      .filter((m) => SIGNO[m.tipo] === 1)
      .reduce((s, m) => s + aCent(m.importe), 0);

    const chequesEnTransitoCent = enTransito
      .filter((m) => SIGNO[m.tipo] === -1)
      .reduce((s, m) => s + aCent(m.importe), 0);

    const cargosNoRegistradosCent = noRegistrados.reduce(
      (s, l) => s + aCent(l.cargo),
      0,
    );
    const abonosNoRegistradosCent = noRegistrados.reduce(
      (s, l) => s + aCent(l.abono),
      0,
    );

    const saldoConciliadoCent =
      aCent(estado.saldoFinalBanco) +
      depositosEnTransitoCent -
      chequesEnTransitoCent;

    const diferenciaCent =
      saldoConciliadoCent -
      saldoLibrosCent +
      cargosNoRegistradosCent -
      abonosNoRegistradosCent;

    return {
      cuentaBancariaId: estado.cuentaBancariaId,
      periodo: `${String(estado.mes).padStart(2, '0')}/${estado.ejercicio}`,
      saldoSegunBanco: Number(estado.saldoFinalBanco),
      saldoSegunLibros: aPesos(saldoLibrosCent),
      depositosEnTransito: aPesos(depositosEnTransitoCent),
      chequesEnTransito: aPesos(chequesEnTransitoCent),
      cargosNoRegistrados: aPesos(cargosNoRegistradosCent),
      abonosNoRegistrados: aPesos(abonosNoRegistradosCent),
      saldoConciliado: aPesos(saldoConciliadoCent),
      diferencia: aPesos(diferenciaCent),
      cuadra: Math.abs(diferenciaCent) <= 1,
      /*
       * ══════════════════════════════════════════════════════════════════════
       * Una conciliación que no concilió nada se declaraba cuadrada
       * ----------------------------------------------------------------------
       * `diferencia` sale de restar los dos ajustes clásicos: los movimientos
       * nuestros que el banco aún no refleja y las líneas del banco que
       * nosotros no tenemos registradas. Cuando NO SE EMPAREJA NADA, cada
       * operación entra en los dos lados a la vez —está en nuestros libros sin
       * conciliar y está en el estado de cuenta sin conciliar— y los dos
       * ajustes se cancelan EXACTAMENTE. La diferencia da cero y el reporte
       * dice «cuadra».
       *
       * Medido el 26-sep-2026: doce movimientos de «Caja mostrador (UAT)»
       * contra doce líneas del banco por los mismos importes. La conciliación
       * automática emparejó UNA —las otras once eran ambiguas: cuatro
       * movimientos distintos de $120 el mismo día— y el reporte contestó
       * diferencia $0.00 y `cuadra: true`. Con eso aparecía el botón de
       * cerrar, y cerrar es lo que el cierre mensual cuenta como cobertura
       * bancaria. Se habría firmado como conciliado un mes en el que no se
       * concilió nada.
       *
       * La regla que faltaba: cada línea del BANCO tiene que quedar explicada
       * —emparejada con un movimiento o registrada como movimiento nuevo—.
       * Que un movimiento NUESTRO siga en tránsito es normal a fin de mes: un
       * depósito que el banco acredita en dos días. Que una línea del banco
       * siga sin explicación no lo es: el banco ya movió ese dinero.
       * ══════════════════════════════════════════════════════════════════════
       */
      pendientes: {
        lineasDelBanco: noRegistrados.length,
        movimientosEnTransito: enTransito.length,
      },
      /** Cuadra Y no queda ninguna línea del banco sin explicar. */
      listoParaCerrar: Math.abs(diferenciaCent) <= 1 && noRegistrados.length === 0,
      detalle: {
        enTransito: enTransito.map((m) => ({
          id: m.id,
          folio: m.folio,
          fecha: m.fecha,
          concepto: m.concepto,
          importe: Number(m.importe),
          tipo: m.tipo,
        })),
        noRegistrados: noRegistrados.map((l) => ({
          id: l.id,
          fecha: l.fecha,
          descripcion: l.descripcion,
          referencia: l.referencia,
          cargo: Number(l.cargo),
          abono: Number(l.abono),
        })),
      },
    };
  }

  /*
   * ==========================================================================
   * La puerta que faltaba
   * --------------------------------------------------------------------------
   * `EstadoCierre.CERRADA` existia en el enum, la columna `fechaCierre` y
   * `conciliadoPorId` existian en la tabla, y habia DOS guardias que se negaban
   * a tocar un estado de cuenta cerrado. Lo unico que no existia era la accion
   * que lo cierra: el estado nacia ABIERTA en `crearEstadoCuenta` y nadie le
   * cambiaba el valor nunca.
   *
   * No era un detalle de tesoreria. El diagnostico del cierre mensual cuenta
   * `estado = 'CERRADA'` para saber si el banco esta conciliado, de modo que
   * ese contador valia cero siempre y el control BLOQUEABA cualquier mes de
   * cualquier empresa. Un control que cuenta un estado que ningun codigo
   * escribe no es estricto: es imposible. Y no se ve, porque el control hace
   * exactamente lo que dice hacer.
   *
   * Cerrar es un acto humano: alguien afirma que lo que el banco dice y lo que
   * los libros dicen ya se explican entre si. Por eso se exige que el reporte
   * CUADRE. Firmar un descuadre seria certificar una mentira, y el sistema no
   * debe ofrecer esa firma.
   * ==========================================================================
   */
  async cerrarConciliacion(
    estadoCuentaId: string,
    empresaId: string,
    usuarioId: string,
  ) {
    const estado = await this.estados.findOne({
      where: { id: estadoCuentaId, empresaId },
    });
    if (!estado) throw new NotFoundException('El estado de cuenta no existe.');

    if (estado.estado === EstadoCierre.CERRADA) {
      throw new ConflictException(
        'Esta conciliacion ya estaba cerrada' +
          (estado.fechaCierre
            ? ` desde el ${estado.fechaCierre.toISOString().slice(0, 10)}.`
            : '.'),
      );
    }

    const reporte = await this.reporteConciliacion(estadoCuentaId, empresaId);
    /*
     * Primero lo que la diferencia no ve: líneas del banco sin explicar. Con
     * cero emparejamientos la diferencia da cero —los dos ajustes se cancelan—
     * y cerrar así sería firmar como conciliado un mes en el que no se
     * concilió nada. Ver el comentario largo en `reporteConciliacion`.
     */
    if (reporte.pendientes.lineasDelBanco > 0) {
      throw new BadRequestException(
        `Quedan ${reporte.pendientes.lineasDelBanco} línea(s) del estado de ` +
          'cuenta sin explicar. Cada movimiento del banco tiene que quedar ' +
          'emparejado con uno de tus movimientos o registrado como movimiento ' +
          'nuevo: el banco ya movió ese dinero. ' +
          (reporte.pendientes.movimientosEnTransito > 0
            ? `Tus ${reporte.pendientes.movimientosEnTransito} movimiento(s) en ` +
              'tránsito sí pueden quedarse así: son los que el banco acreditará ' +
              'después. '
            : '') +
          'Empareja lo que falte desde la conciliación y vuelve a intentarlo.',
      );
    }
    if (!reporte.cuadra) {
      throw new BadRequestException(
        `La conciliacion no cuadra: quedan ${reporte.diferencia.toFixed(2)} sin explicar. ` +
          `El banco reporta ${reporte.saldoSegunBanco.toFixed(2)} y los libros ` +
          `${reporte.saldoSegunLibros.toFixed(2)}. ` +
          'Empareja los movimientos que faltan o registra los que el banco trae y ' +
          'nosotros no, y vuelve a intentarlo: cerrar con diferencia seria firmar ' +
          'que cuadra cuando no cuadra.',
      );
    }

    estado.estado = EstadoCierre.CERRADA;
    estado.fechaCierre = new Date();
    estado.conciliadoPorId = usuarioId;
    await this.estados.save(estado);

    return {
      id: estado.id,
      estado: estado.estado,
      fechaCierre: estado.fechaCierre,
      periodo: reporte.periodo,
      mensaje:
        `Conciliacion de ${reporte.periodo} cerrada. ` +
        'El cierre mensual ya la cuenta como cobertura bancaria del periodo.',
    };
  }

  /* ══ FLUJO DE EFECTIVO ═══════════════════════════════════════════════════ */

  /** Entradas y salidas agrupadas por día y por origen. */
  async flujoEfectivo(
    empresaId: string,
    desde: string,
    hasta: string,
    cuentaBancariaId?: string,
  ) {
    const rango = exigirRangoDeFechas(desde, hasta);
    const movimientos = await this.movimientos.find({
      where: {
        empresaId,
        fecha: Between(rango.desde, rango.hastaFinDelDia),
        cancelado: false,
        ...(cuentaBancariaId ? { cuentaBancariaId } : {}),
      },
      order: { fecha: 'ASC' },
    });

    const porDia = new Map<string, { entradas: number; salidas: number }>();
    const porOrigen = new Map<string, { entradas: number; salidas: number }>();

    for (const m of movimientos) {
      // Los traspasos entre cuentas propias no son flujo real: se excluyen
      // salvo que se esté viendo una cuenta específica.
      const esTraspaso =
        m.tipo === TipoMovimiento.TRASPASO_ENTRADA ||
        m.tipo === TipoMovimiento.TRASPASO_SALIDA;
      if (esTraspaso && !cuentaBancariaId) continue;

      const dia = new Date(m.fecha).toISOString().slice(0, 10);
      const entra = SIGNO[m.tipo] === 1;
      const importe = aCent(m.importe);

      const d = porDia.get(dia) ?? { entradas: 0, salidas: 0 };
      const o = porOrigen.get(m.origen) ?? { entradas: 0, salidas: 0 };

      if (entra) {
        d.entradas += importe;
        o.entradas += importe;
      } else {
        d.salidas += importe;
        o.salidas += importe;
      }

      porDia.set(dia, d);
      porOrigen.set(m.origen, o);
    }

    let acumuladoCent = 0;
    const serie = Array.from(porDia.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => {
        acumuladoCent += v.entradas - v.salidas;
        return {
          fecha: dia,
          entradas: aPesos(v.entradas),
          salidas: aPesos(v.salidas),
          neto: aPesos(v.entradas - v.salidas),
          acumulado: aPesos(acumuladoCent),
        };
      });

    const totalEntradas = serie.reduce((s, d) => s + aCent(d.entradas), 0);
    const totalSalidas = serie.reduce((s, d) => s + aCent(d.salidas), 0);

    return {
      desde,
      hasta,
      totalEntradas: aPesos(totalEntradas),
      totalSalidas: aPesos(totalSalidas),
      flujoNeto: aPesos(totalEntradas - totalSalidas),
      serie,
      porOrigen: Array.from(porOrigen.entries()).map(([origen, v]) => ({
        origen,
        entradas: aPesos(v.entradas),
        salidas: aPesos(v.salidas),
        neto: aPesos(v.entradas - v.salidas),
      })),
    };
  }
}
