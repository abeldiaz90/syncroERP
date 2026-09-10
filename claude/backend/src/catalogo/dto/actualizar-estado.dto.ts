import { PartialType } from '@nestjs/mapped-types';
import { CrearEstadoDto } from './crear-estado.dto';

export class ActualizarEstadoDto extends PartialType(CrearEstadoDto) {}
