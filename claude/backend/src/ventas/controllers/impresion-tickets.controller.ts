import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ImpresionTicketsService } from '../impresion/impresion-tickets.service';
import {
  AnchoPapel,
  ImpresoraCaja,
  ModoImpresion,
} from '../../caja/entities/impresora-caja.entity';
import {
  ConfigurarImpresoraDto,
  ProbarImpresoraDto,
} from '../dto/configurar-impresora.dto';

/**
 * ============================================================================
 * Las rutas de la impresora del mostrador
 * ----------------------------------------------------------------------------
 * POR QUÉ VIVEN BAJO `/ventas`
 *
 * Por lo mismo que `tope-descuento`: `/ventas` es el prefijo que el rol
 * `empleado` ya tiene, que es con el que se cobra. Si imprimir colgara de un
 * permiso aparte, bastaría con que alguien se lo quitara al mostrador —sin
 * saber lo que estaba apagando— para que el cajero se quedara sin ticket con el
 * cliente enfrente.
 *
 * Configurar la impresora es otra cosa y sí es del administrador: cambia a qué
 * aparato de la red le escribe el servidor.
 * ============================================================================
 */
@Controller('ventas')
export class ImpresionTicketsController {
  constructor(
    private readonly impresion: ImpresionTicketsService,
    @InjectRepository(ImpresoraCaja)
    private readonly impresoraRepo: Repository<ImpresoraCaja>,
  ) {}

  /**
   * Manda el ticket de una venta a la impresora de su caja.
   *
   * Contesta siempre 200, también cuando no se imprimió: **un fallo de
   * impresión no es un fallo de la petición**. Si contestara 500, el punto de
   * venta enseñaría «error» después de una venta que sí se cobró, y el cajero
   * la volvería a capturar.
   */
  @Post(':id/ticket/imprimir')
  imprimir(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impresion.imprimirVenta(id, empresaId);
  }

  /** Qué impresora le toca a esta caja, para que la pantalla no prometa de más. */
  @Get('impresora')
  async miImpresora(
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('cuentaCajaId') cuentaCajaId?: string,
  ) {
    const i = await this.impresion.impresoraDe(empresaId, cuentaCajaId ?? null);
    return {
      modo: i?.modo ?? ModoImpresion.NAVEGADOR,
      nombre: i?.nombre ?? null,
      ancho: i?.ancho ?? AnchoPapel.MM80,
      ultimoIntento: i?.ultimoIntento ?? null,
      ultimoExito: i?.ultimoExito ?? null,
      ultimoMotivo: i?.ultimoMotivo ?? null,
    };
  }

  /** Página de prueba, para enchufar la impresora sin tener que vender. */
  @Post('impresora/probar')
  probar(
    @ActiveUser('empresaId') empresaId: string,
    @Body() cuerpo: ProbarImpresoraDto,
  ) {
    return this.impresion.probar(empresaId, cuerpo?.cuentaCajaId ?? null);
  }

  @Get('impresoras')
  listar(@ActiveUser('empresaId') empresaId: string) {
    return this.impresoraRepo.find({
      where: { empresaId },
      order: { cuentaCajaId: 'ASC' },
    });
  }

  /**
   * Declara o cambia la impresora de una caja.
   *
   * Sin `cuentaCajaId` se configura la de la empresa, que es la que usan las
   * cajas que no declararon la suya.
   */
  @Put('impresoras')
  async configurar(
    @ActiveUser('empresaId') empresaId: string,
    @Body() dto: ConfigurarImpresoraDto,
  ) {
    const cuentaCajaId = dto.cuentaCajaId ?? null;
    const existente = await this.impresoraRepo.findOne({
      where: {
        empresaId,
        cuentaCajaId: cuentaCajaId === null ? IsNull() : cuentaCajaId,
      },
    });

    const valores: Partial<ImpresoraCaja> = {
      empresaId,
      cuentaCajaId,
      nombre: dto.nombre ?? 'Impresora de tickets',
      modo: dto.modo,
      host: dto.modo === ModoImpresion.RED ? (dto.host ?? null) : null,
      puerto: dto.puerto ?? 9100,
      ancho: dto.ancho ?? AnchoPapel.MM80,
      abrirCajon: dto.abrirCajon ?? true,
      pie: dto.pie ?? null,
      copias: dto.copias ?? 1,
      activo: dto.activo ?? true,
    };

    if (existente) {
      await this.impresoraRepo.update({ id: existente.id }, valores);
      return this.impresoraRepo.findOne({ where: { id: existente.id } });
    }
    return this.impresoraRepo.save(this.impresoraRepo.create(valores));
  }
}
