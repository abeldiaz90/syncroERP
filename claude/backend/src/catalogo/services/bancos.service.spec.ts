import { ConflictException } from '@nestjs/common';
import { BANCOS_ANEXO_24_2026 } from '../../finanzas/data/catalogos-sat-2026';
import { Banco } from '../entities/banco.entity';
import { BancosService } from './bancos.service';

describe('BancosService - catálogo inicial', () => {
  let datos: Banco[];
  let secuencia: number;
  let repo: any;
  let service: BancosService;

  beforeEach(() => {
    datos = [];
    secuencia = 0;
    repo = {
      find: jest.fn(async (opciones?: any) => {
        let salida = [...datos];
        if (opciones?.where?.activo === true) {
          salida = salida.filter((b) => b.activo);
        }
        return salida;
      }),
      findOne: jest.fn(async ({ where }: any) =>
        datos.find(
          (b) =>
            (where.id !== undefined && b.id === where.id) ||
            (where.clave !== undefined && b.clave === where.clave),
        ),
      ),
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn(async (entrada: Banco | Banco[]) => {
        const lista = Array.isArray(entrada) ? entrada : [entrada];
        for (const banco of lista) {
          if (!banco.id) banco.id = `banco-${++secuencia}`;
          const indice = datos.findIndex((b) => b.id === banco.id);
          if (indice >= 0) datos[indice] = banco;
          else datos.push(banco);
        }
        return entrada;
      }),
    };
    service = new BancosService(repo);
  });

  it('carga los 94 bancos y una segunda ejecución no duplica', async () => {
    const primera = await service.precargarOficiales();
    const segunda = await service.precargarOficiales();
    expect(primera.creados).toBe(BANCOS_ANEXO_24_2026.length);
    expect(segunda.creados).toBe(0);
    expect(datos).toHaveLength(BANCOS_ANEXO_24_2026.length);
    expect(new Set(datos.map((b) => b.clave)).size).toBe(datos.length);
  });

  it('restaura nombre y estado oficial sin tocar bancos personalizados', async () => {
    await service.precargarOficiales();
    datos[0].nombre = 'ALTERADO';
    datos[0].activo = false;
    const personalizado = await service.create({
      nombre: 'Banco interno',
      clave: '998',
    });
    await service.precargarOficiales();
    expect(datos[0].nombre).toBe(BANCOS_ANEXO_24_2026[0].nombre);
    expect(datos[0].activo).toBe(true);
    expect(datos.find((b) => b.id === personalizado.id)?.nombre).toBe(
      'Banco interno',
    );
  });

  it('protege registros oficiales contra edición y desactivación', async () => {
    await service.precargarOficiales();
    await expect(
      service.update(datos[0].id, { nombre: 'Otro' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.toggle(datos[0].id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rechaza una clave institucional duplicada', async () => {
    await service.create({ nombre: 'Banco interno', clave: '998' });
    await expect(
      service.create({ nombre: 'Banco repetido', clave: '998' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
