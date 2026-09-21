import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TipoIdentificacion } from './entities/cliente-identificacion.entity';

const TIPOS = Object.values(TipoIdentificacion);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GuardarIdentificacionDto {
  @IsIn(TIPOS, { message: `tipo debe ser uno de: ${TIPOS.join(', ')}` })
  tipo!: TipoIdentificacion;

  /*
   * El folio se guarda tal como viene, sólo sin espacios sobrantes. Se evitó
   * normalizarlo a mayúsculas: una clave de elector las usa y un folio de
   * comprobante de domicilio puede no usarlas, y cambiar lo que el operador
   * leyó del documento hace que no coincida al cotejarlo.
   */
  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'El folio es demasiado corto para ser un documento.' })
  @MaxLength(100)
  folio!: string;

  @IsOptional()
  @Matches(FECHA, { message: 'vigenciaDesde debe tener el formato aaaa-mm-dd' })
  vigenciaDesde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'vigenciaHasta debe tener el formato aaaa-mm-dd' })
  vigenciaHasta?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  emisor?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(300)
  notas?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
