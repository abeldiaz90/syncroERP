import { IsString, IsNotEmpty } from 'class-validator';

export class CrearFormaPagoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}