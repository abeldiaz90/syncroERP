/**
 * ============================================================================
 * SyncroERP · Recursos humanos — servicio
 * ----------------------------------------------------------------------------
 * Decisiones deliberadas:
 *
 * · Las tarifas de ISR y las cuotas del IMSS NO están escritas en el código.
 *   Cambian cada año por publicación en el DOF; si van fijas, el módulo nace
 *   caducado. Viven en `data/tarifas-fiscales.ts` con el ejercicio como llave,
 *   y el cálculo falla con un mensaje claro si no hay tarifa cargada para el
 *   año en curso, en lugar de calcular mal en silencio.
 *
 * · Todo en centavos enteros. Una nómina de 200 empleados con redondeo por
 *   flotante acumula pesos de diferencia contra el pago real del banco.
 *
 * · El cálculo del periodo es idempotente y transaccional: recalcular borra
 *   los recibos previos del periodo y los rehace. Nunca quedan duplicados ni
 *   un periodo a medio calcular.
 *
 * · Un periodo CERRADO no se puede recalcular. Es el punto sin retorno.
 * ============================================================================
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  sinDatosDeNomina,
  verDatosDeNomina,
} from '../utils/datos-de-nomina.util';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';

import {
  Asistencia,
  ConceptoNomina,
  Empleado,
  EstadoEmpleado,
  EstadoPeriodo,
  Incidencia,
  NaturalezaConcepto,
  PartidaRecibo,
  PeriodoNomina,
  Puesto,
  ReciboNomina,
  RegimenPago,
  TipoIncidencia,
  ContratoLaboral,
  MovimientoLaboral,
  ParametroNomina,
  SolicitudVacaciones,
  SaldoVacaciones,
  DiaCalendarioLaboral,
  EstadoSolicitud,
  TipoSalario,
  TipoContrato,
} from '../entities/rrhh.entity';
import {
  ActualizarConceptoNominaDto,
  ActualizarEmpleadoDto,
  ActualizarPuestoDto,
  CrearConceptoNominaDto,
  CrearContratoLaboralDto,
  CrearEmpleadoDto,
  CrearIncidenciaDto,
  CrearParametroNominaDto,
  CrearPuestoDto,
  SolicitarVacacionesDto,
} from '../dto/rrhh.dto';
import { NominaCalculoService } from './nomina-calculo.service';
import { SQL_SERVER_GUID_REGEX } from '../../common/validators/sql-server-guid.validator';
import { obtenerTarifas } from '../data/tarifas-fiscales';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import { AprobacionDocumento } from '../../compras/entities/aprobacion-documento.entity';

const aCent = (v: number | string) => Math.round(Number(v ?? 0) * 100);
const aPesos = (c: number) => Math.round(c) / 100;
const money = (v: number | string | null | undefined) =>
  Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

/** Días naturales que cubre cada régimen de pago. */
const DIAS_POR_REGIMEN: Record<RegimenPago, number> = {
  [RegimenPago.SEMANAL]: 7,
  [RegimenPago.CATORCENAL]: 14,
  [RegimenPago.QUINCENAL]: 15,
  [RegimenPago.MENSUAL]: 30,
};

export interface ResultadoCalculo {
  periodoId: string;
  empleadosCalculados: number;
  totalPercepciones: number;
  totalDeducciones: number;
  totalNeto: number;
  advertencias: string[];
}

