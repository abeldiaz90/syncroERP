import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository } from 'typeorm';

import {
  AsientoPendiente, EstadoAsiento, TipoAsiento,
} from '../entities/asiento-pendiente.entity';
import { MotorContableService } from './motor-contable.service';

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
  ): Promise<void> {
    try {
      await this.ejecutar(tipo, payload);
      // Éxito al primer intento: no se guarda nada. La bitácora es de fallas,
      // no un duplicado del libro diario.
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);

      this.logger.error(
        `Asiento ${tipo} falló${folioDocumento ? ` (${folioDocumento})` : ''}: ${mensaje}. ` +
        `Queda en cola de reintento.`,
      );

      try {
        await this.repo.save(this.repo.create({
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
        }));
      } catch (errorAlGuardar) {
        // Si ni siquiera se puede registrar la falla, al menos que quede en
        // el log del servidor con el payload completo para reconstruirlo.
        this.logger.error(
          `No se pudo registrar el asiento pendiente. Payload: ${JSON.stringify(payload)}`,
          errorAlGuardar instanceof Error ? errorAlGuardar.stack : undefined,
        );
      }
    }
  }

  /** Despacha al método correspondiente del motor contable. */
  private async ejecutar(tipo: TipoAsiento, payload: Record<string, unknown>): Promise<void> {
    const motor = this.motorContable as unknown as Record<string, (d: unknown) => Promise<void>>;

    const metodo: Record<TipoAsiento, string> = {
      [TipoAsiento.VENTA]: 'generarAsientoDeVenta',
      [TipoAsiento.CANCELACION_VENTA]: 'generarAsientoDeCancelacionVenta',
      [TipoAsiento.COMPRA]: 'generarAsientoDeCompra',
      [TipoAsiento.PAGO_PROVEEDOR]: 'generarAsientoDePagoProveedor',
      [TipoAsiento.COBRANZA]: 'generarAsientoDeCobranza',
      [TipoAsiento.SALIDA_INVENTARIO]: 'generarAsientoDeSalida',
      [TipoAsiento.INVENTARIO_INICIAL]: 'generarAsientoInventarioInicial',
      [TipoAsiento.NOMINA]: 'generarAsientoDeNomina',
      [TipoAsiento.DEPRECIACION]: 'generarAsientoDeDepreciacion',
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

    await fn.call(this.motorContable, payload);
  }

  /* ══ REINTENTO AUTOMÁTICO ════════════════════════════════════════════════ */

  @Cron(CronExpression.EVERY_MINUTE)
  async procesarPendientes(): Promise<void> {
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
      asiento.estado = EstadoAsiento.REINTENTANDO;
      await this.repo.save(asiento);

      try {
        await this.ejecutar(asiento.tipo, JSON.parse(asiento.payload));

        asiento.estado = EstadoAsiento.GENERADO;
        asiento.ultimoError = undefined;
        asiento.fechaUltimoIntento = new Date();
        asiento.proximoIntento = undefined;
        await this.repo.save(asiento);

        this.logger.log(
          `Asiento ${asiento.tipo} ${asiento.folioDocumento ?? asiento.id} generado en el reintento ${asiento.intentos + 1}`,
        );
      } catch (e) {
        asiento.intentos += 1;
        asiento.ultimoError = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
        asiento.fechaUltimoIntento = new Date();

        if (asiento.intentos >= MAX_INTENTOS) {
          asiento.estado = EstadoAsiento.FALLIDO;
          asiento.proximoIntento = undefined;
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
      pendientes: todos.filter((a) => a.estado === EstadoAsiento.PENDIENTE).length,
      fallidos: todos.filter((a) => a.estado === EstadoAsiento.FALLIDO).length,
      generados: todos.filter((a) => a.estado === EstadoAsiento.GENERADO).length,
      descartados: todos.filter((a) => a.estado === EstadoAsiento.DESCARTADO).length,
      // Lo que un contador necesita saber de un vistazo.
      requierenAtencion: todos.filter((a) => a.estado === EstadoAsiento.FALLIDO).length,
    };
  }

  /** Fuerza un reintento inmediato, típicamente tras corregir la configuración. */
  async reintentarAhora(id: string, empresaId: string) {
    const a = await this.repo.findOne({ where: { id, empresaId } });
    if (!a) throw new NotFoundException('El asiento pendiente no existe.');

    try {
      await this.ejecutar(a.tipo, JSON.parse(a.payload));
      a.estado = EstadoAsiento.GENERADO;
      a.ultimoError = undefined;
      a.fechaUltimoIntento = new Date();
      await this.repo.save(a);
      return { generado: true, mensaje: 'El asiento se generó correctamente.' };
    } catch (e) {
      a.intentos += 1;
      a.ultimoError = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      a.fechaUltimoIntento = new Date();
      a.estado = EstadoAsiento.FALLIDO;
      await this.repo.save(a);
      return { generado: false, mensaje: a.ultimoError };
    }
  }

  /**
   * Descarta el asiento. Exige justificación: alguien está decidiendo que una
   * operación no se refleje en la contabilidad, y eso tiene que quedar escrito.
   */
  async descartar(id: string, nota: string, usuarioId: string, empresaId: string) {
    const a = await this.repo.findOne({ where: { id, empresaId } });
    if (!a) throw new NotFoundException('El asiento pendiente no existe.');

    a.estado = EstadoAsiento.DESCARTADO;
    a.notaResolucion = nota;
    a.resueltoPorId = usuarioId;
    return this.repo.save(a);
  }
}
