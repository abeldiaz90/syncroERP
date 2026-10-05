import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { RequisicionesService } from '../compras/services/requisiciones.service';
import { EstructuraOrganizacionalService } from '../rrhh/services/estructura-organizacional.service';

/**
 * ============================================================================
 * DOS FIRMAS SON DOS PERSONAS
 * ----------------------------------------------------------------------------
 * EL CASO, EN DOS SITIOS Y CON LA MISMA FORMA
 *
 * El motor central de aprobaciones tiene la regla escrita con todas sus letras
 * —«Una misma persona no puede resolver más de un nivel del mismo ciclo de
 * aprobación»— y la aplica. Dos flujos que no pasan por él no la tenían:
 *
 *  1. **Requisiciones de compra.** `resolverAprobacion` comprobaba que la
 *     aprobación estuviera asignada a quien llama, el orden y que no estuviera
 *     resuelta. Nada más. Y la cadena de suplencia puede asignar la misma
 *     persona a dos niveles, porque `resolverFirmante` se llama nivel por nivel
 *     sin saber a quién asignó en los anteriores: matriz con Ana en el 1 y
 *     Carlos en el 2, Carlos se da de baja, el escalón del suplente busca
 *     «alguien con el rol de Carlos» y encuentra a Ana. Dos filas con Ana, y
 *     una requisición de cualquier importe con sus dos firmas puestas por una
 *     sola persona.
 *
 *     Y la otra mitad: **quien pide no firma**. La matriz nombra usuarios
 *     concretos, así que si quien captura la requisición es uno de sus
 *     aprobadores, autoriza su propia necesidad.
 *
 *  2. **Altas de estructura organizacional.** La segregación
 *     Gerencia-vs-Finanzas sí estaba; comparar contra el solicitante, no.
 *     `crear()` autoriza a `gerencia` a originar la solicitud, así que un
 *     usuario con ese rol podía dar de alta un puesto con el salario máximo
 *     que quisiera y aprobar su propia etapa.
 *
 * NO ES UNA POLÍTICA NUEVA
 *
 * Es la que el sistema ya declara en cuatro sitios —`resolverFirmante`,
 * `exigirFacultadDeResolver`, `validarResolutor`, `preparadaPorId`— y que
 * faltaba en estos dos. Por eso la prueba termina con un barrido: que ningún
 * flujo de firmas quede sin ella.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

/* ─────────────────────────── Requisiciones ─────────────────────────── */

function servicioRequisiciones(opciones: {
  solicitanteId: string;
  usuarioDeLaAprobacion: string;
  otrosNivelesDelMismo: number;
}) {
  const aprobacion = {
    id: 'ap2',
    orden: 2,
    estado: 'PENDIENTE',
    requisicionId: 'r1',
    usuarioId: opciones.usuarioDeLaAprobacion,
    requisicion: {
      id: 'r1',
      empresaId: 'e1',
      estado: 'PENDIENTE',
      usuarioSolicitanteId: opciones.solicitanteId,
    },
  };
  /* Dos consultas de conteo: los niveles anteriores sin aprobar (0) y los otros
     niveles ya resueltos por la misma persona. */
  let conteos = 0;
  const qb = {
    setLock: () => qb,
    leftJoinAndSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getOne: async () => aprobacion,
    getCount: async () => {
      conteos += 1;
      return conteos === 1 ? 0 : opciones.otrosNivelesDelMismo;
    },
  } as Record<string, unknown>;

  const servicio = Object.create(RequisicionesService.prototype) as RequisicionesService;
  Object.assign(servicio, {
    dataSource: {
      transaction: async (cb: (m: unknown) => Promise<unknown>) =>
        cb({
          getRepository: () => ({
            createQueryBuilder: () => qb,
            save: async (x: unknown) => x,
            update: async () => ({ affected: 1 }),
          }),
        }),
    },
    usuarioRepo: { findOne: async () => null },
  });
  return servicio;
}

