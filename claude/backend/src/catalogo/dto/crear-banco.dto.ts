import {
  IsString,
  IsNotEmpty,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CrearBancoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  /**
   * Clave de institución de tres dígitos. Es el prefijo que ocupa la
   * institución en una CLABE mexicana; la CLABE completa pertenece a una
   * cuenta bancaria, no al banco.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 3)
  @Matches(/^\d{3}$/, {
    message: 'clave debe contener exactamente 3 dígitos',
  })
  clave!: string;
}
