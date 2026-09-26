/**
 * ============================================================================
 * El respaldo del cierre se verifica, no se supone
 * ----------------------------------------------------------------------------
 * POR QUE EXISTEN ESTAS PRUEBAS
 *
 * La cuarta confirmación humana del cierre decía «Confirmo que existe un
 * respaldo reciente de la base de datos», y el sistema ni lo tomaba ni enseñaba
 * cómo tomarlo. Se sustituyó por un respaldo que toma el propio cierre.
 *
 * Pero cambiar una firma vacía por un archivo vacío no arregla nada. Lo que
 * hace útil a este servicio no es que escriba un archivo: es que se niegue a
 * dar por bueno uno que no sirve. Un volcado interrumpido —disco lleno,
 * conexión caída, timeout— deja en disco un archivo grande, con pinta correcta,
 * sin la última línea. Alguien lo encuentra el día de la desgracia y cree que
 * tiene respaldo.
 *
 * Así que estas pruebas miden lo único que importa: que un archivo incompleto
 * NO pase, y que cuando no pasa no quede en disco.
 * ============================================================================
 */

import { mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ServiceUnavailableException } from '@nestjs/common';

import { RespaldoCierreService } from './respaldo-cierre.service';

const COLA_BUENA = '--\n-- PostgreSQL database dump complete\n--\n';

describe('Respaldo del cierre · se verifica lo que quedó en disco', () => {
  let carpeta: string;
  const entornoOriginal = { ...process.env };

  beforeEach(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'respaldo-'));
    process.env.CIERRE_RESPALDO_DIR = carpeta;
    process.env.CIERRE_RESPALDO_TIMEOUT_S = '30';
  });

  afterEach(() => {
    process.env = { ...entornoOriginal };
  });

  /** Un comando que escribe lo que se le diga en el archivo destino. */
  function comandoQueEscribe(contenido: string) {
    const fuente = join(carpeta, 'fuente.txt');
    writeFileSync(fuente, contenido);
    process.env.CIERRE_RESPALDO_COMANDO = `cp "${fuente}" "{{archivo}}"`;
  }

  it('acepta un volcado completo y devuelve su tamaño y su huella', async () => {
    comandoQueEscribe(`CREATE TABLE x ();\n${COLA_BUENA}`);
    const servicio = new RespaldoCierreService();

    const r = await servicio.generar(2026, 8);

    expect(r.bytes).toBeGreaterThan(0);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.origen).toBe('comando-configurado');
    expect(r.archivo).toContain('cierre-2026-08-');
    expect(readdirSync(carpeta).filter((f) => f.endsWith('.sql'))).toHaveLength(1);
  });

  it('rechaza un volcado que se cortó a la mitad, aunque sea grande', async () => {
    // 200 KB de SQL perfectamente válido... y sin la última línea.
    comandoQueEscribe('INSERT INTO x VALUES (1);\n'.repeat(8000));
    const servicio = new RespaldoCierreService();

    await expect(servicio.generar(2026, 8)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no deja el archivo a medias en disco', async () => {
    comandoQueEscribe('INSERT INTO x VALUES (1);\n'.repeat(8000));
    const servicio = new RespaldoCierreService();

    await servicio.generar(2026, 8).catch(() => undefined);

    /*
     * Esto es la mitad seria de la prueba anterior. Negarse a dar por bueno un
     * respaldo roto y dejarlo ahí igualmente sería sustituir una mentira por
     * otra: el archivo queda, con su nombre y su fecha, y el siguiente que
     * mire la carpeta creerá que ese mes tiene copia.
     */
    expect(readdirSync(carpeta).filter((f) => f.endsWith('.sql'))).toHaveLength(0);
  });

  it('rechaza un volcado vacío', async () => {
    comandoQueEscribe('');
    const servicio = new RespaldoCierreService();
    await expect(servicio.generar(2026, 8)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cuando el comando falla, lo dice y no inventa un respaldo', async () => {
    process.env.CIERRE_RESPALDO_COMANDO = 'exit 3';
    const servicio = new RespaldoCierreService();

    await expect(servicio.generar(2026, 8)).rejects.toThrow(/NO se cerró/);
    expect(readdirSync(carpeta).filter((f) => f.endsWith('.sql'))).toHaveLength(0);
  });

  it('el mensaje de error dice qué configurar, no sólo que falló', async () => {
    process.env.CIERRE_RESPALDO_COMANDO = 'exit 1';
    const servicio = new RespaldoCierreService();

    /*
     * Quien recibe este error es un contador a las nueve de la noche del día
     * del cierre. «Error al generar respaldo» lo deja parado; el nombre de la
     * variable que su instalador tiene que poner, no.
     */
    await expect(servicio.generar(2026, 8)).rejects.toThrow(
      /CIERRE_RESPALDO_COMANDO/,
    );
  });
});
