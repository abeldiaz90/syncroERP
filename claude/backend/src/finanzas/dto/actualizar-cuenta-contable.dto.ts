import { PartialType } from '@nestjs/mapped-types';
import { CrearCuentaContableDto } from './crear-cuenta-contable.dto';

export class ActualizarCuentaContableDto extends PartialType(CrearCuentaContableDto) {}
