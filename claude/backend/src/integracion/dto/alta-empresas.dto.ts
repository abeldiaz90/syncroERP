import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

/**
 * ============================================================================
 * LA CONSOLA DE SUMA, CON CONTRATO
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTOS DTO
 *
 * El `ValidationPipe` global del ERP va con `whitelist: true` y
 * `forbidNonWhitelisted: true`: un campo que un DTO no declare no se ignora, se
 * rechaza con 400. Es la postura más fuerte posible… y sólo actúa sobre cuerpos
 * tipados como CLASE con decoradores.
 *
 * `alta-empresas.controller.ts` declaraba sus cuerpos como tipos de objeto EN
 * LÍNEA (`@Body() cuerpo: { correo?: string; … }`). El tipo se borra al
 * compilar, así que Nest entrega `req.body` crudo y el pipe global no mira
 * nada. Era el único controlador del ERP así, y justamente el que cruza
 * empresas por diseño: crea clientes, les asigna administrador y decide qué
 * directorios pueden autenticar.
 *
 * La credencial de servicio (`x-aprovisionamiento`, mínimo 32 caracteres,
 * comparada en tiempo constante) sigue siendo la puerta y es buena. Esto es lo
 * que va DETRÁS de la puerta: lo que entra por ella tiene forma comprobada.
 *
 * QUÉ SE COMPRUEBA Y POR QUÉ, CAMPO A CAMPO
 *
 * No es validación por higiene. Cada regla de aquí tapa una consecuencia
 * concreta:
 *
 *  · `emisor` acaba siendo un EMISOR DE TOKENS ACEPTADO por el ERP. Sin forma
 *    comprobada, una cadena cualquiera entra en la lista contra la que se
 *    valida cada inicio de sesión. Se exige `https://` —un emisor en claro
 *    permitiría a quien esté en medio servir sus propias llaves— y se prohíben
 *    espacios y saltos de línea.
 *  · `realm` y los `clientId` viajan a URL de Keycloak. Alfabeto acotado.
 *  · `empresaId` llega por la ruta y se usa para buscar y escribir. GUID.
 *  · `solicitadoPor` es lo ÚNICO que dice quién autorizó del lado de SUMA, y va
 *    a la bitácora. Una credencial de servicio dice qué sistema llamó, no quién
 *    lo pidió; una bitácora que sólo dice «la consola» no audita a nadie. Por
 *    eso es obligatorio y con largo mínimo: «x» no es un nombre.
 *  · Los secretos se cifran y se guardan. Se les pone tope de largo para que un
 *    cuerpo enorme no llegue al cifrado ni a la columna.
 *  · `identificadores` de la reserva se convierten en inquilinos de Fineract:
 *    alfabeto de identificador, no texto libre.
 *
 * El RFC NO se valida aquí: ya lo comprueba el controlador con `rfc.util`, que
 * mira forma y fecha pero no el dígito verificador —cuyo algoritmo rechaza RFC
 * legítimos anteriores a la homoclave—. Duplicarlo aquí con un `Matches` más
 * pobre sería empeorarlo.
 * ============================================================================
 */

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Quién autoriza, del lado de SUMA. Va a la bitácora de todas estas rutas. */
const QUIEN_AUTORIZA = {
  min: 3,
  max: 150,
} as const;

export class SolicitadoPorDto {
  @Transform(trim)
  @IsString()
  @MinLength(QUIEN_AUTORIZA.min)
  @MaxLength(QUIEN_AUTORIZA.max)
  solicitadoPor!: string;
}

export class AdministradorDeEmpresaDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo del administrador no tiene forma de correo.' })
  @MaxLength(180)
  correo!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) apellido?: string;
}

export class CrearEmpresaDto extends SolicitadoPorDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombreComercial!: string;

  /*
   * Opcional a propósito: una empresa puede darse de alta antes de que su RFC
   * se conozca. La forma la comprueba el controlador con `rfc.util`.
   */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(13) rfc?: string;

  @IsOptional() @IsBoolean() usaFineract?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdministradorDeEmpresaDto)
  administrador?: AdministradorDeEmpresaDto;
}

export class AsignarAdministradorDto extends SolicitadoPorDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo del administrador no tiene forma de correo.' })
  @MaxLength(180)
  correo!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) apellido?: string;
}

export class RegistrarReservaDto {
  /*
   * Cada identificador acaba siendo el nombre de un inquilino de Fineract, que
   * va en una cabecera y en el nombre de un esquema de base de datos. Alfabeto
   * de identificador, no texto libre.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
      : value,
  )
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    each: true,
    message:
      'Un identificador de inquilino sólo admite letras, números, guion y guion bajo.',
  })
  identificadores!: string[];
}

export class RegistrarIdentidadDto extends SolicitadoPorDto {
  /*
   * ESTO SE CONVIERTE EN UN EMISOR DE TOKENS ACEPTADO. Es el campo más sensible
   * de todo el archivo: lo que entre aquí pasa a formar parte de la lista
   * contra la que se valida cada inicio de sesión del ERP.
   *
   * `https` obligatorio: con un emisor en claro, quien esté en medio sirve sus
   * propias llaves de firma y emite tokens válidos para el ERP.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\/$/, '') : value,
  )
  @IsString()
  @MaxLength(300)
  @Matches(/^https:\/\/[^\s/$.?#][^\s]*$/, {
    message:
      'El emisor tiene que ser una URL https sin espacios: es el directorio cuyos tokens aceptará el ERP.',
  })
  emisor!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'El realm sólo admite letras, números, punto, guion y guion bajo.',
  })
  realm!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'El client id sólo admite letras, números, punto, guion y guion bajo.',
  })
  clientIdPublico!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  clientIdServicio?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  clientIdProvisionador?: string;

  /* Se cifran antes de guardarse; el tope evita que un cuerpo enorme llegue ahí. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) secretoServicio?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) secretoProvisionador?: string;

  /* Lista separada por comas; el servicio la parte y la normaliza. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) dominiosPermitidos?: string;
}

/**
 * El id de empresa que llega por la ruta.
 *
 * Va a un `where` y a escrituras. Que sea un GUID no es una formalidad: un
 * parámetro con otra forma sólo puede venir de una llamada mal construida o de
 * alguien probando, y en los dos casos es mejor un 400 claro que una consulta.
 */
export class EmpresaPorRutaDto {
  @IsSqlServerGuid()
  empresaId!: string;
}
