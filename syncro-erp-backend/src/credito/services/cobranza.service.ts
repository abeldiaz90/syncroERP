import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  CreditoCliente,
  EstadoCredito,
} from '../entities/credito-cliente.entity';
import {
  AmortizacionCuota,
  EstadoCuota,
} from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { CuentaBancaria } from '../entities/cuenta-bancaria.entity';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { Venta } from '../../ventas/entities/venta.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';

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
    private readonly asientos: AsientosPendientesService,
    private readonly notificaciones: NotificacionesService,
    private readonly tesoreria: TesoreriaService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // REGISTRAR PAGO / ABONO
  // ──────────────────────────────────────────────────────────────────────────
  async registrarPago(dto: {
    creditoId: string;
    cuotaId?: string;
    montoPagado: number;
    metodoPago: string;
    cuentaBancariaId?: string;
    referencia?: string;
    fechaPago?: string;
    empresaId: string;
    usuarioId?: string;
  }) {
    const monto = Number(dto.montoPagado);
    if (!Number.isFinite(monto) || monto <= 0)
      throw new BadRequestException('El monto debe ser mayor a cero.');

    const fechaPago = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    if (Number.isNaN(fechaPago.getTime())) {
      throw new BadRequestException('La fecha de pago no es válida.');
    }

    const resultado = await this.dataSource.transaction(async (em) => {
      const credito = await em
        .createQueryBuilder(CreditoCliente, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.empresaId = :empresaId', {
          id: dto.creditoId,
          empresaId: dto.empresaId,
        })
        .getOne();
      if (!credito) throw new NotFoundException('Crédito no encontrado.');
      if (credito.estado === EstadoCredito.LIQUIDADO)
        throw new BadRequestException('Este crédito ya está liquidado.');
      if (credito.estado === EstadoCredito.CANCELADO)
        throw new BadRequestException('Este crédito está cancelado.');

      const saldoCredito = Number(credito.saldoPendiente);
      if (monto - saldoCredito > 0.009) {
        throw new BadRequestException(
          `El pago excede el saldo pendiente de ${saldoCredito.toFixed(2)}.`,
        );
      }

      if (dto.cuentaBancariaId) {
        const cuenta = await em.findOne(CuentaBancaria, {
          where: {
            id: dto.cuentaBancariaId,
            empresaId: dto.empresaId,
            activo: true,
          },
        });
        if (!cuenta) {
          throw new NotFoundException(
            'La cuenta de cobranza no existe, está inactiva o pertenece a otra empresa.',
          );
        }
      }

      const cuotasPendientes = await em.find(AmortizacionCuota, {
        where: { creditoId: credito.id },
        order: { numeroCuota: 'ASC' },
      });
      const pendientes = cuotasPendientes.filter(
        (c) => c.estado !== EstadoCuota.PAGADA,
      );
      if (dto.cuotaId) {
        const idx = pendientes.findIndex((c) => c.id === dto.cuotaId);
        if (idx < 0) {
          throw new BadRequestException(
            'La cuota indicada no pertenece al crédito o ya está pagada.',
          );
        }
        const [preferida] = pendientes.splice(idx, 1);
        pendientes.unshift(preferida);
      }

      let restante = monto;
      let capitalAplicado = 0;
      let interesAplicado = 0;
      const afectadas: AmortizacionCuota[] = [];
      for (const cuota of pendientes) {
        if (restante <= 0.001) break;
        const saldoCuota = Number(cuota.montoCuota) - Number(cuota.montoPagado);
        if (saldoCuota <= 0) continue;
        const aplicar = Math.min(restante, saldoCuota);
        const proporcionCapital =
          Number(cuota.montoCuota) > 0
            ? Number(cuota.montoCapital) / Number(cuota.montoCuota)
            : 1;
        const capital = Math.round(aplicar * proporcionCapital * 100) / 100;
        const interes = Math.round((aplicar - capital) * 100) / 100;
        capitalAplicado += capital;
        interesAplicado += interes;

        cuota.montoPagado =
          Math.round((Number(cuota.montoPagado) + aplicar) * 100) / 100;
        cuota.fechaPago = fechaPago;
        cuota.estado =
          Number(cuota.montoPagado) + 0.001 >= Number(cuota.montoCuota)
            ? EstadoCuota.PAGADA
            : EstadoCuota.PAGO_PARCIAL;
        afectadas.push(cuota);
        restante = Math.round((restante - aplicar) * 100) / 100;
      }
      if (restante > 0.001) {
        throw new BadRequestException('No fue posible aplicar todo el pago.');
      }

      await em.save(AmortizacionCuota, afectadas);
      credito.saldoPendiente = Math.round((saldoCredito - monto) * 100) / 100;
      if (Number(credito.saldoPendiente) <= 0) {
        credito.saldoPendiente = 0;
        credito.estado = EstadoCredito.LIQUIDADO;
      } else {
        const conservaVencido = cuotasPendientes.some(
          (cuota) =>
            cuota.estado !== EstadoCuota.PAGADA &&
            new Date(cuota.fechaVencimiento).getTime() <
              new Date(new Date().toISOString().slice(0, 10)).getTime(),
        );
        credito.estado = conservaVencido
          ? EstadoCredito.VENCIDO
          : EstadoCredito.ACTIVO;
      }
      await em.save(credito);

      // Ajustar el último componente por cualquier centavo de redondeo.
      interesAplicado = Math.round(interesAplicado * 100) / 100;
      capitalAplicado = Math.round((monto - interesAplicado) * 100) / 100;

      let ivaReclasificado = 0;
      if (credito.ventaId && capitalAplicado > 0) {
        const venta = await em.findOne(Venta, {
          where: { id: credito.ventaId, empresaId: dto.empresaId },
        });
        if (venta && Number(venta.impuestoTotal) > 0) {
          const [acumulado] = await em.query(
            `SELECT
               COALESCE(SUM(montoCapital), 0) capital,
               COALESCE(SUM(ivaReclasificado), 0) iva
             FROM pagos_cobranza
             WHERE empresaId = @0 AND creditoId = @1`,
            [dto.empresaId, credito.id],
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

      const pago = await em.save(
        em.create(PagoCobranza, {
          creditoId: credito.id,
          cuotaId: dto.cuotaId ?? afectadas[0]?.id,
          empresaId: dto.empresaId,
          montoPagado: monto,
          montoCapital: capitalAplicado,
          montoInteres: interesAplicado,
          ivaReclasificado,
          metodoPago: dto.metodoPago,
          cuentaBancariaId: dto.cuentaBancariaId,
          referencia: dto.referencia,
          fechaPago,
        }),
      );
      if (dto.cuentaBancariaId) {
        await this.tesoreria.registrarEnTransaccion(
          {
            cuentaBancariaId: dto.cuentaBancariaId,
            fecha: fechaPago.toISOString().slice(0, 10),
            tipo: TipoMovimiento.INGRESO,
            importe: monto,
            concepto: `Cobranza crédito ${credito.folio}`,
            origen: OrigenMovimiento.COBRANZA,
            referencia: dto.referencia,
            documentoId: pago.id,
            tipoDocumento: 'PAGO_COBRANZA',
            terceroId: credito.clienteId,
          },
          dto.empresaId,
          dto.usuarioId,
          em,
        );
      }
      return {
        pago,
        credito,
        capitalAplicado,
        interesAplicado,
        ivaReclasificado,
      };
    });

    await this.asientos.intentar(
      TipoAsiento.COBRANZA,
      {
        pagoId: resultado.pago.id,
        creditoId: dto.creditoId,
        clienteId: resultado.credito.clienteId,
        fechaPago,
        empresaId: dto.empresaId,
        montoCapital: resultado.capitalAplicado,
        montoInteres: resultado.interesAplicado,
        ivaReclasificado: resultado.ivaReclasificado,
        totalPagado: monto,
        cuentaBancariaId: dto.cuentaBancariaId,
      },
      dto.empresaId,
      `COBRO-${resultado.pago.id.slice(0, 8)}`,
      resultado.pago.id,
    );

    return {
      pago: resultado.pago,
      credito: await this.creditoRepo.findOne({
        where: { id: dto.creditoId, empresaId: dto.empresaId },
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
    const creditosConVencidas = [
      ...new Set(cuotasParaVencer.map((c) => c.creditoId)),
    ];
    for (const creditoId of creditosConVencidas) {
      await this.creditoRepo.update(
        { id: creditoId, estado: EstadoCredito.ACTIVO },
        { estado: EstadoCredito.VENCIDO },
      );
    }

    // Enviar alertas de email en segundo plano
    this.enviarAlertasVencimiento(empresaId, hoy).catch((e) =>
      console.error('[Email] Alertas vencimiento:', e?.message),
    );

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
        `SELECT id, nombre, email, rfc FROM clientes WHERE id = @0 AND empresaId = @1`,
        [clienteId, empresaId],
      )
      .catch(() => []);
    return rows?.[0] ?? null;
  }

  private redondear(valor: number) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }
}
