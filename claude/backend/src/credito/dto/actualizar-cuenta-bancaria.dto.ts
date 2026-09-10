import { PartialType } from '@nestjs/swagger';
import { CrearCuentaBancariaDto } from './crear-cuenta-bancaria.dto';

export class ActualizarCuentaBancariaDto extends PartialType(
  CrearCuentaBancariaDto,
) {}
