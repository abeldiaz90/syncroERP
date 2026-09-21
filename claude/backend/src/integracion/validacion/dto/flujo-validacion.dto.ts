import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid } from '../../../common/validators/sql-server-guid.validator';
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

/**
 * Qué se puede corregir de un flujo ya creado.
 *
 * Su identificación y sus umbrales, no sus pasos. La razón no es técnica: los
 * pasos son la promesa de qué se comprueba antes de dar crédito, y los
 * expedientes ya ejecutados apuntan a ellos. Cambiarlos en el sitio reescribiría
 * en retrospectiva bajo qué reglas se aprobó un crédito que ya se otorgó. Para
 * eso está la versión: se crea un flujo nuevo y se activa.
 *
 * El nombre sí se corrige en el sitio, y hace falta: un flujo nace con el
 * nombre que alguien teclea de prisa y se queda con él a la vista de todos.
 */
export class EditarFlujoDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;

  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;

  @IsOptional() @IsNumber() @Min(0) topeAutomatico?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100) puntajeMinimo?: number;
}

export class EjecutarValidacionDto {
  @IsSqlServerGuid() clienteId!: string;

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
