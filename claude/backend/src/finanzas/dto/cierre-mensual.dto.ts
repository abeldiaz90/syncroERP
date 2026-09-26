import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { Type } from 'class-transformer';

export class IniciarRevisionCierreDto {
  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  @Min(2000)
  @Max(2200)
  anio!: number;
}

export class ConfirmacionesCierreDto {
  @IsBoolean()
  bancosRevisados!: boolean;

  @IsBoolean()
  ivaRevisado!: boolean;

  @IsBoolean()
  documentosCompletos!: boolean;

  /*
   * Ya no se exige. El respaldo lo toma el sistema al cerrar y si no puede, el
   * mes no se cierra: dejo de ser una firma para ser un hecho. Se conserva
   * opcional para no romper las revisiones ya guardadas que lo traen.
   */
  @IsOptional()
  @IsBoolean()
  respaldoConfirmado?: boolean;
}

export class PrepararCierreDto {
  @ValidateNested()
  @Type(() => ConfirmacionesCierreDto)
  confirmaciones!: ConfirmacionesCierreDto;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notas?: string;
}

export class CerrarPeriodoGuiadoDto {
  @IsSqlServerGuid()
  revisionId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notas?: string;
}

export class ReabrirPeriodoDto {
  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  @Min(2000)
  @Max(2200)
  anio!: number;

  @IsString()
  @Length(10, 500)
  justificacion!: string;
}
