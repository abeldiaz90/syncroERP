import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesCronService } from './notificaciones-cron.service';
import { CommonModule } from '../common/modules/common.module';

@Module({
  imports: [CommonModule],
  providers: [NotificacionesService, NotificacionesCronService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}