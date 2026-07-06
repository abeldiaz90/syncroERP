import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import * as bcrypt from 'bcrypt';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR USUARIO
  // ──────────────────────────────────────────────────────────────────────────
  async crear(dto: CrearUsuarioDto, empresaId: string) {
    // Verificar email único
    const existe = await this.usuarioRepo.findOne({
      where: { email: dto.email, empresaId },
    });
    if (existe) throw new ConflictException('Ya existe un usuario con ese email en esta empresa.');

    // Generar contraseña temporal si no viene en el DTO
    const passwordTemporal = dto.password ?? this.generarPasswordTemporal();
    const hash             = await bcrypt.hash(passwordTemporal, 10);

    const usuario = this.usuarioRepo.create({
      ...dto,
      empresaId,
      password: hash,
      activo: true,
    } as any);
    const guardado = await this.usuarioRepo.save(usuario);

    // Email de bienvenida — no bloquea
    this.notificaciones.notificarUsuarioNuevo(guardado, passwordTemporal)
      .catch(e => console.error('[Email] Bienvenida usuario:', e?.message));

    // No devolver el hash de la contraseña
    const { password: _, ...resultado } = guardado as any;
    return resultado;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const qb = this.usuarioRepo.createQueryBuilder('u')
      .leftJoinAndSelect('u.departamento', 'dep')
      .where('u.empresaId = :empresaId', { empresaId });

    if (soloActivos) qb.andWhere('u.activo = :activo', { activo: true });
    if (filtro) {
      qb.andWhere(
        '(u.nombreCompleto LIKE :filtro OR u.email LIKE :filtro)',
        { filtro: `%${filtro}%` },
      );
    }
    return qb.orderBy('u.nombreCompleto', 'ASC').getMany();
  }

  async obtenerPorId(id: string, empresaId: string) {
    const u = await this.usuarioRepo.findOne({
      where:     { id, empresaId },
      relations: ['departamento'],
    });
    if (!u) throw new NotFoundException('Usuario no encontrado.');
    return u;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR
  // ──────────────────────────────────────────────────────────────────────────
  async actualizar(id: string, dto: ActualizarUsuarioDto, empresaId: string) {
    const usuario = await this.obtenerPorId(id, empresaId);

    if (dto.password) {
      (dto as any).password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(usuario, dto);
    return this.usuarioRepo.save(usuario);
  }

  async toggleActivo(id: string, empresaId: string) {
    const usuario = await this.obtenerPorId(id, empresaId);
    usuario.activo = !usuario.activo;
    return this.usuarioRepo.save(usuario);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────
  private generarPasswordTemporal(): string {
    // 8 caracteres: letras + números
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
}