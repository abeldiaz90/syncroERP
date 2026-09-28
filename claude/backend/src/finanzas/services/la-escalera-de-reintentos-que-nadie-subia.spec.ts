import { AsientosPendientesService } from './asientos-pendientes.service';
import {
  EstadoAsiento,
  TipoAsiento,
} from '../entities/asiento-pendiente.entity';

/**
 * ============================================================================
 * La escalera de reintentos que nadie subía
 * ----------------------------------------------------------------------------
 * La cabecera de `asientos-pendientes.service.ts` promete una espera creciente:
 *
 *     1 min → 5 min → 15 min → 1 h → 4 h, y después se marca FALLIDO.
 *
 * Y la razón está escrita ahí mismo: «cinco intentos espaciados cubren las
 * fallas transitorias —la base ocupada, un bloqueo momentáneo— y dejan las de
 * configuración a la vista rápido».
 *
 * QUÉ PASABA DE VERDAD
 *
 * Ningún módulo espera al cron. Depreciación, conteo de inventario, baja de
 * activo, traspaso de tesorería: todos encolan dentro de su transacción y, en
 * cuanto confirma, llaman a `reintentarAhora` en línea. Es el camino correcto
 * —el usuario merece saber en el acto si su póliza se hizo—, pero
 * `reintentarAhora` marcaba **FALLIDO a la primera falla**, con
 * `proximoIntento = null`, sin mirar `intentos` ni `MAX_INTENTOS`.
 *
 * Y el cron sólo recoge `PENDIENTE`. Así que la escalera no se subía nunca: el
 * primer tropiezo —un bloqueo de un segundo, la base ocupada por otro cierre—
 * dejaba el asiento muerto en la cola, esperando a que una persona abriera
 * «Asientos pendientes» y pulsara el botón. Los cinco intentos espaciados
 * existían en el comentario y en el `catch` del cron, que en la práctica no
 * llegaba a ver la fila.
 *
 * El otro extremo de lo mismo: `encolarEnTransaccion` reencola una fila FALLIDA
 * poniéndola en PENDIENTE y limpiando el error, pero **conservando `intentos`**.
 * Un asiento que ya había agotado la escalera volvía a la cola con el contador
 * a tope: el primer intento del cron lo mandaba otra vez a FALLIDO. Reintentar
 * un periodo nuevo heredaba el desgaste del periodo viejo.
 *
 * Y el tercero: `intentar()`, cuando encuentra una fila previa, le escribía el
 * error nuevo y la dejaba en el estado en que estaba. Si estaba FALLIDA, seguía
 * FALLIDA y sin `proximoIntento`. El evento nuevo nacía ya descartado.
 *
 * LA REGLA: la escalera es una sola y la suben los tres caminos. Un intento
 * fallido avanza un peldaño y vuelve a PENDIENTE con su espera; sólo el último
 * peldaño marca FALLIDO. Y encolar un evento nuevo devuelve el contador a cero,
 * porque es un intento nuevo, no la continuación del anterior.
 * ============================================================================
 */

const ESPERAS_MINUTOS = [1, 5, 15, 60];
const MAX_INTENTOS = ESPERAS_MINUTOS.length + 1;

function repoDe(asiento: any) {
  return {
    findOne: jest.fn().mockResolvedValue(asiento),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest.fn(async (valor: any) => valor),
  } as any;
}

function servicioQueFalla(repo: any, mensaje = 'La cuenta contable no existe.') {
  return new AsientosPendientesService(repo, {
    generarAsientoDeDepreciacion: jest.fn().mockRejectedValue(new Error(mensaje)),
  } as any);
}

function asientoDe(extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pend-1',
    empresaId: 'emp-1',
    tipo: TipoAsiento.DEPRECIACION,
    estado: EstadoAsiento.PENDIENTE,
    payload: JSON.stringify({ ejercicio: 2026, mes: 9 }),
    intentos: 0,
    ultimoError: null,
    proximoIntento: new Date(),
    notaResolucion: null,
    ...extra,
  } as any;
}

