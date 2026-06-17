// src/departamentos/departamentos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Departamento } from '../entities/departamento.entity';
import { DepartamentosController } from '../controllers/departamentos.controller';
import { DepartamentosService } from '../services/departamentos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Departamento])],
  controllers: [DepartamentosController],
  providers: [DepartamentosService],
})
export class DepartamentosModule {}