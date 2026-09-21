import { Module } from '@nestjs/common';
import { MailService } from '../services/mail.service';
import { PoliticaCreditoService } from '../services/politica-credito.service';
import { SecretosService } from '../services/secretos.service';

@Module({
  providers: [MailService, PoliticaCreditoService, SecretosService],
  exports: [MailService, PoliticaCreditoService, SecretosService],
})
export class CommonModule {}
