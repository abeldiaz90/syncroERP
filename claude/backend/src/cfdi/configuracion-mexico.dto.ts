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
import { EsRfc } from '../common/validators/rfc.validator';

export class ConfiguracionMexicoDto {
  @IsIn(['FISICA', 'MORAL'])
  tipoPersona!: TipoPersonaFiscal;

  @EsRfc()
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

