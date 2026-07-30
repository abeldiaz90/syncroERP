import {
  IsString,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoPoliza } from '../entities/poliza.entity';

export class PartidaDto {
  @IsString()
  cuentaContableId!: string;

  @IsNumber()
  @Min(0)
  cargo!: number;

  @IsNumber()
  @Min(0)
  abono!: number;

  @IsString()
  @IsOptional()
  referencia?: string;
}

export class CrearPolizaDto {
  @IsEnum(TipoPoliza)
  tipo!: TipoPoliza;

  @IsString()
  concepto!: string;

  @IsDateString()
  fecha!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartidaDto)
  partidas!: PartidaDto[];
}
