import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly arranque = Date.now();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Viveza: sólo dice que el proceso contesta. No toca la base. */
  viveza() {
    return {
      estado: 'vivo',
      segundosEnPie: Math.floor((Date.now() - this.arranque) / 1000),
      fecha: new Date().toISOString(),
    };
  }

  /**
   * Disponibilidad: además de contestar, ¿puede trabajar?
   *
   * El motivo del fallo no se devuelve al que pregunta —un mensaje de la base
   * de datos en una ruta pública dice de más— pero sí se registra, que es donde
   * hace falta cuando el orquestador empieza a reciclar el contenedor.
   */
  async disponibilidad(): Promise<{ listo: boolean; base: 'arriba' | 'abajo' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { listo: true, base: 'arriba' };
    } catch (error) {
      this.logger.error(
        `La base no responde al chequeo de disponibilidad: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { listo: false, base: 'abajo' };
    }
  }
}
