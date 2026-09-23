import { Controller, Get, Post } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { ContabilidadConciliacionService } from '../services/contabilidad-conciliacion.service';
import { ROLES_ESPEJO_CONTABLE } from '../integracion.constants';

/**
 * ============================================================================
 * «¿La balanza del ERP y la del mayor externo dicen lo mismo?»
 * ----------------------------------------------------------------------------
 * Es LA pregunta del espejo contable, y es del contador. Estaba cerrada a
 * administración y, peor, no tenía pantalla: el único sitio del sistema que
 * compara los dos mayores existía sólo en la API. La tarea de fondo lo
 * comprobaba cada diez minutos y dejaba avisos que nadie miraba.
 *
 * El síntoma es el que más caro sale: la cola dice ENVIADO, el asiento llegó,
 * y nadie comprueba jamás que lo que aterrizó del otro lado sea lo mismo que
 * salió de aquí. Un espejo que nadie contrasta es una promesa, no un control.
 * ============================================================================
 */
@Controller('integracion/contabilidad/conciliacion')
@Roles(...ROLES_ESPEJO_CONTABLE)
export class ContabilidadConciliacionController {
  constructor(private readonly conciliacion: ContabilidadConciliacionService) {}
  @Get()
  consultar(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.conciliarEmpresa(empresaId);
  }
  @Post('ejecutar')
  ejecutar(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.conciliarEmpresa(empresaId, true);
  }
}
