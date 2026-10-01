/**
 * ============================================================================
 * Un «no» que mandaba a una puerta que no está en la pared
 * ----------------------------------------------------------------------------
 * El punto de venta enseñaba un campo de descuento por renglón
 * (`frontend/app/pos/terminal.tsx`), dejaba teclearlo y recalculaba el carrito
 * en pantalla. Al cobrar, el servidor lo rechazaba con:
 *
 *     «supera el máximo de 0% para tu perfil. Requiere autorización de un
 *      supervisor.»
 *
 * Tres cosas mal, comprobadas leyendo el código el 30-sep-2026:
 *
 *  1. NO EXISTE el rol `supervisor`. La tabla de topes estaba escrita contra
 *     CAJERO, VENDEDOR, GERENTE y SUPERVISOR, nombres de otro esquema.
 *  2. NO HABÍA FORMA de dar esa autorización: `descuentoAutorizadoPorId` era el
 *     escape que la saltaría y no tenía un solo productor en todo `src/`.
 *  3. El mostrador vende con `empleado`, cuyo tope es 0.
 *
 * El arreglo tiene tres piezas y esta prueba cubre las tres: el tope es dato
 * (`constants/tope-descuento.ts`), la caja lo consulta antes de dibujar el
 * campo (`GET /ventas/tope-descuento`), y el servidor sigue siendo el cerrojo.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';
import { normalizarRol } from '../iam/utils/roles.util';
import {
  TOPES_DESCUENTO_POR_DEFECTO,
  TOPES_DESCUENTO_MOSTRADOR,
  topeDescuentoDeRol,
} from './constants/tope-descuento';

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const fuente = readFileSync(
  join(__dirname, 'services', 'precios.service.ts'),
  'utf8',
);
const codigo = sinComentarios(fuente);

const conVariable = <T>(valor: string | undefined, f: () => T): T => {
  const antes = process.env.VENTAS_TOPES_DESCUENTO;
  if (valor === undefined) delete process.env.VENTAS_TOPES_DESCUENTO;
  else process.env.VENTAS_TOPES_DESCUENTO = valor;
  try {
    return f();
  } finally {
    if (antes === undefined) delete process.env.VENTAS_TOPES_DESCUENTO;
    else process.env.VENTAS_TOPES_DESCUENTO = antes;
  }
};

describe('El tope de descuento es una política, no una constante escondida', () => {
  it('quien no aparece en la política no descuenta: cero, no herencia', () => {
    conVariable(undefined, () => {
      expect(topeDescuentoDeRol('empleado')).toBe(0);
      expect(topeDescuentoDeRol('almacenista')).toBe(0);
      expect(topeDescuentoDeRol('hoteleria')).toBe(0);
      expect(topeDescuentoDeRol('un_rol_que_nadie_configuro')).toBe(0);
    });
  });

  it('sin rol —o con rol vacío— tampoco hay descuento', () => {
    conVariable(undefined, () => {
      expect(topeDescuentoDeRol(undefined)).toBe(0);
      expect(topeDescuentoDeRol(null)).toBe(0);
      expect(topeDescuentoDeRol('   ')).toBe(0);
    });
  });

  it('los mismos roles que autorizan una devolución son los que rebajan', () => {
    conVariable(undefined, () => {
      expect(topeDescuentoDeRol('direccion')).toBe(20);
      expect(topeDescuentoDeRol('gerencia')).toBe(10);
    });
  });

  it('el rol llega como llegue: acentos, mayúsculas y guiones dan igual', () => {
    conVariable(undefined, () => {
      expect(topeDescuentoDeRol('DIRECCIÓN')).toBe(20);
      expect(topeDescuentoDeRol(' Gerencia ')).toBe(10);
      expect(topeDescuentoDeRol('super-admin')).toBe(100);
    });
  });

  it('el administrador no depende de la tabla ni de la variable', () => {
    conVariable('GERENCIA:15', () => {
      expect(topeDescuentoDeRol('admin')).toBe(100);
      expect(topeDescuentoDeRol('administrador')).toBe(100);
      expect(topeDescuentoDeRol('SUPER_ADMIN')).toBe(100);
      // y la variable sí manda sobre los demás
      expect(topeDescuentoDeRol('gerencia')).toBe(15);
    });
  });

  it('la variable SUSTITUYE la tabla entera, no la completa', () => {
    conVariable('EMPLEADO:5', () => {
      expect(topeDescuentoDeRol('empleado')).toBe(5);
      // `direccion` estaba en la tabla por defecto y ya no rige
      expect(topeDescuentoDeRol('direccion')).toBe(0);
    });
  });

  it('un par mal escrito se ignora sin llevarse los demás', () => {
    conVariable('EMPLEADO:5,basura,GERENCIA:,:9,DIRECCION:12', () => {
      expect(topeDescuentoDeRol('empleado')).toBe(5);
      expect(topeDescuentoDeRol('direccion')).toBe(12);
      expect(topeDescuentoDeRol('gerencia')).toBe(0);
      /*
       * Y el par roto no entra como NaN. Un tope NaN no es cero: `x > NaN` es
       * falso, así que el cerrojo del servidor dejaría pasar CUALQUIER
       * descuento de ese rol. Un renglón mal tecleado en el `.env` no puede
       * ser la forma de abrir la caja.
       */
      expect(topeDescuentoDeRol('basura')).toBe(0);
      expect(TOPES_DESCUENTO_MOSTRADOR().has('BASURA')).toBe(false);
    });
  });

  it('un porcentaje fuera de rango se acota; no abre ni invierte nada', () => {
    conVariable('EMPLEADO:500,GERENCIA:-30', () => {
      expect(topeDescuentoDeRol('empleado')).toBe(100);
      expect(topeDescuentoDeRol('gerencia')).toBe(0);
    });
  });

  it('una variable vacía deja a todos en cero: lo restrictivo, no lo abierto', () => {
    conVariable('', () => {
      expect(topeDescuentoDeRol('direccion')).toBe(0);
      expect(topeDescuentoDeRol('gerencia')).toBe(0);
      expect(topeDescuentoDeRol('empleado')).toBe(0);
    });
  });

  it('se relee en cada llamada: cambiar la variable basta', () => {
    conVariable('EMPLEADO:5', () => {
      expect(TOPES_DESCUENTO_MOSTRADOR().get('EMPLEADO')).toBe(5);
    });
    conVariable('EMPLEADO:7', () => {
      expect(TOPES_DESCUENTO_MOSTRADOR().get('EMPLEADO')).toBe(7);
    });
  });

  it('la tabla por defecto sólo contiene roles de mando', () => {
    for (const [rol, tope] of Object.entries(TOPES_DESCUENTO_POR_DEFECTO)) {
      expect(tope).toBeGreaterThan(0);
      expect(['DIRECCION', 'GERENCIA', 'GERENTE', 'SUPERVISOR']).toContain(
        normalizarRol(rol),
      );
    }
  });
});

