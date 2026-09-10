import { IsString, MinLength } from 'class-validator';

export class VerificarEmailDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
