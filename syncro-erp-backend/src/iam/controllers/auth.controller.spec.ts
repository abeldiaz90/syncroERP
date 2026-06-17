import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  // 1. Creamos un Mock del servicio para aislar el controlador de la base de datos real
  const mockAuthService = {
    registrarEmpresa: jest.fn((dto) => {
      return {
        mensaje: 'Empresa y usuario administrador creados correctamente',
        empresaId: 'uuid-simulado-123',
      };
    }),
    login: jest.fn((dto) => {
      return {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5c...',
        usuario: {
          id: '1',
          nombre: 'Abel Diaz',
          rol: 'admin',
          empresaId: 'uuid-simulado-123'
        }
      };
    }),
  };

  beforeEach(async () => {
    // 2. Configuramos el módulo de pruebas de NestJS
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService, // Inyectamos el mock en lugar del servicio real
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});