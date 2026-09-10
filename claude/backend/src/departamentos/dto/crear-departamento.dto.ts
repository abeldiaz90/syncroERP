import { Transform } from 'class-transformer';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CrearDepartamentoDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;
}
