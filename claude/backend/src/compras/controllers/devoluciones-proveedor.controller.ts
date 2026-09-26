import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { DevolucionesProveedorService } from '../services/devoluciones-proveedor.service';
import { CrearDevolucionProveedorDto } from '../dto/devolucion-proveedor.dto';

@ApiTags('Compras')
@ApiBearerAuth('jwt')
@Controller('compras/devoluciones')
export class DevolucionesProveedorController {
  constructor(private readonly svc: DevolucionesProveedorService) {}

  @Navegable('/dashboard/compras/devoluciones', 'Devoluciones a proveedor', 13)
  @Get()
  @ApiOperation({ summary: 'Las devoluciones registradas' })
  listar(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listar(empresaId);
  }

  @Get('devolvible')
  @ApiOperation({
    summary: 'Qué se puede devolver de una orden: lo recibido menos lo ya devuelto',
  })
  devolvible(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ordenCompraId') ordenCompraId: string,
  ) {
    return this.svc.devolvible(ordenCompraId, empresaId);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra la devolución: saca la mercancía y afecta la cuenta por pagar',
  })
  crear(
    @Body() dto: CrearDevolucionProveedorDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.crear(dto, empresaId, usuarioId);
  }
}
