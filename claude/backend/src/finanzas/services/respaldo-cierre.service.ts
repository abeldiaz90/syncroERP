import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { mkdir, readFile, stat, unlink } from 'fs/promises';
import { dirname, join, resolve } from 'path';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * ============================================================================
 * SyncroERP · El respaldo que el cierre toma por su cuenta
 * ----------------------------------------------------------------------------
 * POR QUE EXISTE
 *
 * El cierre mensual pedia una confirmacion humana: «Confirmo que existe un
 * respaldo reciente de la base de datos». Pero el sistema no tomaba ninguno ni
 * ofrecia como tomarlo. Un contador no sabe que es `pg_dump` ni tiene por que
 * saberlo, asi que la casilla solo podia marcarse de dos maneras: sabiendo algo
 * que la pantalla nunca enseño, o por costumbre.
 *
 * Una firma que nadie puede cumplir se acaba marcando igual. Es peor que no
 * pedirla: deja constancia escrita de una comprobacion que no ocurrio.
 *
 * Asi que el respaldo deja de ser un juramento y pasa a ser un hecho: lo toma
 * el sistema, dentro del cierre, y si no puede tomarlo el mes NO se cierra.
 *
 * ----------------------------------------------------------------------------
 * POR QUE `pg_dump` Y NO UN VOLCADO PROPIO
 *
 * La tentacion era escribir el volcado a mano —recorrer las tablas y generar
 * INSERTs— para no depender de un binario. Se descarto a proposito.
 *
 * Un respaldo solo vale si restaura. Un volcado hecho a mano tiene mil formas
 * de salir «bien» y no restaurar: un tipo que no round-tripea, un `bytea`, una
 * secuencia que no se reinicia, el orden de las llaves foraneas. Seria
 * exactamente el defecto que este sistema lleva semanas persiguiendo —algo que
 * parece correcto y no lo es— pero en el unico sitio donde no se puede fallar,
 * porque el respaldo se usa el dia que todo lo demas ya salio mal.
 *
 * `pg_dump` es el unico formato del que se puede afirmar que restaura. Si no
 * esta disponible, este servicio lo DICE y el cierre se detiene, en vez de
 * escribir un archivo del que nadie puede responder.
 *
 * ----------------------------------------------------------------------------
 * LOS TRES MODOS DE DESPLIEGUE
 *
 * Quien solo usa el ERP, quien lo usa con Fineract y quien lo instala en un
 * servidor ajeno no tienen el mismo Postgres a mano. Por eso el comando es
 * configurable y quien lo configura es el instalador, UNA vez, no el contador:
 *
 *   CIERRE_RESPALDO_COMANDO   opcional. Si esta, se ejecuta tal cual, con
 *                             {{archivo}} sustituido por la ruta destino.
 *                             Sirve para `docker exec`, para un script propio
 *                             o para un pg_dump que no esta en el PATH.
 *   CIERRE_RESPALDO_DIR       carpeta destino (por omision `respaldos/`).
 *   CIERRE_RESPALDO_TIMEOUT_S segundos antes de abandonar (por omision 300).
 *
 * Sin comando configurado se busca `pg_dump` en el PATH, que es lo que funciona
 * en una instalacion normal de Postgres.
 * ============================================================================
 */

export interface RespaldoGenerado {
  archivo: string;
  bytes: number;
  sha256: string;
  generadoEn: string;
  duracionMs: number;
  /** `pg_dump` del PATH, o el comando que el instalador configuro. */
  origen: 'pg_dump' | 'comando-configurado';
}

/**
 * La ultima linea que `pg_dump` escribe cuando termino bien. Es lo que
 * distingue un respaldo completo de uno cortado a la mitad: un volcado
 * interrumpido por disco lleno o por un timeout deja un archivo grande, con
 * pinta de correcto, y sin esta linea.
 */
const MARCA_FINAL = 'PostgreSQL database dump complete';

@Injectable()
export class RespaldoCierreService {
  private readonly logger = new Logger(RespaldoCierreService.name);

  /**
   * Toma el respaldo y lo VERIFICA. Lanza si no pudo tomarlo o si lo que
   * quedó en disco no es un volcado completo.
   */
  async generar(anio: number, mes: number): Promise<RespaldoGenerado> {
    const inicio = Date.now();
    const carpeta = resolve(
      process.env.CIERRE_RESPALDO_DIR?.trim() || 'respaldos',
    );
    const sello = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '');
    const archivo = join(
      carpeta,
      `cierre-${anio}-${String(mes).padStart(2, '0')}-${sello}.sql`,
    );
    await mkdir(dirname(archivo), { recursive: true });

