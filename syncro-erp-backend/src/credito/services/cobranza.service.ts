import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditoCliente, EstadoCredito } from '../entities/credito-cliente.entity';
import { AmortizacionCuota, EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';

@Injectable()
export class CobranzaService {
  constructor(
    @InjectRepository(CreditoCliente)
    private readonly creditoRepo: Repository<CreditoCliente>,
    @InjectRepository(AmortizacionCuota)
    private readonly cuotaRepo: Repository<AmortizacionCuota>,
    @InjectRepository(PagoCobranza)
    private readonly pagoRepo: Repository<PagoCobranza>,
    private readonly dataSource: DataSource,
    private readonly motorContable: MotorContableService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // REGISTRAR PAGO / ABONO
  // ──────────────────────────────────────────────────────────────────────────
  async registrarPago(dto: {
    creditoId:        string;
    cuotaId?:         string;
    montoPagado:      number;
    metodoPago:       string;
    cuentaBancariaId?: string;
    referencia?:      string;
    fechaPago?:       string;
    empresaId:        string;
  }) {
    if (dto.montoPagado <= 0)
      throw new BadRequestException('El monto debe ser mayor a cero.');

    const credito = await this.creditoRepo.findOne({
      where: { id: dto.creditoId, empresaId: dto.empresaId },
      relations: ['cuotas'],
    });
    if (!credito) throw new NotFoundException('Crédito no encontrado.');
    if (credito.estado === EstadoCredito.LIQUIDADO)
      throw new BadRequestException('Este crédito ya está liquidado.');
    if (credito.estado === EstadoCredito.CANCELADO)
      throw new BadRequestException('Este crédito está cancelado.');

    const fechaPago = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    let montoRestante = dto.montoPagado;

    // Aplicar el pago a las cuotas pendientes en orden
    const cuotasPendientes = credito.cuotas
      .filter(c => c.estado !== EstadoCuota.PAGADA)
      .sort((a, b) => a.numeroCuota - b.numeroCuota);

    // Si viene cuotaId específica, poner esa primera
    if (dto.cuotaId) {
      const idx = cuotasPendientes.findIndex(c => c.id === dto.cuotaId);
      if (idx > 0) {
        const [cuota] = cuotasPendientes.splice(idx, 1);
        cuotasPendientes.unshift(cuota);
      }
    }

    const cuotasAfectadas: AmortizacionCuota[] = [];

    for (const cuota of cuotasPendientes) {
      if (montoRestante <= 0) break;
      const saldoCuota = cuota.montoCuota - cuota.montoPagado;
      const aplicar    = Math.min(montoRestante, saldoCuota);

      cuota.montoPagado = Math.round((cuota.montoPagado + aplicar) * 100) / 100;
      montoRestante     = Math.round((montoRestante - aplicar) * 100) / 100;

      cuota.estado = cuota.montoPagado >= cuota.montoCuota
        ? EstadoCuota.PAGADA
        : EstadoCuota.PAGO_PARCIAL;

      cuotasAfectadas.push(cuota);
    }

    // ── Todo en una transacción para evitar estados inconsistentes ──
    await this.dataSource.transaction(async (em) => {
      await em.save(AmortizacionCuota, cuotasAfectadas);

      credito.saldoPendiente = Math.round(
        (credito.saldoPendiente - dto.montoPagado) * 100
      ) / 100;
      if (credito.saldoPendiente <= 0) {
        credito.saldoPendiente = 0;
        credito.estado         = EstadoCredito.LIQUIDADO;
      }
      await em.save(CreditoCliente, credito);

      // Insert directo — evita problemas de tipado de TypeORM save
      await this.dataSource.query(
        `INSERT INTO pagos_cobranza
          (creditoId, cuotaId, empresaId, montoPagado, metodoPago,
           cuentaBancariaId, referencia, fechaPago)
         VALUES (@0, @1, @2, @3, @4, @5, @6, @7)`,
        [
          dto.creditoId,
          dto.cuotaId ?? cuotasAfectadas[0]?.id ?? null,
          dto.empresaId,
          dto.montoPagado,
          dto.metodoPago,
          dto.cuentaBancariaId ?? null,
          dto.referencia       ?? null,
          fechaPago,
        ]
      );
    });

    // Recuperar el pago recién insertado para el motor contable
    const [pagoGuardado] = await this.dataSource.query(
      `SELECT TOP 1 * FROM pagos_cobranza
       WHERE creditoId = @0 ORDER BY fechaPago DESC`,
      [dto.creditoId]
    );

    // Asiento contable — no bloquea
    const capitalAplicado  = cuotasAfectadas.reduce((s, c) => s + c.montoCapital, 0);
    const interesAplicado  = cuotasAfectadas.reduce((s, c) => s + c.montoInteres, 0);
    this.motorContable.generarAsientoDeCobranza({
      pagoId:          pagoGuardado.id,
      creditoId:       dto.creditoId,
      clienteId:       credito.clienteId,
      fechaPago,
      empresaId:       dto.empresaId,
      montoCapital:    capitalAplicado,
      montoInteres:    interesAplicado,
      totalPagado:     dto.montoPagado,
      cuentaBancariaId: dto.cuentaBancariaId,
    }).catch(e => console.error('[MotorContable] Cobranza:', e?.message));

    return {
      pago:    pagoGuardado,
      credito: await this.creditoRepo.findOne({
        where: { id: dto.creditoId },
        relations: ['cuotas'],
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OBTENER PAGOS DE UN CRÉDITO
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerPagosPorCredito(creditoId: string, empresaId: string) {
    const credito = await this.creditoRepo.findOne({
      where: { id: creditoId, empresaId },
    });
    if (!credito) throw new NotFoundException('Crédito no encontrado.');
    return this.pagoRepo.find({
      where: { creditoId },
      order: { fechaPago: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR CUOTAS VENCIDAS + ENVIAR ALERTAS EMAIL
  // ──────────────────────────────────────────────────────────────────────────
  async actualizarVencidos(empresaId: string) {
    const hoy = new Date();

    // Marcar cuotas como VENCIDA si pasó la fecha
    const cuotasParaVencer = await this.cuotaRepo
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
      await this.cuotaRepo.save(cuotasParaVencer);
    }

    // Actualizar estado del crédito a VENCIDO si tiene cuotas vencidas
    const creditosConVencidas = [...new Set(cuotasParaVencer.map(c => c.creditoId))];
    for (const creditoId of creditosConVencidas) {
      await this.creditoRepo.update(
        { id: creditoId, estado: EstadoCredito.ACTIVO },
        { estado: EstadoCredito.VENCIDO }
      );
    }

    // Enviar alertas de email en segundo plano
    this.enviarAlertasVencimiento(empresaId, hoy)
      .catch(e => console.error('[Email] Alertas vencimiento:', e?.message));

    return { actualizadas: cuotasParaVencer.length };
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
      .andWhere(`CAST(cu.fechaVencimiento AS DATE) = :fecha`, { fecha: en3DiasStr })
      .getMany();

    for (const cuota of cuotasProximas) {
      const cliente = await this.buscarCliente(cuota.credito.clienteId, empresaId);
      if (!cliente?.email) continue;
      this.notificaciones.notificarRecordatorioCuota(cuota, cuota.credito, cliente)
        .catch(e => console.error('[Email] Recordatorio cuota:', e?.message));
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
        .andWhere(`CAST(cu.fechaVencimiento AS DATE) = :fecha`, { fecha: fechaStr })
        .getMany();

      for (const cuota of vencidas) {
        const cliente = await this.buscarCliente(cuota.credito.clienteId, empresaId);
        if (!cliente?.email) continue;
        this.notificaciones.notificarCuotaVencida(cuota, cuota.credito, cliente, dias)
          .catch(e => console.error(`[Email] Cuota vencida ${dias}d:`, e?.message));
      }
    }
  }

  private async buscarCliente(clienteId: string, empresaId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, nombre, email, rfc FROM clientes WHERE id = @0 AND empresaId = @1`,
      [clienteId, empresaId],
    ).catch(() => []);
    return rows?.[0] ?? null;
  }
}