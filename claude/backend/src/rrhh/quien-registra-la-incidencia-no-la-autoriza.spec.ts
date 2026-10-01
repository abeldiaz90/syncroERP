/**
 * ============================================================================
 * Quien registra la incidencia no la autoriza
 * ----------------------------------------------------------------------------
 * Una incidencia mueve dinero de alguien: una falta de cinco días le quita
 * cinco días de sueldo, un tiempo extra se los suma. Hasta el 30-sep-2026:
 *
 *   · el único rol que podía aprobarlas era `rrhh`;
 *   · `rrhh` es también el único que las captura;
 *   · el sistema no guardaba quién las había capturado.
 *
 * O sea: la misma persona registraba el descuento, lo autorizaba, y no quedaba
 * rastro de nada. Es el par clásico —registrar y autorizar en las mismas
 * manos— y es el mismo que vacaciones ya tenía cerrado.
 *
 * Decisión de Abel del 30-sep-2026 (opción A): RRHH captura, Gerencia
 * autoriza, con la misma forma que vacaciones.
 * ============================================================================
 */
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

/* ── Mitad 1: la regla, ejercida ────────────────────────────────────────── */

type Fila = {
  id: string;
  empresaId: string;
  estadoAprobacion: string;
  registradaPorId?: string;
  aprobada?: boolean;
  aprobadaPorId?: string;
  fechaAprobacion?: Date;
  rechazadaPorId?: string;
  fechaRechazo?: Date;
  motivoRechazo?: string;
};

/**
 * El servicio real arrastra medio módulo de RRHH. Lo que se prueba aquí es el
 * método `aprobarIncidencia`, así que se le da el repositorio mínimo que usa y
 * se invoca el método real con `call`.
 */
import { RrhhService } from './services/rrhh.service';

function servicioCon(fila: Fila | null) {
  const guardadas: Fila[] = [];
  return {
    svc: {
      incidencias: {
        findOne: async () => fila,
        save: async (x: Fila) => {
          guardadas.push({ ...x });
          return x;
        },
      },
    } as unknown as RrhhService,
    guardadas,
  };
}

const aprobar = (svc: RrhhService, id: string, usuarioId: string, empresaId: string) =>
  (RrhhService.prototype.aprobarIncidencia as (
    this: RrhhService,
    id: string,
    usuarioId: string,
    empresaId: string,
  ) => Promise<unknown>).call(svc, id, usuarioId, empresaId);

const CAPTURO = 'usuario-rrhh-1';
const OTRO = 'usuario-gerencia-1';
const base: Fila = {
  id: 'inc-1',
  empresaId: 'emp-1',
  estadoAprobacion: 'PENDIENTE',
  registradaPorId: CAPTURO,
};

describe('aprobarIncidencia · cuatro ojos', () => {
  it('quien la registró no puede aprobarla', async () => {
    const { svc, guardadas } = servicioCon({ ...base });
    await expect(aprobar(svc, 'inc-1', CAPTURO, 'emp-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Y no se guardó nada: la negativa es antes de tocar la fila.
    expect(guardadas).toHaveLength(0);
  });

  it('el mensaje dice qué hacer, no sólo que no', async () => {
    const { svc } = servicioCon({ ...base });
    await expect(aprobar(svc, 'inc-1', CAPTURO, 'emp-1')).rejects.toThrow(
      /Gerencia u otra persona de Recursos humanos/,
    );
  });

  it('otra persona sí puede aprobarla', async () => {
    const { svc, guardadas } = servicioCon({ ...base });
    await aprobar(svc, 'inc-1', OTRO, 'emp-1');
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].estadoAprobacion).toBe('APROBADA');
    expect(guardadas[0].aprobadaPorId).toBe(OTRO);
  });

  it('una incidencia vieja sin registradaPorId no se bloquea', async () => {
    /*
     * La columna se agregó el 29-sep-2026. Sin ese dato no se puede afirmar
     * que sea la misma persona, y una regla que no puede comprobarse no debe
     * inventarse.
     */
    const { svc, guardadas } = servicioCon({ ...base, registradaPorId: undefined });
    await aprobar(svc, 'inc-1', CAPTURO, 'emp-1');
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].estadoAprobacion).toBe('APROBADA');
  });

  it('la regla no se salta las que ya estaban resueltas', async () => {
    const { svc } = servicioCon({ ...base, estadoAprobacion: 'APLICADA' });
    await expect(aprobar(svc, 'inc-1', OTRO, 'emp-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('aprobar dos veces sigue siendo idempotente para el aprobador', async () => {
    const { svc, guardadas } = servicioCon({ ...base, estadoAprobacion: 'APROBADA' });
    await aprobar(svc, 'inc-1', OTRO, 'emp-1');
    expect(guardadas).toHaveLength(0);
  });
});

/* ── Mitad 2: la población de firmantes ─────────────────────────────────── */

const plantilla = (rol: string) => PLANTILLAS_PERMISOS.find((p) => p.rol === rol);
const acciones = (rol: string) => plantilla(rol)?.accionesIrrenunciables ?? [];

describe('Hay quien pueda firmar una incidencia además de quien la captura', () => {
  it.each(['gerencia', 'direccion'])('%s puede aprobar, rechazar y revertir', (rol) => {
    expect(acciones(rol)).toContain('PATCH /rrhh/incidencias/:id/aprobar');
    expect(acciones(rol)).toContain('PATCH /rrhh/incidencias/:id/rechazar');
    expect(acciones(rol)).toContain('PATCH /rrhh/incidencias/:id/revertir');
  });

  it.each(['gerencia', 'direccion'])('%s ve el listado que va a firmar', (rol) => {
    // Por módulo de consulta: `rrhh` en modulosConsulta concede los GET.
    expect(plantilla(rol)?.modulosConsulta ?? []).toContain('rrhh');
  });

  it.each(['gerencia', 'direccion'])('%s NO captura incidencias', (rol) => {
    /*
     * Firmar no es tener el módulo. Si `gerencia` pudiera capturar, el control
     * quedaría igual que antes: registrar y autorizar en las mismas manos.
     */
    expect(plantilla(rol)?.modulos ?? []).not.toContain('rrhh');
    expect(acciones(rol)).not.toContain('POST /rrhh/incidencias');
  });

  it('el que captura sigue siendo rrhh', () => {
    expect(plantilla('rrhh')?.modulos ?? []).toContain('rrhh');
  });
});

/* ── Mitad 3: el servicio guarda quién capturó ──────────────────────────── */

describe('Sin registradaPorId la regla no tendría con qué comparar', () => {
  const fuente = readFileSync(join(__dirname, 'services', 'rrhh.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('crearIncidencia guarda quién la registró', () => {
    expect(fuente).toMatch(/registradaPorId: usuarioId/);
  });

  it('aprobarIncidencia compara contra ese dato y no contra otro', () => {
    expect(fuente).toMatch(/i\.registradaPorId && i\.registradaPorId === usuarioId/);
  });
});
