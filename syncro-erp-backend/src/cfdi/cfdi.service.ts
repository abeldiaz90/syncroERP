import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Factura, EstadoFactura } from './factura.entity';
import { PartidaFactura } from './partida-factura.entity';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { FacturamaService } from './facturama.service';
import { CrearFacturaDto } from './crear-factura.dto';

@Injectable()
export class CfdiService {
  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,
    @InjectRepository(ConfiguracionFiscal)
    private readonly configRepo: Repository<ConfiguracionFiscal>,
    private readonly facturamaService: FacturamaService,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN FISCAL
  // ─────────────────────────────────────────────────────────────────

  async obtenerConfig(empresaId: string): Promise<ConfiguracionFiscal> {
    const config = await this.configRepo.findOne({ where: { empresaId } });
    if (!config) throw new NotFoundException(
      'No existe configuración fiscal. Ve a Configuración → Datos Fiscales para completarla.'
    );
    return config;
  }

  async guardarConfig(empresaId: string, dto: Partial<ConfiguracionFiscal>) {
    let config = await this.configRepo.findOne({ where: { empresaId } });
    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.configRepo.create({ ...dto, empresaId } as ConfiguracionFiscal);
    }
    return this.configRepo.save(config);
  }

  // ─────────────────────────────────────────────────────────────────
  // CREAR Y TIMBRAR FACTURA
  // ─────────────────────────────────────────────────────────────────

  async crearYTimbrar(dto: CrearFacturaDto, empresaId: string): Promise<Factura> {
    const config = await this.obtenerConfig(empresaId);

    // Calcular totales
    const partidas = dto.partidas.map((p, idx) => {
      const subtotal   = Number((p.cantidad * p.precioUnitario).toFixed(4));
      const descuento  = Number((p.descuento ?? 0).toFixed(4));
      const base       = subtotal - descuento;
      const tasaIVA    = p.tasaIVA ?? 0.16;
      const montoIVA   = Number((base * tasaIVA).toFixed(4));
      const total      = Number((base + montoIVA).toFixed(4));
      return { p, subtotal, descuento, base, tasaIVA, montoIVA, total, idx };
    });

    const totalSubtotal = partidas.reduce((s, p) => s + p.base, 0);
    const totalIVA      = partidas.reduce((s, p) => s + p.montoIVA, 0);
    const totalFactura  = Number((totalSubtotal + totalIVA).toFixed(4));

    // Obtener siguiente folio
    const folio = config.folioActual;

    // Construir payload Facturama CFDI 4.0
    const payloadFacturama = {
      Serie:            config.serie,
      Folio:            String(folio),
      Currency:         dto.moneda ?? 'MXN',
      ExpeditionPlace:  config.codigoPostalExpedicion,
      PaymentForm:      dto.formaPago ?? '03',
      PaymentMethod:    dto.metodoPago ?? 'PUE',
      CfdiType:         'I', // I=Ingreso, E=Egreso, T=Traslado
      Observations:     dto.notas ?? '',
      Receiver: {
        Rfc:            dto.rfcReceptor.toUpperCase(),
        Name:           dto.nombreReceptor.toUpperCase(),
        CfdiUse:        dto.usoCFDI ?? 'G03',
        FiscalRegime:   dto.regimenFiscalReceptor,
        TaxZipCode:     dto.codigoPostalReceptor,
      },
      Issuer: {
        FiscalRegime:   config.regimenFiscal,
        Rfc:            config.rfc.toUpperCase(),
        Name:           config.razonSocial.toUpperCase(),
      },
      Items: partidas.map(({ p, subtotal, descuento, base, tasaIVA, montoIVA, total }) => {
        const item: any = {
          ProductCode:          p.claveSAT,
          IdentificationNumber: p.noIdentificacion ?? '',
          Description:          p.descripcion,
          Unit:                 p.unidadMedida ?? 'Pieza',
          UnitCode:             p.claveUnidadSAT,
          UnitPrice:            p.precioUnitario,
          Quantity:             p.cantidad,
          Subtotal:             subtotal,
          Total:                total,
          TaxObject:            tasaIVA > 0 ? '02' : '01',
        };
        if (descuento > 0) item.Discount = descuento;
        if (tasaIVA > 0) {
          item.Taxes = [{
            Total:        montoIVA,
            Name:         'IVA',
            Base:         base,
            Rate:         tasaIVA,
            IsRetention:  false,
          }];
        }
        return item;
      }),
    };

    // Timbrar con Facturama
    const timbre = await this.facturamaService.timbrarCFDI(config, payloadFacturama);

    // Guardar en BD dentro de una transacción
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Guardar factura
      const factura = qr.manager.create(Factura, {
        empresaId,
        serie:                  config.serie,
        folio,
        fecha:                  dto.fecha ? new Date(dto.fecha) : new Date(),
        clienteId:              dto.clienteId ?? null,
        rfcReceptor:            dto.rfcReceptor.toUpperCase(),
        nombreReceptor:         dto.nombreReceptor.toUpperCase(),
        regimenFiscalReceptor:  dto.regimenFiscalReceptor,
        codigoPostalReceptor:   dto.codigoPostalReceptor,
        usoCFDI:                dto.usoCFDI ?? 'G03',
        formaPago:              dto.formaPago ?? '03',
        metodoPago:             dto.metodoPago ?? 'PUE',
        moneda:                 dto.moneda ?? 'MXN',
        tipoCambio:             dto.tipoCambio ?? 1,
        subtotal:               totalSubtotal,
        totalImpuestosTrasladados: totalIVA,
        total:                  totalFactura,
        estado:                 EstadoFactura.TIMBRADA,
        uuid:                   timbre.Complement?.TaxStamp?.Uuid ?? timbre.Id,
        facturamaId:            timbre.Id,
        xmlTimbrado:            timbre.Xml ?? '',
        notas:                  dto.notas,
      });
      const facturaGuardada = await qr.manager.save(factura);

      // Guardar partidas
      const partidasEntidades = partidas.map(({ p, subtotal, descuento, tasaIVA, montoIVA, total, idx }) =>
        qr.manager.create(PartidaFactura, {
          facturaId:        facturaGuardada.id,
          productoId:       p.productoId ?? null,
          claveSAT:         p.claveSAT,
          claveUnidadSAT:   p.claveUnidadSAT,
          unidadMedida:     p.unidadMedida ?? 'Pieza',
          noIdentificacion: p.noIdentificacion,
          descripcion:      p.descripcion,
          cantidad:         p.cantidad,
          precioUnitario:   p.precioUnitario,
          descuento,
          subtotal,
          objetoImpuesto:   tasaIVA > 0 ? '02' : '01',
          tasaIVA,
          montoIVA,
          total,
          orden: idx,
        })
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
      throw new BadRequestException('Solo se pueden cancelar facturas timbradas.');
    }
    const config = await this.obtenerConfig(empresaId);
    await this.facturamaService.cancelarCFDI(
      config, factura.facturamaId, motivo, uuidSustitucion
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
    if (!factura.facturamaId) throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    return this.facturamaService.descargarDocumento(config, factura.facturamaId, 'pdf');
  }

  async descargarXML(id: string, empresaId: string): Promise<Buffer> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (!factura.facturamaId) throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    return this.facturamaService.descargarDocumento(config, factura.facturamaId, 'xml');
  }

  async enviarCorreo(id: string, empresaId: string, correo?: string): Promise<void> {
    const factura = await this.obtenerPorId(id, empresaId);
    if (!factura.facturamaId) throw new BadRequestException('Factura no timbrada.');
    const config = await this.obtenerConfig(empresaId);
    const email = correo ?? factura.cliente?.email;
    if (!email) throw new BadRequestException('No hay correo configurado para este cliente.');
    await this.facturamaService.enviarPorCorreo(config, factura.facturamaId, email);
  }
}