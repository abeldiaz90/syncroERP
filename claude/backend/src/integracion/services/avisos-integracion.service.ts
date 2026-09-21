import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash } from 'node:crypto';

import { AvisoIntegracion, EstadoAviso } from '../entities/aviso-integracion.entity';
import { VinculoIntegracion } from '../entities/vinculo-integracion.entity';
import { TipoVinculo } from '../integracion.constants';

/**
 * ============================================================================
 * Buzón de entrada del registro externo
 * ----------------------------------------------------------------------------
 * Recibe, guarda y CLASIFICA los avisos que manda el core. No los aplica.
 *
 * La distinción importa. Aplicar un pago en el ERP mueve efectivo: exige una
 * cuenta de caja o banco, un método, genera asiento y puede timbrar un CFDI.
 * Nada de eso viaja en el aviso. Elegirlo por omisión sería inventar un
 * movimiento de dinero que nadie autorizó de este lado, y en un ERP contable un
 * movimiento inventado no se borra: se cancela, y queda en la póliza.
 *
 * Lo que sí hace es separar el ECO del HECHO NUEVO. La mayoría de los avisos
 * son el eco de algo que el ERP mismo originó —el ERP desembolsa, el core avisa
 * que desembolsó— y ésos no piden nada. El valor está en el resto: un cobro
 * capturado directamente en el portal del core, un crédito dado de alta allá,
 * un castigo. Ésos son los que separan las dos carteras en silencio, y son los
 * que quedan PENDIENTE.
 *
 * SOBRE LA FORMA DEL AVISO. Ajustada con un aviso REAL de esta instalación, no
 * con documentación. Fineract no manda los identificadores en la raíz: van
 * dentro de `response`, y ahí `resourceId` es LA TRANSACCIÓN, no el préstamo
 * —el préstamo es `response.loanId`—. Confundirlos no habría fallado: habría
 * buscado un crédito con el número de un pago, no lo habría encontrado, y el
 * aviso habría quedado huérfano por una razón falsa, indistinguible de la
 * verdadera. El cuerpo crudo se sigue guardando siempre.
 * ============================================================================
 */

/** Qué tipo de vínculo corresponde a cada entidad del core. */
const VINCULO_POR_ENTIDAD: Record<string, TipoVinculo> = {
  LOAN: TipoVinculo.CREDITO,
  LOANTRANSACTION: TipoVinculo.PAGO_COBRANZA,
  CLIENT: TipoVinculo.CLIENTE,
  LOANPRODUCT: TipoVinculo.PRODUCTO_CREDITO,
  OFFICE: TipoVinculo.OFICINA,
  JOURNALENTRY: TipoVinculo.POLIZA,
};

export interface AvisoEntrante {
  entidad: string;
  accion: string;
  tenant?: string | null;
  cuerpo: unknown;
  cuerpoTexto: string;
}

export interface ResultadoRecepcion {
  guardado: boolean;
  duplicado: boolean;
  estado: EstadoAviso;
  id?: string;
}

@Injectable()
export class AvisosIntegracionService {
  private readonly logger = new Logger(AvisosIntegracionService.name);

