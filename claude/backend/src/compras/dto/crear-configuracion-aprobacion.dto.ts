import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

export const PROCESOS_APROBABLES = [
  'REQUISICION', 'COTIZACION', 'ORDEN_COMPRA', 'NOMINA', 'ALTA_PUESTO',
  'ALTA_AREA', 'INCIDENCIA_RH', 'VACACIONES', 'ALTA_PROVEEDOR', 'CREDITO_CLIENTE',
  'HOTEL_CONVENIO',
] as const;

export class AprobadorConfiguracionDto {
  @IsSqlServerGuidOpcional() usuarioId?: string;
  @IsOptional() @IsString() rolAprobador?: string;
  @Type(() => Number) @IsInt() @Min(1) orden!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoDesde?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) montoHasta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) tiempoLimiteHoras = 24;
  @IsOptional() @IsBoolean() obligatorio = true;
  @IsOptional() @IsBoolean() permiteAutoaprobacion = false;
}

export class CrearConfiguracionAprobacionDto {
  @IsOptional() @IsIn(PROCESOS_APROBABLES) proceso: typeof PROCESOS_APROBABLES[number] = 'REQUISICION';
  @IsSqlServerGuidOpcional() departamentoId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AprobadorConfiguracionDto)
  aprobadores!: AprobadorConfiguracionDto[];
}
