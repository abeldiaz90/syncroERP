import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  IsNumber,
  IsBoolean,
  Matches,
  Min,
} from 'class-validator';
import { IsSqlServerGuidOpcional } from '../common/validators/sql-server-guid.validator';
import { EsRfcOpcional } from '../common/validators/rfc.validator';
import { IsEmailOpcional } from '../common/validators/email-opcional.validator';

export class CrearClienteDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsIn(['FISICA', 'MORAL'])
  tipoPersona?: 'FISICA' | 'MORAL'; // ← ahora es unión, no string

  @IsOptional()
  @EsRfcOpcional()
  rfc?: string;

  @IsOptional()
  @IsString()
  curp?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsEmailOpcional()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  /*
   * La fecha viaja como texto `aaaa-mm-dd`: es lo que manda un `<input
   * type="date">` y lo que PostgreSQL guarda en una columna `date` sin
   * interpretar husos horarios. Convertirla a `Date` aquí la movería un día
   * para quien capture de noche al oeste del meridiano, que en México es todo
   * el país.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaNacimiento debe tener el formato aaaa-mm-dd',
  })
  fechaNacimiento?: string;

  @IsOptional()
  @IsIn(['FEMENINO', 'MASCULINO', 'NO_ESPECIFICADO'])
  genero?: 'FEMENINO' | 'MASCULINO' | 'NO_ESPECIFICADO';

  @IsOptional()
  @IsString()
  colonia?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  codigoPostal?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsSqlServerGuidOpcional()
  paisId?: string;

  @IsSqlServerGuidOpcional()
  estadoId?: string;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  contactoTelefono?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limiteCredito?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diasCredito?: number;

  @IsOptional()
  @IsIn(['EMPRESA', 'AGENCIA'])
  clasificacionHotelera?: 'EMPRESA' | 'AGENCIA' | null;

  @IsOptional()
  @IsIn(['BAJO', 'MEDIO', 'ALTO'])
  nivelRiesgo?: 'BAJO' | 'MEDIO' | 'ALTO';

  @IsOptional()
  @IsBoolean()
  bloquearCreditoConSaldoVencido?: boolean;

  @IsOptional()
  @IsString()
  notas?: string;
}
