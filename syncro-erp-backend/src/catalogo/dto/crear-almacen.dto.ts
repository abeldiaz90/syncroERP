import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CrearAlmacenDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;
}