import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Entidades
import { Controlador } from './entities/controlador.entity';
import { Endpoint } from './entities/endpoint.entity';
import { RolEndpointPermiso } from './entities/rol-endpoint-permiso.entity';
import { Usuario } from './entities/usuario.entity';
import { Empresa } from './entities/empresa.entity';

// Servicios
import { PermisosDinamicosService } from './services/permisos-dinamicos.service';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsuariosService } from './services/usuarios.service'; // <-- AJUSTA LA RUTA SI ES NECESARIO

// Controladores
import { AdminPermisosController } from './controllers/admin-permisos.controller';
import { AuthController } from './controllers/auth.controller';
import { UsuariosController } from './controllers/usuarios.controller'; // <-- AJUSTA LA RUTA SI ES NECESARIO

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Controlador, 
      Endpoint, 
      RolEndpointPermiso, 
      Usuario, 
      Empresa
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'tu_secreto_temporal',
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [
    PermisosDinamicosService, 
    JwtStrategy, 
    AuthService,
    UsuariosService // <-- AÑADIDO EL SERVICIO AQUÍ
  ],
  controllers: [
    AdminPermisosController, 
    AuthController,
    UsuariosController // <-- AÑADIDO EL CONTROLADOR AQUÍ (ESTO QUITA EL 404)
  ],
  exports: [PermisosDinamicosService, AuthService, UsuariosService], // Exportamos por si otro módulo lo necesita
})
export class IamModule {}