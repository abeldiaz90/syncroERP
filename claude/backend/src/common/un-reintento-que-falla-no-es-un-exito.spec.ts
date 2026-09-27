import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un reintento que falló no es un éxito
 * ----------------------------------------------------------------------------
 * `AsientosPendientesService.reintentarAhora` NO LANZA cuando el asiento no se
 * puede generar. Atrapa el error, lo deja escrito en la cola y devuelve:
 *
 *     { generado: boolean; mensaje: string; polizaId?: string }
 *
 * Es una firma deliberada —la operación de negocio ya está confirmada y no debe
 * caerse porque su póliza falle—, pero tiene una trampa: quien la llama dentro
 * de un `try { … } catch { avisar() }` está escribiendo un aviso que NUNCA va a
 * salir. El `catch` no se ejecuta jamás, y `generado: false` pasa de largo.
 *
 * Medido el 27-sep-2026 en City Ledger. Se cobró $1,200 por transferencia, la
 * póliza no se generó —la cuenta bancaria no tenía cuenta contable enlazada—,
 * el cobro quedó con `estadoContable: 'PENDIENTE'` y `polizaId: null`, y la
 * pantalla dijo:
 *
 *     «Cobro registrado y enviado a contabilidad»
 *
 * Enviado, sí. Contabilizado, no. Y nadie que no abra «Asientos pendientes» a
 * propósito se va a enterar. Es la misma familia que el silencio que decía
 * «generado» en la depreciación y en la baja de activos.
 *
 * LA REGLA: quien llama a `reintentarAhora` LEE lo que devuelve. Mirar
 * `generado` —o el `mensaje` que lo acompaña— en el mismo bloque, y hacer algo
 * con la respuesta negativa: propagarla como advertencia, escribirla en el
 * estado, o registrarla. Lo que no vale es seguir como si hubiera salido bien.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'migrations') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

/**
 * El controlador de «Asientos pendientes» devuelve el resultado tal cual a
 * quien pulsó «Reintentar»: ahí quien lee es la pantalla, y lo lee entero.
 */
const DEVUELVEN_EL_RESULTADO = new Set([
  'finanzas/controllers/asientos-pendientes.controller.ts',
]);

describe('Asientos pendientes · un reintento que falló no es un éxito', () => {
  const llamadas: Array<{ archivo: string; linea: number; ventana: string }> = [];

  for (const ruta of archivos(SRC)) {
    const texto = readFileSync(ruta, 'utf8');
    const relativa = ruta.slice(SRC.length + 1).replace(/\\/g, '/');
    if (DEVUELVEN_EL_RESULTADO.has(relativa)) continue;
    const lineas = texto.split('\n');
    lineas.forEach((linea, i) => {
      if (!/\breintentarAhora\s*\(/.test(linea)) return;
      /*
       * La ventana arranca unas líneas ANTES —ahí está el `const asiento =`—
       * y llega hasta bastante después, que es donde se decide qué hacer con
       * la respuesta.
       */
      llamadas.push({
        archivo: relativa,
        linea: i + 1,
        ventana: lineas.slice(Math.max(0, i - 3), i + 30).join('\n'),
      });
    });
  }

  it('hay llamadas que medir', () => {
    expect(llamadas.length).toBeGreaterThan(8);
  });

  it('toda llamada mira si el asiento se generó', () => {
    const sordas = llamadas
      .filter(({ ventana }) => !/\.generado\b|\bgenerado\s*[?:)]|\.mensaje\b/.test(ventana))
      .map(({ archivo, linea }) => `${archivo}:${linea}`);

    expect(sordas.sort()).toEqual([]);
  });

  it('si hay advertencias para el usuario, el asiento no generado produce una', () => {
    /*
     * Tres sitios escribían su aviso DENTRO de un `catch` que no se ejecuta
     * nunca —anulación de ventas, devoluciones de ventas y el cobro de City
     * Ledger—: la operación quedaba confirmada, la póliza pendiente, y la
     * pantalla decía que todo había salido bien.
     *
     * Donde hay una lista de advertencias que llega al usuario, la respuesta
     * `generado: false` tiene que producir una. Da igual cómo se escriba el
     * guardia —`!x.generado`, `=== false`, un ternario—: lo que se exige es
     * que exista, fuera del `catch`.
     */
    const mudas = llamadas
      .filter(({ ventana }) => /advertencias\s*\.\s*push\s*\(/.test(ventana))
      .filter(({ ventana }) => {
        const sinCatch = ventana.split(/catch\s*\(/)[0];
        /*
         * Un ternario `generado ? 'GENERADO' : 'PENDIENTE'` NO cuenta: eso
         * escribe el estado en la base, que es otra cosa. Aquí se pide un
         * guardia explícito sobre la respuesta negativa, que es el que decide
         * si el usuario se entera.
         */
        return !/!\s*\w+(?:\?)?\.generado\b|\.generado\s*===\s*false/.test(
          sinCatch,
        );
      })
      .map(({ archivo, linea }) => `${archivo}:${linea}`);

    expect(mudas.sort()).toEqual([]);
  });
});
