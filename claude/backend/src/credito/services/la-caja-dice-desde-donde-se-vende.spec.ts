import { BadRequestException } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { CuentasBancariasService } from './cuentas-bancarias.service';

/**
 * ============================================================================
 * La caja dice desde dónde se vende
 * ----------------------------------------------------------------------------
 * DE DÓNDE VIENE ESTO
 *
 * La cabecera del punto de venta ofrecía dos desplegables —almacén y lista de
 * precios— y los elegía quien vendía. Eso permitía dos cosas que ningún ERP
 * debe permitirle al mostrador:
 *
 *  · cambiar la lista de precios rebaja cualquier venta SIN que quede
 *    registrado un solo descuento;
 *  · cambiar de almacén descuadra el inventario de una bodega ajena.
 *
 * Las dos salen «bien» en el ticket, y por eso ninguna se descubre auditando
 * ventas: hay que mirar quién podía tocar qué.
 *
 * El amarre va en la CAJA, no en el usuario ni en la empresa, porque el punto
 * de venta YA obliga a elegir caja en todo cobro de contado: elegir dónde entra
 * el dinero ya dice desde qué mostrador se vende.
 *
 * LO QUE VIGILA ESTA PRUEBA, y por qué cada cosa
 *
 *  1. Que el dato exista y sea NULABLE. Una caja sin configurar tiene que
 *     seguir vendiendo con el predeterminado: si esto se volviera obligatorio,
 *     toda instalación que no lo configure deja de poder cobrar.
 *  2. Que una cuenta de BANCO o un TPV NO guarden contexto de venta. No
 *     despachan mercancía de ninguna bodega, y una configuración que nada lee
 *     es la clase de dato que dentro de un año alguien interpreta como una
 *     decisión.
 *  3. Que el almacén y la lista sean DE ESTA EMPRESA. La llave foránea
 *     garantiza que la fila exista, no que sea de quien la nombra: sin esta
 *     comprobación una caja podía apuntar al almacén de otra empresa y el
 *     punto de venta descontaría existencias ajenas.
 *  4. Que el punto de venta OBEDEZCA a la caja, y que cambiar de caja con el
 *     carrito lleno no cambie precios por debajo de una venta ya armada —el
 *     mismo accidente, entrando por otra puerta—.
 * ============================================================================
 */

const EMPRESA = 'e1';

function servicio(opciones: {
  almacen?: unknown;
  lista?: unknown;
} = {}) {
  const guardadas: any[] = [];
  const repo: any = {
    guardadas,
    create: (v: any) => v,
    save: async (v: any) => {
      guardadas.push(v);
      return v;
    },
    findOne: async () => null,
    find: async () => [],
    createQueryBuilder: () => ({
      update: () => ({ set: () => ({ where: () => ({ execute: async () => ({}) }) }) }),
    }),
  };
  const s: any = Object.create(CuentasBancariasService.prototype);
  s.repo = repo;
  s.bancos = { findOne: async () => null };
  s.cuentasContables = {
    findOne: async () => ({
      id: 'cta-1',
      empresaId: EMPRESA,
      activo: true,
      esAfectable: true,
    }),
  };
  s.almacenes = {
    findOne: async () => ('almacen' in opciones ? opciones.almacen : { id: 'alm-1' }),
  };
  s.listasPrecio = {
    findOne: async () => ('lista' in opciones ? opciones.lista : { id: 'lp-1' }),
  };
  return { servicio: s as CuentasBancariasService, repo };
}

const CAJA = {
  nombre: 'Caja mostrador',
  tipo: 'CAJA' as any,
  cuentaContableId: 'cta-1',
  almacenId: 'alm-1',
  listaPrecioId: 'lp-1',
};

