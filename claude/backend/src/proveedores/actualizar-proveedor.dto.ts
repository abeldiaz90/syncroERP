import { PartialType } from '@nestjs/mapped-types';
import { CrearProveedorDto } from './crear-proveedor.dto';

export class ActualizarProveedorDto extends PartialType(CrearProveedorDto) {}
