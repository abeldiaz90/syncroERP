import { PartialType } from '@nestjs/mapped-types';
import { CrearFormaPagoDto } from './crear-forma-pago.dto';

export class ActualizarFormaPagoDto extends PartialType(CrearFormaPagoDto) {}
