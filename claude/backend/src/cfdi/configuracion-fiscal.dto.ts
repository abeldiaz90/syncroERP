import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GuardarConfiguracionFiscalDto {
  @Transform(trim) @IsString() @Matches(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i) @IsOptional()
  rfc?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(300) @IsOptional()
  razonSocial?: string;
  @Transform(trim) @IsString() @Matches(/^\d{3}$/) @IsOptional()
  regimenFiscal?: string;
  @Transform(trim) @IsString() @Matches(/^\d{5}$/) @IsOptional()
  codigoPostalExpedicion?: string;
  @Transform(trim) @IsString() @MaxLength(200) @IsOptional()
  facturamaUser?: string;
  @IsString() @MaxLength(500) @IsOptional()
  facturamaPassword?: string;
  @IsBoolean() @IsOptional() sandbox?: boolean;
  @Transform(trim) @IsString() @MaxLength(10) @IsOptional() serie?: string;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class CancelarCfdiDto {
  @IsString() @Matches(/^(01|02|03|04)$/) motivo!: string;
  @IsString() @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) @IsOptional()
  uuidSustitucion?: string;
}

export class EnviarCfdiCorreoDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)
  @MaxLength(160)
  correo!: string;
}
