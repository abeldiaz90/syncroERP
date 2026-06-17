import {
  Controller, Get, Post, Put, Patch, Param,
  Body, Query, Req, DefaultValuePipe, ParseIntPipe,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProductosService } from '../services/productos.service';
import { CrearProductoDto } from '../dto/crear-producto.dto';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';

@Controller('catalogo/productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  // ── RUTAS FIJAS — deben ir ANTES de :id ───────────────────────

  /**
   * Lista sectores disponibles.
   * @SkipPermisos porque cualquier usuario autenticado necesita verlos
   * para poder llenar la ficha del producto.
   */
  @SkipPermisos()
  @Get('sectores')
  obtenerSectores() {
    return this.productosService.obtenerSectoresDisponibles();
  }

  /**
   * Preset de atributos por sector.
   * @SkipPermisos — mismo razonamiento que sectores.
   * CRÍTICO: debe estar antes de @Get(':id') o NestJS confunde
   * 'FARMACEUTICO' con un UUID.
   */
  @SkipPermisos()
  @Get('atributos/:sector')
  obtenerAtributosSector(@Param('sector') sector: string) {
    return this.productosService.obtenerPresetAtributos(sector);
  }

  // ── DASHBOARD ──────────────────────────────────────────────────

  @Get('dashboard/metricas')
  obtenerMetricas(@Req() req) {
    return this.productosService.obtenerMetricas(req.user.empresaId);
  }

  @Get('dashboard/stock-bajo')
  stockBajo(@Req() req) {
    return this.productosService.obtenerStockBajo(req.user.empresaId);
  }

  // ── BÚSQUEDA — también antes de :id ───────────────────────────

  @Get('buscar')
  buscarProductos(@Query('q') query: string, @Req() req) {
    return this.productosService.buscarProductos(query ?? '', req.user.empresaId);
  }

  // ── CRUD ───────────────────────────────────────────────────────

  @Get()
  obtenerProductos(
    @Req() req,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
    // 👇 Añade estas tres líneas 👇
    @Query('categoriaId') categoriaId?: string,
    @Query('marcaId') marcaId?: string,
    @Query('soloConStock') soloConStock?: string,
  ) {
    // Pásalos al servicio
    return this.productosService.obtenerProductos(
      req.user.empresaId, pagina, limite, categoriaId, marcaId, soloConStock === 'true'
    );
  }
  @Get(':id')
  obtenerProducto(@Param('id') id: string, @Req() req) {
    return this.productosService.obtenerProductoPorId(id, req.user.empresaId);
  }

  @Post('imagen')
  @UseInterceptors(FileInterceptor('imagen', {
    storage: diskStorage({
      destination: join(process.cwd(), 'uploads', 'productos'),
      filename: (_req, _file, cb) => cb(null, `${uuidv4()}${extname(_file.originalname).toLowerCase()}`),
    }),
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpg|jpeg|png|gif|webp)$/)) {
        return cb(new BadRequestException('Solo imágenes JPG, PNG, GIF o WEBP'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  subirImagen(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return { url: `/uploads/productos/${file.filename}` };
  }

  @Post()
  crearProducto(@Body() dto: CrearProductoDto, @Req() req) {
    return this.productosService.crearProducto(dto, dto.almacenId, req.user.empresaId);
  }

  @Put(':id')
  actualizarProducto(
    @Param('id') id: string,
    @Body() dto: Partial<CrearProductoDto>,
    @Req() req,
  ) {
    return this.productosService.actualizarProducto(id, dto, req.user.empresaId);
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id') id: string, @Req() req) {
    return this.productosService.cambiarEstado(id, req.user.empresaId);
  }
}