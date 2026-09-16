import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { Cliente } from '../../clientes/entities/cliente.entity';
import {
  ModoCartera,
  ModoContabilidad,
  PUERTO_CONTABILIDAD_EXTERNA,
  TipoVinculo,
} from '../integracion.constants';
import { ConfigurarIntegracionDto } from '../dto/configurar-integracion.dto';
import { MapearCuentaDto } from '../dto/mapear-cuenta.dto';
import { MapearRolDto } from '../dto/mapear-rol.dto';
import { AprovisionarCuentaServicioDto } from '../dto/cuenta-servicio.dto';
import { EvaluarCreditoDto } from '../dto/evaluar-credito.dto';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { AccesoExternoService } from '../services/acceso-externo.service';
import { CarteraConciliacionService } from '../services/cartera-conciliacion.service';
import { MapeoCuentasService } from '../services/mapeo-cuentas.service';
import { RolesExternosService } from '../services/roles-externos.service';
import { PuertoContabilidadExterna } from '../ports/contabilidad-externa.port';
import { IntegracionDespachadorService } from '../services/integracion-despachador.service';
import { IntegracionModoService } from '../services/integracion-modo.service';
import { IntegracionOutboxService } from '../services/integracion-outbox.service';
import { SincronizacionInicialService } from '../services/sincronizacion-inicial.service';
import { IntegracionVinculosService } from '../services/integracion-vinculos.service';
import { DecisionCreditoService } from '../services/decision-credito.service';
import { DisponibilidadCreditoService } from '../services/disponibilidad-credito.service';

/**
 * Administración del registro financiero externo.
 *
 * Cambiar cualquiera de los dos modos mueve un sistema de registro completo, así
 * que queda restringido a dirección y administración. La consulta de
 * disponibilidad, en cambio, la usa el punto de venta y no lleva restricción de
 * rol adicional a la del endpoint.
 *
 * Una empresa sin el módulo contratado ve todo apagado y ninguna de estas rutas
 * cambia su operación.
 */
@Controller('integracion')
export class IntegracionController {
  constructor(
    private readonly modos: IntegracionModoService,
    private readonly disponibilidad: DisponibilidadCreditoService,
    private readonly decision: DecisionCreditoService,
    private readonly vinculos: IntegracionVinculosService,
    private readonly outbox: IntegracionOutboxService,
    private readonly sincronizacionInicial_: SincronizacionInicialService,
    private readonly despachador: IntegracionDespachadorService,
    private readonly conciliacion: CarteraConciliacionService,
    private readonly mapeo: MapeoCuentasService,
    private readonly roles: RolesExternosService,
    private readonly acceso: AccesoExternoService,
    @Inject(PUERTO_CONTABILIDAD_EXTERNA)
    private readonly contabilidad: PuertoContabilidadExterna,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
  ) {}

  @Get('estado')
  async estado(@ActiveUser('empresaId') empresaId: string) {
    const fila = await this.configEmpresa.findOne({ where: { empresaId } });
    const perfil = await this.modos.perfilDe(empresaId);
    return {
      cartera: {
        modoGlobal: this.modos.modoGlobal,
        modoEmpresa: fila?.modo ?? ModoCartera.APAGADO,
        modoEfectivo: perfil.cartera,
      },
      contabilidad: {
        modoGlobal: this.modos.modoContabilidadGlobal,
        modoEmpresa: fila?.modoContabilidad ?? ModoContabilidad.APAGADO,
        modoEfectivo: perfil.contabilidad,
        oficinaContableExterna: fila?.oficinaContableExterna ?? null,
        cuentasSinMapear: (await this.mapeo.pendientes(empresaId)).length,
        /* Las que la configuración dice que se van a usar y aún no se mapean.
           Se ven ANTES de que una póliza falle, que es cuando cuesta poco. */
        cuentasPorMapear: (await this.mapeo.previstas(empresaId)).length,
      },
      enlace: this.disponibilidad.estado(),
      outbox: await this.outbox.resumen(empresaId),
      parametrosProveedor: fila?.parametrosProveedor ?? {},
    };
  }

