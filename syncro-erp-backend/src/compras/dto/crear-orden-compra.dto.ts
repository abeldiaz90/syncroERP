import { IsUUID } from 'class-validator';

export class CrearOrdenCompraDto {
  @IsUUID()
  cotizacionId: string;
}