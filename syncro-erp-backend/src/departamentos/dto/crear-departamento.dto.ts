import { IsString, IsNotEmpty } from 'class-validator';

export class CrearDepartamentoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}