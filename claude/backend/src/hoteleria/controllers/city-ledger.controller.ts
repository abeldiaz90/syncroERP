import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  CancelarConvenioHotelDto,
  CrearConvenioHotelDto,
  ReenviarConvenioHotelDto,
  RegistrarCobroCityLedgerDto,
  SuspenderConvenioHotelDto,
} from '../dto/city-ledger.dtos';
import { CityLedgerService } from '../services/city-ledger.service';

@Controller('hoteleria/city-ledger')
export class CityLedgerController {
  constructor(private readonly service: CityLedgerService) {}

  @Get('convenios')
  convenios(
    @ActiveUser('empresaId') empresaId: string,
    @Query('hotelId') hotelId?: string,
  ) {
    return this.service.listarConvenios(empresaId, hotelId);
  }

  @Post('convenios')
  crearConvenio(
    @Body() dto: CrearConvenioHotelDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.crearConvenio(dto, empresaId, usuarioId);
  }

  @Patch('convenios/:id/suspender')
  suspenderConvenio(
    @Param('id') id: string,
    @Body() dto: SuspenderConvenioHotelDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.service.suspenderConvenio(id, dto, empresaId, usuarioId, rol);
  }

  @Post('convenios/:id/reenviar')
  reenviarConvenio(
    @Param('id') id: string,
    @Body() dto: ReenviarConvenioHotelDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.reenviarConvenio(id, dto, empresaId, usuarioId);
  }

  @Patch('convenios/:id/cancelar')
  cancelarConvenio(
    @Param('id') id: string,
    @Body() dto: CancelarConvenioHotelDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.service.cancelarConvenio(
      id,
      dto,
      empresaId,
      usuarioId,
      rol,
    );
  }

  @Get('cartera')
  cartera(
    @ActiveUser('empresaId') empresaId: string,
    @Query('convenioId') convenioId?: string,
  ) {
    return this.service.listarCartera(empresaId, convenioId);
  }

  @Post('cobros')
  cobrar(
    @Body() dto: RegistrarCobroCityLedgerDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.registrarCobro(dto, empresaId, usuarioId);
  }

  @Get('cuentas/:id/cobros')
  cobros(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.listarCobros(id, empresaId);
  }

  @Get('diagnostico-historico')
  diagnostico(@ActiveUser('empresaId') empresaId: string) {
    return this.service.diagnosticoHistorico(empresaId);
  }

  @Get('preparacion-produccion')
  preparacion(@ActiveUser('empresaId') empresaId: string) {
    return this.service.verificarPreparacionProduccion(empresaId);
  }
}
