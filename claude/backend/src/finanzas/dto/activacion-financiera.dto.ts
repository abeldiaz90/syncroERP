import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ModoActivacionFinanciera } from '../entities/activacion-financiera.entity';

export class GuardarActivacionFinancieraDto {
  @IsOptional()
  @IsEnum(ModoActivacionFinanciera)
  modo?: ModoActivacionFinanciera;

  @IsOptional()
  @IsBoolean()
  empresaEnOperacion?: boolean;

  @IsOptional()
  @IsDateString()
  fechaInicioContable?: string;

  @IsOptional()
  @IsBoolean()
  manejaInventario?: boolean;

  @IsOptional()
  @IsBoolean()
  vendeCredito?: boolean;

  @IsOptional()
  @IsBoolean()
  compraCredito?: boolean;

  @IsOptional()
  @IsBoolean()
  preciosIncluyenIVA?: boolean;

  @IsOptional()
  @IsIn(['PROMEDIO', 'FIFO', 'ESTANDAR', 'ESPECIFICO'])
  metodoCosteo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metodosCobro?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  saldoCaja?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  saldoBancos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  saldoClientes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  saldoInventario?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  saldoProveedores?: number;

  @IsOptional()
  @IsBoolean()
  confirmaSaldosIniciales?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmaRevision?: boolean;
}
