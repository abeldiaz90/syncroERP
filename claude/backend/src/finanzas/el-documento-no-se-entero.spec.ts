/**
 * ============================================================================
 * El documento no se enteró
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 28-sep-2026 contra la instalación
 *
 * El cobro de City Ledger de $1,200 estaba con `estadoContable: 'PENDIENTE'` y
 * `polizaId: null`. Su asiento —`a1a4f6be…`— estaba **GENERADO**, con su póliza
 * `d2b2a408…`. La contabilidad se hizo; el cobro no se enteró nunca.
 *
 * POR QUÉ
 *
 * Cada módulo escribe el resultado en su documento en el MISMO sitio donde
 * llama a `reintentarAhora`, justo después de confirmar la operación. Si ese
 * primer intento falla —y el de este cobro falló: la cuenta bancaria no tenía
 * cuenta contable enlazada— el asiento se queda en la cola y se genera después,
 * por el cron o por el botón de «Asientos pendientes». **Y ahí ya no hay nadie
 * que vuelva a tocar el documento.**
 *
 * LO QUE COSTABA
 *
 * `COBROS_CITY_LEDGER_SIN_CONTABILIZAR` es un hallazgo de severidad CRÍTICA del
 * diagnóstico de integridad, y con él la instalación entera salía **BLOQUEADO**
 * —medido: `estado: 'BLOQUEADO'`, `criticos: 1`—. Un control que no se puede
 * satisfacer se acaba ignorando, y el día que haya un cobro de verdad sin
 * contabilizar se verá igual que ayer.
 *
 * LA REGLA
 *
 * Quien pone el asiento en GENERADO avisa al documento. En un solo sitio, no
 * repartido por cada módulo —que es lo que dejó el hueco—. Y el botón manual
 * avisa **también cuando el asiento ya estaba generado**: ése es exactamente el
 * caso que hay que reparar, y sin eso el botón contestaba «ya estaba generado»
 * sin arreglar nada.
 * ============================================================================
 */

import { EstadoAsiento } from './entities/asiento-pendiente.entity';
import { AsientosPendientesService } from './services/asientos-pendientes.service';

describe('el documento no se enteró', () => {
  type Consulta = { sql: string; params: unknown[] };

  function servicio(asiento: Record<string, unknown> | null) {
    const consultas: Consulta[] = [];
    const guardados: Record<string, unknown>[] = [];
    const s = Object.create(AsientosPendientesService.prototype) as Record<string, unknown>;
    s.repo = {
      findOne: () => Promise.resolve(asiento),
      save: (x: Record<string, unknown>) => {
        guardados.push({ ...x });
        return Promise.resolve(x);
      },
      update: () => Promise.resolve({ affected: 1 }),
      manager: {
        query: (sql: string, params: unknown[]) => {
          consultas.push({ sql, params });
          return Promise.resolve([]);
        },
      },
    };
    s.logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
    return { s: s as unknown as AsientosPendientesService, consultas, guardados };
  }

  const generado = {
    id: 'a1',
    empresaId: 'e1',
    estado: EstadoAsiento.GENERADO,
    polizaId: 'pol-9',
    tipo: 'COBRANZA',
  };

  it('reintentar un asiento YA generado vuelve a avisar al documento', async () => {
    /*
     * Es el caso de la instalación: el asiento se generó por otra vía y el
     * documento se quedó atrás. Sin esto, el botón contesta «ya había sido
     * generado» y no arregla nada, que es lo más parecido a no tener botón.
     */
    const { s, consultas } = servicio({ ...generado });
    const r = (await s.reintentarAhora('a1', 'e1')) as unknown as {
      generado: boolean;
      polizaId?: string;
    };
    expect(r.generado).toBe(true);
    expect(r.polizaId).toBe('pol-9');
    expect(consultas.length).toBeGreaterThan(0);
  });

  it('avisa a los cinco documentos que guardan a qué asiento esperan', async () => {
    const { s, consultas } = servicio({ ...generado });
    await s.reintentarAhora('a1', 'e1');
    const tablas = consultas.map(
      (c) => c.sql.match(/UPDATE\s+(\w+)/)?.[1] ?? '?',
    );
    expect(tablas.sort()).toEqual(
      [
        'folios',
        'hoteleria_city_ledger_cobros',
        'importaciones_inventario',
        'pagos_cobranza',
        'pagos_proveedor',
      ].sort(),
    );
  });

  it('el aviso lleva la póliza, la empresa y el asiento, y sólo toca lo que no está al día', async () => {
    const { s, consultas } = servicio({ ...generado });
    await s.reintentarAhora('a1', 'e1');
    const uno = consultas[0];
    expect(uno.params).toEqual(['pol-9', 'e1', 'a1']);
    // El aislamiento entre empresas no se rompe ni para arreglar esto.
    expect(uno.sql).toMatch(/empresaid\s*=\s*\$2/);
    // Y no se reescribe un documento que ya estaba al día.
    expect(uno.sql).toMatch(/<>\s*'GENERADO'/);
    /*
     * `COALESCE` y no asignación directa: un asiento generado sin `polizaId`
     * —los hay, cuando el motor no produce póliza— no debe borrar la que el
     * documento ya tuviera.
     */
    expect(uno.sql).toMatch(/COALESCE/);
  });

  it('si el aviso falla, el asiento sigue generado: no se tira por esto', async () => {
    /*
     * Una tabla que esta instalación todavía no tiene es normal —las
     * migraciones crean el esquema por etapas— y no es un fallo de este
     * asiento. Su póliza existe: reventar aquí dejaría la cola peor de lo que
     * estaba. Se anota y se sigue.
     */
    const { s } = servicio({ ...generado });
    (s as unknown as { repo: { manager: { query: () => Promise<unknown> } } }).repo.manager.query =
      () => Promise.reject(new Error('relation "folios" does not exist'));
    const r = (await s.reintentarAhora('a1', 'e1')) as unknown as { generado: boolean };
    expect(r.generado).toBe(true);
  });

  it('un asiento descartado no avisa a nadie', async () => {
    const { s, consultas } = servicio({
      ...generado,
      estado: EstadoAsiento.DESCARTADO,
    });
    const r = (await s.reintentarAhora('a1', 'e1')) as unknown as { generado: boolean };
    expect(r.generado).toBe(false);
    expect(consultas).toHaveLength(0);
  });

  it('la migración que repara lo ya atascado no inventa nada', () => {
    /*
     * Copia un hecho que YA ES CIERTO —el asiento está en GENERADO y con qué
     * póliza—. Si algún día alguien la amplía para «arreglar» también los
     * asientos que no están generados, estaría escribiendo una contabilidad que
     * no existe.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '..',
        'database',
        'migrations',
        'postgres',
        '1790530000000-ElDocumentoNoSeEntero.ts',
      ),
      'utf8',
    ) as string;
    expect(fuente).toMatch(/a\.estado\s*=\s*'GENERADO'/);
    expect(fuente).toMatch(/to_regclass/);
    // Y no se deshace: volver a PENDIENTE sería reintroducir la mentira.
    expect(fuente).toMatch(/No se deshace/);
  });
});
