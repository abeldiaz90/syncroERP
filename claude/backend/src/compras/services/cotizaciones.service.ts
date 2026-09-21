import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cotizacion } from '../entities/cotizacion.entity';
import { DetalleCotizacion } from '../entities/detalle-cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { CrearCotizacionDto } from '../dto/crear-cotizacion.dto';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { AprobacionDocumento } from '../entities/aprobacion-documento.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { esViolacionUnicidad } from '../../common/database/errores-sql';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

@Injectable()
export class CotizacionesService {
  constructor(
    @InjectRepository(Cotizacion) private readonly cotizacionRepo: Repository<Cotizacion>,
    @InjectRepository(DetalleCotizacion) private readonly detalleRepo: Repository<DetalleCotizacion>,
    @InjectRepository(Requisicion) private readonly requisicionRepo: Repository<Requisicion>,
    @InjectRepository(OrdenCompra) private readonly ordenRepo: Repository<OrdenCompra>,
    @InjectRepository(ConfiguracionAprobacion) private readonly configuracionRepo: Repository<ConfiguracionAprobacion>,
    @InjectRepository(AprobacionDocumento) private readonly aprobacionRepo: Repository<AprobacionDocumento>,
    @InjectRepository(Proveedor) private readonly proveedorRepo: Repository<Proveedor>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CrearCotizacionDto, empresaId: string) {
    const req = await this.requisicionRepo.findOne({
      where: { id: dto.requisicionId, empresaId },
      relations: ['detalles'],
    });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    if (req.estado !== 'COTIZANDO') {
      throw new BadRequestException(`La requisición debe estar COTIZANDO; estado actual: ${req.estado}.`);
    }
    const proveedor = await this.proveedorRepo.findOne({
      where: { id: dto.proveedorId, empresaId, activo: true },
    });
    if (!proveedor) {
      throw new BadRequestException(
        'El proveedor no existe, está inactivo o pertenece a otra empresa.',
      );
    }
    if (!['APROBADO', 'CONDICIONADO'].includes(proveedor.estadoHomologacion)) {
      throw new BadRequestException(
        `El proveedor no puede cotizar hasta concluir su homologación (estado: ${proveedor.estadoHomologacion}).`,
      );
    }
    if (!dto.detalles?.length) throw new BadRequestException('La cotización debe contener partidas.');

    const reqPorProducto = new Map(req.detalles.map(d => [d.productoId, Number(d.cantidadSolicitada)]));

    /*
     * ────────────────────────────────────────────────────────────────────────
     * El impuesto se CALCULA aquí; no se cree el que llega del formulario
     * ------------------------------------------------------------------------
     * Antes `impuestoTotal` era un número que mandaba el navegador y que el
     * servidor guardaba tal cual. De ese número salía después la
     * reclasificación de IVA acreditable al pagar, mientras que la póliza de
     * la recepción calculaba el suyo con la tasa que el producto tuviera ese
     * día en el catálogo. Dos caminos, un solo saldo: la cuenta de IVA
     * pendiente de pago acumulaba un residuo que nadie podía explicar.
     *
     * Ahora la tasa se congela POR PARTIDA —la pactada, si se indicó; la del
     * catálogo si no— y el total es la suma de las partidas. Lo que se
     * registra al recibir y lo que se acredita al pagar leen el mismo dato.
     * ────────────────────────────────────────────────────────────────────────
     */
    const tasaPactada =
      dto.tasaIva === undefined || dto.tasaIva === null
        ? null
        : Number(dto.tasaIva);
    if (tasaPactada !== null && (!Number.isFinite(tasaPactada) || tasaPactada < 0 || tasaPactada > 1)) {
      throw new BadRequestException('La tasa de impuesto debe expresarse en tanto por uno, entre 0 y 1.');
    }

    const productos = await this.productoRepo.find({
      where: dto.detalles.map((d) => ({ id: d.productoId, empresaId })),
      relations: ['impuesto'],
    });
    const tasaDeCatalogo = new Map(
      productos.map((p) => [
        p.id,
        Number(p.impuesto?.porcentaje ?? 0) / 100,
      ]),
    );

    const vistos = new Set<string>();
    let subtotal = 0;
    let impuestoTotal = 0;
    const partidas: Array<{
      productoId: string;
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      tasaIva: number;
      impuestoImporte: number;
    }> = [];

    for (const det of dto.detalles) {
      if (vistos.has(det.productoId)) throw new BadRequestException('No se permiten productos duplicados en una cotización.');
      vistos.add(det.productoId);
      const solicitada = reqPorProducto.get(det.productoId);
      if (solicitada == null) throw new BadRequestException('La cotización contiene un producto que no pertenece a la requisición.');
      const cantidad = Number(det.cantidad);
      const precio = Number(det.precioUnitario);
      if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > solicitada) {
        throw new BadRequestException(`Cantidad inválida para el producto ${det.productoId}. Máximo solicitado: ${solicitada}.`);
      }
      if (!Number.isFinite(precio) || precio < 0) throw new BadRequestException('El precio unitario no puede ser negativo.');

      const subtotalLinea = redondear(cantidad * precio);
      const tasaIva = tasaPactada ?? tasaDeCatalogo.get(det.productoId) ?? 0;
      const impuestoImporte = redondear(subtotalLinea * tasaIva);

      subtotal = redondear(subtotal + subtotalLinea);
      impuestoTotal = redondear(impuestoTotal + impuestoImporte);
      partidas.push({
        productoId: det.productoId,
        cantidad,
        precioUnitario: precio,
        subtotal: subtotalLinea,
        tasaIva,
        impuestoImporte,
      });
    }
    const total = redondear(subtotal + impuestoTotal);

