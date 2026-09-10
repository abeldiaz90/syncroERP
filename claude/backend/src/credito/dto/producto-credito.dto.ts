import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { UnidadPlazo } from '../entities/producto-credito.entity';

export class CrearProductoCreditoDto {
  /**
   * El mismo código se usa en los dos sistemas, así que se restringe a lo que
   * cualquier registro externo acepta sin escapar: letras, dígitos y guiones.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message:
      'El código sólo admite letras, dígitos, punto, guion y guion bajo, y debe empezar con letra o dígito.',
  })
  codigo!: string;

  @IsString() @MinLength(3) @MaxLength(120) nombre!: string;

  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;

  @IsEnum(UnidadPlazo) unidadPlazo!: UnidadPlazo;

  @Type(() => Number) @IsInt() @Min(1) @Max(365) cadaCuantos!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(60) cuotasMinimas!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(60) cuotasMaximas!: number;

  @IsBoolean() sinInteres!: boolean;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100) tasaInteresMensual = 0;

  @IsOptional() @IsBoolean() tasaEditable?: boolean;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoMinimo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoMaximo?: number;

  @IsOptional() @IsString() @MaxLength(10) moneda?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;

  /** Flujo de identidad, buró y política que hay que aprobar antes de otorgar. */
  @IsOptional() @IsSqlServerGuid() flujoValidacionId?: string;
}

export class ActualizarProductoCreditoDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @IsOptional() @IsEnum(UnidadPlazo) unidadPlazo?: UnidadPlazo;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) cadaCuantos?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) cuotasMinimas?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) cuotasMaximas?: number;
  @IsOptional() @IsBoolean() sinInteres?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) tasaInteresMensual?: number;
  @IsOptional() @IsBoolean() tasaEditable?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoMinimo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoMaximo?: number;
  @IsOptional() @IsString() @MaxLength(10) moneda?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
  @IsOptional() @IsSqlServerGuid() flujoValidacionId?: string;
}
