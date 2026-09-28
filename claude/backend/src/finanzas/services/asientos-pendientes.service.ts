import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';

import {
  AsientoPendiente,
  EstadoAsiento,
  TipoAsiento,
} from '../entities/asiento-pendiente.entity';
import { MotorContableService } from './motor-contable.service';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import { esViolacionUnicidad } from '../../common/database/errores-sql';

/**
 * ============================================================================
 * SyncroERP · Bitácora y reintento de asientos contables
 * ----------------------------------------------------------------------------
 * Envuelve al motor contable. En lugar de:
 *
 *     this.motorContable.generarAsientoDeVenta(datos)
 *       .catch(e => console.error(e.message));
 *
 * se escribe:
 *
 *     this.asientos.intentar(TipoAsiento.VENTA, datos, empresaId, folio);
 *
 * La diferencia: si falla, queda registrado, se reintenta solo con espera
 * creciente, y si agota los intentos aparece en una pantalla para que alguien
 * lo resuelva. La operación de negocio nunca se bloquea.
 *
 * ESPERA CRECIENTE
 * Cinco intentos, con cuatro esperas entre ellos:
 *
 *     intento 1 · 1 min · intento 2 · 5 min · intento 3 · 15 min ·
 *     intento 4 · 1 h · intento 5 → FALLIDO
 *
 * La escala decía «1 min → 5 min → 15 min → 1 h → 4 h» y la espera se elegía
 * con el número de intentos YA consumidos, así que la primera espera real era
 * de 5 minutos y la de 4 h no llegaba a usarse nunca: quedaba un peldaño
 * escrito que ningún asiento pisaba. Son cuatro esperas y aquí están las
 * cuatro.
 *
 * Un error de configuración — una categoría sin cuenta contable — no se
 * arregla solo por reintentar, y machacar la base cada minuto no ayuda a
 * nadie. Cinco intentos espaciados cubren las fallas transitorias (la base
 * ocupada, un bloqueo momentáneo) y dejan las de configuración a la vista
 * rápido.
 * ============================================================================
 */

const ESPERAS_MINUTOS = [1, 5, 15, 60];
const MAX_INTENTOS = ESPERAS_MINUTOS.length + 1;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Los documentos que esperan a su asiento
 * --------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 28-sep-2026 contra la instalación
 *
 * El cobro de City Ledger de $1,200 estaba así: `estadoContable: 'PENDIENTE'`,
 * `polizaId: null`. Y su asiento —`a1a4f6be…`— estaba **GENERADO**, con su
 * póliza `d2b2a408…`. La contabilidad se hizo; el cobro no se enteró nunca.
 *
 * El motivo: cada módulo escribe el resultado en su documento en el MISMO sitio
 * donde llama a `reintentarAhora` justo después de confirmar la operación. Si
 * ese primer intento falla —y el de este cobro falló: la cuenta bancaria no
 * tenía cuenta contable enlazada— el asiento se queda en la cola y se genera
 * después, por el cron o por el botón de «Asientos pendientes». **Y ahí ya no
 * hay nadie que vuelva a tocar el documento.** Se queda en PENDIENTE para
 * siempre.
 *
 * No es cosmético: `COBROS_CITY_LEDGER_SIN_CONTABILIZAR` es un hallazgo de
 * severidad CRÍTICA del diagnóstico de integridad, y con él la instalación
 * entera salía **BLOQUEADO**. Un control que no se puede satisfacer se acaba
 * ignorando, y el día que haya un cobro de verdad sin contabilizar se verá
 * igual que ayer.
 *
 * LA REGLA: quien pone el asiento en GENERADO avisa al documento. Aquí, en un
 * solo sitio, y no repartido por cada módulo —que es lo que dejó el hueco—.
 *
 * Se declara a mano porque la relación no está en el código: cada tabla nombra
 * sus columnas a su manera —`importaciones_inventario` las lleva con guión
 * bajo— y deducirlo sería adivinar. Son cinco.
 * ══════════════════════════════════════════════════════════════════════════
 */
const DOCUMENTOS_QUE_ESPERAN: ReadonlyArray<{
  tabla: string;
  asiento: string;
  estado: string;
  poliza: string;
}> = [
  { tabla: 'hoteleria_city_ledger_cobros', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'folios', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'pagos_proveedor', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'pagos_cobranza', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'importaciones_inventario', asiento: 'asiento_pendiente_id', estado: 'estado_contable', poliza: 'poliza_id' },
];

