import { Controller, Get, Param, Query } from '@nestjs/common';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { AuditoriaService } from '../services/auditoria.service';

/**
 * Consulta de la bitácora de auditoría. SOLO LECTURA — no hay POST/PUT/DELETE
 * a propósito: la bitácora es inmutable.
 *
 *   GET /api/auditoria                → listado filtrado y paginado
 *   GET /api/auditoria/opciones       → catálogos para los filtros
 *   GET /api/auditoria/:entidad/:id   → historial de un registro concreto
 */
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Navegable('/dashboard/auditoria', 'Bitácora de Auditoría', 90)
  @Get()
  consultar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('usuarioEmail') usuarioEmail?: string,
    @Query('entidad') entidad?: string,
    @Query('accion') accion?: string,
    @Query('registroId') registroId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('pagina') pagina?: string,
    @Query('porPagina') porPagina?: string,
  ) {
    return this.auditoria.consultar(empresaId, {
      usuarioEmail, entidad, accion, registroId, desde, hasta,
      pagina: pagina ? parseInt(pagina, 10) : 1,
      porPagina: porPagina ? parseInt(porPagina, 10) : 50,
    });
  }

  @Get('opciones')
  opciones(@ActiveUser('empresaId') empresaId: string) {
    return this.auditoria.opcionesFiltro(empresaId);
  }

  @Get(':entidad/:id')
  historial(
    @ActiveUser('empresaId') empresaId: string,
    @Param('entidad') entidad: string,
    @Param('id') id: string,
  ) {
    return this.auditoria.historialDe(empresaId, entidad, id);
  }
}
