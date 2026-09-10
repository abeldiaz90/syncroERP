import { PartialType } from '@nestjs/mapped-types';
import { CrearPaisDto } from './crear-pais.dto';

export class ActualizarPaisDto extends PartialType(CrearPaisDto) {}
