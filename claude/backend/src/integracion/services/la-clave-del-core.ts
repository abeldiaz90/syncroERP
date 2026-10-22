import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';

/**
 * ============================================================================
 * La clave de un inquilino, como el core la sabe leer
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 21-oct-2026. Se registró el inquilino `onpremise-prueba` con la
 * clave de su base EN CLARO, y en el siguiente arranque Fineract NO LEVANTÓ:
 *
 *     Exception while upgrading tenant onpremise-prueba
 *     Unable to decrypt data. Please check if the master password…
 *     Illegal base64 character 2d
 *     → RuntimeException: Tenant upgrades had exceptions
 *     → Error starting Tomcat context
 *
 * Y no se cayó ese inquilino: se cayó EL CORE ENTERO.
 * `TenantDatabaseUpgradeService` recorre todos los inquilinos al arrancar y si
 * UNO falla lanza, así que el contexto de Spring no se construye y ninguna de
 * las demás instituciones puede operar. Un alta on-premise mal escrita tumba a
 * todos los clientes de la instalación en el siguiente reinicio —que es
 * justamente cuando nadie está mirando—.
 *
 * LO QUE EL CORE ESPERA
 *
 * `tenant_server_connections.schema_password` no es la clave: es la clave
 * CIFRADA, y el core la descifra al arrancar con su contraseña maestra
 * (`fineract.tenant.master-password`). Esto reproduce exactamente lo que hace
 * `EncryptionUtil.encryptToBase64`, que es lo que ese lado va a usar para
 * descifrarla:
 *
 *   · PBKDF2WithHmacSHA1, 65 536 vueltas, llave de 256 bits
 *   · AES/CBC/PKCS5Padding
 *   · y el sobre en base64 es iv(16) ‖ sal(16) ‖ cifrado
 *
 * El orden del sobre importa tanto como el algoritmo: el core lee los
 * primeros 16 bytes como iv y los siguientes 16 como sal. Un sobre con las dos
 * mitades al revés descifra a basura, no a un error.
 * ============================================================================
 */

/** Lo mismo que `DatabasePasswordEncryptor.DEFAULT_ENCRYPTION`, en nombres de Node. */
const ALGORITMO = 'aes-256-cbc';
const VUELTAS = 65_536;
const BYTES_DE_LLAVE = 32;

const llave = (maestra: string, sal: Buffer): Buffer =>
  pbkdf2Sync(Buffer.from(maestra, 'utf8'), sal, VUELTAS, BYTES_DE_LLAVE, 'sha1');

/** Devuelve el sobre en base64 que el core sabe abrir. */
export function cifrarParaElCore(maestra: string, claro: string): string {
  const sal = randomBytes(16);
  const iv = randomBytes(16);
  const cifrador = createCipheriv(ALGORITMO, llave(maestra, sal), iv);
  const cifrado = Buffer.concat([cifrador.update(claro, 'utf8'), cifrador.final()]);
  return Buffer.concat([iv, sal, cifrado]).toString('base64');
}

/**
 * Abre un sobre del core.
 *
 * No se usa para operar: se usa para COMPROBAR lo que se acaba de escribir.
 * Ver `registrarInquilino`: una contraseña maestra equivocada produce un sobre
 * perfectamente válido que el core no puede abrir, y sin esta vuelta eso se
 * descubriría en el siguiente arranque, con el core caído y todos dentro.
 */
export function descifrarDelCore(maestra: string, sobre: string): string {
  const crudo = Buffer.from(sobre, 'base64');
  if (crudo.length <= 32) throw new Error('El sobre es demasiado corto para llevar iv y sal.');
  const iv = crudo.subarray(0, 16);
  const sal = crudo.subarray(16, 32);
  const descifrador = createDecipheriv(ALGORITMO, llave(maestra, sal), iv);
  return Buffer.concat([
    descifrador.update(crudo.subarray(32)),
    descifrador.final(),
  ]).toString('utf8');
}
