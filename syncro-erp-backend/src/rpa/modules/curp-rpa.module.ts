import { Module } from '@nestjs/common';
import { CurpRpaController } from '../controllers/curp-rpa.controller';
import { CurpRpaService } from '../services/curp-rpa.service';

@Module({
  controllers: [CurpRpaController],
  providers: [CurpRpaService],
  exports: [CurpRpaService],
})
export class RpaModule {}
