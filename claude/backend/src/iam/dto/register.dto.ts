import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial es obligatorio' })
  @MinLength(2)
  @MaxLength(100)
  nombreComercial!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  @MinLength(3)
  @MaxLength(150)
  nombreCompleto!: string;

  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(100)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Mínimo 8 caracteres' })
  @MaxLength(128, { message: 'Máximo 128 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Debe contener mayúscula, minúscula, número y símbolo',
  })
  password!: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos y el aviso de privacidad' })
  aceptaTerminos!: boolean;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  terminosVersion!: string;
}
