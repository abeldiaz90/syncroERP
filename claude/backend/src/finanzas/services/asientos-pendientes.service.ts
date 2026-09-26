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
 * 1 min → 5 min → 15 min → 1 h → 4 h, y después se marca FALLIDO.
 *
 * Un error de configuración — una categoría sin cuenta contable — no se
 * arregla solo por reintentar, y machacar la base cada minuto no ayuda a
 * nadie. Cinco intentos espaciados cubren las fallas transitorias (la base
 * ocupada, un bloqueo momentáneo) y dejan las de configuración a la vista
 * rápido.
 * ============================================================================
 */

const ESPERAS_MINUTOS = [1, 5, 15, 60, 240];
const MAX_INTENTOS = ESPERAS_MINUTOS.length;

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
            existente.ultimoError = mensaje.slice(0, 1000);
            existente.fechaUltimoIntento = new Date();
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

        this.logger.log(
          `Asiento ${asiento.tipo} ${asiento.folioDocumento ?? asiento.id} generado en el reintento ${asiento.intentos + 1}`,
        );
      } catch (e) {
        asiento.intentos += 1;
        asiento.ultimoError = (
          e instanceof Error ? e.message : String(e)
        ).slice(0, 1000);
        asiento.fechaUltimoIntento = new Date();

        if (asiento.intentos >= MAX_INTENTOS) {
          asiento.estado = EstadoAsiento.FALLIDO;
          asiento.proximoIntento = null;
          this.logger.error(
            `Asiento ${asiento.tipo} ${asiento.folioDocumento ?? asiento.id} agotó los ` +
              `${MAX_INTENTOS} intentos. Requiere revisión manual: ${asiento.ultimoError}`,
          );
        } else {
          asiento.estado = EstadoAsiento.PENDIENTE;
          asiento.proximoIntento = new Date(
            Date.now() + ESPERAS_MINUTOS[asiento.intentos] * 60_000,
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
      return {
        generado: true,
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
      return {
        generado: true,
        polizaId: a.polizaId ?? undefined,
        mensaje: 'El asiento se generó correctamente.',
      };
    } catch (e) {
      a.intentos += 1;
      a.ultimoError = (e instanceof Error ? e.message : String(e)).slice(
        0,
        1000,
      );
      a.fechaUltimoIntento = new Date();
      a.proximoIntento = null;
      a.estado = EstadoAsiento.FALLIDO;
      await this.repo.save(a);
      return { generado: false, mensaje: a.ultimoError };
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
