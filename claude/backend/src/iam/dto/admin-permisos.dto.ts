import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

export class ActualizarPermisosRolDto {
  @IsObject()
  permisos!: Record<string, boolean>;
}

export class AplicarPlantillaRolDto {
  @IsOptional()
  @IsIn(['agregar', 'reemplazar'])
  modo?: 'agregar' | 'reemplazar';
}
