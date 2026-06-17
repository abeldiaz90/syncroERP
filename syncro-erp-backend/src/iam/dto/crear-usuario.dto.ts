import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombreCompleto: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['admin', 'empleado', 'comprador', 'almacenista'])
  rol?: string;

  @IsOptional()
  @IsString()
  departamentoId?: string;
}