import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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

  @IsOptional() @IsNumber() @Min(0) toleranciaConciliacion?: number;
}
