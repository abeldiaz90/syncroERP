import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { RrhhService } from './services/rrhh.service';

/**
 * ============================================================================
 * Quién capturó las doce horas extra
 * ----------------------------------------------------------------------------
 * MEDIDO EL 30-SEP-2026, por pantalla, con la sesión de `rrhh`
 *
 * Se registraron **12 horas extra** para una empleada y se aprobaron **en dos
 * clics, con la misma sesión**. Nadie más intervino. Doce horas que se pagan
 * dobles las primeras nueve y triples el resto.
 *
 * Al mirar el código, el hueco no era sólo que faltara el control: es que
 * faltaba el DATO con el que cualquier control se construiría.
 *
 *     @Column({ ... }) aprobadaPorId?: string;   ← sí estaba
 *     (quién la registró)                        ← no existía
 *
 * `crearIncidencia(dto, empresaId)` ni siquiera recibía el usuario. El
 * controlador tenía el `@ActiveUser('id')` a mano —lo usa la ruta de aprobar,
 * tres líneas más abajo— y no se lo pasaba.
 *
 * Dos consecuencias, y la segunda es la grave:
 *
 *  1. No se puede impedir que la misma persona capture y apruebe.
 *  2. **No se puede auditar después.** Aprobada la incidencia, la fila no
 *     conservaba de dónde salió. «¿Quién capturó estas doce horas?» no tenía
 *     respuesta en ninguna parte del sistema. Un control que falla se nota; un
 *     rastro que nunca se escribió no se nota nunca.
 *
 * Es la familia de este proyecto vista desde otro ángulo: no una ausencia
 * interpretada como decisión, sino una ausencia que impide siquiera hacerse la
 * pregunta.
 *
 * QUÉ SE HIZO, Y QUÉ NO
 *
 * Se guarda quién capturó. **No** se decidió quién aprueba a quién: eso sale
 * del organigrama del cliente y hoy `rrhh` es el ÚNICO rol que puede aprobar
 * incidencias —gerencia y dirección tienen el módulo sólo en consulta—, así
 * que imponer «quien captura no aprueba» dejaría al cliente sin poder aprobar
 * ninguna si sólo tiene una persona en RRHH. Esa decisión queda anotada y es
 * de Abel.
 *
 * Lo que esta prueba fija es el requisito previo: que el rastro se escriba.
 * ============================================================================
 */

function servicioDePrueba() {
  const guardadas: any[] = [];
  const s: any = Object.create(RrhhService.prototype);

  s.incidencias = {
    guardadas,
    create: (v: any) => v,
    save: async (v: any) => {
      guardadas.push(v);
      return v;
    },
    createQueryBuilder: () => ({
      where: () => ({ andWhere: () => ({ getCount: async () => 0 }) }),
    }),
  };
  s.resolverEmpleado = async () => ({ id: 'emp-1', empresaId: 'e1' });

  return { servicio: s as RrhhService, guardadas };
}

const DTO = {
  empleadoId: '00001',
  tipo: 'HORAS_EXTRA',
  fechaInicio: '2026-09-29',
  fechaFin: '2026-09-29',
  horas: 12,
  motivo: 'Cierre de mes',
} as never;

describe('Incidencias · el sistema guarda quién capturó', () => {
  it('la incidencia nace con el usuario que la registró', async () => {
    const { servicio, guardadas } = servicioDePrueba();

    await servicio.crearIncidencia(DTO, 'e1', 'usuario-rrhh');

    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].registradaPorId).toBe('usuario-rrhh');
  });

  it('y nace SIN aprobar: capturar no es autorizar', async () => {
    const { servicio, guardadas } = servicioDePrueba();

    await servicio.crearIncidencia(DTO, 'e1', 'usuario-rrhh');

    expect(guardadas[0].aprobada).toBe(false);
    expect(guardadas[0].estadoAprobacion).toBe('CAPTURADA');
  });

  it('sin usuario queda en nulo, no se inventa uno', async () => {
    /*
     * Un proceso automático o una importación pueden no traer persona. Poner
     * ahí cualquier cosa —el primer administrador, una cadena vacía— sería
     * peor que el vacío: haría creer que alguien respondió por esa captura.
     */
    const { servicio, guardadas } = servicioDePrueba();

    await servicio.crearIncidencia(DTO, 'e1', undefined);

    expect(guardadas[0].registradaPorId).toBeNull();
  });
});

describe('Incidencias · el rastro llega desde la sesión, no se pierde en el camino', () => {
  const CONTROLADOR = join(
    __dirname,
    'controllers',
    'rrhh.controller.ts',
  );

  /** Quita comentarios: esta cabecera cita el código viejo. */
  const sinComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('el controlador le pasa el usuario de la sesión a `crearIncidencia`', () => {
    /*
     * Aquí vivía el defecto: el `@ActiveUser('id')` estaba disponible —la ruta
     * de aprobar, tres líneas más abajo, lo usaba— y esta no lo pedía.
     */
    const codigo = sinComentarios(readFileSync(CONTROLADOR, 'utf8'));
    const ruta = /@Post\('incidencias'\)[\s\S]{0,400}?\n  \}/.exec(codigo);

    expect(ruta).not.toBeNull();
    expect((ruta as RegExpExecArray)[0]).toMatch(/@ActiveUser\('id'\)/);
    expect((ruta as RegExpExecArray)[0]).toMatch(
      /crearIncidencia\([^)]*usuarioId/,
    );
  });
});

describe('Incidencias · la migración añade el rastro sin romper lo que existe', () => {
  const MIGRACIONES = join(
    __dirname,
    '..',
    'database',
    'migrations',
    'postgres',
  );
  const archivo = existsSync(MIGRACIONES)
    ? readdirSync(MIGRACIONES).find((n) => /QuienCapturoLaIncidencia/.test(n))
    : undefined;

  it('la migración existe', () => {
    expect(archivo).toBeDefined();
  });

  it('la columna nace NULA: las incidencias viejas no se inventan un autor', () => {
    const sql = readFileSync(join(MIGRACIONES, archivo as string), 'utf8');

    expect(sql).toMatch(/registradaporid uuid NULL/i);
    expect(sql).not.toMatch(/registradaporid uuid NOT NULL/i);
  });

  it('se puede deshacer', () => {
    const sql = readFileSync(join(MIGRACIONES, archivo as string), 'utf8');

    expect(sql).toMatch(/DROP COLUMN IF EXISTS registradaporid/i);
  });
});
