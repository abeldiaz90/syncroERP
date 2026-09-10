import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CrearCategoriaRecetaDto { @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nombre?: string; }
