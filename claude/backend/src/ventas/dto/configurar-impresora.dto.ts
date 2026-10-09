import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AnchoPapel,
  ModoImpresion,
} from '../../caja/entities/impresora-caja.entity';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

/**
 * Lo que hace falta para declarar la impresora de una caja.
 *
 * El `host` es obligatorio **sólo** en el modo RED, y eso se dice en la regla
 * en vez de dejarlo a la buena voluntad de la pantalla: una impresora de red
 * sin dirección es una caja que descubre el problema con el primer cliente
 * enfrente. En los otros modos se ignora, porque guardar una IP para un modo
 * que no la usa hace creer que está configurada.
 */
export class ConfigurarImpresoraDto {
  /*
   * Sin cuenta se configura la impresora de la empresa, la que usan las cajas
   * que no declararon la suya. Y la cadena vacía que manda un desplegable en
   * «(ninguna)» tiene que llegar como ausente, no como un identificador vacío
   * que crearía una impresora huérfana de toda caja.
   */
  @IsSqlServerGuidOpcional()
  cuentaCajaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsEnum(ModoImpresion, {
    message:
      'El modo de impresión tiene que ser RED (la impresora tiene su propia IP), NAVEGADOR (cuelga por USB de la caja) o NINGUNA.',
  })
  modo!: ModoImpresion;

  @ValidateIf((o: ConfigurarImpresoraDto) => o.modo === ModoImpresion.RED)
  @IsString({
    message:
      'Una impresora de red necesita su dirección IP o el nombre del equipo.',
  })
  @MaxLength(120)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  puerto?: number;

  @IsOptional()
  @IsIn([AnchoPapel.MM58, AnchoPapel.MM80], {
    message:
      'El ancho del papel es 32 caracteres (58 mm) o 48 (80 mm); cualquier otro corta los importes.',
  })
  ancho?: number;

  @IsOptional()
  @IsBoolean()
  abrirCajon?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pie?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  copias?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/**
 * Para la página de prueba. Es un cuerpo de un solo campo opcional, y aun así
 * lleva clase: un tipo estructural escrito en el controlador no lo valida
 * nadie, y el día que ese campo crezca nadie se acuerda de añadirle reglas.
 */
export class ProbarImpresoraDto {
  @IsSqlServerGuidOpcional()
  cuentaCajaId?: string;
}