  @Patch('configuracion')
  @Roles('administrador', 'direccion')
  async configurar(
    @Body() dto: ConfigurarIntegracionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    /*
     * La regla que impide subir a AUTORIDAD con discrepancias abiertas ya no
     * vive aquí: la aplica `IntegracionModoService`, para que valga sea cual
     * sea la ruta por la que entre el cambio. Este endpoint sólo traduce su
     * negativa a un código HTTP.
     */
    if (dto.modo !== undefined) {
      const resultado = await this.modos.establecerModoCartera(
        empresaId,
        dto.modo,
        async (id) => (await this.conciliacion.abiertas(id)).length,
      );
      if (!resultado.aplicado) {
        throw new ConflictException(`No se puede pasar a AUTORIDAD: ${resultado.motivo}`);
      }
    }

    const fila =
      (await this.configEmpresa.findOne({ where: { empresaId } })) ??
      this.configEmpresa.create({ empresaId, parametrosProveedor: {} });

    // El modo ya lo aplicó el servicio, con su regla. Aquí no se reasigna.
    if (dto.modoContabilidad !== undefined) {
      fila.modoContabilidad = dto.modoContabilidad;
    }
    if (dto.oficinaContableExterna !== undefined) {
      fila.oficinaContableExterna = dto.oficinaContableExterna;
    }

    const parametros = { ...(fila.parametrosProveedor ?? {}) };
    for (const clave of [
      'oficinaId',
      'productoCreditoSimpleId',
      'productoMensualidadesId',
      'productoMsiId',
      'cuentaCobranzaExternaId',
      'cuentaDevolucionExternaId',
      'capacidadesValidacion',
    ] as const) {
      if (dto[clave] !== undefined) parametros[clave] = dto[clave];
    }
    fila.parametrosProveedor = parametros;

    if (dto.toleranciaConciliacion !== undefined) {
      fila.toleranciaConciliacion = String(dto.toleranciaConciliacion);
    }

    const guardado = await this.configEmpresa.save(fila);
    this.modos.invalidar(empresaId);

    // Encender el espejo sin verificar la configuración del proveedor es la vía
    // directa a duplicar las cuentas por cobrar. Se avisa en la misma respuesta.
    const avisos =
      fila.modoContabilidad === ModoContabilidad.ESPEJO
        ? await this.contabilidad
            .verificarConfiguracion(empresaId)
            .catch(() => [])
        : [];

    return { configuracion: guardado, avisos };
  }

  /**
   * Comprueba que el proveedor no vaya a asentar por su cuenta. Debe correrse
   * cada vez que alguien toca los productos de crédito del lado del proveedor.
   */
  @Get('verificacion')
  @Roles('administrador', 'direccion', 'contador')
  verificar(@ActiveUser('empresaId') empresaId: string) {
    return this.contabilidad.verificarConfiguracion(empresaId);
  }

  /** Acceso a la interfaz web del registro externo, para las empresas que lo tienen. */
  @Get('acceso')
  accesoExterno(@ActiveUser('empresaId') empresaId: string) {
    return this.acceso.para(empresaId);
  }

  // ── Mapeo del catálogo de cuentas ────────────────────────────────────────

  @Get('cuentas/mapeo')
  @Roles('administrador', 'direccion', 'contador')
  listarMapeo(@ActiveUser('empresaId') empresaId: string) {
    return this.mapeo.listar(empresaId);
  }

  /**
   * Cuentas que faltan mapear. Por omisión sólo las que las pólizas ya tocan,
   * que es la superficie real; `?todas=1` devuelve el catálogo completo.
   */
  @Get('cuentas/pendientes')
  @Roles('administrador', 'direccion', 'contador')
  async cuentasPendientes(
    @ActiveUser('empresaId') empresaId: string,
    @Query('todas') todas?: string,
  ) {
    const cuentas = await this.mapeo.pendientes(empresaId, todas !== '1');
    return cuentas.map((c) => ({
      id: c.id,
      numeroCuenta: c.numeroCuenta,
      nombre: c.nombre,
      codigoAgrupadorSAT: c.codigoAgrupadorSAT ?? null,
      usos: (c as { usos?: number }).usos ?? null,
    }));
  }

