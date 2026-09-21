import { PartialType } from '@nestjs/swagger';
import { IsEmailOpcional } from '../../common/validators/email-opcional.validator';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Length, Matches, Max, MaxLength, Min, MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EstadoEmpleado, JornadaLaboral, NaturalezaConcepto, RegimenPago, TipoContrato, TipoIncidencia, TipoSalario,
} from '../entities/rrhh.entity';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CrearEmpleadoDto {
  @Transform(upper) @IsOptional() @IsString() @MinLength(1) @MaxLength(20) numeroEmpleado?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) nombres!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) apellidoPaterno!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(80) apellidoMaterno?: string;
  @Transform(upper) @IsOptional() @Matches(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/) curp?: string;
  @Transform(upper) @IsOptional() @Matches(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/) rfc?: string;
  @IsOptional() @Matches(/^\d{11}$/) nss?: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsEmailOpcional() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(20) telefono?: string;
  @IsSqlServerGuidOpcional() puestoId?: string;
  @IsSqlServerGuid() departamentoId!: string;
  @IsSqlServerGuidOpcional() jefeDirectoId?: string;
  @IsDateString() fechaIngreso!: string;
  @IsEnum(TipoContrato) tipoContrato!: TipoContrato;
  @IsEnum(RegimenPago) regimenPago!: RegimenPago;
  @IsOptional() @IsEnum(TipoSalario) tipoSalario: TipoSalario = TipoSalario.FIJO;
  @IsOptional() @IsEnum(JornadaLaboral) jornada: JornadaLaboral = JornadaLaboral.DIURNA;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(24) horasJornada = 8;
  @IsOptional() @IsIn(['GENERAL', 'FRONTERA_NORTE']) zonaSalarioMinimo: 'GENERAL' | 'FRONTERA_NORTE' = 'GENERAL';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) salarioDiario!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) salarioDiarioIntegrado?: number;
  @IsOptional() @IsBoolean() sbcValidado = false;
  @IsOptional() @IsDateString() fechaSbc?: string;
  @IsOptional() @Matches(/^\d{5}$/) codigoPostalFiscal?: string;
  @IsOptional() @Matches(/^\d{3}$/) regimenFiscal?: string;
  @Type(() => Number) @IsInt() @Min(15) diasAguinaldo = 15;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(25) primaVacacional = 25;
  @IsOptional() @IsString() @MaxLength(30) banco?: string;
  @IsOptional() @Matches(/^\d{18}$/) clabe?: string;
  @IsOptional() @IsEnum(EstadoEmpleado) estado?: EstadoEmpleado;
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
}
export class ActualizarEmpleadoDto extends PartialType(CrearEmpleadoDto) {}

export class CrearPuestoDto {
  @Transform(upper) @IsString() @MinLength(1) @MaxLength(20) clave!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsOptional() @IsString() @MaxLength(400) descripcion?: string;
  @IsSqlServerGuid() departamentoId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) salarioMinimo!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) salarioMaximo!: number;
  @Type(() => Number) @IsInt() @Min(1) plazasAutorizadas!: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}
export class ActualizarPuestoDto extends PartialType(CrearPuestoDto) {}

export class RegistrarAsistenciaDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsDateString() fecha!: string;
  @IsOptional() @IsDateString() entrada?: string;
  @IsOptional() @IsDateString() salida?: string;
  @IsOptional() @IsString() @MaxLength(200) observaciones?: string;
}

export class CrearIncidenciaDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsEnum(TipoIncidencia) tipo!: TipoIncidencia;
  @IsDateString() fechaInicio!: string;
  @IsDateString() fechaFin!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dias = 0;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) horas = 0;
  @IsBoolean() pagada!: boolean;
  @IsOptional() @IsString() @MaxLength(400) motivo?: string;
  @ValidateIf((o) => o.tipo === TipoIncidencia.INCAPACIDAD)
  @IsString() @MinLength(1) @MaxLength(40) folioIncapacidad?: string;
}

export class RechazarIncidenciaDto { @IsString() @MinLength(5) @MaxLength(400) motivo!: string; }

export class CrearPeriodoNominaDto {
  @Type(() => Number) @IsInt() @Min(2020) @Max(2100) ejercicio!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(60) numero!: number;
  @IsEnum(RegimenPago) regimen!: RegimenPago;
  @IsDateString() fechaInicio!: string;
  @IsDateString() fechaFin!: string;
  @IsDateString() fechaPago!: string;
}

export class CrearConceptoNominaDto {
  @Transform(upper) @IsString() @MinLength(1) @MaxLength(20) clave!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsEnum(NaturalezaConcepto) naturaleza!: NaturalezaConcepto;
  @IsOptional() @IsString() @MaxLength(10) claveSat?: string;
  @IsBoolean() gravaIsr = true;
  @IsBoolean() integraSbc = true;
  @IsBoolean() esFijo = false;
  @IsBoolean() activo = true;
  @IsSqlServerGuidOpcional() cuentaContableId?: string;
  @IsOptional() @IsString() @MaxLength(500) formula?: string;
  @IsOptional() @IsDateString() vigenciaDesde?: string;
  @IsOptional() @IsDateString() vigenciaHasta?: string;
}
export class ActualizarConceptoNominaDto extends PartialType(CrearConceptoNominaDto) {}

export class CrearContratoLaboralDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsEnum(TipoContrato) tipoContrato!: TipoContrato;
  @IsDateString() fechaInicio!: string;
  @IsOptional() @IsDateString() fechaFin?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) salarioDiario!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) salarioDiarioIntegrado?: number;
  @IsOptional() @IsBoolean() sbcValidado = false;
  @IsOptional() @IsDateString() fechaSbc?: string;
  @IsOptional() @Matches(/^\d{5}$/) codigoPostalFiscal?: string;
  @IsOptional() @Matches(/^\d{3}$/) regimenFiscal?: string;
  @IsSqlServerGuidOpcional() puestoId?: string;
  @IsSqlServerGuidOpcional() departamentoId?: string;
  @IsOptional() @IsString() @MaxLength(120) centroCostos?: string;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}

export class CrearParametroNominaDto {
  @Transform(upper) @IsString() @MinLength(1) @MaxLength(80) clave!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) nombre!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) valorNumero!: number;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
  @IsDateString() vigenciaDesde!: string;
  @IsOptional() @IsDateString() vigenciaHasta?: string;
  @IsOptional() @IsString() @MaxLength(500) fuente?: string;
}

export class SolicitarVacacionesDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsDateString() fechaInicio!: string;
  @IsDateString() fechaFin!: string;
  @IsOptional() @IsString() @MaxLength(400) motivo?: string;
}

export class ResolverVacacionesDto {
  @IsBoolean() aprobar!: boolean;
  @ValidateIf((o) => !o.aprobar) @IsString() @MinLength(5) @MaxLength(400) motivo?: string;
}

export class BajaEmpleadoDto {
  @IsDateString()
  fecha!: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
