import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { OrdenesCompraService } from '../services/ordenes-compra.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import {
  CambiarEstadoOrdenCompraDto,
  CrearOrdenDesdeCotizacionDto,
  PagarOrdenCompraDto,
  RecibirOrdenCompraDto,
} from '../dto/operaciones-orden-compra.dto';

@Controller('compras/ordenes')
export class OrdenesCompraController {
  constructor(private readonly ordenesService: OrdenesCompraService) {}

  @Post()
  async crear(
    @Body() dto: CrearOrdenDesdeCotizacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ordenesService.crearDesdeCotizacion(
      dto.cotizacionId,
      empresaId,
    );
  }

  @Get()
  async obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.ordenesService.obtenerTodas(empresaId);
  }

  @Navegable('/dashboard/inventario/recepciones', 'Recepciones', 6)
  @Get('recepciones')
  async obtenerRecepciones(@ActiveUser('empresaId') empresaId: string) {
    // Retorna OC en estado ENVIADA (pendientes de recibir) y RECIBIDA reciente
    return this.ordenesService.obtenerParaRecepcion(empresaId);
  }

  @Get(':id')
  async obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ordenesService.obtenerPorId(id, empresaId);
  }

  @Patch(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoOrdenCompraDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ordenesService.cambiarEstado(id, empresaId, dto.estado);
  }

  @Patch(':id/recibir')
  async recibir(
    @Param('id') id: string,
    @Body() dto: RecibirOrdenCompraDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.ordenesService.recibir(
      id,
      empresaId,
      dto.almacenId,
      dto.detalles,
      { id: usuarioId },
    );
  }

  @Navegable('/dashboard/compras/pago-proveedores', 'Pago a Proveedores', 7)
  @Patch(':id/pagar')
  async pagar(
    @Param('id') id: string,
    @Body() body: PagarOrdenCompraDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.ordenesService.pagarOrden(id, empresaId, body, usuarioId);
  }

  @Get('dashboard/pendientes')
  async pendientes(@ActiveUser('empresaId') empresaId: string) {
    const pendientes = await this.ordenesService.contarPendientes(empresaId);
    return { pendientes };
  }
}
