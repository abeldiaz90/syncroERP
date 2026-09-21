import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from './entities/cliente.entity';
import { ClienteIdentificacion } from './entities/cliente-identificacion.entity';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';
import { AprobacionesModule } from '../aprobaciones/modules/aprobaciones.module';
import { IntegracionModule } from '../integracion/modules/integracion.module';
import { IdentificacionesController } from './identificaciones.controller';
import { IdentificacionesService } from './identificaciones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, ClienteIdentificacion, Pais, Estado]),
    AprobacionesModule,
    IntegracionModule,
  ],
  controllers: [ClientesController, IdentificacionesController],
  providers: [ClientesService, IdentificacionesService],
  exports: [IdentificacionesService],
})
export class ClientesModule {}