  constructor(
    @InjectRepository(AvisoIntegracion)
    private readonly avisos: Repository<AvisoIntegracion>,
    @InjectRepository(VinculoIntegracion)
    private readonly vinculos: Repository<VinculoIntegracion>,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Clave que autentica al core. Sin ella el receptor se comporta como si la
   * ruta no existiera: una integración a medio configurar no debe dejar un
   * buzón abierto al mundo.
   *
   * Se exige longitud mínima porque una clave corta en una URL es una clave que
   * se adivina, y ésta viaja en la dirección —el hook web de Fineract no manda
   * encabezados propios, así que no hay dónde más ponerla—.
   */
  get claveConfigurada(): string | null {
    const clave = (this.cfg.get<string>('FINERACT_WEBHOOK_TOKEN') ?? '').trim();
    if (!clave) return null;
    if (clave.length < 24) {
      this.logger.error(
        'FINERACT_WEBHOOK_TOKEN tiene menos de 24 caracteres. El receptor de avisos queda apagado.',
      );
      return null;
    }
    return clave;
  }

  claveValida(candidata: string): boolean {
    const esperada = this.claveConfigurada;
    if (!esperada) return false;
    // Longitudes distintas se descartan antes; comparar sin igualarlas primero
    // haría que el tiempo de respuesta revelara cuántos caracteres coinciden.
    if (candidata.length !== esperada.length) return false;
    let diferencia = 0;
    for (let i = 0; i < esperada.length; i += 1) {
      diferencia |= esperada.charCodeAt(i) ^ candidata.charCodeAt(i);
    }
    return diferencia === 0;
  }

  // ── Recepción ─────────────────────────────────────────────────────────────

  async recibir(entrante: AvisoEntrante): Promise<ResultadoRecepcion> {
    const cuerpo = this.comoObjeto(entrante.cuerpo);
    const idExterno = this.idExternoDe(entrante.entidad, cuerpo);
    const huella = this.huellaDe(entrante, idExterno);

    const previo = await this.avisos.findOne({ where: { huella } });
    if (previo) {
      return { guardado: false, duplicado: true, estado: previo.estado, id: previo.id };
    }

    const tipo = VINCULO_POR_ENTIDAD[entrante.entidad.toUpperCase()] ?? null;
    const vinculo =
      tipo && idExterno ? await this.vinculoUnico(tipo, idExterno) : null;

    /*
     * ¿El ERP originó este movimiento? Si el pago salió de aquí, existe un
     * vínculo PAGO_COBRANZA con el identificador de la transacción del core.
     * Es la diferencia entre «alguien cobró allá y aquí no está» y «el core
     * confirma lo que el ERP ya registró».
     */
    const idTransaccion = this.idTransaccionDe(cuerpo);
    const vinculoPago = idTransaccion
      ? await this.vinculoUnico(TipoVinculo.PAGO_COBRANZA, idTransaccion)
      : null;

    const clasificacion = this.clasificar(entrante, vinculo, idExterno, vinculoPago);

    const aviso = this.avisos.create({
      empresaId: vinculo?.empresaId ?? vinculoPago?.empresaId ?? null,
      proveedor: vinculo?.proveedor ?? vinculoPago?.proveedor ?? 'fineract',
      entidad: entrante.entidad.toUpperCase(),
      accion: entrante.accion.toUpperCase(),
      tenant: entrante.tenant ?? null,
      idExterno,
      entidadId: vinculo?.entidadId ?? null,
      tipoVinculo: tipo,
      cuerpo,
      // Sólo se guarda el texto crudo cuando NO era JSON; duplicarlo siempre
      // engordaría la tabla sin agregar nada.
      cuerpoTexto: cuerpo ? null : entrante.cuerpoTexto.slice(0, 20000),
      huella,
      estado: clasificacion.estado,
      diagnostico: clasificacion.diagnostico,
      recibidoEn: new Date(),
    });

    try {
      const guardado = await this.avisos.save(aviso);
      if (clasificacion.estado === EstadoAviso.PENDIENTE) {
        this.logger.warn(
          `Aviso sin reflejo en el ERP · ${aviso.entidad}/${aviso.accion} · recurso ${idExterno ?? '—'} · ${clasificacion.diagnostico}`,
        );
      }
      return { guardado: true, duplicado: false, estado: guardado.estado, id: guardado.id };
    } catch (error) {
      /*
       * Dos entregas simultáneas del mismo aviso chocan aquí contra el índice
       * de la huella. Es el resultado correcto —el hecho se guardó una vez— y
       * no un fallo que haya que contarle al core.
       */
      const existente = await this.avisos.findOne({ where: { huella } });
      if (existente) {
        return { guardado: false, duplicado: true, estado: existente.estado, id: existente.id };
      }
      throw error;
    }
  }

  // ── Clasificación ─────────────────────────────────────────────────────────

  private clasificar(
    entrante: AvisoEntrante,
    vinculo: VinculoIntegracion | null,
    idExterno: string | null,
    vinculoPago: VinculoIntegracion | null = null,
  ): { estado: EstadoAviso; diagnostico: string } {
    const entidad = entrante.entidad.toUpperCase();
    const accion = entrante.accion.toUpperCase();

    if (!idExterno) {
      return {
        estado: EstadoAviso.PENDIENTE,
        diagnostico:
          'El aviso no trae un identificador de recurso reconocible; no se pudo saber a qué apunta.',
      };
    }

    if (!vinculo && vinculoPago) {
      return {
        estado: EstadoAviso.IGNORADO,
        diagnostico:
          `El core confirma el pago ${vinculoPago.entidadId} que el ERP ya tiene registrado, ` +
          'aunque el crédito no esté vinculado aquí.',
      };
    }

    if (!vinculo) {
      return {
        estado: EstadoAviso.PENDIENTE,
        diagnostico:
          `El ERP no conoce ${entidad} ${idExterno}: se creó directamente en el core. ` +
          'Hay que darlo de alta aquí o decidir que vive sólo allá.',
      };
    }

    /*
     * Un cobro es el caso que justifica todo esto. Si el ERP originó el pago,
     * existe un vínculo PAGO_COBRANZA con el id de la transacción y el aviso es
     * su eco. Si no existe, alguien cobró en el portal del core y el ERP no lo
     * sabe: ese dinero entró y aquí no está registrado.
     */
    if (entidad === 'LOAN' && /REPAYMENT|PREPAY|RECOVERY|REFUND/.test(accion)) {
      if (vinculoPago) {
        return {
          estado: EstadoAviso.IGNORADO,
          diagnostico:
            `El core confirma el pago ${vinculoPago.entidadId} que el ERP ya tiene registrado.`,
        };
      }
      /*
       * Un cobro nacido en el core no pide captura manual: lo aplica el
       * reflejo de cartera, con la cuenta que la empresa designó para eso.
       *
       * Este texto decía «hay que capturarlo aquí con su cuenta de caja o
       * banco», y era verdad cuando se escribió y dejó de serlo cuando entró
       * el aplicador. El aviso se clasifica al recibirlo —segundos después del
       * webhook— y el reflejo corre después, así que el operador leía una
       * tarea que el sistema ya estaba haciendo por él. Pedir trabajo que no
       * hace falta cuesta más credibilidad que no avisar.
       *
       * Queda PENDIENTE a propósito: es lo que hace que el aviso siga visible
       * si el reflejo NO llega a aplicarlo. Al aplicarlo, el propio reflejo lo
       * cierra y anota qué registró. Mientras está pendiente dice qué se
       * espera que pase, no qué tiene que hacer alguien.
       */
      return {
        estado: EstadoAviso.PENDIENTE,
        diagnostico:
          `Cobro registrado en el core sobre el crédito ${idExterno}. El reflejo de cartera ` +
          'lo aplicará en el ERP contra la cuenta designada para la cobranza nacida fuera; ' +
          'este aviso se cierra solo cuando quede aplicado. Si sigue pendiente, es que no ' +
          'se pudo: el motivo aparece aquí.',
      };
    }

    if (entidad === 'LOAN' && /WRITEOFF|CLOSE|REJECT|WITHDRAW|CHARGEOFF/.test(accion)) {
      return {
        estado: EstadoAviso.PENDIENTE,
        diagnostico:
          `El crédito ${idExterno} cambió de estado en el core (${accion}). El ERP sigue con su ` +
          'propio estado hasta que alguien decida reflejarlo.',
      };
    }

    /*
     * Lo demás sobre un recurso que el ERP ya conoce es el eco de algo que el
     * ERP mismo originó. Se guarda —sirve para auditar el ida y vuelta— pero no
     * pide nada de nadie.
     */
    return {
      estado: EstadoAviso.IGNORADO,
      diagnostico: `Eco de una operación que el ERP originó sobre ${entidad} ${idExterno}.`,
    };
  }

  // ── Lectura y resolución ──────────────────────────────────────────────────

  async listar(empresaId: string, estado?: EstadoAviso, limite = 100) {
    const donde = estado ? { empresaId, estado } : { empresaId };
    return this.avisos.find({
      where: donde,
      order: { recibidoEn: 'DESC' },
      take: Math.min(Math.max(limite, 1), 500),
    });
  }

  /** Los que llegaron sin empresa: recursos que el ERP no conoce. */
  async listarHuerfanos(limite = 100) {
    return this.avisos.find({
      where: { empresaId: IsNull() },
      order: { recibidoEn: 'DESC' },
      take: Math.min(Math.max(limite, 1), 500),
    });
  }

  async resumen(empresaId: string) {
    const filas = await this.avisos
      .createQueryBuilder('a')
      .select('a.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .where('a.empresaId = :empresaId', { empresaId })
      .groupBy('a.estado')
      .getRawMany<{ estado: string; total: string }>();
    return filas.map((f) => ({ estado: f.estado, total: Number(f.total) }));
  }

  /**
   * Cierra un aviso a mano.
   *
   * No aplica nada: registra que una persona lo miró y qué decidió. Es
   * deliberado — el reflejo real se hace con la operación del ERP que
   * corresponda, con sus validaciones, y este buzón sólo deja de señalarlo.
   */
  async resolver(
    id: string,
    empresaId: string,
    usuarioId: string | undefined,
    decision: 'PROCESADO' | 'DESCARTADO',
    nota?: string,
  ) {
    const aviso = await this.avisos.findOne({ where: { id, empresaId } });
    if (!aviso) return null;
    aviso.estado = decision === 'PROCESADO' ? EstadoAviso.PROCESADO : EstadoAviso.DESCARTADO;
    aviso.resueltoPor = usuarioId ?? null;
    aviso.resueltoEn = new Date();
    if (nota) aviso.diagnostico = `${aviso.diagnostico ?? ''} · ${nota}`.slice(0, 500);
    return this.avisos.save(aviso);
  }

  /**
   * Cierra los avisos que describen un movimiento que el ERP ya reflejó.
   *
   * Lo llama el reflejo de cartera al aplicar una transacción nacida fuera. Es
   * la pieza que convierte la bandeja en bitácora: sin esto, cada cobro del
   * core deja un pendiente que nadie tiene que atender —el sistema ya lo
   * atendió— y la bandeja se llena de tareas falsas hasta que deja de leerse.
   *
   * Se busca por el identificador de la TRANSACCIÓN, no por el del crédito: un
   * crédito recibe muchos cobros y cerrarlos todos porque se aplicó uno
   * borraría de la vista los que sí quedaron sin reflejar.
   *
   * Devuelve cuántos cerró. Cero es normal: el cobro pudo nacer en el ERP, y
   * entonces nunca hubo aviso que cerrar.
   */
  async marcarReflejado(
    empresaId: string,
    idTransaccionExterna: string,
    detalle: string,
  ): Promise<number> {
    const candidatos = await this.avisos.find({
      where: { empresaId, estado: EstadoAviso.PENDIENTE },
      take: 500,
    });
    let cerrados = 0;
    for (const aviso of candidatos) {
      const cuerpo = this.comoObjeto(aviso.cuerpo);
      if (this.idTransaccionDe(cuerpo) !== idTransaccionExterna) continue;
      aviso.estado = EstadoAviso.PROCESADO;
      aviso.resueltoEn = new Date();
      // Sin `resueltoPor`: no lo resolvió una persona, y decir que sí
      // atribuiría a alguien una decisión que no tomó.
      aviso.resueltoPor = null;
      aviso.diagnostico = `${aviso.diagnostico ?? ''} · ${detalle}`.slice(0, 500);
      await this.avisos.save(aviso);
      cerrados += 1;
    }
    return cerrados;
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  /**
   * Resuelve un identificador externo a UN vínculo, o a ninguno.
   *
   * Deliberadamente devuelve null cuando hay más de una coincidencia. Los
   * identificadores del proveedor son únicos dentro de SU inquilino, no entre
   * inquilinos: si dos empresas del ERP comparten el mismo tenant, el préstamo
   * 14 existe en las dos y `findOne` devolvería la primera que encuentre —el
   * aviso de una empresa acabaría en el buzón de la otra, atribuido a un
   * cliente que no es—.
   *
   * Ante la duda no se adivina: el aviso queda sin empresa y aparece en la
   * lista de huérfanos, que es visible y se revisa. Una atribución equivocada,
   * en cambio, se ve perfectamente normal.
   */
  private async vinculoUnico(
    tipo: TipoVinculo,
    idExterno: string,
  ): Promise<VinculoIntegracion | null> {
    const encontrados = await this.vinculos.find({
      where: { tipo, idExterno },
      take: 2,
    });
    if (encontrados.length === 1) return encontrados[0];
    if (encontrados.length > 1) {
      this.logger.warn(
        `El identificador externo ${tipo}/${idExterno} corresponde a más de una empresa. ` +
          'El aviso se deja sin atribuir para no asignarlo a la equivocada.',
      );
    }
    return null;
  }

  private comoObjeto(valor: unknown): Record<string, unknown> | null {
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  }

  /**
   * Saca el identificador del recurso del cuerpo.
   *
   * Se prueban varios nombres porque el core no manda el mismo para todas las
   * entidades y porque la forma exacta todavía no se ha observado en esta
   * instalación. El orden importa: el id específico de la entidad manda sobre
   * `resourceId`, que en una transacción de crédito es la transacción y no el
   * crédito.
   */
  private idExternoDe(entidad: string, cuerpo: Record<string, unknown> | null): string | null {
    if (!cuerpo) return null;
    const candidatos: Record<string, string[]> = {
      LOAN: ['loanId', 'resourceId'],
      LOANTRANSACTION: ['resourceId', 'transactionId'],
      CLIENT: ['clientId', 'resourceId'],
      LOANPRODUCT: ['resourceId', 'loanProductId'],
      OFFICE: ['officeId', 'resourceId'],
      JOURNALENTRY: ['resourceId', 'transactionId'],
    };
    const llaves = candidatos[entidad.toUpperCase()] ?? ['resourceId', 'id'];

    /*
     * El aviso trae tres capas: `request` (lo que se pidió), `response` (lo que
     * el core hizo) y la raíz (contexto: quién y cuándo). Los identificadores
     * del recurso viven en `response`; la raíz sólo trae `clientId` y
     * `officeId`, y tomar de ahí produciría el identificador de otra cosa.
     */
    const respuesta =
      cuerpo.response && typeof cuerpo.response === 'object'
        ? (cuerpo.response as Record<string, unknown>)
        : {};

    for (const llave of llaves) {
      for (const fuente of [respuesta, cuerpo]) {
        const valor = fuente[llave];
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          return String(valor).trim();
        }
      }
    }
    return null;
  }

  /**
   * La transacción del core, cuando el aviso es de un movimiento.
   *
   * Se lee aparte del préstamo porque es lo que permite reconocer el ECO: un
   * pago que el ERP originó tiene un vínculo PAGO_COBRANZA con este mismo
   * identificador. Sin él, todo cobro parecería nuevo y el buzón pediría
   * capturar de nuevo lo que el ERP ya tiene registrado.
   */
  private idTransaccionDe(cuerpo: Record<string, unknown> | null): string | null {
    const respuesta =
      cuerpo?.response && typeof cuerpo.response === 'object'
        ? (cuerpo.response as Record<string, unknown>)
        : null;
    const valor = respuesta?.resourceId;
    return valor === undefined || valor === null || String(valor).trim() === ''
      ? null
      : String(valor).trim();
  }

  private huellaDe(entrante: AvisoEntrante, idExterno: string | null): string {
    return createHash('sha256')
      .update(
        [
          entrante.tenant ?? '',
          entrante.entidad.toUpperCase(),
          entrante.accion.toUpperCase(),
          idExterno ?? '',
          entrante.cuerpoTexto,
        ].join('|'),
      )
      .digest('hex');
  }
}
