import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CfdiController } from './cfdi.controller';
import { CfdiService } from './cfdi.service';
import { FacturamaService } from './facturama.service';
import { Factura } from './factura.entity';
import { PartidaFactura } from './partida-factura.entity';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Factura,
      PartidaFactura,
      ConfiguracionFiscal,
    ]),
  ],
  controllers: [CfdiController],
  providers: [CfdiService, FacturamaService],
  exports: [CfdiService],
})
export class CfdiModule {}