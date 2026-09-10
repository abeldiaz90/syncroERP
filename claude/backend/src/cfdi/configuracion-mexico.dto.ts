import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  PerfilImpuestosMx,
  TipoPersonaFiscal,
} from './catalogos-fiscales-mx';

export class ConfiguracionMexicoDto {
  @IsIn(['FISICA', 'MORAL'])
  tipoPersona!: TipoPersonaFiscal;

  @IsString()
  @Matches(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i, {
    message: 'El RFC no tiene una estructura válida.',
  })
  rfc!: string;

  @IsString()
  @Length(1, 300)
  razonSocial!: string;

  @IsString()
  @Matches(/^\d{3}$/, {
    message: 'Selecciona una clave de régimen fiscal SAT válida.',
  })
  regimenFiscal!: string;

  @IsString()
  @Matches(/^\d{5}$/, {
    message: 'El código postal fiscal debe contener exactamente 5 dígitos.',
  })
  codigoPostal!: string;

  @IsString()
  @IsOptional()
  giro?: string;

  @IsIn(['GENERAL', 'MIXTO', 'EXENTO', 'FRONTERA'])
  perfilImpuestos!: PerfilImpuestosMx;

  @IsBoolean()
  @IsOptional()
  confirmaEstimuloFronterizo?: boolean;

  @IsBoolean()
  confirmaRevisionConContador!: boolean;
}

