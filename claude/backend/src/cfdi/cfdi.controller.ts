import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Response } from 'express';
import { CfdiService } from './cfdi.service';
import { CrearFacturaDto } from './crear-factura.dto';
import { EstadoFactura } from './factura.entity';
import { ConfiguracionMexicoService } from './configuracion-mexico.service';
import { ConfiguracionMexicoDto } from './configuracion-mexico.dto';
import { TimbrarVentaDto } from './timbrar-venta.dto';
import {
  CancelarCfdiDto,
  EnviarCfdiCorreoDto,
  GuardarConfiguracionFiscalDto,
} from './configuracion-fiscal.dto';

@Controller('cfdi')
export class CfdiController {
  constructor(
    private readonly cfdiService: CfdiService,
    private readonly configuracionMexicoService: ConfiguracionMexicoService,
  ) {}

  // ── CONFIGURACIÓN FISCAL ──────────────────────────────────────────

  @Get('config')
  obtenerConfig(@Req() req) {
    return this.cfdiService.obtenerConfigPublica(req.user.empresaId);
  }

  @Post('config')
  guardarConfig(@Body() dto: GuardarConfiguracionFiscalDto, @Req() req) {
    return this.cfdiService.guardarConfig(req.user.empresaId, dto);
  }

  @Get('configuracion-mexico/catalogos')
  obtenerCatalogosMexico() {
    return this.configuracionMexicoService.catalogos();
  }

  @Get('configuracion-mexico/diagnostico')
  diagnosticoMexico(@Req() req) {
    return this.configuracionMexicoService.diagnostico(req.user.empresaId);
  }

  @Post('configuracion-mexico/aplicar')
  aplicarConfiguracionMexico(
    @Body() dto: ConfiguracionMexicoDto,
    @Req() req,
  ) {
    return this.configuracionMexicoService.aplicar(req.user.empresaId, dto);
  }

  // ── FACTURAS ──────────────────────────────────────────────────────

  @Get()
  obtenerFacturas(
    @Req() req,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
    @Query('estado') estado?: EstadoFactura,
  ) {
    return this.cfdiService.obtenerFacturas(
      req.user.empresaId,
      pagina,
      limite,
      estado,
    );
  }

  @Get(':id')
  obtenerPorId(@Param('id') id: string, @Req() req) {
    return this.cfdiService.obtenerPorId(id, req.user.empresaId);
  }

  @Post('ventas/:ventaId/timbrar')
  @HttpCode(HttpStatus.CREATED)
  timbrarVenta(
    @Param('ventaId') ventaId: string,
    @Body() dto: TimbrarVentaDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req,
  ) {
    return this.cfdiService.timbrarVenta(
      ventaId,
      dto,
      req.user.empresaId,
      idempotencyKey,
    );
  }

  @Post('pagos/complementos-pendientes/procesar')
  procesarComplementosPendientes(
    @Query('limite', new DefaultValuePipe(50), ParseIntPipe) limite: number,
    @Req() req,
  ) {
    return this.cfdiService.generarComplementosPendientes(
      req.user.empresaId,
      limite,
    );
  }

  @Post('pagos/:pagoId/complemento-pago/reintentar')
  reintentarComplementoPago(
    @Param('pagoId') pagoId: string,
    @Req() req,
  ) {
    return this.cfdiService.crearComplementoPagoDesdeCobranza(
      pagoId,
      req.user.empresaId,
    );
  }

  @Post('devoluciones/notas-credito-pendientes/procesar')
  procesarNotasCreditoPendientes(
    @Query('limite', new DefaultValuePipe(50), ParseIntPipe) limite: number,
    @Req() req,
  ) {
    return this.cfdiService.generarNotasCreditoPendientes(
      req.user.empresaId,
      limite,
    );
  }

  @Post('devoluciones/:devolucionId/nota-credito/reintentar')
  reintentarNotaCredito(
    @Param('devolucionId') devolucionId: string,
    @Req() req,
  ) {
    return this.cfdiService.crearNotaCreditoDesdeDevolucion(
      devolucionId,
      req.user.empresaId,
    );
  }

  @Post('timbrar')
  @HttpCode(HttpStatus.CREATED)
  timbrar(
    @Body() dto: CrearFacturaDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req,
  ) {
    return this.cfdiService.crearYTimbrar(
      dto,
      req.user.empresaId,
      idempotencyKey,
    );
  }

  @Post(':id/reintentar-timbrado')
  reintentarTimbrado(@Param('id') id: string, @Req() req) {
    return this.cfdiService.reintentarTimbrado(id, req.user.empresaId);
  }

  @Delete(':id/cancelar')
  cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarCfdiDto,
    @Req() req,
  ) {
    return this.cfdiService.cancelar(
      id,
      req.user.empresaId,
      dto.motivo,
      dto.uuidSustitucion,
    );
  }

  // ── DESCARGAS ─────────────────────────────────────────────────────

  @Get(':id/pdf')
  async descargarPDF(
    @Param('id') id: string,
    @Req() req,
    @Res() res: Response,
  ) {
    const buffer = await this.cfdiService.descargarPDF(id, req.user.empresaId);
    const factura = await this.cfdiService.obtenerPorId(id, req.user.empresaId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${factura.serie}${factura.folio}.pdf"`,
    );
    res.send(buffer);
  }

  @Get(':id/xml')
  async descargarXML(
    @Param('id') id: string,
    @Req() req,
    @Res() res: Response,
  ) {
    const buffer = await this.cfdiService.descargarXML(id, req.user.empresaId);
    const factura = await this.cfdiService.obtenerPorId(id, req.user.empresaId);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${factura.serie}${factura.folio}.xml"`,
    );
    res.send(buffer);
  }

  @Post(':id/enviar-correo')
  enviarCorreo(
    @Param('id') id: string,
    @Body() dto: EnviarCfdiCorreoDto,
    @Req() req,
  ) {
    return this.cfdiService.enviarCorreo(id, req.user.empresaId, dto.correo);
  }
}
