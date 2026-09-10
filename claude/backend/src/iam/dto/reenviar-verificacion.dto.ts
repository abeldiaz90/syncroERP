import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class ReenviarVerificacionDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'El correo no es válido' })
  email!: string;
}