    const comando = process.env.CIERRE_RESPALDO_COMANDO?.trim();
    const origen: RespaldoGenerado['origen'] = comando
      ? 'comando-configurado'
      : 'pg_dump';

    try {
      if (comando) {
        await this.ejecutar(comando.replace(/\{\{archivo\}\}/g, archivo));
      } else {
        await this.ejecutarPgDump(archivo);
      }
      const verificado = await this.verificar(archivo);
      const duracionMs = Date.now() - inicio;
      this.logger.log(
        `Respaldo del cierre ${mes}/${anio}: ${archivo} · ` +
          `${verificado.bytes} bytes · ${duracionMs} ms · ${origen}`,
      );
      return { archivo, ...verificado, generadoEn: new Date().toISOString(), duracionMs, origen };
    } catch (error) {
      /*
       * Un archivo a medias es peor que ninguno: alguien lo encuentra el dia
       * de la desgracia y cree que tiene respaldo. Se borra.
       */
      await unlink(archivo).catch(() => undefined);
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `No se pudo tomar el respaldo previo al cierre, así que el mes NO se cerró. ${detalle} ` +
          'Configura CIERRE_RESPALDO_COMANDO (con {{archivo}} como destino) o deja ' +
          'pg_dump accesible en el PATH del servidor. Ningún período debe cerrarse ' +
          'sin una copia de la que se pueda volver.',
      );
    }
  }

  /** `pg_dump` con la misma conexión que el ERP ya usa. */
  private async ejecutarPgDump(archivo: string): Promise<void> {
    const host = process.env.DB_HOST ?? '127.0.0.1';
    const puerto = process.env.DB_PORT ?? '5432';
    const usuario = process.env.DB_USER ?? 'postgres';
    const base = process.env.DB_NAME ?? 'syncroerp';
    await this.ejecutar(
      `pg_dump --host=${host} --port=${puerto} --username=${usuario} ` +
        `--dbname=${base} --no-password --file="${archivo}"`,
      { ...process.env, PGPASSWORD: process.env.DB_PASSWORD ?? '' },
    );
  }

  private ejecutar(
    comando: string,
    entorno: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    const segundos = Number(process.env.CIERRE_RESPALDO_TIMEOUT_S ?? 300);
    return new Promise((cumplir, fallar) => {
      const proceso = spawn(comando, {
        shell: true,
        env: entorno,
        windowsHide: true,
      });
      let salidaError = '';
      proceso.stderr?.on('data', (d) => {
        // Acotado: un error de pg_dump cabe de sobra, y un proceso que escupe
        // megas por stderr no debe llenar la memoria del servidor.
        if (salidaError.length < 4000) salidaError += String(d);
      });
      const reloj = setTimeout(() => {
        proceso.kill();
        fallar(
          new Error(
            `El respaldo no terminó en ${segundos} s y se abandonó. ` +
              'Sube CIERRE_RESPALDO_TIMEOUT_S si la base es grande.',
          ),
        );
      }, segundos * 1000);

      proceso.on('error', (e) => {
        clearTimeout(reloj);
        fallar(
          new Error(
            `No se pudo ejecutar el respaldo (${e.message}). ` +
              'Revisa que pg_dump esté instalado y accesible.',
          ),
        );
      });
      proceso.on('close', (codigo) => {
        clearTimeout(reloj);
        if (codigo === 0) return cumplir();
        fallar(
          new Error(
            `El respaldo terminó con código ${codigo}. ${salidaError.trim().slice(0, 500)}`,
          ),
        );
      });
    });
  }

  /**
   * Que el archivo exista no prueba nada. Se comprueba que tenga contenido,
   * que termine con la marca que `pg_dump` escribe al acabar, y se calcula su
   * huella para que la evidencia del cierre pueda señalar un archivo concreto
   * y no «un respaldo».
   */
  private async verificar(
    archivo: string,
  ): Promise<{ bytes: number; sha256: string }> {
    const info = await stat(archivo).catch(() => null);
    if (!info || info.size === 0) {
      throw new Error('El respaldo quedó vacío o no se escribió.');
    }
    const contenido = await readFile(archivo);
    const cola = contenido.subarray(Math.max(0, contenido.length - 4096)).toString('utf8');
    if (!cola.includes(MARCA_FINAL)) {
      throw new Error(
        'El archivo no termina como un volcado completo: se interrumpió a medias ' +
          '(disco lleno, conexión caída o proceso muerto).',
      );
    }
    return {
      bytes: info.size,
      sha256: createHash('sha256').update(contenido).digest('hex'),
    };
  }
}
