import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActivacionFinanciera,
  EstadoActivacionFinanciera,
  ModoActivacionFinanciera,
} from '../entities/activacion-financiera.entity';
import {
  CuentaContable,
  RolCuentaSistema,
} from '../entities/cuenta-contable.entity';
import { Poliza } from '../entities/poliza.entity';
import { AsientoPendiente } from '../entities/asiento-pendiente.entity';
import { Empresa } from '../../iam/entities/empresa.entity';
import { ConfiguracionFiscal } from '../../cfdi/configuracion-fiscal.entity';
import { Impuesto } from '../../catalogo/entities/impuesto.entity';
import { GuardarActivacionFinancieraDto } from '../dto/activacion-financiera.dto';
import { CuentasContablesService } from './cuentas-contables.service';
import { PolizasService } from './polizas.service';
import { IMPUESTOS_ESTANDAR_MX } from '../../catalogo/services/impuesto.service';
import { CatalogosSatService } from './catalogos-sat.service';

type RespuestasWizard = {
  manejaInventario?: boolean;
  vendeCredito?: boolean;
  compraCredito?: boolean;
  preciosIncluyenIVA?: boolean;
  metodoCosteo?: string;
  metodosCobro?: string[];
  saldoCaja?: number;
  saldoBancos?: number;
  saldoClientes?: number;
  saldoInventario?: number;
  saldoProveedores?: number;
  confirmaSaldosIniciales?: boolean;
  confirmaRevision?: boolean;
};

const ROLES_OBLIGATORIOS: RolCuentaSistema[] = [
  RolCuentaSistema.CAJA,
  RolCuentaSistema.BANCOS,
  RolCuentaSistema.CLIENTES_CXC,
  RolCuentaSistema.INVENTARIO,
  RolCuentaSistema.IVA_ACREDITABLE_PAGADO,
  RolCuentaSistema.IVA_ACREDITABLE_PENDIENTE,
  RolCuentaSistema.IVA_TRASLADADO_COBRADO,
  RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO,
  RolCuentaSistema.PROVEEDORES,
  RolCuentaSistema.VENTAS,
  RolCuentaSistema.COSTO_VENTAS,
  RolCuentaSistema.SALDOS_INICIALES,
];

@Injectable()
export class ActivacionFinancieraService {
  constructor(
    @InjectRepository(ActivacionFinanciera)
    private readonly activacionRepo: Repository<ActivacionFinanciera>,
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    @InjectRepository(Poliza)
    private readonly polizaRepo: Repository<Poliza>,
    @InjectRepository(AsientoPendiente)
    private readonly pendienteRepo: Repository<AsientoPendiente>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(ConfiguracionFiscal)
    private readonly fiscalRepo: Repository<ConfiguracionFiscal>,
    @InjectRepository(Impuesto)
    private readonly impuestoRepo: Repository<Impuesto>,
    private readonly cuentasService: CuentasContablesService,
    private readonly polizasService: PolizasService,
    private readonly catalogosSat: CatalogosSatService,
  ) {}

  private respuestas(activacion: ActivacionFinanciera): RespuestasWizard {
    try {
      return JSON.parse(activacion.configuracionJson || '{}');
    } catch {
      return {};
    }
  }

  private async obtenerOCrear(empresaId: string) {
    let activacion = await this.activacionRepo.findOne({
      where: { empresaId },
    });
    if (!activacion) {
      activacion = await this.activacionRepo.save(
        this.activacionRepo.create({
          empresaId,
          estado: EstadoActivacionFinanciera.NO_INICIADO,
          pasoActual: 1,
          configuracionJson: '{}',
          version: 1,
        }),
      );
    }
    return activacion;
  }

  async estado(empresaId: string) {
    const activacion = await this.obtenerOCrear(empresaId);
    return {
      id: activacion.id,
      estado: activacion.estado,
      activa: activacion.estado === EstadoActivacionFinanciera.ACTIVO,
      modo: activacion.modo,
      pasoActual: activacion.pasoActual,
      fechaInicioContable: activacion.fechaInicioContable,
      empresaEnOperacion: activacion.empresaEnOperacion,
      configuracion: this.respuestas(activacion),
      version: activacion.version,
      fechaActivacion: activacion.fechaActivacion,
      diagnostico: await this.diagnostico(empresaId, activacion),
    };
  }

  async acceso(empresaId: string) {
    const activacion = await this.obtenerOCrear(empresaId);
    const activa = activacion.estado === EstadoActivacionFinanciera.ACTIVO;
    return {
      activa,
      estado: activacion.estado,
      ruta: activa ? null : '/configuracion-financiera',
    };
  }