describe('resolver un nivel de una requisición', () => {
  it('se niega si quien firma es quien la solicitó', async () => {
    const servicio = servicioRequisiciones({
      solicitanteId: 'ana',
      usuarioDeLaAprobacion: 'ana',
      otrosNivelesDelMismo: 0,
    });
    const error = await servicio
      .resolverAprobacion('ap2', 'APROBADO', '', 'e1', 'ana')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/tú mismo solicitaste/i);
  });

  it('se niega si esa persona ya firmó otro nivel de la misma requisición', async () => {
    const servicio = servicioRequisiciones({
      solicitanteId: 'luis',
      usuarioDeLaAprobacion: 'ana',
      otrosNivelesDelMismo: 1,
    });
    const error = await servicio
      .resolverAprobacion('ap2', 'APROBADO', '', 'e1', 'ana')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/más de un nivel/i);
  });

  it('y el mensaje dice cómo salir: que Compras reasigne', async () => {
    /* Un rechazo sin salida deja la requisición parada para siempre: la
       asignación la hizo la cadena de suplencia, no la persona. */
    const servicio = servicioRequisiciones({
      solicitanteId: 'luis',
      usuarioDeLaAprobacion: 'ana',
      otrosNivelesDelMismo: 1,
    });
    const error = await servicio
      .resolverAprobacion('ap2', 'APROBADO', '', 'e1', 'ana')
      .catch((e: Error) => e);
    expect(String((error as Error).message)).toMatch(/reasign/i);
  });

  it('pasa cuando es otra persona y no ha firmado otro nivel', async () => {
    /* La mitad que importa no romper: la aprobación legítima sigue pasando. */
    const servicio = servicioRequisiciones({
      solicitanteId: 'luis',
      usuarioDeLaAprobacion: 'ana',
      otrosNivelesDelMismo: 0,
    });
    const error = await servicio
      .resolverAprobacion('ap2', 'APROBADO', '', 'e1', 'ana')
      .then(() => null)
      .catch((e: Error) => e);
    /* Puede morir más adelante por colaboradores que este doble no monta, pero
       no por ninguno de los dos guardias. */
    if (error) {
      expect(String(error.message)).not.toMatch(/tú mismo|más de un nivel/i);
    }
  });
});

/* ──────────────────── Altas de estructura organizacional ──────────────────── */

describe('resolver una etapa de un alta de estructura', () => {
  function servicioEstructura(solicitadoPorId: string) {
    const servicio = Object.create(
      EstructuraOrganizacionalService.prototype,
    ) as EstructuraOrganizacionalService;
    Object.assign(servicio, {
      solicitudes: {
        findOne: async () => ({
          id: 's1',
          empresaId: 'e1',
          tipo: 'PUESTO',
          estado: 'PENDIENTE_GERENCIA',
          solicitadoPorId,
          aprobadoGerenciaPorId: null,
        }),
        save: async (x: unknown) => x,
      },
      dataSource: {
        getRepository: () => ({ findOne: async () => null }),
      },
    });
    return servicio;
  }

  const usuario = { id: 'ana', empresaId: 'e1', rol: 'gerencia' };

  it('se niega si quien firma es quien la registró', async () => {
    const servicio = servicioEstructura('ana');
    const error = await servicio
      .resolver('s1', 'GERENCIA', { decision: 'APROBAR' } as never, usuario as never)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(String((error as Error).message)).toMatch(/tú mismo registraste/i);
  });

  it('ni siquiera al administrador, y eso es deliberado', async () => {
    /*
     * La segregación Gerencia-vs-Finanzas de este mismo método SÍ exime al
     * administrador, y su comentario explica por qué: alguien tiene que poder
     * desatascar. Aquí no hace falta ninguna exención, porque el administrador
     * puede resolver cualquier solicitud que no sea la suya. Aprobar el rango
     * salarial de un puesto que uno mismo pidió es justo lo que el control
     * evita.
     */
    const servicio = servicioEstructura('ana');
    const error = await servicio
      .resolver(
        's1',
        'GERENCIA',
        { decision: 'APROBAR' } as never,
        { ...usuario, rol: 'administrador' } as never,
      )
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(String((error as Error).message)).toMatch(/tú mismo registraste/i);
  });

  it('y pasa cuando la registró otra persona', async () => {
    const servicio = servicioEstructura('luis');
    const error = await servicio
      .resolver('s1', 'GERENCIA', { decision: 'APROBAR' } as never, usuario as never)
      .then(() => null)
      .catch((e: Error) => e);
    if (error) {
      expect(String(error.message)).not.toMatch(/tú mismo registraste/i);
    }
  });
});

/* ───────────────────────────── El barrido ───────────────────────────── */

