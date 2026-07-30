import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Factura, EstadoFactura } from './factura.entity';
import { PartidaFactura } from './partida-factura.entity';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { FacturamaService } from './facturama.service';
import { CrearFacturaDto } from './crear-factura.dto';
import { Producto } from '../catalogo/entities/producto.entity';
import { Venta } from '../ventas/entities/venta.entity';

@Injectable()
export class CfdiService {
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

  async guardarConfig(empresaId: string, dto: Partial<ConfiguracionFiscal>) {
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
    if (config) {
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
  ): Promise<Factura> {
    const config = await this.obtenerConfig(empresaId);
    if (!config.facturamaUser || !config.facturamaPassword) {
      throw new BadRequestException(
        'La configuración fiscal base está completa, pero falta conectar el PAC antes de timbrar.',
      );
    }

    if (dto.ventaId) {
      const venta = await this.dataSource.getRepository(Venta).findOne({
        where: { id: dto.ventaId, empresaId },
      });
      if (!venta) {
        throw new BadRequestException(
          'La venta vinculada no existe o pertenece a otra empresa.',
        );
      }
      const vinculada = await this.facturaRepo.findOne({
        where: { empresaId, ventaId: dto.ventaId },
      });
      if (vinculada && vinculada.estado !== EstadoFactura.CANCELADA) {
        throw new BadRequestException(
          'La venta ya tiene un CFDI vigente vinculado.',
        );
      }
    }

    const productoIds = [
      ...new Set(
        dto.partidas
          .map((partida) => partida.productoId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const productos = productoIds.length
      ? await this.productoRepo.find({
          where: { id: In(productoIds), empresaId },
          relations: ['impuesto'],
        })
      : [];
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    if (productos.length !== productoIds.length) {
      throw new BadRequestException(
        'Una o más partidas contienen productos que no pertenecen a la empresa.',
      );
    }

    // Calcular totales
    const partidas = dto.partidas.map((p, idx) => {
      const subtotal = Number((p.cantidad * p.precioUnitario).toFixed(4));
      const descuento = Number((p.descuento ?? 0).toFixed(4));
      const base = subtotal - descuento;
      const impuestoCatalogo = p.productoId
        ? productosPorId.get(p.productoId)?.impuesto
        : undefined;
      const tipoFactor = p.tipoFactor ?? impuestoCatalogo?.tipoFactor ?? 'TASA';
      const objetoImpuesto =
        p.objetoImpuesto ??
        impuestoCatalogo?.objetoImpuesto ??
        (tipoFactor === 'NO_OBJETO' ? '01' : '02');
      const tasaIVA =
        tipoFactor === 'TASA'
          ? (p.tasaIVA ?? Number(impuestoCatalogo?.porcentaje ?? 16) / 100)
          : 0;
      const montoIVA = Number((base * tasaIVA).toFixed(4));
      const total = Number((base + montoIVA).toFixed(4));
      return {
        p,
        subtotal,
        descuento,
        base,
        tipoFactor,
        objetoImpuesto,
        tasaIVA,
        montoIVA,
        total,
        idx,
      };
    });

    const totalSubtotal = partidas.reduce((s, p) => s + p.base, 0);
    const totalIVA = partidas.reduce((s, p) => s + p.montoIVA, 0);
    const totalFactura = Number((totalSubtotal + totalIVA).toFixed(4));

    // Obtener siguiente folio
    const folio = config.folioActual;

    // Construir payload Facturama CFDI 4.0
    const payloadFacturama = {
      Serie: config.serie,
      Folio: String(folio),
      Currency: dto.moneda ?? 'MXN',
      ExpeditionPlace: config.codigoPostalExpedicion,
      PaymentForm: dto.formaPago ?? '03',
      PaymentMethod: dto.metodoPago ?? 'PUE',
      CfdiType: 'I', // I=Ingreso, E=Egreso, T=Traslado
      Observations: dto.notas ?? '',
      Receiver: {
        Rfc: dto.rfcReceptor.toUpperCase(),
        Name: dto.nombreReceptor.toUpperCase(),
        CfdiUse: dto.usoCFDI ?? 'G03',
        FiscalRegime: dto.regimenFiscalReceptor,
        TaxZipCode: dto.codigoPostalReceptor,
      },
      Issuer: {
        FiscalRegime: config.regimenFiscal,
        Rfc: config.rfc.toUpperCase(),
        Name: config.razonSocial.toUpperCase(),
      },
      Items: partidas.map(
        ({
          p,
          subtotal,
          descuento,
          base,
          tipoFactor,
          objetoImpuesto,
          tasaIVA,
          montoIVA,
          total,
        }) => {
          const item: any = {
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
            item.Taxes = [
              {
                Total: montoIVA,
                Name: 'IVA',
                Base: base,
                Rate: tasaIVA,
                IsRetention: false,
              },
            ];
          } else if (objetoImpuesto !== '01' && tipoFactor === 'EXENTO') {
            item.Taxes = [
              {
                Name: 'IVA',
                Base: base,
                IsRetention: false,
                IsExempt: true,
              },
            ];
          }
          return item;
        },
      ),
    };

    // Timbrar con Facturama
    const timbre = await this.facturamaService.timbrarCFDI(
      config,
      payloadFacturama,
    );

    // Guardar en BD dentro de una transacción
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Guardar factura
      const factura = qr.manager.create(Factura, {
        empresaId,
        ventaId: dto.ventaId ?? null,
        serie: config.serie,
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
        totalImpuestosTrasladados: totalIVA,
        total: totalFactura,
        estado: EstadoFactura.TIMBRADA,
        uuid: timbre.Complement?.TaxStamp?.Uuid ?? timbre.Id,
        facturamaId: timbre.Id,
        xmlTimbrado: timbre.Xml ?? '',
        notas: dto.notas,
      });
      const facturaGuardada = await qr.manager.save(factura);

      // Guardar partidas
      const partidasEntidades = partidas.map(
        ({
          p,
          subtotal,
          descuento,
          objetoImpuesto,
          tasaIVA,
          montoIVA,
          total,
          idx,
        }) =>
          qr.manager.create(PartidaFactura, {
            facturaId: facturaGuardada.id,
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
      );
      await qr.manager.save(partidasEntidades);

      // Incrementar folio
      config.folioActual = folio + 1;
      await qr.manager.save(config);

      await qr.commitTransaction();

      return this.obtenerPorId(facturaGuardada.id, empresaId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
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
    const factura = await this.obtenerPorId(id, empresaId);
    if (factura.estado !== EstadoFactura.TIMBRADA) {
      throw new BadRequestException(
        'Solo se pueden cancelar facturas timbradas.',
      );
    }
    const config = await this.obtenerConfig(empresaId);
    await this.facturamaService.cancelarCFDI(
      config,
      factura.facturamaId,
      motivo,
      uuidSustitucion,
    );
    factura.estado = EstadoFactura.CANCELADA;
    factura.fechaCancelacion = new Date();
    factura.motivoCancelacion = motivo;
    if (uuidSustitucion) factura.uuidSustitucion = uuidSustitucion;
    return this.facturaRepo.save(factura);
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
