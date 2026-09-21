// src/compras/services/requisiciones.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EstadoRequisicion,
  Requisicion,
} from '../entities/requisicion.entity';
import { DetalleRequisicion } from '../entities/detalle-requisicion.entity';
import { Aprobacion } from '../entities/aprobacion.entity';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { Producto } from '../../catalogo/entities/producto.entity';
import { MailService } from '../../common/services/mail.service';
import {
  htmlNuevaRequisicion,
  htmlRechazoRequisicion,
  htmlAprobadaRequisicion,
} from '../utils/email-templates';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';


/**
 * Columnas que se publican de una persona dentro de una requisicion.
 *
 * La relacion `aprobaciones.usuario` devolvia el registro COMPLETO de Usuario:
 * correo, keycloakSubject, empresaId, departamentoId, esPropietario,
 * intentosFallidos, bloqueadoHasta y los vencimientos de token. Cualquier
 * comprador que abriera su lista de requisiciones leia el expediente de
 * seguridad de quien las autoriza —en la corrida del 21-sep-2026, el del
 * administrador de la empresa.
 *
 * Poner `select: false` en las columnas sensibles cubrio la credencial, pero
 * no esto: el resto del renglon seguia saliendo arrastrado por la relacion.
 * Una requisicion solo necesita saber quien es esa persona y con que autoridad
 * firma.
 */
const PERSONA_EN_REQUISICION = {
  id: true,
  nombreCompleto: true,
  rol: true,
} as const;

/**
 * Recorte de columnas comun al listado y al detalle.
 *
 * Las columnas de `aprobaciones` van enumeradas a proposito: en TypeORM, un
 * `select` anidado que solo nombra una sub-relacion deja de seleccionar las
 * columnas escalares de ese nivel, y la cadena de aprobaciones llegaba al
 * navegador como objetos vacios. Verificado contra el sistema en vivo el
 * 21-sep-2026, no deducido: la primera version de este recorte rompio la
 * pantalla de requisiciones sin que tsc dijera una palabra.
 *
 * Si se agrega una columna a la entidad Aprobacion, hay que agregarla aqui.
 */
const SELECCION_REQUISICION = {
  aprobaciones: {
    id: true,
    requisicionId: true,
    usuarioId: true,
    orden: true,
    estado: true,
    comentario: true,
    fechaCreacion: true,
    fechaResolucion: true,
    usuario: PERSONA_EN_REQUISICION,
  },
  usuarioSolicitante: PERSONA_EN_REQUISICION,
} as const;

