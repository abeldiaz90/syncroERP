import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import {
  CancelarFacturaProveedorDto,
  RegistrarFacturaProveedorDto,
} from '../dto/factura-proveedor.dto';
import { FacturasProveedorService } from '../services/facturas-proveedor.service';

@ApiTags('Compras')
@ApiBearerAuth('jwt')
@Controller('compras/facturas-proveedor')
export class FacturasProveedorController {
  constructor(private readonly svc: FacturasProveedorService) {}

  @Navegable('/dashboard/compras/facturas-proveedor', 'Facturas de proveedor', 14)
  @Get()
  @ApiOperation({ summary: 'Las facturas de proveedor capturadas' })
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ordenCompraId') ordenCompraId?: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listar(empresaId, { ordenCompraId, proveedorId, estado });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una factura con sus partidas y el resultado del cotejo' })
  obtener(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtener(id, empresaId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Captura la factura del proveedor y la coteja contra la orden y lo recibido en el mismo acto',
  })
  registrar(
    @Body() dto: RegistrarFacturaProveedorDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.registrar(empresaId, usuarioId, dto);
  }

  @Patch(':id/recotejar')
  @ApiOperation({
    summary: 'Vuelve a cotejar: lo que faltaba al capturar pudo haber llegado después',
  })
  recotejar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.recotejar(id, empresaId);
  }

  @Patch(':id/cancelar')
  @ApiOperation({ summary: 'Cancela la factura, si no tiene pagos que quedarían sin respaldo' })
  cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarFacturaProveedorDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.cancelar(id, empresaId, dto.motivo);
  }
}
