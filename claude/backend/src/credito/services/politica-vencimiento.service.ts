import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PoliticaVencimientoEmpresa } from '../entities/politica-vencimiento-empresa.entity';

/** Ajusta una fecha de vencimiento. La identidad cuando la regla está apagada. */
export type AjustadorVencimiento = (fecha: Date) => Date;

const SIN_AJUSTE: AjustadorVencimiento = (fecha) => fecha;

/**
 * Decide si una cuota que cae en día inhábil se recorre, y hacia dónde.
 *
 * La regla es del ERP y no del registro externo: ver el comentario de
 * `PoliticaVencimientoEmpresa`. Una empresa sin Fineract obtiene exactamente el
 * mismo comportamiento que una que lo usa, porque el cálculo ocurre en el mismo
 * lugar para las dos.
 */
@Injectable()
export class PoliticaVencimientoService {
  private readonly logger = new Logger(PoliticaVencimientoService.name);

  constructor(
    @InjectRepository(PoliticaVencimientoEmpresa)
    private readonly repo: Repository<PoliticaVencimientoEmpresa>,
  ) {}

  /**
   * Devuelve el ajustador de la empresa. Se resuelve una vez por crédito y se
   * pasa al cálculo, que así sigue siendo una función pura y comprobable.
   *
   * Si la política no se puede leer, se devuelve la identidad: un fallo de
   * configuración no debe mover la fecha de vencimiento de nadie.
   */
  async ajustadorDe(
    empresaId: string,
    manager?: EntityManager,
  ): Promise<AjustadorVencimiento> {
    let politica: PoliticaVencimientoEmpresa | null = null;
    try {
      const repo = manager
        ? manager.getRepository(PoliticaVencimientoEmpresa)
        : this.repo;
      politica = await repo.findOne({ where: { empresaId } });
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la política de vencimientos de ${empresaId}: ${
          error instanceof Error ? error.message : String(error)
        }. Las fechas se dejan sin ajustar.`,
      );
      return SIN_AJUSTE;
    }

    if (!politica?.recorrerADiaHabil) return SIN_AJUSTE;

    const habil = (fecha: Date) => {
      const dia = fecha.getDay();
      if (dia === 6) return politica.sabadoHabil;
      if (dia === 0) return politica.domingoHabil;
      return true;
    };

    // Si ningún día resultara hábil, recorrer sería un ciclo infinito.
    if (!habil(new Date(2026, 0, 3)) && !habil(new Date(2026, 0, 4))) {
      // Lunes a viernes siempre son hábiles, así que esto no puede pasar hoy;
      // la guarda queda por si mañana los días hábiles se vuelven configurables.
      const lunes = new Date(2026, 0, 5);
      if (!habil(lunes)) return SIN_AJUSTE;
    }

    const paso = politica.direccion === 'ANTERIOR' ? -1 : 1;

    return (fecha: Date) => {
      const ajustada = new Date(fecha);
      let vueltas = 0;
      while (!habil(ajustada) && vueltas < 7) {
        ajustada.setDate(ajustada.getDate() + paso);
        vueltas += 1;
      }
      return ajustada;
    };
  }
}
