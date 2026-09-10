import { IsEmail, MaxLength } from 'class-validator';

export class RecuperarPasswordDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;
}
