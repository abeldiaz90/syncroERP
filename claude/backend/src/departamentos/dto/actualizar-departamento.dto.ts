import { PartialType } from '@nestjs/mapped-types';
import { CrearDepartamentoDto } from './crear-departamento.dto';

export class ActualizarDepartamentoDto extends PartialType(CrearDepartamentoDto) {}