  async guardarPaso(
    empresaId: string,
    paso: number,
    dto: GuardarActivacionFinancieraDto,
  ) {
    if (paso < 1 || paso > 4) {
      throw new BadRequestException(
        'El paso del asistente debe estar entre 1 y 4.',
      );
    }
    const activacion = await this.obtenerOCrear(empresaId);
    if (activacion.estado === EstadoActivacionFinanciera.ACTIVO) {
      throw new ConflictException(
        'Finanzas ya está activo. Para cambiar su base contable debe abrirse una nueva versión de configuración.',
      );
    }

    if (paso === 1) {
      if (
        !dto.modo ||
        dto.empresaEnOperacion === undefined ||
        !dto.fechaInicioContable
      ) {
        throw new BadRequestException(
          'Selecciona el modo, indica si la empresa ya operaba y captura la fecha de inicio contable.',
        );
      }
      activacion.modo = dto.modo;
      activacion.empresaEnOperacion = dto.empresaEnOperacion;
      activacion.fechaInicioContable = new Date(
        `${dto.fechaInicioContable.substring(0, 10)}T00:00:00`,
      );
      await this.cuentasService.precargarPlanEstandar(empresaId);
      await this.asegurarImpuestosBase(empresaId);
    }

    const actuales = this.respuestas(activacion);
    const permitidos: (keyof RespuestasWizard)[] = [
      'manejaInventario',
      'vendeCredito',
      'compraCredito',
      'preciosIncluyenIVA',
      'metodoCosteo',
      'metodosCobro',
      'saldoCaja',
      'saldoBancos',
      'saldoClientes',
      'saldoInventario',
      'saldoProveedores',
      'confirmaSaldosIniciales',
      'confirmaRevision',
    ];
    for (const campo of permitidos) {
      if (dto[campo] !== undefined) (actuales as any)[campo] = dto[campo];
    }
    activacion.configuracionJson = JSON.stringify(actuales);
    activacion.pasoActual = Math.max(activacion.pasoActual, paso + 1);
    activacion.estado = EstadoActivacionFinanciera.EN_CONFIGURACION;
    activacion.version += 1;
    await this.activacionRepo.save(activacion);
    return this.estado(empresaId);
  }

  private async asegurarImpuestosBase(empresaId: string) {
    const existentes = await this.impuestoRepo.find({ where: { empresaId } });
    const porNombre = new Map(
      existentes.map((impuesto) => [impuesto.nombre.toLowerCase(), impuesto]),
    );
    const guardar: Impuesto[] = [];
    for (const definicion of IMPUESTOS_ESTANDAR_MX) {
      const existente = porNombre.get(definicion.nombre.toLowerCase());
      if (existente) {
        Object.assign(existente, definicion, { activo: true });
        guardar.push(existente);
      } else {
        guardar.push(
          this.impuestoRepo.create({
            ...definicion,
            empresaId,
            activo: true,
          }),
        );
      }
    }
    if (guardar.length) await this.impuestoRepo.save(guardar);
  }

  private numero(valor: unknown) {
    return Math.round(Number(valor ?? 0) * 100) / 100;
  }

  private saldos(config: RespuestasWizard) {
    return {
      caja: this.numero(config.saldoCaja),
      bancos: this.numero(config.saldoBancos),
      clientes: this.numero(config.saldoClientes),
      inventario: this.numero(config.saldoInventario),
      proveedores: this.numero(config.saldoProveedores),
    };
  }

