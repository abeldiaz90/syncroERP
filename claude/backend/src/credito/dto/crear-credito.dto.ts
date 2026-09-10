import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { TipoCredito } from '../entities/credito-cliente.entity';
import { UnidadPlazo } from '../entities/producto-credito.entity';

export class SimularCreditoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  capital!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(360)
  numeroCuotas!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tasaInteresMensual!: number;

  @IsBoolean()
  sinInteres!: boolean;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsEnum(TipoCredito)
  tipoCredito?: TipoCredito;

  /**
   * Periodo entre cuotas, que sale del producto. Es lo que sustituye a deducir
   * el plazo del tipo: un producto puede vencer cada 15 días o cada 2 meses sin
   * que exista un valor de enum para eso.
   */
  @IsOptional()
  @IsEnum(UnidadPlazo)
  unidadPlazo?: UnidadPlazo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  cadaCuantos?: number;
}

export class CrearCreditoDto {
  @IsSqlServerGuid()
  clienteId!: string;

  @IsOptional()
  @IsSqlServerGuid()
  ventaId?: string;

  /**
   * Producto del catálogo con el que se vende. Es la forma buena de pedir un
   * crédito: el plazo, la tasa y los límites salen de la fila, no de la
   * captura.
   */
  @IsOptional()
  @IsSqlServerGuid()
  productoCreditoId?: string;

  /**
   * Clasificación heredada. Sigue admitiéndose para no romper a quien llame a
   * la API con el contrato anterior; con `productoCreditoId` se deduce sola.
   */
  @IsOptional()
  @IsEnum(TipoCredito)
  tipoCredito?: TipoCredito;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  montoVenta!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  enganche = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(360)
  numeroCuotas!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tasaInteresMensual = 0;

  @IsBoolean()
  sinInteres = true;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  metodoPagoEnganche?: string;

  @IsOptional()
  @IsSqlServerGuid()
  cuentaBancariaEngancheId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;
}
