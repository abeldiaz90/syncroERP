import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import {
  ActualizarProductoCreditoDto,
  CrearProductoCreditoDto,
} from '../dto/producto-credito.dto';
import { ProductosCreditoService } from '../services/productos-credito.service';
import { ProductosCreditoSyncService } from '../services/productos-credito-sync.service';

/**
 * Catálogo de productos de crédito de la empresa.
 *
 * La lectura la usa el punto de venta y no lleva más restricción que la del
 * endpoint: el cajero necesita saber qué puede ofrecer. Todo lo que cambia el
 * catálogo —crear, editar, sincronizar, activar— queda en dirección y
 * administración, porque mueve el precio y el plazo de lo que se vende a
 * crédito.
 */
@Controller('credito/productos')
export class ProductosCreditoController {
  constructor(
    private readonly catalogo: ProductosCreditoService,
    private readonly sync: ProductosCreditoSyncService,
  ) {}

  /** `?vendibles=1` es lo que consulta el POS. */
  @Get()
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('vendibles') vendibles?: string,
  ) {
    return this.catalogo.listar(empresaId, {
      soloVendibles: vendibles === '1',
    });
  }

  /** Qué le falta a cada producto para poder venderse. */
  @Get('estado')
  @Roles('administrador', 'direccion', 'contador')
  estado(@ActiveUser('empresaId') empresaId: string) {
    return this.sync.estado(empresaId);
  }

  @Get(':id')
  obtener(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.catalogo.obtener(empresaId, id);
  }

  @Post()
  @Roles('administrador', 'direccion')
  crear(
    @Body() dto: CrearProductoCreditoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.catalogo.crear(empresaId, dto);
  }

  @Patch(':id')
  @Roles('administrador', 'direccion')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarProductoCreditoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.catalogo.actualizar(empresaId, id, dto);
  }

  /** Deja a una empresa nueva con un catálogo con el que ya puede vender. */
  @Post('sembrar')
  @Roles('administrador', 'direccion')
  async sembrar(@ActiveUser('empresaId') empresaId: string) {
    // Con registro externo contratado los productos nacen en borrador: primero
    // tienen que existir allá y cuadrar.
    const exigir = await this.sync.exigeCorrespondencia(empresaId);
    return this.catalogo.sembrar(empresaId, { activar: !exigir });
  }

  /** Correspondencia en los dos sentidos. `?simular=1` sólo dice qué haría. */
  @Post('sincronizar')
  @Roles('administrador', 'direccion')
  sincronizar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('simular') simular?: string,
  ) {
    return this.sync.sincronizar(empresaId, { simular: simular === '1' });
  }

  /*
   * ════════════════════════════════════════════════════════════════════════
   * Dos piezas que existían y nadie podía llamar
   * --------------------------------------------------------------------------
   * `recodificarImportados` y `suspenderImportados` estaban escritas, con su
   * razón escrita, y sin una sola ruta ni llamada en todo el repositorio.
   *
   * La primera repara los códigos de los productos que entraron con el nombre
   * corto del proveedor —«E826», «MTR1»—, que no le dice nada a nadie; la
   * segunda regresa a borrador los importados que estén activos, porque el
   * catálogo de un core que lleva tiempo en uso trae pruebas de integración y
   * ensayos de alguien, y que existan allá no es razón para venderlos aquí.
   * Las dos arreglan datos que hoy están en las instalaciones, y la única
   * forma de usarlas era escribir un script contra la base.
   *
   * VAN DECLARADAS ANTES de las rutas con parámetro: `importados/suspender`
   * encaja en `:id/suspender` con `:id` = «importados», y Nest resuelve por
   * orden de declaración. Declaradas después, suspender los importados habría
   * intentado suspender un producto llamado «importados».
   * ════════════════════════════════════════════════════════════════════════
   */
  @Post('importados/recodificar')
  @Roles('administrador', 'direccion')
  recodificarImportados(@ActiveUser('empresaId') empresaId: string) {
    return this.sync.recodificarImportados(empresaId);
  }

  @Post('importados/suspender')
  @Roles('administrador', 'direccion')
  suspenderImportados(@ActiveUser('empresaId') empresaId: string) {
    return this.sync.suspenderImportados(empresaId);
  }

  /** Compara la tabla de amortización de los dos sistemas, cuota por cuota. */
  @Post(':id/verificar')
  @Roles('administrador', 'direccion', 'contador')
  verificar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.sync.verificar(empresaId, id);
  }

  @Post(':id/activar')
  @Roles('administrador', 'direccion')
  activar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.sync.activar(empresaId, id);
  }

  @Post(':id/suspender')
  @Roles('administrador', 'direccion')
  suspender(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.catalogo.suspender(empresaId, id);
  }
}
