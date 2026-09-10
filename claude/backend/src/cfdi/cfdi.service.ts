import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull, Not } from 'typeorm';
import { Factura, EstadoFactura } from './factura.entity';
import { PartidaFactura } from './partida-factura.entity';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { FacturamaService } from './facturama.service';
import { CrearFacturaDto } from './crear-factura.dto';
import { GuardarConfiguracionFiscalDto } from './configuracion-fiscal.dto';
import { Producto } from '../catalogo/entities/producto.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { DetalleVenta } from '../ventas/entities/detalle-venta.entity';
import { DevolucionVenta, EstadoFiscalDevolucion } from '../ventas/entities/devolucion-venta.entity';
import { TimbrarVentaDto } from './timbrar-venta.dto';
import { METODOS_CREDITO_VENTA, MetodoPagoVenta } from '../ventas/constants/metodos-pago';
import { cifrarSecretoCfdi, estaCifradoSecretoCfdi } from './cfdi-secrets.crypto';
import {
  EstadoFiscalCobranza,
  PagoCobranza,
} from '../credito/entities/pago-cobranza.entity';

type OpcionesCreacionCfdi = {
  tipoComprobante?: 'I' | 'E';
  relacion?: { tipo: string; uuid: string; facturaId: string };
};

@Injectable()
export class CfdiService implements OnModuleInit {
  private readonly logger = new Logger(CfdiService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,
    @InjectRepository(ConfiguracionFiscal)
    private readonly configRepo: Repository<ConfiguracionFiscal>,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    private readonly facturamaService: FacturamaService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Migra de forma segura las contraseñas PAC heredadas que todavía estén en
   * texto plano. La migración SQL sólo amplía la columna; el cifrado debe
   * ocurrir dentro de la aplicación porque la llave nunca debe llegar a SQL.
   */
  async onModuleInit(): Promise<void> {
    if (!process.env.CFDI_ENCRYPTION_KEY?.trim()) {
      this.logger.warn(
        'No se migraron credenciales PAC heredadas porque CFDI_ENCRYPTION_KEY no está configurada.',
      );
      return;
    }
    const configuraciones = await this.configRepo.find({
      where: { facturamaPassword: Not(IsNull()) },
      select: ['id', 'empresaId', 'facturamaPassword'],
    });
    const heredadas = configuraciones.filter(
      (config) =>
        Boolean(config.facturamaPassword) &&
        !estaCifradoSecretoCfdi(config.facturamaPassword),
    );
    if (!heredadas.length) return;

    for (const config of heredadas) {
      config.facturamaPassword = cifrarSecretoCfdi(
        config.facturamaPassword as string,
      );
    }
    await this.configRepo.save(heredadas);
    this.logger.log(
      `Se migraron ${heredadas.length} credenciales PAC heredadas a AES-256-GCM.`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN FISCAL
  // ─────────────────────────────────────────────────────────────────

  async obtenerConfig(empresaId: string): Promise<ConfiguracionFiscal> {
    const config = await this.configRepo.findOne({ where: { empresaId } });
    if (!config)
      throw new NotFoundException(
        'No existe configuración fiscal. Ve a Configuración → Datos Fiscales para completarla.',
      );
    return config;
  }

  async obtenerConfigPublica(empresaId: string) {
    const config = await this.obtenerConfig(empresaId);
    const { facturamaPassword: _secreto, ...segura } = config;
    return {
      ...segura,
      pacConfigurado: Boolean(config.facturamaUser && config.facturamaPassword),
    };
  }

  async guardarConfig(empresaId: string, dto: GuardarConfiguracionFiscalDto) {
    let config = await this.configRepo.findOne({ where: { empresaId } });
    const camposPermitidos: (keyof ConfiguracionFiscal)[] = [
      'rfc',
      'razonSocial',
      'regimenFiscal',
      'codigoPostalExpedicion',
      'facturamaUser',
      'facturamaPassword',
      'sandbox',
      'serie',
      'activo',
    ];
    const cambios = Object.fromEntries(
      camposPermitidos
        .filter((campo) => dto[campo] !== undefined)
        .map((campo) => [campo, dto[campo]]),
    ) as Partial<ConfiguracionFiscal>;

    if (dto.facturamaPassword !== undefined) {
      const password = dto.facturamaPassword.trim();
      // Cadena vacía elimina de forma explícita la credencial; un valor no
      // vacío siempre se persiste cifrado con AES-256-GCM.
      cambios.facturamaPassword = password
        ? cifrarSecretoCfdi(password)
        : null;
    }
    if (config) {
      if (
        config.facturamaPassword &&
        !estaCifradoSecretoCfdi(config.facturamaPassword) &&
        dto.facturamaPassword === undefined
      ) {
        cambios.facturamaPassword = cifrarSecretoCfdi(
          config.facturamaPassword,
        );
      }
      Object.assign(config, cambios);
    } else {
      config = this.configRepo.create({
        ...cambios,
        empresaId,
      } as ConfiguracionFiscal);
    }
    await this.configRepo.save(config);
    return this.obtenerConfigPublica(empresaId);
  }

  // ─────────────────────────────────────────────────────────────────
  // CREAR Y TIMBRAR FACTURA
  // ─────────────────────────────────────────────────────────────────

  async crearYTimbrar(
    dto: CrearFacturaDto,
    empresaId: string,
    claveIdempotencia?: string,
    opciones: OpcionesCreacionCfdi = {},
  ): Promise<Factura> {
    const clave = (claveIdempotencia?.trim() || (dto.ventaId ? `VENTA:${dto.ventaId}` : '')).slice(0, 100);
    if (!clave) {
      throw new BadRequestException(
        'Envía el encabezado Idempotency-Key para evitar timbrados duplicados.',
      );
    }
    const config = await this.obtenerConfig(empresaId);
    if (!config.facturamaUser || !config.facturamaPassword) {
      throw new BadRequestException(
        'Falta conectar el PAC antes de timbrar.',
      );
    }
    const previa = await this.facturaRepo.findOne({
      where: { empresaId, claveIdempotencia: clave },
    });
    if (previa) {
      if (previa.estado === EstadoFactura.TIMBRADA) return this.obtenerPorId(previa.id, empresaId);
      if ([EstadoFactura.PENDIENTE_TIMBRADO, EstadoFactura.ERROR_TIMBRADO].includes(previa.estado)) {
        return this.procesarTimbrado(previa.id, empresaId);
      }
      throw new BadRequestException(`La clave de idempotencia ya pertenece a un CFDI en estado ${previa.estado}.`);
    }

    if (dto.ventaId) {
      const venta = await this.dataSource.getRepository(Venta).findOne({
        where: { id: dto.ventaId, empresaId },
      });
      if (!venta) {
        throw new BadRequestException('La venta vinculada no existe o pertenece a otra empresa.');
      }
      const vinculada = await this.facturaRepo
        .createQueryBuilder('f')
        .where('f.empresaId=:empresaId AND f.ventaId=:ventaId', { empresaId, ventaId: dto.ventaId })
        .andWhere('f.estado <> :cancelada', { cancelada: EstadoFactura.CANCELADA })
        .getOne();
      if (vinculada) throw new BadRequestException('La venta ya tiene un CFDI vigente o en proceso.');
    }

    const productoIds = [...new Set(dto.partidas.map((p) => p.productoId).filter((id): id is string => Boolean(id)))];
    const productos = productoIds.length
      ? await this.productoRepo.find({ where: { id: In(productoIds), empresaId }, relations: ['impuesto'] })
      : [];
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    if (productos.length !== productoIds.length) {
      throw new BadRequestException('Una o más partidas contienen productos ajenos a la empresa.');
    }

    const partidas = dto.partidas.map((p, idx) => {
      const subtotal = Number((p.cantidad * p.precioUnitario).toFixed(4));
      const descuento = Number((p.descuento ?? 0).toFixed(4));
      const base = Number((subtotal - descuento).toFixed(4));
      if (base < 0) throw new BadRequestException(`La partida ${idx + 1} tiene descuento mayor al subtotal.`);
      const impuestoCatalogo = p.productoId ? productosPorId.get(p.productoId)?.impuesto : undefined;
      const tipoFactor = p.tipoFactor ?? impuestoCatalogo?.tipoFactor ?? 'TASA';
      const objetoImpuesto = p.objetoImpuesto ?? impuestoCatalogo?.objetoImpuesto ?? (tipoFactor === 'NO_OBJETO' ? '01' : '02');
      const tasaIVA = tipoFactor === 'TASA' ? (p.tasaIVA ?? Number(impuestoCatalogo?.porcentaje ?? 16) / 100) : 0;
      const montoIVA = Number((base * tasaIVA).toFixed(4));
      const total = Number((base + montoIVA).toFixed(4));
      return { p, subtotal, descuento, base, tipoFactor, objetoImpuesto, tasaIVA, montoIVA, total, idx };
    });
    const totalSubtotal = Number(partidas.reduce((s, p) => s + p.base, 0).toFixed(4));
    const totalIVA = Number(partidas.reduce((s, p) => s + p.montoIVA, 0).toFixed(4));
    const totalFactura = Number((totalSubtotal + totalIVA).toFixed(4));

    const facturaId = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const lock = await manager.query(
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
        [`CFDI:FOLIO:${empresaId}:${config.serie}`],
      );
      if (Number(lock?.[0]?.resultado ?? -999) < 0) {
        throw new BadRequestException('No fue posible reservar el folio fiscal.');
      }
      const facturaRepo = manager.getRepository(Factura);
      const repetida = await facturaRepo.findOne({
        where: { empresaId, claveIdempotencia: clave },
      });
      if (repetida) return repetida.id;
      if (dto.ventaId) {
        const vinculada = await facturaRepo
          .createQueryBuilder('f')
          .setLock('pessimistic_write')
          .where('f.empresaId=:empresaId AND f.ventaId=:ventaId', {
            empresaId,
            ventaId: dto.ventaId,
          })
          .andWhere('f.estado <> :cancelada', {
            cancelada: EstadoFactura.CANCELADA,
          })
          .getOne();
        if (vinculada) {
          throw new BadRequestException(
            'La venta ya tiene un CFDI vigente o en proceso.',
          );
        }
      }
      const configBloqueada = await manager
        .getRepository(ConfiguracionFiscal)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.empresaId=:empresaId', { empresaId })
        .getOne();
      if (!configBloqueada) throw new NotFoundException('Configuración fiscal no encontrada.');
      const folio = configBloqueada.folioActual;
      const payloadFacturama = {
        Serie: configBloqueada.serie,
        Folio: String(folio),
        Currency: dto.moneda ?? 'MXN',
        ExpeditionPlace: configBloqueada.codigoPostalExpedicion,
        PaymentForm: dto.formaPago ?? '03',
        PaymentMethod: dto.metodoPago ?? 'PUE',
        CfdiType: opciones.tipoComprobante ?? 'I',
        ...(opciones.relacion
          ? {
              Relations: {
                Type: opciones.relacion.tipo,
                Cfdis: [{ Uuid: opciones.relacion.uuid }],
              },
            }
          : {}),
        Observations: dto.notas ?? '',
        Receiver: {
          Rfc: dto.rfcReceptor.toUpperCase(),
          Name: dto.nombreReceptor.toUpperCase(),
          CfdiUse: dto.usoCFDI ?? 'G03',
          FiscalRegime: dto.regimenFiscalReceptor,
          TaxZipCode: dto.codigoPostalReceptor,
        },
        Issuer: {
          FiscalRegime: configBloqueada.regimenFiscal,
          Rfc: configBloqueada.rfc.toUpperCase(),
          Name: configBloqueada.razonSocial.toUpperCase(),
        },
        Items: partidas.map(({ p, subtotal, descuento, base, tipoFactor, objetoImpuesto, tasaIVA, montoIVA, total }) => {
          const item: Record<string, unknown> = {
            ProductCode: p.claveSAT,
            IdentificationNumber: p.noIdentificacion ?? '',
            Description: p.descripcion,
            Unit: p.unidadMedida ?? 'Pieza',
            UnitCode: p.claveUnidadSAT,
            UnitPrice: p.precioUnitario,
            Quantity: p.cantidad,
            Subtotal: subtotal,
            Total: total,
            TaxObject: objetoImpuesto,
          };
          if (descuento > 0) item.Discount = descuento;
          if (objetoImpuesto !== '01' && tipoFactor === 'TASA') {
            item.Taxes = [{ Total: montoIVA, Name: 'IVA', Base: base, Rate: tasaIVA, IsRetention: false }];
          } else if (objetoImpuesto !== '01' && tipoFactor === 'EXENTO') {
            item.Taxes = [{ Name: 'IVA', Base: base, IsRetention: false, IsExempt: true }];
          }
          return item;
        }),
      };
      const factura = await facturaRepo.save(
        facturaRepo.create({
          empresaId,
          ventaId: dto.ventaId ?? null,
          tipoComprobante: opciones.tipoComprobante ?? 'I',
          cfdiRelacionadoId: opciones.relacion?.facturaId ?? null,
          tipoRelacion: opciones.relacion?.tipo ?? null,
          serie: configBloqueada.serie,
          folio,
          fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
          clienteId: dto.clienteId ?? null,
          rfcReceptor: dto.rfcReceptor.toUpperCase(),
          nombreReceptor: dto.nombreReceptor.toUpperCase(),
          regimenFiscalReceptor: dto.regimenFiscalReceptor,
          codigoPostalReceptor: dto.codigoPostalReceptor,
          usoCFDI: dto.usoCFDI ?? 'G03',
          formaPago: dto.formaPago ?? '03',
          metodoPago: dto.metodoPago ?? 'PUE',
          moneda: dto.moneda ?? 'MXN',
          tipoCambio: dto.tipoCambio ?? 1,
          subtotal: totalSubtotal,
          descuento: partidas.reduce((sum, p) => sum + p.descuento, 0),
          totalImpuestosTrasladados: totalIVA,
          total: totalFactura,
          estado: EstadoFactura.PENDIENTE_TIMBRADO,
          claveIdempotencia: clave,
          payloadPac: JSON.stringify(payloadFacturama),
          notas: dto.notas ?? null,
        }),
      );
      await manager.getRepository(PartidaFactura).save(
        partidas.map(({ p, subtotal, descuento, objetoImpuesto, tasaIVA, montoIVA, total, idx }) =>
          manager.getRepository(PartidaFactura).create({
            facturaId: factura.id,
            productoId: p.productoId ?? null,
            claveSAT: p.claveSAT,
            claveUnidadSAT: p.claveUnidadSAT,
            unidadMedida: p.unidadMedida ?? 'Pieza',
            noIdentificacion: p.noIdentificacion,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            precioUnitario: p.precioUnitario,
            descuento,
            subtotal,
            objetoImpuesto,
            tasaIVA,
            montoIVA,
            total,
            orden: idx,
          }),
        ),
      );
      configBloqueada.folioActual = folio + 1;
      await manager.getRepository(ConfiguracionFiscal).save(configBloqueada);
      return factura.id;
    });
    return this.procesarTimbrado(facturaId, empresaId);
  }

  private formaPagoVenta(metodo: MetodoPagoVenta): string {
    switch (metodo) {
      case MetodoPagoVenta.EFECTIVO:
        return '01';
      case MetodoPagoVenta.CHEQUE:
        return '02';
      case MetodoPagoVenta.TRANSFERENCIA:
        return '03';
      case MetodoPagoVenta.TARJETA:
      case MetodoPagoVenta.MSI_BANCO:
        return '04';
      default:
        return '99';
    }
  }

  async timbrarVenta(
    ventaId: string,
    dto: TimbrarVentaDto,
    empresaId: string,
    claveIdempotencia?: string,
  ) {
    const venta = await this.dataSource.getRepository(Venta).findOne({
      where: { id: ventaId, empresaId },
      relations: ['cliente', 'detalles', 'detalles.producto'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');
    if (venta.estado === 'ANULADA') {
      throw new BadRequestException('No se puede facturar una venta anulada.');
    }

    const partidas = venta.detalles.map((detalle: DetalleVenta, indice) => {
      const producto = detalle.producto;
      if (!producto?.claveSAT || !producto?.claveUnidadSAT) {
        throw new BadRequestException(
          `El producto de la partida ${indice + 1} no tiene clave SAT y unidad SAT completas.`,
        );
      }
      const cantidad = Number(detalle.cantidad);
      const subtotal = Number(detalle.subtotal);
      const descuento = Number(detalle.descuento ?? 0);
      const bruto = subtotal + descuento;
      const precioUnitario = cantidad > 0 ? bruto / cantidad : 0;
      const tasaIVA = subtotal > 0
        ? Number(detalle.impuestoMonto ?? 0) / subtotal
        : 0;
      return {
        productoId: detalle.productoId,
        claveSAT: producto.claveSAT,
        claveUnidadSAT: producto.claveUnidadSAT,
        unidadMedida: producto.unidadMedida || 'Pieza',
        noIdentificacion: producto.sku,
        descripcion: producto.nombre,
        cantidad,
        precioUnitario: Number(precioUnitario.toFixed(4)),
        descuento: Number(descuento.toFixed(4)),
        tasaIVA: Number(tasaIVA.toFixed(6)),
        objetoImpuesto: tasaIVA > 0 ? ('02' as const) : ('01' as const),
        tipoFactor: tasaIVA > 0 ? ('TASA' as const) : ('NO_OBJETO' as const),
      };
    });

    const esCredito = METODOS_CREDITO_VENTA.has(venta.metodoPago);
    return this.crearYTimbrar(
      {
        ventaId: venta.id,
        clienteId: venta.clienteId,
        rfcReceptor: dto.rfcReceptor,
        nombreReceptor: dto.nombreReceptor,
        regimenFiscalReceptor: dto.regimenFiscalReceptor,
        codigoPostalReceptor: dto.codigoPostalReceptor,
        usoCFDI: dto.usoCFDI ?? 'G03',
        formaPago: esCredito ? '99' : this.formaPagoVenta(venta.metodoPago),
        metodoPago: esCredito ? 'PPD' : 'PUE',
        moneda: 'MXN',
        tipoCambio: 1,
        partidas,
        notas: dto.notas ?? `Factura de venta #${venta.folio}`,
      },
      empresaId,
      claveIdempotencia ?? `VENTA:${venta.id}`,
    );
  }

  async buscarVigentePorVenta(ventaId: string, empresaId: string) {
    return this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresaId = :empresaId AND f.ventaId = :ventaId', {
        empresaId,
        ventaId,
      })
      .andWhere('f.tipoComprobante = :tipo', { tipo: 'I' })
      .andWhere('f.estado <> :cancelada', { cancelada: EstadoFactura.CANCELADA })
      .orderBy('f.fechaCreacion', 'DESC')
      .getOne();
  }

  async cancelarPorVenta(
    ventaId: string,
    empresaId: string,
    motivo = '03',
  ): Promise<Factura | null> {
    const factura = await this.buscarVigentePorVenta(ventaId, empresaId);
    if (!factura) return null;
    if (factura.estado === EstadoFactura.CANCELADA) return factura;
    return this.cancelar(factura.id, empresaId, motivo);
  }

  async crearNotaCreditoDesdeDevolucion(
    devolucionId: string,
    empresaId: string,
  ): Promise<Factura | null> {
    const repoDevolucion = this.dataSource.getRepository(DevolucionVenta);
    const devolucion = await repoDevolucion.findOne({
      where: { id: devolucionId, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'venta',
        'venta.cliente',
      ],
    });
    if (!devolucion) throw new NotFoundException('Devolución no encontrada.');
    if (devolucion.notaCreditoId) {
      return this.obtenerPorId(devolucion.notaCreditoId, empresaId);
    }
    if (!devolucion.facturaOrigenId) return null;

    const origen = await this.obtenerPorId(
      devolucion.facturaOrigenId,
      empresaId,
    );
    if (origen.estado !== EstadoFactura.TIMBRADA || !origen.uuid) {
      throw new BadRequestException(
        'El CFDI de ingreso no está timbrado o no tiene UUID fiscal.',
      );
    }

    try {
      const factura = await this.crearYTimbrar(
        {
          clienteId: origen.clienteId ?? undefined,
          rfcReceptor: origen.rfcReceptor,
          nombreReceptor: origen.nombreReceptor,
          regimenFiscalReceptor: origen.regimenFiscalReceptor,
          codigoPostalReceptor: origen.codigoPostalReceptor,
          usoCFDI: 'G02',
          formaPago: origen.formaPago || '01',
          metodoPago: 'PUE',
          moneda: origen.moneda || 'MXN',
          tipoCambio: Number(origen.tipoCambio ?? 1),
          partidas: devolucion.detalles.map((detalle, indice) => {
            const producto = detalle.producto;
            if (!producto?.claveSAT || !producto?.claveUnidadSAT) {
              throw new BadRequestException(
                `El producto de la devolución, partida ${indice + 1}, no tiene claves SAT completas.`,
              );
            }
            const cantidad = Number(detalle.cantidad);
            const subtotal = Number(detalle.subtotal);
            const tasaIVA = subtotal > 0
              ? Number(detalle.impuestoMonto ?? 0) / subtotal
              : 0;
            return {
              productoId: detalle.productoId,
              claveSAT: producto.claveSAT,
              claveUnidadSAT: producto.claveUnidadSAT,
              unidadMedida: producto.unidadMedida || 'Pieza',
              noIdentificacion: producto.sku,
              descripcion: `Devolución: ${producto.nombre}`,
              cantidad,
              precioUnitario: Number((subtotal / cantidad).toFixed(4)),
              descuento: 0,
              tasaIVA: Number(tasaIVA.toFixed(6)),
              objetoImpuesto: tasaIVA > 0 ? ('02' as const) : ('01' as const),
              tipoFactor: tasaIVA > 0 ? ('TASA' as const) : ('NO_OBJETO' as const),
            };
          }),
          notas: `Nota de crédito por devolución DEV-${devolucion.folio}`,
        },
        empresaId,
        `DEVOLUCION:${devolucion.id}`,
        {
          tipoComprobante: 'E',
          relacion: {
            tipo: '01',
            uuid: origen.uuid,
            facturaId: origen.id,
          },
        },
      );
      devolucion.notaCreditoId = factura.id;
      devolucion.estadoFiscal = EstadoFiscalDevolucion.NOTA_CREDITO_GENERADA;
      await repoDevolucion.save(devolucion);
      return factura;
    } catch (error) {
      devolucion.estadoFiscal = EstadoFiscalDevolucion.ERROR_NOTA_CREDITO;
      await repoDevolucion.save(devolucion);
      throw error;
    }
  }

  async generarNotasCreditoPendientes(empresaId: string, limite = 50) {
    const tope = Math.min(Math.max(Number(limite) || 50, 1), 100);
    const repoDevolucion = this.dataSource.getRepository(DevolucionVenta);
    const pendientes = await repoDevolucion.find({
      where: {
        empresaId,
        estadoFiscal: In([
          EstadoFiscalDevolucion.PENDIENTE_NOTA_CREDITO,
          EstadoFiscalDevolucion.ERROR_NOTA_CREDITO,
        ]),
      },
      order: { fechaDevolucion: 'ASC' },
      take: tope,
    });

    const resultado: Array<{
      devolucionId: string;
      folio: number;
      procesada: boolean;
      facturaId?: string;
      error?: string;
    }> = [];
    for (const devolucion of pendientes) {
      try {
        const factura = await this.crearNotaCreditoDesdeDevolucion(
          devolucion.id,
          empresaId,
        );
        resultado.push({
          devolucionId: devolucion.id,
          folio: devolucion.folio,
          procesada: Boolean(factura),
          facturaId: factura?.id,
        });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Falló el reintento de nota de crédito DEV-${devolucion.folio}: ${mensaje}`,
        );
        resultado.push({
          devolucionId: devolucion.id,
          folio: devolucion.folio,
          procesada: false,
          error: mensaje,
        });
      }
    }

    return {
      encontrados: pendientes.length,
      generados: resultado.filter((item) => item.procesada).length,
      errores: resultado.filter((item) => !item.procesada).length,
      resultado,
    };
  }

  private formaPagoCobranza(metodo: string): string {
    switch (metodo) {
      case 'EFECTIVO':
        return '01';
      case 'CHEQUE':
        return '02';
      case 'TRANSFERENCIA':
        return '03';
      case 'TARJETA':
        return '04';
      default:
        return '99';
    }
  }

  /**
   * Emite el REP 2.0 de un abono aplicado a una factura PPD.
   * La idempotencia queda ligada al pago de cobranza, por lo que un reintento
   * nunca consume un segundo folio fiscal.
   */
  async crearComplementoPagoDesdeCobranza(
    pagoId: string,
    empresaId: string,
  ): Promise<Factura | null> {
    const pagoRepo = this.dataSource.getRepository(PagoCobranza);
    const pago = await pagoRepo.findOne({
      where: { id: pagoId, empresaId },
      relations: ['credito'],
    });
    if (!pago) throw new NotFoundException('Pago de cobranza no encontrado.');
    if (pago.complementoPagoId) {
      return this.obtenerPorId(pago.complementoPagoId, empresaId);
    }
    if (!pago.credito?.ventaId || Number(pago.montoCapital) <= 0) {
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          estadoFiscal: EstadoFiscalCobranza.NO_REQUERIDO,
          ultimoErrorFiscal: null,
        },
      );
      return null;
    }

    const origen = await this.facturaRepo.findOne({
      where: {
        empresaId,
        ventaId: pago.credito.ventaId,
        tipoComprobante: 'I',
        estado: EstadoFactura.TIMBRADA,
      },
      relations: ['partidas'],
      order: { fechaCreacion: 'DESC' },
    });
    if (!origen?.uuid) {
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          estadoFiscal: EstadoFiscalCobranza.PENDIENTE_REP,
          ultimoErrorFiscal:
            'La venta todavía no tiene un CFDI de ingreso timbrado.',
        },
      );
      throw new BadRequestException(
        'Primero debe timbrarse la factura PPD de la venta.',
      );
    }
    if (origen.metodoPago !== 'PPD') {
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          estadoFiscal: EstadoFiscalCobranza.NO_REQUERIDO,
          ultimoErrorFiscal: null,
        },
      );
      return null;
    }

    const pagos = await pagoRepo.find({
      where: { empresaId, creditoId: pago.creditoId },
      order: { fechaPago: 'ASC', fechaCreacion: 'ASC', id: 'ASC' },
    });
    const indice = pagos.findIndex((item) => item.id === pago.id);
    if (indice < 0) throw new NotFoundException('Pago no localizado.');

    const anteriorSinRep = pagos.slice(0, indice).find(
      (item) =>
        Number(item.montoCapital) > 0 &&
        item.estadoFiscal !== EstadoFiscalCobranza.NO_REQUERIDO &&
        !item.complementoPagoId,
    );
    if (anteriorSinRep) {
      throw new BadRequestException(
        'Existe un pago anterior sin complemento. Los REP deben generarse en orden cronológico.',
      );
    }

    const aplicadoAnterior = Number(
      pagos
        .slice(0, indice)
        .reduce((total, item) => total + Number(item.montoCapital), 0)
        .toFixed(2),
    );
    const saldoAnterior = Number(
      Math.max(0, Number(origen.total) - aplicadoAnterior).toFixed(2),
    );
    const montoAplicado = Number(
      Math.min(Number(pago.montoCapital), saldoAnterior).toFixed(2),
    );
    if (montoAplicado <= 0) {
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          estadoFiscal: EstadoFiscalCobranza.NO_REQUERIDO,
          ultimoErrorFiscal: null,
        },
      );
      return null;
    }

    const saldoInsoluto = Number(
      Math.max(0, saldoAnterior - montoAplicado).toFixed(2),
    );
    const parcialidad =
      pagos
        .slice(0, indice)
        .filter((item) => Number(item.montoCapital) > 0).length + 1;
    const partidasObjeto = (origen.partidas ?? []).filter(
      (partida) => partida.objetoImpuesto !== '01',
    );
    const taxes = partidasObjeto.length
      ? Array.from(
          partidasObjeto.reduce((mapa, partida) => {
            const tasa = Number(partida.tasaIVA ?? 0);
            const llave = tasa.toFixed(6);
            const existente = mapa.get(llave) ?? { tasa, total: 0 };
            existente.total += Number(partida.total);
            mapa.set(llave, existente);
            return mapa;
          }, new Map<string, { tasa: number; total: number }>()),
        ).map(([, grupo]) => {
          const proporcion = Number(origen.total) > 0
            ? grupo.total / Number(origen.total)
            : 0;
          const bruto = montoAplicado * proporcion;
          const base = grupo.tasa > 0 ? bruto / (1 + grupo.tasa) : bruto;
          const impuesto = bruto - base;
          return {
            Name: 'IVA',
            Rate: Number(grupo.tasa.toFixed(6)),
            Total: Number(impuesto.toFixed(2)),
            Base: Number(base.toFixed(2)),
            IsRetention: false,
          };
        })
      : [];

    const config = await this.obtenerConfig(empresaId);
    const clave = `REP:${pago.id}`;
    const previa = await this.facturaRepo.findOne({
      where: { empresaId, claveIdempotencia: clave },
    });
    if (previa) {
      const final =
        previa.estado === EstadoFactura.TIMBRADA
          ? previa
          : await this.procesarTimbrado(previa.id, empresaId);
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          complementoPagoId: final.id,
          estadoFiscal: EstadoFiscalCobranza.REP_GENERADO,
          ultimoErrorFiscal: null,
        },
      );
      return final;
    }

    try {
      const facturaId = await this.dataSource.transaction(
        'SERIALIZABLE',
        async (manager) => {
          const lock = await manager.query(
            `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
            [`CFDI:FOLIO:${empresaId}:${config.serie}`],
          );
          if (Number(lock?.[0]?.resultado ?? -999) < 0) {
            throw new BadRequestException(
              'No fue posible reservar el folio del complemento de pago.',
            );
          }
          const repoFactura = manager.getRepository(Factura);
          const repetida = await repoFactura.findOne({
            where: { empresaId, claveIdempotencia: clave },
          });
          if (repetida) return repetida.id;

          const configBloqueada = await manager
            .getRepository(ConfiguracionFiscal)
            .createQueryBuilder('config')
            .setLock('pessimistic_write')
            .where('config.empresaId=:empresaId', { empresaId })
            .getOne();
          if (!configBloqueada) {
            throw new NotFoundException('Configuración fiscal no encontrada.');
          }
          const folio = configBloqueada.folioActual;
          const documentoRelacionado: Record<string, unknown> = {
            TaxObject: taxes.length ? '02' : '01',
            Uuid: origen.uuid,
            Serie: origen.serie,
            Folio: String(origen.folio),
            Currency: origen.moneda || 'MXN',
            PaymentMethod: 'PPD',
            PartialityNumber: parcialidad,
            PreviousBalanceAmount: saldoAnterior,
            AmountPaid: montoAplicado,
            ImpSaldoInsoluto: saldoInsoluto,
          };
          if (taxes.length) documentoRelacionado.Taxes = taxes;

          const payload = {
            CfdiType: 'P',
            NameId: '14',
            Serie: configBloqueada.serie,
            Folio: String(folio),
            ExpeditionPlace: configBloqueada.codigoPostalExpedicion,
            Receiver: {
              Rfc: origen.rfcReceptor,
              Name: origen.nombreReceptor,
              CfdiUse: 'CP01',
              FiscalRegime: origen.regimenFiscalReceptor,
              TaxZipCode: origen.codigoPostalReceptor,
            },
            Issuer: {
              FiscalRegime: configBloqueada.regimenFiscal,
              Rfc: configBloqueada.rfc.toUpperCase(),
              Name: configBloqueada.razonSocial.toUpperCase(),
            },
            Complemento: {
              Payments: [
                {
                  Date: new Date(pago.fechaPago).toISOString(),
                  PaymentForm: this.formaPagoCobranza(pago.metodoPago),
                  Amount: montoAplicado,
                  Currency: origen.moneda || 'MXN',
                  RelatedDocuments: [documentoRelacionado],
                },
              ],
            },
          };

          const nueva = await repoFactura.save(
            repoFactura.create({
              empresaId,
              ventaId: origen.ventaId,
              tipoComprobante: 'P',
              cfdiRelacionadoId: origen.id,
              tipoRelacion: null,
              serie: configBloqueada.serie,
              folio,
              fecha: new Date(),
              clienteId: origen.clienteId,
              rfcReceptor: origen.rfcReceptor,
              nombreReceptor: origen.nombreReceptor,
              regimenFiscalReceptor: origen.regimenFiscalReceptor,
              codigoPostalReceptor: origen.codigoPostalReceptor,
              usoCFDI: 'CP01',
              formaPago: this.formaPagoCobranza(pago.metodoPago),
              metodoPago: 'PPD',
              moneda: origen.moneda || 'MXN',
              tipoCambio: Number(origen.tipoCambio ?? 1),
              subtotal: 0,
              descuento: 0,
              totalImpuestosTrasladados: 0,
              total: montoAplicado,
              estado: EstadoFactura.PENDIENTE_TIMBRADO,
              claveIdempotencia: clave,
              payloadPac: JSON.stringify(payload),
              notas: `Complemento de pago de cobranza ${pago.id}`,
            }),
          );
          configBloqueada.folioActual = folio + 1;
          await manager
            .getRepository(ConfiguracionFiscal)
            .save(configBloqueada);
          return nueva.id;
        },
      );

      const complemento = await this.procesarTimbrado(facturaId, empresaId);
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          complementoPagoId: complemento.id,
          estadoFiscal: EstadoFiscalCobranza.REP_GENERADO,
          ultimoErrorFiscal: null,
        },
      );
      return complemento;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await pagoRepo.update(
        { id: pago.id, empresaId },
        {
          estadoFiscal: EstadoFiscalCobranza.ERROR_REP,
          ultimoErrorFiscal: mensaje.slice(0, 2000),
        },
      );
      throw error;
    }
  }

  async generarComplementosPendientes(empresaId: string, limite = 50) {
    const pagos = await this.dataSource.getRepository(PagoCobranza).find({
      where: [
        { empresaId, estadoFiscal: EstadoFiscalCobranza.PENDIENTE_REP },
        { empresaId, estadoFiscal: EstadoFiscalCobranza.ERROR_REP },
      ],
      order: { fechaPago: 'ASC', fechaCreacion: 'ASC' },
      take: Math.min(Math.max(limite, 1), 100),
    });
    const resultado = { procesados: 0, generados: 0, errores: [] as string[] };
    for (const pago of pagos) {
      resultado.procesados += 1;
      try {
        const rep = await this.crearComplementoPagoDesdeCobranza(
          pago.id,
          empresaId,
        );
        if (rep) resultado.generados += 1;
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        resultado.errores.push(`${pago.id}: ${mensaje}`);
      }
    }
    return resultado;
  }

  private async procesarTimbrado(id: string, empresaId: string): Promise<Factura> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (factura.estado === EstadoFactura.TIMBRADA) return factura;
    if (![EstadoFactura.PENDIENTE_TIMBRADO, EstadoFactura.ERROR_TIMBRADO].includes(factura.estado)) {
      throw new BadRequestException(`El CFDI no puede timbrarse desde el estado ${factura.estado}.`);
    }
    const config = await this.obtenerConfig(empresaId);
    if (!factura.payloadPac) throw new BadRequestException('El expediente no contiene el payload PAC.');
    await this.facturaRepo.update(
      { id, empresaId },
      {
        estado: EstadoFactura.PENDIENTE_TIMBRADO,
        intentosTimbrado: Number(factura.intentosTimbrado ?? 0) + 1,
        fechaUltimoIntento: new Date(),
        ultimoError: null,
      },
    );
    try {
      const timbre = await this.facturamaService.timbrarCFDI(
        config,
        JSON.parse(factura.payloadPac),
      );
      const uuid = timbre.Complement?.TaxStamp?.Uuid ?? timbre.Id;
      if (!uuid) throw new Error('El PAC respondió sin UUID fiscal.');
      await this.facturaRepo.update(
        { id, empresaId },
        {
          estado: EstadoFactura.TIMBRADA,
          uuid,
          facturamaId: timbre.Id,
          xmlTimbrado: timbre.Xml ?? '',
          fechaTimbrado: new Date(),
          ultimoError: null,
        },
      );
      return this.obtenerPorId(id, empresaId);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await this.facturaRepo.update(
        { id, empresaId },
        { estado: EstadoFactura.ERROR_TIMBRADO, ultimoError: mensaje.slice(0, 2000), fechaUltimoIntento: new Date() },
      );
      throw new BadRequestException(
        `El CFDI ${factura.serie}${factura.folio} quedó guardado en ERROR_TIMBRADO: ${mensaje}`,
      );
    }
  }

  async reintentarTimbrado(id: string, empresaId: string) {
    return this.procesarTimbrado(id, empresaId);
  }

  // ─────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ─────────────────────────────────────────────────────────────────

  async obtenerFacturas(
    empresaId: string,
    pagina = 1,
    limite = 20,
    estado?: EstadoFactura,
  ) {
    const where: any = { empresaId };
    if (estado) where.estado = estado;

    const [facturas, total] = await this.facturaRepo.findAndCount({
      where,
      relations: ['cliente', 'partidas'],
      order: { fechaCreacion: 'DESC' },
      skip: (pagina - 1) * limite,
      take: limite,
    });

    return {
      facturas,
      total,
      paginaActual: pagina,
      totalPaginas: Math.ceil(total / limite),
    };
  }

  async obtenerPorId(id: string, empresaId: string): Promise<Factura> {
    const factura = await this.facturaRepo.findOne({
      where: { id, empresaId },
      relations: ['cliente', 'partidas'],
    });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    return factura;
  }

  // ─────────────────────────────────────────────────────────────────
  // CANCELACIÓN
  // ─────────────────────────────────────────────────────────────────

  async cancelar(
    id: string,
    empresaId: string,
    motivo: string,
    uuidSustitucion?: string,
  ): Promise<Factura> {
    if (!['01', '02', '03', '04'].includes(motivo)) {
      throw new BadRequestException('El motivo de cancelación SAT no es válido.');
    }
    if (motivo === '01' && !uuidSustitucion) {
      throw new BadRequestException('El motivo 01 requiere el UUID que sustituye al comprobante.');
    }
    const factura = await this.obtenerPorId(id, empresaId);
    if (factura.estado === EstadoFactura.CANCELADA) return factura;
    if (![EstadoFactura.TIMBRADA, EstadoFactura.ERROR_CANCELACION].includes(factura.estado)) {
      throw new BadRequestException('Solo se pueden cancelar facturas timbradas.');
    }
    if (!factura.facturamaId) throw new BadRequestException('El CFDI no tiene identificador del PAC.');
    const reclamo = await this.facturaRepo.update(
      { id, empresaId, version: factura.version },
      {
        estado: EstadoFactura.CANCELACION_PENDIENTE,
        motivoCancelacion: motivo,
        uuidSustitucion: uuidSustitucion ?? null,
        ultimoError: null,
      },
    );
    if (!reclamo.affected) throw new BadRequestException('El CFDI fue modificado por otro proceso. Actualiza e intenta de nuevo.');
    const config = await this.obtenerConfig(empresaId);
    try {
      const acuse = await this.facturamaService.cancelarCFDI(
        config,
        factura.facturamaId,
        motivo,
        uuidSustitucion,
      );
      await this.facturaRepo.update(
        { id, empresaId },
        {
          estado: EstadoFactura.CANCELADA,
          fechaCancelacion: new Date(),
          motivoCancelacion: motivo,
          uuidSustitucion: uuidSustitucion ?? null,
          acuseCancelacion: JSON.stringify(acuse ?? {}),
          ultimoError: null,
        },
      );
      return this.obtenerPorId(id, empresaId);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await this.facturaRepo.update(
        { id, empresaId },
        { estado: EstadoFactura.ERROR_CANCELACION, ultimoError: mensaje.slice(0, 2000) },
      );
      throw new BadRequestException(`La cancelación quedó pendiente de resolver: ${mensaje}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // DESCARGAS
  // ─────────────────────────────────────────────────────────────────

  async descargarPDF(id: string, empresaId: string): Promise<Buffer> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (!factura.facturamaId)
      throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    return this.facturamaService.descargarDocumento(
      config,
      factura.facturamaId,
      'pdf',
    );
  }

  async descargarXML(id: string, empresaId: string): Promise<Buffer> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (!factura.facturamaId)
      throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    return this.facturamaService.descargarDocumento(
      config,
      factura.facturamaId,
      'xml',
    );
  }

  async enviarCorreo(
    id: string,
    empresaId: string,
    correo?: string,
  ): Promise<void> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (!factura.facturamaId)
      throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    const email = correo ?? factura.cliente?.email;
    if (!email)
      throw new BadRequestException(
        'No hay correo configurado para este cliente.',
      );
    await this.facturamaService.enviarPorCorreo(
      config,
      factura.facturamaId,
      email,
    );
  }
}
