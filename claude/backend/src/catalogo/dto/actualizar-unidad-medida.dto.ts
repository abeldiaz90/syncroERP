import { PartialType } from '@nestjs/mapped-types';
import { CrearUnidadMedidaDto } from './crear-unidad-medida.dto';

export class ActualizarUnidadMedidaDto extends PartialType(CrearUnidadMedidaDto) {}
