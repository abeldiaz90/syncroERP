import { Module } from '@nestjs/common';
import { DocumentacionController } from './documentacion.controller';
import { DocumentacionService } from './documentacion.service';

@Module({
  controllers: [DocumentacionController],
  providers: [DocumentacionService],
  exports: [DocumentacionService],
})
export class DocumentacionModule {}
