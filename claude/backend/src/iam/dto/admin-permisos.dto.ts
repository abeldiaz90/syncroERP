import { IsIn, IsObject, IsOptional } from 'class-validator';
import { AccesoModulo } from '../data/modulos-catalogo';

export class ActualizarPermisosRolDto {
  @IsObject()
  permisos!: Record<string, boolean>;
}

export class AplicarPlantillaRolDto {
  @IsOptional()
  @IsIn(['agregar', 'reemplazar'])
  modo?: 'agregar' | 'reemplazar';
}

/**
 * El acceso de un rol expresado por modulo. La clave es el id del modulo tal
 * como lo declara `modulos-catalogo.ts`; el valor, uno de los tres estados.
 * Lo que no venga en el mapa NO se toca. Asi, guardar el acceso de un modulo
 * nunca borra el ajuste fino que alguien haya hecho en otro.
 */
export class AsignarModulosRolDto {
  @IsObject()
  accesos!: Record<string, AccesoModulo>;

  @IsOptional()
  @IsIn(['agregar', 'reemplazar'])
  modo?: 'agregar' | 'reemplazar';
}