  async diagnostico(empresaId: string, existente?: ActivacionFinanciera) {
    const activacion = existente ?? (await this.obtenerOCrear(empresaId));
    const [empresa, fiscal, cuentas, impuestos, polizas, pendientes, mapeoSat] =
      await Promise.all([
        this.empresaRepo.findOne({ where: { id: empresaId } }),
        this.fiscalRepo.findOne({ where: { empresaId } }),
        this.cuentaRepo.find({ where: { empresaId, activo: true } }),
        this.impuestoRepo.find({ where: { empresaId, activo: true } }),
        this.polizaRepo.count({ where: { empresaId } }),
        this.pendienteRepo.count({
          where: { empresaId, estado: 'FALLIDO' as any },
        }),
        this.catalogosSat.diagnosticoMapeo(empresaId),
      ]);

    const config = this.respuestas(activacion);
    const roles = new Set(
      cuentas.map((cuenta) => cuenta.rolSistema).filter(Boolean),
    );
    const rolesFaltantes = ROLES_OBLIGATORIOS.filter((rol) => !roles.has(rol));
    const identidadFiscalCompleta = Boolean(
      empresa?.rfc &&
      empresa.regimenFiscal &&
      empresa.codigoPostal &&
      empresa.tipoPersonaFiscal &&
      fiscal?.razonSocial,
    );
    const impuestosCorrectos = [
      'IVA 16%',
      'IVA 0%',
      'Exento',
      'No objeto de impuesto',
    ].every((nombre) =>
      impuestos.some((impuesto) => impuesto.nombre === nombre),
    );
    const operacionCompleta = Boolean(
      activacion.modo &&
      activacion.fechaInicioContable &&
      activacion.empresaEnOperacion !== null &&
      config.metodoCosteo &&
      config.metodosCobro?.length,
    );
    const saldosConfirmados = config.confirmaSaldosIniciales === true;
    const revisionConfirmada = config.confirmaRevision === true;
    const listo =
      identidadFiscalCompleta &&
      rolesFaltantes.length === 0 &&
      mapeoSat.completo &&
      impuestosCorrectos &&
      operacionCompleta &&
      saldosConfirmados &&
      revisionConfirmada;

    return {
      listoParaActivar: listo,
      identidadFiscal: {
        completa: identidadFiscalCompleta,
        nombreComercial: empresa?.nombreComercial ?? '',
        razonSocial: fiscal?.razonSocial ?? empresa?.nombreComercial ?? '',
        rfc: empresa?.rfc ?? fiscal?.rfc ?? '',
        regimenFiscal: empresa?.regimenFiscal ?? fiscal?.regimenFiscal ?? '',
        codigoPostal: empresa?.codigoPostal ?? fiscal?.codigoPostalExpedicion ?? '',
        tipoPersona: empresa?.tipoPersonaFiscal ?? null,
        mensaje: identidadFiscalCompleta
          ? 'Datos fiscales base completos.'
          : 'Completa RFC, razón social, régimen, tipo de persona y código postal.',
      },
      cuentas: {
        completas: rolesFaltantes.length === 0,
        total: cuentas.length,
        rolesFaltantes,
      },
      clasificacionSat: mapeoSat,
      impuestos: {
        completos: impuestosCorrectos,
        configurados: impuestos.map((impuesto) => impuesto.nombre),
      },
      operacion: {
        completa: operacionCompleta,
        modo: activacion.modo,
        fechaInicioContable: activacion.fechaInicioContable,
      },
      apertura: {
        confirmada: saldosConfirmados,
        saldos: this.saldos(config),
        polizasHistoricas: polizas,
        seCrearaPoliza:
          polizas === 0 &&
          Object.values(this.saldos(config)).some((valor) => valor > 0),
        advertencia:
          polizas > 0
            ? 'Ya existen pólizas; el asistente no generará otra apertura para evitar duplicar saldos.'
            : null,
      },
      revision: { confirmada: revisionConfirmada },
      asientosFallidos: pendientes,
    };
  }

