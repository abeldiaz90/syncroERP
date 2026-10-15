/**
 * ============================================================================
 * Cuando la base del core la pone el cliente
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * Hay instituciones —una SOFOM, una caja popular— cuyo reglamento de datos no
 * admite que su cartera viva en la base de su proveedor. Fineract sabe
 * atenderlas de nacimiento: cada inquilino lleva SU conexión. Lo que faltaba
 * era el camino para declararlo, comprobarlo y encenderlo.
 *
 * El ERP NO entra en esto y esta prueba también lo fija: sigue siendo
 * multiempresa dentro de la suite de SUMA, una sola base, inquilinos separados
 * por `empresaId`. Lo único que se mueve es el inquilino del CORE.
 *
 * Lo que se vigila aquí es lo que duele si se rompe:
 *
 *  1. La clave del cliente no sale por ninguna respuesta. Ni cifrada.
 *  2. Un identificador de inquilino con mayúsculas o espacios no pasa: el core
 *     compara en crudo y serían DOS inquilinos de los que sólo uno existe.
 *  3. Una empresa que ya opera no cambia de servidor por una pantalla de alta.
 *     Eso es una migración, con su ventana y su respaldo.
 *  4. Un alta con la base del cliente NO consume inquilino de la reserva, y
 *     nace con la integración APAGADA: ese inquilino todavía no existe para el
 *     core, y una empresa en sombra le estaría mandando hechos a una base que
 *     no está.
 *  5. No se activa un inquilino cuyo esquema todavía no está construido.
 * ============================================================================
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { OrigenCoreService } from './services/origen-core.service';
import {
  EstadoOrigenCore,
  OrigenCore,
  OrigenCoreEmpresa,
} from './entities/origen-core.entity';

type Fila = Partial<OrigenCoreEmpresa> & { empresaId: string };

function armar(filaInicial?: Fila, llaveConfigurada = true) {
  const filas: Fila[] = filaInicial ? [filaInicial] : [];

  const origenes = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if ('empresaId' in where) {
        return filas.find((f) => f.empresaId === where.empresaId) ?? null;
      }
      if ('inquilino' in where) {
        return filas.find((f) => f.inquilino === where.inquilino) ?? null;
      }
      return null;
    }),
    create: jest.fn((datos: Fila) => ({ ...datos })),
    save: jest.fn(async (fila: Fila) => {
      const i = filas.findIndex((f) => f.empresaId === fila.empresaId);
      if (i >= 0) filas[i] = fila;
      else filas.push(fila);
      return fila;
    }),
  };

  const empresas = {
    findOne: jest.fn(async () => ({ id: 'e1', nombreComercial: 'Caja Norte' })),
  };
  const configuraciones = { findOne: jest.fn(async () => null), save: jest.fn() };
  const secretos = {
    configurado: llaveConfigurada,
    motivoNoConfigurado: llaveConfigurada ? null : 'Falta SECRETOS_LLAVE.',
    cifrar: jest.fn((claro: string) => (llaveConfigurada ? `v1:iv:tag:${claro}` : null)),
    descifrar: jest.fn((sobre: string | null) => (sobre ? sobre.split(':')[3] : null)),
  };
  const registro = { tenants: jest.fn(async () => []), registrarInquilino: jest.fn() };
  const auditoria = { registrar: jest.fn() };

  const servicio = new OrigenCoreService(
    origenes as never,
    empresas as never,
    configuraciones as never,
    secretos as never,
    registro as never,
    auditoria as never,
  );

  return { servicio, filas, origenes, registro, secretos };
}

const CONEXION = {
  inquilino: 'caja-norte',
  servidor: 'db.cliente.local',
  puerto: 5432,
  baseDatos: 'fineract_caja_norte',
  usuario: 'fineract',
  clave: 'una-clave-que-no-debe-salir',
};

describe('la base del core la pone el cliente', () => {
  describe('la clave no sale', () => {
    it('consultar no devuelve el secreto, ni cifrado', async () => {
      const { servicio } = armar();
      await servicio.capturar('e1', CONEXION, 'abel');
      const visto = await servicio.consultar('e1');

      const comoTexto = JSON.stringify(visto);
      expect(comoTexto).not.toContain(CONEXION.clave);
      expect(comoTexto).not.toContain('v1:iv:tag');
      expect(Object.keys(visto)).not.toContain('secretoCifrado');
      /* Lo único que se puede saber es que hay una guardada. */
      expect(visto).toMatchObject({ tieneClave: true });
    });

    it('una empresa sin declarar contesta lo que de verdad pasa', async () => {
      const { servicio } = armar();
      /*
       * Sin fila NO es un error: es una empresa de la nube de SUMA, que son
       * todas las de hoy. Contestar 404 aquí obligaría a cada pantalla a
       * tratar «la normalidad» como una excepción.
       */
      await expect(servicio.consultar('sin-declarar')).resolves.toMatchObject({
        origen: OrigenCore.SUMA,
        declarado: false,
        estado: null,
      });
    });
  });

  describe('el identificador del inquilino', () => {
    it('se guarda en minúsculas', async () => {
      const { servicio, filas } = armar();
      await servicio.capturar('e1', { ...CONEXION, inquilino: 'Caja-Norte' }, 'abel');
      expect(filas[0].inquilino).toBe('caja-norte');
    });

    it('rechaza espacios, porque el core compara en crudo', async () => {
      const { servicio } = armar();
      await expect(
        servicio.capturar('e1', { ...CONEXION, inquilino: 'Caja Norte' }, 'abel'),
      ).rejects.toThrow(/sólo admite/i);
    });

    it('no se le da a dos empresas el mismo inquilino', async () => {
      const { servicio } = armar({
        empresaId: 'otra',
        inquilino: 'caja-norte',
        origen: OrigenCore.CLIENTE,
        estado: EstadoOrigenCore.CAPTURADO,
      });
      await expect(servicio.capturar('e1', CONEXION, 'abel')).rejects.toThrow(
        /ya está declarado para otra empresa/i,
      );
    });
  });

  describe('lo que no se hace por una pantalla', () => {
    it('una empresa que ya opera no cambia de servidor aquí', async () => {
      const { servicio } = armar({
        empresaId: 'e1',
        origen: OrigenCore.CLIENTE,
        estado: EstadoOrigenCore.ACTIVO,
      });
      await expect(servicio.capturar('e1', CONEXION, 'abel')).rejects.toThrow(/migración/i);
    });

    it('sin llave de secretos no se guarda a medias', async () => {
      const { servicio } = armar(undefined, false);
      /*
       * Una clave en claro en una columna es una clave que sale en cada
       * respaldo y en cada copia a un ambiente de pruebas.
       */
      await expect(servicio.capturar('e1', CONEXION, 'abel')).rejects.toThrow(/SECRETOS_LLAVE/);
    });

    it('no se anota en el core un inquilino que nadie ha probado', async () => {
      const { servicio, registro } = armar();
      await servicio.capturar('e1', CONEXION, 'abel');
      await expect(servicio.registrarEnElCore('e1', 'abel')).rejects.toThrow(/verificar/i);
      expect(registro.registrarInquilino).not.toHaveBeenCalled();
    });

    it('una empresa de la nube de SUMA no tiene conexión que verificar', async () => {
      const { servicio } = armar({
        empresaId: 'e1',
        origen: OrigenCore.SUMA,
        estado: EstadoOrigenCore.ACTIVO,
      });
      await expect(servicio.verificar('e1')).rejects.toThrow(/aprovisiona SUMA/i);
    });
  });
});

