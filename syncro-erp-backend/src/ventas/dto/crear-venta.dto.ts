import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TipoCredito } from '../../credito/entities/credito-cliente.entity';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class CrearDetalleVentaDto {
  @IsSqlServerGuid()
  productoId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  cantidad!: number;

  /** Solo sirve para advertir que el POS estaba desactualizado. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioUnitario!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;

  @IsOptional()
  @IsSqlServerGuid()
  equivalenciaId?: string;

  @IsOptional()
  @IsSqlServerGuid()
  loteEspecificoId?: string;

  // Compatibilidad temporal con clientes anteriores. El backend no confía
  // en estos campos y vuelve a calcularlos.
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subtotal?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  impuestoPorcentaje?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) impuestoMonto?: number;
}

export class CondicionesCreditoVentaDto {
  @IsEnum(TipoCredito)
  tipoCredito!: TipoCredito;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  enganche = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroCuotas = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tasaInteresMensual = 0;

  @IsBoolean()
  sinInteres = true;

  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  metodoPagoEnganche?: string;

  @IsOptional()
  @IsSqlServerGuid()
  cuentaBancariaEngancheId?: string;
}

export class CrearVentaDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsSqlServerGuid()
  clienteId?: string | null;

  @IsString()
  @IsNotEmpty()
  metodoPago: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsSqlServerGuid()
  cuentaBancariaId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsSqlServerGuid()
  almacenId?: string | null;

  @IsOptional()
  @IsSqlServerGuid()
  listaPrecioId?: string;

  // Compatibilidad temporal: se aceptan, pero nunca se usan como fuente de
  // verdad. Podrán eliminarse cuando todos los clientes usen el contrato v2.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  impuestoTotal?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoRecibido?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  saldoFavorSolicitado?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearDetalleVentaDto)
  detalles!: CrearDetalleVentaDto[];

  /**
   * Si el método es crédito, estas condiciones se procesan en la misma
   * transacción que venta, inventario y crédito. Ya no se crea el crédito
   * mediante una segunda petición desde el navegador.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CondicionesCreditoVentaDto)
  credito?: CondicionesCreditoVentaDto;
}
