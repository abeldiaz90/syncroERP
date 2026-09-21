import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

/**
 * ============================================================================
 * Señales de vida del servicio
 * ----------------------------------------------------------------------------
 * `main.ts` deja `salud` fuera del prefijo `api` «para que los balanceadores lo
 * consulten sin conocer el esquema de la API». Durante un tiempo esa reserva
 * apuntaba a nada: no existía el controlador, así que `/salud` respondía 404 y
 * cualquier balanceador configurado contra esa ruta habría dado el servicio por
 * caído justo al desplegarlo.
 *
 * Son dos rutas y no una porque responden preguntas distintas:
 *
 *  · `/salud` es VIVEZA: ¿el proceso responde? No toca la base. Un balanceador
 *    la consulta cada pocos segundos, y una consulta a la base en cada latido
 *    es carga permanente a cambio de nada.
 *
 *  · `/salud/listo` es DISPONIBILIDAD: ¿puede atender? Sí toca la base, porque
 *    un proceso vivo con la base caída no debe recibir tráfico. Responde 503
 *    —no 200 con un campo «ok: false»— para que el orquestador lo entienda sin
 *    leer el cuerpo.
 *
 * Ambas son públicas a propósito: un chequeo de salud que exige autenticarse
 * no lo puede usar quien necesita usarlo. Por eso no dicen nada que no se
 * pueda saber desde fuera —ni versiones de dependencias, ni configuración—.
 * ============================================================================
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('salud')
  viveza() {
    return this.appService.viveza();
  }

  @Public()
  @Get('salud/listo')
  async disponibilidad() {
    const estado = await this.appService.disponibilidad();
    if (!estado.listo) {
      throw new ServiceUnavailableException(estado);
    }
    return estado;
  }
}
