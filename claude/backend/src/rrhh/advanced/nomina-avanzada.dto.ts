import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EstadoAprobacionNomina,
  EstadoCuentaBancariaEmpleado,
  EstadoValidacionCuentaBancaria,
  TipoObligacionEmpleado,
} from './nomina-avanzada.entity';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const digits = ({ value }: { value: unknown }) =>
  String(value ?? '').replace(/\D/g, '');

export class ConfiguracionPatronalDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  razonSocial!: string;

  @Transform(upper)
  @Matches(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/)
  rfc!: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9]{1,20}$/)
  registroPatronal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  claseRiesgo?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(15)
  primaRiesgo = 0;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  estadoIsn?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10)
  tasaIsn = 0;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bancoDispersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cuentaDispersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  proveedorPac?: string;

  @IsOptional() @IsSqlServerGuid() cuentaNominaPorPagarId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaBancoNominaId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaIsrRetenidoId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaImssObreroId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaImssPatronalId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaInfonavitId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaFonacotId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaIsnId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaGastoImssPatronalId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaGastoInfonavitId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaGastoIsnId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaPrestamosEmpleadoId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaPensionId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaEmbargosId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaOtrasDeduccionesId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaSubsidioEmpleoId?: string;
  @IsOptional() @IsBoolean() permiteCierreSinTimbrar = false;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class ConceptoEmpleadoDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsSqlServerGuid() conceptoId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) valor!: number;
  @IsIn(['IMPORTE', 'PORCENTAJE', 'DIAS', 'HORAS']) tipoValor = 'IMPORTE';
  @IsDateString() vigenciaDesde!: string;
  @IsOptional() @IsDateString() vigenciaHasta?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class PrestamoDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @Transform(upper) @IsString() @MinLength(2) @MaxLength(30) tipo!: string;
  @IsOptional() @IsString() @MaxLength(80) referencia?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) montoOriginal!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) descuentoPeriodo!: number;
  @IsDateString() fechaInicio!: string;
  @IsOptional() @IsDateString() fechaFin?: string;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class ResolverAprobacionDto {
  @IsEnum(EstadoAprobacionNomina)
  @IsIn([EstadoAprobacionNomina.APROBADA, EstadoAprobacionNomina.RECHAZADA])
  estado!: EstadoAprobacionNomina;
  @IsOptional() @IsString() @MaxLength(500) comentario?: string;
}

export class AplicacionPagoDto {
  @Transform(upper)
  @IsIn(['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'COMPENSACION'])
  metodo!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monto!: number;
  @IsOptional() @IsString() @MaxLength(120) referencia?: string;
  @IsOptional() @IsSqlServerGuid() cuentaFinancieraId?: string;
  /**
   * Caja, banco o TPV del que sale el dinero. Sin este dato el pago se
   * contabiliza pero no se registra en Tesorería, y el saldo bancario queda
   * sobrevaluado por el importe de la nómina. Obligatorio salvo en
   * COMPENSACION, que no mueve efectivo.
   */
  @IsOptional() @IsSqlServerGuid() cuentaBancariaId?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) moneda = 'MXN';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) tipoCambio = 1;
}

export class RegistrarPagoNominaDto {
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => AplicacionPagoDto)
  aplicaciones!: AplicacionPagoDto[];
}

export class PrepararAprobacionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) niveles = 3;
  @IsOptional() @IsBoolean() aceptarAlertas = false;
}

export class ObligacionEmpleadoDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsEnum(TipoObligacionEmpleado) tipo!: TipoObligacionEmpleado;
  @IsString() @MinLength(1) @MaxLength(80) referencia!: string;
  @IsIn(['CUOTA_FIJA', 'PORCENTAJE', 'FACTOR', 'SALDO']) modalidad = 'CUOTA_FIJA';
  @IsIn(['PERCEPCIONES', 'NETO', 'SBC', 'UMA']) baseCalculo = 'PERCEPCIONES';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) valor!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) saldo = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) prioridad = 50;
  @IsDateString() vigenciaDesde!: string;
  @IsOptional() @IsDateString() vigenciaHasta?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() @MaxLength(400) observaciones?: string;
}

