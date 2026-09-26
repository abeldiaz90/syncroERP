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
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import {
  OrigenProspecto,
  TipoActividad,
  TipoEtapa,
} from '../entities/crm.entity';
import { EsCampoCondicional } from '../../common/validators/campo-condicional.validator';
import { IsFechaOpcional } from '../../common/validators/fecha-opcional.validator';

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

  /*
   * Un prospecto sin manera de contactarlo no es un prospecto, así que se pide
   * al menos uno de los dos. La regla estaba escrita como dos condiciones
   * cruzadas —`!o.telefono || Boolean(o.email)`— y cuando no venía ninguno se
   * cumplían las dos: la respuesta traía cuatro mensajes sobre el formato del
   * correo y del teléfono, y ni uno decía lo único cierto, que hace falta un
   * medio de contacto.
   *
   * Ahora la regla se dice una vez en cada campo, con su mensaje, y el formato
   * sólo se comprueba cuando el valor viene.
   */
  @Transform(trim)
  @EsCampoCondicional({
    requeridoCuando: (o: CrearProspectoDto) => !o?.telefono?.trim(),
    cuandoFalta:
      'Escribe un correo o un teléfono: sin uno de los dos no hay forma de contactar al prospecto.',
    etiqueta: 'El correo',
    forma: 'correo',
    maximo: 120,
  })
  email?: string;

  @Transform(trim)
  @EsCampoCondicional({
    requeridoCuando: (o: CrearProspectoDto) => !o?.email?.trim(),
    cuandoFalta:
      'Escribe un teléfono o un correo: sin uno de los dos no hay forma de contactar al prospecto.',
    etiqueta: 'El teléfono',
    forma: 'texto',
    minimo: 7,
    maximo: 20,
  })
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

  @IsSqlServerGuidOpcional()
  responsableId?: string;

  @IsSqlServerGuidOpcional()
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

  @IsSqlServerGuidOpcional()
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

  @IsFechaOpcional()
  fechaCierreEstimada?: string;

  @IsSqlServerGuidOpcional()
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

  @IsSqlServerGuidOpcional()
  responsableId?: string;
}

export class CompletarActividadDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  resultado!: string;
}
