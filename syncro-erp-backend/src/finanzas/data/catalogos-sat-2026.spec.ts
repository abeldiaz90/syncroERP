import {
  BANCOS_ANEXO_24_2026,
  CODIGOS_AGRUPADORES_SAT_2026,
  METODOS_PAGO_ANEXO_24_2026,
  MONEDAS_ANEXO_24_2026,
  SAT_ANEXO_24_2026,
} from './catalogos-sat-2026';

describe('Catálogos oficiales del Anexo 24 RMF 2026', () => {
  it('conserva la versión, fuente y huella verificable', () => {
    expect(SAT_ANEXO_24_2026.ejercicio).toBe(2026);
    expect(SAT_ANEXO_24_2026.fechaPublicacion).toBe('2026-01-13');
    expect(SAT_ANEXO_24_2026.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('precarga catálogos completos sin claves duplicadas', () => {
    expect(CODIGOS_AGRUPADORES_SAT_2026).toHaveLength(1080);
    expect(MONEDAS_ANEXO_24_2026).toHaveLength(178);
    expect(BANCOS_ANEXO_24_2026).toHaveLength(94);
    expect(METODOS_PAGO_ANEXO_24_2026).toHaveLength(19);

    for (const catalogo of [
      CODIGOS_AGRUPADORES_SAT_2026.map((e) => e.codigo),
      MONEDAS_ANEXO_24_2026.map((e) => e.clave),
      BANCOS_ANEXO_24_2026.map((e) => e.clave),
      METODOS_PAGO_ANEXO_24_2026.map((e) => e.clave),
    ]) {
      expect(new Set(catalogo).size).toBe(catalogo.length);
    }
  });

  it('distingue IVA pagado/cobrado del pendiente', () => {
    const porCodigo = new Map(
      CODIGOS_AGRUPADORES_SAT_2026.map((e) => [e.codigo, e.nombre]),
    );
    expect(porCodigo.get('118.01')).toBe('IVA acreditable pagado');
    expect(porCodigo.get('119.01')).toBe('IVA pendiente de pago');
    expect(porCodigo.get('208.01')).toBe('IVA trasladado cobrado');
    expect(porCodigo.get('209.01')).toBe('IVA trasladado no cobrado');
    expect(porCodigo.get('702.01')).toBe('Utilidad cambiaria');
  });
});