describe('El mensaje del tope de descuento dice la verdad', () => {
  it('ya no remite a un «supervisor», que no es un rol de este ERP', () => {
    expect(codigo).not.toMatch(/autorización de un supervisor/i);
  });

  it('no existe ningún rol llamado supervisor en las plantillas', () => {
    const reales = PLANTILLAS_PERMISOS.map((p) => normalizarRol(p.rol));
    expect(reales).not.toContain('SUPERVISOR');
    expect(reales).not.toContain('CAJERO');
    expect(reales).not.toContain('VENDEDOR');
    expect(reales).not.toContain('GERENTE');
  });

  it('remite al camino que sí existe: las listas de precio', () => {
    expect(codigo).toMatch(/listas de precio/);
    expect(codigo).toMatch(/No existe una /);
  });

  it('distingue «no tienes descuento» de «tu tope es menor»', () => {
    expect(codigo).toMatch(/topeRol <= 0/);
    expect(codigo).toMatch(/Tu perfil no tiene descuento autorizado\./);
    expect(codigo).toMatch(/Tu perfil llega hasta \$\{topeRol\}%\./);
  });
});

describe('El escape que sólo servía para que la regla pareciera negociable', () => {
  it('`descuentoAutorizadoPorId` ya no existe en el código', () => {
    expect(codigo).not.toMatch(/descuentoAutorizadoPorId/);
    const venta = sinComentarios(
      readFileSync(
        join(__dirname, '..', 'ventas', 'services', 'ventas.service.ts'),
        'utf8',
      ),
    );
    expect(venta).not.toMatch(/descuentoAutorizadoPorId/);
  });

  it('el cerrojo del servidor no tiene condición de escape', () => {
    expect(codigo).toMatch(/if \(porcentajeDescuento > topeRol\) \{/);
  });

  it('el servicio de precios ya no lleva su propia tabla de topes', () => {
    expect(codigo).not.toMatch(/const TOPE_DESCUENTO/);
    expect(codigo).toMatch(
      /topeDescuentoDeRol\(opciones\.rolUsuario\)/,
    );
  });
});

describe('El rol con el que se vende es el que importa', () => {
  it('`empleado` es quien tiene el módulo de ventas completo', () => {
    const conVentas = PLANTILLAS_PERMISOS.filter((p) =>
      (p.modulos ?? []).includes('ventas'),
    ).map((p) => p.rol);
    expect(conVentas).toContain('empleado');
  });
});
