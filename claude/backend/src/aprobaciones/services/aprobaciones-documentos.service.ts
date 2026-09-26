import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { AprobacionDocumento } from '../../compras/entities/aprobacion-documento.entity';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import {
  ConvenioCreditoHotel,
  EstadoConvenioHotel,
} from '../../hoteleria/entities/city-ledger.entity';
import { Hotel } from '../../hoteleria/entities/hotel.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';
import { ResolverAprobacionDocumentoDto } from '../dto/resolver-aprobacion-documento.dto';
import {
  PROCESOS_FINANCIEROS_CENTRALES,
  ProcesoFinancieroCentral,
  asignarRutaSegregada,
  diagnosticarEscalaFinanciera,
  seleccionarRutaAprobacion,
} from '../../compras/utils/rutas-aprobacion.util';
import { PoliticaCreditoService } from '../../common/services/politica-credito.service';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { CarteraPublicadorService } from '../../integracion/services/cartera-publicador.service';
import { EstadoEjecucion } from '../../integracion/validacion/validacion.constants';
import { MotorValidacionService } from '../../integracion/validacion/services/motor-validacion.service';

export const PROCESOS_APROBACION_CENTRAL =
  PROCESOS_FINANCIEROS_CENTRALES;

export type ProcesoAprobacionCentral = ProcesoFinancieroCentral;

/**
 * Roles que ven la traza completa sin ser administradores.
 *
 * Uno solo, y no por casualidad: `gobierno` es el rol que escribe la matriz de
 * aprobacion y tiene vedado `PATCH /aprobaciones/:id/resolver`. No se puede
 * gobernar lo que no se ve —el expediente de Maria Fernanda estuvo tres dias
 * parado y nadie lo miraba— y es seguro darselo precisamente porque no puede
 * actuar sobre nada de lo que ve. Esa es la posicion del auditor.
 *
 * Quien agregue un rol a esta lista esta ampliando quien lee expedientes
 * crediticios ajenos: nombre, RFC, limite y nivel de riesgo. Que sea un rol
 * que no pueda firmar nada no es un detalle, es la condicion.
 */
export const ROLES_CON_TRAZA_COMPLETA = ['gobierno'] as const;

/**
 * ¿Este rol ve la traza entera?
 *
 * Compara con `normalizarRol` en LOS DOS lados. La primera version comparaba
 * la lista en minusculas contra el rol ya normalizado —que sale en
 * MAYUSCULAS— asi que no acertaba nunca: `gobierno` entraba a su bandeja y el
 * historial le salia vacio, con la regla escrita, la prueba en verde y el
 * comportamiento al reves del disenado.
 *
 * Es literalmente el error contra el que avisa el comentario del guardia de
 * roles —«comparar literalmente haria que encender esto dejara gente fuera por
 * una mayuscula»— cometido un archivo mas alla. Por eso esto es una funcion
 * con su prueba y no una comparacion suelta en medio de una consulta.
 */
export function veTrazaCompleta(rol?: string): boolean {
  if (esRolAdministrador(rol)) return true;
  const mio = normalizarRol(rol);
  if (!mio) return false;
  return ROLES_CON_TRAZA_COMPLETA.map(normalizarRol).includes(mio);
}

type PrepararAprobacionInput = {
  proceso: ProcesoAprobacionCentral;
  documentoId: string;
  empresaId: string;
  solicitadoPorId: string;
  monto?: number;
  documentoVersion?: number;
  datosSolicitud?: Record<string, unknown>;
};

/**
 * Lo que la puerta de validación sabe de un cliente, en forma de dato.
 *
 * `bloquea` es la única pregunta que importa en los dos consumidores: la
 * bandeja apaga el botón, el resolutor lanza el conflicto. `mensaje` es el
 * texto que ve la persona en ambos sitios, de modo que la razón por la que no
 * se puede aprobar se lee antes y después de intentarlo, y es la misma.
 */
export type VeredictoValidacion = {
  exigida: boolean;
  flujo: string | null;
  estado:
    | 'SIN_FLUJO'
    | 'SIN_EXPEDIENTE'
    | 'RECHAZADA'
    /** El expediente existe pero no concluyo favorable: EN_PROCESO o REVISION_MANUAL. */
    | 'NO_CONCLUIDO'
    | 'IMPORTE_INSUFICIENTE'
    | 'FAVORABLE';
  estadoExpediente: string | null;
  limiteValidado: number | null;
  limiteSolicitado: number;
  motivos: string[];
  bloquea: boolean;
  mensaje: string | null;
};

type UsuarioResolutor = {
  id: string;
  rol: string;
};

