import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ContextoInquilinoService } from './contexto-inquilino.service';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { FineractHttpService } from '../adaptadores/fineract/fineract-http.service';

/**
 * ============================================================================
 * De quién es cada llamada al core
 * ----------------------------------------------------------------------------
 * En Fineract el inquilino es la frontera real: mayor, catálogo de cuentas,
 * clientes y créditos viven dentro de uno. Lo que se prueba aquí es la única
 * decisión que impide que la operación de una empresa acabe escrita en la base
 * de otra — y sobre todo, que **detenerse** sea el comportamiento cuando no se
 * sabe de quién es, porque un crédito con historia contable no se puede mover
 * después.
 * ============================================================================
 */

const config = (valores: Record<string, string>) =>
  ({ get: (c: string) => valores[c] }) as unknown as ConfigService;

const repoCon = (porEmpresa: Record<string, string | undefined>) =>
  ({
    findOne: async ({ where }: any) =>
      porEmpresa[where.empresaId] !== undefined
        ? { parametrosProveedor: { tenant: porEmpresa[where.empresaId] } }
        : null,
  }) as unknown as Repository<ConfiguracionIntegracionEmpresa>;

const armar = (opciones: {
  porEmpresa: boolean;
  inquilinos?: Record<string, string | undefined>;
}) => {
  const contexto = new ContextoInquilinoService(
    repoCon(opciones.inquilinos ?? {}),
    config({
      FINERACT_TENANT_POR_EMPRESA: opciones.porEmpresa ? 'true' : 'false',
    }),
  );
  const http = new FineractHttpService(
    { tenant: 'default' } as never,
    {} as never,
    contexto,
  );
  const resolver = (explicito?: string): Promise<string> =>
    (http as unknown as {
      inquilinoDeLaOperacion(e?: string): Promise<string>;
    }).inquilinoDeLaOperacion(explicito);
  return { contexto, resolver };
};

const falla = async (f: () => Promise<unknown>, texto: string) => {
  let mensaje = '(no lanzó)';
  try {
    await f();
  } catch (e: any) {
    mensaje = e?.message ?? String(e);
  }
  expect(mensaje).toContain(texto);
};

describe('el inquilino de cada llamada al core', () => {
  it('lo explícito manda: las tareas de mantenimiento ya saben a dónde van', async () => {
    const { resolver } = armar({ porEmpresa: true });
    expect(await resolver('inquilino-de-mantenimiento')).toBe(
      'inquilino-de-mantenimiento',
    );
  });

  it('usa el inquilino de la empresa del contexto', async () => {
    const { contexto, resolver } = armar({
      porEmpresa: true,
      inquilinos: { 'empresa-a': 'cliente_07' },
    });
    const r = await contexto.ejecutarCon('empresa-a', () => resolver());
    expect(r).toBe('cliente_07');
  });

  it('cada empresa va a la suya, dentro de la misma corrida', async () => {
    // El caso que da sentido a todo: dos empresas atendidas a la vez.
    const { contexto, resolver } = armar({
      porEmpresa: true,
      inquilinos: { 'empresa-a': 'cliente_07', 'empresa-b': 'cliente_08' },
    });
    const [a, b] = await Promise.all([
      contexto.ejecutarCon('empresa-a', () => resolver()),
      contexto.ejecutarCon('empresa-b', () => resolver()),
    ]);
    expect(a).toBe('cliente_07');
    expect(b).toBe('cliente_08');
  });

  it('una empresa sin inquilino NO opera contra el core', async () => {
    /*
     * Detenerse es recuperable: se le asigna un inquilino y sigue. Escribir en
     * el global significaría dejar sus créditos mezclados con los de otro
     * cliente, y eso no se deshace.
     */
    const { contexto, resolver } = armar({ porEmpresa: true, inquilinos: {} });
    await falla(
      () => contexto.ejecutarCon('empresa-sin-nada', () => resolver()),
      'no tiene inquilino asignado',
    );
  });

  it('una llamada que no declara empresa tampoco pasa', async () => {
    // Es un defecto de programación —falta abrir el contexto—, y tiene que
    // doler en desarrollo y no en la base de un cliente.
    const { resolver } = armar({ porEmpresa: true });
    await falla(() => resolver(), 'no declaró a qué empresa pertenece');
  });

  it('con el interruptor apagado se conserva el comportamiento de hoy', async () => {
    // Para que encender esto sea una decisión y no un efecto de actualizar.
    const { contexto, resolver } = armar({ porEmpresa: false, inquilinos: {} });
    expect(await resolver()).toBe('default');
    expect(await contexto.ejecutarCon('empresa-sin-nada', () => resolver())).toBe(
      'default',
    );
  });

  it('apagado, la empresa que sí tiene inquilino ya usa el suyo', async () => {
    // Apagado no significa ignorar lo asignado: significa no romper a quien no
    // lo tiene todavía.
    const { contexto, resolver } = armar({
      porEmpresa: false,
      inquilinos: { 'empresa-a': 'cliente_07' },
    });
    expect(await contexto.ejecutarCon('empresa-a', () => resolver())).toBe(
      'cliente_07',
    );
  });
});
