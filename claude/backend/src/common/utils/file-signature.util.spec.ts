import {
  esExcelReal,
  extensionImagenReal,
} from './file-signature.util';

describe('validación por firma binaria', () => {
  it('acepta un contenedor ZIP/XLSX por sus magic bytes', () => {
    expect(esExcelReal(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '.xlsx')).toBe(true);
  });

  it('rechaza un ejecutable renombrado como XLSX', () => {
    expect(esExcelReal(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), '.xlsx')).toBe(false);
  });

  it.each([
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], '.png'],
    ['jpeg', [0xff, 0xd8, 0xff, 0xe0], '.jpg'],
    ['gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], '.gif'],
    ['webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], '.webp'],
  ])('acepta una firma real %s', (_nombre, bytes, extension) => {
    expect(extensionImagenReal(Buffer.from(bytes))).toBe(extension);
  });

  it('rechaza contenido HTML declarado como imagen', () => {
    expect(extensionImagenReal(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
});
