import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { Empresa } from '../entities/empresa.entity';
import { Usuario } from '../entities/usuario.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { PermisosDinamicosService } from './permisos-dinamicos.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    // ✅ Usamos el servicio en lugar del repo directo
    private readonly permisosService: PermisosDinamicosService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async registrarEmpresa(registerDto: RegisterDto) {
    const { nombreComercial, nombreCompleto, email, password } = registerDto;

    const usuarioExistente = await this.usuarioRepository.findOne({
      where: { email },
    });
    if (usuarioExistente) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const nuevaEmpresa = queryRunner.manager.create(Empresa, {
        nombreComercial,
      });
      const empresaGuardada = await queryRunner.manager.save(nuevaEmpresa);

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const nuevoUsuario = queryRunner.manager.create(Usuario, {
        empresaId: empresaGuardada.id,
        nombreCompleto,
        email,
        passwordHash,
        rol: 'admin',
      });
      await queryRunner.manager.save(nuevoUsuario);

      await queryRunner.commitTransaction();

      return {
        mensaje: 'Empresa y usuario administrador creados correctamente',
        empresaId: empresaGuardada.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(
        'Error al registrar la empresa, cambios revertidos',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const usuario = await this.usuarioRepository.findOne({
      where: { email },
      relations: ['empresa'],
    });

    if (!usuario) throw new UnauthorizedException('Credenciales inválidas');

    const isPasswordValid = await bcrypt.compare(password, usuario.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Credenciales inválidas');

    if (!usuario.activo) {
      throw new UnauthorizedException('Tu cuenta está desactivada');
    }

    const empresaId = usuario.empresa?.id ?? usuario.empresaId;

    // ✅ CORRECCIÓN CRÍTICA: filtramos por empresaId también
    // El mapa tiene formato { "GET /marcas": true, "POST /marcas": false, ... }
    // Esto es exactamente lo que usePermiso() del frontend espera
    const permisos = usuario.rol === 'admin'
      ? {} // El admin tiene bypass total, no necesitamos cargar todos los permisos
      : await this.permisosService.obtenerPermisosPorRolParaFrontend(
          usuario.rol,
          empresaId,
        );

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombreCompleto,
        rol: usuario.rol,
        empresaId,
      },
      // ✅ FORMATO UNIFICADO:
      // - Admin: permisos vacío ({}) — el frontend lo detecta y da acceso total
      // - Otros roles: { "GET /marcas": true, "PATCH /marcas": false, ... }
      permisos,
    };
  }
}