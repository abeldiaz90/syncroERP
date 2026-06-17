import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
  IsEmail,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CrearProveedorDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsIn(['FISICA', 'MORAL'])
  tipoPersona?: 'FISICA' | 'MORAL';

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  @IsIn(['MERCANCIA', 'SERVICIO', 'AMBOS'])
  tipoProveedor?: 'MERCANCIA' | 'SERVICIO' | 'AMBOS';

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  contactoTelefono?: string;

  @IsOptional()
  @IsEmail()
  contactoEmail?: string;

  @IsOptional()
  @IsString()
  contactoPuesto?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  sitioWeb?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  numeroExterior?: string;

  @IsOptional()
  @IsString()
  numeroInterior?: string;

  @IsOptional()
  @IsString()
  colonia?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  // --- Catálogos (IDs) ---
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  paisId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  estadoId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  bancoId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  formaPagoId?: string;

  // --- Fin catálogos ---

  @IsOptional()
  @IsString()
  codigoPostal?: string;

  @IsOptional()
  @IsString()
  numeroCuenta?: string;

  @IsOptional()
  @IsString()
  clabe?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diasCredito?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limiteCredito?: number;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}