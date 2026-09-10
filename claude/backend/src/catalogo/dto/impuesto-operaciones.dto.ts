import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class GuardarImpuestoDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nombre!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) porcentaje!: number;
}
