import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditoCliente, TipoCredito, EstadoCredito } from '../entities/credito-cliente.entity';
import { AmortizacionCuota, EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';

export interface ResultadoAmortizacion {
  numeroCuota:      number;
  fechaVencimiento: Date;
  montoCapital:     number;
  montoInteres:     number;
  montoCuota:       number;
  saldoRestante:    number;
}

export interface SimularCreditoDto {
  capital:            number;
  numeroCuotas:       number;
  tasaInteresMensual: number;
  sinInteres:         boolean;
  fechaInicio?:       string;
}

@Injectable()
export class CreditosService {
  constructor(
    @InjectRepository(CreditoCliente)
    private readonly creditoRepo: Repository<CreditoCliente>,
    @InjectRepository(AmortizacionCuota)
    private readonly cuotaRepo: Repository<AmortizacionCuota>,
    @InjectRepository(PagoCobranza)
    private readonly pagoRepo: Repository<PagoCobranza>,
    private readonly dataSource: DataSource,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CÁLCULO DE AMORTIZACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  calcularAmortizacion(dto: SimularCreditoDto): ResultadoAmortizacion[] {
    const { capital, numeroCuotas, tasaInteresMensual, sinInteres } = dto;
    const inicio = dto.fechaInicio ? new Date(dto.fechaInicio) : new Date();
    const tabla: ResultadoAmortizacion[] = [];

    if (sinInteres || tasaInteresMensual === 0) {
      // SIN INTERÉS: cuotas iguales de capital puro
      const cuotaCapital = this.redondear(capital / numeroCuotas);
      let saldo = capital;
      for (let i = 1; i <= numeroCuotas; i++) {
        const capEsta = i === numeroCuotas ? this.redondear(saldo) : cuotaCapital;
        saldo = this.redondear(saldo - capEsta);
        tabla.push({
          numeroCuota:      i,
          fechaVencimiento: this.sumarMeses(inicio, i),
          montoCapital:     capEsta,
          montoInteres:     0,
          montoCuota:       capEsta,
          saldoRestante:    saldo,
        });
      }
    } else {
      // CON INTERÉS: método francés
      const r = tasaInteresMensual / 100;
      const cuotaFija = this.redondear(capital * r / (1 - Math.pow(1 + r, -numeroCuotas)));
      let saldo = capital;
      for (let i = 1; i <= numeroCuotas; i++) {
        const interes  = this.redondear(saldo * r);
        let   capital_ = this.redondear(cuotaFija - interes);
        let   cuota    = cuotaFija;
        if (i === numeroCuotas) {
          capital_ = this.redondear(saldo);
          cuota    = this.redondear(capital_ + interes);
        }
        saldo = this.redondear(saldo - capital_);
        tabla.push({
          numeroCuota:      i,
          fechaVencimiento: this.sumarMeses(inicio, i),
          montoCapital:     capital_,
          montoInteres:     interes,
          montoCuota:       cuota,
          saldoRestante:    Math.max(0, saldo),
        });
      }
    }
    return tabla;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR CRÉDITO
  // ──────────────────────────────────────────────────────────────────────────
  async crearCredito(dto: {
    empresaId:                string;
    clienteId:                string;
    ventaId?:                 string;
    tipoCredito:              TipoCredito;
    montoVenta:               number;
    enganche:                 number;
    numeroCuotas:             number;
    tasaInteresMensual:       number;
    sinInteres:               boolean;
    fechaInicio?:             string;
    metodoPagoEnganche?:      string;
    cuentaBancariaEngancheId?: string;
    notas?:                   string;
  }) {
    const capitalFinanciado = this.redondear(dto.montoVenta - dto.enganche);
    if (capitalFinanciado <= 0)
      throw new BadRequestException('El enganche no puede ser mayor al monto de la venta.');

    const tabla         = this.calcularAmortizacion({
      capital:            capitalFinanciado,
      numeroCuotas:       dto.numeroCuotas,
      tasaInteresMensual: dto.tasaInteresMensual,
      sinInteres:         dto.sinInteres,
      fechaInicio:        dto.fechaInicio,
    });
    const totalIntereses = this.redondear(tabla.reduce((s, r) => s + r.montoInteres, 0));
    const montoTotal     = this.redondear(capitalFinanciado + totalIntereses);
    const ultimaCuota    = tabla[tabla.length - 1];

    const creditoGuardado = await this.dataSource.transaction(async (em) => {
      const folio = await this.generarFolio(dto.empresaId);

      const credito = em.create(CreditoCliente, {
        empresaId:                dto.empresaId,
        folio,
        clienteId:                dto.clienteId,
        ventaId:                  dto.ventaId,
        tipoCredito:              dto.tipoCredito,
        montoVenta:               dto.montoVenta,
        enganche:                 dto.enganche,
        capitalFinanciado,
        totalIntereses,
        montoTotal,
        saldoPendiente:           montoTotal,
        numeroCuotas:             dto.numeroCuotas,
        tasaInteresMensual:       dto.tasaInteresMensual,
        sinInteres:               dto.sinInteres,
        fechaInicio:              dto.fechaInicio ? new Date(dto.fechaInicio) : new Date(),
        fechaVencimiento:         ultimaCuota.fechaVencimiento,
        metodoPagoEnganche:       dto.metodoPagoEnganche,
        cuentaBancariaEngancheId: dto.cuentaBancariaEngancheId,
        estado:                   EstadoCredito.ACTIVO,
        notas:                    dto.notas,
      });
      const guardado = await em.save(credito);

      const cuotas = tabla.map(t => em.create(AmortizacionCuota, {
        creditoId:        guardado.id,
        numeroCuota:      t.numeroCuota,
        fechaVencimiento: t.fechaVencimiento,
        montoCapital:     t.montoCapital,
        montoInteres:     t.montoInteres,
        montoCuota:       t.montoCuota,
        saldoRestante:    t.saldoRestante,
        montoPagado:      0,
        estado:           EstadoCuota.PENDIENTE,
      }));
      await em.save(cuotas);

      return em.findOne(CreditoCliente, {
        where: { id: guardado.id },
        relations: ['cuotas'],
      });
    });

    // ── Email de crédito otorgado al cliente ────────────────────────────────
    // Se manda aquí (no en VentasService) para incluir la tabla de cuotas
    this.enviarEmailCredito(creditoGuardado!, dto.empresaId)
      .catch(e => console.error('[Email] Crédito:', e?.message));

    return creditoGuardado;
  }

  // ── Carga el cliente y manda el email de crédito ───────────────────────
  private async enviarEmailCredito(credito: CreditoCliente, empresaId: string) {
    try {
      const clientes = await this.dataSource.query(
        `SELECT id, nombre, email, rfc FROM clientes WHERE id = @0 AND empresaId = @1`,
        [credito.clienteId, empresaId],
      );
      const cliente = clientes?.[0];
      if (!cliente?.email) return;

      // Obtener venta si existe
      let venta: any = null;
      if (credito.ventaId) {
        const ventas = await this.dataSource.query(
          `SELECT id, folio, total, metodoPago FROM ventas WHERE id = @0`,
          [credito.ventaId],
        );
        venta = ventas?.[0] ?? null;
      }

      await this.notificaciones.notificarCreditoOtorgado(venta, credito, cliente);
    } catch (e: any) {
      console.error('[Email] Crédito load:', e?.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerTodos(empresaId: string, estado?: EstadoCredito) {
    const qb = this.creditoRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.cuotas', 'cuotas')
      .where('c.empresaId = :empresaId', { empresaId })
      .orderBy('c.fechaCreacion', 'DESC');
    if (estado) qb.andWhere('c.estado = :estado', { estado });
    const creditos = await qb.getMany();
    return this.enriquecerConClientes(creditos);
  }

  private async enriquecerConClientes(creditos: CreditoCliente[]): Promise<any[]> {
    if (!creditos.length) return creditos;
    const ids = [...new Set(creditos.map(c => c.clienteId).filter(Boolean))];
    if (!ids.length) return creditos;
    const clientes = await this.dataSource.query(
      `SELECT id, nombre, rfc FROM clientes WHERE id IN (${ids.map((_,i)=>`@${i}`).join(',')})`,
      ids
    ).catch(() => []);
    const clienteMap = new Map(clientes.map((cl: any) => [cl.id, cl]));
    return creditos.map(c => ({ ...c, cliente: clienteMap.get(c.clienteId) ?? null }));
  }

  async obtenerPorId(id: string, empresaId: string) {
    const c = await this.creditoRepo.findOne({
      where: { id, empresaId },
      relations: ['cuotas', 'pagos'],
    });
    if (!c) throw new NotFoundException('Crédito no encontrado');
    return c;
  }

  async obtenerPorCliente(clienteId: string, empresaId: string) {
    return this.creditoRepo.find({
      where: { clienteId, empresaId },
      relations: ['cuotas'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CARTERA VENCIDA (aging report)
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerCarteraVencida(empresaId: string) {
    const hoy    = new Date();
    const cuotas = await this.cuotaRepo.createQueryBuilder('cu')
      .leftJoinAndSelect('cu.credito', 'c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('cu.estado IN (:...estados)', {
        estados: [EstadoCuota.PENDIENTE, EstadoCuota.PAGO_PARCIAL, EstadoCuota.VENCIDA],
      })
      .orderBy('cu.fechaVencimiento', 'ASC')
      .getMany();

    const aging = {
      corriente: [] as any[], d30: [] as any[],
      d60: [] as any[], d90: [] as any[], d90mas: [] as any[],
    };

    cuotas.forEach(cu => {
      const dias      = Math.floor((hoy.getTime() - new Date(cu.fechaVencimiento).getTime()) / 86400000);
      const pendiente = cu.montoCuota - cu.montoPagado;
      const item      = { cuota: cu, diasVencida: dias, montoPendiente: pendiente };
      if (dias <= 0)       aging.corriente.push(item);
      else if (dias <= 30) aging.d30.push(item);
      else if (dias <= 60) aging.d60.push(item);
      else if (dias <= 90) aging.d90.push(item);
      else                 aging.d90mas.push(item);
    });

    // Enriquecer con clientes
    const todosIds  = [...aging.corriente, ...aging.d30, ...aging.d60, ...aging.d90, ...aging.d90mas]
      .map(i => i.cuota.credito.clienteId).filter(Boolean);
    const idsUnicos = [...new Set(todosIds)];
    if (idsUnicos.length) {
      const clientes = await this.dataSource.query(
        `SELECT id, nombre, rfc FROM clientes WHERE id IN (${idsUnicos.map((_,i)=>`@${i}`).join(',')})`,
        idsUnicos
      ).catch(() => []);
      const clienteMap = new Map(clientes.map((cl: any) => [cl.id, cl]));
      const enriquecer = (items: any[]) => items.map(item => ({
        ...item,
        cuota: {
          ...item.cuota,
          credito: { ...item.cuota.credito, cliente: clienteMap.get(item.cuota.credito.clienteId) ?? null },
        },
      }));
      aging.corriente = enriquecer(aging.corriente);
      aging.d30       = enriquecer(aging.d30);
      aging.d60       = enriquecer(aging.d60);
      aging.d90       = enriquecer(aging.d90);
      aging.d90mas    = enriquecer(aging.d90mas);
    }
    return aging;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────
  private redondear(n: number): number { return Math.round(n * 100) / 100; }

  private sumarMeses(fecha: Date, meses: number): Date {
    const d = new Date(fecha);
    d.setMonth(d.getMonth() + meses);
    return d;
  }

  private async generarFolio(empresaId: string): Promise<string> {
    const año  = new Date().getFullYear();
    const last = await this.creditoRepo
      .createQueryBuilder('c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.folio LIKE :p', { p: `CRD-${año}-%` })
      .orderBy('c.fechaCreacion', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.folio.split('-')[2]) + 1 : 1;
    return `CRD-${año}-${String(seq).padStart(4, '0')}`;
  }
}