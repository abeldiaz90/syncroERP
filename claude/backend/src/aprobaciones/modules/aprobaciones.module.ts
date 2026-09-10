import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { AprobacionDocumento } from '../../compras/entities/aprobacion-documento.entity';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import { ConvenioCreditoHotel } from '../../hoteleria/entities/city-ledger.entity';
import { Hotel } from '../../hoteleria/entities/hotel.entity';
import { AprobacionesDocumentosController } from '../controllers/aprobaciones-documentos.controller';
import { AprobacionesDocumentosService } from '../services/aprobaciones-documentos.service';
import { CommonModule } from '../../common/modules/common.module';
import { IntegracionModule } from '../../integracion/modules/integracion.module';

@Module({
  imports: [
    IntegracionModule,
    CommonModule,
    TypeOrmModule.forFeature([
      AprobacionDocumento,
      ConfiguracionAprobacion,
      Cliente,
      ConvenioCreditoHotel,
      Hotel,
    ]),
  ],
  controllers: [AprobacionesDocumentosController],
  providers: [AprobacionesDocumentosService],
  exports: [AprobacionesDocumentosService],
})
export class AprobacionesModule {}
