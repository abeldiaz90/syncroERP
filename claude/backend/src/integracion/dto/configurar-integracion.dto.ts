import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';

export class ConfigurarIntegracionDto {
  /** Autoridad del externo sobre el crédito. */
  @IsOptional()
  @IsEnum(ModoCartera, { message: 'modo debe ser APAGADO, SOMBRA o AUTORIDAD' })
  modo?: ModoCartera;

  /** Espejo de la contabilidad. */
  @IsOptional()
  @IsEnum(ModoContabilidad, {
    message: 'modoContabilidad debe ser APAGADO o ESPEJO',
  })
  modoContabilidad?: ModoContabilidad;

  /** Oficina del externo a la que se cargan los asientos espejo. */
  @IsOptional() @IsString() oficinaContableExterna?: string;

  /*
   * Los ids de producto pertenecen al proveedor. Se validan aquí por comodidad
   * de la pantalla de administración y se guardan en `parametrosProveedor`, que
   * el núcleo no interpreta.
   */
  @IsOptional() @IsInt() @Min(1) oficinaId?: number;
  @IsOptional() @IsInt() @Min(1) productoCreditoSimpleId?: number;
  @IsOptional() @IsInt() @Min(1) productoMensualidadesId?: number;
  @IsOptional() @IsInt() @Min(1) productoMsiId?: number;

  /**
   * Caja o banco del ERP al que se imputa un cobro registrado directamente en
   * el externo.
   *
   * Sin esto no se puede reflejar ese cobro, y es correcto que no se pueda:
   * el ERP no tiene forma de saber dónde entró un dinero que recibió otro
   * sistema, y elegir una caja al azar descuadra la tesorería en silencio.
   */
  @IsOptional() @IsString() cuentaCobranzaExternaId?: string;

  /**
   * Cuenta de devoluciones a la que se carga una devolución registrada
   * directamente en el externo. No hay rol de sistema para esto, y elegir una
   * por parecido de código metería el importe en la cuenta equivocada.
   */
  @IsOptional() @IsString() cuentaDevolucionExternaId?: string;

  /**
   * Capacidades de validación contratadas. Las gobierna la consola de SUMA;
   * se aceptan aquí mientras la consola no las escriba, para poder probarlo.
   */
  @IsOptional() @IsArray() @IsString({ each: true })
  capacidadesValidacion?: string[];

  @IsOptional() @IsNumber() @Min(0) toleranciaConciliacion?: number;
}
