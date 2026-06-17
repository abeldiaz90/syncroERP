import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { OrdenesCompraService } from '../services/ordenes-compra.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('compras/ordenes')
export class OrdenesCompraController {
  constructor(private readonly ordenesService: OrdenesCompraService) { }

  @Post()
  async crear(
    @Body('cotizacionId') cotizacionId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ordenesService.crearDesdeCotizacion(cotizacionId, empresaId);
  }

  @Get()
  async obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.ordenesService.obtenerTodas(empresaId);
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
    @Body('estado') estado: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ordenesService.cambiarEstado(id, empresaId, estado);
  }


  @Patch(':id/recibir')
  async recibir(
    @Param('id') id: string,
    @Body('almacenId') almacenId: string,
    @Body('detalles') detalles: any[],
    @ActiveUser() usuarioActual: any,
  ) {
    // 1. Auditoría rápida para ver qué trae tu token realmente
    console.log('--- DATOS DEL USUARIO LOGUEADO ---', usuarioActual);

    // 2. Extraemos el empresaId buscando las posibles variaciones
    const idEmpresa = usuarioActual.empresaId || usuarioActual.empresa_id || usuarioActual.empresa?.id;

    if (!idEmpresa) {
      throw new BadRequestException('El token del usuario no contiene una empresa válida.');
    }

    // 3. Pasamos el idEmpresa seguro y el usuarioActual al servicio
    return this.ordenesService.recibir(id, idEmpresa, almacenId, detalles, usuarioActual);
  }

  @Get('dashboard/pendientes')
  async pendientes(@ActiveUser('empresaId') empresaId: string) {
    const pendientes = await this.ordenesService.contarPendientes(empresaId);
    return { pendientes };
  }
}