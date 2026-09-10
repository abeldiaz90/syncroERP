import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

function obtenerLlave(): Buffer {
  const raw = process.env.CFDI_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ServiceUnavailableException(
      'Configura CFDI_ENCRYPTION_KEY (32 bytes en Base64 o 64 caracteres hex) para proteger las credenciales del PAC.',
    );
  }

  const llave = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (llave.length !== 32) {
    throw new ServiceUnavailableException(
      'CFDI_ENCRYPTION_KEY debe representar exactamente 32 bytes.',
    );
  }
  return llave;
}

export function estaCifradoSecretoCfdi(valor: string | null | undefined): boolean {
  return Boolean(valor?.startsWith(`${VERSION}.`));
}

export function cifrarSecretoCfdi(valor: string): string {
  const limpio = valor.trim();
  if (!limpio) return '';
  if (estaCifradoSecretoCfdi(limpio)) return limpio;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', obtenerLlave(), iv);
  const cifrado = Buffer.concat([
    cipher.update(limpio, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    cifrado.toString('base64url'),
  ].join('.');
}

export function descifrarSecretoCfdi(valor: string): string {
  // Compatibilidad controlada para datos heredados. Al guardar nuevamente la
  // configuración, CfdiService los migra automáticamente a AES-256-GCM.
  if (!estaCifradoSecretoCfdi(valor)) return valor;

  const [version, iv, tag, cifrado] = valor.split('.');
  if (version !== VERSION || !iv || !tag || !cifrado) {
    throw new ServiceUnavailableException(
      'La credencial cifrada del PAC tiene un formato no soportado.',
    );
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      obtenerLlave(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(cifrado, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException(
      'No fue posible descifrar la credencial del PAC. Verifica CFDI_ENCRYPTION_KEY.',
    );
  }
}