export class GenerarCfdiDto {
  @IsOptional() @IsBoolean() enviarPac = false;
}

/** Solo para webhook autenticado del adaptador PAC; no se expone como cambio manual. */
export class ResultadoPacDto {
  @IsIn(['TIMBRADO', 'ERROR', 'CANCELADO', 'SUSTITUIDO']) estado!: string;
  @IsOptional() @IsSqlServerGuid() uuidFiscal?: string;
  @IsOptional() @IsString() xmlTimbrado?: string;
  @IsOptional() @IsString() acuseCancelacion?: string;
  @IsOptional() @IsString() @MaxLength(500) ultimoError?: string;
  @IsString() @MinLength(16) @MaxLength(200) idempotencyKey!: string;
}

export class GenerarDispersionDto {
  @IsString() @MinLength(2) @MaxLength(80) banco!: string;
  @IsOptional() @IsString() @MaxLength(30) cuentaOrigen?: string;
  @IsOptional() @IsIn(['CSV_PRELAYOUT', 'BBVA', 'BANORTE', 'SANTANDER', 'CITIBANAMEX', 'HSBC']) formato = 'CSV_PRELAYOUT';
}

export class ResultadoDispersionDetalleDto {
  @IsSqlServerGuid() detalleId!: string;
  @IsIn(['ACEPTADO', 'RECHAZADO']) estado!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoAceptado = 0;
  @IsOptional() @IsString() @MaxLength(120) referenciaBanco?: string;
  @IsOptional() @IsString() @MaxLength(500) mensaje?: string;
}

export class ConciliarDispersionDto {
  @IsString() @MinLength(16) @MaxLength(128) hashRespuestaBanco!: string;
  @IsString() @MinLength(5) @MaxLength(120) referenciaBanco!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => ResultadoDispersionDetalleDto)
  resultados!: ResultadoDispersionDetalleDto[];
}

export class MarcarDispersionEnviadaDto {
  @IsString() @MinLength(5) @MaxLength(120) referenciaEnvio!: string;
  @IsString() @MinLength(16) @MaxLength(128) hashArchivo!: string;
}

export class CuentaBancariaEmpleadoDto {
  @IsString() @MinLength(1) @MaxLength(40) empleadoId!: string;
  @IsOptional() @Transform(digits) @Matches(/^\d{3}$/) bancoClave?: string;
  @IsString() @MinLength(2) @MaxLength(120) bancoNombre!: string;
  @Transform(digits) @Matches(/^\d{18}$/) clabe!: string;
  @IsOptional() @Transform(digits) @IsString() @MaxLength(20) numeroCuenta?: string;
  @IsOptional() @Transform(digits) @Matches(/^\d{4}$/) numeroTarjetaUltimos4?: string;
  @IsString() @MinLength(3) @MaxLength(120) titular!: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) moneda = 'MXN';
  @IsOptional() @IsBoolean() principal = false;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class ActualizarCuentaBancariaEmpleadoDto {
  @IsOptional() @Transform(digits) @Matches(/^\d{3}$/) bancoClave?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) bancoNombre?: string;
  @IsOptional() @Transform(digits) @Matches(/^\d{18}$/) clabe?: string;
  @IsOptional() @Transform(digits) @IsString() @MaxLength(20) numeroCuenta?: string;
  @IsOptional() @Transform(digits) @Matches(/^\d{4}$/) numeroTarjetaUltimos4?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) titular?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) moneda?: string;
  @IsOptional() @IsBoolean() principal?: boolean;
  @IsOptional() @IsEnum(EstadoCuentaBancariaEmpleado) estado?: EstadoCuentaBancariaEmpleado;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class ValidarCuentaBancariaDto {
  @IsEnum(EstadoValidacionCuentaBancaria)
  @IsIn([EstadoValidacionCuentaBancaria.VALIDADA, EstadoValidacionCuentaBancaria.RECHAZADA])
  estado!: EstadoValidacionCuentaBancaria;
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
}
