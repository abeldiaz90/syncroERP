import { PartialType } from '@nestjs/mapped-types';
import { CrearClienteDto } from './crear-cliente.dto';

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}
