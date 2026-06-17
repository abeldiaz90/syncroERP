import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from '../entities/categoria.entity';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

@Injectable()
export class CategoriasService {
    constructor(
        @InjectRepository(Categoria)
        private readonly categoriaRepository: Repository<Categoria>,
    ) {}

    async crearCategoria(dto: CrearCategoriaDto, empresaId: string) {
        // Nos aseguramos de que el campo 'activo' tenga un valor predeterminado
        const nueva = this.categoriaRepository.create({ 
            ...dto, 
            empresaId,
            activo: true // Aseguramos que no llegue como null/undefined
        });

        try {
            return await this.categoriaRepository.save(nueva);
        } catch (error: any) {
            // El código 2627/2601 es específico de SQL Server
            if (error.number === 2627 || error.number === 2601 || error.code === '23505') {
                throw new ConflictException('Ya existe una categoría con este nombre en tu cuenta.');
            }
            throw new InternalServerErrorException('Error al crear la categoría: ' + error.message);
        }
    }

    async obtenerCategorias(empresaId: string) {
        return await this.categoriaRepository.find({
            where: { empresaId },
            order: { nombre: 'ASC' }
        });
    }

    async actualizarCategoria(id: string, dto: Partial<CrearCategoriaDto>, empresaId: string) {
        const categoria = await this.categoriaRepository.findOne({ where: { id, empresaId } });
        if (!categoria) throw new NotFoundException('La categoría no existe o no tienes permisos.');
        
        Object.assign(categoria, dto);
        
        try {
            return await this.categoriaRepository.save(categoria);
        } catch (error: any) {
            if (error.number === 2627 || error.number === 2601 || error.code === '23505') {
                throw new ConflictException(`Ya existe otra categoría con el nombre '${dto.nombre}'.`);
            }
            throw new InternalServerErrorException('Error al actualizar la categoría.');
        }
    }

    async cambiarEstadoCategoria(id: string, empresaId: string) {
        const categoria = await this.categoriaRepository.findOne({ where: { id, empresaId } });
        if (!categoria) throw new NotFoundException('Categoría no encontrada.');
        
        categoria.activo = !categoria.activo;
        return await this.categoriaRepository.save(categoria);
    }
}