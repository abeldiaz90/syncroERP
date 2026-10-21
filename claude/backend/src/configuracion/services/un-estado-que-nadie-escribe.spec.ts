/**
 * ============================================================================
 * Un estado que nadie escribe no es un filtro estricto: es un control imposible
 * ----------------------------------------------------------------------------
 * El panel de operaciones pendientes es lo que un operador mira para saber qué
 * está esperando por él. Cada control cuenta filas de una tabla por su ESTADO.
 *
 * Si el estado que nombra no es uno de los que esa tabla escribe, no pasa nada
 * visible: la consulta es válida, la tabla existe, la columna existe, y el
 * resultado es cero en cualquier base del mundo. El control no falla, no se
 * registra en ningún log, no aparece en `noVerificados` —porque sí se pudo
 * ejecutar— y el panel informa con toda confianza que no hay nada pendiente.
 *
 * Medido el 25-sep-2026 contra la instalación:
 *
 *   · «Requisiciones pendientes de aprobación» buscaba PENDIENTE_APROBACION y
 *     EN_APROBACION. El estado real es PENDIENTE. Con requisiciones pendientes
 *     de verdad en la base, el panel decía cero.
 *   · «Órdenes pendientes de envío» buscaba BORRADOR y GENERADA, que tampoco
 *     existen en `EstadoOC`.
 *   · «Órdenes pendientes de recepción» buscaba PARCIALMENTE_RECIBIDA, que
 *     tampoco.
 *   · Dos estados fantasma más, inofensivos pero igual de falsos: «EN TRÁNSITO»
 *     con espacio y acento, y «RECONTEO».
 *
 * La causa de fondo es que el vocabulario de estados vivía sólo como `type` de
 * TypeScript, y un tipo desaparece al compilar: nada podía compararse contra
 * él. Ahora cada vocabulario existe también como valor —`ESTADOS_REQUISICION`,
 * `ESTADOS_OC`, `ESTADOS_COTIZACION`…— y cada definición del panel declara
 * cuál es el suyo. Esta prueba los confronta.
 * ============================================================================
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { DEFINICIONES_PENDIENTES } from './operaciones-pendientes.service';

describe('el panel de pendientes sólo cuenta estados que existen', () => {
  it('hay controles que revisar y todos declaran su vocabulario', () => {
    expect(DEFINICIONES_PENDIENTES.length).toBeGreaterThanOrEqual(10);
    const sinVocabulario = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.vocabulario?.length,
    ).map((d) => d.codigo);
    expect(sinVocabulario).toEqual([]);
  });

  it('ningún control busca un estado que su tabla no escribe', () => {
    const imposibles: string[] = [];
    for (const definicion of DEFINICIONES_PENDIENTES) {
      for (const estado of definicion.estados) {
        if (!definicion.vocabulario.includes(estado)) {
          imposibles.push(
            `${definicion.codigo} busca «${estado}» en ${definicion.tabla}, que sólo puede estar en: ${definicion.vocabulario.join(', ')}`,
          );
        }
      }
    }
    expect(imposibles.sort()).toEqual([]);
  });

  it('ningún control se queda sin estados que buscar', () => {
    // Una lista vacía cuenta cero igual que un estado inexistente, y encima
    // sin dejar rastro de que alguien la vació.
    const vacios = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.estados.length,
    ).map((d) => d.codigo);
    expect(vacios).toEqual([]);
  });

  it('cada control apunta a una pantalla, no a una tabla', () => {
    // Un pendiente sin ruta es un aviso sin salida: el operador ve el número y
    // no tiene dónde ir a resolverlo.
    const sinRuta = DEFINICIONES_PENDIENTES.filter(
      (d) => !d.ruta?.startsWith('/dashboard/'),
    ).map((d) => `${d.codigo} → ${d.ruta}`);
    expect(sinRuta).toEqual([]);
  });

  /*
   * ════════════════════════════════════════════════════════════════════════
   * El tablero cuenta también lo que el core y el ERP no se están diciendo
   * ------------------------------------------------------------------------
   * MEDIDO el 21-oct-2026 en la instalación local, con los dos contratados: el
   * tablero decía «4 pendientes» y debajo había una diferencia de saldo de
   * −$6,150 abierta desde el 3 de octubre, 32 avisos huérfanos del core sin
   * resolver, y una póliza cuyo asiento nunca salió. Cada una con su pantalla
   * y su bandeja; ninguna con quien llamara a nadie a mirarla.
   *
   * Un pendiente que no se cuenta en el tablero es un pendiente que no existe
   * para quien empieza el día ahí.
   * ════════════════════════════════════════════════════════════════════════
   */
  describe('los tres contadores del core', () => {
    const porCodigo = (codigo: string) =>
      DEFINICIONES_PENDIENTES.find((d) => d.codigo === codigo);

    it('los avisos del core se cuentan, y los fallidos también', () => {
      const def = porCodigo('CORE_AVISO');
      expect(def).toBeDefined();
      expect(def!.tabla).toBe('integracion_avisos');
      /*
       * FALLIDO va con PENDIENTE a propósito: «se intentó reflejar y falló» es
       * tan pendiente como «nadie lo ha mirado», y es el que más fácil se
       * queda enterrado porque ya pasó por una bandeja una vez.
       */
      expect([...def!.estados].sort()).toEqual(['FALLIDO', 'PENDIENTE']);
    });

    it('las diferencias con el core se cuentan por las NO resueltas', () => {
      const def = porCodigo('CORE_DISCREPANCIA');
      expect(def).toBeDefined();
      expect(def!.tabla).toBe('integracion_discrepancias');
      expect(def!.columnaEstado).toBe('resuelta');
      expect(def!.estados).toEqual(['false']);
    });

    it('los asientos detenidos se cuentan, que no se recogen solos', () => {
      /*
       * FALLIDO es a propósito un estado del que no se sale solo. Lo que
       * faltaba es que alguien supiera que están ahí: el 21-oct-2026 había
       * tres pólizas detenidas desde el 9, por un `ECONNREFUSED` de cuando el
       * core estaba caído, y lo único que las nombraba era un 409 al intentar
       * apagar el espejo contable.
       */
      const def = porCodigo('CORE_ASIENTO_DETENIDO');
      expect(def).toBeDefined();
      expect(def!.tabla).toBe('integracion_eventos');
      expect(def!.estados).toEqual(['FALLIDO']);
      expect(def!.modulo).toBe('CONTABILIDAD');
    });

    it('los tres son de ALTA, porque son dinero que no cuadra', () => {
      for (const codigo of [
        'CORE_AVISO',
        'CORE_DISCREPANCIA',
        'CORE_ASIENTO_DETENIDO',
      ]) {
        expect([codigo, porCodigo(codigo)!.prioridad]).toEqual([codigo, 'ALTA']);
      }
    });

    it('y mandan a una pantalla que existe', () => {
      /*
       * La primera versión mandaba a `/dashboard/integracion/conciliacion`,
       * que no existe: la pantalla se llama `conciliacion-cartera`. Un
       * pendiente que se cuenta bien y lleva a un 404 es un botón que lleva a
       * un no, al final de un aviso correcto.
       */
      const RAIZ = join(__dirname, '..', '..', '..');
      const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
        .map((n) => join(RAIZ, n))
        .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));
      if (!FRONTEND) return;

      for (const codigo of [
        'CORE_AVISO',
        'CORE_DISCREPANCIA',
        'CORE_ASIENTO_DETENIDO',
      ]) {
        const ruta = porCodigo(codigo)!.ruta.replace(/^\/dashboard\//, '');
        const archivo = join(FRONTEND, 'app/dashboard', ruta, 'page.tsx');
        expect([codigo, existsSync(archivo)]).toEqual([codigo, true]);
      }
    });
  });
});