/**
 * ----------------------------------------------------------------------------
 * Lo que no se puede montar sin una base enfrente, fijado sobre la fuente
 * ----------------------------------------------------------------------------
 * Activar contra una base real y comprobar que el esquema está construido
 * necesita una base real. Lo que sí se puede fijar —y es donde estaría el
 * error— es que la comprobación exista, que la negativa sea explícita, y que
 * el alta no gaste reserva cuando la base la pone el cliente.
 */
describe('lo que queda escrito en la fuente', () => {
  const RAIZ = join(__dirname, '..', '..');
  const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

  it('el servicio existe donde se dice', () => {
    expect(existsSync(join(RAIZ, 'src/integracion/services/origen-core.service.ts'))).toBe(true);
  });

  it('activar comprueba que el esquema esté construido y se niega si no', () => {
    const fuente = leer('src/integracion/services/origen-core.service.ts');
    expect(fuente).toMatch(/to_regclass\('public\.m_office'\)/);
    expect(fuente).toMatch(/if \(!construido\)/);
    expect(fuente).toMatch(/Falta el reinicio programado de Fineract/);
  });

  it('el alta con la base del cliente no toca la reserva', () => {
    const alta = leer('src/integracion/services/alta-empresas.service.ts');
    expect(alta).toMatch(/const laPoneElCliente = datos\.origenCore === 'CLIENTE' && datos\.usaFineract;/);
    expect(alta).toMatch(/if \(datos\.usaFineract && !laPoneElCliente\) \{/);
  });

  it('y nace APAGADA, porque ese inquilino todavía no existe', () => {
    const alta = leer('src/integracion/services/alta-empresas.service.ts');
    expect(alta).toMatch(/datos\.usaFineract && !laPoneElCliente\s*\?\s*ModoCartera\.SOMBRA/);
    expect(alta).toMatch(/datos\.usaFineract && !laPoneElCliente\s*\?\s*ModoContabilidad\.ESPEJO/);
  });

  it('la fila de conexión del core se COPIA de una que ya funciona', () => {
    /*
     * `tenant_server_connections` lleva columnas que cambian entre versiones
     * del core. Una fila escrita a mano con la mitad produce un inquilino que
     * arranca y se porta raro bajo carga, y eso se descubre con gente dentro.
     */
    const registro = leer('src/integracion/services/registro-del-core.service.ts');
    expect(registro).toMatch(/FROM tenant_server_connections/);
    expect(registro).toMatch(/const columnas = Object\.keys\(molde\)/);
    expect(registro).toMatch(/readonly_schema_server:/);
  });

  it('LA PRUEBA DE LA PRUEBA: las rutas del origen van por la puerta de servicio', () => {
    /*
     * Si alguna de las cuatro se quedara sin `exigirServicio`, cualquiera con
     * la URL podría leer o mover de sitio la base de un cliente. Son cuatro
     * rutas y tienen que ser cuatro comprobaciones.
     */
    const controlador = leer('src/integracion/controllers/alta-empresas.controller.ts');
    /*
     * El corte NO puede ser por la primera aparición de «origen-core»: eso es
     * la línea del `import`, y el trozo acabaría siendo el archivo entero.
     * Se corta por la cabecera del bloque, que es lo que delimita las rutas.
     */
    const inicio = controlador.indexOf('De dónde salen los datos bancarios de esta empresa');
    expect(inicio).toBeGreaterThan(0);
    const bloque = controlador.slice(inicio);
    const rutas = bloque.match(/@(Get|Post)\(':empresaId\/origen-core/g) ?? [];
    const puertas = bloque.match(/this\.exigirServicio\(clave\)/g) ?? [];
    /* Una de consulta y cuatro de los cuatro pasos. */
    expect(rutas.length).toBe(5);
    expect(puertas.length).toBe(5);
  });
});
