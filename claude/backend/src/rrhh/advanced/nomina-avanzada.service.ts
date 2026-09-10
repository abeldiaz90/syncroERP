import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { SQL_SERVER_GUID_REGEX } from '../../common/validators/sql-server-guid.validator';
import { PolizasService } from '../../finanzas/services/polizas.service';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import { clabeEsValida } from '../utils/clabe.util';
import { cifrarDatoNomina, descifrarDatoNomina, huellaDatoNomina } from '../utils/datos-sensibles.crypto';
import {
  ConceptoNomina,
  Empleado,
  EstadoPeriodo,
  Incidencia,
  NaturalezaConcepto,
  PartidaRecibo,
  PeriodoNomina,
  ReciboNomina,
} from '../entities/rrhh.entity';
import {
  ActualizarCuentaBancariaEmpleadoDto,
  AplicacionPagoDto,
  ConceptoEmpleadoDto,
  ConciliarDispersionDto,
  ConfiguracionPatronalDto,
  CuentaBancariaEmpleadoDto,
  GenerarDispersionDto,
  MarcarDispersionEnviadaDto,
  ObligacionEmpleadoDto,
  PrestamoDto,
  RegistrarPagoNominaDto,
  ResultadoPacDto,
  ValidarCuentaBancariaDto,
} from './nomina-avanzada.dto';
import {
  AplicacionObligacionNomina,
  AplicacionPagoNomina,
  AprobacionNomina,
  CfdiNomina,
  CierreNomina,
  ConceptoEmpleado,
  ConfiguracionPatronal,
  CuentaBancariaEmpleado,
  DispersionNomina,
  DispersionNominaDetalle,
  EstadoAprobacionNomina,
  EstadoCfdiNomina,
  EstadoCuentaBancariaEmpleado,
  EstadoDispersion,
  EstadoMovimientoNomina,
  EstadoPagoNomina,
  EstadoPrestamo,
  EstadoValidacionCuentaBancaria,
  EventoNomina,
  MovimientoPrestamoNomina,
  ObligacionEmpleado,
  PagoNomina,
  PolizaNominaDetalle,
  PrestamoEmpleado,
  TipoObligacionEmpleado,
} from './nomina-avanzada.entity';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import { Banco } from '../../catalogo/entities/banco.entity';

const money = (value: number | string | null | undefined): number =>
  Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
const dateOnly = (value: string): Date => {
  const result = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(result.getTime())) {
    throw new BadRequestException(`La fecha ${value} no es válida.`);
  }
  return result;
};
const normalizeRole = (value?: string): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

interface UsuarioNomina {
  id: string;
  rol: string;
  email?: string;
}

@Injectable()
export class NominaAvanzadaService {
  constructor(
    @InjectRepository(ConfiguracionPatronal)
    private readonly configuraciones: Repository<ConfiguracionPatronal>,
    @InjectRepository(ConceptoEmpleado)
    private readonly conceptosEmpleado: Repository<ConceptoEmpleado>,
    @InjectRepository(PrestamoEmpleado)
    private readonly prestamos: Repository<PrestamoEmpleado>,
    @InjectRepository(AprobacionNomina)
    private readonly aprobaciones: Repository<AprobacionNomina>,
    @InjectRepository(PagoNomina)
    private readonly pagos: Repository<PagoNomina>,
    @InjectRepository(AplicacionPagoNomina)
    private readonly aplicacionesPago: Repository<AplicacionPagoNomina>,
    @InjectRepository(CierreNomina)
    private readonly cierres: Repository<CierreNomina>,
    @InjectRepository(ObligacionEmpleado)
    private readonly obligaciones: Repository<ObligacionEmpleado>,
    @InjectRepository(CfdiNomina)
    private readonly cfdis: Repository<CfdiNomina>,
    @InjectRepository(DispersionNomina)
    private readonly dispersiones: Repository<DispersionNomina>,
    @InjectRepository(DispersionNominaDetalle)
    private readonly dispersionDetalles: Repository<DispersionNominaDetalle>,
    @InjectRepository(PolizaNominaDetalle)
    private readonly polizaDetalles: Repository<PolizaNominaDetalle>,
    @InjectRepository(CuentaBancariaEmpleado)
    private readonly cuentasBancarias: Repository<CuentaBancariaEmpleado>,
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(PeriodoNomina)
    private readonly periodos: Repository<PeriodoNomina>,
    @InjectRepository(ReciboNomina)
    private readonly recibos: Repository<ReciboNomina>,
    @InjectRepository(PartidaRecibo)
    private readonly partidas: Repository<PartidaRecibo>,
    @InjectRepository(ConceptoNomina)
    private readonly conceptos: Repository<ConceptoNomina>,
    @InjectRepository(Banco)
    private readonly bancos: Repository<Banco>,
    private readonly ds: DataSource,
    private readonly polizasService: PolizasService,
    private readonly tesoreria: TesoreriaService,
    private readonly caja: CajaService,
  ) {}

  async tablero(empresaId: string) {
    const [empleadosActivos, prestamosActivos, obligacionesActivas, cuentasPendientes, periodos, configuracion, incidenciasPendientes] =
      await Promise.all([
        this.empleados.count({ where: { empresaId, estado: 'ACTIVO' as any } }),
        this.prestamos.find({ where: { empresaId, estado: EstadoPrestamo.ACTIVO } }),
        this.obligaciones.count({ where: { empresaId, activo: true } }),
        this.cuentasBancarias.count({
          where: { empresaId, estadoValidacion: EstadoValidacionCuentaBancaria.PENDIENTE },
        }),
        this.periodos.find({ where: { empresaId }, order: { ejercicio: 'DESC', numero: 'DESC' }, take: 12 }),
        this.configuraciones.findOne({ where: { empresaId } }),
        this.ds.getRepository(Incidencia).createQueryBuilder('i')
          .where('i.empresaId = :empresaId', { empresaId })
          .andWhere("i.estadoAprobacion NOT IN ('APROBADA','RECHAZADA','CANCELADA')")
          .getCount(),
      ]);
    const saldoPrestamos = money(
      prestamosActivos.reduce((s, p) => s + Number(p.saldo), 0),
    );
    const configuracionCompleta = Boolean(
      configuracion?.registroPatronal &&
        configuracion?.cuentaNominaPorPagarId &&
        configuracion?.cuentaBancoNominaId &&
        configuracion?.cuentaIsrRetenidoId &&
        configuracion?.cuentaImssObreroId,
    );
    return {
      empleados: empleadosActivos,
      empleadosActivos,
      periodos,
      saldoPrestamos,
      prestamosActivos: prestamosActivos.length,
      obligacionesActivas,
      cuentasPendientes,
      incidenciasPendientes,
      configuracionCompleta,
    };
  }

  obtenerConfiguracion(empresaId: string) {
    return this.configuraciones.findOne({ where: { empresaId } });
  }

