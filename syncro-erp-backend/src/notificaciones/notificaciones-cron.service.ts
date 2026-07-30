import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

// ─── CRON JOBS DE NOTIFICACIONES ─────────────────────────────────────────────
// Se ejecutan automáticamente en segundo plano
//
// Para instalar el scheduler: npm install @nestjs/schedule
// En AppModule imports: ScheduleModule.forRoot()

@Injectable()
export class NotificacionesCronService {
  private readonly logger = new Logger(NotificacionesCronService.name);

  // ── Todos los lunes a las 7:00 AM — resumen semanal de cartera ───────────
  @Cron('0 7 * * 1', { name: 'resumen-semanal-cartera' })
  async resumenSemanalCartera(): Promise<void> {
    this.logger.log(
      'Generando resumen semanal de cartera (pendiente implementar)',
    );
  }
}
