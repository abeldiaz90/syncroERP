import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { CrearConfiguracionAprobacionDto } from '../dto/crear-configuracion-aprobacion.dto';

@Injectable()
export class ConfiguracionesAprobacionService {
  constructor(
    @InjectRepository(ConfiguracionAprobacion)
    private readonly repo: Repository<ConfiguracionAprobacion>,
  ) {}

  async crear(dto: CrearConfiguracionAprobacionDto, empresaId: string) {
    await this.repo.delete({ empresaId, departamentoId: dto.departamentoId });

    const configs = dto.aprobadores.map((a) =>
      this.repo.create({
        empresaId,
        departamentoId: dto.departamentoId,
        usuarioId: a.usuarioId,
        orden: a.orden,
      }),
    );
    return this.repo.save(configs);
  }

  async obtenerPorDepartamento(departamentoId: string, empresaId: string) {
    return this.repo.find({
      where: { empresaId, departamentoId },
      relations: ['usuario'],
      order: { orden: 'ASC' },
    });
  }

  async eliminar(id: string, empresaId: string) {
    const config = await this.repo.findOne({ where: { id, empresaId } });
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return this.repo.remove(config);
  }
}