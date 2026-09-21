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

  private async siguienteFolio(
    empresaId: string,
    repo: Repository<MovimientoTesoreria>,
  ): Promise<string> {
    const fila = await repo
      .createQueryBuilder('m')
      .select('MAX(CAST(SUBSTRING(m.folio, 4, 12) AS BIGINT))', 'maximo')
      .where('m.empresaId = :empresaId', { empresaId })
      .andWhere("m.folio LIKE 'TM-%'")
      .getRawOne<{ maximo: number | null }>();

    return `TM-${String((fila?.maximo ?? 0) + 1).padStart(8, '0')}`;
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
        '(m.concepto LIKE :b OR m.referencia LIKE :b OR m.folio LIKE :b OR m.nombreTercero LIKE :b)',
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
      detalle: {
        enTransito: enTransito.map((m) => ({
          folio: m.folio,
          fecha: m.fecha,
          concepto: m.concepto,
          importe: Number(m.importe),
          tipo: m.tipo,
        })),
        noRegistrados: noRegistrados.map((l) => ({
          fecha: l.fecha,
          descripcion: l.descripcion,
          cargo: Number(l.cargo),
          abono: Number(l.abono),
        })),
      },
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
        fecha: Between(rango.desde, rango.hasta),
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
