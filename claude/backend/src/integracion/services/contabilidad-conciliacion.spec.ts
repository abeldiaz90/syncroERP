import { ContabilidadConciliacionService } from './contabilidad-conciliacion.service';
import { TipoVinculo } from '../integracion.constants';

describe('Conciliación de pólizas vinculadas', () => {
  function escenario() {
    const externa = { proveedor: 'fineract', configurado: () => true, consultarAsiento: jest.fn().mockResolvedValue({ referencia: 'SYNCRO-IN-1', moneda: 'MXN', reversado: false, movimientos: [{ cuentaIdExterna: '2', cargo: 600, abono: 0 }, { cuentaIdExterna: '4', cargo: 0, abono: 600 }] }) };
    const links = { find: jest.fn().mockResolvedValue([{ entidadId: 'p', idExterno: 't' }]) };
    const polizas = { findOne: jest.fn().mockResolvedValue({ folio: 'IN-1', estatus: 'VIGENTE', partidas: [{ cuentaContableId: 'caja', cargo: 600, abono: 0 }, { cuentaContableId: 'ventas', cargo: 0, abono: 600 }] }) };
    const mappings = { find: jest.fn().mockResolvedValue([{ cuentaContableId: 'caja', idExterno: '2' }, { cuentaContableId: 'ventas', idExterno: '4' }]) };
    const cfg = { findOne: jest.fn().mockResolvedValue({ oficinaContableExterna: '1' }) };
    const builder: any = {}; for (const key of ['insert', 'values', 'orIgnore']) builder[key] = jest.fn().mockReturnValue(builder);
    builder.execute = jest.fn().mockResolvedValue({});
    const avisos = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
    const service = new ContabilidadConciliacionService(externa as any, {} as any, links as any, polizas as any, mappings as any, cfg as any, avisos as any);
    return { service, externa, links, polizas, mappings, avisos, builder };
  }
  it('acota por empresa/proveedor y no escribe en una consulta', async () => {
    const s = escenario(); expect((await s.service.conciliarEmpresa('empresa')).discrepancias).toBe(0);
    expect(s.links.find).toHaveBeenCalledWith({ where: { empresaId: 'empresa', tipo: TipoVinculo.POLIZA, proveedor: 'fineract' } });
    expect(s.polizas.findOne).toHaveBeenCalledWith({ where: { id: 'p', empresaId: 'empresa' }, relations: ['partidas'] });
    expect(s.externa.consultarAsiento).toHaveBeenCalledWith('t', '1'); expect(s.avisos.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('detecta reversa y deduplica avisos con huella estable y conflicto ignorado', async () => {
    const s = escenario(); s.externa.consultarAsiento.mockResolvedValue({ referencia: 'SYNCRO-IN-1', moneda: 'MXN', reversado: true, movimientos: [] });
    const r = await s.service.conciliarEmpresa('empresa', true);
    expect(r.hallazgos.map(x => x.codigo)).toContain('REVERSA_EXTERNA');
    const primera = s.builder.values.mock.calls[0][0].huella;
    await s.service.conciliarEmpresa('empresa', true);
    expect(s.builder.values.mock.calls[2][0].huella).toBe(primera); expect(s.builder.orIgnore).toHaveBeenCalled();
  });
  it('no concilia pólizas históricas sin vínculo', async () => {
    const s = escenario(); s.links.find.mockResolvedValue([]);
    expect((await s.service.conciliarEmpresa('empresa')).revisados).toBe(0); expect(s.polizas.findOne).not.toHaveBeenCalled();
  });
  it('no interpreta un fallo remoto como coincidencia o asiento ausente', async () => {
    const s = escenario(); s.externa.consultarAsiento.mockRejectedValue(new Error('timeout'));
    expect((await s.service.conciliarEmpresa('empresa')).hallazgos.map(x => x.codigo)).toEqual(['CONSULTA_FALLIDA']);
  });
  it('detecta cambios de cuenta aunque ambos asientos estén balanceados', async () => {
    const s = escenario(); s.externa.consultarAsiento.mockResolvedValue({ referencia: 'SYNCRO-IN-1', moneda: 'MXN', reversado: false, movimientos: [{ cuentaIdExterna: 'otra', cargo: 600, abono: 0 }, { cuentaIdExterna: '4', cargo: 0, abono: 600 }] });
    expect((await s.service.conciliarEmpresa('empresa')).hallazgos.map(x => x.codigo)).toEqual(['PARTIDAS_DIFERENTES']);
  });
});
