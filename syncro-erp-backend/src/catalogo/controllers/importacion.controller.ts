import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { ImportacionProductosService } from '../services/importacion-productos.service';
import { PlantillaInventarioService } from '../services/plantilla-inventario.service';

@Controller('catalogo/importacion')
export class ImportacionController {
  constructor(
    private readonly importacion: ImportacionProductosService,
    private readonly plantilla: PlantillaInventarioService,
  ) {}

  /**
   * Carga masiva de productos desde Excel.
   * Ruta final: POST /api/catalogo/importacion/productos
   * @param modo 'validar' devuelve solo el reporte (sin guardar);
   *             'aplicar' persiste los cambios (upsert por SKU).
   */
  @Post('productos')
  @UseInterceptors(FileInterceptor('archivo'))
  async importar(
    @UploadedFile() archivo: Express.Multer.File,
    @ActiveUser('empresaId') empresaId: string,
    @Query('modo') modo: 'validar' | 'aplicar' = 'aplicar',
  ) {
    if (!archivo?.buffer)
      throw new BadRequestException('No se recibió el archivo (campo "archivo")');
    const esExcel = /\.(xlsx|xls)$/i.test(archivo.originalname);
    if (!esExcel)
      throw new BadRequestException('El archivo debe ser .xlsx o .xls');

    return this.importacion.procesar(archivo.buffer, empresaId, modo);
  }

  /**
   * Descarga la plantilla de Excel vacía (con encabezados, ejemplo y listas).
   * Ruta final: GET /api/catalogo/importacion/plantilla
   *
   * @Navegable ancla la pantalla del importador en el menú lateral:
   * el auto-sanador del IAM la registra/repara al arrancar.
   */
  @Navegable('/dashboard/inventario/importar', 'Importar Catálogo', 27)
  @Get('plantilla')
  async descargarPlantilla(@Res() res: Response) {
    const buffer = await this.plantilla.generar();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="Plantilla-Carga-Inventario.xlsx"',
    });
    res.send(buffer);
  }
}
