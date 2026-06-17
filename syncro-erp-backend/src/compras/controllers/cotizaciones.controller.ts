import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
} from '@nestjs/common';
import { CotizacionesService } from '../services/cotizaciones.service';
import { CrearCotizacionDto } from '../dto/crear-cotizacion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('compras/cotizaciones')
export class CotizacionesController {
    constructor(private readonly cotizacionesService: CotizacionesService) { }

    @Post()
    crear(
        @Body() dto: CrearCotizacionDto,
        @ActiveUser('empresaId') empresaId: string,
    ) {
        return this.cotizacionesService.crear(dto, empresaId);
    }

    @Get('requisicion/:id')
    obtenerPorRequisicion(
        @Param('id') id: string,
        @ActiveUser('empresaId') empresaId: string,
    ) {
        return this.cotizacionesService.obtenerPorRequisicion(id, empresaId);
    }

    @Patch(':id/seleccionar')
    seleccionar(
        @Param('id') id: string,
        @ActiveUser('empresaId') empresaId: string,
    ) {
        return this.cotizacionesService.seleccionar(id, empresaId);
    }

    @Get(':id')
    async obtenerPorId(
        @Param('id') id: string,
        @ActiveUser('empresaId') empresaId: string,
    ) {
        return this.cotizacionesService.obtenerPorId(id, empresaId);
    }
}