import { IsString, IsNotEmpty } from 'class-validator';

export class CrearBancoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}