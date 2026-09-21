import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import type { Response } from 'express';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { SUBIDAS_IMPORTACIONES } from '../../common/almacenamiento/rutas-subidas';
import { esExcelReal } from '../../common/utils/file-signature.util';
import { PlantillaStockInicialService } from '../services/plantilla-stock-inicial.service';
import { ImportacionStockInicialMasivaService } from '../services/importacion-stock-inicial-masiva.service';

const directorio = SUBIDAS_IMPORTACIONES;
mkdirSync(directorio, { recursive: true });
const maxMb = Math.min(
  50,
  Math.max(5, Number(process.env.IMPORT_MAX_FILE_MB ?? 25)),
);

@Controller('catalogo/importacion/stock-inicial')
export class ImportacionStockController {
  constructor(
    private readonly plantilla: PlantillaStockInicialService,
    private readonly importacion: ImportacionStockInicialMasivaService,
  ) {}

  @Navegable(
    '/dashboard/inventario/stock-inicial',
    'Carga de Stock Inicial',
    28,
  )
  @Get('plantilla')
  async plantillaExcel(
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
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: directorio,
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname).toLowerCase()}`,
          ),
      }),
      limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        const valido = extname(file.originalname).toLowerCase() === '.xlsx';
        cb(
          valido
            ? null
            : new BadRequestException('Solo se permiten archivos .xlsx'),
          valido,
        );
      },
    }),
  )
  async crear(
    @UploadedFile() archivo: Express.Multer.File,
    @Query('modo') modo: 'validar' | 'aplicar' = 'validar',
    @Headers('idempotency-key') key: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    if (!archivo?.path) {
      throw new BadRequestException('No se recibió el archivo.');
    }
    if (!['validar', 'aplicar'].includes(modo)) {
      this.eliminarSeguro(archivo.path);
      throw new BadRequestException('Modo inválido.');
    }

    const contenido = readFileSync(archivo.path);
    if (!esExcelReal(contenido, '.xlsx')) {
      this.eliminarSeguro(archivo.path);
      throw new BadRequestException(
        'El contenido no corresponde a un archivo Excel .xlsx válido.',
      );
    }

    return this.importacion.crear({
      ruta: archivo.path,
      nombre: archivo.originalname,
      empresaId,
      usuarioId,
      modo,
      idempotencia: key,
    });
  }

  @Get()
  listar(@ActiveUser('empresaId') empresaId: string) {
    return this.importacion.listar(empresaId);
  }

  @Get(':id')
  obtener(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.importacion.obtener(id, empresaId);
  }

  @Get(':id/errores')
  errores(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.importacion.listarErrores(id, empresaId);
  }

  @Post(':id/cancelar')
  cancelar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.importacion.cancelar(id, empresaId);
  }

  @Post(':id/reintentar')
  reintentar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.importacion.reintentar(id, empresaId);
  }

  private eliminarSeguro(ruta: string): void {
    try {
      unlinkSync(ruta);
    } catch {
      // El rechazo del archivo no depende de que el SO permita eliminarlo.
    }
  }
}
