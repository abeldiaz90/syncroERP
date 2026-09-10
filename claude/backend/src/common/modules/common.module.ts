import { Module } from '@nestjs/common';
import { MailService } from '../services/mail.service';
import { PoliticaCreditoService } from '../services/politica-credito.service';

@Module({
  providers: [MailService, PoliticaCreditoService],
  exports: [MailService, PoliticaCreditoService],
})
export class CommonModule {}
