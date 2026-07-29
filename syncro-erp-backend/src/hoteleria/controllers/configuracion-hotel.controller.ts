// hoteleria/controllers/configuracion-hotel.controller.ts
import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ConfiguracionHotelService } from '../services/configuracion-hotel.service';
import {
    CrearHotelDto, CrearTipoHabitacionDto, CrearHabitacionDto, GuardarDotacionDto,
} from '../dto/hoteleria.dtos';

@Controller('hoteleria/config')
export class ConfiguracionHotelController {
    constructor(private readonly svc: ConfiguracionHotelService) { }

    // Hoteles
    @Post('hoteles')
    crearHotel(@Body() dto: CrearHotelDto, @ActiveUser('empresaId') e: string) {
        return this.svc.crearHotel(dto, e);
    }
    @Get('hoteles')
    hoteles(@ActiveUser('empresaId') e: string) {
        return this.svc.obtenerHoteles(e);
    }
    @Patch('hoteles/:id')
    actHotel(@Param('id') id: string, @Body() dto: any, @ActiveUser('empresaId') e: string) {
        return this.svc.actualizarHotel(id, dto, e);
    }

    // Tipos de habitación
    @Post('tipos')
    crearTipo(@Body() dto: CrearTipoHabitacionDto, @ActiveUser('empresaId') e: string) {
        return this.svc.crearTipo(dto, e);
    }
    @Get('tipos')
    tipos(@Query('hotelId') hotelId: string, @ActiveUser('empresaId') e: string) {
        return this.svc.obtenerTipos(hotelId, e);
    }
    @Patch('tipos/:id')
    actTipo(@Param('id') id: string, @Body() dto: any, @ActiveUser('empresaId') e: string) {
        return this.svc.actualizarTipo(id, dto, e);
    }

    // Habitaciones
    @Post('habitaciones')
    crearHab(@Body() dto: CrearHabitacionDto, @ActiveUser('empresaId') e: string) {
        return this.svc.crearHabitacion(dto, e);
    }
    @Post('habitaciones/lote')
    crearLote(
        @Body() body: { hotelId: string; tipoHabitacionId: string; piso: number; desde: number; hasta: number },
        @ActiveUser('empresaId') e: string,
    ) {
        return this.svc.crearHabitacionesLote(
            body.hotelId, body.tipoHabitacionId, body.piso, body.desde, body.hasta, e,
        );
    }
    @Get('habitaciones')
    habitaciones(@Query('hotelId') hotelId: string, @ActiveUser('empresaId') e: string) {
        return this.svc.obtenerHabitaciones(hotelId, e);
    }
    @Patch('habitaciones/:id')
    actHab(@Param('id') id: string, @Body() dto: any, @ActiveUser('empresaId') e: string) {
        return this.svc.actualizarHabitacion(id, dto, e);
    }

    // Dotación de insumos por tipo
    @Post('dotacion')
    guardarDotacion(@Body() dto: GuardarDotacionDto, @ActiveUser('empresaId') e: string) {
        return this.svc.guardarDotacion(dto, e);
    }
    @Get('dotacion')
    dotacion(@Query('tipoHabitacionId') tipoId: string, @ActiveUser('empresaId') e: string) {
        return this.svc.obtenerDotacion(tipoId, e);
    }

    @Post('precargar-demo')
    precargarDemo(@ActiveUser('empresaId') e: string) {
        return this.svc.precargarDemo(e);
    }
}