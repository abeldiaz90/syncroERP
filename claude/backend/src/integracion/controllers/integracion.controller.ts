import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';
import { Cliente } from '../../clientes/entities/cliente.entity';
import {
  EstadoEventoIntegracion,
  EVENTOS_DE_CONTABILIDAD,
  ModoCartera,
  ModoContabilidad,
  PUERTO_CONTABILIDAD_EXTERNA,
  ROLES_ESPEJO_CONTABLE,
  TipoEventoIntegracion,
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
    private readonly cfg: ConfigService,
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
        {
          discrepanciasAbiertas: async (id) =>
            (await this.conciliacion.abiertas(id)).length,
          eventosSinResolver: async (id) => {
            /*
             * Sin entregar es PENDIENTE, REINTENTABLE y FALLIDO. ENVIADO ya
             * llegó y DESCARTADO alguien lo cerró a mano: ésos no estorban.
             */
            const resumen = await this.outbox.resumen(id);
            return (
              (resumen[EstadoEventoIntegracion.PENDIENTE] ?? 0) +
              (resumen[EstadoEventoIntegracion.REINTENTABLE] ?? 0) +
              (resumen[EstadoEventoIntegracion.FALLIDO] ?? 0)
            );
          },
        },
      );
      if (!resultado.aplicado) {
        throw new ConflictException(
          `No se puede cambiar a ${dto.modo}: ${resultado.motivo}`,
        );
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
      // La columna ya es numérica (lleva `decimalNumberTransformer`): guardar
      // la cadena era lo que obligaba a un `Number(...)` en cada lectura.
      fila.toleranciaConciliacion = Number(dto.toleranciaConciliacion);
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
  @Roles(...ROLES_ESPEJO_CONTABLE)
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
  @Roles(...ROLES_ESPEJO_CONTABLE)
  listarMapeo(@ActiveUser('empresaId') empresaId: string) {
    return this.mapeo.listar(empresaId);
  }

  /**
   * Cuentas que faltan mapear. Por omisión sólo las que las pólizas ya tocan,
   * que es la superficie real; `?todas=1` devuelve el catálogo completo.
   */
  @Get('cuentas/pendientes')
  @Roles(...ROLES_ESPEJO_CONTABLE)
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
  @Roles(...ROLES_ESPEJO_CONTABLE)
  cuentasPrevistas(@ActiveUser('empresaId') empresaId: string) {
    return this.mapeo.previstas(empresaId);
  }

  @Post('cuentas/aprovisionar')
  @Roles(...ROLES_ESPEJO_CONTABLE)
  aprovisionarCuentas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('simular') simular?: string,
    @Query('todas') todas?: string,
    @Query('alcance') alcance?: string,
  ) {
    const permitidos = ['usadas', 'previstas', 'todas'] as const;
    if (alcance && !permitidos.includes(alcance as (typeof permitidos)[number])) {
      throw new BadRequestException(
        `alcance debe ser uno de: ${permitidos.join(', ')}.`,
      );
    }
    return this.mapeo.aprovisionar(empresaId, {
      simular: simular === '1',
      alcance:
        (alcance as 'usadas' | 'previstas' | 'todas' | undefined) ??
        (todas === '1' ? 'todas' : 'usadas'),
    });
  }

  /**
   * El catálogo de cuentas del mayor externo, para poder mapear a mano contra
   * algo concreto. Sin esto, la correspondencia se captura a ciegas: hay que
   * ir al otro sistema, anotar el identificador y volver a teclearlo aquí.
   */
  @Get('cuentas/externas')
  @Roles(...ROLES_ESPEJO_CONTABLE)
  cuentasExternas() {
    return this.mapeo.disponiblesEnElMayorExterno();
  }

  @Post('cuentas/mapeo')
  @Roles(...ROLES_ESPEJO_CONTABLE)
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
      /*
       * El tope lo pone la instalación, no la petición.
       *
       * `topeAutomatico` es exactamente lo que decide entre APROBADO y
       * REVISION_MANUAL. Venía en el cuerpo, así que quien pudiera llamar este
       * endpoint pedía `limiteSolicitado: 3_000_000, topeAutomatico: 3_000_000`
       * y obtenía una aprobación automática por ese monto, saltándose el comité.
       *
       * Ahora se acota con el techo configurado: lo que llega en el cuerpo sólo
       * puede BAJARLO —pedir más revisión manual siempre está permitido—, nunca
       * subirlo. Y sin techo configurado el tope es cero: todo a revisión, que
       * es el estado seguro para algo que aprueba dinero.
       */
      topeAutomatico: Math.min(
        Number(dto.topeAutomatico ?? 0),
        Number(this.cfg.get<string>('CREDITO_TOPE_AUTOMATICO') ?? 0),
      ),
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
  @Roles(...ROLES_ESPEJO_CONTABLE)
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
  @Roles(...ROLES_ESPEJO_CONTABLE)
  despachar(
    @ActiveUser() usuario: { empresaId: string; rol?: string },
    @Query('limite') limite?: string,
  ) {
    const n = Number(limite ?? 50);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      throw new BadRequestException('limite debe estar entre 1 y 500.');
    }
    /*
     * Se pasa la empresa. Era el único handler de este controlador que no la
     * tomaba del token, y forzar el despacho enviaba al core hasta 500 eventos
     * pendientes de TODAS las empresas: altas de cliente, originaciones y
     * asientos de otros inquilinos, disparados por quien pulsó el botón.
     */
    return this.despachador.despacharLote(
      n,
      usuario.empresaId,
      this.alcanceDelOutbox(usuario.rol),
    );
  }

  @Post('outbox/:id/reencolar')
  @Roles(...ROLES_ESPEJO_CONTABLE)
  async reencolar(
    @Param('id') id: string,
    @ActiveUser() usuario: { empresaId: string; rol?: string },
  ) {
    const veredicto = await this.outbox.reencolar(
      id,
      usuario.empresaId,
      this.alcanceDelOutbox(usuario.rol),
    );
    if (veredicto === 'NO_EXISTE') {
      throw new NotFoundException('Evento no encontrado.');
    }
    if (veredicto === 'FUERA_DE_ALCANCE') {
      throw new ForbiddenException(
        'Ese evento es de la cartera, no del espejo contable. Lo reenvía Administración.',
      );
    }
    return { reencolado: true };
  }

  /**
   * Qué parte de la cola puede mover quien pulsó el botón.
   *
   * El outbox es uno y lleva dentro dos cosas de dueños distintos. Hasta ahora
   * el reparto se hacía negando la pantalla entera: despachar y reencolar eran
   * de administración, así que Contabilidad podía corresponder una cuenta y no
   * podía reenviar la póliza que esperaba por esa cuenta. Se midió con la
   * nómina: diez cuentas creadas por el contador, dos pólizas detenidas, y el
   * botón «Despachar la cola» contestando 403.
   *
   * Ensanchar el rol a secas habría entregado la cartera de la empresa a quien
   * lleva los libros. Así que el alcance se acota por tipo de evento: cada uno
   * mueve lo suyo. Administración y dirección siguen viendo la cola completa,
   * que es lo que su trabajo pide.
   */
  private alcanceDelOutbox(
    rol?: string,
  ): readonly TipoEventoIntegracion[] | undefined {
    const mio = normalizarRol(rol ?? '');
    if (esRolAdministrador(mio) || mio === 'direccion') return undefined;
    return EVENTOS_DE_CONTABILIDAD;
  }

  /**
   * Qué tiene contratado esta empresa. Barato y sin tocar el core.
   *
   * La interfaz lo necesita para no enseñar lo que no existe: el enlace al
   * core, la pestaña de correspondencia de roles. `@SkipPermisos` porque lo
   * consulta cualquier usuario al pintar el menú —no revela nada que quien
   * trabaja en la empresa no vea igual— y porque si exigiera permiso, a un
   * vendedor le daría 403 y la interfaz concluiría «no contratado» por el
   * motivo equivocado.
   *
   * No se cachea en el navegador a propósito: el plan se cambia desde la
   * consola de SUMA y tiene que notarse al recargar, no al día siguiente.
   */
  @SkipPermisos()
  @Get('contratacion')
  async contratacion(@ActiveUser('empresaId') empresaId: string) {
    const perfil = await this.modos.perfilDe(empresaId);
    return {
      usaRegistroExterno: await this.modos.usaRegistroExterno(empresaId),
      cartera: perfil.cartera,
      contabilidad: perfil.contabilidad,
    };
  }

  // ── Coherencia de usuarios y roles ───────────────────────────────────────

  /** Roles del ERP y del registro externo, para armar el mapeo. */
  @Get('roles/catalogos')
  @Roles('administrador', 'direccion')
  async catalogosRoles(@ActiveUser('empresaId') empresaId: string) {
    /*
     * Para una empresa que solo usa el ERP esto no es «un catálogo vacío», es
     * una pantalla que no le toca. Se devuelve `contratado: false` y ni se
     * pregunta al core: preguntar por roles de un registro que no contrató
     * sería, además de inútil, una llamada de red por cada visita.
     */
    const contratado = await this.modos.usaRegistroExterno(empresaId);
    if (!contratado) {
      return { contratado, erp: this.roles.rolesErp(), externos: [], error: null };
    }

    let externos: unknown[] = [];
    let error: string | null = null;
    try {
      externos = await this.roles.rolesExternos();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return { contratado, erp: this.roles.rolesErp(), externos, error };
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
