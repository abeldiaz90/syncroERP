import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularVentaDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
