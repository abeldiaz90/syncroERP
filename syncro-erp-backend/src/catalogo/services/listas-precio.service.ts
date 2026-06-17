import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListaPrecio } from '../entities/lista-precio.entity';

@Injectable()
export class ListasPrecioService {
  constructor(
    @InjectRepository(ListaPrecio)
    private readonly listaPrecioRepository: Repository<ListaPrecio>,
  ) {}

  async obtenerListas(empresaId: string) {
    return this.listaPrecioRepository.find({
      where: { empresaId },
      order: { esPorDefecto: 'DESC', nombre: 'ASC' },
    });
  }

  async crearLista(dto: { nombre: string; esPorDefecto: boolean }, empresaId: string) {
    // Si la nueva lista es por defecto, quitamos ese flag a las demás de este inquilino
    if (dto.esPorDefecto) {
      await this.listaPrecioRepository.update({ empresaId }, { esPorDefecto: false });
    }

    const nueva = this.listaPrecioRepository.create({ ...dto, empresaId });
    return this.listaPrecioRepository.save(nueva);
  }

  async actualizarLista(id: string, dto: { nombre?: string; esPorDefecto?: boolean }, empresaId: string) {
    const lista = await this.listaPrecioRepository.findOne({ where: { id, empresaId } });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    // Si se actualiza a por defecto, quitamos el flag a las demás
    if (dto.esPorDefecto) {
      await this.listaPrecioRepository.update({ empresaId }, { esPorDefecto: false });
    }

    Object.assign(lista, dto);
    return this.listaPrecioRepository.save(lista);
  }

  async eliminarLista(id: string, empresaId: string) {
    const lista = await this.listaPrecioRepository.findOne({ where: { id, empresaId } });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    
    await this.listaPrecioRepository.remove(lista);
    return { mensaje: 'Lista eliminada correctamente' };
  }
}