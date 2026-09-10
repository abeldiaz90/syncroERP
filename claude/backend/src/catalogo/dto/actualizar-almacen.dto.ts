import { PartialType } from '@nestjs/mapped-types';
import { CrearAlmacenDto } from './crear-almacen.dto';

export class ActualizarAlmacenDto extends PartialType(CrearAlmacenDto) {}
