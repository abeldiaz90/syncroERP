import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PoliticaPaso,
  ResultadoPaso,
  TipoPasoValidacion,
} from '../validacion.constants';

export class PasoFlujoDto {
  @IsEnum(TipoPasoValidacion) tipo!: TipoPasoValidacion;

  @IsString() @MaxLength(120) etiqueta!: string;

  @IsOptional() @IsEnum(PoliticaPaso) politica?: PoliticaPaso;

  /** Cuánto suma al puntaje si el paso sale aprobado. */
  @IsOptional() @IsInt() @Min(-100) @Max(100) peso?: number;

  @IsOptional() @IsInt() umbralMinimo?: number;

  @IsOptional() @IsObject() parametros?: Record<string, unknown>;
}

export class CrearFlujoDto {
  @IsString() @MaxLength(120) nombre!: string;

  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;

  /** Cero significa que todo pasa por autorización humana. */
  @IsOptional() @IsNumber() @Min(0) topeAutomatico?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100) puntajeMinimo?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PasoFlujoDto)
  pasos!: PasoFlujoDto[];
}

export class EjecutarValidacionDto {
  @IsUUID() clienteId!: string;

  @IsNumber() @Min(0) limiteSolicitado!: number;

  /** Folio de la autorización firmada del titular para consultar burós. */
  @IsOptional() @IsString() @MaxLength(120) folioAutorizacionBuro?: string;
}

export class SimularValidacionDto extends EjecutarValidacionDto {
  /**
   * Respuestas forzadas por tipo de paso, para que el administrador vea cómo se
   * comporta su flujo ante un buró bajo o una identidad rechazada sin tener que
   * provocarlo de verdad.
   */
  @IsOptional()
  @IsObject()
  simulado?: Partial<Record<TipoPasoValidacion, ResultadoPaso>>;
}
