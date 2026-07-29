// recetas/controllers/recetas.controller.ts
import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { RecetasService } from '../services/recetas.service';
import { GuardarRecetaDto, ProducirDto } from '../dtos/recetas.dtos';

@Controller('recetas')
export class RecetasController {
  constructor(private readonly svc: RecetasService) {}

  @Get()
  listar(@ActiveUser('empresaId') e: string): Promise<any> {
    return this.svc.listarRecetas(e);
  }

  @Get('producto/:productoId')
  obtener(@Param('productoId') productoId: string, @ActiveUser('empresaId') e: string): Promise<any> {
    return this.svc.obtenerReceta(productoId, e);
  }

  @Post('guardar')
  guardar(@Body() dto: GuardarRecetaDto, @ActiveUser('empresaId') e: string): Promise<any> {
    return this.svc.guardarReceta(dto, e);
  }

  // Previsualizar qué se descontaría (sin tocar inventario)
  @Get('explotar')
  explotar(
    @Query('productoId') productoId: string,
    @Query('cantidad') cantidad: string,
    @ActiveUser('empresaId') e: string,
  ): Promise<any> {
    return this.svc.explotar(productoId, Number(cantidad) || 1, e);
  }

  // Producir/vender: descuenta insumos del inventario
  @Post('producir')
  producir(@Body() dto: ProducirDto, @ActiveUser('empresaId') e: string): Promise<any> {
    return this.svc.producir(dto, e);
  }
}