@Injectable()
export class AsientosPendientesService {
  private readonly logger = new Logger(AsientosPendientesService.name);

  constructor(
    @InjectRepository(AsientoPendiente)
    private readonly repo: Repository<AsientoPendiente>,
    private readonly motorContable: MotorContableService,
  ) {}

  /* ══ PUNTO DE ENTRADA ════════════════════════════════════════════════════ */

  /**
   * Registra el evento contable dentro de la MISMA transacción de negocio.
   * Se usa cuando intentar crear la póliza antes del commit podría dejar una
   * póliza huérfana si la operación principal revierte. El cron la procesa
   * únicamente después de que la transacción confirme.
   */
  async encolarEnTransaccion(
    manager: EntityManager,
    tipo: TipoAsiento,
    payload: Record<string, unknown>,
    empresaId: string,
    folioDocumento?: string,
    documentoId?: string,
  ): Promise<AsientoPendiente> {
    const repo = manager.getRepository(AsientoPendiente);
    if (documentoId) {
      const existente = await repo.findOne({
        where: { empresaId, tipo, documentoId },
      });
      if (existente) {
        if (existente.estado !== EstadoAsiento.GENERADO) {
          existente.payload = JSON.stringify(payload);
          existente.folioDocumento = folioDocumento;
          existente.estado = EstadoAsiento.PENDIENTE;
          existente.proximoIntento = new Date();
          /*
           * `intentos` vuelve a cero. Es un evento NUEVO —otro periodo, otra
           * corrida, el mismo documento recalculado— y el payload que se acaba
           * de sobrescribir lo confirma. Conservar el contador significaba que
           * una fila que ya había agotado la escalera renaciera con el
           * contador a tope: el primer intento del cron la devolvía a FALLIDO
           * sin haber esperado un solo peldaño, y el desgaste del periodo
           * viejo se cobraba sobre el periodo nuevo.
           *
           * El error que se limpia no se tira: queda por escrito de dónde
           * venía esta fila, porque es lo único que explica por qué el mismo
           * documento vuelve a encolarse.
           */
          if (existente.ultimoError) {
            existente.notaResolucion =
              `Reencolado con datos nuevos. Error previo: ${existente.ultimoError}`.slice(
                0,
                500,
              );
          }
          existente.intentos = 0;
          existente.ultimoError = null;
          return repo.save(existente);
        }
        return existente;
      }
    }
    return repo.save(
      repo.create({
        empresaId,
        tipo,
        documentoId,
        folioDocumento,
        payload: JSON.stringify(payload),
        estado: EstadoAsiento.PENDIENTE,
        intentos: 0,
        ultimoError: null,
        proximoIntento: new Date(),
      }),
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * Un peldaño de la escalera
   * --------------------------------------------------------------------------
   * La espera creciente que promete la cabecera —1 min → 5 → 15 → 1 h → 4 h, y
   * después FALLIDO— estaba escrita una sola vez, dentro del `catch` del cron.
   * Y el cron era justamente el camino que casi nunca llegaba a ver la fila:
   * cada módulo encola dentro de su transacción y llama a `reintentarAhora` en
   * cuanto confirma, que es lo correcto —el usuario merece saber en el acto si
   * su póliza se hizo—, pero ese camino marcaba FALLIDO a la primera falla y
   * ponía `proximoIntento` en nulo. Como el cron sólo recoge PENDIENTE, un
   * bloqueo de un segundo bastaba para dejar el asiento muerto en la cola
   * esperando a que una persona abriera la bandeja.
   *
   * Aquí está la escalera, una sola vez, y la suben los tres caminos.
   * ══════════════════════════════════════════════════════════════════════════
   */
  private aplicarPeldano(
    asiento: AsientoPendiente,
    mensaje: string,
  ): EstadoAsiento.PENDIENTE | EstadoAsiento.FALLIDO {
    asiento.intentos += 1;
    asiento.ultimoError = mensaje.slice(0, 1000);
    asiento.fechaUltimoIntento = new Date();

    if (asiento.intentos >= MAX_INTENTOS) {
      asiento.estado = EstadoAsiento.FALLIDO;
      asiento.proximoIntento = null;
    } else {
      asiento.estado = EstadoAsiento.PENDIENTE;
      // `intentos - 1`: la espera que toca es la que sigue al intento que
      // acaba de fallar. Indexando por `intentos` se saltaba el primer peldaño.
      asiento.proximoIntento = new Date(
        Date.now() + ESPERAS_MINUTOS[asiento.intentos - 1] * 60_000,
      );
    }

    return asiento.estado as
      | EstadoAsiento.PENDIENTE
      | EstadoAsiento.FALLIDO;
  }

  /** Cuánto falta para el siguiente intento, en palabras. */
  private esperaEnPalabras(asiento: AsientoPendiente): string {
    if (asiento.estado === EstadoAsiento.FALLIDO) {
      return 'Agotó los reintentos automáticos y requiere revisión manual.';
    }
    const minutos =
      ESPERAS_MINUTOS[asiento.intentos - 1] ?? ESPERAS_MINUTOS[0];
    const cuando =
      minutos >= 60 ? `${minutos / 60} h` : `${minutos} min`;
    return `Sigue en la cola: se reintentará solo en ${cuando}.`;
  }

  /**
   * Intenta generar el asiento. Si falla, lo registra para reintento.
   * NUNCA lanza: quien la llama no debe verse afectado por un problema
   * contable.
   */
  async intentar(
    tipo: TipoAsiento,
    payload: Record<string, unknown>,
    empresaId: string,
    folioDocumento?: string,
    documentoId?: string,
  ): Promise<{ estado: 'GENERADO' | 'PENDIENTE'; asientoPendienteId?: string; polizaId?: string }> {
    try {
      const polizaId = await this.ejecutar(tipo, payload);
      return { estado: 'GENERADO', polizaId };
      // Éxito al primer intento: no se guarda nada. La bitácora es de fallas,
      // no un duplicado del libro diario.
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);

      this.logger.error(
        `Asiento ${tipo} falló${folioDocumento ? ` (${folioDocumento})` : ''}: ${mensaje}. ` +
          `Queda en cola de reintento.`,
      );

      try {
        if (documentoId) {
          const existente = await this.repo.findOne({
            where: {
              empresaId,
              tipo,
              documentoId,
              estado: In([
                EstadoAsiento.PENDIENTE,
                EstadoAsiento.REINTENTANDO,
                EstadoAsiento.FALLIDO,
              ]),
            },
          });
          if (existente) {
            /*
             * La fila previa no sólo recibe el error nuevo: avanza un peldaño
             * y vuelve a la cola. Antes se le escribía el mensaje y se la
             * dejaba en el estado en que estuviera; si estaba FALLIDA seguía
             * FALLIDA y sin `proximoIntento`, así que el evento nuevo nacía ya
             * descartado y nadie lo reintentaba jamás.
             */
            this.aplicarPeldano(existente, mensaje);
            const guardado = await this.repo.save(existente);
            return { estado: 'PENDIENTE', asientoPendienteId: guardado.id };
          }
        }
        const guardado = await this.repo.save(
          this.repo.create({
            empresaId,
            tipo,
            documentoId,
            folioDocumento,
            payload: JSON.stringify(payload),
            estado: EstadoAsiento.PENDIENTE,
            intentos: 1,
            ultimoError: mensaje.slice(0, 1000),
            fechaUltimoIntento: new Date(),
            proximoIntento: new Date(Date.now() + ESPERAS_MINUTOS[0] * 60_000),
          }),
        );
        return { estado: 'PENDIENTE', asientoPendienteId: guardado.id };
      } catch (errorAlGuardar) {
        try {
          if (documentoId && esViolacionUnicidad(errorAlGuardar)) {
            // Otra instancia creó la fila entre el findOne y el INSERT. La
            // restricción única evita el duplicado; actualizamos la ganadora.
            const concurrente = await this.repo.findOne({
              where: { empresaId, tipo, documentoId },
            });
            if (concurrente) {
              concurrente.ultimoError = mensaje.slice(0, 1000);
              concurrente.fechaUltimoIntento = new Date();
              if (concurrente.estado !== EstadoAsiento.GENERADO) {
                concurrente.payload = JSON.stringify(payload);
              }
              const guardado = await this.repo.save(concurrente);
              return { estado: 'PENDIENTE', asientoPendienteId: guardado.id };
            }
          }
        } catch {
          // Se conserva el contrato: una falla de bitácora nunca derriba la
          // operación de negocio que ya fue confirmada.
        }
        // Si ni siquiera se puede registrar la falla, al menos que quede en
        // el log del servidor con el payload completo para reconstruirlo.
        this.logger.error(
          `No se pudo registrar el asiento pendiente. Payload: ${JSON.stringify(payload)}`,
          errorAlGuardar instanceof Error ? errorAlGuardar.stack : undefined,
        );
        return { estado: 'PENDIENTE' };
      }
    }
  }

  /** Despacha al método correspondiente del motor contable. */
  private async ejecutar(
    tipo: TipoAsiento,
    payload: Record<string, unknown>,
  ): Promise<string | undefined> {
    const motor = this.motorContable as unknown as Record<
      string,
      (d: unknown) => Promise<unknown>
    >;

    const metodo: Partial<Record<TipoAsiento, string>> = {
      [TipoAsiento.VENTA]: 'generarAsientoDeVenta',
      [TipoAsiento.CANCELACION_VENTA]: 'generarAsientoDeCancelacionVenta',
      [TipoAsiento.DEVOLUCION_VENTA]: 'generarAsientoDeDevolucionVenta',
      [TipoAsiento.COMPRA]: 'generarAsientoDeCompra',
      [TipoAsiento.PAGO_PROVEEDOR]: 'generarAsientoDePagoProveedor',
      [TipoAsiento.COBRANZA]: 'generarAsientoDeCobranza',
      [TipoAsiento.CANCELACION_COBRANZA]: 'generarAsientoDeCancelacionCobranza',
      [TipoAsiento.AJUSTE_DEVOLUCION_EXTERNA]: 'generarAsientoDeAjusteDevolucionExterna',
      [TipoAsiento.SALIDA_INVENTARIO]: 'generarAsientoDeSalida',
      [TipoAsiento.INVENTARIO_INICIAL]: 'generarAsientoDeInventarioInicial',
      [TipoAsiento.CIERRE_CAJA]: 'generarAsientoDeCierreCaja',
      [TipoAsiento.AJUSTE_INVENTARIO]: 'generarAsientoDeAjusteInventario',
      [TipoAsiento.HOSPEDAJE]: 'generarAsientoDeHospedaje',
      /*
       * NÓMINA no está aquí a propósito. Sus pólizas las genera
       * `NominaAvanzadaService` con `crearPolizaManualEnTransaccion`, porque
       * el asiento depende del desglose por concepto, empleado y centro de
       * costo, que sólo existe dentro de ese contexto.
       *
       * El mapeo anterior apuntaba a `generarAsientoDeNomina`, un método que
       * NUNCA existió en el motor contable: no explotaba sólo porque nadie
       * encolaba ese tipo. Se retira para que el despachador no prometa lo que
       * no puede cumplir; si algún día se encola un TipoAsiento.NOMINA, fallará
       * con «no implementa» en el primer intento y quedará visible en la
       * bandeja de asientos pendientes en lugar de fallar cinco veces.
       */
      [TipoAsiento.DEPRECIACION]: 'generarAsientoDeDepreciacion',
      [TipoAsiento.BAJA_ACTIVO]: 'generarAsientoDeBajaActivo',
      [TipoAsiento.DEVOLUCION_PROVEEDOR]: 'generarAsientoDeDevolucionProveedor',
      [TipoAsiento.TESORERIA]: 'generarAsientoDeTesoreria',
    };

    const nombre = metodo[tipo];
    const fn = motor[nombre];

    if (typeof fn !== 'function') {
      throw new Error(
        `El motor contable no implementa "${nombre}". ` +
          `El asiento de tipo ${tipo} no puede generarse todavía.`,
      );
    }

    // JSON no conserva objetos Date. Sin rehidratarlos, el primer intento
    // funcionaba pero todos los reintentos fallaban con "getMonth is not a
    // function", aunque la configuración contable ya se hubiera corregido.
    const hidratado: Record<string, unknown> = { ...payload };
    for (const campo of ['fecha', 'fechaPago']) {
      const valor = hidratado[campo];
      if (typeof valor === 'string') {
        const fecha = new Date(valor);
        if (!Number.isNaN(fecha.getTime())) hidratado[campo] = fecha;
      }
    }

    /*
     * El motor devuelve el id de la póliza que creó, y ese id es lo único que
     * une esta bitácora con el mayor. Trece de los quince generadores estaban
     * declarados `Promise<void>` y lo tiraban: `polizaId` quedaba en null en
     * los 36 asientos GENERADOS de la instalación, así que la tabla afirmaba
     * «generado» sin poder decir dónde. Se acepta también la forma antigua
     * `{ id }` por si algún generador externo todavía la usa.
     */
    const resultado = await fn.call(this.motorContable, hidratado);
    if (typeof resultado === 'string' && resultado) return resultado;
    const anidado = (resultado as any)?.id;
    return typeof anidado === 'string' && anidado ? anidado : undefined;
  }

  /* ══ REINTENTO AUTOMÁTICO ════════════════════════════════════════════════ */

  /**
   * Devuelve a PENDIENTE los asientos que quedaron reclamados por un proceso
   * que ya no existe.
   *
   * `REINTENTANDO` se asignaba y nunca se liberaba. Si el proceso moría a
   * mitad del reintento —un despliegue, un OOM, un SIGKILL— la fila quedaba
   * congelada para siempre: el cron sólo recoge PENDIENTE y el botón manual
   * sólo reclama PENDIENTE o FALLIDO, así que respondía «ya está siendo
   * procesado por otro usuario» indefinidamente. Y como el diagnóstico de
   * cierre cuenta REINTENTANDO como bloqueo, un despliegue mal cronometrado
   * durante una venta dejaba el cierre mensual trabado sin salida por
   * pantalla.
   *
   * Diez minutos es holgado: ningún intento legítimo dura tanto.
   */
  private async liberarReclamosHuerfanos(): Promise<void> {
    const limite = new Date(Date.now() - 10 * 60_000);
    const resultado = await this.repo
      .createQueryBuilder()
      .update(AsientoPendiente)
      .set({ estado: EstadoAsiento.PENDIENTE, proximoIntento: () => 'CURRENT_TIMESTAMP' })
      .where('estado = :estado', { estado: EstadoAsiento.REINTENTANDO })
      .andWhere(
        '(fechaUltimoIntento IS NULL OR fechaUltimoIntento < :limite)',
        { limite },
      )
      .andWhere('fechaActualizacion < :limite', { limite })
      .execute();

    if (resultado.affected) {
      this.logger.warn(
        `Se liberaron ${resultado.affected} asiento(s) que quedaron en REINTENTANDO ` +
          'tras la caída de un proceso. Vuelven a la cola.',
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async procesarPendientes(): Promise<void> {
    /*
     * Respeta `CRONS_HABILITADOS` como todas las demás tareas programadas.
     * Era la única sin el interruptor, y es la que más pesa: cada minuto
     * escribe pólizas. Sin esto, levantar una segunda instancia o dejar
     * corriendo una copia de desarrollo contra la misma base significa dos
     * procesos generando asientos a la vez; y durante una ventana de
     * mantenimiento no había forma de callarla.
     */
    if (omitirTareaProgramada('asientos-pendientes')) return;

    await this.liberarReclamosHuerfanos();

    const listos = await this.repo.find({
      where: {
        estado: EstadoAsiento.PENDIENTE,
        proximoIntento: LessThanOrEqual(new Date()),
      },
      order: { fechaCreacion: 'ASC' },
      take: 25, // acotado: no bloquear la base con una avalancha
    });

    if (!listos.length) return;

    this.logger.log(`Reintentando ${listos.length} asientos pendientes`);

    for (const asiento of listos) {
      // Compare-and-set: dos instancias pueden leer la misma fila, pero sólo
      // una logra reclamarla. La otra continúa sin duplicar la póliza.
      const reclamo = await this.repo.update(
        { id: asiento.id, estado: EstadoAsiento.PENDIENTE },
        { estado: EstadoAsiento.REINTENTANDO },
      );
      if (!reclamo.affected) continue;
      asiento.estado = EstadoAsiento.REINTENTANDO;

      try {
        const polizaId = await this.ejecutar(asiento.tipo, JSON.parse(asiento.payload));

        const errorPrevio = asiento.ultimoError;
        asiento.estado = EstadoAsiento.GENERADO;
        asiento.ultimoError = null;
        asiento.fechaUltimoIntento = new Date();
        asiento.proximoIntento = null;
        asiento.polizaId = polizaId ?? asiento.polizaId;
        asiento.notaResolucion = errorPrevio
          ? `Resuelto automáticamente. Error previo: ${errorPrevio}`.slice(
              0,
              500,
            )
          : 'Resuelto automáticamente.';
        await this.repo.save(asiento);
        await this.avisarAlDocumento(asiento);

        this.logger.log(
          `Asiento ${asiento.tipo} ${asiento.folioDocumento ?? asiento.id} generado en el reintento ${asiento.intentos + 1}`,
        );
      } catch (e) {
        const desenlace = this.aplicarPeldano(
          asiento,
          e instanceof Error ? e.message : String(e),
        );

        if (desenlace === EstadoAsiento.FALLIDO) {
          this.logger.error(
            `Asiento ${asiento.tipo} ${asiento.folioDocumento ?? asiento.id} agotó los ` +
              `${MAX_INTENTOS} intentos. Requiere revisión manual: ${asiento.ultimoError}`,
          );
        }

        await this.repo.save(asiento);
      }
    }
  }

  /* ══ CONSULTA Y RESOLUCIÓN MANUAL ════════════════════════════════════════ */

  async listar(empresaId: string, estado?: EstadoAsiento) {
    const lista = await this.repo.find({
      where: { empresaId, ...(estado ? { estado } : {}) },
      order: { fechaCreacion: 'DESC' },
      take: 200,
    });

    return lista.map((a) => ({
      ...a,
      // El payload crudo no le sirve a nadie en pantalla; se manda interpretado.
      payload: this.resumirPayload(a),
    }));
  }

  private resumirPayload(a: AsientoPendiente): Record<string, unknown> {
    try {
      const p = JSON.parse(a.payload) as Record<string, unknown>;
      return {
        folio: p.folio ?? a.folioDocumento,
        total: p.totalGeneral ?? p.total ?? p.importe,
        fecha: p.fecha,
        partidas: Array.isArray(p.detalles) ? p.detalles.length : undefined,
      };
    } catch {
      return { error: 'El payload guardado no es JSON válido' };
    }
  }

  async resumen(empresaId: string) {
    const todos = await this.repo.find({ where: { empresaId } });
    return {
      pendientes: todos.filter((a) => a.estado === EstadoAsiento.PENDIENTE)
        .length,
      fallidos: todos.filter((a) => a.estado === EstadoAsiento.FALLIDO).length,
      generados: todos.filter((a) => a.estado === EstadoAsiento.GENERADO)
        .length,
      descartados: todos.filter((a) => a.estado === EstadoAsiento.DESCARTADO)
        .length,
      // Lo que un contador necesita saber de un vistazo.
      requierenAtencion: todos.filter((a) => a.estado === EstadoAsiento.FALLIDO)
        .length,
    };
  }

  /** Fuerza un reintento inmediato, típicamente tras corregir la configuración. */
  async reintentarAhora(id: string, empresaId: string) {
    const a = await this.repo.findOne({ where: { id, empresaId } });
    if (!a) throw new NotFoundException('El asiento pendiente no existe.');

    if (a.estado === EstadoAsiento.GENERADO) {
      /*
       * Y se le vuelve a avisar al documento. Es justo el caso que dejó el
       * cobro de $1,200 en PENDIENTE con su póliza hecha: el asiento se generó
       * por otra vía y el documento no se enteró. Sin esto, el botón contestaba
       * «ya estaba generado» y no arreglaba nada, que es lo más parecido a no
       * tener botón.
       */
      await this.avisarAlDocumento(a);
      return {
        generado: true,
        polizaId: a.polizaId ?? undefined,
        mensaje: 'El asiento ya había sido generado. No se duplicó la póliza.',
      };
    }
    if (a.estado === EstadoAsiento.DESCARTADO) {
      return {
        generado: false,
        mensaje: 'El asiento fue descartado y no puede reintentarse.',
      };
    }

    // Compare-and-set también para el botón manual: si dos usuarios hacen clic
    // al mismo tiempo, sólo uno logra reclamar la fila.
    const reclamo = await this.repo.update(
      {
        id,
        empresaId,
        estado: In([EstadoAsiento.PENDIENTE, EstadoAsiento.FALLIDO]),
      },
      { estado: EstadoAsiento.REINTENTANDO },
    );
    if (!reclamo.affected) {
      return {
        generado: false,
        mensaje: 'El asiento ya está siendo procesado por otro usuario.',
      };
    }

    try {
      const polizaId = await this.ejecutar(a.tipo, JSON.parse(a.payload));
      const errorPrevio = a.ultimoError;
      a.polizaId = polizaId ?? a.polizaId;
      a.estado = EstadoAsiento.GENERADO;
      a.ultimoError = null;
      a.fechaUltimoIntento = new Date();
      a.proximoIntento = null;
      a.notaResolucion = errorPrevio
        ? `Resuelto manualmente. Error previo: ${errorPrevio}`.slice(0, 500)
        : 'Resuelto manualmente.';
      await this.repo.save(a);
      await this.avisarAlDocumento(a);
      return {
        generado: true,
        polizaId: a.polizaId ?? undefined,
        mensaje: 'El asiento se generó correctamente.',
      };
    } catch (e) {
      /*
       * Éste es el camino que toman TODOS los módulos en su primer intento, en
       * línea, justo después de confirmar la operación. Marcar FALLIDO aquí a
       * la primera falla era saltarse la escalera entera: el cron sólo recoge
       * PENDIENTE, así que la fila quedaba fuera de la cola desde el segundo
       * uno. Ahora sube un peldaño como cualquier otro intento; sólo el último
       * la marca FALLIDA.
       */
      this.aplicarPeldano(a, e instanceof Error ? e.message : String(e));
      await this.repo.save(a);
      return {
        generado: false,
        mensaje: `${a.ultimoError} ${this.esperaEnPalabras(a)}`,
      };
    }
  }

  /**
   * Le dice al documento que su asiento ya se generó.
   *
   * Se llama desde los DOS sitios que ponen un asiento en GENERADO —el cron y
   * el botón manual—, que es lo que faltaba: el aviso vivía sólo en el intento
   * en línea de cada módulo, así que un asiento generado más tarde dejaba al
   * documento diciendo PENDIENTE para siempre.
   *
   * NO LANZA. El asiento ya está generado y su póliza existe: tirar por esto
   * dejaría la cola peor de lo que estaba. Pero tampoco calla: lo que no se
   * pudo escribir se registra, y el diagnóstico de integridad lo seguirá
   * viendo, que es exactamente para lo que está.
   */
  private async avisarAlDocumento(asiento: AsientoPendiente): Promise<void> {
    for (const doc of DOCUMENTOS_QUE_ESPERAN) {
      try {
        await this.repo.manager.query(
          `UPDATE ${doc.tabla}
              SET ${doc.estado} = 'GENERADO', ${doc.poliza} = COALESCE($1, ${doc.poliza})
            WHERE empresaid = $2 AND ${doc.asiento} = $3 AND ${doc.estado} <> 'GENERADO'`,
          [asiento.polizaId ?? null, asiento.empresaId, asiento.id],
        );
      } catch (e) {
        /*
         * Una tabla que todavía no existe en esta instalación es normal —las
         * migraciones las crean por etapas— y no es un fallo de este asiento.
         * Se anota y se sigue con las demás.
         */
        this.logger.warn(
          `No se pudo avisar a ${doc.tabla} de que el asiento ${asiento.id} ya se generó: ` +
            `${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /**
   * Descarta el asiento. Exige justificación: alguien está decidiendo que una
   * operación no se refleje en la contabilidad, y eso tiene que quedar escrito.
   */
  async descartar(
    id: string,
    nota: string,
    usuarioId: string,
    empresaId: string,
  ) {
    const a = await this.repo.findOne({ where: { id, empresaId } });
    if (!a) throw new NotFoundException('El asiento pendiente no existe.');

    a.estado = EstadoAsiento.DESCARTADO;
    a.notaResolucion = nota;
    a.resueltoPorId = usuarioId;
    a.proximoIntento = null;
    return this.repo.save(a);
  }
}