const leerSnapshot = (texto?: string | null): Record<string, unknown> => {
  try {
    return texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

@Injectable()
export class AprobacionesDocumentosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AprobacionDocumento)
    private readonly aprobaciones: Repository<AprobacionDocumento>,
    @InjectRepository(ConfiguracionAprobacion)
    private readonly configuraciones: Repository<ConfiguracionAprobacion>,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
    @InjectRepository(ConvenioCreditoHotel)
    private readonly convenios: Repository<ConvenioCreditoHotel>,
    @InjectRepository(Hotel)
    private readonly hoteles: Repository<Hotel>,
    private readonly politicaCredito: PoliticaCreditoService,
    private readonly cartera: CarteraPublicadorService,
    private readonly validacion: MotorValidacionService,
  ) {}

  async exigirConfiguracion(
    empresaId: string,
    proceso: ProcesoAprobacionCentral,
    monto = 0,
  ) {
    const configuraciones = await this.configuraciones.find({
      where: { empresaId, proceso, activo: true },
      order: { orden: 'ASC' },
    });
    const erroresMatriz = diagnosticarEscalaFinanciera(configuraciones);
    if (erroresMatriz.length) {
      throw new BadRequestException(
        `La matriz ${proceso} es incoherente: ${erroresMatriz.join(' ')}`,
      );
    }
    const ruta = seleccionarRutaAprobacion(configuraciones, proceso, monto);
    if (!ruta.length) {
      throw new BadRequestException(
        `Configura el flujo ${proceso} en Gobierno de aprobaciones antes de solicitarlo.`,
      );
    }
  }

  preparar(input: PrepararAprobacionInput) {
    return this.dataSource.transaction((manager) =>
      this.prepararEnTransaccion(manager, input),
    );
  }

  async cancelarPendientesEnTransaccion(
    manager: EntityManager,
    empresaId: string,
    proceso: ProcesoAprobacionCentral,
    documentoId: string,
    comentario: string,
  ) {
    await manager
      .getRepository(AprobacionDocumento)
      .createQueryBuilder()
      .update()
      .set({
        estado: 'CANCELADA',
        comentario: comentario.trim().slice(0, 500),
        fechaResolucion: new Date(),
      })
      .where(
        'empresaId=:empresaId AND proceso=:proceso AND documentoId=:documentoId AND estado=:estado',
        { empresaId, proceso, documentoId, estado: 'PENDIENTE' },
      )
      .execute();
  }

  async prepararEnTransaccion(
    manager: EntityManager,
    input: PrepararAprobacionInput,
  ) {
    const monto = Number(input.monto ?? 0);
    const repoConfig = manager.getRepository(ConfiguracionAprobacion);
    const repoAprobacion = manager.getRepository(AprobacionDocumento);

    const configuraciones = await repoConfig
      .createQueryBuilder('config')
      .where(
        'config.empresaId=:empresaId AND config.proceso=:proceso AND config.activo=true',
        { empresaId: input.empresaId, proceso: input.proceso },
      )
      .orderBy('config.orden', 'ASC')
      .getMany();
    const erroresMatriz = diagnosticarEscalaFinanciera(configuraciones);
    if (erroresMatriz.length) {
      throw new ConflictException(
        `La matriz ${input.proceso} es incoherente: ${erroresMatriz.join(' ')}`,
      );
    }
    const configuracion = seleccionarRutaAprobacion(
      configuraciones,
      input.proceso,
      monto,
    );

    if (!configuracion.length) {
      throw new BadRequestException(
        `No existe una ruta de aprobación ${input.proceso} aplicable al importe ${monto.toFixed(2)}.`,
      );
    }

    const ordenes = configuracion.map((nivel) => nivel.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      throw new ConflictException(
        `La ruta ${input.proceso} tiene niveles duplicados.`,
      );
    }

    if (
      configuracion.some(
        (nivel) =>
          nivel.usuarioId === input.solicitadoPorId &&
          !nivel.permiteAutoaprobacion,
      )
    ) {
      throw new ConflictException(
        'El solicitante está asignado como aprobador específico en un nivel que no permite autoaprobación.',
      );
    }

    const usuariosActivos = await manager.getRepository(Usuario).find({
      where: { empresaId: input.empresaId, activo: true },
      select: { id: true, rol: true },
      order: { id: 'ASC' },
    });
    for (const nivel of configuracion) {
      if (nivel.usuarioId) {
        const aprobadorActivo = usuariosActivos.some(
          (usuario) => usuario.id === nivel.usuarioId,
        );
        if (!aprobadorActivo) {
          throw new ConflictException(
            `El usuario asignado al nivel ${nivel.orden} está inactivo o ya no pertenece a la empresa. Corrige la matriz antes de solicitar aprobación.`,
          );
        }
        continue;
      }
      if (!nivel.rolAprobador?.trim()) {
        throw new ConflictException(
          `El nivel ${nivel.orden} no tiene usuario ni rol aprobador.`,
        );
      }
      const rolNivel = normalizarRol(nivel.rolAprobador);
      const candidatos = usuariosActivos.filter(
        (usuario) => normalizarRol(usuario.rol) === rolNivel,
      );
      if (!candidatos.length) {
        throw new ConflictException(
          `No existe un usuario activo con el rol ${nivel.rolAprobador} para atender el nivel ${nivel.orden}.`,
        );
      }
      if (
        !nivel.permiteAutoaprobacion &&
        !candidatos.some((usuario) => usuario.id !== input.solicitadoPorId)
      ) {
        throw new ConflictException(
          `El nivel ${nivel.orden} requiere el rol ${nivel.rolAprobador}, pero el solicitante es la única persona activa con ese rol y la autoaprobación está deshabilitada.`,
        );
      }
    }

    const candidatosPorNivel = configuracion.map((nivel) => ({
      orden: nivel.orden,
      candidatos: nivel.usuarioId
        ? [nivel.usuarioId]
        : usuariosActivos
            .filter(
              (usuario) =>
                normalizarRol(usuario.rol) ===
                normalizarRol(nivel.rolAprobador),
            )
            .map((usuario) => usuario.id),
    }));
    const asignacionSegregada = asignarRutaSegregada(candidatosPorNivel, [
      input.solicitadoPorId,
    ]);
    if (!asignacionSegregada) {
      throw new ConflictException(
        'La ruta no puede completarse con aprobadores distintos del solicitante en todos los niveles. Corrige la matriz o agrega personal activo.',
      );
    }

    const pendiente = await repoAprobacion.count({
      where: {
        empresaId: input.empresaId,
        proceso: input.proceso,
        documentoId: input.documentoId,
        estado: 'PENDIENTE',
      },
    });
    if (pendiente) {
      throw new ConflictException(
        'El documento ya tiene un ciclo de aprobación pendiente.',
      );
    }

    const maximo = await repoAprobacion
      .createQueryBuilder('aprobacion')
      .select('COALESCE(MAX(aprobacion.ciclo),0)', 'ciclo')
      .where(
        'aprobacion.empresaId=:empresaId AND aprobacion.proceso=:proceso AND aprobacion.documentoId=:documentoId',
        input,
      )
      .getRawOne<{ ciclo: string | number }>();
    const ciclo = Number(maximo?.ciclo ?? 0) + 1;

    const ahora = Date.now();
    const registros = configuracion.map((nivel, indice) =>
      repoAprobacion.create({
        empresaId: input.empresaId,
        proceso: input.proceso,
        documentoId: input.documentoId,
        ciclo,
        // Los rangos de importe pueden excluir niveles intermedios. La ruta
        // efectiva siempre se renumera 1..N para conservar una secuencia válida.
        nivel: indice + 1,
        // La persona se materializa al abrir el ciclo. Esto evita que un
        // candidato de rol atienda un nivel y deje imposible completar otro
        // nivel que dependía exclusivamente de esa misma persona.
        usuarioAprobadorId:
          nivel.usuarioId ?? asignacionSegregada.get(nivel.orden),
        rolAprobador: nivel.rolAprobador
          ? normalizarRol(nivel.rolAprobador)
          : undefined,
        estado: 'PENDIENTE',
        solicitadoPorId: input.solicitadoPorId,
        tiempoLimiteHoras: nivel.tiempoLimiteHoras || 24,
        documentoVersion: Number(input.documentoVersion ?? 1),
        datosSolicitud: input.datosSolicitud
          ? JSON.stringify(input.datosSolicitud)
          : null,
        importeSolicitado: monto,
        obligatorio: nivel.obligatorio !== false,
        permiteAutoaprobacion: nivel.permiteAutoaprobacion === true,
        // El SLA inicia cuando el nivel se vuelve atendible. Los niveles
        // posteriores permanecen sin fecha hasta que se aprueba el anterior.
        fechaVencimiento:
          indice === 0
            ? new Date(
                ahora + (nivel.tiempoLimiteHoras || 24) * 3_600_000,
              )
            : null,
      }),
    );
    return repoAprobacion.save(registros);
  }

  async listarPendientes(
    empresaId: string,
    usuarioId: string,
    rol: string,
  ) {
    const candidatas = await this.aprobaciones
      .createQueryBuilder('aprobacion')
      .where('aprobacion.empresaId=:empresaId', { empresaId })
      .andWhere('aprobacion.estado=:estado', { estado: 'PENDIENTE' })
      .andWhere('aprobacion.proceso IN (:...procesos)', {
        procesos: [...PROCESOS_APROBACION_CENTRAL],
      })
      .orderBy('aprobacion.fechaCreacion', 'ASC')
      .addOrderBy('aprobacion.ciclo', 'ASC')
      .addOrderBy('aprobacion.nivel', 'ASC')
      .getMany();

    const primeras = new Map<string, AprobacionDocumento>();
    for (const aprobacion of candidatas) {
      const clave = `${aprobacion.proceso}:${aprobacion.documentoId}:${aprobacion.ciclo}`;
      if (!primeras.has(clave)) primeras.set(clave, aprobacion);
    }

    const rolNormalizado = normalizarRol(rol);
    const visibles = [...primeras.values()].filter((aprobacion) => {
      if (aprobacion.usuarioAprobadorId) {
        return aprobacion.usuarioAprobadorId === usuarioId;
      }
      return normalizarRol(aprobacion.rolAprobador) === rolNormalizado;
    });

    const clienteIds = visibles
      .filter((item) => item.proceso === 'CREDITO_CLIENTE')
      .map((item) => item.documentoId);
    const convenioIds = visibles
      .filter((item) => item.proceso === 'HOTEL_CONVENIO')
      .map((item) => item.documentoId);

    const clientes = clienteIds.length
      ? await this.clientes.find({
          where: { empresaId, id: In(clienteIds) },
        })
      : [];
    const convenios = convenioIds.length
      ? await this.convenios.find({
          where: { empresaId, id: In(convenioIds) },
        })
      : [];
    const hotelesIds = [...new Set(convenios.map((item) => item.hotelId))];
    const hoteles = hotelesIds.length
      ? await this.hoteles.find({
          where: { empresaId, id: In(hotelesIds) },
        })
      : [];

    const porCliente = new Map(clientes.map((item) => [item.id, item]));
    const porConvenio = new Map(convenios.map((item) => [item.id, item]));
    const porHotel = new Map(hoteles.map((item) => [item.id, item]));
    const idsExposicion = [
      ...new Set([
        ...clienteIds,
        ...convenios.map((convenio) => convenio.clienteId),
      ]),
    ];
    const exposiciones = await Promise.all(
      idsExposicion.map(async (clienteId) => {
        try {
          return [
            clienteId,
            await this.politicaCredito.obtenerResumen(empresaId, clienteId),
          ] as const;
        } catch {
          return [clienteId, null] as const;
        }
      }),
    );
    const exposicionPorCliente = new Map(exposiciones);
    /*
     * El mismo veredicto que aplicará el resolutor, calculado aquí para que la
     * tarjeta pueda decirlo antes de que nadie pulse nada.
     */
    const veredictos = new Map(
      await Promise.all(
        visibles
          .filter((item) => item.proceso === 'CREDITO_CLIENTE')
          .map(async (item) => {
            const snapshot = leerSnapshot(item.datosSolicitud);
            const limite = Number(
              snapshot.limiteCredito ?? item.importeSolicitado ?? 0,
            );
            try {
              return [
                item.id,
                await this.evaluarValidacion(empresaId, item.documentoId, limite),
              ] as const;
            } catch {
              return [item.id, null] as const;
            }
          }),
      ),
    );


    return visibles.map((aprobacion) => {
      const snapshot = leerSnapshot(aprobacion.datosSolicitud);
      if (aprobacion.proceso === 'CREDITO_CLIENTE') {
        const cliente = porCliente.get(aprobacion.documentoId);
        const limiteSolicitado = Number(
          snapshot.limiteCredito ?? aprobacion.importeSolicitado ?? 0,
        );
        const diasSolicitados = Number(snapshot.diasCredito ?? 0);
        const versionSolicitud = Number(
          snapshot.versionSolicitudCredito ?? aprobacion.documentoVersion ?? 0,
        );
        return {
          ...aprobacion,
          titulo:
            cliente?.razonSocial ||
            cliente?.nombre ||
            'Cliente no disponible',
          subtitulo: `Cambio de crédito · ${limiteSolicitado.toFixed(2)} · ${diasSolicitados} días`,
          importe: limiteSolicitado,
          estadoDocumento: cliente
            ? `${cliente.estadoCredito} / ${cliente.estadoSolicitudCredito}`
            : 'NO_DISPONIBLE',
          datos: cliente
            ? {
                clienteId: cliente.id,
                rfc: cliente.rfc,
                limiteCredito: limiteSolicitado,
                diasCredito: diasSolicitados,
                nivelRiesgo:
                  snapshot.nivelRiesgo ?? cliente.nivelRiesgoSolicitado,
                bloquearCreditoConSaldoVencido:
                  snapshot.bloquearCreditoConSaldoVencido ??
                  cliente.bloquearCreditoConSaldoVencidoSolicitado,
                clasificacionHotelera:
                  snapshot.clasificacionHotelera ??
                  cliente.clasificacionHoteleraSolicitada ??
                  null,
                versionSolicitudCredito: versionSolicitud,
                validacion: veredictos.get(aprobacion.id) ?? null,
                condicionesVigentes: {
                  estadoCredito: cliente.estadoCredito,
                  limiteCredito: Number(cliente.limiteCredito ?? 0),
                  diasCredito: Number(cliente.diasCredito ?? 0),
                  nivelRiesgo: cliente.nivelRiesgo,
                  bloquearCreditoConSaldoVencido:
                    cliente.bloquearCreditoConSaldoVencido !== false,
                  clasificacionHotelera:
                    cliente.clasificacionHotelera ?? null,
                  versionCredito: Number(cliente.versionCredito ?? 1),
                },
                exposicionActual: (() => {
                  const exposicion = exposicionPorCliente.get(cliente.id);
                  if (!exposicion) return null;
                  return {
                    saldoVentas: exposicion.saldoVentas,
                    saldoHotel: exposicion.saldoHotel,
                    utilizado: exposicion.utilizado,
                    vencido: exposicion.vencido,
                    disponibleAlAutorizar: Math.max(
                      0,
                      Math.round(
                        (limiteSolicitado - exposicion.utilizado) * 100,
                      ) / 100,
                    ),
                    excedenteSobreLimite: Math.max(
                      0,
                      Math.round(
                        (exposicion.utilizado - limiteSolicitado) * 100,
                      ) / 100,
                    ),
                  };
                })(),
                condicionesActualesCoinciden:
                  cliente.estadoSolicitudCredito === 'PENDIENTE' &&
                  Number(cliente.versionSolicitudCredito ?? 0) ===
                    versionSolicitud &&
                  Math.abs(
                    Number(cliente.limiteCreditoSolicitado ?? 0) -
                      limiteSolicitado,
                  ) <= 0.009 &&
                  Number(cliente.diasCreditoSolicitados ?? 0) ===
                    diasSolicitados &&
                  (cliente.nivelRiesgoSolicitado ?? null) ===
                    (snapshot.nivelRiesgo ?? null) &&
                  (cliente.bloquearCreditoConSaldoVencidoSolicitado ?? null) ===
                    (snapshot.bloquearCreditoConSaldoVencido ?? null) &&
                  (cliente.clasificacionHoteleraSolicitada ?? null) ===
                    (snapshot.clasificacionHotelera ?? null),
              }
            : null,
        };
      }
      const convenio = porConvenio.get(aprobacion.documentoId);
      const hotel = convenio ? porHotel.get(convenio.hotelId) : undefined;
      return {
        ...aprobacion,
        titulo: convenio?.nombreComercial || 'Convenio no disponible',
        subtitulo: `${hotel?.nombre || 'Hotel'} · ${convenio?.tipo || ''} · ${convenio?.numeroConvenio || ''}`,
        importe: Number(
          aprobacion.importeSolicitado ?? convenio?.limiteCredito ?? 0,
        ),
        estadoDocumento: convenio?.estado ?? 'NO_DISPONIBLE',
        datos: convenio
          ? {
              convenioId: convenio.id,
              hotelId: convenio.hotelId,
              hotel: hotel?.nombre,
              clienteId: convenio.clienteId,
              numeroConvenio: convenio.numeroConvenio,
              tipo: convenio.tipo,
              limiteCredito: Number(
                snapshot.limiteCredito ?? convenio.limiteCredito,
              ),
              diasCredito: Number(
                snapshot.diasCredito ?? convenio.diasCredito,
              ),
              vigenciaDesde:
                snapshot.vigenciaDesde ?? convenio.vigenciaDesde,
              vigenciaHasta:
                snapshot.vigenciaHasta ?? convenio.vigenciaHasta,
              bloquearConSaldoVencido:
                snapshot.bloquearConSaldoVencido ??
                convenio.bloquearConSaldoVencido,
              versionCreditoCliente:
                snapshot.versionCreditoCliente ??
                convenio.versionCreditoCliente,
              exposicionActual: (() => {
                const exposicion = exposicionPorCliente.get(convenio.clienteId);
                if (!exposicion) return null;
                return {
                  saldoVentas: exposicion.saldoVentas,
                  saldoHotel: exposicion.saldoHotel,
                  utilizado: exposicion.utilizado,
                  vencido: exposicion.vencido,
                  disponible: exposicion.disponible,
                };
              })(),
              versionConvenio: aprobacion.documentoVersion,
              condicionesActualesCoinciden:
                Number(convenio.version ?? 1) ===
                  Number(aprobacion.documentoVersion ?? 1) &&
                Number(snapshot.versionCreditoCliente ?? convenio.versionCreditoCliente ?? 1) ===
                  Number(convenio.versionCreditoCliente ?? 1),
            }
          : null,
      };
    });
  }

  /**
   * Historial de decisiones, recortado a lo que la persona puede ver.
   *
   * Antes recibia SOLO empresaId: devolvia TODAS las aprobaciones de la
   * empresa a cualquiera que alcanzara el endpoint. Verificado en vivo el
   * 21-sep-2026 con el usuario de Compras: leia una solicitud de credito de
   * cliente con nombre, RFC, limite de $20,000, dias de credito y nivel de
   * riesgo. Comprar no da derecho a leer el expediente crediticio de nadie.
   *
   * `listarPendientes` ya filtraba correctamente por asignado o por rol
   * aprobador; el historial simplemente no lo hacia. La regla es la misma,
   * mas lo propio: uno ve lo que le toca firmar, lo que pidio y lo que
   * resolvio. La administracion ve todo, porque la trazabilidad completa es
   * justamente su trabajo.
   *
   * El filtro se aplica en memoria y no en SQL a proposito: la autoridad la
   * decide normalizarRol(), y reimplementar esa normalizacion en SQL es
   * exactamente como se abren estos huecos. Por eso se trae una ventana
   * acotada y se recorta despues.
   */
  async listarHistorial(
    empresaId: string,
    limite = 100,
    usuarioId?: string,
    rol?: string,
  ) {
    const tope = Math.min(500, Math.max(1, Number(limite || 100)));
    const rolNormalizado = normalizarRol(rol);
    const veTodo = veTrazaCompleta(rol);

    const ventana = await this.aprobaciones
      .createQueryBuilder('aprobacion')
      .where('aprobacion.empresaId=:empresaId', { empresaId })
      .andWhere('aprobacion.proceso IN (:...procesos)', {
        procesos: [...PROCESOS_APROBACION_CENTRAL],
      })
      .orderBy('aprobacion.fechaCreacion', 'DESC')
      .addOrderBy('aprobacion.ciclo', 'DESC')
      .addOrderBy('aprobacion.nivel', 'ASC')
      .take(veTodo ? tope : Math.max(tope, 2000))
      .getMany();

    const registros = (
      veTodo
        ? ventana
        : ventana.filter(
            (aprobacion) =>
              (usuarioId !== undefined &&
                (aprobacion.usuarioAprobadorId === usuarioId ||
                  aprobacion.solicitadoPorId === usuarioId ||
                  aprobacion.resueltoPorId === usuarioId)) ||
              (rolNormalizado !== '' &&
                normalizarRol(aprobacion.rolAprobador) === rolNormalizado),
          )
    ).slice(0, tope);

    if (!registros.length) return [];

    const usuarioIds = [
      ...new Set(
        registros
          .flatMap((item) => [
            item.solicitadoPorId,
            item.usuarioAprobadorId,
            item.resueltoPorId,
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const usuarios = usuarioIds.length
      ? await this.dataSource.getRepository(Usuario).find({
          where: { empresaId, id: In(usuarioIds) },
          select: { id: true, nombreCompleto: true, rol: true },
        })
      : [];
    const usuarioPorId = new Map(usuarios.map((item) => [item.id, item]));

    const clienteIds = [
      ...new Set(
        registros
          .filter((item) => item.proceso === 'CREDITO_CLIENTE')
          .map((item) => item.documentoId),
      ),
    ];
    const convenioIds = [
      ...new Set(
        registros
          .filter((item) => item.proceso === 'HOTEL_CONVENIO')
          .map((item) => item.documentoId),
      ),
    ];
    const [clientes, convenios] = await Promise.all([
      clienteIds.length
        ? this.clientes.find({ where: { empresaId, id: In(clienteIds) } })
        : Promise.resolve([]),
      convenioIds.length
        ? this.convenios.find({ where: { empresaId, id: In(convenioIds) } })
        : Promise.resolve([]),
    ]);
    const hotelIds = [...new Set(convenios.map((item) => item.hotelId))];
    const hoteles = hotelIds.length
      ? await this.hoteles.find({ where: { empresaId, id: In(hotelIds) } })
      : [];
    const clientePorId = new Map(clientes.map((item) => [item.id, item]));
    const convenioPorId = new Map(convenios.map((item) => [item.id, item]));
    const hotelPorId = new Map(hoteles.map((item) => [item.id, item]));

    return registros.map((item) => {
      const solicitante = usuarioPorId.get(item.solicitadoPorId);
      const resolutor = item.resueltoPorId
        ? usuarioPorId.get(item.resueltoPorId)
        : undefined;
      const asignado = item.usuarioAprobadorId
        ? usuarioPorId.get(item.usuarioAprobadorId)?.nombreCompleto ||
          'Usuario no disponible'
        : item.rolAprobador || 'Sin asignación';

      if (item.proceso === 'CREDITO_CLIENTE') {
        const cliente = clientePorId.get(item.documentoId);
        return {
          ...item,
          datosSolicitud: leerSnapshot(item.datosSolicitud),
          titulo:
            cliente?.razonSocial || cliente?.nombre || 'Cliente no disponible',
          subtitulo: cliente?.rfc
            ? `Crédito de cliente · RFC ${cliente.rfc}`
            : 'Crédito de cliente',
          solicitadoPor: solicitante?.nombreCompleto || 'Usuario no disponible',
          asignadoA: asignado,
          resueltoPor: resolutor?.nombreCompleto || null,
        };
      }

      const convenio = convenioPorId.get(item.documentoId);
      const hotel = convenio ? hotelPorId.get(convenio.hotelId) : undefined;
      return {
        ...item,
        datosSolicitud: leerSnapshot(item.datosSolicitud),
        titulo: convenio?.nombreComercial || 'Convenio no disponible',
        subtitulo: `${hotel?.nombre || 'Hotel no disponible'} · ${
          convenio?.numeroConvenio || 'Sin número'
        }`,
        solicitadoPor: solicitante?.nombreCompleto || 'Usuario no disponible',
        asignadoA: asignado,
        resueltoPor: resolutor?.nombreCompleto || null,
      };
    });
  }

  async resolver(
    id: string,
    dto: ResolverAprobacionDocumentoDto,
    empresaId: string,
    usuario: UsuarioResolutor,
  ) {
    if (dto.estado === 'RECHAZADA' && !dto.comentario?.trim()) {
      throw new BadRequestException(
        'El motivo es obligatorio para rechazar una solicitud.',
      );
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repo = manager.getRepository(AprobacionDocumento);
      const aprobacion = await repo
        .createQueryBuilder('aprobacion')
        .setLock('pessimistic_write')
        .where('aprobacion.id=:id AND aprobacion.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!aprobacion) throw new NotFoundException('Aprobación no encontrada.');
      if (!PROCESOS_APROBACION_CENTRAL.includes(aprobacion.proceso as any)) {
        throw new BadRequestException(
          'Este proceso se resuelve desde su módulo especializado.',
        );
      }
      if (aprobacion.estado !== 'PENDIENTE') {
        throw new ConflictException('La aprobación ya fue resuelta.');
      }

      const siguiente = await repo.findOne({
        where: {
          empresaId,
          proceso: aprobacion.proceso,
          documentoId: aprobacion.documentoId,
          ciclo: aprobacion.ciclo,
          estado: 'PENDIENTE',
        },
        order: { nivel: 'ASC' },
      });
      if (!siguiente || siguiente.id !== aprobacion.id) {
        throw new ConflictException(
          'Existe un nivel anterior pendiente. Las aprobaciones son secuenciales.',
        );
      }

      await this.validarDocumentoVigente(manager, aprobacion);
      this.validarResolutor(aprobacion, usuario);
      const nivelesPreviosDelMismoUsuario = await repo.count({
        where: {
          empresaId,
          proceso: aprobacion.proceso,
          documentoId: aprobacion.documentoId,
          ciclo: aprobacion.ciclo,
          resueltoPorId: usuario.id,
          estado: 'APROBADA',
        },
      });
      if (nivelesPreviosDelMismoUsuario) {
        throw new ForbiddenException(
          'Una misma persona no puede resolver más de un nivel del mismo ciclo de aprobación.',
        );
      }
      aprobacion.estado = dto.estado;
      aprobacion.resueltoPorId = usuario.id;
      aprobacion.fechaResolucion = new Date();
      aprobacion.comentario = dto.comentario?.trim() || null;
      await repo.save(aprobacion);

      if (dto.estado === 'RECHAZADA') {
        await repo
          .createQueryBuilder()
          .update()
          .set({
            estado: 'CANCELADA',
            fechaResolucion: new Date(),
            comentario: `Cancelada automáticamente por rechazo en el nivel ${aprobacion.nivel}.`,
          })
          .where(
            'empresaId=:empresaId AND proceso=:proceso AND documentoId=:documentoId AND ciclo=:ciclo AND estado=:estado',
            {
              empresaId,
              proceso: aprobacion.proceso,
              documentoId: aprobacion.documentoId,
              ciclo: aprobacion.ciclo,
              estado: 'PENDIENTE',
            },
          )
          .execute();
        await this.finalizarDocumento(
          manager,
          aprobacion,
          false,
          usuario.id,
          dto.comentario,
        );
        return { aprobacion, procesoCompletado: true, resultado: 'RECHAZADO' };
      }

      const proximoNivel = await repo.findOne({
        where: {
          empresaId,
          proceso: aprobacion.proceso,
          documentoId: aprobacion.documentoId,
          ciclo: aprobacion.ciclo,
          estado: 'PENDIENTE',
        },
        order: { nivel: 'ASC' },
      });
      if (proximoNivel) {
        if (!proximoNivel.fechaVencimiento) {
          proximoNivel.fechaVencimiento = new Date(
            Date.now() +
              Number(proximoNivel.tiempoLimiteHoras || 24) * 3_600_000,
          );
          await repo.save(proximoNivel);
        }
        return {
          aprobacion,
          procesoCompletado: false,
          resultado: dto.estado,
          siguienteNivel: proximoNivel.nivel,
          siguienteVence: proximoNivel.fechaVencimiento,
        };
      }

      await this.finalizarDocumento(
        manager,
        aprobacion,
        true,
        usuario.id,
        dto.comentario,
      );
      return { aprobacion, procesoCompletado: true, resultado: 'APROBADO' };
    });
  }

  private validarResolutor(
    aprobacion: AprobacionDocumento,
    usuario: UsuarioResolutor,
  ) {
    if (
      aprobacion.solicitadoPorId === usuario.id &&
      !aprobacion.permiteAutoaprobacion
    ) {
      throw new ForbiddenException(
        'Quien solicita no puede resolver este nivel porque la autoaprobación está deshabilitada.',
      );
    }
    if (
      aprobacion.usuarioAprobadorId &&
      aprobacion.usuarioAprobadorId !== usuario.id
    ) {
      throw new ForbiddenException('Esta aprobación está asignada a otro usuario.');
    }
    if (
      !aprobacion.usuarioAprobadorId &&
      normalizarRol(aprobacion.rolAprobador) !== normalizarRol(usuario.rol)
    ) {
      throw new ForbiddenException('Tu rol no corresponde al nivel pendiente.');
    }
  }

  private async validarDocumentoVigente(
    manager: EntityManager,
    aprobacion: AprobacionDocumento,
  ) {
    if (aprobacion.proceso === 'CREDITO_CLIENTE') {
      const cliente = await manager.getRepository(Cliente).findOne({
        where: {
          id: aprobacion.documentoId,
          empresaId: aprobacion.empresaId,
        },
      });
      if (
        !cliente ||
        !cliente.activo ||
        cliente.estadoSolicitudCredito !== 'PENDIENTE'
      ) {
        throw new ConflictException(
          'La propuesta de crédito ya no está vigente. Actualiza la bandeja.',
        );
      }

      const snapshot = leerSnapshot(aprobacion.datosSolicitud);
      const versionSolicitud = Number(
        snapshot.versionSolicitudCredito ?? aprobacion.documentoVersion ?? 0,
      );
      const limiteSolicitado = Number(
        snapshot.limiteCredito ?? aprobacion.importeSolicitado ?? 0,
      );
      const diasSolicitados = Number(snapshot.diasCredito ?? 0);
      const riesgoSolicitado = snapshot.nivelRiesgo ?? null;
      const bloqueoSolicitado =
        snapshot.bloquearCreditoConSaldoVencido ?? null;
      const clasificacionSolicitada =
        snapshot.clasificacionHotelera ?? null;

      if (
        Number(cliente.versionSolicitudCredito ?? 0) !== versionSolicitud ||
        Number(aprobacion.documentoVersion ?? 0) !== versionSolicitud
      ) {
        throw new ConflictException(
          'La propuesta cambió después de iniciar el ciclo. Debe generarse una nueva aprobación.',
        );
      }
      if (
        limiteSolicitado <= 0 ||
        diasSolicitados <= 0 ||
        Math.abs(
          Number(cliente.limiteCreditoSolicitado ?? 0) - limiteSolicitado,
        ) > 0.009 ||
        Number(cliente.diasCreditoSolicitados ?? 0) !== diasSolicitados ||
        (cliente.nivelRiesgoSolicitado ?? null) !== riesgoSolicitado ||
        (cliente.bloquearCreditoConSaldoVencidoSolicitado ?? null) !==
          bloqueoSolicitado ||
        (cliente.clasificacionHoteleraSolicitada ?? null) !==
          clasificacionSolicitada
      ) {
        throw new ConflictException(
          'Las condiciones propuestas ya no coinciden con el ciclo. Cancela el ciclo y envía una nueva solicitud.',
        );
      }
      if (
        cliente.tipoPersona !== 'MORAL' &&
        clasificacionSolicitada !== null
      ) {
        throw new ConflictException(
          'Una persona física no puede recibir clasificación hotelera EMPRESA o AGENCIA.',
        );
      }
      return;
    }

    const convenio = await manager.getRepository(ConvenioCreditoHotel).findOne({
      where: {
        id: aprobacion.documentoId,
        empresaId: aprobacion.empresaId,
      },
    });
    if (
      !convenio ||
      !convenio.activo ||
      convenio.estado !== EstadoConvenioHotel.PENDIENTE
    ) {
      throw new ConflictException(
        'La solicitud del convenio ya no está vigente. Actualiza la bandeja.',
      );
    }
    if (
      Number(convenio.version ?? 1) !==
      Number(aprobacion.documentoVersion ?? 1)
    ) {
      throw new ConflictException(
        'El convenio cambió después de iniciar el ciclo. Debe reenviarse a aprobación.',
      );
    }
    const hoy = fechaCalendarioNegocio(new Date());
    if (
      !convenio.vigenciaDesde ||
      (convenio.vigenciaHasta &&
        convenio.vigenciaHasta < convenio.vigenciaDesde) ||
      (convenio.vigenciaHasta && convenio.vigenciaHasta < hoy)
    ) {
      throw new ConflictException(
        'La vigencia del convenio terminó o es incoherente. Renueva las fechas y genera un nuevo ciclo.',
      );
    }
    const hotel = await manager.getRepository(Hotel).findOne({
      where: {
        id: convenio.hotelId,
        empresaId: aprobacion.empresaId,
        activo: true,
      },
    });
    if (!hotel) {
      throw new ConflictException(
        'El hotel del convenio está inactivo o ya no existe. No se puede continuar la aprobación.',
      );
    }

    const cliente = await manager.getRepository(Cliente).findOne({
      where: {
        id: convenio.clienteId,
        empresaId: aprobacion.empresaId,
        activo: true,
      },
    });
    if (
      !cliente ||
      cliente.estadoCredito !== 'AUTORIZADO' ||
      cliente.estadoSolicitudCredito === 'PENDIENTE'
    ) {
      throw new ConflictException(
        'La línea maestra dejó de estar autorizada o tiene un cambio pendiente. El convenio no puede continuar hasta estabilizar el crédito.',
      );
    }
    if (
      cliente.tipoPersona !== 'MORAL' ||
      !cliente.clasificacionHotelera ||
      convenio.tipo !== cliente.clasificacionHotelera
    ) {
      throw new ConflictException(
        'La clasificación hotelera maestra ya no coincide con el convenio. Reenvíalo con las condiciones vigentes.',
      );
    }
    if (
      Number(cliente.versionCredito ?? 1) !==
      Number(convenio.versionCreditoCliente ?? 1)
    ) {
      throw new ConflictException(
        'La versión de la línea maestra cambió. Reenvía el convenio con las condiciones vigentes.',
      );
    }
    if (
      Math.abs(
        Number(cliente.limiteCredito ?? 0) -
          Number(aprobacion.importeSolicitado ?? 0),
      ) > 0.009
    ) {
      throw new ConflictException(
        'La línea maestra cambió después de solicitar el convenio. Reenvía el convenio con las condiciones vigentes.',
      );
    }
  }

  private async finalizarDocumento(
    manager: EntityManager,
    aprobacion: AprobacionDocumento,
    aprobado: boolean,
    usuarioId: string,
    comentario?: string,
  ) {
    if (aprobacion.proceso === 'CREDITO_CLIENTE') {
      const cliente = await manager
        .getRepository(Cliente)
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where('cliente.id=:id AND cliente.empresaId=:empresaId', {
          id: aprobacion.documentoId,
          empresaId: aprobacion.empresaId,
        })
        .getOne();
      if (!cliente) throw new NotFoundException('Cliente no encontrado.');

      const snapshot = leerSnapshot(aprobacion.datosSolicitud);
      const limiteSolicitado = Number(
        snapshot.limiteCredito ?? cliente.limiteCreditoSolicitado ?? 0,
      );
      const diasSolicitados = Number(
        snapshot.diasCredito ?? cliente.diasCreditoSolicitados ?? 0,
      );
      const nivelRiesgoSolicitado = (snapshot.nivelRiesgo ??
        cliente.nivelRiesgoSolicitado ??
        'MEDIO') as Cliente['nivelRiesgo'];
      const bloquearVencidoSolicitado = Boolean(
        snapshot.bloquearCreditoConSaldoVencido ??
          cliente.bloquearCreditoConSaldoVencidoSolicitado ??
          true,
      );
      const clasificacionSolicitada = (snapshot.clasificacionHotelera ??
        cliente.clasificacionHoteleraSolicitada ??
        null) as Cliente['clasificacionHotelera'];

      if (aprobado) {
        if (!cliente.activo) {
          throw new ConflictException(
            'No se puede autorizar crédito a un cliente inactivo.',
          );
        }
        if (
          cliente.estadoSolicitudCredito !== 'PENDIENTE' ||
          limiteSolicitado <= 0 ||
          diasSolicitados <= 0
        ) {
          throw new ConflictException(
            'La propuesta de crédito dejó de ser válida antes de la aprobación final.',
          );
        }
        if (
          cliente.tipoPersona !== 'MORAL' &&
          clasificacionSolicitada !== null
        ) {
          throw new ConflictException(
            'Una persona física no puede autorizarse con clasificación hotelera.',
          );
        }

        /*
         * La puerta de validación.
         *
         * Aquí es donde se decide a quién se le presta, así que aquí es donde
         * tiene que mirarse el expediente: no en el punto de venta. Cuando el
         * cliente llega a comprar ya trae línea o no la trae, y esa es
         * exactamente la pregunta que se resuelve en este método.
         *
         * Una empresa sin flujo activo sigue funcionando como siempre. Quien
         * lo activa está diciendo «no quiero autorizar líneas a ciegas», y a
         * partir de ahí no se puede autorizar sin expediente.
         */
        await this.exigirValidacionFavorable(
          aprobacion.empresaId,
          cliente.id,
          limiteSolicitado,
        );

        const versionAnterior = Number(cliente.versionCredito ?? 1);
        const teniaLineaVigente =
          Number(cliente.limiteCredito ?? 0) > 0 &&
          ['AUTORIZADO', 'SUSPENDIDO'].includes(cliente.estadoCredito);
        cliente.limiteCredito = limiteSolicitado;
        cliente.diasCredito = diasSolicitados;
        cliente.nivelRiesgo = nivelRiesgoSolicitado;
        cliente.bloquearCreditoConSaldoVencido = bloquearVencidoSolicitado;
        cliente.clasificacionHotelera = clasificacionSolicitada ?? null;
        cliente.versionCredito = teniaLineaVigente
          ? versionAnterior + 1
          : Math.max(1, versionAnterior);
        cliente.estadoCredito = 'AUTORIZADO';
        cliente.estadoSolicitudCredito = 'APROBADA';
        cliente.limiteCreditoSolicitado = null;
        cliente.diasCreditoSolicitados = null;
        cliente.nivelRiesgoSolicitado = null;
        cliente.bloquearCreditoConSaldoVencidoSolicitado = null;
        cliente.clasificacionHoteleraSolicitada = null;
        cliente.creditoResueltoPorId = usuarioId;
        cliente.fechaResolucionCredito = new Date();
        cliente.comentarioCredito = comentario?.trim() || null;
        await manager.save(cliente);

        /*
         * La línea autorizada es el hecho que el registro externo necesita
         * para poder originar créditos a este cliente. Se publica dentro de la
         * misma transacción que la autoriza: si la aprobación se revierte, el
         * registro externo nunca supo de una línea que no llegó a existir. La
         * versión entra en la clave de idempotencia porque cada reautorización
         * es un hecho distinto, no una repetición del anterior.
         */
        await this.cartera.lineaAutorizada(
          aprobacion.empresaId,
          cliente.id,
          Number(cliente.limiteCredito ?? 0),
          Number(cliente.versionCredito ?? 1),
          manager,
        );

        // Un convenio siempre pertenece a una versión exacta de la línea.
        // Los aprobados se suspenden y los aún pendientes se cancelan para
        // impedir que usen condiciones anteriores después del cambio maestro.
        const motivoCambio =
          `Línea maestra actualizada a versión ${cliente.versionCredito}; ` +
          'el convenio debe revisarse y reenviarse con las nuevas condiciones.';
        await manager
          .getRepository(ConvenioCreditoHotel)
          .createQueryBuilder()
          .update()
          .set({
            estado: EstadoConvenioHotel.SUSPENDIDO,
            suspendidoPorId: usuarioId,
            fechaSuspension: new Date(),
            comentarioResolucion: motivoCambio.slice(0, 500),
          })
          .where(
            'empresaId=:empresaId AND clienteId=:clienteId AND estado=:estado',
            {
              empresaId: aprobacion.empresaId,
              clienteId: cliente.id,
              estado: EstadoConvenioHotel.APROBADO,
            },
          )
          .execute();
        await manager
          .getRepository(ConvenioCreditoHotel)
          .createQueryBuilder()
          .update()
          .set({
            estado: EstadoConvenioHotel.CANCELADO,
            canceladoPorId: usuarioId,
            fechaCancelacion: new Date(),
            comentarioResolucion: motivoCambio.slice(0, 500),
          })
          .where(
            'empresaId=:empresaId AND clienteId=:clienteId AND estado=:estado',
            {
              empresaId: aprobacion.empresaId,
              clienteId: cliente.id,
              estado: EstadoConvenioHotel.PENDIENTE,
            },
          )
          .execute();
        await manager
          .getRepository(AprobacionDocumento)
          .createQueryBuilder()
          .update()
          .set({
            estado: 'CANCELADA',
            comentario: motivoCambio.slice(0, 500),
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
            {
              empresaId: aprobacion.empresaId,
              clienteId: cliente.id,
            },
          )
          .execute();
      } else {
        // Rechazar una propuesta nunca destruye la línea autorizada vigente.
        // La propuesta se conserva para que pueda corregirse y reenviarse.
        cliente.estadoSolicitudCredito = 'RECHAZADA';
        if (cliente.estadoCredito === 'EN_REVISION') {
          cliente.estadoCredito = 'RECHAZADO';
        }
        cliente.creditoResueltoPorId = usuarioId;
        cliente.fechaResolucionCredito = new Date();
        cliente.comentarioCredito = comentario?.trim() || null;
        await manager.save(cliente);
      }
      return;
    }

    const convenio = await manager
      .getRepository(ConvenioCreditoHotel)
      .createQueryBuilder('convenio')
      .setLock('pessimistic_write')
      .where('convenio.id=:id AND convenio.empresaId=:empresaId', {
        id: aprobacion.documentoId,
        empresaId: aprobacion.empresaId,
      })
      .getOne();
    if (!convenio) throw new NotFoundException('Convenio hotelero no encontrado.');

    if (aprobado) {
      const cliente = await manager
        .getRepository(Cliente)
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where('cliente.id=:id AND cliente.empresaId=:empresaId', {
          id: convenio.clienteId,
          empresaId: convenio.empresaId,
        })
        .getOne();
      if (
        !cliente ||
        !cliente.activo ||
        cliente.estadoCredito !== 'AUTORIZADO' ||
        cliente.estadoSolicitudCredito === 'PENDIENTE'
      ) {
        throw new ConflictException(
          'El convenio no puede aprobarse porque la línea maestra no está autorizada, activa y estable.',
        );
      }
      if (cliente.tipoPersona !== 'MORAL' || !cliente.clasificacionHotelera) {
        throw new ConflictException(
          'El cliente debe conservar una clasificación hotelera maestra antes de aprobar el convenio.',
        );
      }
      convenio.tipo = cliente.clasificacionHotelera as ConvenioCreditoHotel['tipo'];
      convenio.limiteCredito = Number(cliente.limiteCredito);
      convenio.diasCredito = Number(cliente.diasCredito);
      convenio.versionCreditoCliente = Number(cliente.versionCredito ?? 1);
      convenio.bloquearConSaldoVencido =
        cliente.bloquearCreditoConSaldoVencido !== false;
      convenio.tolerancia = 0;
      convenio.estado = EstadoConvenioHotel.APROBADO;
      convenio.aprobadoPorId = usuarioId;
      convenio.fechaAprobacion = new Date();
      convenio.rechazadoPorId = null;
      convenio.fechaRechazo = null;
      convenio.suspendidoPorId = null;
      convenio.fechaSuspension = null;
      convenio.canceladoPorId = null;
      convenio.fechaCancelacion = null;
    } else {
      convenio.estado = EstadoConvenioHotel.RECHAZADO;
      convenio.aprobadoPorId = null;
      convenio.fechaAprobacion = null;
      convenio.rechazadoPorId = usuarioId;
      convenio.fechaRechazo = new Date();
      convenio.suspendidoPorId = null;
      convenio.fechaSuspension = null;
    }
    convenio.comentarioResolucion = comentario?.trim() || null;
    await manager.save(convenio);
  }
  /**
   * El veredicto de la puerta de validación, como dato y no sólo como excepción.
   *
   * RECHAZADA cierra la puerta: si el flujo dijo que no, no hay línea.
   * REVISION_MANUAL la deja pasar a propósito —significa «que lo mire una
   * persona», y una persona es justo quien está aprobando aquí—, pero el
   * expediente tiene que existir y quedar registrado.
   *
   * El expediente también tiene que cubrir el importe: uno hecho para 5.000
   * no justifica una línea de 500.000. Sin esa comprobación bastaría con
   * validar barato una vez para autorizar cualquier cosa después.
   *
   * Devolverlo como dato es lo que permite que la bandeja lo enseñe ANTES de
   * pulsar «Aprobar». Un botón que el servidor va a rechazar siempre es peor
   * que un botón apagado con el motivo escrito al lado: el expediente de
   * María Fernanda llevaba tres días parado y nadie podía saber por qué.
   */
  private async evaluarValidacion(
    empresaId: string,
    clienteId: string,
    limiteSolicitado: number,
  ): Promise<VeredictoValidacion> {
    const flujo = await this.validacion.flujoActivo(empresaId);
    if (!flujo) {
      return {
        exigida: false,
        flujo: null,
        estado: 'SIN_FLUJO',
        estadoExpediente: null,
        limiteValidado: null,
        limiteSolicitado,
        motivos: [],
        bloquea: false,
        mensaje: null,
      };
    }

    const historial = await this.validacion.historial(empresaId, clienteId);
    const expediente = (historial ?? []).find((e) => !e.simulacion);

    if (!expediente) {
      return {
        exigida: true,
        flujo: flujo.nombre,
        estado: 'SIN_EXPEDIENTE',
        estadoExpediente: null,
        limiteValidado: null,
        limiteSolicitado,
        motivos: [],
        bloquea: true,
        mensaje: `La empresa tiene activo el flujo «${flujo.nombre}» y este cliente no tiene expediente de validación. Ejecuta la verificación antes de autorizar la línea.`,
      };
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * QUE SE MIDE AQUI, Y POR QUE ASI
     *
     * `limiteValidado` leia `expediente.limiteSolicitado` —lo que se PIDIO— en
     * vez de `limiteSugerido` —lo que el flujo dio por bueno—. La comparacion
     * de mas abajo era entonces «lo solicitado contra lo solicitado» y no podia
     * fallar nunca. Verificado el 25-sep-2026 contra la instalacion: un cliente
     * quedo con 300 000 autorizados y sus dos unicos expedientes decian
     * `limiteSugerido: 0`.
     *
     * Ese tope solo significa algo cuando el expediente CONCLUYO. Mientras
     * sigue en proceso o espera revision humana, `limiteSugerido` vale 0 porque
     * todavia no hay veredicto, no porque el veredicto sea cero. Compararlo ahi
     * convertiria en candado lo que a proposito no lo es —ver el bloque
     * siguiente— asi que el importe solo se contrasta contra un expediente
     * concluido.
     * ────────────────────────────────────────────────────────────────────────
     */
    const concluido =
      expediente.estado === EstadoEjecucion.APROBADA ||
      expediente.estado === EstadoEjecucion.APROBADA_CON_AJUSTE;
    const limiteValidado = concluido
      ? Number(expediente.limiteSugerido ?? 0)
      : null;
    const motivos = expediente.motivos ?? [];
    const comun = {
      exigida: true as const,
      flujo: flujo.nombre,
      estadoExpediente: expediente.estado ?? null,
      limiteValidado,
      limiteSolicitado,
      motivos,
    };

    if (expediente.estado === EstadoEjecucion.RECHAZADA) {
      return {
        ...comun,
        estado: 'RECHAZADA',
        bloquea: true,
        mensaje: `El expediente de validación de este cliente quedó RECHAZADA: ${
          motivos.join(' ') || 'sin motivo registrado'
        }`,
      };
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * EL EXPEDIENTE QUE NO CONCLUYO NO BLOQUEA, PERO SE DICE
     *
     * Que `REVISION_MANUAL` deje pasar es una decision tomada a proposito y
     * escrita en `aprobaciones-validacion.spec.ts`: quiere decir «que lo mire
     * una persona», y quien firma en esta bandeja ES esa persona. Bloquearlo
     * convertiria el veredicto mas comun del motor —el que sale mientras no hay
     * proveedores enchufados— en un candado imposible. Se respeta.
     *
     * Lo que no se sostiene es que la persona firme sin enterarse. Con
     * `bloquea: false` y `mensaje: null`, la pantalla no pintaba nada: el
     * expediente decia «Validacion de identidad (INE) no pudo resolverse y es
     * un paso bloqueante» y el aprobador veia una solicitud normal con su boton
     * verde. Delegar el juicio en una persona y no enseñarle el expediente no
     * es delegar: es firmar a ciegas con una firma que parece informada.
     *
     * Asi que sigue sin bloquear, y ahora lo dice. La pantalla lo pinta en
     * ambar junto al boton.
     * ────────────────────────────────────────────────────────────────────────
     */
    if (!concluido) {
      return {
        ...comun,
        estado: 'NO_CONCLUIDO',
        bloquea: false,
        mensaje:
          `El expediente de validación no concluyó: quedó en ${
            expediente.estado ?? 'estado desconocido'
          }. ${motivos.join(' ') || 'Sin motivo registrado.'} ` +
          'Nadie más va a revisarlo: si firmas, la línea se autoriza con esto.',
      };
    }

    if ((limiteValidado ?? 0) + 0.005 < limiteSolicitado) {
      return {
        ...comun,
        estado: 'IMPORTE_INSUFICIENTE',
        bloquea: true,
        mensaje: `El expediente de validación dio por bueno ${(limiteValidado ?? 0).toFixed(
          2,
        )} y se está autorizando ${limiteSolicitado.toFixed(
          2,
        )}. Vuelve a verificar por el importe que se va a autorizar.`,
      };
    }

    return { ...comun, estado: 'FAVORABLE', bloquea: false, mensaje: null };
  }

  /**
   * Exige un expediente de validación favorable antes de autorizar la línea.
   *
   * Una sola cuenta —`evaluarValidacion`— decide lo que la bandeja pinta y lo
   * que esta puerta deja pasar. Si se separaran, volverían a divergir.
   */
  private async exigirValidacionFavorable(
    empresaId: string,
    clienteId: string,
    limiteSolicitado: number,
  ): Promise<void> {
    const veredicto = await this.evaluarValidacion(
      empresaId,
      clienteId,
      limiteSolicitado,
    );
    if (veredicto.bloquea) {
      throw new ConflictException(
        veredicto.mensaje ?? 'El expediente de validación no cubre esta línea.',
      );
    }
  }

}
