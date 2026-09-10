import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import {
  OrigenProspecto,
  TipoActividad,
  TipoEtapa,
} from '../entities/crm.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CrearEtapaDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  orden?: number;

  @IsOptional()
  @IsEnum(TipoEtapa)
  tipo?: TipoEtapa;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probabilidad?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  diasAlerta?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class CrearProspectoDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  empresa?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  puesto?: string;

  @ValidateIf((o: CrearProspectoDto) => !o.telefono || Boolean(o.email))
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ValidateIf((o: CrearProspectoDto) => !o.email || Boolean(o.telefono))
  @Transform(trim)
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(250)
  direccion?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  ciudad?: string;

  @IsOptional()
  @IsEnum(OrigenProspecto)
  origen?: OrigenProspecto;

  @IsOptional()
  @IsSqlServerGuid()
  responsableId?: string;

  @IsOptional()
  @IsSqlServerGuid()
  clienteId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notas?: string;
}

export class CrearOportunidadDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @ValidateIf((o: CrearOportunidadDto) => !o.clienteId || Boolean(o.prospectoId))
  @IsSqlServerGuid()
  prospectoId?: string;

  @ValidateIf((o: CrearOportunidadDto) => !o.prospectoId || Boolean(o.clienteId))
  @IsSqlServerGuid()
  clienteId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  nombreContacto?: string;

  @IsOptional()
  @IsSqlServerGuid()
  etapaId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  importe!: number;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(3, 3)
  moneda?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probabilidad?: number;

  @IsOptional()
  @IsDateString()
  fechaCierreEstimada?: string;

  @IsOptional()
  @IsSqlServerGuid()
  responsableId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  nombreResponsable?: string;
}

export class MoverEtapaDto {
  @IsSqlServerGuid()
  etapaId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  motivoPerdida?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  competidor?: string;
}

export class CrearActividadDto {
  @ValidateIf((o: CrearActividadDto) => !o.prospectoId || Boolean(o.oportunidadId))
  @IsSqlServerGuid()
  oportunidadId?: string;

  @ValidateIf((o: CrearActividadDto) => !o.oportunidadId || Boolean(o.prospectoId))
  @IsSqlServerGuid()
  prospectoId?: string;

  @IsEnum(TipoActividad)
  tipo!: TipoActividad;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  asunto!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  detalle?: string;

  @IsDateString()
  fechaProgramada!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  duracionMinutos?: number;

  @IsOptional()
  @IsSqlServerGuid()
  responsableId?: string;
}

export class CompletarActividadDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  resultado!: string;
}
