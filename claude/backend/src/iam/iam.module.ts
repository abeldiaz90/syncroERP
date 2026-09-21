import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Controlador } from './entities/controlador.entity';
import { Endpoint } from './entities/endpoint.entity';
import { RolEndpointPermiso } from './entities/rol-endpoint-permiso.entity';
import { Usuario } from './entities/usuario.entity';
import { Empresa } from './entities/empresa.entity';
import { EmpresaIdentidad } from './entities/empresa-identidad.entity';

import { PermisosDinamicosService } from './services/permisos-dinamicos.service';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsuariosService } from './services/usuarios.service';
import { DirectorioIdentidadService } from './services/directorio-identidad.service';
import { IdentidadEmpresaService } from './services/identidad-empresa.service';

import { AdminPermisosController } from './controllers/admin-permisos.controller';
import { AuthController } from './controllers/auth.controller';
import { UsuariosController } from './controllers/usuarios.controller';

import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CommonModule } from '../common/modules/common.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Controlador,
      Endpoint,
      RolEndpointPermiso,
      Usuario,
      Empresa,
      EmpresaIdentidad,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRATION', '8h') as any,
        },
      }),
    }),
    NotificacionesModule,
    CommonModule,
  ],
  providers: [
    DirectorioIdentidadService,
    IdentidadEmpresaService,
    PermisosDinamicosService,
    JwtStrategy,
    AuthService,
    UsuariosService,
  ],
  controllers: [AdminPermisosController, AuthController, UsuariosController],
  exports: [
    PermisosDinamicosService,
    AuthService,
    UsuariosService,
    DirectorioIdentidadService,
    IdentidadEmpresaService,
  ],
})
export class IamModule {}
