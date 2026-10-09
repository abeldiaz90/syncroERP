import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'net';

/**
 * ============================================================================
 * Mandar los bytes a la impresora
 * ----------------------------------------------------------------------------
 * CÓMO LLEGA EL TICKET AL PAPEL
 *
 * Una impresora térmica de mostrador se conecta de dos maneras:
 *
 *   · POR RED. Tiene su propia IP y escucha en el puerto 9100 —el puerto
 *     crudo de impresión, que hablan Epson, Star y casi todas—. El servidor
 *     abre un socket, escribe los bytes y cierra. **No hay nada que instalar
 *     en la caja.** Es el camino que se implementa aquí.
 *
 *   · POR USB. Cuelga de la computadora de la caja. El servidor no la alcanza:
 *     hace falta algo corriendo en esa máquina. Para esas, el punto de venta
 *     sigue teniendo la impresión por navegador de siempre, que no es tan
 *     bonita pero no depende de nadie.
 *
 * Qué tiene cada caja lo dice su configuración; ver `impresora-caja.entity.ts`.
 *
 * POR QUÉ UN SOCKET A PELO Y NO UNA LIBRERÍA
 *
 * Porque esto es todo lo que hay que hacer: conectar, escribir, cerrar. Las
 * librerías de impresión traen descubrimiento de dispositivos y dependencias
 * nativas que hay que compilar en el servidor del cliente, para hacer esto
 * mismo.
 *
 * LO QUE NUNCA PUEDE PASAR
 *
 * **Que un problema de impresión tumbe una venta.** La venta ya está cobrada y
 * guardada cuando esto corre; el papel es una consecuencia, no un requisito.
 * Por eso aquí nada lanza hacia arriba: se devuelve si salió o no y por qué, y
 * quien llama decide qué enseñar. Una impresora desconectada tiene que
 * aparecer como un aviso en la pantalla del cajero, no como una venta perdida.
 *
 * Y por eso hay plazo. Una impresora apagada no rechaza la conexión: la deja
 * colgada. Sin plazo, el cajero se queda mirando una rueda girando con el
 * cliente enfrente.
 * ============================================================================
 */

export interface ResultadoImpresion {
  impreso: boolean;
  /** Para el cajero, en su idioma. Vacío cuando salió bien. */
  motivo?: string;
  /** Para la bitácora: el detalle técnico. */
  detalle?: string;
  milisegundos: number;
}

export const PUERTO_CRUDO = 9100;
export const PLAZO_MS = 6_000;

@Injectable()
export class ImpresoraTermicaService {
  private readonly logger = new Logger(ImpresoraTermicaService.name);

  /**
   * Escribe los bytes en la impresora de red y espera a que los acepte.
   *
   * «Aceptados» es todo lo que se puede saber: ESC/POS no contesta. Que el
   * socket haya tragado los bytes no garantiza que hubiera papel. Eso se dice
   * tal cual en la pantalla en vez de prometer lo que no se puede comprobar.
   */
  async enviar(
    host: string,
    puerto: number,
    bytes: Buffer,
    plazoMs: number = PLAZO_MS,
  ): Promise<ResultadoImpresion> {
    const comenzo = Date.now();
    const transcurrido = () => Date.now() - comenzo;

    if (!host?.trim()) {
      return {
        impreso: false,
        motivo: 'Esta caja no tiene impresora configurada.',
        milisegundos: 0,
      };
    }

    return new Promise<ResultadoImpresion>((resolver) => {
      const socket = new Socket();
      let terminado = false;

      const acabar = (resultado: ResultadoImpresion) => {
        if (terminado) return;
        terminado = true;
        socket.destroy();
        resolver(resultado);
      };

      socket.setTimeout(plazoMs);

      socket.once('timeout', () =>
        acabar({
          impreso: false,
          motivo:
            `La impresora de la caja (${host}) no contestó. ` +
            'Revisa que esté encendida y conectada a la red.',
          detalle: `tiempo agotado tras ${plazoMs} ms`,
          milisegundos: transcurrido(),
        }),
      );

      socket.once('error', (e: NodeJS.ErrnoException) =>
        acabar({
          impreso: false,
          motivo: this.enCristiano(e, host),
          detalle: `${e.code ?? ''} ${e.message}`.trim(),
          milisegundos: transcurrido(),
        }),
      );

      socket.connect(puerto || PUERTO_CRUDO, host.trim(), () => {
        socket.write(bytes, (e) => {
          if (e) {
            acabar({
              impreso: false,
              motivo: `No se pudieron enviar los datos a la impresora (${host}).`,
              detalle: e.message,
              milisegundos: transcurrido(),
            });
            return;
          }
          /*
           * `end()` cierra escribiendo lo que quede en el búfer. El evento
           * `close` llega cuando el otro lado ya lo tiene.
           */
          socket.end();
        });
      });

      socket.once('close', (conError) => {
        if (conError) return; /* el handler de error ya habrá contestado */
        acabar({ impreso: true, milisegundos: transcurrido() });
      });
    });
  }

  /**
   * El error del sistema, dicho para quien está en el mostrador.
   *
   * `ECONNREFUSED` no le dice nada a un cajero. «La impresora está encendida
   * pero no acepta trabajos» sí, y además apunta a dónde mirar.
   */
  private enCristiano(e: NodeJS.ErrnoException, host: string): string {
    switch (e.code) {
      case 'ECONNREFUSED':
        return `La impresora (${host}) está en la red pero rechaza la conexión. Revisa que el puerto de impresión esté habilitado.`;
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return `No se alcanza la impresora (${host}) desde el servidor. Puede estar en otra red.`;
      case 'ETIMEDOUT':
        return `La impresora (${host}) no contestó a tiempo. Revisa que esté encendida.`;
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return `No se encontró el nombre «${host}». Si es un nombre de equipo, prueba con su dirección IP.`;
      default:
        return `No se pudo imprimir en ${host}: ${e.message}`;
    }
  }
}
