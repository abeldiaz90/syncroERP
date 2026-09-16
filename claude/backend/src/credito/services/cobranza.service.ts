import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  MoreThanOrEqual,
  Not,
} from 'typeorm';
import {
  CreditoCliente,
  EstadoCredito,
} from '../entities/credito-cliente.entity';
import {
  AmortizacionCuota,
  EstadoCuota,
} from '../entities/amortizacion-cuota.entity';
import {
  EstadoContableCobranza,
  EstadoFiscalCobranza,
  PagoCobranza,
} from '../entities/pago-cobranza.entity';
import {
  MetodoPagoCobranza,
  RegistrarPagoCobranzaDto,
} from '../dto/registrar-pago-cobranza.dto';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../entities/cuenta-bancaria.entity';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { Venta } from '../../ventas/entities/venta.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import { CfdiService } from '../../cfdi/cfdi.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import { CarteraPublicadorService } from '../../integracion/services/cartera-publicador.service';

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(
    @InjectRepository(CreditoCliente)
    private readonly creditoRepo: Repository<CreditoCliente>,
    @InjectRepository(AmortizacionCuota)
    private readonly cuotaRepo: Repository<AmortizacionCuota>,
    @InjectRepository(PagoCobranza)
    private readonly pagoRepo: Repository<PagoCobranza>,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
    private readonly notificaciones: NotificacionesService,
    private readonly tesoreria: TesoreriaService,
    private readonly caja: CajaService,
    private readonly cfdi: CfdiService,
    private readonly cartera: CarteraPublicadorService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // REGISTRAR PAGO / ABONO
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Registra un abono.
   *
   * `opciones.idTransaccionExterna` es para UN solo caso: reflejar un pago que
   * ya ocurrió en el registro externo. No está en el DTO a propósito, y no
   * debe estarlo: si un cliente HTTP pudiera activarlo, podría registrar
   * cobranza que nunca se replica al externo y descuadrar las dos carteras sin
   * dejar rastro. Sólo lo pone código del servidor.
   */
  async registrarPago(
    dto: RegistrarPagoCobranzaDto,
    empresaId: string,
    usuarioId?: string,
    opciones?: { idTransaccionExterna?: string },
  ) {
    const monto = this.redondear(dto.montoPagado);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero.');
    }
    const fechaPago = dto.fechaPago
      ? new Date(`${dto.fechaPago.slice(0, 10)}T12:00:00`)
      : new Date();
    if (Number.isNaN(fechaPago.getTime())) {
      throw new BadRequestException('La fecha de pago no es válida.');
    }
    if (!dto.cuentaBancariaId) {
      throw new BadRequestException(
        'Selecciona la cuenta de caja, banco o TPV que recibirá la cobranza.',
      );
    }
    if (
      [
        MetodoPagoCobranza.TARJETA,
        MetodoPagoCobranza.TRANSFERENCIA,
        MetodoPagoCobranza.CHEQUE,
      ].includes(dto.metodoPago) &&
      !dto.referencia?.trim()
    ) {
      throw new BadRequestException(
        `${dto.metodoPago} requiere una referencia bancaria o autorización.`,
      );
    }

    const resultado = await this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const lock = await em.query(
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
        [`COBRANZA:IDEMPOTENCIA:${empresaId}:${dto.claveIdempotencia}`],
      );
      if (Number(lock?.[0]?.resultado ?? -999) < 0) {
        throw new BadRequestException('No fue posible reservar la operación de cobranza.');
      }
      const previo = await em.findOne(PagoCobranza, {
        where: { empresaId, claveIdempotencia: dto.claveIdempotencia },
      });
      if (previo) {
        const creditoPrevio = await em.findOne(CreditoCliente, {
          where: { id: previo.creditoId, empresaId },
          relations: ['cuotas'],
        });
        return {
          pago: previo,
          credito: creditoPrevio,
          capitalAplicado: Number(previo.montoCapital),
          interesAplicado: Number(previo.montoInteres),
          ivaReclasificado: Number(previo.ivaReclasificado),
          idempotente: true,
        };
      }

      const credito = await em
        .createQueryBuilder(CreditoCliente, 'c')
        .setLock('pessimistic_write')
        .where('c.id=:id AND c.empresaId=:empresaId', {
          id: dto.creditoId,
          empresaId,
        })
        .getOne();
      if (!credito) throw new NotFoundException('Crédito no encontrado.');
      if (credito.estado === EstadoCredito.LIQUIDADO) {
        throw new BadRequestException('Este crédito ya está liquidado.');
      }
      if (credito.estado === EstadoCredito.CANCELADO) {
        throw new BadRequestException('Este crédito está cancelado.');
      }
      const saldoCredito = Number(credito.saldoPendiente);
      if (monto - saldoCredito > 0.009) {
        throw new BadRequestException(
          `El pago excede el saldo pendiente de ${saldoCredito.toFixed(2)}.`,
        );
      }

      const cuenta = await em.findOne(CuentaBancaria, {
        where: { id: dto.cuentaBancariaId, empresaId, activo: true },
      });
      if (!cuenta) {
        throw new NotFoundException(
          'La cuenta de cobranza no existe, está inactiva o pertenece a otra empresa.',
        );
      }

      const cuotas = await em.find(AmortizacionCuota, {
        where: { creditoId: credito.id },
        order: { numeroCuota: 'ASC' },
      });
      const pendientes = cuotas.filter((cuota) => cuota.estado !== EstadoCuota.PAGADA);
      if (dto.cuotaId) {
        const index = pendientes.findIndex((cuota) => cuota.id === dto.cuotaId);
        if (index < 0) {
          throw new BadRequestException(
            'La cuota indicada no pertenece al crédito o ya está pagada.',
          );
        }
        const [preferida] = pendientes.splice(index, 1);
        pendientes.unshift(preferida);
      }

      let restante = monto;
      let capitalAplicado = 0;
      let interesAplicado = 0;
      const afectadas: AmortizacionCuota[] = [];
      for (const cuota of pendientes) {
        if (restante <= 0.001) break;
        const saldoCuota = this.redondear(
          Number(cuota.montoCuota) - Number(cuota.montoPagado),
        );
        if (saldoCuota <= 0) continue;
        const aplicar = Math.min(restante, saldoCuota);
        const proporcionCapital =
          Number(cuota.montoCuota) > 0
            ? Number(cuota.montoCapital) / Number(cuota.montoCuota)
            : 1;
        const capital = this.redondear(aplicar * proporcionCapital);
        const interes = this.redondear(aplicar - capital);
        capitalAplicado = this.redondear(capitalAplicado + capital);
        interesAplicado = this.redondear(interesAplicado + interes);
        cuota.montoPagado = this.redondear(Number(cuota.montoPagado) + aplicar);
        cuota.fechaPago = fechaPago;
        cuota.estado =
          Number(cuota.montoPagado) + 0.001 >= Number(cuota.montoCuota)
            ? EstadoCuota.PAGADA
            : EstadoCuota.PAGO_PARCIAL;
        afectadas.push(cuota);
        restante = this.redondear(restante - aplicar);
      }
      if (restante > 0.001) {
        throw new BadRequestException('No fue posible aplicar todo el pago.');
      }
      await em.save(AmortizacionCuota, afectadas);

      credito.saldoPendiente = this.redondear(saldoCredito - monto);
      if (Number(credito.saldoPendiente) <= 0) {
        credito.saldoPendiente = 0;
        credito.estado = EstadoCredito.LIQUIDADO;
      } else {
        const conservaVencido = cuotas.some(
          (cuota) =>
            cuota.estado !== EstadoCuota.PAGADA &&
            new Date(cuota.fechaVencimiento).getTime() < Date.now(),
        );
        credito.estado = conservaVencido ? EstadoCredito.VENCIDO : EstadoCredito.ACTIVO;
      }
      await em.save(credito);
      interesAplicado = this.redondear(interesAplicado);
      capitalAplicado = this.redondear(monto - interesAplicado);

      let ivaReclasificado = 0;
      if (credito.ventaId && capitalAplicado > 0) {
        const venta = await em.findOne(Venta, {
          where: { id: credito.ventaId, empresaId },
        });
        if (venta && Number(venta.impuestoTotal) > 0) {
          const [acumulado] = await em.query(
            `SELECT COALESCE(SUM(montoCapital),0) capital,
                    COALESCE(SUM(ivaReclasificado),0) iva
               FROM pagos_cobranza
              WHERE empresaId=$1 AND creditoId=$2`,
            [empresaId, credito.id],
          );
          const ivaPendienteOriginal = this.redondear(
            (Number(venta.impuestoTotal) * Number(credito.capitalFinanciado)) /
              Number(credito.montoVenta),
          );
          const ivaRestante = Math.max(
            0,
            this.redondear(ivaPendienteOriginal - Number(acumulado?.iva ?? 0)),
          );
          const liquidaCapital =
            Number(acumulado?.capital ?? 0) + capitalAplicado + 0.009 >=
            Number(credito.capitalFinanciado);
          ivaReclasificado = liquidaCapital
            ? ivaRestante
            : Math.min(
                ivaRestante,
                this.redondear(
                  (capitalAplicado * Number(venta.impuestoTotal)) /
                    Number(credito.montoVenta),
                ),
              );
        }
      }

      const pagoRepo = em.getRepository(PagoCobranza);
      const pago = await pagoRepo.save(
        pagoRepo.create({
          creditoId: credito.id,
          cuotaId: dto.cuotaId ?? afectadas[0]?.id ?? null,
          empresaId,
          montoPagado: monto,
          montoCapital: capitalAplicado,
          montoInteres: interesAplicado,
          ivaReclasificado,
          metodoPago: dto.metodoPago,
          cuentaBancariaId: dto.cuentaBancariaId,
          referencia: dto.referencia?.trim() || null,
          fechaPago,
          claveIdempotencia: dto.claveIdempotencia,
          usuarioId: usuarioId ?? null,
          estadoContable: EstadoContableCobranza.PENDIENTE,
          estadoFiscal:
            credito.ventaId && capitalAplicado > 0
              ? EstadoFiscalCobranza.PENDIENTE_REP
              : EstadoFiscalCobranza.NO_REQUERIDO,
          complementoPagoId: null,
          ultimoErrorFiscal: null,
        }),
      );
      const movimiento = await this.tesoreria.registrarEnTransaccion(
        {
          cuentaBancariaId: dto.cuentaBancariaId,
          fecha: dto.fechaPago?.slice(0, 10) ?? fechaCalendarioNegocio(),
          tipo: TipoMovimiento.INGRESO,
          importe: monto,
          concepto: `Cobranza crédito ${credito.folio}`,
          origen: OrigenMovimiento.COBRANZA,
          referencia: dto.referencia,
          documentoId: pago.id,
          tipoDocumento: 'PAGO_COBRANZA',
          terceroId: credito.clienteId,
        },
        empresaId,
        usuarioId,
        em,
      );
      pago.movimientoTesoreriaId = movimiento?.id ?? null;

      /*
       * Se publica dentro de la transacción del pago, igual que el crédito: el
       * evento vive o muere con el asiento que lo originó. La llamada al
       * proveedor la hace después el despachador.
       */
      /*
       * Si el pago YA ocurrió en el externo, publicarlo lo mandaría de vuelta
       * y crearía allá una segunda transacción por el mismo dinero. Es el eco
       * clásico de una integración bidireccional, y aquí se corta en el único
       * sitio donde se puede cortar sin ambigüedad: en el origen.
       */
      if (!opciones?.idTransaccionExterna) {
        await this.cartera.pagoRegistrado(
          empresaId,
          {
            pagoId: pago.id,
            creditoId: credito.id,
            monto,
            fechaPago,
            referencia: pago.referencia,
          },
          em,
        );
      }

      const cuentaCobranza = await em.findOne(CuentaBancaria, {
        where: { id: dto.cuentaBancariaId, empresaId, activo: true },
      });
      if (!cuentaCobranza) {
        throw new BadRequestException(
          'La cuenta de cobranza no existe, está inactiva o pertenece a otra empresa.',
        );
      }
      if (cuentaCobranza.tipo === TipoCuentaBancaria.CAJA) {
        await this.caja.registrarEnTransaccion(
          em,
          {
            cuentaCajaId: cuentaCobranza.id,
            naturaleza: NaturalezaMovimientoCaja.ENTRADA,
            tipo: TipoMovimientoCaja.COBRANZA,
            importe: monto,
            concepto: `Cobranza crédito ${credito.folio}`,
            referencia: dto.referencia,
            documentoId: pago.id,
            tipoDocumento: 'PAGO_COBRANZA',
          },
          empresaId,
          usuarioId,
        );
      }

      const eventoContable = await this.asientos.encolarEnTransaccion(
        em,
        TipoAsiento.COBRANZA,
        {
          pagoId: pago.id,
          creditoId: credito.id,
          clienteId: credito.clienteId,
          fechaPago,
          empresaId,
          montoCapital: capitalAplicado,
          montoInteres: interesAplicado,
          ivaReclasificado,
          totalPagado: monto,
          cuentaBancariaId: dto.cuentaBancariaId,
        },
        empresaId,
        `COBRO-${pago.id.slice(0, 8)}`,
        pago.id,
      );
      pago.asientoPendienteId = eventoContable.id;
      await pagoRepo.save(pago);
      return {
        pago,
        credito,
        capitalAplicado,
        interesAplicado,
        ivaReclasificado,
        asientoPendienteId: eventoContable.id,
        idempotente: false,
      };
    });

    const advertencias: string[] = [];
    if (!resultado.idempotente && resultado.asientoPendienteId) {
      try {
        const asiento = await this.asientos.reintentarAhora(
          resultado.asientoPendienteId,
          empresaId,
        );
        await this.pagoRepo.update(
          { id: resultado.pago.id, empresaId },
          {
            estadoContable: asiento.generado
              ? EstadoContableCobranza.GENERADO
              : EstadoContableCobranza.PENDIENTE,
            polizaId: asiento.polizaId ?? null,
            asientoPendienteId: resultado.asientoPendienteId,
          },
        );
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `La cobranza ${resultado.pago.id} fue confirmada, pero el asiento quedó pendiente: ${mensaje}`,
        );
        advertencias.push(
          'El pago quedó registrado; la póliza contable se reintentará automáticamente.',
        );
      }
    }

    let complementoPago = null;
    try {
      complementoPago = await this.cfdi.crearComplementoPagoDesdeCobranza(
        resultado.pago.id,
        empresaId,
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `El pago ${resultado.pago.id} quedó registrado, pero su REP está pendiente: ${mensaje}`,
      );
      advertencias.push(
        'El pago quedó registrado; el Complemento de Pago 2.0 está pendiente de timbrado.',
      );
    }

    return {
      idempotente: resultado.idempotente,
      pago: await this.pagoRepo.findOne({
        where: { id: resultado.pago.id, empresaId },
      }),
      credito: await this.creditoRepo.findOne({
        where: { id: dto.creditoId, empresaId },
        relations: ['cuotas'],
      }),
      complementoPago,
      advertencias,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OBTENER PAGOS DE UN CRÉDITO
  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // CANCELAR PAGO
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Deshace una cobranza.
   *
   * El ERP no sabía hacer esto: un pago mal capturado se quedaba para siempre.
   * Y no es un caso raro —un cobro duplicado, un importe mal tecleado, un pago
   * que el banco devuelve— sino de los que ocurren cada semana.
   *
   * El pago NO se borra: se marca. Un movimiento de dinero que desaparece de
   * la base es justo lo que una auditoría no puede aceptar.
   *
   * `opciones.idTransaccionExterna` indica que la reversa ya ocurrió en el
   * registro externo, y entonces no se republica: mandarla de vuelta
   * intentaría reversar allá algo que allá ya está reversado.
   */
  async cancelarPago(
    pagoId: string,
    empresaId: string,
    datos: { motivo: string },
    usuarioId?: string,
    opciones?: { idTransaccionExterna?: string },
  ) {
    const motivo = datos?.motivo?.trim();
    if (!motivo || motivo.length < 5) {
      throw new BadRequestException(
        'La cancelación exige un motivo: es lo que explicará este movimiento dentro de seis meses.',
      );
    }

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const pago = await em
        .createQueryBuilder(PagoCobranza, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :pagoId AND p.empresaId = :empresaId', { pagoId, empresaId })
        .getOne();
      if (!pago) throw new NotFoundException('El pago no existe.');

      // Idempotente: repetir la cancelación no es un error.
      if (pago.cancelado) return { pago, idempotente: true };

      /*
       * Si ya se timbró el complemento de pago, cancelar aquí dejaría un CFDI
       * vivo respaldando un cobro que el ERP da por inexistente. La
       * cancelación fiscal va primero, y va por su camino.
       */
      if (pago.complementoPagoId || pago.estadoFiscal === EstadoFiscalCobranza.REP_GENERADO) {
        throw new ConflictException(
          'Este pago ya tiene complemento de pago timbrado. Cancela primero el CFDI; si no, quedaría un comprobante fiscal respaldando un cobro inexistente.',
        );
      }

      /*
       * Sólo el último pago vigente del crédito.
       *
       * El pago no guarda cómo se repartió entre cuotas, así que deshacerlo
       * exige rehacer el reparto hacia atrás, y eso sólo es exacto si no hubo
       * pagos posteriores. Cancelar en orden inverso es además como lo hace
       * cualquier caja: primero se deshace lo último.
       */
      /*
       * El `Not(id)` no sobra: la fecha que llega en la entidad viene
       * truncada a milisegundos y en la base tiene microsegundos, así que el
       * propio pago se contaba como posterior a sí mismo y NINGUNA
       * cancelación era posible. Excluirlo por id es exacto pase lo que pase
       * con la precisión.
       */
      const posteriores = await em.count(PagoCobranza, {
        where: {
          id: Not(pago.id),
          empresaId,
          creditoId: pago.creditoId,
          cancelado: false,
          fechaCreacion: MoreThanOrEqual(pago.fechaCreacion),
        },
      });
      if (posteriores > 0) {
        throw new ConflictException(
          `Este crédito tiene ${posteriores} pago(s) posterior(es) vigentes. Cancélalos primero: deshacer uno intermedio dejaría el reparto entre cuotas mal calculado.`,
        );
      }

      const credito = await em
        .createQueryBuilder(CreditoCliente, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.empresaId = :empresaId', {
          id: pago.creditoId,
          empresaId,
        })
        .getOne();
      if (!credito) throw new NotFoundException('Crédito no encontrado.');
      if (credito.estado === EstadoCredito.CANCELADO) {
        throw new ConflictException(
          'El crédito está cancelado; no tiene sentido devolverle saldo.',
        );
      }

      const monto = this.redondear(Number(pago.montoPagado));

      // Devolver el importe a las cuotas, de la última pagada hacia atrás.
      const cuotas = await em.find(AmortizacionCuota, {
        where: { creditoId: credito.id },
        order: { numeroCuota: 'DESC' },
      });
      let porDevolver = monto;
      const afectadas: AmortizacionCuota[] = [];
      for (const cuota of cuotas) {
        if (porDevolver <= 0.0001) break;
        const pagado = Number(cuota.montoPagado);
        if (pagado <= 0.0001) continue;
        const quitar = Math.min(pagado, porDevolver);
        cuota.montoPagado = this.redondear(pagado - quitar);
        cuota.estado =
          Number(cuota.montoPagado) + 0.001 >= Number(cuota.montoCuota)
            ? EstadoCuota.PAGADA
            : EstadoCuota.PENDIENTE;
        if (Number(cuota.montoPagado) <= 0.0001) cuota.fechaPago = null;
        porDevolver = this.redondear(porDevolver - quitar);
        afectadas.push(cuota);
      }
      if (afectadas.length) await em.save(AmortizacionCuota, afectadas);

      credito.saldoPendiente = this.redondear(
        Number(credito.saldoPendiente) + monto,
      );
      const hayVencidas = cuotas.some(
        (cuota) =>
          cuota.estado !== EstadoCuota.PAGADA &&
          new Date(cuota.fechaVencimiento).getTime() < Date.now(),
      );
      credito.estado = hayVencidas ? EstadoCredito.VENCIDO : EstadoCredito.ACTIVO;
      await em.save(credito);

      pago.cancelado = true;
      pago.fechaCancelacion = new Date();
      pago.motivoCancelacion = motivo.slice(0, 500);
      pago.canceladoPorId = usuarioId ?? null;
      pago.estadoContable = EstadoContableCobranza.REVERTIDO;
      await em.save(pago);

      // La reversa contable va como póliza propia; la original no se toca.
      await this.asientos.encolarEnTransaccion(
        em,
        TipoAsiento.CANCELACION_COBRANZA,
        {
          pagoId: pago.id,
          creditoId: credito.id,
          fechaCancelacion: pago.fechaCancelacion,
          empresaId,
          montoCapital: Number(pago.montoCapital),
          montoInteres: Number(pago.montoInteres),
          ivaReclasificado: Number(pago.ivaReclasificado),
          totalPagado: monto,
          cuentaBancariaId: pago.cuentaBancariaId ?? undefined,
          motivo,
        },
        empresaId,
        `CANCEL-${pago.id.slice(0, 8)}`,
        pago.id,
      );

      /*
       * El dinero también sale de la tesorería. Si el movimiento ya estaba
       * conciliado con el banco, tesorería se niega, y con razón: eso ya no es
       * un error de captura sino dinero que el banco vio entrar.
       */
      if (pago.movimientoTesoreriaId) {
        await this.tesoreria.cancelar(
          pago.movimientoTesoreriaId,
          `Cancelación de cobranza: ${motivo}`,
          empresaId,
          usuarioId,
        );
      }

      // Si la reversa nació fuera, ya está aplicada allá: republicarla
      // intentaría reversar dos veces la misma transacción.
      if (!opciones?.idTransaccionExterna) {
        await this.cartera.pagoRevertido(
          empresaId,
          {
            pagoId: pago.id,
            creditoId: credito.id,
            motivo,
            fecha: pago.fechaCancelacion,
          },
          em,
        );
      }

      return { pago, credito, montoDevuelto: monto, idempotente: false };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AJUSTE POR DEVOLUCIÓN REGISTRADA EN EL EXTERNO
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Baja el saldo de un crédito por una devolución que ocurrió en el registro
   * externo.
   *
   * NO es una devolución de venta y no pretende serlo. La devolución del ERP
   * mueve inventario, calcula costo y merma por condición, y emite lo fiscal;
   * para eso necesita saber QUÉ se devolvió, y el externo sólo sabe un
   * importe sobre un préstamo. Inventar los renglones sería peor que no
   * reflejar nada.
   *
   * Lo que sí es cierto y se refleja: el cliente debe menos. El efecto
   * financiero se aplica y queda **pendiente de nota de crédito**, anunciado
   * en la póliza, porque el CFDI sigue haciendo falta y esto no lo sustituye.
   */
  async ajustarPorDevolucionExterna(
    empresaId: string,
    datos: {
      creditoId: string;
      monto: number;
      idTransaccionExterna: string;
      fecha: string;
      cuentaDevolucionId: string;
    },
  ) {
    const monto = this.redondear(Number(datos.monto));
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El importe del ajuste debe ser mayor a cero.');
    }

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const credito = await em
        .createQueryBuilder(CreditoCliente, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.empresaId = :empresaId', {
          id: datos.creditoId,
          empresaId,
        })
        .getOne();
      if (!credito) throw new NotFoundException('Crédito no encontrado.');
      if (credito.estado === EstadoCredito.CANCELADO) {
        throw new ConflictException('El crédito está cancelado.');
      }

      /*
       * No se baja más de lo que se debe. Si el externo devolvió más que el
       * saldo vivo, el excedente es dinero a favor del cliente y eso es otra
       * operación —con su propia cuenta y su propio tratamiento—, no algo que
       * este ajuste deba inventar.
       */
      const saldo = Number(credito.saldoPendiente);
      const aplicar = Math.min(monto, saldo);
      if (aplicar <= 0.0001) {
        throw new ConflictException(
          'El crédito no tiene saldo pendiente sobre el que aplicar la devolución.',
        );
      }
      const excedente = this.redondear(monto - aplicar);

      // Se descuenta de las últimas cuotas hacia atrás, igual que una
      // devolución del ERP reduce lo que queda por pagar.
      const cuotas = await em.find(AmortizacionCuota, {
        where: { creditoId: credito.id },
        order: { numeroCuota: 'DESC' },
      });
      let porReducir = aplicar;
      const afectadas: AmortizacionCuota[] = [];
      for (const cuota of cuotas) {
        if (porReducir <= 0.0001) break;
        const resta = this.redondear(
          Number(cuota.montoCuota) - Number(cuota.montoPagado),
        );
        if (resta <= 0.0001) continue;
        const quitar = Math.min(resta, porReducir);
        cuota.montoCuota = this.redondear(Number(cuota.montoCuota) - quitar);
        cuota.estado =
          Number(cuota.montoPagado) + 0.001 >= Number(cuota.montoCuota)
            ? EstadoCuota.PAGADA
            : cuota.estado;
        porReducir = this.redondear(porReducir - quitar);
        afectadas.push(cuota);
      }
      if (afectadas.length) await em.save(AmortizacionCuota, afectadas);

      credito.saldoPendiente = this.redondear(saldo - aplicar);
      credito.montoAjustesDevolucion = this.redondear(
        Number(credito.montoAjustesDevolucion ?? 0) + aplicar,
      );
      credito.notas =
        `${credito.notas ?? ''}\nAjuste por devolución externa ${datos.idTransaccionExterna}: -${aplicar.toFixed(2)}. Pendiente de nota de crédito.`.trim();
      if (Number(credito.saldoPendiente) <= 0.0001) {
        credito.saldoPendiente = 0;
        credito.estado = EstadoCredito.LIQUIDADO;
      }
      await em.save(credito);

      await this.asientos.encolarEnTransaccion(
        em,
        TipoAsiento.AJUSTE_DEVOLUCION_EXTERNA,
        {
          creditoId: credito.id,
          idTransaccionExterna: datos.idTransaccionExterna,
          fecha: datos.fecha,
          empresaId,
          monto: aplicar,
          cuentaDevolucionId: datos.cuentaDevolucionId,
        },
        empresaId,
        `DEV-EXT-${datos.idTransaccionExterna}`,
        `devext:${datos.idTransaccionExterna}`,
      );

      // No se republica: la devolución ya está aplicada en el externo.
      return { credito, aplicado: aplicar, excedente };
    });
  }

  async obtenerPagosPorCredito(creditoId: string, empresaId: string) {
    const credito = await this.creditoRepo.findOne({
      where: { id: creditoId, empresaId },
    });
    if (!credito) throw new NotFoundException('Crédito no encontrado.');
    /*
     * Los cancelados se devuelven también, marcados. Esconderlos haría que un
     * estado de cuenta no explicara por qué el saldo no cuadra con la suma de
     * los pagos visibles; quien mira quiere ver que hubo un cobro y que se
     * deshizo.
     */
    return this.pagoRepo.find({
      where: { creditoId, empresaId },
      order: { fechaPago: 'DESC' },
    });
  }

  async obtenerPagosDelDia(empresaId: string, fecha?: string) {
    const dia = fecha ?? fechaCalendarioNegocio();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      throw new BadRequestException('La fecha debe usar el formato AAAA-MM-DD.');
    }
    return this.pagoRepo
      .createQueryBuilder('pago')
      .innerJoin(CreditoCliente, 'credito', 'credito.id = pago.creditoId')
      /*
       * Alias entrecomillados. `AS creditoId` sin comillas llega como
       * `creditoid` —Postgres pliega a minúsculas— y quien lee `fila.creditoId`
       * recibe undefined. En SQL Server el mismo alias conservaba el camelCase,
       * así que esto pasó la migración sin que nadie lo notara: el corte de
       * caja salía con columnas vacías en vez de con un error.
       */
      .select([
        'pago.id AS id',
        'pago.creditoId AS "creditoId"',
        'pago.fechaPago AS "fechaPago"',
        'pago.montoPagado AS "montoPagado"',
        'pago.metodoPago AS "metodoPago"',
        'pago.referencia AS referencia',
        'pago.estadoContable AS "estadoContable"',
        'credito.folio AS "creditoFolio"',
        'credito.clienteId AS "clienteId"',
      ])
      .where('pago.empresaId = :empresaId', { empresaId })
      .andWhere('pago.fechaPago = :dia', { dia })
      .orderBy('pago.fechaCreacion', 'ASC')
      .getRawMany();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR CUOTAS VENCIDAS + ENVIAR ALERTAS EMAIL
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Marca lo vencido y pasa a VENCIDO los créditos afectados.
   *
   * Admite un `manager` para poder ejercitarlo dentro de una transacción de
   * prueba: sin él, el proceso trabaja sobre lo ya confirmado y no hay forma de
   * comprobar la mora sin dejar mora inventada en la cartera.
   */
  async actualizarVencidos(empresaId: string, manager?: EntityManager) {
    const hoy = new Date();
    const cuotaRepo = manager
      ? manager.getRepository(AmortizacionCuota)
      : this.cuotaRepo;
    const creditoRepo = manager
      ? manager.getRepository(CreditoCliente)
      : this.creditoRepo;

    // Marcar cuotas como VENCIDA si pasó la fecha
    const cuotasParaVencer = await cuotaRepo
      .createQueryBuilder('cu')
      .leftJoinAndSelect('cu.credito', 'c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('cu.estado IN (:...estados)', {
        estados: [EstadoCuota.PENDIENTE, EstadoCuota.PAGO_PARCIAL],
      })
      .andWhere('cu.fechaVencimiento < :hoy', { hoy })
      .getMany();

    for (const cuota of cuotasParaVencer) {
      cuota.estado = EstadoCuota.VENCIDA;
    }
    if (cuotasParaVencer.length > 0) {
      await cuotaRepo.save(cuotasParaVencer);
    }

    // Actualizar estado del crédito a VENCIDO si tiene cuotas vencidas
    const creditosConVencidas = [
      ...new Set(cuotasParaVencer.map((c) => c.creditoId)),
    ];
    for (const creditoId of creditosConVencidas) {
      await creditoRepo.update(
        { id: creditoId, estado: EstadoCredito.ACTIVO },
        { estado: EstadoCredito.VENCIDO },
      );
    }

    /*
     * Y el camino de vuelta, que no existía.
     *
     * Esto sólo escalaba: marcaba VENCIDO y nunca desmarcaba. El único modo de
     * volver a ACTIVO era `registrarPago`, que sí recalcula bien. Cualquier
     * otra forma de dejar de estar en mora —una cuota reprogramada, una fecha
     * corregida, una devolución que baja el saldo— dejaba al cliente en VENCIDO
     * para siempre.
     *
     * No es cosmético: la disponibilidad calcula la mora por fecha en tiempo
     * real y deja comprar, pero el ESTADO es lo que ven las pantallas, lo que
     * suma la cartera vencida y lo que alimenta las provisiones. Un cliente al
     * corriente contado como moroso distorsiona a quién se le vuelve a prestar.
     *
     * Se limita a los que están en VENCIDO: no toca LIQUIDADO ni CANCELADO, que
     * son estados finales y no se reabren por no tener cuotas vencidas.
     */
    const alCorriente = await creditoRepo
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.estado = :vencido', { vencido: EstadoCredito.VENCIDO })
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM amortizacion_cuotas q
            WHERE q.creditoid = c.id
              AND q.estado <> :pagada
              AND q.fechavencimiento < :hoy)`,
        { pagada: EstadoCuota.PAGADA, hoy },
      )
      .getRawMany<{ id: string }>();

    for (const { id } of alCorriente) {
      await creditoRepo.update(
        { id, estado: EstadoCredito.VENCIDO },
        { estado: EstadoCredito.ACTIVO },
      );
    }

    // Las alertas sólo salen en la corrida de verdad: mandar correos de mora
    // desde una prueba que se va a deshacer sería avisarle a un cliente de una
    // deuda que nunca existió.
    if (!manager) {
      this.enviarAlertasVencimiento(empresaId, hoy).catch((e) =>
        console.error('[Email] Alertas vencimiento:', e?.message),
      );
    }

    return {
      actualizadas: cuotasParaVencer.length,
      regularizados: alCorriente.length,
    };
  }

  // ── Alertas de vencimiento y recordatorios preventivos ─────────────────
  private async enviarAlertasVencimiento(empresaId: string, hoy: Date) {
    // Cuotas que vencen en exactamente 3 días → recordatorio preventivo
    const en3Dias = new Date(hoy);
    en3Dias.setDate(en3Dias.getDate() + 3);
    const en3DiasStr = en3Dias.toISOString().split('T')[0];

    const cuotasProximas = await this.cuotaRepo
      .createQueryBuilder('cu')
      .leftJoinAndSelect('cu.credito', 'c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('cu.estado IN (:...estados)', {
        estados: [EstadoCuota.PENDIENTE, EstadoCuota.PAGO_PARCIAL],
      })
      .andWhere(`CAST(cu.fechaVencimiento AS DATE) = :fecha`, {
        fecha: en3DiasStr,
      })
      .getMany();

    for (const cuota of cuotasProximas) {
      const cliente = await this.buscarCliente(
        cuota.credito.clienteId,
        empresaId,
      );
      if (!cliente?.email) continue;
      this.notificaciones
        .notificarRecordatorioCuota(cuota, cuota.credito, cliente)
        .catch((e) => console.error('[Email] Recordatorio cuota:', e?.message));
    }

    // Cuotas vencidas hace 1, 3, 7, 15 o 30 días → alerta de morosidad
    const diasAlerta = [1, 3, 7, 15, 30];
    for (const dias of diasAlerta) {
      const fechaVenc = new Date(hoy);
      fechaVenc.setDate(fechaVenc.getDate() - dias);
      const fechaStr = fechaVenc.toISOString().split('T')[0];

      const vencidas = await this.cuotaRepo
        .createQueryBuilder('cu')
        .leftJoinAndSelect('cu.credito', 'c')
        .where('c.empresaId = :empresaId', { empresaId })
        .andWhere('cu.estado = :estado', { estado: EstadoCuota.VENCIDA })
        .andWhere(`CAST(cu.fechaVencimiento AS DATE) = :fecha`, {
          fecha: fechaStr,
        })
        .getMany();

      for (const cuota of vencidas) {
        const cliente = await this.buscarCliente(
          cuota.credito.clienteId,
          empresaId,
        );
        if (!cliente?.email) continue;
        this.notificaciones
          .notificarCuotaVencida(cuota, cuota.credito, cliente, dias)
          .catch((e) =>
            console.error(`[Email] Cuota vencida ${dias}d:`, e?.message),
          );
      }
    }
  }

  private async buscarCliente(clienteId: string, empresaId: string) {
    const rows = await this.dataSource
      .query(
        `SELECT id, nombre, email, rfc FROM clientes WHERE id = $1 AND empresaId = $2`,
        [clienteId, empresaId],
      )
      .catch(() => []);
    return rows?.[0] ?? null;
  }

  private redondear(valor: number) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }
}
