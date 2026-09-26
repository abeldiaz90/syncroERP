import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EsCampoCondicional } from '../../common/validators/campo-condicional.validator';
import { TipoSolicitudEstructura } from '../entities/solicitud-estructura.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CrearSolicitudEstructuraDto {
  @IsEnum(TipoSolicitudEstructura)
  tipo!: TipoSolicitudEstructura;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  nombre!: string;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500)
  motivo!: string;

  /*
   * Los cinco campos del puesto van con `EsCampoCondicional` y no con
   * `@ValidateIf` + validadores de forma. Con la forma anterior, pedir el alta
   * de un puesto sin sus datos devolvía DIEZ mensajes para cinco campos —la
   * mitad falsos, todos menos uno en inglés— y ninguno decía lo único que
   * importaba: que faltaban. Ver la cabecera del validador.
   */
  @Transform(upper)
  @EsCampoCondicional({
    requeridoCuando: (o) => o?.tipo === TipoSolicitudEstructura.PUESTO,
    cuandoFalta: 'Falta la clave del puesto.',
    etiqueta: 'La clave del puesto',
    forma: 'texto',
    minimo: 1,
    maximo: 20,
  })
  clave?: string;

  @EsCampoCondicional({
    requeridoCuando: (o) => o?.tipo === TipoSolicitudEstructura.PUESTO,
    cuandoFalta: 'Elige el departamento al que pertenece el puesto.',
    etiqueta: 'El departamento',
    forma: 'uuid',
  })
  departamentoId?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(400)
  descripcion?: string;

  @EsCampoCondicional({
    requeridoCuando: (o) => o?.tipo === TipoSolicitudEstructura.PUESTO,
    cuandoFalta: 'Falta el salario mínimo del rango autorizado.',
    etiqueta: 'El salario mínimo',
    forma: 'numero',
    minimo: 0.01,
  })
  salarioMinimo?: number;

  @EsCampoCondicional({
    requeridoCuando: (o) => o?.tipo === TipoSolicitudEstructura.PUESTO,
    cuandoFalta: 'Falta el salario máximo del rango autorizado.',
    etiqueta: 'El salario máximo',
    forma: 'numero',
    minimo: 0.01,
  })
  salarioMaximo?: number;

  @EsCampoCondicional({
    requeridoCuando: (o) => o?.tipo === TipoSolicitudEstructura.PUESTO,
    cuandoFalta: 'Indica cuántas plazas se autorizan.',
    etiqueta: 'El número de plazas',
    forma: 'entero',
    minimo: 1,
  })
  plazasAutorizadas?: number;
}

export class ResolverSolicitudEstructuraDto {
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['APROBAR', 'RECHAZAR'])
  decision!: 'APROBAR' | 'RECHAZAR';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  comentario?: string;
}
