import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CfdiController } from './cfdi.controller';
import { CfdiService } from './cfdi.service';
import { FacturamaService } from './facturama.service';
import { Factura } from './factura.entity';
import { PartidaFactura } from './partida-factura.entity';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { Empresa } from '../iam/entities/empresa.entity';
import { CuentaContable } from '../finanzas/entities/cuenta-contable.entity';
import { Impuesto } from '../catalogo/entities/impuesto.entity';
import { FinanzasModule } from '../finanzas/modules/finanzas.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { ConfiguracionMexicoService } from './configuracion-mexico.service';
import { Producto } from '../catalogo/entities/producto.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Factura,
      PartidaFactura,
      ConfiguracionFiscal,
      Empresa,
      CuentaContable,
      Impuesto,
      Producto,
    ]),
    FinanzasModule,
    CatalogoModule,
  ],
  controllers: [CfdiController],
  providers: [CfdiService, FacturamaService, ConfiguracionMexicoService],
  exports: [CfdiService],
})
export class CfdiModule {}
