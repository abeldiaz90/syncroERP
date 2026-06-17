import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Empresa } from '../entities/empresa.entity';
import { Usuario } from '../entities/usuario.entity';
import { DataSource } from 'typeorm';

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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    // Si esto pasa, significa que todas las dependencias se inyectaron correctamente
    expect(service).toBeDefined();
  });
});