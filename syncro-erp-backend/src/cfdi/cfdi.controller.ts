import {
  Controller, Get, Post, Delete, Param, Body,
  Query, Req, Res, DefaultValuePipe, ParseIntPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CfdiService } from './cfdi.service';
import { CrearFacturaDto } from './crear-factura.dto';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { EstadoFactura } from './factura.entity';

@Controller('cfdi')
export class CfdiController {
  constructor(private readonly cfdiService: CfdiService) {}

  // ── CONFIGURACIÓN FISCAL ──────────────────────────────────────────

  @Get('config')
  obtenerConfig(@Req() req) {
    return this.cfdiService.obtenerConfig(req.user.empresaId);
  }

  @Post('config')
  guardarConfig(@Body() dto: Partial<ConfiguracionFiscal>, @Req() req) {
    return this.cfdiService.guardarConfig(req.user.empresaId, dto);
  }

  // ── FACTURAS ──────────────────────────────────────────────────────

  @Get()
  obtenerFacturas(
    @Req() req,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
    @Query('estado') estado?: EstadoFactura,
  ) {
    return this.cfdiService.obtenerFacturas(req.user.empresaId, pagina, limite, estado);
  }

  @Get(':id')
  obtenerPorId(@Param('id') id: string, @Req() req) {
    return this.cfdiService.obtenerPorId(id, req.user.empresaId);
  }

  @Post('timbrar')
  @HttpCode(HttpStatus.CREATED)
  timbrar(@Body() dto: CrearFacturaDto, @Req() req) {
    return this.cfdiService.crearYTimbrar(dto, req.user.empresaId);
  }

  @Delete(':id/cancelar')
  cancelar(
    @Param('id') id: string,
    @Body('motivo') motivo: string,
    @Body('uuidSustitucion') uuidSustitucion: string,
    @Req() req,
  ) {
    return this.cfdiService.cancelar(
      id, req.user.empresaId, motivo ?? '02', uuidSustitucion
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
    @Body('correo') correo: string,
    @Req() req,
  ) {
    return this.cfdiService.enviarCorreo(id, req.user.empresaId, correo);
  }
}