@Injectable()
export class RequisicionesService {
  constructor(
    @InjectRepository(Requisicion)
    private readonly reqRepo: Repository<Requisicion>,
    @InjectRepository(DetalleRequisicion)
    private readonly detalleRepo: Repository<DetalleRequisicion>,
    @InjectRepository(Aprobacion)
    private readonly aprobacionRepo: Repository<Aprobacion>,
    @InjectRepository(ConfiguracionAprobacion)
    private readonly configAprobacionRepo: Repository<ConfiguracionAprobacion>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  // ====================== CREAR REQUISICIÓN ======================
  async crear(
    dto: CrearRequisicionDto,
    empresaId: string,
    usuarioSolicitanteId: string,
  ) {
    const usuario = await this.usuarioRepo.findOne({
      where: { id: usuarioSolicitanteId, empresaId, activo: true },
      relations: ['departamento'],
    });
    if (!usuario) {
      throw new BadRequestException(
        'El usuario autenticado no está activo o no pertenece a la empresa.',
      );
    }
    if (!usuario.departamentoId) {
      throw new BadRequestException(
        /*
         * El mensaje le hablaba al administrador, pero lo lee quien acaba de
         * capturar la requisición —el almacenista— y le pide hacer algo que no
         * puede hacer, después de llenar el formulario. Ahora dice de quién es
         * el pendiente y por qué existe la regla.
         */
        'Tu usuario todavía no tiene departamento asignado, y de él dependen ' +
          'los aprobadores de la requisición. Pídele al administrador que te ' +
          'asigne uno en Usuarios; en cuanto lo tengas, esta captura funciona.',
      );
    }

    const ids = dto.detalles.map((detalle) => detalle.productoId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un producto no puede aparecer más de una vez en la requisición.',
      );
    }
    const productos = await this.productoRepo
      .createQueryBuilder('producto')
      .where('producto.empresaId = :empresaId', { empresaId })
      .andWhere('producto.id IN (:...ids)', { ids })
      .andWhere('producto.activo = :activo', { activo: true })
      .getCount();
    if (productos !== ids.length) {
      throw new BadRequestException(
        'Uno o más productos no existen, están inactivos o pertenecen a otra empresa.',
      );
    }

    const todasLasConfiguraciones = await this.configAprobacionRepo.find({
      where: {
        empresaId,
        proceso: 'REQUISICION',
        departamentoId: usuario.departamentoId,
        activo: true,
      },
      order: { orden: 'ASC' },
    });
    if (todasLasConfiguraciones.length === 0) {
      throw new BadRequestException(
        'No existe una ruta de aprobación activa para requisiciones de este departamento.',
      );
    }

    /*
     * ════════════════════════════════════════════════════════════════════════
     * UMBRAL POR MONTO
     * --------------------------------------------------------------------------
     * `montoDesde` y `montoHasta` existian en la entidad y no los usaba nadie:
     * TODA requisicion subia al mando, sin importar que fueran diez cajas de
     * guantes. Ningun ERP opera asi. Business Central le pone a cada aprobador
     * un «Amount Approval Limit» y escala al siguiente cuando se excede; SAP
     * Business One arma las etapas por total del documento; Odoo pide doble
     * validacion solo por encima de un monto.
     *
     * El problema aqui era que una requisicion no trae precios: se pide
     * cantidad, no dinero. Por eso se valua con el COSTO DE REPOSICION de cada
     * producto —`precioCompra`, que la recepcion mantiene al dia—, que es
     * exactamente lo que hace SAP B1 con su «Last Purchase Price» para valuar
     * una solicitud antes de cotizarla. No es el precio final, y no pretende
     * serlo: es el orden de magnitud, que es lo unico que el umbral necesita.
     *
     * Un producto sin costo conocido vale 0 para este calculo. Eso empuja la
     * requisicion HACIA ABAJO, asi que el umbral se elige sabiendo que lo
     * desconocido no escala solo.
     * ════════════════════════════════════════════════════════════════════════
     */
    const costos = await this.productoRepo
      .createQueryBuilder('p')
      .select(['p.id AS id', 'p.precioCompra AS costo'])
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.id IN (:...ids)', { ids })
      .getRawMany<{ id: string; costo: string | number }>();
    const costoPorProducto = new Map(
      costos.map((c) => [c.id, Number(c.costo ?? 0)]),
    );
    const importeEstimado = dto.detalles.reduce(
      (suma, d) =>
        suma +
        Number(d.cantidadSolicitada ?? 0) *
          (costoPorProducto.get(d.productoId) ?? 0),
      0,
    );

    const configuraciones = todasLasConfiguraciones.filter((c) => {
      const desde = Number(c.montoDesde ?? 0);
      const hasta = c.montoHasta === null || c.montoHasta === undefined
        ? null
        : Number(c.montoHasta);
      if (importeEstimado < desde) return false;
      if (hasta !== null && importeEstimado > hasta) return false;
      return true;
    });

    /*
     * Ningun nivel aplica: el monto quedo por debajo de lo que exige firma.
     * La requisicion nace lista para cotizar. Que no requiera autorizacion no
     * la hace invisible: queda en el expediente con su importe estimado, y si
     * manana alguien baja el umbral, las siguientes si la piden.
     */
    const requiereAutorizacion = configuraciones.length > 0;

    /*
     * ════════════════════════════════════════════════════════════════════════
     * QUIEN FIRMA: persona → rol → suplente → administracion
     * --------------------------------------------------------------------------
     * Antes la ruta EXIGIA `usuarioId` en cada nivel y rechazaba la requisicion
     * entera si alguno estaba inactivo. Dos consecuencias:
     *
     *   - Las rutas por ROL, que la entidad ya soportaba y que el credito de
     *     clientes si usa, se rechazaban de plano.
     *   - Dar de baja a una persona no dejaba documentos trabados: detenia al
     *     area COMPLETA. Nadie de Compras podia levantar una requisicion
     *     porque su aprobador ya no estaba.
     *
     * Business Central resuelve esto con una cadena: Approver ID → Substitute
     * → administrador de aprobaciones. Aqui es la misma idea: el nivel dice a
     * quien le toca, y si esa persona ya no puede, lo toma alguien con su misma
     * autoridad. Lo que NUNCA cambia es que el solicitante no se firma a si
     * mismo.
     * ════════════════════════════════════════════════════════════════════════
     */
    const candidatos = await this.usuarioRepo.find({
      where: { empresaId, activo: true },
    });
    const activoPorId = new Map(candidatos.map((u) => [u.id, u]));

    const resolverFirmante = (
      config: (typeof configuraciones)[number],
    ): Usuario | null => {
      const noEsElSolicitante = (u: Usuario) => u.id !== usuarioSolicitanteId;

      // 1. La persona que la ruta nombra, si sigue activa.
      const nombrado = config.usuarioId ? activoPorId.get(config.usuarioId) : null;
      if (nombrado && noEsElSolicitante(nombrado)) return nombrado;

      // 2. El rol que la ruta nombra.
      const rolPedido = config.rolAprobador ?? nombrado?.rol ?? null;
      if (rolPedido) {
        const porRol = candidatos.find(
          (u) => normalizarRol(u.rol) === normalizarRol(rolPedido) && noEsElSolicitante(u),
        );
        if (porRol) return porRol;
      }

      // 3. El rol que tenia la persona nombrada, aunque ella ya no este.
      if (config.usuarioId && !nombrado) {
        const original = candidatos.find((u) => u.id === config.usuarioId);
        if (original) {
          const suplente = candidatos.find(
            (u) => normalizarRol(u.rol) === normalizarRol(original.rol) && noEsElSolicitante(u),
          );
          if (suplente) return suplente;
        }
      }

      // 4. Administracion, que es el ultimo responsable de que esto no se pare.
      return (
        candidatos.find((u) => esRolAdministrador(u.rol) && noEsElSolicitante(u)) ??
        candidatos.find((u) => u.esPropietario && noEsElSolicitante(u)) ??
        null
      );
    };

    const firmantes = new Map<number, Usuario>();
    for (const config of configuraciones) {
      const firmante = resolverFirmante(config);
      if (!firmante) {
        throw new BadRequestException(
          `El nivel ${config.orden} de la ruta se quedó sin nadie que pueda firmarlo. ` +
            'Asigna un aprobador en Flujos de aprobación antes de continuar.',
        );
      }
      firmantes.set(config.orden, firmante);
    }

    const primerAprobador = requiereAutorizacion
      ? firmantes.get(configuraciones[0].orden)!
      : null;
    const requisicionId = await this.dataSource.transaction(async (em) => {
      const requisiciones = em.getRepository(Requisicion);
      const detallesRepo = em.getRepository(DetalleRequisicion);
      const aprobacionesRepo = em.getRepository(Aprobacion);
      const guardada = await requisiciones.save(
        requisiciones.create({
          empresaId,
          usuarioSolicitanteId,
          notas: dto.notas,
          prioridad: dto.prioridad ?? 'NORMAL',
          /*
           * Sin niveles que apliquen, la requisicion nace lista para cotizar.
           * Es el equivalente al «below limit, no approval required» de
           * Business Central: el control existe para lo que lo amerita, no
           * para que el mando firme cajas de guantes.
           */
          estado: requiereAutorizacion ? 'PENDIENTE' : 'COTIZANDO',
          fechaRequerida: dto.fechaRequerida
            ? new Date(`${dto.fechaRequerida.slice(0, 10)}T12:00:00`)
            : null,
        }),
      );
      await detallesRepo.save(
        dto.detalles.map((detalle) =>
          detallesRepo.create({
            requisicionId: guardada.id,
            productoId: detalle.productoId,
            cantidadSolicitada: detalle.cantidadSolicitada,
            notas: detalle.notas,
          }),
        ),
      );
      if (requiereAutorizacion) {
        await aprobacionesRepo.save(
          configuraciones.map((configuracion) =>
            aprobacionesRepo.create({
              requisicionId: guardada.id,
              // Quien la ruta dijo, o quien lo sustituye: resuelto arriba.
              usuarioId: firmantes.get(configuracion.orden)!.id,
              orden: configuracion.orden,
            }),
          ),
        );
      }
      return guardada.id;
    });
    const reqCompleta = await this.reqRepo.findOne({
      where: { id: requisicionId, empresaId },
      relations: ['detalles', 'detalles.producto'],
    });
    if (primerAprobador) {
      void this.mailService
        .enviarCorreo({
          destinatario: primerAprobador.email,
          asunto: 'Nueva requisición pendiente de aprobación',
          cuerpo: `Hola ${primerAprobador.nombreCompleto}, tienes una nueva requisición (ID: ${requisicionId}) pendiente de aprobación.`,
          cuerpoHtml: htmlNuevaRequisicion(
            reqCompleta,
            primerAprobador.nombreCompleto,
          ),
        })
        .catch(() => undefined);
    }

    return this.reqRepo.findOne({
      where: { id: requisicionId, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
    });
  }

  // ====================== OBTENER TODAS ======================
  async obtenerTodas(empresaId: string, usuarioId?: string, rol?: string) {
    const where: any = { empresaId };
    const rolNormalizado = normalizarRol(rol);
    if (
      !esRolAdministrador(rol) &&
      !['COMPRADOR', 'COMPRAS'].includes(rolNormalizado) &&
      usuarioId
    ) {
      where.usuarioSolicitanteId = usuarioId;
    }

    return this.reqRepo.find({
      where,
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
      select: SELECCION_REQUISICION,
      order: { fechaSolicitud: 'DESC' },
    });
  }

  // ====================== OBTENER POR ID ======================
  async obtenerPorId(
    id: string,
    empresaId: string,
    usuarioId: string,
    rol?: string,
  ) {
    const req = await this.reqRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
      select: SELECCION_REQUISICION,
    });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    const puedeConsultar =
      esRolAdministrador(rol) ||
      ['COMPRADOR', 'COMPRAS'].includes(normalizarRol(rol)) ||
      req.usuarioSolicitanteId === usuarioId ||
      req.aprobaciones?.some((aprobacion) => aprobacion.usuarioId === usuarioId);
    if (!puedeConsultar) {
      throw new ForbiddenException(
        'No puedes consultar requisiciones de otro solicitante.',
      );
    }
    return req;
  }

  // ====================== CAMBIAR ESTADO ======================
  async cambiarEstado(
    id: string,
    empresaId: string,
    estado: EstadoRequisicion,
    usuarioId?: string,
    rol?: string,
  ) {
    const req = await this.reqRepo.findOne({ where: { id, empresaId } });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    if (
      !esRolAdministrador(rol) &&
      !['COMPRADOR', 'COMPRAS'].includes(normalizarRol(rol)) &&
      req.usuarioSolicitanteId !== usuarioId
    ) {
      throw new ForbiddenException(
        'Sólo el solicitante o Compras pueden cancelar esta requisición.',
      );
    }
    const transiciones: Partial<
      Record<EstadoRequisicion, EstadoRequisicion[]>
    > = {
      PENDIENTE: ['CANCELADA'],
      COTIZANDO: ['CANCELADA'],
    };
    if (!(transiciones[req.estado] ?? []).includes(estado)) {
      throw new BadRequestException(
        `No se permite cambiar una requisición de ${req.estado} a ${estado}.`,
      );
    }
    req.estado = estado;
    return this.reqRepo.save(req);
  }

  // ====================== OBTENER APROBACIONES PENDIENTES ======================
  async obtenerAprobacionesPendientes(usuarioId: string, empresaId: string) {
    const asignadas = await this.aprobacionRepo.find({
      where: {
        usuarioId,
        estado: 'PENDIENTE',
        requisicion: { empresaId },
      },
      relations: [
        'requisicion',
        'requisicion.usuarioSolicitante',
        'requisicion.detalles',
        'requisicion.detalles.producto',
      ],
      order: { fechaCreacion: 'ASC' },
    });
    const visibles: Aprobacion[] = [];
    for (const ap of asignadas) {
      if (ap.requisicion.estado !== 'PENDIENTE') continue;
      const anterior = await this.aprobacionRepo.createQueryBuilder('a')
        .where('a.requisicionId = :requisicionId', { requisicionId: ap.requisicionId })
        .andWhere('a.orden < :orden', { orden: ap.orden })
        .andWhere('a.estado <> :aprobado', { aprobado: 'APROBADO' })
        .getCount();
      if (anterior === 0) visibles.push(ap);
    }
    return visibles;
  }

  // ====================== RESOLVER APROBACIÓN (ATÓMICO) ======================
  async resolverAprobacion(
    id: string,
    estado: 'APROBADO' | 'RECHAZADO',
    comentario: string,
    empresaId: string,
    usuarioActualId: string,
  ) {
    const resultado = await this.dataSource.transaction(async (em) => {
      const aprobaciones = em.getRepository(Aprobacion);
      const requisiciones = em.getRepository(Requisicion);

      const aprobacion = await aprobaciones
        .createQueryBuilder('a')
        .setLock('pessimistic_write', undefined, ['a'])
        .leftJoinAndSelect('a.requisicion', 'r')
        .leftJoinAndSelect('r.usuarioSolicitante', 'solicitante')
        .where('a.id = :id', { id })
        .getOne();
      if (!aprobacion) throw new NotFoundException('Aprobación no encontrada');
      if (aprobacion.requisicion.empresaId !== empresaId)
        throw new NotFoundException('No pertenece a tu empresa');
      if (aprobacion.usuarioId !== usuarioActualId)
        throw new BadRequestException('Esta aprobación está asignada a otro usuario.');
      if (aprobacion.estado !== 'PENDIENTE')
        throw new BadRequestException('Esta aprobación ya fue resuelta.');
      if (aprobacion.requisicion.estado !== 'PENDIENTE')
        throw new BadRequestException(`La requisición ya no está pendiente; estado: ${aprobacion.requisicion.estado}.`);

      const anterioresSinAprobar = await aprobaciones
        .createQueryBuilder('a')
        .where('a.requisicionId = :requisicionId', { requisicionId: aprobacion.requisicionId })
        .andWhere('a.orden < :orden', { orden: aprobacion.orden })
        .andWhere('a.estado <> :aprobado', { aprobado: 'APROBADO' })
        .getCount();
      if (anterioresSinAprobar > 0)
        throw new BadRequestException('Debe resolverse primero el nivel de aprobación anterior.');

      aprobacion.estado = estado;
      aprobacion.fechaResolucion = new Date();
      aprobacion.comentario = comentario || '';
      await aprobaciones.save(aprobacion);

      let nuevoEstado: EstadoRequisicion = aprobacion.requisicion.estado;
      let siguienteUsuarioId: string | null = null;
      if (estado === 'RECHAZADO') {
        nuevoEstado = 'RECHAZADA';
        const cambio = await requisiciones.update(
          { id: aprobacion.requisicionId, empresaId, estado: 'PENDIENTE' },
          { estado: nuevoEstado },
        );
        if (cambio.affected !== 1) {
          throw new BadRequestException('La requisición cambió de estado durante la aprobación. Recarga e intenta nuevamente.');
        }
      } else {
        const pendientes = await aprobaciones.count({
          where: { requisicionId: aprobacion.requisicionId, estado: 'PENDIENTE' },
        });
        if (pendientes === 0) {
          nuevoEstado = 'COTIZANDO';
          const cambio = await requisiciones.update(
            { id: aprobacion.requisicionId, empresaId, estado: 'PENDIENTE' },
            { estado: nuevoEstado },
          );
          if (cambio.affected !== 1) {
            throw new BadRequestException('La requisición cambió de estado durante la aprobación. Recarga e intenta nuevamente.');
          }
        } else {
          const siguiente = await aprobaciones.findOne({
            where: { requisicionId: aprobacion.requisicionId, estado: 'PENDIENTE' },
            order: { orden: 'ASC' },
          });
          siguienteUsuarioId = siguiente?.usuarioId ?? null;
        }
      }

      return {
        aprobacion,
        requisicionId: aprobacion.requisicionId,
        solicitanteId: aprobacion.requisicion.usuarioSolicitanteId,
        aprobadorId: aprobacion.usuarioId,
        empresaId,
        nuevoEstado,
        siguienteUsuarioId,
      };
    });

    // El correo no forma parte de la consistencia transaccional. Se envía
    // después del commit y nunca deja la requisición a medias si SMTP falla.
    void this.notificarResolucionAprobacion(resultado, comentario).catch(() => undefined);
    return resultado.aprobacion;
  }

  private async notificarResolucionAprobacion(
    resultado: {
      requisicionId: string;
      solicitanteId: string | null;
      aprobadorId: string;
      empresaId: string;
      nuevoEstado: EstadoRequisicion;
      siguienteUsuarioId: string | null;
    },
    comentario: string,
  ): Promise<void> {
    const [solicitante, aprobador, req] = await Promise.all([
      resultado.solicitanteId
        ? this.usuarioRepo.findOne({ where: { id: resultado.solicitanteId } })
        : Promise.resolve(null),
      this.usuarioRepo.findOne({ where: { id: resultado.aprobadorId } }),
      this.reqRepo.findOne({
        where: { id: resultado.requisicionId },
        relations: ['detalles', 'detalles.producto'],
      }),
    ]);

    const tareas: Promise<unknown>[] = [];
    if (solicitante && resultado.nuevoEstado === 'RECHAZADA') {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: 'Tu requisición ha sido rechazada',
        cuerpo: `Tu requisición (${resultado.requisicionId}) fue rechazada. Comentario: ${comentario}`,
        cuerpoHtml: htmlRechazoRequisicion(req || { id: resultado.requisicionId }, comentario),
      }));
    } else if (solicitante && resultado.nuevoEstado === 'COTIZANDO') {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: 'Tu requisición fue aprobada y enviada a cotización',
        cuerpo: `Tu requisición (${resultado.requisicionId}) fue aprobada completamente.`,
        cuerpoHtml: htmlAprobadaRequisicion(req || { id: resultado.requisicionId }),
      }));
      const compradores = await this.usuarioRepo.find({
        where: { empresaId: resultado.empresaId, rol: 'comprador', activo: true },
      });
      for (const comp of compradores) {
        tareas.push(this.mailService.enviarCorreo({
          destinatario: comp.email,
          asunto: 'Nueva requisición lista para cotizar',
          cuerpo: `Hay una nueva requisición (${resultado.requisicionId}) en estado COTIZANDO.`,
        }));
      }
    } else if (solicitante && aprobador) {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: `Tu requisición fue aprobada por ${aprobador.nombreCompleto}`,
        cuerpo: `${aprobador.nombreCompleto} aprobó tu requisición. Aún quedan niveles pendientes.`,
      }));
    }

    if (resultado.siguienteUsuarioId) {
      const siguiente = await this.usuarioRepo.findOne({ where: { id: resultado.siguienteUsuarioId } });
      if (siguiente) {
        tareas.push(this.mailService.enviarCorreo({
          destinatario: siguiente.email,
          asunto: 'Requisición pendiente de aprobación',
          cuerpo: `Tienes una requisición (${resultado.requisicionId}) pendiente de aprobar.`,
          cuerpoHtml: htmlNuevaRequisicion(req, siguiente.nombreCompleto),
        }));
      }
    }
    await Promise.allSettled(tareas);
  }

}
