// hoteleria/controllers/auditoria-nocturna.controller.ts
import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { AuditoriaNocturnaService } from '../services/auditoria-nocturna.service';
import { EjecutarAuditoriaNocturnaDto } from '../dto/auditoria-nocturna.dto';

@Controller('hoteleria/auditoria')
export class AuditoriaNocturnaController {
  constructor(private readonly svc: AuditoriaNocturnaService) {}

  // Estado actual: fecha operativa, última auditoría, huéspedes hospedados
  @Get('estado')
  estado(
    @Query('hotelId') hotelId: string,
    @ActiveUser('empresaId') e: string,
  ): Promise<any> {
    return this.svc.estado(hotelId, e);
  }

  // Ejecutar la auditoría manualmente (botón "Correr auditoría")
  @Post('ejecutar')
  ejecutar(
    @Body() dto: EjecutarAuditoriaNocturnaDto,
    @ActiveUser('empresaId') e: string,
  ): Promise<any> {
    return this.svc.ejecutarManual(dto.hotelId, e);
  }
}