@Injectable()
export class RrhhService {
  private readonly logger = new Logger(RrhhService.name);

  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Puesto) private readonly puestos: Repository<Puesto>,
    @InjectRepository(Asistencia)
    private readonly asistencias: Repository<Asistencia>,
    @InjectRepository(Incidencia)
    private readonly incidencias: Repository<Incidencia>,
    @InjectRepository(ConceptoNomina)
    private readonly conceptos: Repository<ConceptoNomina>,
    @InjectRepository(PeriodoNomina)
    private readonly periodos: Repository<PeriodoNomina>,
    @InjectRepository(ReciboNomina)
    private readonly recibos: Repository<ReciboNomina>,
    @InjectRepository(ContratoLaboral)
    private readonly contratos: Repository<ContratoLaboral>,
    @InjectRepository(MovimientoLaboral)
    private readonly movimientosLaborales: Repository<MovimientoLaboral>,
    @InjectRepository(ParametroNomina)
    private readonly parametrosNomina: Repository<ParametroNomina>,
    @InjectRepository(SolicitudVacaciones)
    private readonly solicitudesVacaciones: Repository<SolicitudVacaciones>,
    @InjectRepository(SaldoVacaciones)
    private readonly saldosVacaciones: Repository<SaldoVacaciones>,
    @InjectRepository(DiaCalendarioLaboral)
    private readonly calendarioLaboral: Repository<DiaCalendarioLaboral>,
    @InjectRepository(ConfiguracionAprobacion)
    private readonly configuracionesAprobacion: Repository<ConfiguracionAprobacion>,
    @InjectRepository(AprobacionDocumento)
    private readonly aprobacionesDocumento: Repository<AprobacionDocumento>,
    private readonly dataSource: DataSource,
    private readonly nominaCalculo: NominaCalculoService,
  ) {}

  /* ══ EMPLEADOS ═══════════════════════════════════════════════════════════ */

  async listarEmpleados(
    empresaId: string,
    filtros: {
      estado?: EstadoEmpleado;
      departamentoId?: string;
      busqueda?: string;
    } = {},
    rol?: string,
  ) {
    const q = this.empleados
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.puesto', 'p')
      .where('e.empresaId = :empresaId', { empresaId });

    if (filtros.estado)
      q.andWhere('e.estado = :estado', { estado: filtros.estado });
    if (filtros.departamentoId)
      q.andWhere('e.departamentoId = :d', { d: filtros.departamentoId });
    if (filtros.busqueda) {
      q.andWhere(
        '(e.nombres LIKE :b OR e.apellidoPaterno LIKE :b OR e.numeroEmpleado LIKE :b OR e.rfc LIKE :b)',
        { b: `%${filtros.busqueda}%` },
      );
    }

    const lista = await q.orderBy('e.numeroEmpleado', 'ASC').getMany();
    /*
     * El rol decide si el sueldo sale. Antes no llegaba hasta aqui, asi que el
     * recorte solo se aplicaba al abrir UNA ficha y no al listar las cien:
     * `gerencia` leia `salarioDiario` de la plantilla entera de un tiron.
     */
    const conNomina = verDatosDeNomina(rol);
    return lista.map((e) => {
      const fila = this.empleadoParaListado(e);
      return conNomina ? fila : sinDatosDeNomina(fila);
    });
  }

  private empleadoParaListado(e: Empleado) {
    return {
      ...e,
      nombreCompleto: this.nombreCompleto(e),
      curp: this.enmascarar(e.curp, 4),
      rfc: this.enmascarar(e.rfc, 4),
      nss: this.enmascarar(e.nss, 4),
      clabe: e.clabe ? `**************${String(e.clabe).slice(-4)}` : undefined,
      direccion: undefined,
      contactoEmergencia: undefined,
      telefonoEmergencia: undefined,
      notas: undefined,
    };
  }

  private enmascarar(valor: string | undefined, visibles = 4): string | undefined {
    if (!valor) return undefined;
    const texto = String(valor);
    if (texto.length <= visibles) return '*'.repeat(texto.length);
    return `${'*'.repeat(texto.length - visibles)}${texto.slice(-visibles)}`;
  }

  private async siguienteNumeroEmpleado(empresaId: string): Promise<string> {
    const ultimo = await this.empleados
      .createQueryBuilder('e')
      .select("MAX(CASE WHEN e.numeroEmpleado ~ '^[0-9]+$' THEN CAST(e.numeroEmpleado AS integer) END)", 'maximo')
      .where('e.empresaId = :empresaId', { empresaId })
      .getRawOne<{ maximo: number | null }>();
    return String(Number(ultimo?.maximo ?? 0) + 1).padStart(5, '0');
  }

  private nombreCompleto(e: Empleado): string {
    return [e.nombres, e.apellidoPaterno, e.apellidoMaterno]
      .filter(Boolean)
      .join(' ');
  }

  private async resolverEmpleado(
    referencia: string,
    empresaId: string,
  ): Promise<Empleado> {
    const valor = String(referencia ?? '').trim();
    if (!valor) throw new BadRequestException('Selecciona un empleado válido.');
    let empleado: Empleado | null;
    if (SQL_SERVER_GUID_REGEX.test(valor)) {
      empleado = await this.empleados.findOne({ where: { id: valor, empresaId } });
    } else {
      if (valor.length > 20) {
        throw new BadRequestException(
          'La referencia no es un GUID válido ni un número de empleado de máximo 20 caracteres.',
        );
      }
      empleado = await this.empleados.findOne({
        where: { numeroEmpleado: valor, empresaId },
      });
    }
    if (!empleado) {
      throw new NotFoundException(
        'El empleado no existe o no pertenece a la empresa.',
      );
    }
    return empleado;
  }

  async obtenerEmpleado(id: string, empresaId: string, rol?: string) {
    const e = await this.empleados.findOne({
      where: { id, empresaId },
      relations: ['puesto'],
    });
    if (!e) throw new NotFoundException('El empleado no existe.');

    const antiguedadDias = Math.floor(
      (Date.now() - new Date(e.fechaIngreso).getTime()) / 86_400_000,
    );

    const completo = {
      ...e,
      nombreCompleto: this.nombreCompleto(e),
      antiguedadAnios: Math.floor(antiguedadDias / 365),
      diasVacaciones: this.diasVacacionesPorLey(
        Math.floor(antiguedadDias / 365),
      ),
    } as Record<string, unknown>;
    /*
     * Una sola definicion de quien ve sueldos, en `datos-de-nomina.util`. Aqui
     * habia una normalizacion propia —en minusculas, mientras `normalizarRol`
     * devuelve mayusculas— y su propia lista de roles. Dos definiciones del
     * mismo rol es como se abren estos huecos, y ya paso una vez con la traza
     * de aprobaciones.
     */
    if (verDatosDeNomina(rol)) {
      return completo;
    }
    completo.curp = this.enmascarar(String(e.curp ?? ''), 4);
    completo.rfc = this.enmascarar(String(e.rfc ?? ''), 4);
    completo.nss = this.enmascarar(String(e.nss ?? ''), 4);
    completo.clabe = e.clabe
      ? `**************${String(e.clabe).slice(-4)}`
      : undefined;
    delete completo.direccion;
    delete completo.contactoEmergencia;
    delete completo.telefonoEmergencia;
    delete completo.notas;
    // Lo que faltaba: el sueldo. Se enmascaraba CURP, RFC, NSS y CLABE, y el
    // dato que mas gente pregunta salia intacto.
    return sinDatosDeNomina(completo);
  }

  /**
   * Vacaciones según la reforma de 2023 a la LFT (art. 76): 12 días el primer
   * año, +2 por año hasta el quinto; después +2 cada cinco años.
   */
  private diasVacacionesPorLey(anios: number): number {
    if (anios < 1) return 0;
    if (anios <= 5) return 12 + (anios - 1) * 2;
    return 22 + Math.floor((anios - 6) / 5) * 2;
  }

  async crearEmpleado(dto: CrearEmpleadoDto, empresaId: string) {
    if (Number(dto.salarioDiario) <= 0) {
      throw new BadRequestException('El salario diario debe ser mayor que cero.');
    }
    if (dto.curp) {
      const duplicado = await this.empleados.findOne({
        where: { empresaId, curp: dto.curp },
      });
      if (duplicado) {
        throw new ConflictException(
          `La CURP ya está registrada para el empleado ${duplicado.numeroEmpleado}.`,
        );
      }
    }
    if (dto.rfc) {
      const duplicadoRfc = await this.empleados.findOne({
        where: { empresaId, rfc: dto.rfc },
      });
      if (duplicadoRfc) {
        throw new ConflictException(
          `El RFC ya está registrado para el empleado ${duplicadoRfc.numeroEmpleado}.`,
        );
      }
    }

    if (dto.puestoId) {
      const puesto = await this.puestos.findOne({
        where: { id: dto.puestoId, empresaId, activo: true },
      });
      if (!puesto) {
        throw new BadRequestException(
          'El puesto seleccionado no existe o está inactivo.',
        );
      }
      if (puesto.departamentoId && dto.departamentoId !== puesto.departamentoId) {
        throw new BadRequestException('El puesto no pertenece al departamento seleccionado.');
      }
      if (Number(puesto.salarioMinimo) <= 0 || Number(puesto.salarioMaximo) < Number(puesto.salarioMinimo)) {
        throw new BadRequestException('El puesto debe tener un tabulador salarial válido antes de asignar empleados.');
      }
      if (Number(puesto.plazasAutorizadas) < 1) {
        throw new BadRequestException('El puesto debe tener al menos una plaza autorizada.');
      }
      const ocupadas = await this.empleados.createQueryBuilder('empleado')
        .where('empleado.empresaId = :empresaId', { empresaId })
        .andWhere('empleado.puestoId = :puestoId', { puestoId: puesto.id })
        .andWhere('empleado.estado <> :baja', { baja: EstadoEmpleado.BAJA })
        .getCount();
      if (ocupadas >= Number(puesto.plazasAutorizadas)) {
        throw new BadRequestException(`El puesto ya tiene ocupadas sus ${puesto.plazasAutorizadas} plazas autorizadas.`);
      }
      if (
        Number(puesto.salarioMinimo) > 0 &&
        Number(dto.salarioDiario) < Number(puesto.salarioMinimo)
      ) {
        throw new BadRequestException(
          `El salario diario está por debajo del mínimo del puesto (${puesto.salarioMinimo}).`,
        );
      }
      if (
        Number(puesto.salarioMaximo) > 0 &&
        Number(dto.salarioDiario) > Number(puesto.salarioMaximo)
      ) {
        throw new BadRequestException(
          `El salario diario supera el máximo del puesto (${puesto.salarioMaximo}).`,
        );
      }
    }

    const salarioDiario = Number(dto.salarioDiario);
    const tipoSalario = dto.tipoSalario ?? TipoSalario.FIJO;
    let salarioDiarioIntegrado = Number(dto.salarioDiarioIntegrado ?? 0);
    let sbcValidado = Boolean(dto.sbcValidado);
    if ([TipoSalario.VARIABLE, TipoSalario.MIXTO].includes(tipoSalario)) {
      if (salarioDiarioIntegrado <= 0 || !sbcValidado || !dto.fechaSbc) {
        throw new BadRequestException(
          `El salario ${tipoSalario} requiere SBC, fecha de SBC y validación.`,
        );
      }
    } else if (salarioDiarioIntegrado <= 0) {
      const factor =
        1 +
        Number(dto.diasAguinaldo ?? 15) / 365 +
        (12 * (Number(dto.primaVacacional ?? 25) / 100)) / 365;
      salarioDiarioIntegrado = aPesos(
        Math.round(aCent(salarioDiario) * factor),
      );
      sbcValidado = false;
    }

    const datosEmpleado = {
      ...dto,
      empresaId,
      numeroEmpleado:
        dto.numeroEmpleado ?? (await this.siguienteNumeroEmpleado(empresaId)),
      fechaIngreso: this.fechaSql(dto.fechaIngreso),
      fechaNacimiento: dto.fechaNacimiento
        ? this.fechaSql(dto.fechaNacimiento)
        : undefined,
      fechaSbc: dto.fechaSbc ? this.fechaSql(dto.fechaSbc) : undefined,
      salarioDiarioIntegrado,
      sbcValidado,
      tipoSalario,
      estado: dto.estado ?? EstadoEmpleado.ACTIVO,
    };

    // El asistente deja empleado, contrato inicial y movimiento de ingreso
    // consistentes. Si una escritura falla, no queda un expediente a medias.
    return this.dataSource.transaction(async (manager) => {
      const empleados = manager.getRepository(Empleado);
      const contratos = manager.getRepository(ContratoLaboral);
      const movimientos = manager.getRepository(MovimientoLaboral);
      const empleado = await empleados.save(empleados.create(datosEmpleado));
      await contratos.save(contratos.create({
        empresaId,
        empleadoId: empleado.id,
        tipoContrato: empleado.tipoContrato,
        fechaInicio: empleado.fechaIngreso,
        salarioDiario: empleado.salarioDiario,
        salarioDiarioIntegrado: empleado.salarioDiarioIntegrado,
        puestoId: empleado.puestoId,
        departamentoId: empleado.departamentoId,
        observaciones: 'Contrato inicial generado desde el asistente de alta.',
        vigente: true,
      }));
      await movimientos.save(movimientos.create({
        empresaId,
        empleadoId: empleado.id,
        tipo: 'ALTA',
        fechaEfectiva: empleado.fechaIngreso,
        valoresNuevosJson: JSON.stringify({
          puestoId: empleado.puestoId,
          departamentoId: empleado.departamentoId,
          tipoContrato: empleado.tipoContrato,
          salarioDiario: empleado.salarioDiario,
          salarioDiarioIntegrado: empleado.salarioDiarioIntegrado,
        }),
        motivo: 'Alta inicial del empleado',
      }));
      return empleado;
    });
  }

  async actualizarEmpleado(
    id: string,
    dto: ActualizarEmpleadoDto,
    empresaId: string,
  ) {
    const e = await this.empleados.findOne({ where: { id, empresaId } });
    if (!e) throw new NotFoundException('El empleado no existe.');
    const anterior = {
      puestoId: e.puestoId,
      departamentoId: e.departamentoId,
      tipoContrato: e.tipoContrato,
      salarioDiario: Number(e.salarioDiario),
      salarioDiarioIntegrado: Number(e.salarioDiarioIntegrado),
    };

    if (dto.puestoId) {
      const puesto = await this.puestos.findOne({
        where: { id: dto.puestoId, empresaId, activo: true },
      });
      if (!puesto) {
        throw new BadRequestException(
          'El puesto seleccionado no existe o está inactivo.',
        );
      }
      const departamentoPropuesto = dto.departamentoId ?? e.departamentoId;
      if (puesto.departamentoId && departamentoPropuesto !== puesto.departamentoId) {
        throw new BadRequestException('El puesto no pertenece al departamento seleccionado.');
      }
      if (Number(puesto.salarioMinimo) <= 0 || Number(puesto.salarioMaximo) < Number(puesto.salarioMinimo)) {
        throw new BadRequestException('El puesto debe tener un tabulador salarial válido antes de asignar empleados.');
      }
      if (Number(puesto.plazasAutorizadas) < 1) {
        throw new BadRequestException('El puesto debe tener al menos una plaza autorizada.');
      }
      if (dto.puestoId !== e.puestoId) {
        const ocupadas = await this.empleados.createQueryBuilder('empleado')
          .where('empleado.empresaId = :empresaId', { empresaId })
          .andWhere('empleado.puestoId = :puestoId', { puestoId: puesto.id })
          .andWhere('empleado.estado <> :baja', { baja: EstadoEmpleado.BAJA })
          .getCount();
        if (ocupadas >= Number(puesto.plazasAutorizadas)) {
          throw new BadRequestException(`El puesto ya tiene ocupadas sus ${puesto.plazasAutorizadas} plazas autorizadas.`);
        }
      }
      const salarioPropuesto = Number(dto.salarioDiario ?? e.salarioDiario);
      if (Number(puesto.salarioMinimo) > 0 && salarioPropuesto < Number(puesto.salarioMinimo)) {
        throw new BadRequestException(`El salario diario está por debajo del mínimo del puesto (${puesto.salarioMinimo}).`);
      }
      if (Number(puesto.salarioMaximo) > 0 && salarioPropuesto > Number(puesto.salarioMaximo)) {
        throw new BadRequestException(`El salario diario supera el máximo del puesto (${puesto.salarioMaximo}).`);
      }
    }

    if (dto.curp && dto.curp !== e.curp) {
      const duplicado = await this.empleados.findOne({
        where: { empresaId, curp: dto.curp },
      });
      if (duplicado && duplicado.id !== id) {
        throw new ConflictException(
          'La CURP ya está asignada a otro empleado.',
        );
      }
    }

    if (dto.salarioDiario !== undefined && Number(dto.salarioDiario) <= 0) {
      throw new BadRequestException(
        'El salario diario debe ser mayor que cero.',
      );
    }

    // Los DTO reciben fechas ISO como texto; la entidad persiste objetos Date.
    // Se construye un objeto explícito para conservar el tipado y evitar
    // desfases por zona horaria en columnas SQL Server de tipo date.
    const cambios: Partial<Empleado> = { ...dto } as Omit<
      Partial<Empleado>,
      'fechaNacimiento' | 'fechaIngreso' | 'fechaSbc'
    >;

    if (dto.fechaNacimiento !== undefined) {
      cambios.fechaNacimiento = this.fechaSql(dto.fechaNacimiento);
    }
    if (dto.fechaIngreso !== undefined) {
      cambios.fechaIngreso = this.fechaSql(dto.fechaIngreso);
    }
    if (dto.fechaSbc !== undefined) {
      cambios.fechaSbc = this.fechaSql(dto.fechaSbc);
    }

    Object.assign(e, cambios);
    const cambioLaboral =
      anterior.puestoId !== e.puestoId ||
      anterior.departamentoId !== e.departamentoId ||
      anterior.tipoContrato !== e.tipoContrato ||
      anterior.salarioDiario !== Number(e.salarioDiario) ||
      anterior.salarioDiarioIntegrado !== Number(e.salarioDiarioIntegrado);

    return this.dataSource.transaction(async (manager) => {
      const actualizado = await manager.getRepository(Empleado).save(e);
      if (!cambioLaboral) return actualizado;

      const fechaEfectiva = dto.fechaSbc
        ? this.fechaSql(dto.fechaSbc)
        : this.fechaSql(new Date());
      const contratos = manager.getRepository(ContratoLaboral);
      await contratos.update({ empresaId, empleadoId: id, vigente: true }, { vigente: false });
      await contratos.save(contratos.create({
        empresaId,
        empleadoId: id,
        tipoContrato: actualizado.tipoContrato,
        fechaInicio: fechaEfectiva,
        salarioDiario: actualizado.salarioDiario,
        salarioDiarioIntegrado: actualizado.salarioDiarioIntegrado,
        puestoId: actualizado.puestoId,
        departamentoId: actualizado.departamentoId,
        observaciones: 'Actualización laboral registrada desde el expediente.',
        vigente: true,
      }));
      await manager.getRepository(MovimientoLaboral).save({
        empresaId,
        empleadoId: id,
        tipo: 'CAMBIO_LABORAL',
        fechaEfectiva,
        valoresAnterioresJson: JSON.stringify(anterior),
        valoresNuevosJson: JSON.stringify({
          puestoId: actualizado.puestoId,
          departamentoId: actualizado.departamentoId,
          tipoContrato: actualizado.tipoContrato,
          salarioDiario: actualizado.salarioDiario,
          salarioDiarioIntegrado: actualizado.salarioDiarioIntegrado,
        }),
        motivo: 'Actualización de expediente laboral',
      });
      return actualizado;
    });
  }

  private fechaSql(valor: string | Date): Date {
    if (valor instanceof Date) {
      if (Number.isNaN(valor.getTime())) {
        throw new BadRequestException('La fecha no es válida.');
      }
      return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    }
    const texto = String(valor ?? '').trim();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto)
      ? new Date(`${texto}T00:00:00`)
      : new Date(texto);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`La fecha ${texto} no es válida.`);
    }
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }

  private validarFechaBaja(empleado: Empleado, fecha: Date, permitirFutura = false) {
    const ingreso = this.fechaSql(empleado.fechaIngreso);
    if (fecha < ingreso) {
      throw new BadRequestException(
        'La fecha de baja no puede ser anterior a la fecha de ingreso.',
      );
    }
    const hoy = this.fechaSql(new Date());
    if (!permitirFutura && fecha > hoy) {
      throw new BadRequestException(
        'No se puede ejecutar una baja con fecha futura. Usa la estimación y confirma la baja en la fecha efectiva.',
      );
    }
  }

  async estimarFiniquito(id: string, fechaValor: string, empresaId: string) {
    const empleado = await this.empleados.findOne({ where: { id, empresaId } });
    if (!empleado) throw new NotFoundException('El empleado no existe.');
    const fechaBaja = this.fechaSql(fechaValor);
    this.validarFechaBaja(empleado, fechaBaja, true);
    const simulacion = Object.assign(Object.create(Object.getPrototypeOf(empleado)), empleado, {
      fechaBaja,
    }) as Empleado;
    return {
      empleado: {
        id: empleado.id,
        numeroEmpleado: empleado.numeroEmpleado,
        nombreCompleto: this.nombreCompleto(empleado),
        fechaIngreso: empleado.fechaIngreso,
        salarioDiario: empleado.salarioDiario,
      },
      fechaBaja,
      finiquito: this.calcularFiniquito(simulacion),
    };
  }

  async darDeBajaEmpleado(
    id: string,
    datos: { fecha: string; motivo: string },
    empresaId: string,
    usuarioId?: string,
  ) {
    const motivo = String(datos.motivo ?? '').trim();
    if (motivo.length < 5) {
      throw new BadRequestException('Captura un motivo de baja de al menos 5 caracteres.');
    }
    const fechaBaja = this.fechaSql(datos.fecha);

    return this.dataSource.transaction(async (manager) => {
      const empleados = manager.getRepository(Empleado);
      const empleado = await empleados
        .createQueryBuilder('empleado')
        .setLock('pessimistic_write')
        .where('empleado.id = :id AND empleado.empresaId = :empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!empleado) throw new NotFoundException('El empleado no existe.');
      if (empleado.estado === EstadoEmpleado.BAJA) {
        throw new ConflictException('El empleado ya está dado de baja.');
      }
      this.validarFechaBaja(empleado, fechaBaja);

      const valoresAnteriores = {
        estado: empleado.estado,
        fechaBaja: empleado.fechaBaja,
        motivoBaja: empleado.motivoBaja,
      };

      empleado.estado = EstadoEmpleado.BAJA;
      empleado.fechaBaja = fechaBaja;
      empleado.motivoBaja = motivo;
      const actualizado = await empleados.save(empleado);

      const contratos = manager.getRepository(ContratoLaboral);
      const contratosVigentes = await contratos.find({
        where: { empresaId, empleadoId: empleado.id, vigente: true },
      });
      for (const contrato of contratosVigentes) {
        contrato.vigente = false;
        if (!contrato.fechaFin || contrato.fechaFin > fechaBaja) {
          contrato.fechaFin = fechaBaja;
        }
      }
      if (contratosVigentes.length) await contratos.save(contratosVigentes);

      await manager.getRepository(MovimientoLaboral).save({
        empresaId,
        empleadoId: empleado.id,
        tipo: 'BAJA',
        fechaEfectiva: fechaBaja,
        valoresAnterioresJson: JSON.stringify(valoresAnteriores),
        valoresNuevosJson: JSON.stringify({
          estado: EstadoEmpleado.BAJA,
          fechaBaja,
          motivoBaja: motivo,
          contratosCerrados: contratosVigentes.map((contrato) => contrato.id),
        }),
        motivo,
        usuarioId,
      });

      return { empleado: actualizado, finiquito: this.calcularFiniquito(actualizado) };
    });
  }

  /**
   * Finiquito: partes proporcionales de aguinaldo, vacaciones y prima
   * vacacional. No incluye indemnización, que depende de la causa de la baja
   * y debe determinarla el área legal.
   */
  private calcularFiniquito(e: Empleado) {
    const ingreso = new Date(e.fechaIngreso);
    const baja = e.fechaBaja ? new Date(e.fechaBaja) : new Date();
    const salarioCent = aCent(e.salarioDiario);

    const inicioAnio = new Date(baja.getFullYear(), 0, 1);
    const desde = ingreso > inicioAnio ? ingreso : inicioAnio;
    const diasTrabajadosAnio = Math.max(
      0,
      Math.floor((baja.getTime() - desde.getTime()) / 86_400_000),
    );

    const aniosCumplidos = Math.floor(
      (baja.getTime() - ingreso.getTime()) / (365 * 86_400_000),
    );

    const aguinaldoCent = Math.round(
      (salarioCent * e.diasAguinaldo * diasTrabajadosAnio) / 365,
    );
    const diasVac = this.diasVacacionesPorLey(aniosCumplidos || 1);
    const vacacionesCent = Math.round(
      (salarioCent * diasVac * diasTrabajadosAnio) / 365,
    );
    const primaCent = Math.round(
      (vacacionesCent * Number(e.primaVacacional)) / 100,
    );

    return {
      diasTrabajadosEnElAnio: diasTrabajadosAnio,
      aguinaldoProporcional: aPesos(aguinaldoCent),
      vacacionesProporcionales: aPesos(vacacionesCent),
      primaVacacional: aPesos(primaCent),
      total: aPesos(aguinaldoCent + vacacionesCent + primaCent),
      nota: 'No incluye indemnización ni prima de antigüedad; dependen de la causa de la baja.',
    };
  }

  /* ══ PUESTOS ═════════════════════════════════════════════════════════════ */

  listarPuestos(empresaId: string) {
    return this.puestos.find({
      where: { empresaId },
      relations: ['departamento'],
      order: { clave: 'ASC' },
    });
  }

  async crearPuesto(dto: CrearPuestoDto, empresaId: string) {
    const clave = String(dto.clave ?? '').trim().toUpperCase();
    const nombre = String(dto.nombre ?? '').trim();
    if (!clave || !nombre) throw new BadRequestException('Clave y nombre del puesto son obligatorios.');
    if (!dto.departamentoId) throw new BadRequestException('Todo puesto debe pertenecer a un área.');
    const area = await this.dataSource.getRepository(Departamento).findOne({
      where: { id: dto.departamentoId, empresaId, activo: true },
    });
    if (!area) throw new BadRequestException('El área seleccionada no existe o está inactiva.');
    if (Number(dto.salarioMaximo ?? 0) > 0 && Number(dto.salarioMinimo ?? 0) > Number(dto.salarioMaximo)) {
      throw new BadRequestException('El salario mínimo no puede superar el máximo.');
    }
    const existe = await this.puestos.findOne({ where: { empresaId, clave } });
    if (existe) throw new ConflictException(`Ya existe un puesto con la clave ${clave}.`);
    return this.puestos.save(this.puestos.create({ ...dto, clave, nombre, empresaId, activo: dto.activo ?? true }));
  }

  async actualizarPuesto(id: string, dto: ActualizarPuestoDto, empresaId: string) {
    const puesto = await this.puestos.findOne({ where: { id, empresaId } });
    if (!puesto) throw new NotFoundException('El puesto no existe.');
    if (dto.clave) {
      const clave = String(dto.clave).trim().toUpperCase();
      const duplicado = await this.puestos.findOne({ where: { empresaId, clave } });
      if (duplicado && duplicado.id !== id) throw new ConflictException(`Ya existe un puesto con la clave ${clave}.`);
      dto.clave = clave;
    }
    if (dto.nombre !== undefined && !String(dto.nombre).trim()) throw new BadRequestException('El nombre del puesto es obligatorio.');
    if (dto.departamentoId !== undefined) {
      const area = await this.dataSource.getRepository(Departamento).findOne({
        where: { id: dto.departamentoId, empresaId, activo: true },
      });
      if (!area) throw new BadRequestException('El área seleccionada no existe o está inactiva.');
    }
    const minimo = Number(dto.salarioMinimo ?? puesto.salarioMinimo ?? 0);
    const maximo = Number(dto.salarioMaximo ?? puesto.salarioMaximo ?? 0);
    if (maximo > 0 && minimo > maximo) throw new BadRequestException('El salario mínimo no puede superar el máximo.');
    Object.assign(puesto, dto);
    return this.puestos.save(puesto);
  }

  /* ══ ASISTENCIA ══════════════════════════════════════════════════════════ */

  async registrarAsistencia(
    dto: {
      empleadoId: string;
      fecha: string;
      entrada?: string;
      salida?: string;
      observaciones?: string;
    },
    empresaId: string,
  ) {
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const fecha = this.fechaSql(dto.fecha);
    let registro = await this.asistencias.findOne({
      where: { empresaId, empleadoId: empleado.id, fecha },
    });

    if (!registro) {
      registro = this.asistencias.create({
        empresaId,
        empleadoId: empleado.id,
        fecha,
      });
    }

    if (dto.entrada) registro.entrada = new Date(dto.entrada);
    if (dto.salida) registro.salida = new Date(dto.salida);
    if (dto.observaciones) registro.observaciones = dto.observaciones;

    if (registro.entrada && registro.salida) {
      if (registro.salida <= registro.entrada) {
        throw new BadRequestException(
          'La hora de salida debe ser posterior a la de entrada.',
        );
      }
      const horas =
        (registro.salida.getTime() - registro.entrada.getTime()) / 3_600_000;
      registro.horasTrabajadas = Math.round(horas * 100) / 100;
      const jornada = Number(empleado.horasJornada) > 0
        ? Number(empleado.horasJornada)
        : empleado.jornada === 'NOCTURNA'
          ? 7
          : empleado.jornada === 'MIXTA'
            ? 7.5
            : 8;
      registro.horasExtra = Math.max(
        0,
        Math.round((horas - jornada) * 100) / 100,
      );
    }

    return this.asistencias.save(registro);
  }

  async listarAsistencias(
    empresaId: string,
    desde: string,
    hasta: string,
    referenciaEmpleado?: string,
  ) {
    const inicio = this.fechaSql(desde);
    const fin = this.fechaSql(hasta);
    if (fin < inicio) {
      throw new BadRequestException('La fecha hasta no puede ser anterior a desde.');
    }
    const empleadoId = referenciaEmpleado
      ? (await this.resolverEmpleado(referenciaEmpleado, empresaId)).id
      : undefined;
    return this.asistencias.find({
      where: {
        empresaId,
        fecha: Between(inicio, fin),
        ...(empleadoId ? { empleadoId } : {}),
      },
      order: { fecha: 'DESC' },
    });
  }

  /* ══ INCIDENCIAS ═════════════════════════════════════════════════════════ */

  async crearIncidencia(dto: CrearIncidenciaDto, empresaId: string) {
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const inicio = this.fechaSql(dto.fechaInicio);
    const fin = this.fechaSql(dto.fechaFin);
    if (fin < inicio) {
      throw new BadRequestException(
        'La fecha final no puede ser anterior a la inicial.',
      );
    }

    const dias =
      Math.floor((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;

    // Traslape con otra incidencia del mismo empleado: casi siempre es un
    // error de captura y descuadra la nómina.
    const traslape = await this.incidencias
      .createQueryBuilder('i')
      .where('i.empresaId = :empresaId AND i.empleadoId = :emp', {
        empresaId,
        emp: empleado.id,
      })
      .andWhere('i.fechaInicio <= :fin AND i.fechaFin >= :inicio', {
        inicio,
        fin,
      })
      .getCount();

    if (traslape > 0) {
      throw new ConflictException(
        'El empleado ya tiene una incidencia registrada en ese rango de fechas.',
      );
    }

    // Falta y permiso sin goce no se pagan; el resto sí.
    const noPagadas = [TipoIncidencia.FALTA, TipoIncidencia.PERMISO_SIN_GOCE];

    return this.incidencias.save(
      this.incidencias.create({
        ...dto,
        empresaId,
        empleadoId: empleado.id,
        fechaInicio: inicio,
        fechaFin: fin,
        dias: dto.dias || dias,
        pagada: dto.pagada ?? !noPagadas.includes(dto.tipo),
        aprobada: false,
        estadoAprobacion: 'CAPTURADA',
      }),
    );
  }

  async listarIncidencias(
    empresaId: string,
    desde?: string,
    hasta?: string,
    referenciaEmpleado?: string,
  ) {
    const q = this.incidencias
      .createQueryBuilder('i')
      .where('i.empresaId = :empresaId', { empresaId });

    if ((desde && !hasta) || (!desde && hasta)) {
      throw new BadRequestException('Debes indicar desde y hasta juntos.');
    }
    if (desde && hasta) {
      const inicio = this.fechaSql(desde);
      const fin = this.fechaSql(hasta);
      if (fin < inicio) {
        throw new BadRequestException('La fecha hasta no puede ser anterior a desde.');
      }
      q.andWhere('i.fechaInicio <= :hasta AND i.fechaFin >= :desde', {
        desde: inicio,
        hasta: fin,
      });
    }
    if (referenciaEmpleado) {
      const empleado = await this.resolverEmpleado(referenciaEmpleado, empresaId);
      q.andWhere('i.empleadoId = :emp', { emp: empleado.id });
    }

    return q.orderBy('i.fechaInicio', 'DESC').getMany();
  }

  async aprobarIncidencia(id: string, usuarioId: string, empresaId: string) {
    const i = await this.incidencias.findOne({ where: { id, empresaId } });
    if (!i) throw new NotFoundException('La incidencia no existe.');
    if (i.estadoAprobacion === 'APROBADA') return i;
    if (['RECHAZADA', 'CANCELADA', 'APLICADA'].includes(i.estadoAprobacion)) {
      throw new ConflictException(
        `La incidencia está en estado ${i.estadoAprobacion} y no puede aprobarse.`,
      );
    }
    i.aprobada = true;
    i.estadoAprobacion = 'APROBADA';
    i.aprobadaPorId = usuarioId;
    i.fechaAprobacion = new Date();
    i.rechazadaPorId = undefined;
    i.fechaRechazo = undefined;
    i.motivoRechazo = undefined;
    return this.incidencias.save(i);
  }

  async rechazarIncidencia(id: string, motivo: string, usuarioId: string, empresaId: string) {
    const i = await this.incidencias.findOne({ where: { id, empresaId } });
    if (!i) throw new NotFoundException('La incidencia no existe.');
    if (i.estadoAprobacion === 'APROBADA') {
      throw new ConflictException('Una incidencia aprobada debe cancelarse mediante reversión, no rechazarse.');
    }
    i.aprobada = false;
    i.estadoAprobacion = 'RECHAZADA';
    i.rechazadaPorId = usuarioId;
    i.fechaRechazo = new Date();
    i.motivoRechazo = motivo.trim();
    return this.incidencias.save(i);
  }

  /* ══ CONCEPTOS ═══════════════════════════════════════════════════════════ */

  listarConceptos(empresaId: string) {
    return this.conceptos.find({
      where: { empresaId },
      order: { naturaleza: 'ASC', clave: 'ASC' },
    });
  }

  /** Conceptos mínimos para operar. Se llama desde la configuración inicial. */
  async sembrarConceptos(empresaId: string) {
    const base: Array<Partial<ConceptoNomina>> = [
      {
        clave: 'P001',
        nombre: 'Sueldo',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '001',
        esFijo: true,
      },
      {
        clave: 'P002',
        nombre: 'Horas extra',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '019',
      },
      {
        clave: 'P003',
        nombre: 'Prima dominical',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '020',
      },
      {
        clave: 'P004',
        nombre: 'Aguinaldo',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '002',
      },
      {
        clave: 'P005',
        nombre: 'Prima vacacional',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '021',
      },
      {
        clave: 'P006',
        nombre: 'Bono de puntualidad',
        naturaleza: NaturalezaConcepto.PERCEPCION,
        claveSat: '010',
      },
      {
        clave: 'D001',
        nombre: 'ISR retenido',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '002',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D002',
        nombre: 'IMSS obrero',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '001',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D003',
        nombre: 'Faltas',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '006',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'D004',
        nombre: 'Préstamo',
        naturaleza: NaturalezaConcepto.DEDUCCION,
        claveSat: '004',
        gravaIsr: false,
        integraSbc: false,
      },
      {
        clave: 'O001',
        nombre: 'Subsidio para el empleo',
        naturaleza: NaturalezaConcepto.OTRO_PAGO,
        claveSat: '002',
        gravaIsr: false,
        integraSbc: false,
      },
    ];

    let creados = 0;
    for (const c of base) {
      const existe = await this.conceptos.findOne({
        where: { empresaId, clave: c.clave },
      });
      if (!existe) {
        await this.conceptos.save(this.conceptos.create({ ...c, empresaId }));
        creados++;
      }
    }
    return { creados };
  }

  /* ══ PERIODOS Y CÁLCULO DE NÓMINA ════════════════════════════════════════ */

  async crearPeriodo(
    dto: {
      ejercicio: number;
      numero: number;
      regimen: RegimenPago;
      fechaInicio: string;
      fechaFin: string;
      fechaPago: string;
    },
    empresaId: string,
  ) {
    const existe = await this.periodos.findOne({
      where: { empresaId, ejercicio: dto.ejercicio, numero: dto.numero },
    });
    if (existe) {
      throw new ConflictException(
        `El periodo ${dto.numero} del ejercicio ${dto.ejercicio} ya existe.`,
      );
    }

    const inicio = this.fechaSql(dto.fechaInicio);
    const fin = this.fechaSql(dto.fechaFin);
    const pago = this.fechaSql(dto.fechaPago);
    if (fin < inicio) {
      throw new BadRequestException(
        'La fecha final del periodo no puede ser anterior a la inicial.',
      );
    }
    if (pago < inicio) {
      throw new BadRequestException(
        'La fecha de pago no puede ser anterior al inicio del periodo.',
      );
    }
    if (inicio.getFullYear() !== dto.ejercicio && fin.getFullYear() !== dto.ejercicio) {
      throw new BadRequestException('El ejercicio no coincide con las fechas del periodo.');
    }
    const diasNaturales = Math.floor((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
    const rangoPermitido: Record<RegimenPago, [number, number]> = {
      [RegimenPago.SEMANAL]: [7, 7],
      [RegimenPago.CATORCENAL]: [14, 14],
      [RegimenPago.QUINCENAL]: [13, 16],
      [RegimenPago.MENSUAL]: [28, 31],
    };
    const [minDias, maxDias] = rangoPermitido[dto.regimen];
    if (diasNaturales < minDias || diasNaturales > maxDias) {
      throw new BadRequestException(
        `El régimen ${dto.regimen} requiere un rango de ${minDias} a ${maxDias} días; se recibieron ${diasNaturales}.`,
      );
    }
    const traslape = await this.periodos
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId AND p.regimen = :regimen', {
        empresaId,
        regimen: dto.regimen,
      })
      .andWhere("p.estado <> 'CANCELADO'")
      .andWhere('p.fechaInicio <= :fin AND p.fechaFin >= :inicio', { inicio, fin })
      .getCount();
    if (traslape) {
      throw new ConflictException(
        'Ya existe un periodo no cancelado del mismo régimen que se traslapa con esas fechas.',
      );
    }

    return this.periodos.save(
      this.periodos.create({
        ...dto,
        empresaId,
        fechaInicio: inicio,
        fechaFin: fin,
        fechaPago: pago,
        diasPeriodo: diasNaturales,
        estado: EstadoPeriodo.ABIERTO,
      }),
    );
  }

  listarPeriodos(empresaId: string, ejercicio?: number) {
    return this.periodos.find({
      where: { empresaId, ...(ejercicio ? { ejercicio } : {}) },
      order: { ejercicio: 'DESC', numero: 'DESC' },
    });
  }

  /**
   * Calcula la nómina completa del periodo.
   * Recalcular es seguro: borra los recibos anteriores del periodo y los rehace
   * dentro de la misma transacción.
   */
  async calcularNomina(
    periodoId: string,
    empresaId: string,
    usuarioId?: string,
  ): Promise<ResultadoCalculo> {
    return this.nominaCalculo.calcular(periodoId, empresaId, usuarioId);
  }

  /* ══ RECIBOS ═════════════════════════════════════════════════════════════ */

  listarRecibos(empresaId: string, periodoId?: string, empleadoId?: string) {
    return this.recibos.find({
      where: {
        empresaId,
        ...(periodoId ? { periodoId } : {}),
        ...(empleadoId ? { empleadoId } : {}),
      },
      relations: ['partidas'],
      order: { nombreEmpleado: 'ASC' },
    });
  }

  async obtenerRecibo(id: string, empresaId: string) {
    const r = await this.recibos.findOne({
      where: { id, empresaId },
      relations: ['partidas', 'periodo'],
    });
    if (!r) throw new NotFoundException('El recibo no existe.');
    return r;
  }

  async cerrarPeriodo(periodoId: string, empresaId: string) {
    const periodo = await this.periodos.findOne({
      where: { id: periodoId, empresaId },
    });
    if (!periodo) throw new NotFoundException('El periodo no existe.');
    if (periodo.estado === EstadoPeriodo.CERRADO) return periodo;
    throw new ConflictException(
      'El cierre directo fue retirado por seguridad. Usa el cierre financiero de nómina, ' +
        'que valida aprobaciones, CFDI, pago, conciliación y pólizas antes de cerrar.',
    );
  }

  /* ══ RESUMEN ═════════════════════════════════════════════════════════════ */

  async resumen(empresaId: string) {
    const plantilla = await this.empleados.find({ where: { empresaId } });
    const activos = plantilla.filter((e) => e.estado !== EstadoEmpleado.BAJA);

    const nominaMensualCent = activos.reduce(
      (s, e) => s + aCent(e.salarioDiario) * 30,
      0,
    );

    const hoy = new Date();
    const treintaDias = new Date(hoy.getTime() - 30 * 86_400_000);

    return {
      totalEmpleados: activos.length,
      bajasHistoricas: plantilla.length - activos.length,
      nominaMensualEstimada: aPesos(nominaMensualCent),
      salarioPromedioDiario: activos.length
        ? aPesos(
            Math.round(
              activos.reduce((s, e) => s + aCent(e.salarioDiario), 0) /
                activos.length,
            ),
          )
        : 0,
      porEstado: Object.values(EstadoEmpleado).map((estado) => ({
        estado,
        cantidad: plantilla.filter((e) => e.estado === estado).length,
      })),
      incidenciasRecientes: await this.incidencias.count({
        where: { empresaId, fechaInicio: Between(treintaDias, hoy) },
      }),
    };
  }

  async preparacion(empresaId: string) {
    const ejercicioFiscal = new Date().getFullYear();
    let tarifasFiscales = false;
    try {
      obtenerTarifas(ejercicioFiscal);
      tarifasFiscales = true;
    } catch {
      tarifasFiscales = false;
    }
    const [puestos, empleados, conceptos, parametros, incidenciasPendientes, periodosAbiertos] =
      await Promise.all([
        this.puestos.count({ where: { empresaId, activo: true } }),
        this.empleados.count({ where: { empresaId, estado: EstadoEmpleado.ACTIVO } }),
        this.conceptos.count({ where: { empresaId, activo: true } }),
        this.parametrosNomina.count({ where: { empresaId, activo: true } }),
        this.incidencias.createQueryBuilder('i')
          .where('i.empresaId = :empresaId', { empresaId })
          .andWhere("i.estadoAprobacion NOT IN ('APROBADA','RECHAZADA','CANCELADA')")
          .getCount(),
        this.periodos.createQueryBuilder('p')
          .where('p.empresaId = :empresaId', { empresaId })
          .andWhere("p.estado NOT IN ('CERRADO','CANCELADO')")
          .getCount(),
      ]);
    return {
      puestos,
      empleados,
      conceptos,
      parametros,
      ejercicioFiscal,
      tarifasFiscales,
      incidenciasPendientes,
      periodosAbiertos,
      listoParaEmpleados: puestos > 0,
      listoParaCalculo: empleados > 0 && conceptos > 0 && tarifasFiscales,
    };
  }

  /* ══ FUNDAMENTOS DE MADUREZ DE NÓMINA ═══════════════════════════════════ */

  async crearContratoLaboral(dto: CrearContratoLaboralDto, empresaId: string, usuarioId?: string) {
    const inicio = this.fechaSql(dto.fechaInicio);
    const fin = dto.fechaFin ? this.fechaSql(dto.fechaFin) : undefined;
    if (fin && fin < inicio) {
      throw new BadRequestException('La fecha final del contrato no puede ser anterior a la inicial.');
    }
    if (dto.tipoContrato === TipoContrato.DETERMINADO && !fin) {
      throw new BadRequestException('El contrato por tiempo determinado requiere fecha final.');
    }
    const salarioDiario = Number(dto.salarioDiario);
    const salarioIntegrado = Number(dto.salarioDiarioIntegrado ?? salarioDiario);
    if (salarioIntegrado < salarioDiario) {
      throw new BadRequestException('El salario diario integrado no puede ser menor al salario diario.');
    }

    return this.dataSource.transaction(async (manager) => {
      const empleados = manager.getRepository(Empleado);
      const consultaEmpleado = empleados
        .createQueryBuilder('empleado')
        .setLock('pessimistic_write')
        .where('empleado.empresaId = :empresaId', { empresaId });
      if (SQL_SERVER_GUID_REGEX.test(dto.empleadoId)) {
        consultaEmpleado.andWhere('empleado.id = :referencia', { referencia: dto.empleadoId });
      } else {
        consultaEmpleado.andWhere('empleado.numeroEmpleado = :referencia', { referencia: dto.empleadoId });
      }
      const empleado = await consultaEmpleado.getOne();
      if (!empleado) {
        throw new NotFoundException('El empleado no existe o no pertenece a la empresa.');
      }
      if (empleado.estado === EstadoEmpleado.BAJA) {
        throw new ConflictException('No se puede crear un contrato para un empleado dado de baja.');
      }
      if (inicio < this.fechaSql(empleado.fechaIngreso)) {
        throw new BadRequestException('El contrato no puede iniciar antes del ingreso del empleado.');
      }

      const departamentoId = dto.departamentoId ?? empleado.departamentoId;
      const puestoId = dto.puestoId ?? empleado.puestoId;
      if (!departamentoId) {
        throw new BadRequestException('Selecciona el área o departamento del contrato.');
      }
      const departamento = await manager.getRepository(Departamento).findOne({
        where: { id: departamentoId, empresaId, activo: true },
      });
      if (!departamento) {
        throw new BadRequestException('El área seleccionada no existe o está inactiva.');
      }

      let puesto: Puesto | null = null;
      if (puestoId) {
        puesto = await manager.getRepository(Puesto).findOne({
          where: { id: puestoId, empresaId, activo: true },
        });
        if (!puesto) {
          throw new BadRequestException('El puesto seleccionado no existe o está inactivo.');
        }
        if (puesto.departamentoId !== departamentoId) {
          throw new BadRequestException('El puesto no pertenece al área seleccionada.');
        }
        const minimo = Number(puesto.salarioMinimo ?? 0);
        const maximo = Number(puesto.salarioMaximo ?? 0);
        if (minimo <= 0 || (maximo > 0 && minimo > maximo)) {
          throw new BadRequestException('El puesto no tiene un tabulador salarial válido.');
        }
        if (salarioDiario < minimo || (maximo > 0 && salarioDiario > maximo)) {
          const rango = maximo > 0
            ? `entre ${minimo.toFixed(2)} y ${maximo.toFixed(2)}`
            : `a partir de ${minimo.toFixed(2)}`;
          throw new BadRequestException(
            `El salario diario debe estar ${rango} para el puesto seleccionado.`,
          );
        }
        if (Number(puesto.plazasAutorizadas) < 1) {
          throw new BadRequestException('El puesto no tiene plazas autorizadas disponibles.');
        }
        if (puesto.id !== empleado.puestoId) {
          const ocupadas = await empleados
            .createQueryBuilder('ocupante')
            .where('ocupante.empresaId = :empresaId', { empresaId })
            .andWhere('ocupante.puestoId = :puestoId', { puestoId: puesto.id })
            .andWhere('ocupante.id <> :empleadoId', { empleadoId: empleado.id })
            .andWhere('ocupante.estado <> :baja', { baja: EstadoEmpleado.BAJA })
            .getCount();
          if (ocupadas >= Number(puesto.plazasAutorizadas)) {
            throw new BadRequestException(
              `El puesto ya tiene ocupadas sus ${puesto.plazasAutorizadas} plazas autorizadas.`,
            );
          }
        }
      }

      const contratos = manager.getRepository(ContratoLaboral);
      const vigente = await contratos.findOne({
        where: { empresaId, empleadoId: empleado.id, vigente: true },
        order: { fechaInicio: 'DESC' },
      });
      if (vigente && inicio <= this.fechaSql(vigente.fechaInicio)) {
        throw new BadRequestException('El nuevo contrato debe iniciar después del contrato vigente.');
      }

      const conflicto = await contratos
        .createQueryBuilder('contrato')
        .where('contrato.empresaId = :empresaId AND contrato.empleadoId = :empleadoId', {
          empresaId,
          empleadoId: empleado.id,
        })
        .andWhere('contrato.id <> :vigenteId', { vigenteId: vigente?.id ?? '00000000-0000-0000-0000-000000000000' })
        .andWhere('contrato.fechaInicio <= :fin', { fin: fin ?? new Date('9999-12-31T00:00:00') })
        .andWhere('(contrato.fechaFin IS NULL OR contrato.fechaFin >= :inicio)', { inicio })
        .getOne();
      if (conflicto) {
        throw new ConflictException('Las fechas se traslapan con otro contrato laboral registrado.');
      }

      if (vigente) {
        vigente.vigente = false;
        const diaAnterior = new Date(inicio);
        diaAnterior.setDate(diaAnterior.getDate() - 1);
        if (!vigente.fechaFin || vigente.fechaFin >= inicio) {
          vigente.fechaFin = diaAnterior >= this.fechaSql(vigente.fechaInicio) ? diaAnterior : inicio;
        }
        await contratos.save(vigente);
      }

      const contrato = await contratos.save(
        contratos.create({
          empresaId,
          empleadoId: empleado.id,
          tipoContrato: dto.tipoContrato,
          fechaInicio: inicio,
          fechaFin: fin,
          salarioDiario,
          salarioDiarioIntegrado: salarioIntegrado,
          puestoId,
          departamentoId,
          centroCostos: String(dto.centroCostos ?? '').trim() || undefined,
          observaciones: String(dto.observaciones ?? '').trim() || undefined,
          creadoPorId: usuarioId,
          vigente: true,
        }),
      );

      const anterior = {
        tipoContrato: empleado.tipoContrato,
        salarioDiario: empleado.salarioDiario,
        salarioDiarioIntegrado: empleado.salarioDiarioIntegrado,
        puestoId: empleado.puestoId,
        departamentoId: empleado.departamentoId,
      };
      Object.assign(empleado, {
        tipoContrato: dto.tipoContrato,
        salarioDiario,
        salarioDiarioIntegrado: salarioIntegrado,
        puestoId,
        departamentoId,
        sbcValidado: dto.sbcValidado ?? empleado.sbcValidado,
        fechaSbc: dto.fechaSbc ? this.fechaSql(dto.fechaSbc) : empleado.fechaSbc,
        codigoPostalFiscal: dto.codigoPostalFiscal ?? empleado.codigoPostalFiscal,
        regimenFiscal: dto.regimenFiscal ?? empleado.regimenFiscal,
      });
      await empleados.save(empleado);
      await manager.getRepository(MovimientoLaboral).save({
        empresaId,
        empleadoId: empleado.id,
        tipo: 'CONTRATO',
        fechaEfectiva: inicio,
        valoresAnterioresJson: JSON.stringify(anterior),
        valoresNuevosJson: JSON.stringify({
          contratoId: contrato.id,
          tipoContrato: contrato.tipoContrato,
          salarioDiario: contrato.salarioDiario,
          salarioDiarioIntegrado: contrato.salarioDiarioIntegrado,
          puestoId: contrato.puestoId,
          departamentoId: contrato.departamentoId,
        }),
        motivo: contrato.observaciones,
        usuarioId,
      });
      return contrato;
    });
  }

  listarContratos(empleadoId: string, empresaId: string) {
    return this.contratos.find({ where: { empleadoId, empresaId }, order: { fechaInicio: 'DESC' } });
  }

  listarMovimientosLaborales(empleadoId: string, empresaId: string) {
    return this.movimientosLaborales.find({ where: { empleadoId, empresaId }, order: { fechaEfectiva: 'DESC', fechaCreacion: 'DESC' } });
  }

  async crearParametroNomina(dto: CrearParametroNominaDto, empresaId: string) {
    const desde = new Date(`${String(dto.vigenciaDesde).slice(0, 10)}T00:00:00`);
    const hasta = dto.vigenciaHasta ? new Date(`${String(dto.vigenciaHasta).slice(0, 10)}T00:00:00`) : undefined;
    if (hasta && hasta < desde) throw new BadRequestException('La vigencia final no puede ser anterior a la inicial.');
    const solapado = await this.parametrosNomina.createQueryBuilder('p')
      .where('p.empresaId = :empresaId AND p.clave = :clave AND p.activo=true', { empresaId, clave: dto.clave })
      .andWhere('(p.vigenciaHasta IS NULL OR p.vigenciaHasta >= :desde)', { desde })
      .andWhere('(:hasta IS NULL OR p.vigenciaDesde <= :hasta)', { hasta: hasta ?? null })
      .getOne();
    if (solapado) throw new ConflictException(`Ya existe una vigencia activa para ${dto.clave} que se traslapa.`);
    return this.parametrosNomina.save(this.parametrosNomina.create({ ...dto, empresaId, vigenciaDesde: desde, vigenciaHasta: hasta, activo: true }));
  }

  listarParametrosNomina(empresaId: string, fecha?: string) {
    if (!fecha) return this.parametrosNomina.find({ where: { empresaId, activo: true }, order: { clave: 'ASC', vigenciaDesde: 'DESC' } });
    const f = new Date(`${fecha.slice(0, 10)}T00:00:00`);
    return this.parametrosNomina.createQueryBuilder('p')
      .where('p.empresaId = :empresaId AND p.activo=true', { empresaId })
      .andWhere('p.vigenciaDesde <= :f', { f })
      .andWhere('(p.vigenciaHasta IS NULL OR p.vigenciaHasta >= :f)', { f })
      .orderBy('p.clave', 'ASC').getMany();
  }

  async crearConcepto(dto: CrearConceptoNominaDto, empresaId: string) {
    const clave = String(dto.clave).trim().toUpperCase();
    const existe = await this.conceptos.findOne({ where: { empresaId, clave } });
    if (existe) throw new ConflictException(`Ya existe el concepto ${clave}.`);
    return this.conceptos.save(this.conceptos.create({
      ...dto,
      clave,
      empresaId,
      vigenciaDesde: dto.vigenciaDesde ? new Date(`${dto.vigenciaDesde.slice(0, 10)}T00:00:00`) : undefined,
      vigenciaHasta: dto.vigenciaHasta ? new Date(`${dto.vigenciaHasta.slice(0, 10)}T00:00:00`) : undefined,
    }));
  }

  async actualizarConcepto(id: string, dto: ActualizarConceptoNominaDto, empresaId: string) {
    const concepto = await this.conceptos.findOne({ where: { id, empresaId } });
    if (!concepto) throw new NotFoundException('El concepto de nómina no existe.');
    Object.assign(concepto, dto, {
      vigenciaDesde: dto.vigenciaDesde ? new Date(`${dto.vigenciaDesde.slice(0, 10)}T00:00:00`) : concepto.vigenciaDesde,
      vigenciaHasta: dto.vigenciaHasta ? new Date(`${dto.vigenciaHasta.slice(0, 10)}T00:00:00`) : concepto.vigenciaHasta,
    });
    return this.conceptos.save(concepto);
  }

  async solicitarVacaciones(dto: SolicitarVacacionesDto, empresaId: string, usuarioId: string) {
    const empleado = await this.resolverEmpleado(dto.empleadoId, empresaId);
    const inicio = this.fechaSql(dto.fechaInicio);
    const fin = this.fechaSql(dto.fechaFin);
    if (fin < inicio) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial.');
    }
    const dias = await this.contarDiasLaborables(empresaId, inicio, fin);
    if (dias <= 0) {
      throw new BadRequestException('El rango no contiene días laborables.');
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const traslape = await manager
        .getRepository(SolicitudVacaciones)
        .createQueryBuilder('s')
        .where('s.empresaId = :empresaId AND s.empleadoId = :empleadoId', {
          empresaId,
          empleadoId: empleado.id,
        })
        .andWhere('s.estado IN (:...estados)', {
          estados: [
            EstadoSolicitud.CAPTURADA,
            EstadoSolicitud.EN_REVISION,
            EstadoSolicitud.APROBADA,
          ],
        })
        .andWhere('s.fechaInicio <= :fin AND s.fechaFin >= :inicio', {
          inicio,
          fin,
        })
        .getOne();
      if (traslape) {
        throw new ConflictException(
          'Ya existe una solicitud de vacaciones que se traslapa con esas fechas.',
        );
      }

      const saldo = await this.obtenerOCrearSaldoVacaciones(
        manager,
        empleado,
        inicio,
        empresaId,
      );
      const disponible = money(
        Number(saldo.diasDevengados) +
          Number(saldo.diasArrastre) -
          Number(saldo.diasReservados) -
          Number(saldo.diasDisfrutados),
      );
      if (dias > disponible + 0.001) {
        throw new ConflictException(
          `Saldo insuficiente. Disponibles: ${disponible}; solicitados: ${dias}.`,
        );
      }

      saldo.diasReservados = money(Number(saldo.diasReservados) + dias);
      await manager.save(saldo);
      const solicitud = await manager.save(
        manager.create(SolicitudVacaciones, {
          ...dto,
          empresaId,
          empleadoId: empleado.id,
          fechaInicio: inicio,
          fechaFin: fin,
          diasSolicitados: dias,
          estado: EstadoSolicitud.EN_REVISION,
          solicitadaPorId: usuarioId,
        }),
      );
      const matriz = await manager.getRepository(ConfiguracionAprobacion).find({
        where: { empresaId, proceso: 'VACACIONES', activo: true }, order: { orden: 'ASC' },
      });
      const niveles = matriz.length ? matriz : [manager.getRepository(ConfiguracionAprobacion).create({ orden: 1, rolAprobador: 'rrhh', tiempoLimiteHoras: 24 })];
      await manager.getRepository(AprobacionDocumento).save(niveles.map((nivel) => manager.getRepository(AprobacionDocumento).create({
        empresaId, proceso: 'VACACIONES', documentoId: solicitud.id, nivel: nivel.orden,
        usuarioAprobadorId: nivel.usuarioId, rolAprobador: nivel.rolAprobador,
        solicitadoPorId: usuarioId, tiempoLimiteHoras: nivel.tiempoLimiteHoras || 24,
        fechaVencimiento: new Date(Date.now() + (nivel.tiempoLimiteHoras || 24) * 3600000),
      })));
      return solicitud;
    });
  }

  async listarSolicitudesVacaciones(empresaId: string, empleadoId?: string) {
    const resolved = empleadoId
      ? (await this.resolverEmpleado(empleadoId, empresaId)).id
      : undefined;
    return this.solicitudesVacaciones.find({
      where: { empresaId, ...(resolved ? { empleadoId: resolved } : {}) },
      order: { fechaCreacion: 'DESC' },
    });
  }

  async consultarSaldoVacaciones(
    referenciaEmpleado: string,
    empresaId: string,
    fecha?: string,
  ) {
    const empleado = await this.resolverEmpleado(referenciaEmpleado, empresaId);
    const al = fecha ? this.fechaSql(fecha) : new Date();
    return this.dataSource.transaction(async (manager) => {
      const saldo = await this.obtenerOCrearSaldoVacaciones(
        manager,
        empleado,
        al,
        empresaId,
      );
      return {
        ...saldo,
        disponible: money(
          Number(saldo.diasDevengados) +
            Number(saldo.diasArrastre) -
            Number(saldo.diasReservados) -
            Number(saldo.diasDisfrutados),
        ),
      };
    });
  }

  async resolverVacaciones(
    id: string,
    aprobar: boolean,
    motivo: string | undefined,
    empresaId: string,
    usuarioId: string,
    rolUsuario: string,
  ) {
    if (!aprobar && !motivo?.trim()) {
      throw new BadRequestException('El motivo es obligatorio al rechazar.');
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const solicitud = await manager.findOne(SolicitudVacaciones, {
        where: { id, empresaId },
      });
      if (!solicitud) throw new NotFoundException('La solicitud no existe.');
      if (
        ![EstadoSolicitud.CAPTURADA, EstadoSolicitud.EN_REVISION].includes(
          solicitud.estado,
        )
      ) {
        throw new ConflictException('La solicitud ya fue resuelta.');
      }
      if (solicitud.solicitadaPorId === usuarioId) {
        throw new ForbiddenException(
          'Quien solicita vacaciones no puede aprobarlas.',
        );
      }
      const paso = await manager.getRepository(AprobacionDocumento).findOne({
        where: { empresaId, proceso: 'VACACIONES', documentoId: id, estado: 'PENDIENTE' }, order: { nivel: 'ASC' },
      });
      if (!paso) throw new ConflictException('La solicitud no tiene un nivel de aprobación pendiente.');
      const rol = String(rolUsuario || '').toLowerCase();
      if ((paso.usuarioAprobadorId && paso.usuarioAprobadorId !== usuarioId) || (paso.rolAprobador && paso.rolAprobador.toLowerCase() !== rol && rol !== 'admin')) {
        throw new ForbiddenException('Este nivel de aprobación corresponde a otro usuario o rol.');
      }
      paso.estado = aprobar ? 'APROBADA' : 'RECHAZADA';
      paso.resueltoPorId = usuarioId; paso.fechaResolucion = new Date(); paso.comentario = motivo?.trim();
      await manager.save(paso);
      if (aprobar) {
        const faltan = await manager.getRepository(AprobacionDocumento).count({ where: { empresaId, proceso: 'VACACIONES', documentoId: id, estado: 'PENDIENTE' } });
        if (faltan > 0) return manager.save(Object.assign(solicitud, { estado: EstadoSolicitud.EN_REVISION }));
      } else {
        await manager.getRepository(AprobacionDocumento).createQueryBuilder().update().set({ estado: 'CANCELADA' })
          .where('empresaId=:empresaId AND proceso=:proceso AND documentoId=:id AND estado=:estado', { empresaId, proceso: 'VACACIONES', id, estado: 'PENDIENTE' }).execute();
      }
      const empleado = await manager.findOne(Empleado, {
        where: { id: solicitud.empleadoId, empresaId },
      });
      if (!empleado) throw new NotFoundException('El empleado ya no existe.');
      const saldo = await this.obtenerOCrearSaldoVacaciones(
        manager,
        empleado,
        solicitud.fechaInicio,
        empresaId,
      );
      saldo.diasReservados = money(
        Math.max(0, Number(saldo.diasReservados) - Number(solicitud.diasSolicitados)),
      );
      if (aprobar) {
        saldo.diasDisfrutados = money(
          Number(saldo.diasDisfrutados) + Number(solicitud.diasSolicitados),
        );
      } else {
        saldo.diasCancelados = money(
          Number(saldo.diasCancelados) + Number(solicitud.diasSolicitados),
        );
      }
      await manager.save(saldo);

      solicitud.estado = aprobar
        ? EstadoSolicitud.APROBADA
        : EstadoSolicitud.RECHAZADA;
      solicitud.motivoResolucion = motivo?.trim();
      solicitud.resueltaPorId = usuarioId;
      solicitud.fechaResolucion = new Date();
      const guardada = await manager.save(solicitud);

      if (aprobar) {
        const existe = await manager
          .getRepository(Incidencia)
          .createQueryBuilder('i')
          .where(
            'i.empresaId = :empresaId AND i.empleadoId = :empleadoId AND i.tipo = :tipo',
            {
              empresaId,
              empleadoId: solicitud.empleadoId,
              tipo: TipoIncidencia.VACACIONES,
            },
          )
          .andWhere('i.fechaInicio = :inicio AND i.fechaFin = :fin', {
            inicio: solicitud.fechaInicio,
            fin: solicitud.fechaFin,
          })
          .getOne();
        if (!existe) {
          await manager.save(
            manager.create(Incidencia, {
              empresaId,
              empleadoId: solicitud.empleadoId,
              tipo: TipoIncidencia.VACACIONES,
              fechaInicio: solicitud.fechaInicio,
              fechaFin: solicitud.fechaFin,
              dias: solicitud.diasSolicitados,
              horas: 0,
              pagada: true,
              motivo: solicitud.motivo,
              aprobada: true,
              estadoAprobacion: 'APROBADA',
              aprobadaPorId: usuarioId,
              fechaAprobacion: new Date(),
            }),
          );
        }
      }
      return guardada;
    });
  }

  private async obtenerOCrearSaldoVacaciones(
    manager: EntityManager,
    empleado: Empleado,
    al: Date,
    empresaId: string,
  ): Promise<SaldoVacaciones> {
    const ingreso = this.fechaSql(empleado.fechaIngreso);
    const antiguedad = Math.max(
      0,
      al.getFullYear() -
        ingreso.getFullYear() -
        (al < new Date(al.getFullYear(), ingreso.getMonth(), ingreso.getDate())
          ? 1
          : 0),
    );
    if (antiguedad < 1) {
      throw new ConflictException(
        'El empleado aún no ha cumplido el primer aniversario laboral.',
      );
    }
    const aniversario = antiguedad;
    let saldo = await manager.findOne(SaldoVacaciones, {
      where: { empresaId, empleadoId: empleado.id, aniversario },
    });
    if (saldo) return saldo;
    const desde = new Date(
      ingreso.getFullYear() + aniversario,
      ingreso.getMonth(),
      ingreso.getDate(),
    );
    const hasta = new Date(
      ingreso.getFullYear() + aniversario + 1,
      ingreso.getMonth(),
      ingreso.getDate() - 1,
    );
    saldo = manager.create(SaldoVacaciones, {
      empresaId,
      empleadoId: empleado.id,
      aniversario,
      vigenciaDesde: desde,
      vigenciaHasta: hasta,
      diasDevengados: this.diasVacacionesPorLey(aniversario),
      diasArrastre: 0,
      diasReservados: 0,
      diasDisfrutados: 0,
      diasCancelados: 0,
    });
    return manager.save(saldo);
  }

  private async contarDiasLaborables(
    empresaId: string,
    inicio: Date,
    fin: Date,
  ): Promise<number> {
    const excepciones = await this.calendarioLaboral.find({
      where: { empresaId, fecha: Between(inicio, fin), activo: true },
    });
    const mapa = new Map(
      excepciones.map((d) => [this.fechaIsoLocal(d.fecha), d.laborable]),
    );
    let dias = 0;
    for (
      let fecha = new Date(inicio);
      fecha <= fin;
      fecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
    ) {
      const clave = this.fechaIsoLocal(fecha);
      const excepcion = mapa.get(clave);
      const laborable = excepcion !== undefined ? excepcion : fecha.getDay() !== 0;
      if (laborable) dias += 1;
    }
    return dias;
  }

  private fechaIsoLocal(fecha: Date | string): string {
    const d = new Date(fecha);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

}