  async guardarConfiguracion(
    dto: ConfiguracionPatronalDto,
    empresaId: string,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'finanzas', 'contador'], 'modificar la configuración patronal');
    if (dto.bancoDispersion) {
      const banco = await this.bancos.findOne({ where: { nombre: dto.bancoDispersion, activo: true } });
      if (!banco) throw new BadRequestException('Selecciona un banco activo del catálogo oficial para la dispersión.');
      dto.bancoDispersion = banco.nombre;
    }
    const existente = await this.configuraciones.findOne({ where: { empresaId } });
    const entity = existente
      ? Object.assign(existente, dto)
      : this.configuraciones.create({ ...dto, empresaId, moneda: 'MXN' });
    return this.configuraciones.save(entity);
  }

  async listarConceptosEmpleado(empresaId: string, referenciaEmpleado?: string) {
    const empleadoId = referenciaEmpleado
      ? (await this.resolverEmpleado(referenciaEmpleado, empresaId)).id
      : undefined;
    return this.conceptosEmpleado.find({
      where: empleadoId ? { empresaId, empleadoId } : { empresaId },
      order: { fechaCreacion: 'DESC' },
    });
  }

  async asignarConcepto(
    dto: ConceptoEmpleadoDto,
    empresaId: string,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos'], 'asignar conceptos de nómina');
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const concepto = await this.conceptos.findOne({
      where: { id: dto.conceptoId, empresaId, activo: true },
    });
    if (!concepto) throw new BadRequestException('El concepto no existe o está inactivo.');
    const desde = dateOnly(dto.vigenciaDesde);
    const hasta = dto.vigenciaHasta ? dateOnly(dto.vigenciaHasta) : undefined;
    if (hasta && hasta < desde) {
      throw new BadRequestException('La vigencia final no puede ser anterior a la inicial.');
    }
    return this.conceptosEmpleado.save(
      this.conceptosEmpleado.create({
        ...dto,
        empresaId,
        empleadoId: empleado.id,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
        activo: dto.activo ?? true,
      }),
    );
  }

  async listarPrestamos(empresaId: string, referenciaEmpleado?: string) {
    const empleadoId = referenciaEmpleado
      ? (await this.resolverEmpleado(referenciaEmpleado, empresaId)).id
      : undefined;
    return this.prestamos.find({
      where: empleadoId ? { empresaId, empleadoId } : { empresaId },
      order: { fechaCreacion: 'DESC' },
    });
  }

  async crearPrestamo(
    dto: PrestamoDto,
    empresaId: string,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos', 'finanzas'], 'registrar préstamos');
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const inicio = dateOnly(dto.fechaInicio);
    const fin = dto.fechaFin ? dateOnly(dto.fechaFin) : undefined;
    if (fin && fin < inicio) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial.');
    }
    if (Number(dto.descuentoPeriodo) > Number(dto.montoOriginal)) {
      throw new BadRequestException('El descuento por periodo no puede superar el monto original.');
    }
    return this.prestamos.save(
      this.prestamos.create({
        ...dto,
        empresaId,
        empleadoId: empleado.id,
        montoOriginal: money(dto.montoOriginal),
        saldo: money(dto.montoOriginal),
        descuentoPeriodo: money(dto.descuentoPeriodo),
        fechaInicio: inicio,
        fechaFin: fin,
        estado: EstadoPrestamo.ACTIVO,
      }),
    );
  }

  async crearObligacion(
    dto: ObligacionEmpleadoDto,
    empresaId: string,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos', 'finanzas'], 'registrar obligaciones');
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const desde = dateOnly(dto.vigenciaDesde);
    const hasta = dto.vigenciaHasta ? dateOnly(dto.vigenciaHasta) : undefined;
    if (hasta && hasta < desde) {
      throw new BadRequestException('La vigencia final no puede ser anterior a la inicial.');
    }
    if (dto.modalidad !== 'PORCENTAJE' && Number(dto.valor) <= 0 && Number(dto.saldo) <= 0) {
      throw new BadRequestException('La obligación requiere un valor o saldo mayor que cero.');
    }
    if (dto.modalidad === 'PORCENTAJE' && Number(dto.valor) > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100%.');
    }
    return this.obligaciones.save(
      this.obligaciones.create({
        ...dto,
        empresaId,
        empleadoId: empleado.id,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
        activo: dto.activo ?? true,
      }),
    );
  }

  async listarObligaciones(empresaId: string, referenciaEmpleado?: string) {
    const empleadoId = referenciaEmpleado
      ? (await this.resolverEmpleado(referenciaEmpleado, empresaId)).id
      : undefined;
    return this.obligaciones.find({
      where: empleadoId ? { empresaId, empleadoId } : { empresaId },
      order: { prioridad: 'ASC', fechaCreacion: 'DESC' },
    });
  }

  async prenomina(periodoId: string, empresaId: string) {
    const periodo = await this.obtenerPeriodo(periodoId, empresaId);
    const recibos = await this.recibos.find({
      where: { periodoId, empresaId },
      order: { nombreEmpleado: 'ASC' },
    });
    const partidas = recibos.length
      ? await this.partidas.findBy({ reciboId: In(recibos.map((r) => r.id)) })
      : [];
    const porRecibo = new Map<string, PartidaRecibo[]>();
    for (const partida of partidas) {
      const lista = porRecibo.get(partida.reciboId) ?? [];
      lista.push(partida);
      porRecibo.set(partida.reciboId, lista);
    }
    const filas = recibos.map((r) => {
      let alertas: string[] = [];
      try {
        const snapshot = r.snapshotJson ? JSON.parse(r.snapshotJson) : undefined;
        alertas = Array.isArray(snapshot?.alertas) ? snapshot.alertas : [];
      } catch {
        alertas = ['El snapshot del recibo no pudo interpretarse.'];
      }
      return {
        reciboId: r.id,
        empleadoId: r.empleadoId,
        empleado: r.nombreEmpleado,
        diasPagados: Number(r.diasPagados),
        percepciones: money(r.totalPercepciones),
        deducciones: money(r.totalDeducciones),
        neto: money(r.neto),
        isr: money(r.isrRetenido),
        imss: money(r.imssRetenido),
        costoEmpresa: money(r.costoEmpresa),
        alertas,
        partidas: porRecibo.get(r.id) ?? [],
      };
    });
    return {
      periodo,
      resumen: {
        empleados: recibos.length,
        percepciones: money(periodo.totalPercepciones),
        deducciones: money(periodo.totalDeducciones),
        neto: money(periodo.totalNeto),
        hashCalculo: periodo.hashCalculo,
        versionCalculo: periodo.versionCalculo,
      },
      totales: {
        empleados: recibos.length,
        percepciones: money(periodo.totalPercepciones),
        deducciones: money(periodo.totalDeducciones),
        neto: money(periodo.totalNeto),
        isr: money(recibos.reduce((s, r) => s + Number(r.isrRetenido), 0)),
        imss: money(recibos.reduce((s, r) => s + Number(r.imssRetenido), 0)),
      },
      incidenciasPendientes: 0,
      alertas: filas.reduce((s, f) => s + f.alertas.length, 0),
      filas,
      empleados: filas,
    };
  }

  async prepararAprobacion(
    periodoId: string,
    empresaId: string,
    niveles: number,
    aceptarAlertas: boolean,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos'], 'preparar la aprobación');
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const periodo = await em.findOne(PeriodoNomina, { where: { id: periodoId, empresaId } });
      if (!periodo) throw new NotFoundException('Periodo no encontrado.');
      if (![EstadoPeriodo.CALCULADO, EstadoPeriodo.CON_ALERTAS].includes(periodo.estado)) {
        throw new ConflictException('Solo una nómina calculada puede enviarse a aprobación.');
      }
      if (periodo.estado === EstadoPeriodo.CON_ALERTAS && !aceptarAlertas) {
        throw new ConflictException('La prenómina tiene alertas. Debes reconocerlas expresamente.');
      }
      if (!periodo.hashCalculo) throw new ConflictException('El periodo no tiene snapshot de cálculo.');
      const existentes = await em.count(AprobacionNomina, { where: { empresaId, periodoId } });
      if (existentes) throw new ConflictException('El flujo de aprobación ya fue preparado.');

      const matriz = await em.find(ConfiguracionAprobacion, {
        where: { empresaId, proceso: 'NOMINA', activo: true },
        order: { orden: 'ASC' },
      });
      const definiciones = matriz.length
        ? matriz
        : ['RRHH', 'FINANZAS', 'TESORERIA'].slice(0, niveles).map((rolAprobador, index) => ({
            orden: index + 1, rolAprobador, usuarioId: undefined, tiempoLimiteHoras: 24,
          }));
      if (!definiciones.length) throw new ConflictException('Configura al menos un aprobador para Nómina.');
      const aprobaciones = definiciones.map((definicion, index) =>
        em.create(AprobacionNomina, {
          empresaId,
          periodoId,
          nivel: index + 1,
          rolRequerido: definicion.rolAprobador || 'USUARIO_ASIGNADO',
          usuarioAprobadorId: definicion.usuarioId,
          tiempoLimiteHoras: definicion.tiempoLimiteHoras || 24,
          fechaVencimiento: new Date(Date.now() + (definicion.tiempoLimiteHoras || 24) * 3_600_000),
          preparadaPorId: usuario.id,
          hashCalculoEsperado: periodo.hashCalculo,
          estado: EstadoAprobacionNomina.PENDIENTE,
        }),
      );
      await em.save(AprobacionNomina, aprobaciones);
      periodo.estado = EstadoPeriodo.EN_REVISION;
      periodo.bloqueado = true;
      periodo.motivoBloqueo = 'Nómina enviada a aprobación.';
      periodo.enviadoARevisionPorId = usuario.id;
      periodo.fechaEnvioRevision = new Date();
      await em.save(periodo);
      await this.registrarEvento(em, empresaId, periodoId, 'APROBACION_PREPARADA', EstadoPeriodo.CALCULADO, periodo.estado, usuario.id, { niveles: aprobaciones.length, configurado: matriz.length > 0 });
      return aprobaciones;
    });
  }

  listarAprobaciones(periodoId: string, empresaId: string) {
    return this.aprobaciones.find({ where: { periodoId, empresaId }, order: { nivel: 'ASC' } });
  }

  async resolverAprobacion(
    id: string,
    estado: EstadoAprobacionNomina,
    comentario: string | undefined,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    if (estado === EstadoAprobacionNomina.RECHAZADA && !comentario?.trim()) {
      throw new BadRequestException('El motivo es obligatorio para rechazar.');
    }
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const aprobacion = await em.findOne(AprobacionNomina, { where: { id, empresaId } });
      if (!aprobacion) throw new NotFoundException('Aprobación no encontrada.');
      if (aprobacion.estado !== EstadoAprobacionNomina.PENDIENTE) {
        throw new ConflictException('La aprobación ya fue resuelta.');
      }
      if (aprobacion.preparadaPorId === usuario.id) {
        throw new ForbiddenException('Quien preparó la nómina no puede aprobarla.');
      }
      if (aprobacion.usuarioAprobadorId) {
        if (aprobacion.usuarioAprobadorId !== usuario.id && normalizeRole(usuario.rol) !== 'admin') {
          throw new ForbiddenException('Esta aprobación está asignada a otro usuario.');
        }
      } else {
        this.validarRolAprobacion(aprobacion.rolRequerido, usuario.rol);
      }
      const periodo = await em.findOne(PeriodoNomina, {
        where: { id: aprobacion.periodoId, empresaId },
      });
      if (!periodo) throw new NotFoundException('Periodo no encontrado.');
      if (periodo.estado !== EstadoPeriodo.EN_REVISION) {
        throw new ConflictException('El periodo ya no está en revisión.');
      }
      if (periodo.hashCalculo !== aprobacion.hashCalculoEsperado) {
        throw new ConflictException('El cálculo cambió después de preparar la aprobación.');
      }
      const anteriores = await em.find(AprobacionNomina, {
        where: { periodoId: periodo.id, empresaId },
        order: { nivel: 'ASC' },
      });
      if (
        anteriores.some(
          (a) => a.nivel < aprobacion.nivel && a.estado !== EstadoAprobacionNomina.APROBADA,
        )
      ) {
        throw new ConflictException('Los niveles anteriores aún no han sido aprobados.');
      }
      aprobacion.estado = estado;
      aprobacion.resueltaPorId = usuario.id;
      aprobacion.fechaResolucion = new Date();
      aprobacion.comentario = comentario?.trim();
      await em.save(aprobacion);

      if (estado === EstadoAprobacionNomina.RECHAZADA) {
        periodo.estado = EstadoPeriodo.CON_ALERTAS;
        periodo.bloqueado = false;
        periodo.motivoBloqueo = `Aprobación rechazada en nivel ${aprobacion.nivel}.`;
        await em.save(periodo);
        await this.registrarEvento(em, empresaId, periodo.id, 'NOMINA_RECHAZADA', EstadoPeriodo.EN_REVISION, periodo.estado, usuario.id, { nivel: aprobacion.nivel, comentario });
        return aprobacion;
      }

      const todas = await em.find(AprobacionNomina, { where: { periodoId: periodo.id, empresaId } });
      if (todas.every((a) => a.id === aprobacion.id || a.estado === EstadoAprobacionNomina.APROBADA)) {
        periodo.estado = EstadoPeriodo.APROBADO;
        periodo.bloqueado = true;
        periodo.motivoBloqueo = 'Nómina aprobada; el cálculo es inmutable.';
        await em.save(periodo);
        await this.registrarEvento(em, empresaId, periodo.id, 'NOMINA_APROBADA', EstadoPeriodo.EN_REVISION, periodo.estado, usuario.id, { hash: periodo.hashCalculo });
      }
      return aprobacion;
    });
  }

  async migrarCuentasBancariasLegadas(
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'tesoreria'], 'migrar el cifrado de cuentas bancarias');
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const cuentas = await em.find(CuentaBancariaEmpleado, { where: { empresaId } });
      let migradas = 0;
      const omitidas: Array<{ id: string; motivo: string }> = [];
      for (const cuenta of cuentas) {
        if (cuenta.clabeCifrada) continue;
        const legacy = String(cuenta.clabe ?? '');
        if (!clabeEsValida(legacy)) {
          omitidas.push({ id: cuenta.id, motivo: 'CLABE legada inválida' });
          continue;
        }
        cuenta.clabeCifrada = cifrarDatoNomina(legacy);
        cuenta.clabeHash = huellaDatoNomina(legacy);
        cuenta.clabeUltimos4 = legacy.slice(-4);
        cuenta.clabe = undefined;
        cuenta.estadoValidacion = EstadoValidacionCuentaBancaria.PENDIENTE;
        cuenta.fechaValidacion = undefined;
        cuenta.validadaPorId = undefined;
        cuenta.motivoValidacion = 'Cuenta migrada a almacenamiento cifrado; requiere revalidación independiente.';
        await em.save(cuenta);
        migradas += 1;
      }
      return { migradas, omitidas, total: cuentas.length };
    });
  }

  async crearCuentaBancaria(
    dto: CuentaBancariaEmpleadoDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos', 'tesoreria'], 'capturar cuentas bancarias');
    const usuarioId = usuario.id;
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    if (!clabeEsValida(dto.clabe)) throw new BadRequestException('La CLABE no supera la validación del dígito de control.');
    const banco = dto.bancoClave
      ? await this.bancos.findOne({ where: { clave: dto.bancoClave, activo: true } })
      : await this.bancos.findOne({ where: { nombre: dto.bancoNombre, activo: true } });
    if (!banco) throw new BadRequestException('Selecciona un banco activo del catálogo oficial.');
    dto.bancoClave = banco.clave ?? undefined;
    dto.bancoNombre = banco.nombre;
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      if (dto.principal) {
        await em.update(
          CuentaBancariaEmpleado,
          { empresaId, empleadoId: empleado.id },
          { principal: false },
        );
      }
      const cuenta = em.create(CuentaBancariaEmpleado, {
        ...dto,
        empresaId,
        empleadoId: empleado.id,
        clabe: undefined,
        clabeCifrada: cifrarDatoNomina(dto.clabe),
        clabeHash: huellaDatoNomina(dto.clabe),
        clabeUltimos4: dto.clabe.slice(-4),
        principal: dto.principal ?? false,
        estado: EstadoCuentaBancariaEmpleado.ACTIVA,
        estadoValidacion: EstadoValidacionCuentaBancaria.PENDIENTE,
        creadaPorId: usuarioId,
      });
      return em.save(cuenta);
    });
  }

  async actualizarCuentaBancaria(
    id: string,
    dto: ActualizarCuentaBancariaEmpleadoDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos', 'tesoreria'], 'modificar cuentas bancarias');
    const usuarioId = usuario.id;
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const cuenta = await em.findOne(CuentaBancariaEmpleado, { where: { id, empresaId } });
      if (!cuenta) throw new NotFoundException('Cuenta bancaria no encontrada.');
      if (dto.clabe && !clabeEsValida(dto.clabe)) {
        throw new BadRequestException('La CLABE no supera la validación del dígito de control.');
      }
      const cambiaDatosSensibles = Boolean(
        dto.clabe || dto.bancoClave || dto.bancoNombre || dto.numeroCuenta || dto.titular,
      );
      if (dto.principal) {
        await em.update(
          CuentaBancariaEmpleado,
          { empresaId, empleadoId: cuenta.empleadoId },
          { principal: false },
        );
      }
      Object.assign(cuenta, dto);
      if (dto.clabe) {
        cuenta.clabe = undefined;
        cuenta.clabeCifrada = cifrarDatoNomina(dto.clabe);
        cuenta.clabeHash = huellaDatoNomina(dto.clabe);
        cuenta.clabeUltimos4 = dto.clabe.slice(-4);
      }
      if (cambiaDatosSensibles) {
        cuenta.estadoValidacion = EstadoValidacionCuentaBancaria.PENDIENTE;
        cuenta.fechaValidacion = undefined;
        cuenta.validadaPorId = undefined;
        cuenta.motivoValidacion = 'Datos bancarios modificados; requiere nueva validación.';
      }
      if (dto.estado === EstadoCuentaBancariaEmpleado.BLOQUEADA) cuenta.principal = false;
      return em.save(cuenta);
    });
  }

  async validarCuentaBancaria(
    id: string,
    dto: ValidarCuentaBancariaDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'finanzas', 'tesoreria'], 'validar cuentas bancarias');
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const cuenta = await em.findOne(CuentaBancariaEmpleado, { where: { id, empresaId } });
      if (!cuenta) throw new NotFoundException('Cuenta bancaria no encontrada.');
      if (cuenta.creadaPorId === usuario.id) {
        throw new ForbiddenException('Quien captura una cuenta no puede validarla.');
      }
      if (dto.estado === EstadoValidacionCuentaBancaria.RECHAZADA && !dto.motivo?.trim()) {
        throw new BadRequestException('El motivo de rechazo es obligatorio.');
      }
      const clabe = this.obtenerClabeCuenta(cuenta);
      if (!clabeEsValida(clabe)) {
        throw new BadRequestException('La CLABE guardada no es válida.');
      }
      if (!cuenta.clabeCifrada) {
        cuenta.clabeCifrada = cifrarDatoNomina(clabe);
        cuenta.clabeHash = huellaDatoNomina(clabe);
        cuenta.clabe = undefined;
        cuenta.clabeUltimos4 = clabe.slice(-4);
      }
      cuenta.estadoValidacion = dto.estado;
      cuenta.motivoValidacion = dto.motivo?.trim();
      cuenta.fechaValidacion = new Date();
      cuenta.validadaPorId = usuario.id;
      if (dto.estado === EstadoValidacionCuentaBancaria.RECHAZADA) cuenta.principal = false;
      return em.save(cuenta);
    });
  }

  async listarCuentasBancarias(empresaId: string, referenciaEmpleado?: string) {
    const empleadoId = referenciaEmpleado
      ? (await this.resolverEmpleado(referenciaEmpleado, empresaId)).id
      : undefined;
    const cuentas = await this.cuentasBancarias.find({
      where: empleadoId ? { empresaId, empleadoId } : { empresaId },
      order: { principal: 'DESC', fechaCreacion: 'DESC' },
    });
    return cuentas.map((c) => {
      const { clabeCifrada, clabeHash, clabe, ...publica } = c;
      return {
        ...publica,
        clabe: `**************${c.clabeUltimos4 ?? String(clabe ?? '').slice(-4)}`,
        numeroCuenta: c.numeroCuenta ? `****${c.numeroCuenta.slice(-4)}` : undefined,
      };
    });
  }

  async generarCfdiBorradores(
    periodoId: string,
    empresaId: string,
    enviarPac: boolean,
    usuario: UsuarioNomina,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'rrhh', 'recursoshumanos'], 'preparar CFDI de nómina');
    const periodo = await this.obtenerPeriodo(periodoId, empresaId);
    if (![EstadoPeriodo.APROBADO, EstadoPeriodo.CFDI_PREPARADO].includes(periodo.estado)) {
      throw new ConflictException('La nómina debe estar aprobada antes de preparar CFDI.');
    }
    const config = await this.configuraciones.findOne({ where: { empresaId } });
    if (!config) throw new ConflictException('Configura los datos patronales.');
    if (enviarPac && !this.pacHabilitado(config)) {
      throw new ConflictException(
        'No existe un adaptador PAC real habilitado. Se generarán únicamente expedientes de preparación.',
      );
    }
    const recibos = await this.recibos.find({ where: { periodoId, empresaId } });
    if (!recibos.length) throw new ConflictException('No existen recibos calculados.');
    const existentes = await this.cfdis.find({ where: { periodoId, empresaId } });
    const mapa = new Map(existentes.map((c) => [c.reciboId, c]));
    const salida: CfdiNomina[] = [];
    for (const recibo of recibos) {
      let cfdi = mapa.get(recibo.id);
      if (!cfdi) {
        const payload = {
          tipo: 'CFDI_NOMINA_PREPARACION',
          versionCfdi: '4.0',
          complemento: 'Nomina 1.2 revision E',
          periodoId,
          reciboId: recibo.id,
          empleadoId: recibo.empleadoId,
          hashRecibo: recibo.hashRecibo,
          totalPercepciones: money(recibo.totalPercepciones),
          totalDeducciones: money(recibo.totalDeducciones),
          neto: money(recibo.neto),
        };
        cfdi = this.cfdis.create({
          empresaId,
          periodoId,
          reciboId: recibo.id,
          proveedorPac: config.proveedorPac,
          estado: enviarPac ? EstadoCfdiNomina.PENDIENTE_PAC : EstadoCfdiNomina.BORRADOR,
          xmlSolicitud: JSON.stringify(payload),
          intentos: enviarPac ? 1 : 0,
        });
        cfdi = await this.cfdis.save(cfdi);
      }
      salida.push(cfdi);
    }
    periodo.estado = enviarPac ? EstadoPeriodo.CFDI_PREPARADO : EstadoPeriodo.CFDI_PREPARADO;
    periodo.bloqueado = true;
    await this.periodos.save(periodo);
    return {
      periodoId,
      total: salida.length,
      advertencia: enviarPac
        ? undefined
        : 'Se generaron expedientes de preparación; no son CFDI timbrados.',
      cfdis: salida,
    };
  }

  listarCfdis(periodoId: string, empresaId: string) {
    return this.cfdis.find({ where: { periodoId, empresaId }, order: { fechaCreacion: 'ASC' } });
  }

  async registrarResultadoPac(
    id: string,
    dto: ResultadoPacDto,
    empresaId: string,
    secretRecibido: string | undefined,
  ) {
    this.validarWebhookPac(secretRecibido);
    const cfdi = await this.cfdis.findOne({ where: { id, empresaId } });
    if (!cfdi) throw new NotFoundException('CFDI no encontrado.');
    if ([EstadoCfdiNomina.TIMBRADO, EstadoCfdiNomina.CANCELADO].includes(cfdi.estado)) {
      if (dto.estado === cfdi.estado) return cfdi;
      throw new ConflictException('El CFDI ya está en un estado fiscal definitivo.');
    }
    if (dto.estado === 'TIMBRADO' && (!dto.uuidFiscal || !dto.xmlTimbrado)) {
      throw new BadRequestException('El PAC debe devolver UUID y XML timbrado.');
    }
    if (dto.estado === 'TIMBRADO' && dto.uuidFiscal) {
      const duplicado = await this.cfdis.findOne({
        where: { empresaId, uuidFiscal: dto.uuidFiscal },
      });
      if (duplicado && duplicado.id !== cfdi.id) {
        throw new ConflictException('El UUID fiscal ya está asociado a otro recibo de nómina.');
      }
    }
    cfdi.estado = dto.estado as EstadoCfdiNomina;
    cfdi.uuidFiscal = dto.uuidFiscal ?? cfdi.uuidFiscal;
    cfdi.xmlTimbrado = dto.xmlTimbrado ?? cfdi.xmlTimbrado;
    cfdi.acuseCancelacion = dto.acuseCancelacion ?? cfdi.acuseCancelacion;
    cfdi.ultimoError = dto.ultimoError;
    if (dto.estado === 'TIMBRADO') cfdi.fechaTimbrado = new Date();
    if (dto.estado === 'CANCELADO') cfdi.fechaCancelacion = new Date();
    const guardado = await this.cfdis.save(cfdi);
    const todos = await this.cfdis.find({ where: { periodoId: cfdi.periodoId, empresaId } });
    if (todos.length && todos.every((c) => c.estado === EstadoCfdiNomina.TIMBRADO)) {
      const periodo = await this.obtenerPeriodo(cfdi.periodoId, empresaId);
      periodo.estado = EstadoPeriodo.TIMBRADO;
      periodo.bloqueado = true;
      await this.periodos.save(periodo);
    }
    return guardado;
  }

  async generarDispersion(
    periodoId: string,
    dto: GenerarDispersionDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'tesoreria', 'finanzas'], 'generar dispersión');
    const periodo = await this.obtenerPeriodo(periodoId, empresaId);
    if (![EstadoPeriodo.APROBADO, EstadoPeriodo.CFDI_PREPARADO, EstadoPeriodo.TIMBRADO].includes(periodo.estado)) {
      throw new ConflictException('La nómina debe estar aprobada antes de dispersarse.');
    }
    const previa = await this.dispersiones.findOne({ where: { empresaId, periodoId } });
    if (previa && [EstadoDispersion.ENVIADA, EstadoDispersion.PARCIAL, EstadoDispersion.CONCILIADA].includes(previa.estado)) {
      throw new ConflictException('La dispersión ya fue enviada y no puede regenerarse.');
    }
    if (dto.formato !== 'CSV_PRELAYOUT' && process.env.NOMINA_BANK_ADAPTER_ENABLED !== 'true') {
      throw new ConflictException(
        `El layout ${dto.formato} requiere un adaptador bancario real. Usa CSV_PRELAYOUT o configura el adaptador.`,
      );
    }
    const recibos = await this.recibos.find({ where: { periodoId, empresaId } });
    if (!recibos.length) throw new ConflictException('No existen recibos para dispersar.');
    const empleadoIds = recibos.map((r) => r.empleadoId);
    const empleados = await this.empleados.findBy({ id: In(empleadoIds), empresaId });
    const empleadoMapa = new Map(empleados.map((e) => [e.id, e]));
    const cuentas = await this.cuentasBancarias.find({
      where: {
        empresaId,
        empleadoId: In(empleadoIds),
        principal: true,
        estado: EstadoCuentaBancariaEmpleado.ACTIVA,
        estadoValidacion: EstadoValidacionCuentaBancaria.VALIDADA,
      },
    });
    const cuentaMapa = new Map(cuentas.map((c) => [c.empleadoId, c]));
    const faltantes = recibos.filter((r) => !cuentaMapa.has(r.empleadoId));
    if (faltantes.length) {
      throw new ConflictException({
        message: 'Hay empleados sin cuenta principal activa y validada.',
        empleados: faltantes.map((r) => r.nombreEmpleado),
      });
    }
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      let dispersion = await em.findOne(DispersionNomina, { where: { empresaId, periodoId } });
      if (!dispersion) {
        dispersion = em.create(DispersionNomina, {
          empresaId,
          periodoId,
          banco: dto.banco,
          estado: EstadoDispersion.BORRADOR,
          creadoPorId: usuario.id,
          total: 0,
          registros: 0,
        });
        dispersion = await em.save(dispersion);
      } else {
        await em.delete(DispersionNominaDetalle, { dispersionId: dispersion.id });
      }
      const lineas = ['CLABE,BENEFICIARIO,MONTO,REFERENCIA'];
      const detalles: DispersionNominaDetalle[] = [];
      for (let i = 0; i < recibos.length; i += 1) {
        const recibo = recibos[i];
        const cuenta = cuentaMapa.get(recibo.empleadoId)!;
        const empleado = empleadoMapa.get(recibo.empleadoId);
        const referencia = `NOM${periodo.ejercicio}${String(periodo.numero).padStart(2, '0')}${String(i + 1).padStart(5, '0')}`;
        const beneficiario = cuenta.titular || recibo.nombreEmpleado;
        const clabeDestino = this.obtenerClabeCuenta(cuenta);
        lineas.push(`${clabeDestino},"${beneficiario.replace(/"/g, '')}",${money(recibo.neto).toFixed(2)},${referencia}`);
        detalles.push(
          em.create(DispersionNominaDetalle, {
            empresaId,
            dispersionId: dispersion.id,
            empleadoId: recibo.empleadoId,
            reciboId: recibo.id,
            cuentaDestino: clabeDestino,
            beneficiario,
            monto: money(recibo.neto),
            montoAceptado: 0,
            referencia,
            estado: 'PENDIENTE',
          }),
        );
      }
      const contenido = lineas.join('\n');
      dispersion.banco = dto.banco;
      dispersion.total = money(recibos.reduce((s, r) => s + Number(r.neto), 0));
      dispersion.registros = recibos.length;
      dispersion.estado = EstadoDispersion.GENERADA;
      dispersion.nombreArchivo = `prelayout_nomina_${periodo.ejercicio}_${periodo.numero}.csv`;
      dispersion.contenidoArchivo = contenido;
      dispersion.hashArchivo = this.hash(contenido);
      await em.save(dispersion);
      await em.save(DispersionNominaDetalle, detalles);
      periodo.estado = EstadoPeriodo.DISPERSION_GENERADA;
      periodo.bloqueado = true;
      periodo.motivoBloqueo = 'Dispersión generada.';
      await em.save(periodo);
      await this.registrarEvento(em, empresaId, periodoId, 'DISPERSION_GENERADA', undefined, periodo.estado, usuario.id, { hashArchivo: dispersion.hashArchivo, formato: dto.formato });
      return { dispersion: this.sanitizarDispersion(dispersion), detalles: detalles.map((d) => this.sanitizarDetalleDispersion(d)) };
    });
  }

  async marcarDispersionEnviada(
    periodoId: string,
    dto: MarcarDispersionEnviadaDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'tesoreria'], 'marcar una dispersión como enviada');
    const dispersion = await this.dispersiones.findOne({ where: { periodoId, empresaId } });
    if (!dispersion) throw new NotFoundException('Dispersión no encontrada.');
    if (dispersion.estado !== EstadoDispersion.GENERADA) {
      throw new ConflictException('Solo una dispersión generada puede marcarse como enviada.');
    }
    if (!dispersion.hashArchivo || dispersion.hashArchivo !== dto.hashArchivo) {
      throw new ConflictException('El hash del archivo enviado no corresponde al archivo generado.');
    }
    dispersion.estado = EstadoDispersion.ENVIADA;
    dispersion.referenciaBanco = dto.referenciaEnvio;
    dispersion.fechaEnvio = new Date();
    await this.dispersiones.save(dispersion);
    const periodo = await this.obtenerPeriodo(periodoId, empresaId);
    periodo.estado = EstadoPeriodo.EN_DISPERSION;
    await this.periodos.save(periodo);
    return this.sanitizarDispersion(dispersion);
  }

  async obtenerDispersion(periodoId: string, empresaId: string) {
    const dispersion = await this.dispersiones.findOne({ where: { periodoId, empresaId } });
    if (!dispersion) return null;
    const detalles = await this.dispersionDetalles.find({ where: { dispersionId: dispersion.id } });
    return {
      dispersion: this.sanitizarDispersion(dispersion),
      detalles: detalles.map((d) => this.sanitizarDetalleDispersion(d)),
    };
  }

  async conciliarDispersion(
    periodoId: string,
    dto: ConciliarDispersionDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'tesoreria'], 'conciliar dispersión');
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const dispersion = await em.findOne(DispersionNomina, { where: { periodoId, empresaId } });
      if (!dispersion) throw new NotFoundException('Dispersión no encontrada.');
      if (dispersion.estado !== EstadoDispersion.ENVIADA) {
        throw new ConflictException('Solo una dispersión enviada puede conciliarse.');
      }
      const detalles = await em.find(DispersionNominaDetalle, { where: { dispersionId: dispersion.id } });
      const mapa = new Map(detalles.map((d) => [d.id, d]));
      if (dto.resultados.length !== detalles.length) {
        throw new BadRequestException('La respuesta bancaria debe incluir todos los registros enviados.');
      }
      for (const resultado of dto.resultados) {
        const detalle = mapa.get(resultado.detalleId);
        if (!detalle) throw new BadRequestException(`El detalle ${resultado.detalleId} no pertenece a la dispersión.`);
        if (resultado.estado === 'ACEPTADO' && Math.abs(money(resultado.montoAceptado) - money(detalle.monto)) > 0.01) {
          throw new BadRequestException(`El monto aceptado de ${detalle.beneficiario} no coincide con el enviado.`);
        }
        detalle.estado = resultado.estado;
        detalle.montoAceptado = money(resultado.montoAceptado);
        detalle.referencia = resultado.referenciaBanco ?? detalle.referencia;
        detalle.mensajeBanco = resultado.mensaje;
        detalle.fechaResultado = new Date();
      }
      await em.save(DispersionNominaDetalle, detalles);
      const aceptados = detalles.filter((d) => d.estado === 'ACEPTADO');
      dispersion.estado = aceptados.length === detalles.length ? EstadoDispersion.CONCILIADA : EstadoDispersion.PARCIAL;
      dispersion.hashRespuestaBanco = dto.hashRespuestaBanco;
      dispersion.referenciaBanco = dto.referenciaBanco;
      dispersion.evidenciaConciliacionJson = JSON.stringify(dto.resultados);
      dispersion.fechaConciliacion = new Date();
      await em.save(dispersion);
      await this.registrarEvento(em, empresaId, periodoId, 'DISPERSION_CONCILIADA', EstadoDispersion.ENVIADA, dispersion.estado, usuario.id, { aceptados: aceptados.length, rechazados: detalles.length - aceptados.length });
      return { dispersion: this.sanitizarDispersion(dispersion), detalles: detalles.map((d) => this.sanitizarDetalleDispersion(d)) };
    });
  }

  async registrarPago(
    periodoId: string,
    dto: RegistrarPagoNominaDto,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(usuario.rol, ['admin', 'tesoreria'], 'registrar el pago de nómina');
    const idempotente = await this.pagos.findOne({ where: { empresaId, idempotencyKey: dto.idempotencyKey } });
    if (idempotente) return this.obtenerPago(idempotente.periodoId, empresaId);
    const pagoPeriodo = await this.pagos.findOne({ where: { empresaId, periodoId } });
    if (pagoPeriodo) {
      throw new ConflictException(
        'El periodo ya tiene un pago registrado. No puede sobrescribirse; cualquier corrección requiere reversión formal.',
      );
    }

    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const periodo = await em.findOne(PeriodoNomina, { where: { id: periodoId, empresaId } });
      if (!periodo) throw new NotFoundException('Periodo no encontrado.');
      if (![EstadoPeriodo.APROBADO, EstadoPeriodo.CFDI_PREPARADO, EstadoPeriodo.TIMBRADO, EstadoPeriodo.EN_DISPERSION].includes(periodo.estado)) {
        throw new ConflictException('La nómina debe estar aprobada antes de registrar el pago.');
      }
      const aprobaciones = await em.find(AprobacionNomina, { where: { periodoId, empresaId } });
      if (!aprobaciones.length || aprobaciones.some((a) => a.estado !== EstadoAprobacionNomina.APROBADA)) {
        throw new ConflictException('Todas las aprobaciones deben estar completadas.');
      }
      const total = money(dto.aplicaciones.reduce((s, a) => s + Number(a.monto) * Number(a.tipoCambio ?? 1), 0));
      const totalPeriodo = money(periodo.totalNeto);
      if (Math.abs(total - totalPeriodo) > 0.01) {
        throw new BadRequestException(`Las aplicaciones (${total}) deben coincidir con el neto (${totalPeriodo}).`);
      }
      for (const aplicacion of dto.aplicaciones) this.validarAplicacionPago(aplicacion);
      const transferencia = money(
        dto.aplicaciones
          .filter((a) => a.metodo === 'TRANSFERENCIA')
          .reduce((s, a) => s + Number(a.monto) * Number(a.tipoCambio ?? 1), 0),
      );
      if (transferencia > 0) {
        const dispersion = await em.findOne(DispersionNomina, { where: { empresaId, periodoId } });
        if (!dispersion || dispersion.estado !== EstadoDispersion.CONCILIADA) {
          throw new ConflictException('La transferencia requiere una dispersión conciliada con evidencia bancaria.');
        }
        const aceptado = money(
          (await em.find(DispersionNominaDetalle, { where: { dispersionId: dispersion.id, estado: 'ACEPTADO' } }))
            .reduce((s, d) => s + Number(d.montoAceptado), 0),
        );
        if (Math.abs(aceptado - transferencia) > 0.01) {
          throw new ConflictException(`El total bancario aceptado (${aceptado}) no coincide con la transferencia (${transferencia}).`);
        }
      }
      const configuracion = await em.findOne(ConfiguracionPatronal, { where: { empresaId } });
      if (!configuracion?.cuentaNominaPorPagarId) {
        throw new ConflictException('Configura la cuenta contable Nómina por pagar.');
      }
      const partidasPago = dto.aplicaciones.map((a) => ({
        cuentaContableId: a.cuentaFinancieraId ?? configuracion.cuentaBancoNominaId,
        cargo: 0,
        abono: money(Number(a.monto) * Number(a.tipoCambio ?? 1)),
        referencia: `${a.metodo} ${a.referencia ?? ''}`.trim(),
      }));
      if (partidasPago.some((p) => !p.cuentaContableId)) {
        throw new ConflictException('Cada forma de pago debe tener una cuenta financiera configurada.');
      }
      partidasPago.unshift({
        cuentaContableId: configuracion.cuentaNominaPorPagarId,
        cargo: totalPeriodo,
        abono: 0,
        referencia: `Pago nómina ${periodo.ejercicio}-${periodo.numero}`,
      });
      const polizaPago = await this.polizasService.crearPolizaManualEnTransaccion(em, {
        empresaId,
        tipo: 'EGRESO',
        fecha: periodo.fechaPago,
        concepto: `Pago de nómina ${periodo.ejercicio}-${periodo.numero}`,
        origenClave: `NOMINA-PAGO:${periodo.id}:${periodo.hashCalculo}`,
        origenTipo: 'NOMINA_PAGO',
        partidas: partidasPago as any,
      });
      const pago = em.create(PagoNomina, {
        empresaId,
        periodoId,
        totalPeriodo,
        totalAplicado: total,
        saldo: 0,
        estado: EstadoPagoNomina.PAGADO,
        idempotencyKey: dto.idempotencyKey,
        fechaPago: new Date(),
        polizaPagoId: polizaPago.id,
      });
      const guardado = await em.save(pago);

      /*
       * REGISTRO EN TESORERÍA
       *
       * La póliza abonaba la cuenta contable del banco, pero no se creaba
       * ningún `MovimientoTesoreria`: el saldo bancario en Tesorería quedaba
       * sobrevaluado por el importe íntegro de la nómina en cada periodo y la
       * conciliación bancaria no podía cuadrar nunca. `OrigenMovimiento.NOMINA`
       * llevaba declarado desde el principio sin que nadie lo produjera.
       *
       * COMPENSACION no mueve dinero (se descuenta contra un adeudo), así que
       * se excluye a propósito.
       */
      for (const aplicacion of dto.aplicaciones) {
        if (aplicacion.metodo === 'COMPENSACION') continue;
        if (!aplicacion.cuentaBancariaId) continue;

        const importe = money(
          Number(aplicacion.monto) * Number(aplicacion.tipoCambio ?? 1),
        );
        const movimiento = await this.tesoreria.registrarEnTransaccion(
          {
            cuentaBancariaId: aplicacion.cuentaBancariaId,
            fecha: new Date(periodo.fechaPago).toISOString().slice(0, 10),
            tipo: TipoMovimiento.EGRESO,
            importe,
            concepto: `Pago de nómina ${periodo.ejercicio}-${periodo.numero}`,
            origen: OrigenMovimiento.NOMINA,
            referencia: aplicacion.referencia,
            documentoId: guardado.id,
            tipoDocumento: 'PAGO_NOMINA',
          },
          empresaId,
          usuario.id,
          em,
        );

        // Si la nómina se paga en efectivo, el turno también debe descargarse.
        const cuenta = await em.findOne(CuentaBancaria, {
          where: { id: aplicacion.cuentaBancariaId, empresaId },
        });
        if (cuenta?.tipo === TipoCuentaBancaria.CAJA) {
          await this.caja.registrarEnTransaccion(
            em,
            {
              cuentaCajaId: cuenta.id,
              naturaleza: NaturalezaMovimientoCaja.SALIDA,
              tipo: TipoMovimientoCaja.RETIRO,
              importe,
              concepto: `Pago de nómina ${periodo.ejercicio}-${periodo.numero}`,
              referencia: aplicacion.referencia ?? movimiento?.folio,
              documentoId: guardado.id,
              tipoDocumento: 'PAGO_NOMINA',
            },
            empresaId,
            usuario.id,
          );
        }
      }
      await em.save(
        AplicacionPagoNomina,
        dto.aplicaciones.map((a) =>
          em.create(AplicacionPagoNomina, {
            ...a,
            empresaId,
            pagoNominaId: guardado.id,
          }),
        ),
      );
      await this.aplicarMovimientosNomina(em, periodoId, empresaId);
      periodo.estado = periodo.polizaId
        ? EstadoPeriodo.CONTABILIZADO
        : EstadoPeriodo.PAGADO;
      periodo.bloqueado = true;
      periodo.motivoBloqueo = periodo.polizaId
        ? 'Nómina pagada y contabilizada.'
        : 'Nómina pagada; falta contabilización del devengo.';
      await em.save(periodo);
      await this.registrarEvento(em, empresaId, periodoId, 'NOMINA_PAGADA', undefined, periodo.estado, usuario.id, { polizaPagoId: polizaPago.id, total });
      return this.obtenerPagoConManager(periodoId, empresaId, em);
    });
  }

  obtenerPago(periodoId: string, empresaId: string) {
    return this.obtenerPagoConManager(periodoId, empresaId, this.ds.manager);
  }

  private async obtenerPagoConManager(periodoId: string, empresaId: string, em: EntityManager) {
    const pago = await em.findOne(PagoNomina, { where: { periodoId, empresaId } });
    if (!pago) return null;
    const aplicaciones = await em.find(AplicacionPagoNomina, {
      where: { pagoNominaId: pago.id, empresaId },
      order: { fechaCreacion: 'ASC' },
    });
    return { pago, aplicaciones };
  }

  async generarPolizaDetallada(
    periodoId: string,
    usuario: UsuarioNomina,
    empresaId: string,
  ) {
    this.exigirRol(
      usuario.rol,
      ['admin', 'finanzas', 'contador'],
      'contabilizar la nómina',
    );
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const periodo = await em.findOne(PeriodoNomina, {
        where: { id: periodoId, empresaId },
      });
      if (!periodo) throw new NotFoundException('Periodo no encontrado.');
      if (
        ![
          EstadoPeriodo.APROBADO,
          EstadoPeriodo.CFDI_PREPARADO,
          EstadoPeriodo.TIMBRADO,
          EstadoPeriodo.PAGADO,
          EstadoPeriodo.CONTABILIZADO,
        ].includes(periodo.estado)
      ) {
        throw new ConflictException(
          'La nómina debe estar aprobada antes de contabilizarse.',
        );
      }
      if (!periodo.hashCalculo) {
        throw new ConflictException('El periodo no tiene snapshot de cálculo.');
      }
      const config = await em.findOne(ConfiguracionPatronal, {
        where: { empresaId },
      });
      if (!config) throw new ConflictException('Falta configuración patronal.');
      const recibos = await em.find(ReciboNomina, {
        where: { periodoId, empresaId },
      });
      const partidas = recibos.length
        ? await em.find(PartidaRecibo, {
            where: { reciboId: In(recibos.map((r) => r.id)) },
          })
        : [];
      if (!partidas.length) {
        throw new ConflictException('No existen partidas de nómina.');
      }

      const faltantes: string[] = [];
      const acumulado = new Map<
        string,
        {
          cuentaId: string;
          descripcion: string;
          cargo: number;
          abono: number;
          clave?: string;
        }
      >();
      const agregar = (
        cuentaId: string | undefined,
        descripcion: string,
        cargo: number,
        abono: number,
        clave?: string,
      ) => {
        if (!cuentaId) {
          faltantes.push(descripcion);
          return;
        }
        const key = `${cuentaId}|${descripcion}`;
        const actual = acumulado.get(key) ?? {
          cuentaId,
          descripcion,
          cargo: 0,
          abono: 0,
          clave,
        };
        actual.cargo = money(actual.cargo + cargo);
        actual.abono = money(actual.abono + abono);
        acumulado.set(key, actual);
      };

      for (const partida of partidas) {
        if (
          partida.naturaleza === NaturalezaConcepto.PERCEPCION ||
          partida.naturaleza === NaturalezaConcepto.OTRO_PAGO
        ) {
          agregar(
            partida.cuentaContableId,
            partida.concepto,
            Number(partida.importe),
            0,
            partida.clave,
          );
        } else {
          agregar(
            this.cuentaPasivoDeduccion(partida, config),
            partida.concepto,
            0,
            Number(partida.importe),
            partida.clave,
          );
        }
      }
      agregar(
        config.cuentaNominaPorPagarId,
        'Nómina neta por pagar',
        0,
        Number(periodo.totalNeto),
        'NETO',
      );

      const imssPatronal = money(
        recibos.reduce((suma, recibo) => suma + Number(recibo.imssPatronal), 0),
      );
      const infonavitPatronal = money(
        recibos.reduce(
          (suma, recibo) => suma + Number(recibo.infonavitPatronal),
          0,
        ),
      );
      const isn = money(
        recibos.reduce((suma, recibo) => suma + Number(recibo.isn), 0),
      );
      if (imssPatronal > 0) {
        agregar(
          config.cuentaGastoImssPatronalId,
          'Gasto IMSS patronal',
          imssPatronal,
          0,
          'IMSS-P',
        );
        agregar(
          config.cuentaImssPatronalId,
          'IMSS patronal por pagar',
          0,
          imssPatronal,
          'IMSS-P',
        );
      }
      if (infonavitPatronal > 0) {
        agregar(
          config.cuentaGastoInfonavitId,
          'Gasto INFONAVIT patronal',
          infonavitPatronal,
          0,
          'INF-P',
        );
        agregar(
          config.cuentaInfonavitId,
          'INFONAVIT por pagar',
          0,
          infonavitPatronal,
          'INF-P',
        );
      }
      if (isn > 0) {
        agregar(
          config.cuentaGastoIsnId,
          'Gasto impuesto sobre nómina',
          isn,
          0,
          'ISN',
        );
        agregar(
          config.cuentaIsnId,
          'Impuesto sobre nómina por pagar',
          0,
          isn,
          'ISN',
        );
      }
      if (faltantes.length) {
        throw new ConflictException({
          message: 'No se puede contabilizar porque faltan cuentas contables.',
          conceptos: [...new Set(faltantes)],
        });
      }

      const lineas = [...acumulado.values()];
      const cargos = money(lineas.reduce((suma, linea) => suma + linea.cargo, 0));
      const abonos = money(lineas.reduce((suma, linea) => suma + linea.abono, 0));
      if (Math.abs(cargos - abonos) > 0.01) {
        throw new ConflictException(
          `La póliza no cuadra. Cargos ${cargos}; abonos ${abonos}.`,
        );
      }

      const poliza = await this.polizasService.crearPolizaManualEnTransaccion(
        em,
        {
          empresaId,
          tipo: 'DIARIO',
          fecha: periodo.fechaPago,
          concepto: `Devengo de nómina ${periodo.ejercicio}-${periodo.numero}`,
          origenClave: `NOMINA-DEVENGO:${periodo.id}:${periodo.hashCalculo}`,
          origenTipo: 'NOMINA_DEVENGO',
          partidas: lineas.map((linea) => ({
            cuentaContableId: linea.cuentaId,
            cargo: linea.cargo,
            abono: linea.abono,
            referencia: linea.descripcion.slice(0, 50),
          })),
        },
      );

      await em.delete(PolizaNominaDetalle, { empresaId, periodoId });
      await em.save(
        PolizaNominaDetalle,
        lineas.map((linea, index) =>
          em.create(PolizaNominaDetalle, {
            empresaId,
            periodoId,
            numeroLinea: index + 1,
            cuenta: linea.cuentaId,
            descripcion: linea.descripcion,
            conceptoClave: linea.clave,
            cargo: linea.cargo,
            abono: linea.abono,
          }),
        ),
      );
      const anterior = periodo.estado;
      periodo.polizaId = poliza.id;
      if (periodo.estado === EstadoPeriodo.PAGADO) {
        periodo.estado = EstadoPeriodo.CONTABILIZADO;
      }
      periodo.bloqueado = true;
      periodo.motivoBloqueo = periodo.estado === EstadoPeriodo.CONTABILIZADO
        ? 'Nómina pagada y contabilizada; el cálculo es inmutable.'
        : 'Póliza de devengo generada; el cálculo es inmutable.';
      await em.save(periodo);
      await this.registrarEvento(
        em,
        empresaId,
        periodoId,
        'NOMINA_CONTABILIZADA',
        anterior,
        periodo.estado,
        usuario.id,
        { polizaId: poliza.id, cargos, abonos },
      );
      return {
        periodoId,
        polizaId: poliza.id,
        folio: poliza.folio,
        cargos,
        abonos,
        lineas,
      };
    });
  }

  listarPoliza(periodoId: string, empresaId: string) {
    return this.polizaDetalles.find({ where: { periodoId, empresaId }, order: { numeroLinea: 'ASC' } });
  }

  async cerrar(periodoId: string, empresaId: string, usuario: UsuarioNomina) {
    this.exigirRol(usuario.rol, ['admin', 'finanzas', 'contador'], 'cerrar la nómina');
    const existente = await this.cierres.findOne({ where: { empresaId, periodoId } });
    if (existente) return existente;
    return this.ds.transaction('SERIALIZABLE', async (em) => {
      const periodo = await em.findOne(PeriodoNomina, { where: { id: periodoId, empresaId } });
      if (!periodo) throw new NotFoundException('Periodo no encontrado.');
      if (periodo.estado !== EstadoPeriodo.CONTABILIZADO) {
        throw new ConflictException('La nómina debe estar pagada y contabilizada antes de cerrar.');
      }
      const config = await em.findOne(ConfiguracionPatronal, { where: { empresaId } });
      const pago = await em.findOne(PagoNomina, { where: { empresaId, periodoId } });
      if (!pago || pago.estado !== EstadoPagoNomina.PAGADO || !pago.polizaPagoId) {
        throw new ConflictException('Falta pago completo o póliza de pago.');
      }
      if (!periodo.polizaId) throw new ConflictException('Falta póliza de devengo.');
      const recibos = await em.find(ReciboNomina, { where: { periodoId, empresaId } });
      const cfdis = await em.find(CfdiNomina, { where: { periodoId, empresaId } });
      if (!config?.permiteCierreSinTimbrar) {
        if (cfdis.length !== recibos.length || cfdis.some((c) => c.estado !== EstadoCfdiNomina.TIMBRADO)) {
          throw new ConflictException('No se puede cerrar: existen recibos sin CFDI timbrado.');
        }
      }
      const aplicaciones = await em.find(AplicacionPagoNomina, { where: { pagoNominaId: pago.id } });
      if (aplicaciones.some((a) => a.metodo === 'TRANSFERENCIA')) {
        const dispersion = await em.findOne(DispersionNomina, { where: { empresaId, periodoId } });
        if (!dispersion || dispersion.estado !== EstadoDispersion.CONCILIADA) {
          throw new ConflictException('No se puede cerrar: la dispersión bancaria no está conciliada.');
        }
      }
      const lineas = await em.find(PolizaNominaDetalle, { where: { empresaId, periodoId } });
      const cargos = money(lineas.reduce((s, l) => s + Number(l.cargo), 0));
      const abonos = money(lineas.reduce((s, l) => s + Number(l.abono), 0));
      if (!lineas.length || Math.abs(cargos - abonos) > 0.01) {
        throw new ConflictException('La póliza detallada no existe o está descuadrada.');
      }
      const cierre = em.create(CierreNomina, {
        empresaId,
        periodoId,
        totalPercepciones: money(periodo.totalPercepciones),
        totalDeducciones: money(periodo.totalDeducciones),
        totalNeto: money(periodo.totalNeto),
        totalPagado: money(pago.totalAplicado),
        cargos,
        abonos,
        estadoContable: 'CONTABILIZADO',
        folioPoliza: String(periodo.polizaId),
        polizaPagoId: pago.polizaPagoId,
        cerradoPorId: usuario.id,
      });
      const guardado = await em.save(cierre);
      periodo.estado = EstadoPeriodo.CERRADO;
      periodo.bloqueado = true;
      periodo.motivoBloqueo = 'Nómina cerrada de forma definitiva.';
      await em.save(periodo);
      await this.registrarEvento(em, empresaId, periodoId, 'NOMINA_CERRADA', EstadoPeriodo.CONTABILIZADO, EstadoPeriodo.CERRADO, usuario.id, { cierreId: guardado.id });
      return guardado;
    });
  }

  async tableroCumplimiento(periodoId: string, empresaId: string) {
    const [cfdis, dispersion, poliza, pago, aprobaciones, obligaciones] = await Promise.all([
      this.listarCfdis(periodoId, empresaId),
      this.obtenerDispersion(periodoId, empresaId),
      this.listarPoliza(periodoId, empresaId),
      this.obtenerPago(periodoId, empresaId),
      this.listarAprobaciones(periodoId, empresaId),
      this.obligaciones.count({ where: { empresaId, activo: true } }),
    ]);
    return {
      aprobaciones: {
        total: aprobaciones.length,
        aprobadas: aprobaciones.filter((a) => a.estado === EstadoAprobacionNomina.APROBADA).length,
      },
      cfdi: {
        total: cfdis.length,
        timbrados: cfdis.filter((c) => c.estado === EstadoCfdiNomina.TIMBRADO).length,
        errores: cfdis.filter((c) => c.estado === EstadoCfdiNomina.ERROR).length,
      },
      dispersion: dispersion?.dispersion ?? null,
      pago: pago?.pago ?? null,
      poliza: {
        lineas: poliza.length,
        cargos: money(poliza.reduce((s, l) => s + Number(l.cargo), 0)),
        abonos: money(poliza.reduce((s, l) => s + Number(l.abono), 0)),
      },
      obligacionesActivas: obligaciones,
    };
  }

  private async aplicarMovimientosNomina(em: EntityManager, periodoId: string, empresaId: string) {
    const movimientos = await em.find(MovimientoPrestamoNomina, {
      where: { periodoId, empresaId, estado: EstadoMovimientoNomina.CALCULADO },
    });
    for (const movimiento of movimientos) {
      const prestamo = await em.findOne(PrestamoEmpleado, {
        where: { id: movimiento.prestamoId, empresaId },
      });
      if (!prestamo) throw new ConflictException('Un préstamo calculado ya no existe.');
      if (Math.abs(Number(prestamo.saldo) - Number(movimiento.saldoAntes)) > 0.01) {
        throw new ConflictException(`El saldo del préstamo ${prestamo.id} cambió después del cálculo.`);
      }
      prestamo.saldo = money(movimiento.saldoDespues);
      if (prestamo.saldo <= 0.01) prestamo.estado = EstadoPrestamo.LIQUIDADO;
      movimiento.estado = EstadoMovimientoNomina.APLICADO;
      movimiento.fechaAplicacion = new Date();
      await em.save([prestamo, movimiento]);
    }
    const obligaciones = await em.find(AplicacionObligacionNomina, {
      where: { periodoId, empresaId, estado: EstadoMovimientoNomina.CALCULADO },
    });
    for (const aplicacion of obligaciones) {
      const obligacion = await em.findOne(ObligacionEmpleado, {
        where: { id: aplicacion.obligacionId, empresaId },
      });
      if (!obligacion) throw new ConflictException('Una obligación calculada ya no existe.');
      if (Number(obligacion.saldo) > 0) {
        if (Math.abs(Number(obligacion.saldo) - Number(aplicacion.saldoAntes)) > 0.01) {
          throw new ConflictException(`El saldo de la obligación ${obligacion.id} cambió después del cálculo.`);
        }
        obligacion.saldo = money(aplicacion.saldoDespues);
        if (obligacion.saldo <= 0.01) obligacion.activo = false;
        await em.save(obligacion);
      }
      aplicacion.estado = EstadoMovimientoNomina.APLICADO;
      aplicacion.fechaAplicacion = new Date();
      await em.save(aplicacion);
    }
  }

  private validarAplicacionPago(aplicacion: AplicacionPagoDto) {
    if (['TRANSFERENCIA', 'CHEQUE'].includes(aplicacion.metodo) && !aplicacion.referencia?.trim()) {
      throw new BadRequestException(`${aplicacion.metodo} requiere una referencia.`);
    }
    if (aplicacion.moneda !== 'MXN' && Number(aplicacion.tipoCambio) <= 0) {
      throw new BadRequestException('El tipo de cambio debe ser mayor que cero.');
    }
  }

  private cuentaPasivoDeduccion(partida: PartidaRecibo, config: ConfiguracionPatronal) {
    const clave = partida.clave.toUpperCase();
    const origen = String(partida.origenTipo ?? '').toUpperCase();
    if (clave.includes('ISR')) return config.cuentaIsrRetenidoId;
    if (clave.includes('IMSS')) return config.cuentaImssObreroId;
    if (clave.includes('INFONAVIT')) return config.cuentaInfonavitId;
    if (clave.includes('FONACOT')) return config.cuentaFonacotId;
    if (clave.includes('PENSION') || origen === 'PENSION') return config.cuentaPensionId;
    if (clave.includes('EMBARGO') || origen === 'EMBARGO') return config.cuentaEmbargosId;
    if (clave.includes('PRESTAMO') || origen === 'PRESTAMO') return config.cuentaPrestamosEmpleadoId;
    if (partida.naturaleza === NaturalezaConcepto.DEDUCCION) return partida.cuentaContableId ?? config.cuentaOtrasDeduccionesId;
    return partida.cuentaContableId;
  }

  private async obtenerPeriodo(id: string, empresaId: string) {
    const periodo = await this.periodos.findOne({ where: { id, empresaId } });
    if (!periodo) throw new NotFoundException('Periodo no encontrado.');
    return periodo;
  }

  private async resolverEmpleado(referencia: string, empresaId: string): Promise<Empleado> {
    const valor = String(referencia ?? '').trim();
    if (!valor) throw new BadRequestException('Selecciona un empleado válido.');
    let empleado: Empleado | null;
    if (SQL_SERVER_GUID_REGEX.test(valor)) {
      empleado = await this.empleados.findOne({ where: { id: valor, empresaId } });
    } else {
      if (valor.length > 20) {
        throw new BadRequestException('La referencia no es un GUID válido ni un número de empleado de máximo 20 caracteres.');
      }
      empleado = await this.empleados.findOne({ where: { numeroEmpleado: valor, empresaId } });
    }
    if (!empleado) throw new BadRequestException('El empleado no existe o no pertenece a la empresa.');
    return empleado;
  }


  private exigirRol(rol: string, permitidos: string[], accion: string) {
    const normal = normalizeRole(rol);
    if (!permitidos.map(normalizeRole).includes(normal)) {
      throw new ForbiddenException(`Tu rol no tiene permiso para ${accion}.`);
    }
  }

  private validarRolAprobacion(requerido: string, rolUsuario: string) {
    const mapa: Record<string, string[]> = {
      RRHH: ['admin', 'rrhh', 'recursoshumanos'],
      FINANZAS: ['admin', 'finanzas', 'contador'],
      TESORERIA: ['admin', 'tesoreria'],
    };
    this.exigirRol(rolUsuario, mapa[requerido] ?? [requerido], `aprobar como ${requerido}`);
  }

  private pacHabilitado(config: ConfiguracionPatronal): boolean {
    return (
      process.env.NOMINA_PAC_ADAPTER_ENABLED === 'true' &&
      config.estadoPac === 'ACTIVO' &&
      Boolean(config.proveedorPac)
    );
  }

  private obtenerClabeCuenta(cuenta: CuentaBancariaEmpleado): string {
    if (cuenta.clabeCifrada) return descifrarDatoNomina(cuenta.clabeCifrada);
    if (cuenta.clabe && /^\d{18}$/.test(cuenta.clabe)) return cuenta.clabe;
    throw new ConflictException('La cuenta bancaria no contiene una CLABE recuperable.');
  }

  private validarWebhookPac(secretRecibido?: string) {
    const esperado = process.env.NOMINA_PAC_WEBHOOK_SECRET;
    if (!esperado || !secretRecibido) throw new ForbiddenException('Webhook PAC no configurado.');
    const a = Buffer.from(esperado);
    const b = Buffer.from(secretRecibido);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Firma del webhook PAC inválida.');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private sanitizarDispersion(d: DispersionNomina) {
    const { contenidoArchivo, evidenciaConciliacionJson, ...rest } = d;
    return rest;
  }

  private sanitizarDetalleDispersion(d: DispersionNominaDetalle) {
    return { ...d, cuentaDestino: `**************${d.cuentaDestino.slice(-4)}` };
  }

  private async registrarEvento(
    em: EntityManager,
    empresaId: string,
    periodoId: string,
    tipo: string,
    estadoAnterior: string | undefined,
    estadoNuevo: string | undefined,
    usuarioId: string | undefined,
    detalle?: unknown,
  ) {
    await em.save(
      EventoNomina,
      em.create(EventoNomina, {
        empresaId,
        periodoId,
        tipo,
        estadoAnterior,
        estadoNuevo,
        usuarioId,
        detalleJson: detalle ? JSON.stringify(detalle) : undefined,
      }),
    );
  }
}
