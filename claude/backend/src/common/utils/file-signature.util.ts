const firmas = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  gif87: Array.from(Buffer.from('GIF87a', 'ascii')),
  gif89: Array.from(Buffer.from('GIF89a', 'ascii')),
  webpRiff: Array.from(Buffer.from('RIFF', 'ascii')),
  webp: Array.from(Buffer.from('WEBP', 'ascii')),
  zip: [0x50, 0x4b, 0x03, 0x04],
  ole: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
} as const;

function iniciaCon(buffer: Buffer, firma: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + firma.length) return false;
  return firma.every((byte, i) => buffer[offset + i] === byte);
}

export function esExcelReal(buffer: Buffer, extension: string): boolean {
  const ext = extension.toLowerCase();
  if (ext === '.xlsx') return iniciaCon(buffer, firmas.zip);
  if (ext === '.xls') return iniciaCon(buffer, firmas.ole);
  return false;
}

export function extensionImagenReal(buffer: Buffer): '.png' | '.jpg' | '.gif' | '.webp' | null {
  if (iniciaCon(buffer, firmas.png)) return '.png';
  if (iniciaCon(buffer, firmas.jpg)) return '.jpg';
  if (iniciaCon(buffer, firmas.gif87) || iniciaCon(buffer, firmas.gif89)) return '.gif';
  if (iniciaCon(buffer, firmas.webpRiff) && iniciaCon(buffer, firmas.webp, 8)) return '.webp';
  return null;
}
