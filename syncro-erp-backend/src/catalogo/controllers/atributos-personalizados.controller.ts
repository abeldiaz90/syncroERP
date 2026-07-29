import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { AtributosPersonalizadosService } from '../services/atributos-personalizados.service';

/**
 * Constructor de atributos dinámicos.
 *
 *   GET    /catalogo/atributos-personalizados/grupos?incluirDefiniciones=1
 *   POST   /catalogo/atributos-personalizados/grupos
 *   PATCH  /catalogo/atributos-personalizados/grupos/:id
 *   DELETE /catalogo/atributos-personalizados/grupos/:id
 *   POST   /catalogo/atributos-personalizados/grupos/:id/definiciones
 *   PATCH  /catalogo/atributos-personalizados/definiciones/:id
 *   DELETE /catalogo/atributos-personalizados/definiciones/:id
 *   POST   /catalogo/atributos-personalizados/precargar-ejemplos
 */
@Controller('catalogo/atributos-personalizados')
export class AtributosPersonalizadosController {
  constructor(private readonly servicio: AtributosPersonalizadosService) {}

  // ── grupos ──
  @Navegable('/dashboard/productos/atributos', 'Atributos Personalizados', 29)
  @Get('grupos')
  listarGrupos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('incluirDefiniciones') incluir?: string,
  ) {
    return this.servicio.listarGrupos(empresaId, incluir === '1' || incluir === 'true');
  }

  @Post('grupos')
  crearGrupo(
    @ActiveUser('empresaId') empresaId: string,
    @Body() dto: { nombre: string; descripcion?: string; orden?: number },
  ) {
    return this.servicio.crearGrupo(empresaId, dto);
  }

  @Patch('grupos/:id')
  actualizarGrupo(
    @ActiveUser('empresaId') empresaId: string,
    @Param('id') id: string,
    @Body() dto: { nombre?: string; descripcion?: string; orden?: number },
  ) {
    return this.servicio.actualizarGrupo(empresaId, id, dto);
  }

  @Delete('grupos/:id')
  eliminarGrupo(
    @ActiveUser('empresaId') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.servicio.eliminarGrupo(empresaId, id);
  }

  // ── definiciones (campos) ──
  @Post('grupos/:id/definiciones')
  crearDefinicion(
    @ActiveUser('empresaId') empresaId: string,
    @Param('id') grupoId: string,
    @Body() dto: {
      etiqueta: string; tipoValor?: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
      unidad?: string; opciones?: string; requerido?: boolean; orden?: number;
    },
  ) {
    return this.servicio.crearDefinicion(empresaId, grupoId, dto);
  }

  @Patch('definiciones/:id')
  actualizarDefinicion(
    @ActiveUser('empresaId') empresaId: string,
    @Param('id') id: string,
    @Body() dto: {
      etiqueta?: string; tipoValor?: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
      unidad?: string; opciones?: string; requerido?: boolean; orden?: number;
    },
  ) {
    return this.servicio.actualizarDefinicion(empresaId, id, dto);
  }

  @Delete('definiciones/:id')
  eliminarDefinicion(
    @ActiveUser('empresaId') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.servicio.eliminarDefinicion(empresaId, id);
  }

  // ── plantillas de ejemplo ──
  @Post('precargar-ejemplos')
  precargarEjemplos(@ActiveUser('empresaId') empresaId: string) {
    return this.servicio.precargarEjemplos(empresaId);
  }
}
