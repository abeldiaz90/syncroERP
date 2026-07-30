/**
 * ============================================================================
 * SyncroERP · CRM — controlador
 * ============================================================================
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CrmService } from '../services/crm.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import type {
  Actividad,
  EtapaEmbudo,
  Oportunidad,
  Prospecto,
} from '../entities/crm.entity';

@ApiTags('CRM')
@ApiBearerAuth('jwt')
@Controller('crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  /* ── Pipeline ──────────────────────────────────────────────────────────── */

  @Get('pipeline')
  @ApiOperation({ summary: 'Tablero por etapas con pronóstico ponderado' })
  pipeline(
    @ActiveUser('empresaId') empresaId: string,
    @Query('responsableId') responsableId?: string,
  ) {
    return this.svc.pipeline(empresaId, responsableId);
  }

  @Get('metricas')
  @ApiOperation({ summary: 'Conversión, ciclo de venta y motivos de pérdida' })
  metricas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    return this.svc.metricas(empresaId, desde, hasta);
  }

  @Get('agenda')
  @ApiOperation({ summary: 'Actividades de hoy y atrasadas' })
  agenda(
    @ActiveUser('empresaId') empresaId: string,
    @Query('responsableId') responsableId?: string,
  ) {
    return this.svc.agenda(empresaId, responsableId);
  }

  /* ── Etapas ────────────────────────────────────────────────────────────── */

  @Get('etapas')
  etapas(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarEtapas(empresaId);
  }

  @Post('etapas')
  crearEtapa(
    @Body() dto: Partial<EtapaEmbudo>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearEtapa(dto, empresaId);
  }

  @Post('etapas/sembrar')
  @ApiOperation({ summary: 'Crea el embudo estándar de siete etapas' })
  sembrarEtapas(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.sembrarEtapas(empresaId);
  }

  /* ── Prospectos ────────────────────────────────────────────────────────── */

  @Get('prospectos')
  prospectos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.svc.listarProspectos(empresaId, busqueda);
  }

  @Post('prospectos')
  crearProspecto(
    @Body() dto: Partial<Prospecto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearProspecto(dto, empresaId);
  }

  /* ── Oportunidades ─────────────────────────────────────────────────────── */

  @Get('oportunidades')
  listarOportunidades(
    @ActiveUser('empresaId') empresaId: string,
    @Query('etapaId') etapaId?: string,
    @Query('responsableId') responsableId?: string,
    @Query('busqueda') busqueda?: string,
    @Query('soloAbiertas') soloAbiertas?: string,
  ) {
    return this.svc.listarOportunidades(empresaId, {
      etapaId,
      responsableId,
      busqueda,
      soloAbiertas: soloAbiertas === 'true',
    });
  }

  @Post('oportunidades')
  crearOportunidad(
    @Body() dto: Partial<Oportunidad>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearOportunidad(dto, empresaId);
  }

  @Get('oportunidades/:id')
  obtenerOportunidad(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerOportunidad(id, empresaId);
  }

  @Patch('oportunidades/:id/etapa')
  @ApiOperation({
    summary: 'Mueve la oportunidad de etapa',
    description:
      'Registra el historial y cierra la oportunidad si la etapa es terminal.',
  })
  moverEtapa(
    @Param('id') id: string,
    @Body()
    body: { etapaId: string; motivoPerdida?: string; competidor?: string },
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.moverEtapa(id, body, empresaId, usuarioId);
  }

  /* ── Actividades ───────────────────────────────────────────────────────── */

  @Get('actividades')
  listarActividades(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('responsableId') responsableId?: string,
    @Query('oportunidadId') oportunidadId?: string,
    @Query('pendientes') pendientes?: string,
  ) {
    return this.svc.listarActividades(empresaId, {
      desde,
      hasta,
      responsableId,
      oportunidadId,
      pendientes: pendientes === 'true',
    });
  }

  @Post('actividades')
  crearActividad(
    @Body() dto: Partial<Actividad>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearActividad(dto, empresaId);
  }

  @Patch('actividades/:id/completar')
  completar(
    @Param('id') id: string,
    @Body() body: { resultado: string },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.completarActividad(id, body.resultado, empresaId);
  }
}
