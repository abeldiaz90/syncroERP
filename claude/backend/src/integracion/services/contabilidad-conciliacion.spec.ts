import { ContabilidadConciliacionService } from './contabilidad-conciliacion.service';
import { ModoContabilidad, TipoVinculo } from '../integracion.constants';
import { EstadoAviso } from '../entities/aviso-integracion.entity';

describe('Conciliación de pólizas vinculadas', () => {
  function escenario() {
    const externa = { proveedor: 'fineract', configurado: () => true, disponible: () => true, consultarAsiento: jest.fn().mockResolvedValue({ referencia: 'SYNCRO-IN-1', moneda: 'MXN', reversado: false, movimientos: [{ cuentaIdExterna: '2', cargo: 600, abono: 0 }, { cuentaIdExterna: '4', cargo: 0, abono: 600 }] }) };
    const links = { find: jest.fn().mockResolvedValue([{ entidadId: 'p', idExterno: 't' }]) };
    const polizas = { findOne: jest.fn().mockResolvedValue({ folio: 'IN-1', estatus: 'VIGENTE', partidas: [{ cuentaContableId: 'caja', cargo: 600, abono: 0 }, { cuentaContableId: 'ventas', cargo: 0, abono: 600 }] }) };
    const mappings = { find: jest.fn().mockResolvedValue([{ cuentaContableId: 'caja', idExterno: '2' }, { cuentaContableId: 'ventas', idExterno: '4' }]) };
    const cfg = { findOne: jest.fn().mockResolvedValue({ oficinaContableExterna: '1' }) };
    const builder: any = {}; for (const key of ['insert', 'values', 'orIgnore']) builder[key] = jest.fn().mockReturnValue(builder);
    builder.execute = jest.fn().mockResolvedValue({});
    /*
     * `update` no estaba en el doble y el servicio sí lo usa para cerrar los
     * avisos de lectura fallida que dejaron de ser ciertos. Un doble incompleto
     * no reporta «falta esto»: reporta que el código está roto.
     */
    const avisos = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    /*
     * La cola de salida. Por omisión está vacía: el escenario base habla de
     * pólizas que YA salieron. Un `findOne` que devolviera algo convertiría
     * cada vínculo sin identificador en «todavía no ha salido», que es
     * precisamente lo que las pruebas de abajo quieren poder distinguir.
     */
    const eventos = { findOne: jest.fn().mockResolvedValue(null) };
    /*
     * El modo, que antes era `{}`.
     *
     * `conciliarEmpresa` pregunta ahora si la empresa contrató el espejo antes
     * de leer nada: es público y los dos endpoints de
     * `/integracion/contabilidad/conciliacion` lo llamaban directo, así que una
     * empresa sin espejo se estrellaba contra «Falta la oficina contable
     * externa» —el dato equivocado— en vez de oír que no lo contrató.
     *
     * El doble dice ESPEJO porque es la precondición de TODO lo que este
     * archivo comprueba: conciliar dos mayores exige que haya dos.
     */
    const modos = { modoContabilidadDe: jest.fn().mockResolvedValue(ModoContabilidad.ESPEJO) };
    const service = new ContabilidadConciliacionService(externa as any, modos as any, links as any, polizas as any, mappings as any, cfg as any, avisos as any, eventos as any);
    return { service, externa, modos, links, polizas, mappings, avisos, builder, eventos };
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
  it('cierra el aviso de lectura fallida cuando una corrida posterior sí lee el asiento', async () => {
    const s = escenario();
    // Primera corrida: el proveedor no responde y se levanta CONSULTA_FALLIDA.
    s.externa.consultarAsiento.mockRejectedValue(new Error('timeout'));
    await s.service.conciliarEmpresa('empresa', true);
    const huellaDelFallo = s.builder.values.mock.calls[0][0].huella;

    // Segunda corrida: el proveedor responde y el asiento coincide.
    s.externa.consultarAsiento.mockResolvedValue({
      referencia: 'SYNCRO-IN-1',
      moneda: 'MXN',
      reversado: false,
      movimientos: [
        { cuentaIdExterna: '2', cargo: 600, abono: 0 },
        { cuentaIdExterna: '4', cargo: 0, abono: 600 },
      ],
    });
    const r = await s.service.conciliarEmpresa('empresa', true);

    expect(r.discrepancias).toBe(0);
    expect(s.avisos.update).toHaveBeenCalledWith(
      { huella: huellaDelFallo, estado: EstadoAviso.PENDIENTE },
      expect.objectContaining({ estado: EstadoAviso.PROCESADO, resueltoPor: null }),
    );
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

  /*
   * ════════════════════════════════════════════════════════════════════════
   * Primero si lo contrató, y sólo después si le falta un dato
   * ------------------------------------------------------------------------
   * Sin esto, una empresa que sólo usa el ERP pulsaba «conciliar» y recibía
   * «Falta la oficina contable externa»: un mensaje que la manda a llenar un
   * campo que no tiene por qué llenar nunca, y que esconde la respuesta de
   * verdad, que es que no contrató el espejo.
   * ════════════════════════════════════════════════════════════════════════
   */
  it('sin espejo contratado no lee nada, y lo dice por su nombre', async () => {
    const s = escenario();
    s.modos.modoContabilidadDe.mockResolvedValue(ModoContabilidad.APAGADO);

    await expect(s.service.conciliarEmpresa('empresa')).rejects.toThrow(
      /no tiene contratado el espejo contable/i,
    );
    /* Y no se asomó al otro mayor ni a la base. */
    expect(s.externa.consultarAsiento).not.toHaveBeenCalled();
    expect(s.links.find).not.toHaveBeenCalled();
  });
});