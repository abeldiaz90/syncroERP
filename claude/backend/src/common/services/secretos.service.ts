import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * ============================================================================
 * Secretos en reposo
 * ----------------------------------------------------------------------------
 * Hasta ahora los secretos del sistema vivían en `.env.local`: uno por
 * despliegue, protegidos por los permisos del archivo. Eso funciona mientras
 * haya un secreto de cada cosa.
 *
 * Con un realm por empresa deja de funcionar. Cada empresa cliente tiene su
 * emisor, sus clientes de Keycloak y sus secretos, y eso son datos —tantos como
 * clientes haya—, no configuración. Los datos van en la base. Pero un secreto en
 * una columna de texto plano es un secreto que sale en cada respaldo, en cada
 * copia de la base a un ambiente de pruebas y en cada consulta que alguien
 * pegue en un chat.
 *
 * Así que se cifran. AES-256-GCM, que además de cifrar AUTENTICA: si alguien
 * edita el valor a mano en la base, el descifrado falla en vez de devolver
 * basura silenciosa.
 *
 * Lo que queda manual —y es a propósito— es UNA variable de entorno por
 * despliegue: `SECRETOS_LLAVE`. Es la única cosa que no puede vivir en la base
 * que protege. Sin ella el sistema arranca igual pero no puede leer ni guardar
 * secretos de empresa, y lo dice.
 *
 * Formato guardado: `v1:<iv en base64>:<etiqueta en base64>:<cifrado en base64>`
 * La versión va al frente para poder rotar el algoritmo algún día sin tener que
 * adivinar qué es cada fila.
 * ============================================================================
 */

const VERSION = 'v1';

@Injectable()
export class SecretosService {
  private readonly logger = new Logger(SecretosService.name);
  private llaveCacheada: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * La llave, derivada de la variable de entorno.
   *
   * Se pasa por SHA-256 para admitir cualquier longitud de frase: AES-256 exige
   * exactamente 32 bytes, y obligar a que la variable tenga 32 caracteres justos
   * invita a rellenar con ceros, que es peor que derivar.
   */
  private get llave(): Buffer | null {
    if (this.llaveCacheada) return this.llaveCacheada;
    const bruta = (this.config.get<string>('SECRETOS_LLAVE') ?? '').trim();
    if (bruta.length < 16) return null;
    this.llaveCacheada = createHash('sha256').update(bruta).digest();
    return this.llaveCacheada;
  }

  get configurado(): boolean {
    return this.llave !== null;
  }

  get motivoNoConfigurado(): string | null {
    if (this.configurado) return null;
    return (
      'Falta SECRETOS_LLAVE (mínimo 16 caracteres). Es la única llave que no ' +
      'puede vivir en la base que protege; sin ella no se pueden guardar ni leer ' +
      'los secretos de identidad de cada empresa.'
    );
  }

  /** Cifra. Devuelve null si no hay llave: el llamador decide si eso es un error. */
  cifrar(claro: string): string | null {
    const llave = this.llave;
    if (!llave) return null;
    const iv = randomBytes(12); // 96 bits, lo recomendado para GCM
    const cifrador = createCipheriv('aes-256-gcm', llave, iv);
    const cifrado = Buffer.concat([
      cifrador.update(claro, 'utf8'),
      cifrador.final(),
    ]);
    const etiqueta = cifrador.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      etiqueta.toString('base64'),
      cifrado.toString('base64'),
    ].join(':');
  }

  /**
   * Descifra. Devuelve null cuando no se puede, y NO lanza: un secreto ilegible
   * es un problema de configuración de ese registro, no una excepción que deba
   * tumbar la petición de alguien que quizá no necesitaba ese secreto.
   *
   * Nunca registra el valor, ni el cifrado ni el claro.
   */
  descifrar(guardado: string | null | undefined): string | null {
    if (!guardado) return null;
    const llave = this.llave;
    if (!llave) {
      this.logger.warn(
        'Hay un secreto guardado y no hay SECRETOS_LLAVE para leerlo.',
      );
      return null;
    }

    const partes = guardado.split(':');
    if (partes.length !== 4 || partes[0] !== VERSION) {
      this.logger.error(
        `Un secreto guardado no tiene el formato esperado (${partes[0] ?? '¿?'}).`,
      );
      return null;
    }

    try {
      const [, ivB64, etiquetaB64, cifradoB64] = partes;
      const descifrador = createDecipheriv(
        'aes-256-gcm',
        llave,
        Buffer.from(ivB64, 'base64'),
      );
      descifrador.setAuthTag(Buffer.from(etiquetaB64, 'base64'));
      return Buffer.concat([
        descifrador.update(Buffer.from(cifradoB64, 'base64')),
        descifrador.final(),
      ]).toString('utf8');
    } catch {
      /*
       * Aquí se cae cuando la llave cambió o cuando alguien editó la fila a
       * mano. Las dos cosas hay que saberlas, y ninguna se arregla sola.
       */
      this.logger.error(
        'No se pudo descifrar un secreto: la llave no corresponde, o el valor ' +
          'se modificó fuera del sistema.',
      );
      return null;
    }
  }

  /**
   * Para mostrar en pantalla sin mostrar nada. Un secreto tiene dos estados
   * interesantes para quien administra —está o no está— y ninguno de los dos
   * requiere verlo.
   */
  pista(guardado: string | null | undefined): string {
    return guardado ? '••••••••' : '(sin definir)';
  }
}
