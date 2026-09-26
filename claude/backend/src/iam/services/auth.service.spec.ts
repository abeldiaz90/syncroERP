import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Empresa } from '../entities/empresa.entity';
import { Usuario } from '../entities/usuario.entity';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { PermisosDinamicosService } from './permisos-dinamicos.service';
import { MailService } from '../../common/services/mail.service';
import { ConfigService } from '@nestjs/config';

describe('AuthService', () => {
  let service: AuthService;

  // 1. Simulamos un repositorio genérico
  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  // 2. Simulamos el QueryRunner (para la transacción)
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  // 3. Simulamos el DataSource que devuelve el QueryRunner
  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        /*
         * `AuthService` recibe la configuracion desde el 25-sep-2026 para poder
         * mirar `AUTH_MODE`: sin ella no sabia si la identidad vive en el
         * directorio, y por eso sus puertas locales de contraseña seguian
         * abiertas en modo Keycloak. Aqui se simula en el modo por omision.
         */
        {
          provide: ConfigService,
          useValue: { get: (_clave: string, porOmision?: unknown) => porOmision },
        },
        // Inyectamos el mock del repositorio de Empresa
        {
          provide: getRepositoryToken(Empresa),
          useValue: mockRepository,
        },
        // Inyectamos el mock del repositorio de Usuario
        {
          provide: getRepositoryToken(Usuario),
          useValue: mockRepository,
        },
        // Inyectamos el mock del DataSource
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: PermisosDinamicosService,
          useValue: {
            obtenerPermisosPorRolParaFrontend: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
        {
          provide: MailService,
          useValue: { enviarCorreo: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    // Si esto pasa, significa que todas las dependencias se inyectaron correctamente
    expect(service).toBeDefined();
  });
});