describe('Caja · el contexto de venta vive en la cuenta de caja', () => {
  it('una caja guarda su almacén y su lista', async () => {
    const { servicio: s, repo } = servicio();

    await s.crear({ ...CAJA } as any, EMPRESA);

    expect(repo.guardadas[0]).toMatchObject({
      almacenId: 'alm-1',
      listaPrecioId: 'lp-1',
    });
  });

  it('una caja SIN configurar se guarda en nulo, no se rechaza', async () => {
    /*
     * Lo que esto impide: que configurar el contexto se vuelva requisito para
     * dar de alta una caja. Sin esto, una instalación que no lo configure deja
     * de poder cobrar, que es peor que el defecto original.
     */
    const { servicio: s, repo } = servicio();

    await s.crear(
      { nombre: 'Caja 2', tipo: 'CAJA', cuentaContableId: 'cta-1' } as any,
      EMPRESA,
    );

    expect(repo.guardadas[0]).toMatchObject({
      almacenId: null,
      listaPrecioId: null,
    });
  });

  it('un TPV no guarda contexto de venta aunque se lo manden', async () => {
    /*
     * Se mide sobre un TPV y no sobre un BANCO a propósito: la cuenta de banco
     * se rechaza antes —le falta la institución— y entonces no se guarda NADA,
     * con lo que la prueba pasaría sin haber medido nada. Una prueba que
     * sobrevive a su mutante no vale. El TPV sí llega a guardarse, así que la
     * fila guardada es evidencia de verdad.
     */
    const { servicio: s, repo } = servicio();

    await s.crear(
      {
        nombre: 'TPV mostrador',
        tipo: 'TPV',
        cuentaContableId: 'cta-1',
        almacenId: 'alm-1',
        listaPrecioId: 'lp-1',
      } as any,
      EMPRESA,
    );

    expect(repo.guardadas).toHaveLength(1);
    expect(repo.guardadas[0]).toMatchObject({
      tipo: 'TPV',
      almacenId: null,
      listaPrecioId: null,
    });
  });

  it('un almacén de otra empresa se rechaza, y se dice cuál', async () => {
    const { servicio: s } = servicio({ almacen: null });

    await expect(s.crear({ ...CAJA } as any, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(s.crear({ ...CAJA } as any, EMPRESA)).rejects.toThrow(
      /almacén seleccionado no existe/i,
    );
  });

  it('una lista de precios de otra empresa se rechaza', async () => {
    const { servicio: s } = servicio({ lista: null });

    await expect(s.crear({ ...CAJA } as any, EMPRESA)).rejects.toThrow(
      /lista de precios seleccionada no existe/i,
    );
  });
});

describe('Caja · la migración añade el contexto sin obligar a nadie', () => {
  const MIGRACIONES = join(__dirname, '..', '..', 'database', 'migrations', 'postgres');

  const archivo = existsSync(MIGRACIONES)
    ? readdirSync(MIGRACIONES).find((n) => /LaCajaSabeDondeVende/.test(n))
    : undefined;

  it('la migración existe', () => {
    expect(archivo).toBeDefined();
  });

  it('las dos columnas nacen NULAS', () => {
    const sql = readFileSync(join(MIGRACIONES, archivo as string), 'utf8');

    expect(sql).toMatch(/almacenid uuid NULL/i);
    expect(sql).toMatch(/listaprecioid uuid NULL/i);
    // Un NOT NULL aquí dejaría sin cobrar a toda caja ya existente.
    expect(sql).not.toMatch(/almacenid uuid NOT NULL/i);
    expect(sql).not.toMatch(/listaprecioid uuid NOT NULL/i);
  });

  it('borrar un almacén no borra la caja', () => {
    /*
     * `SET NULL` y no `CASCADE`: un CASCADE aquí borraría cuentas de dinero al
     * dar de baja una bodega. La caja se queda sin configurar y vuelve al
     * predeterminado, que es el comportamiento seguro.
     */
    const sql = readFileSync(join(MIGRACIONES, archivo as string), 'utf8');

    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
    expect(
      (sql.match(/ON DELETE SET NULL/gi) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('se puede deshacer', () => {
    const sql = readFileSync(join(MIGRACIONES, archivo as string), 'utf8');

    expect(sql).toMatch(/DROP COLUMN IF EXISTS listaprecioid/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS almacenid/i);
  });
});

describe('Punto de venta · obedece a la caja elegida', () => {
  const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
    // src/credito/services → src/credito → src → backend → claude
    .map((nombre) => join(__dirname, '..', '..', '..', '..', nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

  const terminal = () =>
    readFileSync(join(FRONTEND as string, 'app/pos/terminal.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('encuentra la terminal', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('toma el almacén y la lista de la caja elegida', () => {
    const codigo = terminal();

    expect(codigo).toMatch(/cajaElegida\.almacenId/);
    expect(codigo).toMatch(/setAlmacenId\(cajaElegida\.almacenId\)/);
    expect(codigo).toMatch(/setListaPrecioId\(cajaElegida\.listaPrecioId\)/);
  });

  it('una caja sin configurar no borra el contexto vigente', () => {
    /*
     * El `if` con el valor delante es lo que hace que un nulo NO se aplique.
     * Sin él, elegir una caja sin configurar dejaría al mostrador sin almacén
     * y apagaría el botón de cobrar.
     */
    const codigo = terminal();

    expect(codigo).toMatch(/if\s*\(\s*cajaElegida\.almacenId\s*&&/);
    expect(codigo).toMatch(/if\s*\(\s*cajaElegida\.listaPrecioId\s*&&/);
  });

  it('cambiar de caja con el carrito lleno no cambia precios por debajo', () => {
    const codigo = terminal();

    expect(codigo).toMatch(/const cambiarCaja\s*=/);
    expect(codigo).toMatch(/carrito\.length > 0 && cambiaContexto/);
    // Y la guardia gobierna de verdad el desplegable.
    expect(codigo).toMatch(/onChange=\{e=>cambiarCaja\(e\.target\.value\)\}/);
  });
});
