import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditoCliente } from '../entities/credito-cliente.entity';
import { CobranzaService } from './cobranza.service';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';

/**
 * Mantiene la cartera vencida para todas las empresas. Vive en Crédito para
 * evitar una dependencia circular desde Notificaciones hacia Cobranza.
 */
@Injectable()
export class CobranzaCronService {
  private readonly logger = new Logger(CobranzaCronService.name);

  constructor(
    @InjectRepository(CreditoCliente)
    private readonly creditos: Repository<CreditoCliente>,
    private readonly cobranza: CobranzaService,
  ) {}

  @Cron('0 8 * * *', { name: 'actualizar-cartera-vencida' })
  async ejecutar(): Promise<void> {
    if (omitirTareaProgramada('actualizar-cartera-vencida')) return;

    const empresas = await this.creditos
      .createQueryBuilder('c')
      .select('DISTINCT c.empresaId', 'empresaId')
      .getRawMany<{ empresaId: string }>();

    for (const { empresaId } of empresas) {
      try {
        const resultado = await this.cobranza.actualizarVencidos(empresaId);
        this.logger.log(
          `Cartera ${empresaId}: ${resultado.actualizadas} cuota(s) actualizada(s).`,
        );
      } catch (error) {
        this.logger.error(
          `No se actualizó la cartera ${empresaId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