  /**
   * Crea en el mayor externo las cuentas que faltan y guarda el mapeo, usando
   * el mismo código en los dos lados. `?simular=1` sólo dice qué haría.
   */
  /**
   * Cuentas que se van a necesitar y todavía no están mapeadas.
   *
   * A diferencia de `cuentas/pendientes`, que mira lo ya usado, ésta mira lo
   * configurado: avisa antes del primer fallo, no después.
   */
  @Get('cuentas/previstas')
  @Roles('administrador', 'direccion', 'contador')
  cuentasPrevistas(@ActiveUser('empresaId') empresaId: string) {
    return this.mapeo.previstas(empresaId);
  }

  @Post('cuentas/aprovisionar')
  @Roles('administrador', 'direccion', 'contador')
  aprovisionarCuentas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('simular') simular?: string,
    @Query('todas') todas?: string,
  ) {
    return this.mapeo.aprovisionar(empresaId, {
      simular: simular === '1',
      soloUsadas: todas !== '1',
    });
  }

  @Post('cuentas/mapeo')
  @Roles('administrador', 'direccion', 'contador')
  mapearCuenta(
    @Body() dto: MapearCuentaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.mapeo.guardar(empresaId, {
      cuentaContableId: dto.cuentaContableId,
      idExterno: dto.idExterno,
      codigoExterno: dto.codigoExterno ?? null,
      proveedor: this.contabilidad.proveedor,
    });
  }

  /** Lo que consulta el punto de venta antes de aceptar una venta a crédito. */
  @Get('disponibilidad/:clienteId')
  disponibilidadCliente(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.disponibilidad.consultar(empresaId, clienteId);
  }

  /** Evaluación de originación: identidad, buró e historial. No otorga nada. */
  @Post('evaluar-credito')
  @Roles('administrador', 'direccion', 'gerencia', 'cobranza')
  async evaluar(
    @Body() dto: EvaluarCreditoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const cliente = await this.clientes.findOne({
      where: { id: dto.clienteId, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    const idExterno = await this.vinculos.idExterno(
      empresaId,
      TipoVinculo.CLIENTE,
      dto.clienteId,
    );

    return this.decision.evaluar({
      empresaId,
      clienteId: dto.clienteId,
      nombre: cliente.razonSocial || cliente.nombre,
      rfc: cliente.rfc ?? null,
      curp: cliente.curp ?? null,
      limiteSolicitado: dto.limiteSolicitado,
      topeAutomatico: dto.topeAutomatico,
      folioAutorizacionBuro: dto.folioAutorizacionBuro ?? null,
      clienteIdExterno: idExterno,
    });
  }

  /** Eventos del outbox con su último error. Es la bitácora de la integración. */
  /**
   * Pone al día el externo con lo que el ERP ya tenía.
   *
   * `?simular=1` sólo informa. Es un paso explícito, no un efecto de cambiar
   * el modo: en un cliente real puede mover miles de eventos y eso no debe
   * ocurrir porque alguien tocó un selector.
   */
  @Post('sincronizacion-inicial')
  @Roles('administrador', 'direccion')
  sincronizacionInicial(
    @ActiveUser('empresaId') empresaId: string,
    @Query('simular') simular?: string,
  ) {
    return this.sincronizacionInicial_.sincronizar(empresaId, {
      simular: simular === '1',
    });
  }

  @Get('outbox')
  @Roles('administrador', 'direccion', 'contador')
  listarOutbox(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: string,
    @Query('limite') limite?: string,
  ) {
    return this.outbox.listar(empresaId, {
      estado: estado as never,
      limite: Number(limite ?? 50),
    });
  }

  @Post('outbox/despachar')
  @Roles('administrador', 'direccion')
  despachar(@Query('limite') limite?: string) {
    const n = Number(limite ?? 50);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      throw new BadRequestException('limite debe estar entre 1 y 500.');
    }
    return this.despachador.despacharLote(n);
  }

  @Post('outbox/:id/reencolar')
  @Roles('administrador', 'direccion')
  async reencolar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!(await this.outbox.reencolar(id, empresaId))) {
      throw new NotFoundException('Evento no encontrado.');
    }
    return { reencolado: true };
  }

  // ── Coherencia de usuarios y roles ───────────────────────────────────────

  /** Roles del ERP y del registro externo, para armar el mapeo. */
  @Get('roles/catalogos')
  @Roles('administrador', 'direccion')
  async catalogosRoles() {
    let externos: unknown[] = [];
    let error: string | null = null;
    try {
      externos = await this.roles.rolesExternos();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return { erp: this.roles.rolesErp(), externos, error };
  }

  /**
   * Crea en el registro externo un rol espejo por cada rol del ERP y deja la
   * correspondencia hecha. Con `?simular=1` sólo dice qué haría.
   *
   * Los roles nacen sin permisos, a propósito: ver el servicio.
   */
  @Post('roles/espejo')
  @Roles('administrador', 'direccion')
  crearRolesEspejo(
    @ActiveUser('empresaId') empresaId: string,
    @Query('simular') simular?: string,
  ) {
    return this.roles.crearRolesEspejo(empresaId, simular === '1');
  }

  @Get('roles/mapeo')
  @Roles('administrador', 'direccion')
  listarMapeoRoles(@ActiveUser('empresaId') empresaId: string) {
    return this.roles.listarMapeo(empresaId);
  }

  @Post('roles/mapeo')
  @Roles('administrador', 'direccion')
  guardarMapeoRol(
    @Body() dto: MapearRolDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.roles.guardarMapeo(empresaId, dto);
  }

  /**
   * Qué usuarios del ERP pueden operar de verdad contra el registro externo y
   * qué le falta a cada uno. Evita descubrirlo el día que alguien no puede
   * trabajar.
   */
  @Get('roles/diagnostico')
  @Roles('administrador', 'direccion')
  diagnosticoUsuarios(@ActiveUser('empresaId') empresaId: string) {
    return this.roles.diagnostico(empresaId);
  }

  /**
   * Da de alta la cuenta de servicio del ERP en el registro externo, actuando
   * con la identidad de quien lo pide. Es el paso que desbloquea un core recién
   * montado, donde esa cuenta todavía no puede autenticarse sola.
   */
  @Post('roles/cuenta-servicio')
  @Roles('administrador', 'direccion')
  aprovisionarCuentaServicio(
    @Body() dto: AprovisionarCuentaServicioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.roles.aprovisionarCuentaServicio(empresaId, dto.rolesExternos);
  }

  /** Da de alta al usuario en el registro externo, o corrige sus roles. */
  @Post('roles/aprovisionar/:usuarioId')
  @Roles('administrador', 'direccion')
  aprovisionar(
    @Param('usuarioId') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.roles.aprovisionar(empresaId, usuarioId);
  }

  @Get('conciliacion')
  conciliacionAbierta(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.abiertas(empresaId);
  }

  @Post('conciliacion/ejecutar')
  @Roles('administrador', 'direccion', 'contador')
  ejecutarConciliacion(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.conciliarEmpresa(empresaId);
  }

  @Patch('conciliacion/:id/resolver')
  @Roles('administrador', 'direccion', 'contador')
  async resolver(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @Body() cuerpo?: { nota?: string },
  ) {
    if (!(await this.conciliacion.marcarResuelta(id, empresaId, cuerpo?.nota))) {
      throw new NotFoundException('Discrepancia no encontrada.');
    }
    return { resuelta: true };
  }
}
