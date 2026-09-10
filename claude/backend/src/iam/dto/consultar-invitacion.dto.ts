import { IsString, Length } from 'class-validator';

export class ConsultarInvitacionDto {
  @IsString()
  @Length(64, 64)
  token!: string;
}
