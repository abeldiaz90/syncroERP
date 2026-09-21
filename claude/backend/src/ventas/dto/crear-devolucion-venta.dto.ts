import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import { CondicionDevolucion } from '../entities/detalle-devolucion-venta.entity';

export enum DestinoImporteDevolucion {
  REEMBOLSO = 'REEMBOLSO',
  SALDO_FAVOR = 'SALDO_FAVOR',
}

export enum MetodoReembolso {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA = 'TARJETA',
  CHEQUE = 'CHEQUE',
  OTRO = 'OTRO',
}

export class DetalleCrearDevolucionDto {
  @IsSqlServerGuid()
  detalleVentaId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsEnum(CondicionDevolucion)
  condicion!: CondicionDevolucion;
}

export class CrearDevolucionVentaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;

  /**
   * En crédito primero se reduce automáticamente la CxC. Este valor decide
   * qué hacer sólo con el excedente que ya había sido pagado.
   */
  @IsEnum(DestinoImporteDevolucion)
  destinoImporte!: DestinoImporteDevolucion;

  @IsOptional()
  @IsEnum(MetodoReembolso)
  metodoReembolso?: MetodoReembolso;

  @IsSqlServerGuidOpcional()
  cuentaBancariaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenciaReembolso?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  @MaxLength(100)
  claveIdempotencia!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleCrearDevolucionDto)
  detalles!: DetalleCrearDevolucionDto[];
}
