import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class TimbrarVentaDto {
  @IsString()
  @Matches(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i)
  rfcReceptor!: string;

  @IsString()
  @MaxLength(300)
  nombreReceptor!: string;

  @IsString()
  @Matches(/^\d{3}$/)
  regimenFiscalReceptor!: string;

  @IsString()
  @Matches(/^\d{5}$/)
  codigoPostalReceptor!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{3}$/i)
  usoCFDI?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
