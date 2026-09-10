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
import { extname } from 'path';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { ImportacionProductosService } from '../services/importacion-productos.service';
import { PlantillaInventarioService } from '../services/plantilla-inventario.service';
import { esExcelReal } from '../../common/utils/file-signature.util';

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
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        const permitido = extension === '.xlsx' || extension === '.xls';
        cb(
          permitido
            ? null
            : new BadRequestException('El archivo debe ser .xlsx o .xls'),
          permitido,
        );
      },
    }),
  )
  async importar(
    @UploadedFile() archivo: Express.Multer.File,
    @ActiveUser('empresaId') empresaId: string,
    @Query('modo') modo: 'validar' | 'aplicar' = 'aplicar',
  ) {
    if (!archivo?.buffer)
      throw new BadRequestException(
        'No se recibió el archivo (campo "archivo")',
      );
    const extension = extname(archivo.originalname).toLowerCase();
    if (!esExcelReal(archivo.buffer, extension)) {
      throw new BadRequestException(
        'El contenido del archivo no corresponde a un Excel válido.',
      );
    }
    if (!['validar', 'aplicar'].includes(modo)) {
      throw new BadRequestException('El modo debe ser validar o aplicar.');
    }

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