describe('Asientos pendientes · la escalera de reintentos', () => {
  describe('reintentarAhora — el intento en línea de cada módulo', () => {
    it('la primera falla no mata el asiento: avanza un peldaño y sigue en la cola', async () => {
      const asiento = asientoDe();
      const repo = repoDe(asiento);
      const antes = Date.now();

      const resultado = await servicioQueFalla(repo).reintentarAhora(
        'pend-1',
        'emp-1',
      );

      expect(resultado.generado).toBe(false);
      expect(asiento.intentos).toBe(1);
      expect(asiento.estado).toBe(EstadoAsiento.PENDIENTE);
      expect(asiento.ultimoError).toContain('La cuenta contable no existe.');

      // El cron sólo recoge PENDIENTE con `proximoIntento` vencido: si no se
      // pone fecha, la fila no vuelve a mirarse jamás.
      expect(asiento.proximoIntento).toBeInstanceOf(Date);
      const espera = asiento.proximoIntento.getTime() - antes;
      expect(espera).toBeGreaterThan(ESPERAS_MINUTOS[0] * 60_000 - 5_000);
      expect(espera).toBeLessThan(ESPERAS_MINUTOS[0] * 60_000 + 60_000);
    });

    it('el peldaño que toca es el que corresponde al número de intentos', async () => {
      const asiento = asientoDe({ intentos: 2 });
      const repo = repoDe(asiento);
      const antes = Date.now();

      await servicioQueFalla(repo).reintentarAhora('pend-1', 'emp-1');

      expect(asiento.intentos).toBe(3);
      const espera = asiento.proximoIntento.getTime() - antes;
      expect(espera).toBeGreaterThan(ESPERAS_MINUTOS[2] * 60_000 - 5_000);
      expect(espera).toBeLessThan(ESPERAS_MINUTOS[2] * 60_000 + 60_000);
    });

    it('sólo el último peldaño marca FALLIDO, y ahí sí deja de reintentarse', async () => {
      const asiento = asientoDe({ intentos: MAX_INTENTOS - 1 });
      const repo = repoDe(asiento);

      const resultado = await servicioQueFalla(repo).reintentarAhora(
        'pend-1',
        'emp-1',
      );

      expect(asiento.intentos).toBe(MAX_INTENTOS);
      expect(asiento.estado).toBe(EstadoAsiento.FALLIDO);
      expect(asiento.proximoIntento).toBeNull();
      expect(resultado.generado).toBe(false);
      expect(resultado.mensaje).toContain('La cuenta contable no existe.');
    });

    it('quien reintenta a mano una fila ya FALLIDA no la revive con la escalera entera', async () => {
      /*
       * El botón de la bandeja reclama PENDIENTE o FALLIDO. Si el asiento ya
       * agotó los intentos y el reintento manual vuelve a fallar, tiene que
       * quedarse FALLIDO —no volver a PENDIENTE para que el cron lo muela otra
       * vez cinco veces sin que nadie haya arreglado la causa—.
       */
      const asiento = asientoDe({
        estado: EstadoAsiento.FALLIDO,
        intentos: MAX_INTENTOS + 2,
        proximoIntento: null,
      });
      const repo = repoDe(asiento);

      await servicioQueFalla(repo).reintentarAhora('pend-1', 'emp-1');

      expect(asiento.estado).toBe(EstadoAsiento.FALLIDO);
      expect(asiento.proximoIntento).toBeNull();
    });
  });

  describe('encolarEnTransaccion — un evento nuevo empieza de cero', () => {
    it('reencolar sobre una fila FALLIDA devuelve el contador a cero', async () => {
      const existente = asientoDe({
        estado: EstadoAsiento.FALLIDO,
        intentos: ESPERAS_MINUTOS.length,
        ultimoError: 'La categoría no tenía cuenta de gasto.',
        proximoIntento: null,
      });
      const repoManager: any = {
        findOne: jest.fn().mockResolvedValue(existente),
        save: jest.fn(async (valor: any) => valor),
        create: jest.fn((_e: any, v: any) => v),
      };
      const manager: any = { getRepository: () => repoManager };
      const servicio = new AsientosPendientesService({} as any, {} as any);

      await servicio.encolarEnTransaccion(
        manager,
        TipoAsiento.DEPRECIACION,
        { ejercicio: 2026, mes: 10 },
        'emp-1',
        'DEP-2026-10',
        'doc-1',
      );

      expect(existente.estado).toBe(EstadoAsiento.PENDIENTE);
      expect(existente.intentos).toBe(0);
      expect(existente.proximoIntento).toBeInstanceOf(Date);
    });

    it('el error que se limpia no se pierde: queda por escrito de dónde venía', async () => {
      const existente = asientoDe({
        estado: EstadoAsiento.FALLIDO,
        intentos: 5,
        ultimoError: 'La categoría no tenía cuenta de gasto.',
      });
      const repoManager: any = {
        findOne: jest.fn().mockResolvedValue(existente),
        save: jest.fn(async (valor: any) => valor),
        create: jest.fn((_e: any, v: any) => v),
      };
      const manager: any = { getRepository: () => repoManager };
      const servicio = new AsientosPendientesService({} as any, {} as any);

      await servicio.encolarEnTransaccion(
        manager,
        TipoAsiento.DEPRECIACION,
        { ejercicio: 2026, mes: 10 },
        'emp-1',
        'DEP-2026-10',
        'doc-1',
      );

      expect(existente.ultimoError).toBeNull();
      expect(existente.notaResolucion).toContain(
        'La categoría no tenía cuenta de gasto.',
      );
    });
  });

  describe('intentar — la fila previa vuelve a la cola, no se queda muerta', () => {
    it('una fila FALLIDA que recibe un error nuevo regresa a PENDIENTE con su espera', async () => {
      const existente = asientoDe({
        estado: EstadoAsiento.FALLIDO,
        intentos: 1,
        proximoIntento: null,
      });
      const repo = repoDe(existente);
      const servicio = servicioQueFalla(repo, 'Bloqueo momentáneo de la base.');

      const resultado = await servicio.intentar(
        TipoAsiento.DEPRECIACION,
        { ejercicio: 2026, mes: 9 },
        'emp-1',
        'DEP-2026-09',
        'doc-1',
      );

      expect(resultado.estado).toBe('PENDIENTE');
      expect(existente.estado).toBe(EstadoAsiento.PENDIENTE);
      expect(existente.intentos).toBe(2);
      expect(existente.proximoIntento).toBeInstanceOf(Date);
      expect(existente.ultimoError).toContain('Bloqueo momentáneo');
    });

    it('una fila que ya agotó la escalera se queda FALLIDA', async () => {
      const existente = asientoDe({
        estado: EstadoAsiento.FALLIDO,
        intentos: MAX_INTENTOS,
        proximoIntento: null,
      });
      const repo = repoDe(existente);

      await servicioQueFalla(repo).intentar(
        TipoAsiento.DEPRECIACION,
        { ejercicio: 2026, mes: 9 },
        'emp-1',
        'DEP-2026-09',
        'doc-1',
      );

      expect(existente.estado).toBe(EstadoAsiento.FALLIDO);
      expect(existente.proximoIntento).toBeNull();
    });
  });
});
