/**
 * ============================================================================
 * SyncroERP · Activos fijos — controlador
 * ----------------------------------------------------------------------------
 * Nota sobre permisos: este controlador NO lleva `@SkipPermisos()`. En el
 * proyecto original, 11 de 44 controladores lo tenían a nivel de clase,
 * incluidos pólizas, cuentas contables y créditos, lo que anulaba por completo
 * el sistema de permisos para esos módulos. Aquí se respeta el guard.
 * ============================================================================
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ActivosService } from '../services/activos.service';
import {
  BajaActivoDto,
  CrearActivoDto,
  CrearCategoriaActivoDto,
  PeriodoDepreciacionDto,
} from '../dto/activos.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { EstadoActivo } from '../entities/activo-fijo.entity';

@ApiTags('Activos fijos')
@ApiBearerAuth('jwt')
@Controller('activos')
export class ActivosController {
  constructor(private readonly svc: ActivosService) {}

  /* ── Consulta ──────────────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({ summary: 'Listado de activos con filtros' })
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoActivo,
    @Query('categoriaId') categoriaId?: string,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.svc.listar(empresaId, { estado, categoriaId, busqueda });
  }

  @Get('resumen')
  @ApiOperation({
    summary:
      'Indicadores del módulo: costo, valor en libros y desglose por categoría',
  })
  resumen(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.resumen(empresaId);
  }

  @Get('categorias')
  categorias(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarCategorias(empresaId);
  }

  @Post('categorias')
  crearCategoria(
    @Body() dto: CrearCategoriaActivoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearCategoria(dto, empresaId);
  }

  @Post('categorias/sembrar')
  @ApiOperation({
    summary: 'Crea las categorías con las tasas máximas del art. 34 LISR',
  })
  sembrar(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.sembrarCategorias(empresaId);
  }

  @Get('reportes/cedula')
  @ApiOperation({ summary: 'Cédula de depreciación del ejercicio' })
  cedula(
    @Query('ejercicio', ParseIntPipe) ejercicio: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.cedula(ejercicio, empresaId);
  }

  /* ── Depreciación ──────────────────────────────────────────────────────── */

  @Post('depreciacion/corrida')
  @ApiOperation({
    summary: 'Deprecia todos los activos del periodo',
    description:
      'Es idempotente: repetir la llamada no duplica el gasto del mes.',
  })
  correr(
    @Body() body: PeriodoDepreciacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.correrDepreciacion(body.ejercicio, body.mes, empresaId);
  }

  @Post('depreciacion/revertir')
  @ApiOperation({
    summary: 'Revierte la corrida del último periodo depreciado',
  })
  revertir(
    @Body() body: PeriodoDepreciacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.revertirCorrida(body.ejercicio, body.mes, empresaId);
  }

  /* ── Alta, detalle y baja ──────────────────────────────────────────────── */

  @Post()
  crear(
    @Body() dto: CrearActivoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crear(dto, empresaId);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtener(id, empresaId);
  }

  @Patch(':id/baja')
  @ApiOperation({
    summary: 'Da de baja el activo y calcula la utilidad o pérdida',
  })
  baja(
    @Param('id') id: string,
    @Body() body: BajaActivoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.darDeBaja(id, body, empresaId);
  }
}
