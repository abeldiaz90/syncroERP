import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { ContextoInquilinoService } from '../services/contexto-inquilino.service';

/**
 * ============================================================================
 * La empresa de la petición acompaña a todo lo que ésta provoque
 * ----------------------------------------------------------------------------
 * Se abre el contexto una sola vez, aquí, con la empresa que viene del token
 * —nunca del cuerpo—. A partir de ese punto, cualquier llamada al core que
 * nazca de esta petición sabe de quién es, por profunda que esté.
 *
 * Va como interceptor y no repartido por los controladores por la misma razón
 * de siempre: lo que hay que acordarse de poner en cada sitio, algún día falta
 * en uno. Y aquí faltar significa escribir en el inquilino de otro cliente.
 * ============================================================================
 */
@Injectable()
export class ContextoInquilinoInterceptor implements NestInterceptor {
  constructor(private readonly contexto: ContextoInquilinoService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const peticion = ctx.switchToHttp().getRequest();
    const empresaId: string | null = peticion?.user?.empresaId ?? null;

    /*
     * `next.handle()` devuelve un Observable y el contexto tiene que seguir
     * abierto mientras ese Observable se resuelve, no sólo mientras se crea.
     * Por eso se envuelve con `from(...)` dentro del `run`: si sólo se llamara
     * a `handle()` dentro, el contexto se cerraría antes de que el controlador
     * llegara a hacer nada.
     */
    return from(
      this.contexto.ejecutarCon(empresaId, async () =>
        next.handle().toPromise(),
      ),
    ).pipe(switchMap((valor) => from(Promise.resolve(valor))));
  }
}
