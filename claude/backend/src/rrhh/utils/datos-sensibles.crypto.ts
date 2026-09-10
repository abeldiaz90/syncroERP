import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

function key(): Buffer {
  const raw = process.env.NOMINA_DATA_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ServiceUnavailableException(
      'Configura NOMINA_DATA_ENCRYPTION_KEY (32 bytes en Base64 o 64 caracteres hex) para proteger datos bancarios.',
    );
  }
  const result = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (result.length !== 32) {
    throw new ServiceUnavailableException(
      'NOMINA_DATA_ENCRYPTION_KEY debe representar exactamente 32 bytes.',
    );
  }
  return result;
}

export function cifrarDatoNomina(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function descifrarDatoNomina(value: string): string {
  const [version, iv, tag, encrypted] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) {
    throw new ServiceUnavailableException('El dato cifrado de nómina tiene un formato no soportado.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function huellaDatoNomina(value: string): string {
  return createHmac('sha256', key()).update(value).digest('hex');
}
