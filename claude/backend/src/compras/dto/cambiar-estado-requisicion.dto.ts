import { IsIn } from 'class-validator';
import { EstadoRequisicion } from '../entities/requisicion.entity';

export class CambiarEstadoRequisicionDto {
  @IsIn([
    'PENDIENTE',
    'COTIZANDO',
    'APROBADA',
    'RECHAZADA',
    'CONVERTIDA',
    'ORDEN_GENERADA',
    'RECIBIDA',
    'CON_INCIDENCIAS',
    'CANCELADA',
  ])
  estado!: EstadoRequisicion;
}
