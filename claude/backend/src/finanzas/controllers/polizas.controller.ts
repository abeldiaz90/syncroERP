import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { PolizasService } from '../services/polizas.service';
import { CrearPolizaDto } from '../dto/crear-poliza.dto';
import { CancelarPolizaDto, CrearPolizaManualDto } from '../dto/operaciones-poliza.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { ActivacionFinancieraService } from '../services/activacion-financiera.service';

@Controller('finanzas/polizas')
export class PolizasController {
  constructor(
    private readonly polizasService: PolizasService,
    private readonly activacionService: ActivacionFinancieraService,
  ) {}

  @Post()
  async crear(
    @Body() dto: CrearPolizaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    return this.polizasService.crearPoliza(dto, empresaId);
  }

  @Navegable('/dashboard/finanzas/polizas', 'Libro Diario', 51)
  @Get()
  obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.polizasService.obtenerPolizas(empresaId);
  }

  @Navegable(
    '/dashboard/finanzas/estado-resultados',
    'Estado de Resultados',
    53,
  )
  @Get('resultado')
  obtenerEstadoResultados(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    // Mismo endpoint que balanza — el frontend decide cómo presentarlo
    return this.polizasService.obtenerBalanzaComprobacion(
      empresaId,
      fechaDesde,
      fechaHasta,
    );
  }

  @Navegable('/dashboard/finanzas/declaracion-iva', 'Declaración de IVA', 56)
  @Get('iva')
  obtenerDeclaracionIVA(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.polizasService.obtenerDeclaracionIVA(
      empresaId,
      fechaDesde,
      fechaHasta,
    );
  }

  @Navegable('/dashboard/finanzas/balance-general', 'Balance General', 55)
  @Get('balance')
  obtenerBalance(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.polizasService.obtenerBalanzaComprobacion(
      empresaId,
      undefined,
      fechaHasta,
    );
  }

  @Navegable('/dashboard/finanzas/balanza', 'Balanza de Comprobación', 52)
  @Get('balanza')
  obtenerBalanza(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.polizasService.obtenerBalanzaComprobacion(
      empresaId,
      fechaDesde,
      fechaHasta,
    );
  }

  @Navegable('/dashboard/finanzas/saldos-iniciales', 'Saldos Iniciales', 58)
  @Get('saldos-iniciales')
  getSaldosIniciales() {
    return {
      mensaje: 'Usa POST /manual con concepto "Saldos iniciales de apertura"',
    };
  }

  @Post('manual')
  async crearPolizaManual(
    @Body() body: CrearPolizaManualDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    return this.polizasService.crearPolizaManual({
      ...body,
      empresaId,
      fecha: new Date(body.fecha),
      partidas: body.partidas.map((partida) => ({
        cuentaContableId: partida.cuentaContableId,
        cargo: partida.cargo,
        abono: partida.abono,
        referencia: partida.referencia ?? body.concepto.substring(0, 50),
      })),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCELAR PÓLIZA — genera su reversa. La original nunca se borra.
  // POST /api/finanzas/polizas/:id/cancelar
  // body: { motivo: string; fechaReverso?: 'AAAA-MM-DD' }
  // ══════════════════════════════════════════════════════════════════════════
  @Post(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() body: CancelarPolizaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('email') email: string,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    return this.polizasService.cancelarPoliza(empresaId, id, {
      motivo: body?.motivo,
      fechaReverso: body?.fechaReverso,
      usuario: email,
    });
  }
}
