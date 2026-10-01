import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from '../services/mail.service';
import { PoliticaCreditoService } from '../services/politica-credito.service';
import { SecretosService } from '../services/secretos.service';
import { FoliosService } from '../services/folios.service';
import { FolioSecuencia } from '../entities/folio-secuencia.entity';

@Module({
  /*
   * La secuencia de folios se registra aquí para que `autoLoadEntities` la
   * conozca: así una base de desarrollo recién creada la trae, y no sólo las
   * instalaciones que corrieron la migración.
   */
  imports: [TypeOrmModule.forFeature([FolioSecuencia])],
  providers: [MailService, PoliticaCreditoService, SecretosService, FoliosService],
  exports: [MailService, PoliticaCreditoService, SecretosService, FoliosService],
})
export class CommonModule {}
