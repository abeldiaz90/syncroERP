import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { PlantillaStockInicialService } from '../services/plantilla-stock-inicial.service';
import { ImportacionStockInicialService } from '../services/importacion-stock-inicial.service';

/**
 * Carga de stock inicial (saldos de apertura de inventario).
 * Rutas bajo el MISMO prefijo /catalogo/importacion que ya existe,
 * para no chocar con productos/:id (la lección aprendida).
 *
 *   GET  /api/catalogo/importacion/stock-inicial/plantilla
 *   POST /api/catalogo/importacion/stock-inicial?modo=validar|aplicar
 */
@Controller('catalogo/importacion/stock-inicial')
export class ImportacionStockController {
  constructor(
    private readonly plantilla: PlantillaStockInicialService,
    private readonly importacion: ImportacionStockInicialService,
  ) {}

  @Navegable(
    '/dashboard/inventario/stock-inicial',
    'Carga de Stock Inicial',
    28,
  )
  @Get('plantilla')
  async descargarPlantilla(
    @ActiveUser('empresaId') empresaId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.plantilla.generar(empresaId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="Plantilla-Stock-Inicial-SyncroERP.xlsx"',
    });
    res.send(buffer);
  }

  @Post()
  @UseInterceptors(FileInterceptor('archivo'))
  async importar(
    @UploadedFile() archivo: any,
    @Query('modo') modo: 'validar' | 'aplicar' = 'validar',
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!archivo?.buffer) {
      throw new BadRequestException(
        "No se recibió el archivo (campo 'archivo' del formulario).",
      );
    }
    if (modo !== 'validar' && modo !== 'aplicar') {
      throw new BadRequestException("El modo debe ser 'validar' o 'aplicar'.");
    }
    return this.importacion.importar(archivo.buffer, modo, empresaId);
  }
}
