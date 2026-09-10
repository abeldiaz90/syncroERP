// src/proveedores/proveedores.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proveedor } from './entities/proveedor.entity';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Proveedor, Pais, Estado])],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
})
export class ProveedoresModule {}
