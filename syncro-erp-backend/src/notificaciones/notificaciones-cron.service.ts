import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { NotificacionesService } from './notificaciones.service';

// ─── CRON JOBS DE NOTIFICACIONES ─────────────────────────────────────────────
// Se ejecutan automáticamente en segundo plano
//
// Para instalar el scheduler: npm install @nestjs/schedule
// En AppModule imports: ScheduleModule.forRoot()

@Injectable()
export class NotificacionesCronService {
  private readonly logger = new Logger(NotificacionesCronService.name);

  constructor(
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ── Todos los días a las 8:00 AM ─────────────────────────────────────────
  @Cron('0 8 * * *', { name: 'alertas-credito-diarias' })
  async alertasCreditoDiarias(): Promise<void> {
    this.logger.log('Ejecutando alertas de crédito diarias...');
    // El servicio de cobranza llama directamente a notificaciones
    // cuando procesa el actualizar-vencidos.
    // Este cron es un punto de extensión para futuras alertas.
    this.logger.log('Alertas completadas');
  }

  // ── Todos los lunes a las 7:00 AM — resumen semanal de cartera ───────────
  @Cron('0 7 * * 1', { name: 'resumen-semanal-cartera' })
  async resumenSemanalCartera(): Promise<void> {
    this.logger.log('Generando resumen semanal de cartera (pendiente implementar)');
  }
}