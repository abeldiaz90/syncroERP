import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { TipoSolicitudEstructura } from '../entities/solicitud-estructura.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CrearSolicitudEstructuraDto {
  @IsEnum(TipoSolicitudEstructura)
  tipo!: TipoSolicitudEstructura;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  nombre!: string;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500)
  motivo!: string;

  @ValidateIf((o) => o.tipo === TipoSolicitudEstructura.PUESTO)
  @Transform(upper) @IsString() @MinLength(1) @MaxLength(20)
  clave?: string;

  @ValidateIf((o) => o.tipo === TipoSolicitudEstructura.PUESTO)
  @IsSqlServerGuid()
  departamentoId?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(400)
  descripcion?: string;

  @ValidateIf((o) => o.tipo === TipoSolicitudEstructura.PUESTO)
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  salarioMinimo?: number;

  @ValidateIf((o) => o.tipo === TipoSolicitudEstructura.PUESTO)
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  salarioMaximo?: number;

  @ValidateIf((o) => o.tipo === TipoSolicitudEstructura.PUESTO)
  @Type(() => Number) @IsInt() @Min(1)
  plazasAutorizadas?: number;
}

export class ResolverSolicitudEstructuraDto {
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['APROBAR', 'RECHAZAR'])
  decision!: 'APROBAR' | 'RECHAZAR';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  comentario?: string;
}
