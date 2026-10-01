import { IsOptional, IsISO8601 } from 'class-validator';

/**
 * Hasta qué fecha encolar las pólizas que nunca llegaron al mayor externo.
 *
 * Existe como clase y no como objeto suelto porque el cuerpo de toda petición
 * de este ERP llega con un contrato que validar: sin él, `hasta` viaja como lo
 * que sea que mande quien llame, y acaba dentro de una consulta por fecha.
 * Omitirlo significa «todas».
 */
export class EncolarFaltantesDto {
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha se espera como AAAA-MM-DD.' })
  hasta?: string;
}
