import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PolizasService } from '../services/polizas.service';
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

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * AQUÍ HABÍA UN `POST /finanzas/polizas`, Y SE QUITÓ (5-oct-2026)
   * --------------------------------------------------------------------------
   * Creaba una póliza **sin pasar por `validarCuentasAfectables`**, que es el
   * control que impide cargar o abonar a mano Bancos, Clientes CxC o
   * Inventario. Cuando una de esas cuentas se mueve a mano el auxiliar no
   * cambia, el mayor sí, y la conciliación cuadra: es el mecanismo con el que
   * se disimula un faltante.
   *
   * El comentario del validador dice que los asientos del motor contable no
   * pasan por él porque «usan `crearPoliza`», y es verdad —pero de
   * `MotorContableService.crearPoliza`, que es otro método de otra clase con el
   * mismo nombre—. El de aquí, `PolizasService.crearPoliza`, tenía **un solo
   * llamador en todo el sistema: este endpoint**. Era una puerta humana, y la
   * frase del comentario la hacía parecer una vía interna.
   *
   * Ninguna pantalla lo usaba: la de «Nueva póliza» y la de saldos iniciales
   * mandan las dos a `POST /finanzas/polizas/manual`, que además valida GUID,
   * dos decimales, mínimo dos partidas, concepto con largo y es idempotente por
   * `origenClave`. Lo viejo era más laxo en seis cosas a la vez.
   *
   * No se arregló añadiéndole el control: dos puertas humanas a lo mismo, con
   * reglas distintas, es la forma del defecto. Queda una.
   * ──────────────────────────────────────────────────────────────────────────
   */

  @Navegable('/dashboard/finanzas/polizas', 'Libro Diario', 51)
  @Get()
  obtenerTodas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('tipo') tipo?: string,
  ) {
    /*
     * Una fecha mal escrita no se ignora. Ignorarla devolvería el libro entero
     * con cara de estar filtrado, que es justo el defecto que este endpoint
     * viene a cerrar: quien lee la pantalla creería estar viendo un mes.
     */
    for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]]) {
      if (valor && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new BadRequestException(
          `${nombre} debe venir como aaaa-mm-dd; llegó «${valor}».`,
        );
      }
    }
    if (tipo && !['DIARIO', 'INGRESO', 'EGRESO'].includes(tipo)) {
      throw new BadRequestException(
        `tipo debe ser DIARIO, INGRESO o EGRESO; llegó «${tipo}».`,
      );
    }
    return this.polizasService.obtenerPolizas(empresaId, desde, hasta, tipo);
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
    /**
     * El centro de costo, si se quiere el resultado de uno solo.
     * `SIN_CLASIFICAR` pide las partidas que no lo traen — las anteriores a
     * que existiera la dimensión, y las de los generadores que todavía no la
     * resuelven. Sin ese valor, la suma de los centros no da el total y nadie
     * sabría dónde está la diferencia.
     */
    @Query('centroCostoId') centroCostoId?: string,
  ) {
    // Mismo endpoint que balanza — el frontend decide cómo presentarlo
    return this.polizasService.obtenerBalanzaComprobacion(
      empresaId,
      fechaDesde,
      fechaHasta,
      centroCostoId,
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

  /**
   * El resultado abierto por centro de costo: la pregunta por la que existe la
   * dimensión. Incluye el renglón de lo no clasificado, porque sin él la suma
   * de los centros no da el total de la empresa.
   */
  @Navegable(
    '/dashboard/finanzas/resultado-por-centro',
    'Resultado por centro de costo',
    54,
  )
  @Get('resultado-por-centro')
  resultadoPorCentro(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.polizasService.resultadoPorCentro(empresaId, fechaDesde, fechaHasta);
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
    @Query('centroCostoId') centroCostoId?: string,
  ) {
    return this.polizasService.obtenerBalanzaComprobacion(
      empresaId,
      fechaDesde,
      fechaHasta,
      centroCostoId,
    );
  }

  /*
   * Esta lectura devolvía un recado para el programador —«Usa POST /manual con
   * concepto …»— y era, además, la puerta de la pantalla de saldos iniciales.
   * O sea: la única pregunta que la pantalla necesita hacer —«¿esta empresa ya
   * tiene apertura?»— no se podía hacer, y la pantalla avisaba «no usar si ya
   * hay transacciones registradas» sin manera de saber si las había.
   *
   * Cargar dos veces los saldos de apertura duplica el balance entero. Es un
   * error que no se nota hasta el primer cierre.
   */
  @Navegable('/dashboard/finanzas/saldos-iniciales', 'Saldos Iniciales', 58)
  @Get('saldos-iniciales')
  getSaldosIniciales(@ActiveUser('empresaId') empresaId: string) {
    return this.polizasService.estadoDeApertura(empresaId);
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
  // body: { motivo: string; fechaReverso?: 'AAAA-MM-DD'; regenerar?: boolean }
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
      regenerar: body?.regenerar === true,
    });
  }
}
