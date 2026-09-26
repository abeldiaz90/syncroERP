// src/clientes/services/clientes.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CrearClienteDto } from './crear-cliente.dto';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';
import { GestionarCreditoClienteDto } from './gestionar-credito-cliente.dto';
import { esRolAdministrador, normalizarRol } from '../iam/utils/roles.util';
import { AprobacionesDocumentosService } from '../aprobaciones/services/aprobaciones-documentos.service';
import { AprobacionDocumento } from '../compras/entities/aprobacion-documento.entity';
import { normalizarRfc, revisarRfcDeTipo } from '../common/utils/rfc.util';

type CondicionesSolicitudCredito = {
  limiteCredito: number;
  diasCredito: number;
  nivelRiesgo: 'BAJO' | 'MEDIO' | 'ALTO';
  bloquearCreditoConSaldoVencido: boolean;
  clasificacionHotelera: 'EMPRESA' | 'AGENCIA' | null;
};

const CAMPOS_CREDITO = [
  'limiteCredito',
  'diasCredito',
  'nivelRiesgo',
  'bloquearCreditoConSaldoVencido',
  'clasificacionHotelera',
] as const;

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
    @InjectRepository(Pais) private readonly paisRepo: Repository<Pais>,
    @InjectRepository(Estado) private readonly estadoRepo: Repository<Estado>,
    private readonly dataSource: DataSource,
    private readonly aprobaciones: AprobacionesDocumentosService,
  ) {}

  async crear(
    dto: CrearClienteDto,
    empresaId: string,
    usuarioId: string,
  ) {
    await this.validarUbicacion(dto);
    await this.validarNegocio(dto, empresaId);
    const condiciones = this.condicionesDesdeDto(dto);
    const tieneCredito =
      condiciones.limiteCredito > 0 && condiciones.diasCredito > 0;
    if (tieneCredito) {
      await this.aprobaciones.exigirConfiguracion(
        empresaId,
        'CREDITO_CLIENTE',
        condiciones.limiteCredito,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Cliente);
      const {
        limiteCredito: _limite,
        diasCredito: _dias,
        nivelRiesgo: _riesgo,
        bloquearCreditoConSaldoVencido: _bloqueo,
        clasificacionHotelera: _clasificacion,
        ...datosBasicos
      } = dto;
      const cliente = await repo.save(
        repo.create({
          ...datosBasicos,
          empresaId,
          etapaComercial: 'PROSPECTO',
          // La línea vigente permanece vacía hasta que termine el maker-checker.
          limiteCredito: 0,
          diasCredito: 0,
          estadoCredito: 'SIN_CREDITO',
          nivelRiesgo: 'MEDIO',
          bloquearCreditoConSaldoVencido: true,
          clasificacionHotelera: tieneCredito
            ? null
            : condiciones.clasificacionHotelera,
          versionCredito: 1,
          estadoSolicitudCredito: tieneCredito ? 'PENDIENTE' : 'NINGUNA',
          limiteCreditoSolicitado: tieneCredito
            ? condiciones.limiteCredito
            : null,
          diasCreditoSolicitados: tieneCredito
            ? condiciones.diasCredito
            : null,
          nivelRiesgoSolicitado: tieneCredito
            ? condiciones.nivelRiesgo
            : null,
          bloquearCreditoConSaldoVencidoSolicitado: tieneCredito
            ? condiciones.bloquearCreditoConSaldoVencido
            : null,
          clasificacionHoteleraSolicitada: tieneCredito
            ? condiciones.clasificacionHotelera
            : null,
          versionSolicitudCredito: tieneCredito ? 1 : 0,
          creditoSolicitadoPorId: tieneCredito ? usuarioId : null,
          fechaSolicitudCredito: tieneCredito ? new Date() : null,
        }),
      );
      if (tieneCredito) {
        await this.prepararSolicitudCreditoEnTransaccion(
          manager,
          cliente,
          empresaId,
          usuarioId,
        );
      }
      return cliente;
    });
  }

  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const where: any = { empresaId };
    if (soloActivos) where.activo = true;

    const query = this.clienteRepo.createQueryBuilder('c').where(where);

    if (filtro) {
      query.andWhere(
        '(c.nombre ILIKE :filtro OR c.email ILIKE :filtro OR c.telefono ILIKE :filtro OR c.rfc ILIKE :filtro)',
        { filtro: `%${filtro}%` },
      );
    }

    return query.orderBy('c.nombre', 'ASC').getMany();
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cliente = await this.clienteRepo.findOne({
      where: { id, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return cliente;
  }

  async actualizar(
    id: string,
    dto: Partial<CrearClienteDto>,
    empresaId: string,
    usuarioId: string,
  ) {
    const actual = await this.clienteRepo.findOne({ where: { id, empresaId } });
    if (!actual) throw new NotFoundException('Cliente no encontrado.');

    await this.validarUbicacion(dto);
    if (
      dto.tipoPersona &&
      dto.tipoPersona !== actual.tipoPersona &&
      (Number(actual.limiteCredito ?? 0) > 0 ||
        actual.estadoSolicitudCredito === 'PENDIENTE' ||
        Boolean(actual.clasificacionHotelera))
    ) {
      throw new BadRequestException(
        'No cambies el tipo de persona mientras exista una línea o solicitud de crédito. Suspende y regulariza primero el expediente.',
      );
    }

    const incluyeCondiciones = this.incluyeCondicionesCredito(dto);
    const condicionesPropuestas = this.condicionesParaCliente(actual, dto);
    const propuestaValidacion = {
      ...actual,
      ...dto,
      limiteCredito: condicionesPropuestas.limiteCredito,
      diasCredito: condicionesPropuestas.diasCredito,
      nivelRiesgo: condicionesPropuestas.nivelRiesgo,
      bloquearCreditoConSaldoVencido:
        condicionesPropuestas.bloquearCreditoConSaldoVencido,
      clasificacionHotelera: condicionesPropuestas.clasificacionHotelera,
    } as Partial<CrearClienteDto>;
    await this.validarNegocio(propuestaValidacion, empresaId, id);

    const cambiaSolicitud =
      incluyeCondiciones &&
      !this.sonMismasCondiciones(
        condicionesPropuestas,
        this.condicionesBaseComparacion(actual),
      );
    if (
      cambiaSolicitud &&
      condicionesPropuestas.limiteCredito > 0 &&
      condicionesPropuestas.diasCredito > 0
    ) {
      await this.aprobaciones.exigirConfiguracion(
        empresaId,
        'CREDITO_CLIENTE',
        condicionesPropuestas.limiteCredito,
      );
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repo = manager.getRepository(Cliente);
      const cliente = await repo
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where('cliente.id=:id AND cliente.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!cliente) throw new NotFoundException('Cliente no encontrado.');

      if (
        dto.tipoPersona &&
        dto.tipoPersona !== cliente.tipoPersona &&
        (Number(cliente.limiteCredito ?? 0) > 0 ||
          cliente.estadoSolicitudCredito === 'PENDIENTE' ||
          Boolean(cliente.clasificacionHotelera))
      ) {
        throw new ConflictException(
          'El expediente crediticio cambió mientras editabas. Actualiza la pantalla antes de modificar el tipo de persona.',
        );
      }

      const {
        limiteCredito: _limite,
        diasCredito: _dias,
        nivelRiesgo: _riesgo,
        bloquearCreditoConSaldoVencido: _bloqueo,
        clasificacionHotelera: _clasificacion,
        ...datosBasicos
      } = dto;
      Object.assign(cliente, datosBasicos);

      if (!incluyeCondiciones) {
        if (dto.tipoPersona === 'FISICA') cliente.clasificacionHotelera = null;
        return repo.save(cliente);
      }

      const condiciones = this.condicionesParaCliente(cliente, dto);
      if (
        this.sonMismasCondiciones(
          condiciones,
          this.condicionesBaseComparacion(cliente),
        )
      ) {
        return repo.save(cliente);
      }

      if (condiciones.limiteCredito <= 0 || condiciones.diasCredito <= 0) {
        if (
          Number(cliente.limiteCredito ?? 0) > 0 ||
          ['AUTORIZADO', 'SUSPENDIDO'].includes(cliente.estadoCredito)
        ) {
          throw new BadRequestException(
            'Una línea vigente no se elimina cambiando límite y plazo a cero. Usa la acción Suspender para conservar deuda, trazabilidad y convenios históricos.',
          );
        }
        await this.aprobaciones.cancelarPendientesEnTransaccion(
          manager,
          empresaId,
          'CREDITO_CLIENTE',
          cliente.id,
          'Solicitud cancelada porque el cliente quedó sin propuesta de crédito.',
        );
        this.limpiarSolicitudCredito(cliente, 'CANCELADA');
        cliente.creditoSolicitadoPorId = usuarioId;
        cliente.fechaSolicitudCredito = new Date();
        await repo.save(cliente);
        return cliente;
      }

      await this.aprobaciones.cancelarPendientesEnTransaccion(
        manager,
        empresaId,
        'CREDITO_CLIENTE',
        cliente.id,
        'Ciclo cancelado automáticamente porque cambió la propuesta de crédito.',
      );
      this.asignarSolicitudCredito(cliente, condiciones, usuarioId);
      await repo.save(cliente);
      await this.prepararSolicitudCreditoEnTransaccion(
        manager,
        cliente,
        empresaId,
        usuarioId,
      );
      return cliente;
    });
  }

  async gestionarCredito(
    id: string,
    dto: GestionarCreditoClienteDto,
    empresaId: string,
    usuarioId: string,
    rol: string,
  ) {
    const rolNormalizado = normalizarRol(rol);
    if (
      !esRolAdministrador(rol) &&
      !['FINANZAS', 'GERENCIA', 'DIRECCION'].includes(rolNormalizado)
    ) {
      throw new ForbiddenException(
        'Sólo Finanzas, Gerencia o un administrador pueden suspender o reenviar solicitudes de crédito.',
      );
    }

    const cliente = await this.obtenerPorId(id, empresaId);
    const comentario = dto.comentario?.trim() || null;

    if (dto.decision === 'REENVIAR') {
      if (cliente.estadoSolicitudCredito === 'PENDIENTE') {
        throw new BadRequestException(
          'La solicitud ya está en revisión. Debe resolverse desde la Bandeja central de aprobaciones.',
        );
      }
      if (
        !['RECHAZADA', 'CANCELADA'].includes(
          cliente.estadoSolicitudCredito ?? 'NINGUNA',
        ) &&
        cliente.estadoCredito !== 'SUSPENDIDO'
      ) {
        throw new BadRequestException(
          'Sólo una solicitud rechazada/cancelada o una línea suspendida puede enviarse nuevamente a aprobación.',
        );
      }
      const condiciones = this.condicionesParaReenvio(cliente);
      if (condiciones.limiteCredito <= 0 || condiciones.diasCredito <= 0) {
        throw new BadRequestException(
          'Configura una propuesta de límite y plazo mayores a cero antes de reenviar.',
        );
      }
      await this.aprobaciones.exigirConfiguracion(
        empresaId,
        'CREDITO_CLIENTE',
        condiciones.limiteCredito,
      );
      return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const bloqueado = await manager
          .getRepository(Cliente)
          .createQueryBuilder('cliente')
          .setLock('pessimistic_write')
          .where('cliente.id=:id AND cliente.empresaId=:empresaId', {
            id,
            empresaId,
          })
          .getOne();
        if (!bloqueado) throw new NotFoundException('Cliente no encontrado.');
        if (bloqueado.estadoSolicitudCredito === 'PENDIENTE') {
          throw new ConflictException(
            'Otro usuario ya reenvió la solicitud. Actualiza la pantalla.',
          );
        }
        const condicionesActuales = this.condicionesParaReenvio(bloqueado);
        await this.aprobaciones.cancelarPendientesEnTransaccion(
          manager,
          empresaId,
          'CREDITO_CLIENTE',
          bloqueado.id,
          'Ciclo anterior cancelado al reenviar la solicitud de crédito.',
        );
        this.asignarSolicitudCredito(
          bloqueado,
          condicionesActuales,
          usuarioId,
        );
        bloqueado.comentarioCredito = comentario;
        await manager.save(bloqueado);
        await this.prepararSolicitudCreditoEnTransaccion(
          manager,
          bloqueado,
          empresaId,
          usuarioId,
        );
        return bloqueado;
      });
    }

    if (cliente.estadoCredito !== 'AUTORIZADO') {
      throw new BadRequestException(
        'Sólo una línea autorizada puede suspenderse.',
      );
    }
    if (!comentario) {
      throw new BadRequestException(
        'Indica el motivo de la suspensión para conservar la trazabilidad.',
      );
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const bloqueado = await manager
        .getRepository(Cliente)
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where('cliente.id=:id AND cliente.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!bloqueado) throw new NotFoundException('Cliente no encontrado.');
      if (bloqueado.estadoCredito !== 'AUTORIZADO') {
        throw new ConflictException(
          'La línea cambió de estado mientras se procesaba la suspensión. Actualiza la pantalla.',
        );
      }
      await this.aprobaciones.cancelarPendientesEnTransaccion(
        manager,
        empresaId,
        'CREDITO_CLIENTE',
        bloqueado.id,
        `Solicitud cancelada por suspensión operativa: ${comentario}`,
      );
      if (bloqueado.estadoSolicitudCredito === 'PENDIENTE') {
        this.limpiarSolicitudCredito(bloqueado, 'CANCELADA');
      }
      bloqueado.estadoCredito = 'SUSPENDIDO';
      bloqueado.creditoResueltoPorId = usuarioId;
      bloqueado.fechaResolucionCredito = new Date();
      bloqueado.comentarioCredito = comentario;
      await manager.save(bloqueado);
      await this.suspenderConveniosClienteEnTransaccion(
        manager,
        empresaId,
        bloqueado.id,
        usuarioId,
        `Suspendido por crédito maestro: ${comentario}`,
      );
      return bloqueado;
    });
  }

  async toggleActivo(id: string, empresaId: string, usuarioId: string) {
    return this.dataSource.transaction(async (manager) => {
      const cliente = await manager
        .getRepository(Cliente)
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where('cliente.id=:id AND cliente.empresaId=:empresaId', { id, empresaId })
        .getOne();
      if (!cliente) throw new NotFoundException('Cliente no encontrado.');

      cliente.activo = !cliente.activo;
      if (!cliente.activo) {
        await this.aprobaciones.cancelarPendientesEnTransaccion(
          manager,
          empresaId,
          'CREDITO_CLIENTE',
          cliente.id,
          'Ciclo cancelado automáticamente porque el cliente fue desactivado.',
        );
        if (cliente.estadoSolicitudCredito === 'PENDIENTE') {
          this.limpiarSolicitudCredito(cliente, 'CANCELADA');
        }
        if (cliente.estadoCredito === 'AUTORIZADO') {
          cliente.estadoCredito = 'SUSPENDIDO';
        } else if (cliente.estadoCredito === 'EN_REVISION') {
          // Compatibilidad con expedientes creados antes del modelo maker-checker.
          cliente.estadoCredito = 'RECHAZADO';
        }
        cliente.creditoResueltoPorId = usuarioId;
        cliente.comentarioCredito =
          'Solicitud cancelada y línea suspendida automáticamente al desactivar al cliente.';
        cliente.fechaResolucionCredito = new Date();
      }
      await manager.save(cliente);
      if (!cliente.activo) {
        await this.suspenderConveniosClienteEnTransaccion(
          manager,
          empresaId,
          cliente.id,
          usuarioId,
          'Suspendido automáticamente: cliente inactivo.',
        );
      }
      return cliente;
    });
  }

  private incluyeCondicionesCredito(dto: Partial<CrearClienteDto>) {
    return CAMPOS_CREDITO.some((campo) =>
      Object.prototype.hasOwnProperty.call(dto, campo),
    );
  }

  private condicionesDesdeDto(
    dto: Partial<CrearClienteDto>,
  ): CondicionesSolicitudCredito {
    return {
      limiteCredito: Number(dto.limiteCredito ?? 0),
      diasCredito: Number(dto.diasCredito ?? 0),
      nivelRiesgo: dto.nivelRiesgo ?? 'MEDIO',
      bloquearCreditoConSaldoVencido:
        dto.bloquearCreditoConSaldoVencido !== false,
      clasificacionHotelera:
        dto.tipoPersona === 'FISICA'
          ? null
          : dto.clasificacionHotelera ?? null,
    };
  }

  /**
   * Obtiene la última propuesta conservada; cuando no existe, toma la línea
   * vigente. Esto permite editar/rechazar/reenviar sin destruir las condiciones
   * que ya habían sido autorizadas.
   */
  private condicionesBaseComparacion(
    cliente: Cliente,
  ): CondicionesSolicitudCredito {
    const existePropuesta =
      ['PENDIENTE', 'RECHAZADA', 'CANCELADA'].includes(
        cliente.estadoSolicitudCredito ?? 'NINGUNA',
      ) &&
      Number(cliente.limiteCreditoSolicitado ?? 0) > 0 &&
      Number(cliente.diasCreditoSolicitados ?? 0) > 0;

    if (existePropuesta) {
      return {
        limiteCredito: Number(cliente.limiteCreditoSolicitado ?? 0),
        diasCredito: Number(cliente.diasCreditoSolicitados ?? 0),
        nivelRiesgo:
          cliente.nivelRiesgoSolicitado ?? cliente.nivelRiesgo ?? 'MEDIO',
        bloquearCreditoConSaldoVencido:
          cliente.bloquearCreditoConSaldoVencidoSolicitado ??
          (cliente.bloquearCreditoConSaldoVencido !== false),
        clasificacionHotelera:
          cliente.tipoPersona === 'FISICA'
            ? null
            : cliente.clasificacionHoteleraSolicitada ??
              cliente.clasificacionHotelera ??
              null,
      };
    }

    return {
      limiteCredito: Number(cliente.limiteCredito ?? 0),
      diasCredito: Number(cliente.diasCredito ?? 0),
      nivelRiesgo: cliente.nivelRiesgo ?? 'MEDIO',
      bloquearCreditoConSaldoVencido:
        cliente.bloquearCreditoConSaldoVencido !== false,
      clasificacionHotelera:
        cliente.tipoPersona === 'FISICA'
          ? null
          : cliente.clasificacionHotelera ?? null,
    };
  }

  private condicionesParaCliente(
    cliente: Cliente,
    dto: Partial<CrearClienteDto>,
  ): CondicionesSolicitudCredito {
    const base = this.condicionesBaseComparacion(cliente);
    const tipoPersona = dto.tipoPersona ?? cliente.tipoPersona;
    return {
      limiteCredito:
        dto.limiteCredito !== undefined
          ? Number(dto.limiteCredito)
          : base.limiteCredito,
      diasCredito:
        dto.diasCredito !== undefined
          ? Number(dto.diasCredito)
          : base.diasCredito,
      nivelRiesgo: dto.nivelRiesgo ?? base.nivelRiesgo,
      bloquearCreditoConSaldoVencido:
        dto.bloquearCreditoConSaldoVencido !== undefined
          ? dto.bloquearCreditoConSaldoVencido
          : base.bloquearCreditoConSaldoVencido,
      clasificacionHotelera:
        tipoPersona === 'FISICA'
          ? null
          : dto.clasificacionHotelera !== undefined
            ? dto.clasificacionHotelera ?? null
            : base.clasificacionHotelera,
    };
  }

  private condicionesParaReenvio(
    cliente: Cliente,
  ): CondicionesSolicitudCredito {
    const condiciones = this.condicionesBaseComparacion(cliente);
    if (condiciones.limiteCredito > 0 && condiciones.diasCredito > 0) {
      return condiciones;
    }
    return {
      limiteCredito: Number(cliente.limiteCredito ?? 0),
      diasCredito: Number(cliente.diasCredito ?? 0),
      nivelRiesgo: cliente.nivelRiesgo ?? 'MEDIO',
      bloquearCreditoConSaldoVencido:
        cliente.bloquearCreditoConSaldoVencido !== false,
      clasificacionHotelera:
        cliente.tipoPersona === 'FISICA'
          ? null
          : cliente.clasificacionHotelera ?? null,
    };
  }

  private sonMismasCondiciones(
    izquierda: CondicionesSolicitudCredito,
    derecha: CondicionesSolicitudCredito,
  ) {
    return (
      Math.abs(izquierda.limiteCredito - derecha.limiteCredito) <= 0.009 &&
      izquierda.diasCredito === derecha.diasCredito &&
      izquierda.nivelRiesgo === derecha.nivelRiesgo &&
      izquierda.bloquearCreditoConSaldoVencido ===
        derecha.bloquearCreditoConSaldoVencido &&
      izquierda.clasificacionHotelera === derecha.clasificacionHotelera
    );
  }

  private asignarSolicitudCredito(
    cliente: Cliente,
    condiciones: CondicionesSolicitudCredito,
    usuarioId: string,
  ) {
    cliente.estadoSolicitudCredito = 'PENDIENTE';
    cliente.limiteCreditoSolicitado = condiciones.limiteCredito;
    cliente.diasCreditoSolicitados = condiciones.diasCredito;
    cliente.nivelRiesgoSolicitado = condiciones.nivelRiesgo;
    cliente.bloquearCreditoConSaldoVencidoSolicitado =
      condiciones.bloquearCreditoConSaldoVencido;
    cliente.clasificacionHoteleraSolicitada =
      condiciones.clasificacionHotelera;
    cliente.versionSolicitudCredito =
      Number(cliente.versionSolicitudCredito ?? 0) + 1;
    cliente.creditoSolicitadoPorId = usuarioId;
    cliente.fechaSolicitudCredito = new Date();
    cliente.creditoResueltoPorId = null;
    cliente.fechaResolucionCredito = null;
    cliente.comentarioCredito = null;
  }

  private limpiarSolicitudCredito(
    cliente: Cliente,
    estado: Cliente['estadoSolicitudCredito'],
  ) {
    cliente.estadoSolicitudCredito = estado;
    cliente.limiteCreditoSolicitado = null;
    cliente.diasCreditoSolicitados = null;
    cliente.nivelRiesgoSolicitado = null;
    cliente.bloquearCreditoConSaldoVencidoSolicitado = null;
    cliente.clasificacionHoteleraSolicitada = null;
  }

  private async prepararSolicitudCreditoEnTransaccion(
    manager: EntityManager,
    cliente: Cliente,
    empresaId: string,
    usuarioId: string,
  ) {
    if (
      cliente.estadoSolicitudCredito !== 'PENDIENTE' ||
      Number(cliente.limiteCreditoSolicitado ?? 0) <= 0 ||
      Number(cliente.diasCreditoSolicitados ?? 0) <= 0 ||
      Number(cliente.versionSolicitudCredito ?? 0) <= 0
    ) {
      throw new ConflictException(
        'La propuesta de crédito no está completa para iniciar el ciclo maker-checker.',
      );
    }

    await this.aprobaciones.prepararEnTransaccion(manager, {
      proceso: 'CREDITO_CLIENTE',
      documentoId: cliente.id,
      empresaId,
      solicitadoPorId: usuarioId,
      monto: Number(cliente.limiteCreditoSolicitado),
      documentoVersion: Number(cliente.versionSolicitudCredito),
      datosSolicitud: {
        limiteCredito: Number(cliente.limiteCreditoSolicitado),
        diasCredito: Number(cliente.diasCreditoSolicitados),
        nivelRiesgo:
          cliente.nivelRiesgoSolicitado ?? cliente.nivelRiesgo ?? 'MEDIO',
        bloquearCreditoConSaldoVencido:
          cliente.bloquearCreditoConSaldoVencidoSolicitado ?? true,
        clasificacionHotelera:
          cliente.clasificacionHoteleraSolicitada ?? null,
        versionSolicitudCredito: Number(cliente.versionSolicitudCredito),
        versionCreditoVigente: Number(cliente.versionCredito ?? 1),
        condicionesVigentes: {
          limiteCredito: Number(cliente.limiteCredito ?? 0),
          diasCredito: Number(cliente.diasCredito ?? 0),
          nivelRiesgo: cliente.nivelRiesgo ?? 'MEDIO',
          bloquearCreditoConSaldoVencido:
            cliente.bloquearCreditoConSaldoVencido !== false,
          clasificacionHotelera: cliente.clasificacionHotelera ?? null,
          estadoCredito: cliente.estadoCredito,
        },
      },
    });
  }

  private async suspenderConveniosClienteEnTransaccion(
    manager: EntityManager,
    empresaId: string,
    clienteId: string,
    usuarioId: string,
    motivo: string,
  ) {
    /*
     * ──────────────────────────────────────────────────────────────────────
     * DOS SENTENCIAS EN UNA LLAMADA: PostgreSQL NO LO PERMITE CON PARAMETROS
     *
     * Esto eran dos UPDATE separados por `;` dentro de un solo `query(...)` con
     * `$1..$4`. En SQL Server pasa; en PostgreSQL, en cuanto hay parametros se
     * usa el protocolo extendido, que acepta UNA sentencia por mensaje. El
     * servidor contesta «cannot insert multiple commands into a prepared
     * statement» y TypeORM lo envuelve en un 500 generico:
     *
     *   PATCH /api/clientes/<id>/estado
     *   → 500 «No se pudo completar la operación en la base de datos.»
     *
     * O sea: DESACTIVAR UN CLIENTE ERA IMPOSIBLE, con o sin convenios, porque
     * el error salta al preparar la sentencia y no al tocar filas. Y el mensaje
     * no decia nada: el motivo solo aparecia en el log del contenedor de
     * Postgres. Medido el 25-sep-2026.
     *
     * Es la misma familia que el `bind message supplies 2 parameters` del
     * cierre contable: sintaxis de SQL Server sobreviviendo a la mudanza.
     * Van separadas, y van dentro de la misma transaccion que las llama, asi
     * que siguen siendo atomicas.
     * ──────────────────────────────────────────────────────────────────────
     */
    const comentario = motivo.slice(0, 500);
    await manager.query(
      `UPDATE hoteleria_convenios_credito
          SET estado='SUSPENDIDO',
              comentarioResolucion=$3,
              suspendidoPorId=$4,
              fechaSuspension=CURRENT_TIMESTAMP,
              fechaActualizacion=CURRENT_TIMESTAMP
        WHERE empresaId=$1 AND clienteId=$2 AND estado='APROBADO'`,
      [empresaId, clienteId, comentario, usuarioId],
    );
    await manager.query(
      `UPDATE hoteleria_convenios_credito
          SET estado='CANCELADO',
              comentarioResolucion=$3,
              canceladoPorId=$4,
              fechaCancelacion=CURRENT_TIMESTAMP,
              fechaActualizacion=CURRENT_TIMESTAMP
        WHERE empresaId=$1 AND clienteId=$2 AND estado='PENDIENTE'`,
      [empresaId, clienteId, comentario, usuarioId],
    );
    await manager
      .getRepository(AprobacionDocumento)
      .createQueryBuilder()
      .update()
      .set({
        estado: 'CANCELADA',
        comentario: motivo.slice(0, 500),
        fechaResolucion: new Date(),
      })
      .where(
        `empresaId=:empresaId
         AND proceso='HOTEL_CONVENIO'
         AND documentoId IN (
           SELECT id FROM hoteleria_convenios_credito
            WHERE empresaId=:empresaId AND clienteId=:clienteId
         )
         AND estado='PENDIENTE'`,
        { empresaId, clienteId },
      )
      .execute();
  }

  private async validarNegocio(dto: Partial<CrearClienteDto>, empresaId: string, excluirId?: string) {
    const rfc = normalizarRfc(String(dto.rfc ?? ''));
    if (rfc) {
      // La regla del RFC vive en `common/utils/rfc.util`. Aquí estaba escrita a
      // mano, con su propia expresión regular, que no comprobaba que la fecha
      // del RFC existiera: `ABC130229XX1` pasaba.
      const veredicto = revisarRfcDeTipo(rfc, dto.tipoPersona ?? 'FISICA');
      if (!veredicto.valido) throw new BadRequestException(veredicto.motivo);
      const qb = this.clienteRepo.createQueryBuilder('c').where('c.empresaId=:empresaId', { empresaId }).andWhere('UPPER(c.rfc)=:rfc', { rfc });
      if (excluirId) qb.andWhere('c.id<>:excluirId', { excluirId });
      if (await qb.getOne()) throw new BadRequestException('Ya existe otro cliente con ese RFC.');
    }
    if (dto.clasificacionHotelera && dto.tipoPersona !== 'MORAL') {
      throw new BadRequestException(
        'La clasificación hotelera EMPRESA o AGENCIA sólo aplica a personas morales.',
      );
    }
    const limite = Number(dto.limiteCredito ?? 0), dias = Number(dto.diasCredito ?? 0);
    if ((limite > 0 && dias <= 0) || (dias > 0 && limite <= 0))
      throw new BadRequestException('El límite y los días de crédito deben configurarse juntos.');
  }

  private async validarUbicacion(dto: Partial<CrearClienteDto>) {
    if (dto.estadoId && !dto.paisId)
      throw new BadRequestException('Selecciona el país del estado.');
    if (!dto.paisId) return;
    const pais = await this.paisRepo.findOne({
      where: { id: dto.paisId, activo: true },
    });
    if (!pais) throw new BadRequestException('El país no existe o está inactivo.');
    if (dto.estadoId) {
      const estado = await this.estadoRepo.findOne({
        where: { id: dto.estadoId, paisId: dto.paisId, activo: true },
      });
      if (!estado)
        throw new BadRequestException(
          'El estado no pertenece al país seleccionado.',
        );
    }
  }
}