describe('Coherencia · ningún flujo de firmas se queda sin la regla', () => {
  /*
   * Lo que convierte dos parches en una política. Los cuatro flujos que
   * resuelven firmas tienen que comparar contra quien originó el documento. Si
   * mañana aparece un quinto que no lo haga, esta prueba no lo detecta sola
   * —no hay forma de reconocer «un flujo de firmas» por su texto sin inventar
   * una heurística frágil—, así que lo que vigila es que los cuatro conocidos
   * no la pierdan. Es menos de lo que me gustaría y es lo que se puede afirmar.
   */
  const FLUJOS: Array<{ archivo: string; marca: RegExp }> = [
    {
      archivo: 'compras/services/requisiciones.service.ts',
      marca: /usuarioSolicitanteId === usuarioActualId/,
    },
    {
      archivo: 'rrhh/services/estructura-organizacional.service.ts',
      marca: /solicitud\.solicitadoPorId === usuario\.id/,
    },
    {
      archivo: 'aprobaciones/services/aprobaciones-documentos.service.ts',
      marca: /no puede resolver más de un nivel/,
    },
    {
      archivo: 'rrhh/services/rrhh.service.ts',
      marca: /solicitadaPorId|solicitadoPorId/,
    },
  ];

  it('los cuatro flujos de firmas comparan contra quien originó el documento', () => {
    const sinRegla: string[] = [];
    for (const flujo of FLUJOS) {
      const fuente = readFileSync(join(SRC, flujo.archivo), 'utf8');
      if (!flujo.marca.test(fuente)) sinRegla.push(flujo.archivo);
    }
    expect(sinRegla).toEqual([]);
  });

  it('y requisiciones comprueba además que nadie firme dos niveles', () => {
    const fuente = readFileSync(
      join(SRC, 'compras/services/requisiciones.service.ts'),
      'utf8',
    );
    expect(fuente).toMatch(/otrosNivelesResueltos/);
    expect(fuente).toMatch(/más de un nivel del mismo ciclo/);
  });

  it('el motor central sigue siendo el dueño de la regla', () => {
    /*
     * Si alguien la borra de ahí «porque ya está en los servicios», la pierde
     * el único flujo que cubre crédito de clientes y convenios hoteleros, que
     * son los de más dinero.
     */
    const fuente = readFileSync(
      join(SRC, 'aprobaciones/services/aprobaciones-documentos.service.ts'),
      'utf8',
    );
    expect(fuente).toContain('nivelesPreviosDelMismoUsuario');
  });
});

describe('cuántas firmas lleva una nómina', () => {
  /*
   * ==========================================================================
   * No lo elige quien la prepara
   * --------------------------------------------------------------------------
   * `PrepararAprobacionDto` recibía `niveles` con `@Min(1)`, y sin matriz de
   * NOMINA configurada —el caso de fábrica— los niveles salían de
   * `CADENA_FIRMAS_NOMINA.slice(0, niveles)`.
   *
   * RRHH calculaba la nómina y mandaba `{ "niveles": 1 }`: una sola aprobación
   * de etapa GERENCIA, gerencia firmaba, y el periodo pasaba a APROBADO, apto
   * para dispersión. Finanzas y Tesorería —los dos dueños que responden del
   * gasto y del pago— nunca lo veían. Y la bitácora lo registraba como normal.
   * ==========================================================================
   */

  it('el DTO ya no recibe `niveles`', () => {
    /*
     * Se quitó del DTO en vez de ignorarse: con `forbidNonWhitelisted` activo,
     * un cliente que todavía lo mande recibe un 400 que lo nombra, en vez de un
     * 200 que le hace creer que se le obedeció. Un parámetro que se sigue
     * aceptando y no hace nada es el defecto con una pista falsa encima.
     */
    const fuente = readFileSync(
      join(SRC, 'rrhh/advanced/nomina-avanzada.dto.ts'),
      'utf8',
    );
    const clase = fuente.slice(
      fuente.indexOf('export class PrepararAprobacionDto'),
      fuente.indexOf('export class PrepararAprobacionDto') + 300,
    );
    expect(clase).not.toMatch(/\bniveles\b/);
  });

  it('y la cadena por omisión se usa completa', () => {
    const fuente = readFileSync(
      join(SRC, 'rrhh/advanced/nomina-avanzada.service.ts'),
      'utf8',
    );
    expect(fuente).not.toMatch(/CADENA_FIRMAS_NOMINA\.slice\(/);
    expect(fuente).toMatch(/CADENA_FIRMAS_NOMINA\.map\(/);
  });

  it('la cadena son tres dueños distintos, y eso es el dato de negocio', () => {
    const { CADENA_FIRMAS_NOMINA } = require('../rrhh/advanced/matriz-de-firmas') as {
      CADENA_FIRMAS_NOMINA: readonly string[];
    };
    expect([...CADENA_FIRMAS_NOMINA]).toEqual(['GERENCIA', 'FINANZAS', 'TESORERIA']);
    expect(new Set(CADENA_FIRMAS_NOMINA).size).toBe(3);
  });
});
