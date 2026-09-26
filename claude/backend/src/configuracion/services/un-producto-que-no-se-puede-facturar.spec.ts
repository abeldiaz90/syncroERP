/**
 * ============================================================================
 * Un producto que se puede vender y no se puede facturar
 * ----------------------------------------------------------------------------
 * El CFDI 4.0 exige por cada renglón la ClaveProdServ y la ClaveUnidad del
 * catálogo del SAT. Sin ellas el PAC rechaza el comprobante ENTERO, no la
 * línea. Pero el punto de venta no las pide: la venta se cobra igual y el
 * problema aparece al timbrar, con el cliente delante.
 *
 * Medido el 25-sep-2026 contra la instalación, después de cerrar la primera
 * venta del sistema: **los siete productos activos, sin excepción, sin
 * ClaveProdServ**, cinco de siete sin ClaveUnidad. Ninguna venta de ese
 * catálogo se podía facturar, y ninguna pantalla lo advertía.
 *
 * El control vive en el diagnóstico de configuración —que es donde alguien
 * mira antes de arrancar— y bloquea, porque no es un paso pendiente: es una
 * venta que ya se puede hacer y una factura que no se va a poder emitir.
 * ============================================================================
 */
import { DiagnosticoConfiguracionService } from './diagnostico-configuracion.service';

describe('diagnóstico · productos sin claves del SAT', () => {
  function crear(sinClave: number | null) {
    const query = jest.fn(async (sql: string, params?: any[]) => {
      if (/FROM Empresas/i.test(sql)) {
        return [
          {
            rfc: 'AAA010101AAA',
            regimenFiscal: '601',
            codigoPostal: '06000',
            onboardingCompletado: true,
          },
        ];
      }
      if (/information_schema/i.test(sql)) {
        /*
         * `existeTabla` pasa el nombre como PARÁMETRO, no en el texto de la
         * consulta: hay que mirar `params`. Buscarlo en el SQL —como hacía la
         * primera versión de esta prueba— no encuentra nada nunca, y el caso
         * «no se pudo medir» se quedaba sin medir.
         */
        const tabla = String(params?.[0] ?? '');
        if (sinClave === null && tabla === 'productos') return [];
        return [{ x: 1 }];
      }
      if (/FROM "?productos"?/i.test(sql) && /claveSAT/i.test(sql)) {
        return [{ total: sinClave ?? 0 }];
      }
      // Cualquier otro conteo: una fila, para que nada más bloquee.
      return [{ total: 1 }];
    });
    return new DiagnosticoConfiguracionService({ query } as any);
  }

  const control = (r: any) =>
    r.modulos?.facturacion?.requisitos?.find(
      (i: any) => i.codigo === 'FAC_CLAVES_SAT',
    );

  it('con todos los productos completos, el control queda limpio', async () => {
    const r: any = await crear(0).obtener('e1');
    expect(control(r).completo).toBe(true);
    expect(control(r).bloqueante).toBe(false);
  });

  it('con productos sin clave, bloquea y dice cuántos', async () => {
    const r: any = await crear(7).obtener('e1');
    expect(control(r).completo).toBe(false);
    expect(control(r).bloqueante).toBe(true);
    expect(control(r).titulo).toContain('7');
    expect(control(r).detalle).toMatch(/PAC|renglón/i);
  });

  it('si no se pudo medir, lo dice y no finge que está completo', async () => {
    const r: any = await crear(null).obtener('e1');
    expect(control(r).completo).toBe(false);
    expect(control(r).titulo).toMatch(/no se pudo comprobar/i);
  });
});