    try {
      const cotizacion = await this.cotizacionRepo.save(this.cotizacionRepo.create({
        empresaId, requisicionId: dto.requisicionId, proveedorId: dto.proveedorId,
        subtotal, impuestoTotal, total, notas: dto.notas, estado: 'PENDIENTE',
      }));
      await this.detalleRepo.save(partidas.map(partida => this.detalleRepo.create({
        cotizacionId: cotizacion.id, ...partida,
      })));
      return this.obtenerPorId(cotizacion.id, empresaId);
    } catch (e: any) {
      if (esViolacionUnicidad(e)) {
        throw new ConflictException('Ya existe una cotización de ese proveedor para esta requisición.');
      }
      throw e;
    }
  }

  async obtenerPorRequisicion(requisicionId: string, empresaId: string) {
    const cotizaciones = await this.cotizacionRepo.find({
      where: { requisicionId, empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'ordenesCompra', 'solicitadoAprobacionPor', 'aprobadoPor'],
      order: { fechaCotizacion: 'DESC' },
    });

    /*
     * Quién tiene que resolver el nivel vigente. La pantalla ofrecía «Aprobar»
     * y «Rechazar» a todo el que tuviera el permiso del endpoint, sin mirar a
     * quién le tocaba: un comprador escribía su comentario, confirmaba, y se
     * llevaba un «Esta aprobación está asignada a otro usuario». El backend lo
     * frenaba bien; la pantalla mentía.
     */
    const pendientes = cotizaciones.filter((c) => c.estado === 'PENDIENTE_APROBACION');
    if (!pendientes.length) return cotizaciones;

    const pasos = await this.aprobacionRepo.find({
      where: {
        empresaId,
        proceso: 'COTIZACION',
        documentoId: In(pendientes.map((c) => c.id)),
        estado: 'PENDIENTE',
      },
      order: { ciclo: 'DESC', nivel: 'ASC' },
    });

    for (const cot of pendientes) {
      const paso = pasos.find((x) => x.documentoId === cot.id);
      if (!paso) continue;
      (cot as Cotizacion & { aprobacionPendiente?: unknown }).aprobacionPendiente = {
        nivel: paso.nivel,
        ciclo: paso.ciclo,
        usuarioAprobadorId: paso.usuarioAprobadorId ?? null,
        rolAprobador: paso.rolAprobador ?? null,
      };
    }
    return cotizaciones;
  }

  async solicitarAprobacion(id: string, empresaId: string, usuarioId: string, motivoSeleccion: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    this.validarProveedorOperable(cot.proveedor);
    /*
     * Se admite reenviar una adjudicación RECHAZADA. El campo `ciclo` de
     * AprobacionDocumento existe justamente para eso —cada vuelta es un ciclo
     * nuevo y conserva el historial— pero sólo se aceptaba PENDIENTE, así que
     * un rechazo mataba la cotización para siempre: la requisición se quedaba
     * sin salida y había que volver a pedir precios al proveedor.
     */
    const ESTADOS_REENVIABLES = ['PENDIENTE', 'RECHAZADA'];
    if (!ESTADOS_REENVIABLES.includes(cot.estado)) {
      throw new BadRequestException(`La cotización no puede enviarse a aprobación desde ${cot.estado}.`);
    }
    const existente = await this.ordenRepo.findOne({ where: { cotizacionId: id, empresaId } });
    if (existente) throw new ConflictException('La cotización ya tiene una orden de compra.');
    cot.estado = 'PENDIENTE_APROBACION';
    cot.motivoSeleccion = motivoSeleccion?.trim();
    cot.solicitadoAprobacionPorId = usuarioId;
    cot.fechaSolicitudAprobacion = new Date();
    const configuracion = await this.configuracionRepo.createQueryBuilder('c')
      .where('c.empresaId=:empresaId AND c.proceso=:proceso AND c.activo=true', { empresaId, proceso: 'COTIZACION' })
      .andWhere('(c.montoDesde IS NULL OR c.montoDesde<=:total) AND (c.montoHasta IS NULL OR c.montoHasta>=:total)', { total: Number(cot.total) })
      .orderBy('c.orden', 'ASC').getMany();
    if (!configuracion.length) throw new BadRequestException('Configura la ruta de aprobación de cotizaciones antes de solicitar la adjudicación.');
    if (configuracion.some((c) => !c.usuarioId && !c.rolAprobador)) {
      /*
       * Un nivel sin usuario y sin rol no lo puede aprobar nadie en
       * particular, y por lo tanto lo podía aprobar cualquiera: la
       * comprobación de facultad no tenía contra qué comparar. Se rechaza al
       * solicitar, que es cuando todavía se puede corregir la ruta.
       */
      throw new BadRequestException(
        'La ruta de aprobación de cotizaciones tiene niveles sin usuario ni rol asignado. Corrígela antes de solicitar la adjudicación.',
      );
    }

    await this.dataSource.transaction(async em => {
      const aprobaciones = em.getRepository(AprobacionDocumento);
      await em.getRepository(Cotizacion).save(cot);

      /*
       * ──────────────────────────────────────────────────────────────────────
       * Cada vuelta a aprobación es un CICLO nuevo, no un borrón
       * ----------------------------------------------------------------------
       * Aquí se borraban las filas anteriores. La entidad tiene un campo
       * `ciclo` que existe precisamente «para conservar el historial cuando un
       * documento vuelve a aprobación», y el borrado lo tiraba: quién aprobó
       * la vuelta anterior, cuándo y con qué comentario desaparecía sin
       * rastro. En un proceso de compras eso es justo lo que se le pide al
       * sistema cuando alguien pregunta por qué se adjudicó a ese proveedor.
       *
       * Se guarda además el importe sometido a aprobación: así, si el
       * documento cambia después, se puede demostrar sobre qué cifra se
       * autorizó.
       * ──────────────────────────────────────────────────────────────────────
       */
      const { max } = await aprobaciones
        .createQueryBuilder('a')
        .select('COALESCE(MAX(a.ciclo), 0)', 'max')
        .where('a.empresaId = :empresaId AND a.proceso = :proceso AND a.documentoId = :id', {
          empresaId, proceso: 'COTIZACION', id,
        })
        .getRawOne<{ max: string }>() ?? { max: '0' };
      const ciclo = Number(max ?? 0) + 1;

      // Lo que quedara pendiente de un ciclo anterior deja de estar vigente.
      await aprobaciones.createQueryBuilder().update()
        .set({ estado: 'CANCELADA' })
        .where('empresaId=:empresaId AND proceso=:proceso AND documentoId=:id AND estado=:estado', {
          empresaId, proceso: 'COTIZACION', id, estado: 'PENDIENTE',
        }).execute();

      await aprobaciones.save(configuracion.map(c => aprobaciones.create({
        empresaId, proceso: 'COTIZACION', documentoId: id, ciclo, nivel: c.orden,
        usuarioAprobadorId: c.usuarioId, rolAprobador: c.rolAprobador,
        solicitadoPorId: usuarioId, tiempoLimiteHoras: c.tiempoLimiteHoras,
        obligatorio: c.obligatorio,
        permiteAutoaprobacion: c.permiteAutoaprobacion,
        importeSolicitado: Number(cot.total ?? 0),
        documentoVersion: ciclo,
        fechaVencimiento: new Date(Date.now() + c.tiempoLimiteHoras * 3600000),
      })));
    });
    return this.obtenerPorId(id, empresaId);
  }

  async aprobar(id: string, empresaId: string, usuarioId: string, rol: string, comentario?: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    if (cot.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('La cotización no está pendiente de aprobación.');
    const paso = await this.siguientePaso(id, empresaId);
    this.exigirFacultadDeResolver(paso, usuarioId, rol, cot.solicitadoAprobacionPorId);
    paso.estado = 'APROBADA'; paso.resueltoPorId = usuarioId; paso.fechaResolucion = new Date(); paso.comentario = comentario?.trim();
    await this.aprobacionRepo.save(paso);
    const pendientes = await this.aprobacionRepo.count({ where: { empresaId, proceso: 'COTIZACION', documentoId: id, estado: 'PENDIENTE' } });
    if (pendientes) return this.obtenerPorId(id, empresaId);
    /*
     * ──────────────────────────────────────────────────────────────────────
     * La relación cargada gana sobre el `*Id`
     * ----------------------------------------------------------------------
     * `obtenerPorId` trae `aprobadoPor` como relación. Si un ciclo anterior ya
     * dejó a alguien ahí —`rechazar()` también escribe `aprobadoPorId`—, ese
     * objeto sigue colgado de la entidad, y al guardar, TypeORM escribe la FK
     * desde la RELACIÓN y pisa el id recién asignado.
     *
     * El efecto era una pista de auditoría falsa: la adjudicación quedaba
     * registrada a nombre de quien la había rechazado en la vuelta anterior,
     * no de quien acababa de aprobarla. Para un control de aprobaciones eso
     * es peor que no tener registro: dice algo, y dice algo falso.
     *
     * Se escribe con `update` sobre las columnas, sin la entidad cargada.
     * ──────────────────────────────────────────────────────────────────────
     */
    await this.cotizacionRepo.update(
      { id, empresaId },
      {
        estado: 'APROBADA',
        aprobadoPorId: usuarioId,
        fechaAprobacion: new Date(),
        comentarioAprobacion: comentario?.trim() || null,
      },
    );
    return this.obtenerPorId(id, empresaId);
  }

  async rechazar(id: string, empresaId: string, usuarioId: string, rol: string, comentario?: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    if (cot.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('La cotización no está pendiente de aprobación.');
    const paso = await this.siguientePaso(id, empresaId);
    this.exigirFacultadDeResolver(paso, usuarioId, rol, cot.solicitadoAprobacionPorId);
    paso.estado = 'RECHAZADA'; paso.resueltoPorId = usuarioId; paso.fechaResolucion = new Date(); paso.comentario = comentario?.trim();
    await this.aprobacionRepo.save(paso);
    await this.aprobacionRepo.createQueryBuilder().update().set({ estado: 'CANCELADA' })
      .where('empresaId=:empresaId AND proceso=:proceso AND documentoId=:id AND estado=:estado AND ciclo=:ciclo', {
        empresaId, proceso: 'COTIZACION', id, estado: 'PENDIENTE', ciclo: paso.ciclo,
      }).execute();
    // Mismo motivo que en aprobar(): la relación cargada pisaría el id.
    await this.cotizacionRepo.update(
      { id, empresaId },
      {
        estado: 'RECHAZADA',
        aprobadoPorId: usuarioId,
        fechaAprobacion: new Date(),
        comentarioAprobacion: comentario?.trim() || 'Adjudicación rechazada',
      },
    );
    return this.obtenerPorId(id, empresaId);
  }

  /**
   * El siguiente nivel por resolver del ciclo VIGENTE.
   *
   * Se ordena por ciclo descendente antes que por nivel: con el historial
   * conservado, un pendiente cancelado de una vuelta anterior no debe
   * adelantarse al nivel 1 de la vuelta actual.
   */
  private async siguientePaso(documentoId: string, empresaId: string) {
    const paso = await this.aprobacionRepo.findOne({
      where: { empresaId, proceso: 'COTIZACION', documentoId, estado: 'PENDIENTE' },
      order: { ciclo: 'DESC', nivel: 'ASC' },
    });
    if (!paso) throw new BadRequestException('La cotización no tiene un nivel pendiente configurado.');
    return paso;
  }

  /**
   * ¿Esta persona puede resolver este nivel?
   *
   * La condición estaba escrita en una sola línea sin paréntesis, repetida en
   * aprobar y en rechazar. Además de ilegible, dejaba un hueco: un nivel sin
   * usuario NI rol no comparaba contra nada, así que lo resolvía cualquiera.
   * Eso ya se impide al crear la ruta; aquí se vuelve a comprobar, porque una
   * ruta puede haberse configurado antes de esa regla.
   */
  /**
   * Quien puede resolver este nivel de adjudicación.
   *
   * La regla «quien solicita no resuelve» estaba escrita a mano dentro de
   * `aprobar()` y NO estaba en `rechazar()`. La asimetría dejaba que el mismo
   * comprador que pidió la adjudicación la rechazara —sin autoridad para
   * aprobarla, pero con poder de tumbarla antes de que otro la viera—. Tener
   * la regla en un solo lugar es lo que impide que la proxima ruta de salida
   * vuelva a olvidarla.
   *
   * Rechazar no es menos grave que aprobar: las dos cierran el ciclo y las dos
   * quedan en la pista de auditoría a nombre de quien las resuelve.
   */
  private exigirFacultadDeResolver(
    paso: AprobacionDocumento,
    usuarioId: string,
    rol?: string,
    solicitanteId?: string | null,
  ): void {
    if (solicitanteId && solicitanteId === usuarioId) {
      throw new BadRequestException(
        'Quien solicita la adjudicación no puede resolverla.',
      );
    }

    if (!paso.usuarioAprobadorId && !paso.rolAprobador) {
      throw new BadRequestException(
        'Este nivel de aprobación no tiene usuario ni rol asignado. Corrige la ruta antes de resolverlo.',
      );
    }

    if (paso.usuarioAprobadorId) {
      if (paso.usuarioAprobadorId !== usuarioId) {
        throw new BadRequestException('Esta aprobación está asignada a otro usuario.');
      }
      return;
    }

    if (
      normalizarRol(paso.rolAprobador) !== normalizarRol(rol) &&
      !esRolAdministrador(rol)
    ) {
      throw new BadRequestException('Esta aprobación corresponde a otro rol.');
    }
  }

  /**
   * `SELECCIONADA` es el estado que marca `OrdenesCompraService` al generar la
   * orden de compra. Este endpoint lo asignaba por separado y creaba un
   * callejón sin salida: `crearDesdeCotizacion` exige estado `APROBADA`, así
   * que una cotización marcada como seleccionada por aquí ya nunca podía
   * convertirse en orden, y no existe forma de devolverla a `APROBADA`. La
   * requisición quedaba atascada en `COTIZANDO` de forma permanente.
   *
   * Se conserva el endpoint por compatibilidad, pero es idempotente y no
   * puede dejar el documento en un estado del que no se pueda salir: la
   * adjudicación real ocurre al generar la orden.
   */
  async seleccionar(id: string, empresaId: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    this.validarProveedorOperable(cot.proveedor);
    if (cot.estado === 'SELECCIONADA') return cot;
    if (cot.estado !== 'APROBADA') {
      throw new BadRequestException(
        'Primero debe aprobarse la adjudicación de la cotización.',
      );
    }
    /*
     * No se persiste el cambio de estado: generar la orden de compra es lo
     * que adjudica. Marcarlo aquí sólo bloqueaba ese paso.
     */
    return cot;
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cot = await this.cotizacionRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'requisicion', 'ordenesCompra', 'solicitadoAprobacionPor', 'aprobadoPor'],
    });
    if (!cot) throw new NotFoundException('Cotización no encontrada');
    return cot;
  }

  private validarProveedorOperable(proveedor?: Proveedor | null) {
    if (
      !proveedor ||
      !proveedor.activo ||
      !['APROBADO', 'CONDICIONADO'].includes(proveedor.estadoHomologacion)
    ) {
      throw new BadRequestException(
        'El proveedor está inactivo, bloqueado o aún no ha sido homologado.',
      );
    }
  }
}

/**
 * Cuatro decimales, que es la escala de las columnas de importe. Redondear en
 * cada paso —y no sólo al final— evita que la suma de las partidas y el total
 * del documento difieran en un centavo, que es justo la diferencia que impide
 * que una orden se dé por liquidada.
 */
function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}
