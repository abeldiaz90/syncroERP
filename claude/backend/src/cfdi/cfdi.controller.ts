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

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * AQUÍ HABÍA UN `POST /cfdi/timbrar`, Y SE QUITÓ (5-oct-2026)
   * --------------------------------------------------------------------------
   * Entregaba `CrearFacturaDto` tal cual al motor, con sus partidas e importes
   * puestos a mano y un `ventaId` opcional. Comprobaba que la venta existiera y
   * que no tuviera ya un CFDI vigente, y ahí se acababa. `timbrarVenta` —la
   * puerta de la pantalla— comprueba tres cosas más:
   *
   *   · que la venta no esté ANULADA;
   *   · que lo devuelto no se facture: arma las partidas con
   *     `cantidad − cantidadDevuelta` y se niega si no queda nada;
   *   · que los importes y la tasa salgan de la venta y del catálogo SAT, no de
   *     lo que mande quien llama.
   *
   * Y lo peor no era poder timbrar de más, sino el candado. Las dos puertas
   * derivan la misma clave de idempotencia, `VENTA:<id>`. Un timbrado por aquí
   * la consumía, y el timbrado bueno que viniera después encontraba esa clave
   * TIMBRADA y **devolvía el CFDI equivocado dando éxito**. El camino correcto
   * no fallaba: mentía.
   *
   * Ninguna pantalla lo usaba —`/dashboard/ventas/[id]/facturar` manda a
   * `/cfdi/ventas/:ventaId/timbrar`—. `crearYTimbrar` sigue siendo el motor y lo
   * llaman desde dentro `timbrarVenta` y la nota de crédito.
   * ──────────────────────────────────────────────────────────────────────────
   */

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