  private async construirSimulacion(empresaId: string) {
    const activacion = await this.obtenerOCrear(empresaId);
    const config = this.respuestas(activacion);
    const cuentas = await this.cuentaRepo.find({
      where: { empresaId, activo: true },
    });
    const porRol = new Map(
      cuentas
        .filter((cuenta) => cuenta.rolSistema)
        .map((cuenta) => [cuenta.rolSistema!, cuenta]),
    );
    const saldos = this.saldos(config);
    const activos =
      saldos.caja + saldos.bancos + saldos.clientes + saldos.inventario;
    const pasivos = saldos.proveedores;
    const capital = this.numero(activos - pasivos);
    const apertura = [
      [RolCuentaSistema.CAJA, saldos.caja, 0],
      [RolCuentaSistema.BANCOS, saldos.bancos, 0],
      [RolCuentaSistema.CLIENTES_CXC, saldos.clientes, 0],
      [RolCuentaSistema.INVENTARIO, saldos.inventario, 0],
      [RolCuentaSistema.PROVEEDORES, 0, saldos.proveedores],
      [
        RolCuentaSistema.SALDOS_INICIALES,
        capital < 0 ? Math.abs(capital) : 0,
        capital > 0 ? capital : 0,
      ],
    ]
      .filter(([, cargo, abono]) => Number(cargo) > 0 || Number(abono) > 0)
      .map(([rol, cargo, abono]) => {
        const cuenta = porRol.get(rol as RolCuentaSistema);
        return {
          rol,
          cuentaId: cuenta?.id,
          numeroCuenta: cuenta?.numeroCuenta,
          cuenta: cuenta?.nombre,
          cargo: Number(cargo),
          abono: Number(abono),
        };
      });

    return {
      apertura: {
        partidas: apertura,
        totalCargos: this.numero(
          apertura.reduce((suma, partida) => suma + partida.cargo, 0),
        ),
        totalAbonos: this.numero(
          apertura.reduce((suma, partida) => suma + partida.abono, 0),
        ),
      },
      ejemplos: [
        {
          titulo: 'Venta de contado por $1,160',
          explicacion:
            'Entra dinero por $1,160; $1,000 son ventas y $160 es IVA trasladado.',
          partidas: [
            { rol: 'CAJA', cargo: 1160, abono: 0 },
            { rol: 'VENTAS', cargo: 0, abono: 1000 },
            { rol: 'IVA_TRASLADADO_COBRADO', cargo: 0, abono: 160 },
          ],
        },
        {
          titulo: 'Compra de inventario a crédito por $1,160',
          explicacion:
            'Aumenta inventario $1,000, IVA acreditable $160 y la deuda al proveedor $1,160.',
          partidas: [
            { rol: 'INVENTARIO', cargo: 1000, abono: 0 },
            { rol: 'IVA_ACREDITABLE_PENDIENTE', cargo: 160, abono: 0 },
            { rol: 'PROVEEDORES', cargo: 0, abono: 1160 },
          ],
        },
      ],
    };
  }

  async simular(empresaId: string) {
    return {
      diagnostico: await this.diagnostico(empresaId),
      simulacion: await this.construirSimulacion(empresaId),
    };
  }

  async activar(empresaId: string, usuarioId: string) {
    const activacion = await this.obtenerOCrear(empresaId);
    if (activacion.estado === EstadoActivacionFinanciera.ACTIVO) {
      return this.estado(empresaId);
    }
    await this.cuentasService.precargarPlanEstandar(empresaId);
    await this.asegurarImpuestosBase(empresaId);
    const diagnostico = await this.diagnostico(empresaId, activacion);
    if (!diagnostico.listoParaActivar) {
      activacion.estado = EstadoActivacionFinanciera.REQUIERE_CORRECCION;
      activacion.diagnosticoJson = JSON.stringify(diagnostico);
      await this.activacionRepo.save(activacion);
      throw new BadRequestException(
        'La configuración todavía tiene requisitos pendientes. Revisa el diagnóstico del asistente.',
      );
    }

    const simulacion = await this.construirSimulacion(empresaId);
    if (
      diagnostico.apertura.polizasHistoricas === 0 &&
      simulacion.apertura.partidas.length > 0
    ) {
      const incompletas = simulacion.apertura.partidas.filter(
        (partida) => !partida.cuentaId,
      );
      if (incompletas.length) {
        throw new BadRequestException(
          'No se puede crear la apertura porque faltan cuentas con rol contable.',
        );
      }
      await this.polizasService.crearPolizaManual({
        empresaId,
        tipo: 'DIARIO',
        fecha: activacion.fechaInicioContable!,
        concepto: 'Saldos iniciales generados por el asistente financiero',
        origenClave: `ACTIVACION_FINANCIERA:${empresaId}:APERTURA`,
        origenTipo: 'ACTIVACION_FINANCIERA',
        partidas: simulacion.apertura.partidas.map((partida) => ({
          cuentaContableId: partida.cuentaId!,
          cargo: partida.cargo,
          abono: partida.abono,
          referencia: 'Apertura guiada',
        })),
      });
    }

    activacion.estado = EstadoActivacionFinanciera.ACTIVO;
    activacion.pasoActual = 5;
    activacion.activadoPor = usuarioId;
    activacion.fechaActivacion = new Date();
    activacion.diagnosticoJson = JSON.stringify(diagnostico);
    activacion.version += 1;
    await this.activacionRepo.save(activacion);
    return this.estado(empresaId);
  }

  async exigirActiva(empresaId: string) {
    const activacion = await this.obtenerOCrear(empresaId);
    if (activacion.estado !== EstadoActivacionFinanciera.ACTIVO) {
      throw new ConflictException({
        message:
          'Debes completar el Asistente Maestro de Finanzas antes de modificar los libros contables.',
        codigo: 'FINANZAS_NO_ACTIVAS',
        estado: activacion.estado,
        ruta: '/configuracion-financiera',
      });
    }
  }
}
