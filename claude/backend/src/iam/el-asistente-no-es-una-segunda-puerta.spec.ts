import { BadRequestException } from '@nestjs/common';
import { AuthService } from './services/auth.service';

/**
 * ============================================================================
 * EL ASISTENTE DE PUESTA EN MARCHA NO ES UNA SEGUNDA PUERTA A LA IDENTIDAD FISCAL
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `POST /auth/onboarding/paso/:numero` llevaba `@SkipPermisos()` y **ningún**
 * `@Roles`. `@SkipPermisos()` saca al endpoint de la tabla de permisos: ni se
 * da de alta en ella, ni un administrador puede quitarlo desde la pantalla. Con
 * eso, la única condición para llamarlo era tener sesión, de cualquier rol.
 *
 * Y el paso 1 reescribe el **RFC de la empresa**, que es el emisor de todos los
 * CFDI. Un almacenista con su sesión normal podía dejar a la empresa timbrando
 * con un RFC ajeno; el paso 2 cambia el domicilio fiscal y el 4 el plan. Nada
 * de eso quedaba en la bitácora: `auth` no está en las rutas auditables.
 *
 * Había además un segundo defecto, independiente del permiso: el único tope era
 * «no te adelantes» (`numPaso > onboardingPaso + 1`). No impedía **volver**. Con
 * `onboardingPaso = 4`, los pasos 1 a 4 seguían abiertos para siempre.
 *
 * LO QUE VIGILA ESTA PRUEBA
 *
 * Que terminado el asistente, los pasos que tocan identidad fiscal y plan se
 * nieguen y **digan dónde se cambian de verdad** —la pantalla que valida el RFC
 * contra el tipo de persona y pide la confirmación del contador—, y que el paso
 * del almacén siga pasando, porque es idempotente y no toca nada fiscal.
 *
 * El `@Roles` se vigila aparte, en `common/coherencia.spec.ts`, con la regla
 * general: ninguna escritura con `@SkipPermisos()` sin `@Roles`. Una prueba por
 * endpoint habría tapado éste y no el siguiente.
 * ============================================================================
 */

type Empresa = {
  id: string;
  rfc?: string;
  regimenFiscal?: string;
  giro?: string;
  tamano?: string;
  plan?: string;
  onboardingPaso?: number;
  onboardingCompletado?: boolean;
  onboardingActualizadoEn?: Date | null;
};

function servicioCon(empresa: Empresa) {
  const guardados: Empresa[] = [];
  const almacenes: Array<Record<string, unknown>> = [];
  const servicio = Object.create(AuthService.prototype) as AuthService;
  Object.assign(servicio, {
    empresaRepository: {
      findOne: async () => empresa,
      save: async (e: Empresa) => {
        guardados.push({ ...e });
        return e;
      },
    },
    dataSource: {
      getRepository: () => ({
        findOne: async () => null,
        create: (x: Record<string, unknown>) => x,
        save: async (x: Record<string, unknown>) => {
          almacenes.push(x);
          return x;
        },
      }),
    },
  });
  return { servicio, guardados, almacenes };
}

const DATOS_FISCALES = {
  rfc: 'XAXX010101000',
  regimenFiscal: '601',
  giro: 'comercio',
  tamano: 'micro',
};

describe('el asistente de configuración inicial, una vez terminado', () => {
  it('se niega a reescribir el RFC, y dice dónde se cambia', async () => {
    const empresa: Empresa = {
      id: 'e1',
      rfc: 'SUM010101AAA',
      onboardingPaso: 4,
      onboardingCompletado: true,
    };
    const { servicio, guardados } = servicioCon(empresa);

    await expect(
      servicio.guardarPasoOnboarding('e1', 1, DATOS_FISCALES as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    /* Y el dato no se tocó: negar sin escribir, no escribir y luego quejarse. */
    expect(empresa.rfc).toBe('SUM010101AAA');
    expect(guardados).toEqual([]);
  });

  it('el mensaje nombra la pantalla que sí valida, no sólo niega', async () => {
    /*
     * Un «no puedes» a secas deja a quien de verdad necesita corregir el RFC
     * sin saber por dónde. Y por dónde importa: esa pantalla valida el RFC
     * contra el tipo de persona y pide confirmación de que lo revisó el
     * contador, que es exactamente lo que este camino no hacía.
     */
    const { servicio } = servicioCon({
      id: 'e1',
      onboardingPaso: 4,
      onboardingCompletado: true,
    });
    const error = await servicio
      .guardarPasoOnboarding('e1', 1, DATOS_FISCALES as never)
      .catch((e: Error) => e);
    expect(String((error as Error).message)).toMatch(/Datos\s+fiscales/i);
    expect(String((error as Error).message)).toMatch(/contador/i);
  });

  it('tampoco el domicilio ni el plan', async () => {
    const { servicio } = servicioCon({
      id: 'e1',
      onboardingPaso: 4,
      onboardingCompletado: true,
    });
    for (const [paso, datos] of [
      [2, { direccion: 'x', ciudad: 'y', estado: 'z', codigoPostal: '01000', pais: 'MX' }],
      [4, { plan: 'enterprise' }],
    ] as const) {
      await expect(
        servicio.guardarPasoOnboarding('e1', paso, datos as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('pero el primer almacén sigue pasando: es idempotente y no toca nada fiscal', async () => {
    /*
     * La excepción es deliberada y acotada. Si se cerrara también, una empresa
     * que terminó el asistente no podría dar de alta su primer almacén por esta
     * vía, y no hay ningún riesgo en permitirlo: el paso comprueba por nombre y
     * no duplica.
     */
    const { servicio, almacenes } = servicioCon({
      id: 'e1',
      onboardingPaso: 4,
      onboardingCompletado: true,
    });
    const r = await servicio.guardarPasoOnboarding('e1', 3, {
      nombre: 'Almacén central',
    } as never);
    expect(r.ok).toBe(true);
    expect(almacenes).toHaveLength(1);
  });
});

describe('el asistente mientras todavía se está dando de alta', () => {
  it('el paso 1 escribe los datos fiscales', async () => {
    /*
     * La mitad que importa no romper: el cierre de arriba no puede impedir la
     * puesta en marcha, que es para lo que existe el asistente.
     */
    const empresa: Empresa = { id: 'e1', onboardingPaso: 0, onboardingCompletado: false };
    const { servicio, guardados } = servicioCon(empresa);
    const r = await servicio.guardarPasoOnboarding('e1', 1, DATOS_FISCALES as never);
    expect(r.ok).toBe(true);
    expect(empresa.rfc).toBe('XAXX010101000');
    expect(guardados).toHaveLength(1);
  });

  it('y sigue sin dejar adelantarse', async () => {
    const { servicio } = servicioCon({
      id: 'e1',
      onboardingPaso: 1,
      onboardingCompletado: false,
    });
    await expect(
      servicio.guardarPasoOnboarding('e1', 4, { plan: 'enterprise' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
