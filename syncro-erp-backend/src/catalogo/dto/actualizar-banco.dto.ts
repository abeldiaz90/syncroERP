import { PartialType } from '@nestjs/swagger';
import { CrearBancoDto } from './crear-banco.dto';

/**
 * Evita recibir objetos libres en PATCH y conserva todas las validaciones del
 * alta sin obligar a reenviar campos que no cambiaron.
 */
export class ActualizarBancoDto extends PartialType(CrearBancoDto) {}
