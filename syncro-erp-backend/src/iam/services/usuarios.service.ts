import { Injectable, NotFoundException, ConflictException, BadRequestException, } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../entities/usuario.entity';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
import { Like } from 'typeorm';

@Injectable()
export class UsuariosService {
    constructor(
        @InjectRepository(Usuario)
        private readonly usuarioRepo: Repository<Usuario>,
    ) { }

    async crear(dto: CrearUsuarioDto, empresaId: string) {
        const existe = await this.usuarioRepo.findOne({ where: { email: dto.email } });
        if (existe) throw new ConflictException('El correo ya está registrado');

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(dto.password, salt);

        const usuario = this.usuarioRepo.create({
            empresaId,
            nombreCompleto: dto.nombreCompleto,
            email: dto.email,
            passwordHash,
            rol: dto.rol || 'empleado',
            departamentoId: dto.departamentoId || null,
        });
        return this.usuarioRepo.save(usuario);
    }

    async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
        const where: any = { empresaId };
        if (soloActivos) {
            where.activo = true;
        }

        if (filtro) {
            return this.usuarioRepo.find({
                where: [
                    { ...where, nombreCompleto: Like(`%${filtro}%`) },
                    { ...where, email: Like(`%${filtro}%`) },
                    { ...where, rol: Like(`%${filtro}%`) },
                ],
                relations: ['departamento'],
                select: ['id', 'nombreCompleto', 'email', 'rol', 'departamentoId', 'activo'],
                order: { nombreCompleto: 'ASC' },
            });
        }

        return this.usuarioRepo.find({
            where,
            relations: ['departamento'],
            select: ['id', 'nombreCompleto', 'email', 'rol', 'departamentoId', 'activo'],
            order: { nombreCompleto: 'ASC' },
        });
    }

    async obtenerPorId(id: string, empresaId: string) {
        const usuario = await this.usuarioRepo.findOne({
            where: { id, empresaId },
            relations: ['departamento'],
        });
        if (!usuario) throw new NotFoundException('Usuario no encontrado');
        return usuario;
    }

    async actualizar(id: string, dto: ActualizarUsuarioDto, empresaId: string) {
        const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
        if (!usuario) throw new NotFoundException('Usuario no encontrado');

        if (dto.nombreCompleto) usuario.nombreCompleto = dto.nombreCompleto;
        if (dto.email) {
            const duplicado = await this.usuarioRepo.findOne({ where: { email: dto.email } });
            if (duplicado && duplicado.id !== id) throw new ConflictException('El correo ya está en uso');
            usuario.email = dto.email;
        }
        if (dto.password) {
            const salt = await bcrypt.genSalt(10);
            usuario.passwordHash = await bcrypt.hash(dto.password, salt);
        }
        if (dto.rol) usuario.rol = dto.rol;
        if (dto.departamentoId !== undefined) usuario.departamentoId = dto.departamentoId || null;

        return this.usuarioRepo.save(usuario);
    }

    async toggleActivo(id: string, empresaId: string) {
        const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
        if (!usuario) throw new NotFoundException('Usuario no encontrado');
        usuario.activo = !usuario.activo;
        return this.usuarioRepo.save(usuario);
    }
}