import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from './entities/cliente.entity';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';
import { AprobacionesModule } from '../aprobaciones/modules/aprobaciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Pais, Estado]), AprobacionesModule],
  controllers: [ClientesController],
  providers: [ClientesService],
})
export class ClientesModule {}
