import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CrearPaisDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  codigo: string;
}