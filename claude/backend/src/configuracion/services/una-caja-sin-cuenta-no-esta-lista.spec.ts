/**
 * ============================================================================
 * Contar filas no es comprobar que sirvan
 * ----------------------------------------------------------------------------
 * `FIN_BANCOS` daba «Cuenta bancaria o caja: completo» con sólo contar filas.
 *
 * Pero una caja o un banco **sin cuenta contable** no puede generar una sola
 * póliza: `buscarCuentaSegunMetodoPago` devuelve null y toda operación que la
 * use —ventas, cobranza, pagos, traspasos, nómina— cae en la bandeja de
 * asientos pendientes. El alta ya exige la cuenta contable desde hace tiempo,
 * con su razón escrita, pero las cuentas creadas antes de esa regla siguen ahí
 * y nadie avisa.
 *
 * Medido el 25-sep-2026: la única cuenta de esta instalación —«PRUEBA POS SIN
 * DINERO REAL»— no tiene cuenta contable, y el diagnóstico daba finanzas por
 * lista.
 * ============================================================================
 */

import { DiagnosticoConfiguracionService } from './diagnostico-configuracion.service';

/**
 * Un DataSource de mentira que responde a las dos preguntas del diagnóstico:
 * «¿existe la tabla/columna?» y «cuántas filas hay». `cuentasSinContable` es
 * lo que decide el caso.
 */
function servicio(opciones: {
  bancos: number;
  bancosSinContable: number;
  hayTablaBancos?: boolean;
}) {
  const hayTabla = opciones.hayTablaBancos ?? true;
  const ds = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        const tabla = String(params?.[0] ?? '');
        return tabla === 'cuentas_bancarias' && !hayTabla ? [] : [{ ok: 1 }];
      }
      if (sql.includes('information_schema.columns')) return [{ ok: 1 }];
      if (sql.includes('FROM Empresas')) {
        return [{ rfc: 'SUM230815AB1', regimenFiscal: '601', codigoPostal: '96870' }];
      }
      if (sql.includes('"cuentas_bancarias"')) {
        return [
          {
            total: sql.includes('cuentaContableId IS NULL')
              ? opciones.bancosSinContable
              : opciones.bancos,
          },
        ];
      }
      // Cualquier otro catálogo: uno, para que nada más bloquee.
      return [{ total: 1 }];
    }),
  };
  return new DiagnosticoConfiguracionService(ds as any);
}

const finBancos = (resultado: any) =>
  resultado.modulos.finanzas.requisitos.find(
    (r: any) => r.codigo === 'FIN_BANCOS',
  );

describe('Diagnóstico · una caja sin cuenta contable no está lista', () => {
  it('con una cuenta sin enlazar, no está completo y bloquea', async () => {
    const r = await servicio({ bancos: 1, bancosSinContable: 1 }).obtener('emp-1');
    const req = finBancos(r);

    expect(req.completo).toBe(false);
    expect(req.bloqueante).toBe(true);
    expect(req.titulo).toContain('sin cuenta contable');
  });

  it('el detalle dice qué se rompe, no sólo que falta algo', async () => {
    /*
     * Quien lo lee tiene que poder decidir si le urge. «Falta la cuenta
     * contable» no lo dice; «ninguna operación podrá generar su póliza», sí.
     */
    const r = await servicio({ bancos: 1, bancosSinContable: 1 }).obtener('emp-1');

    expect(finBancos(r).detalle).toMatch(/Asientos\s+pendientes/i);
  });

  it('con todas enlazadas, está completo', async () => {
    const r = await servicio({ bancos: 2, bancosSinContable: 0 }).obtener('emp-1');
    const req = finBancos(r);

    expect(req.completo).toBe(true);
    expect(req.bloqueante).toBe(false);
  });

  it('sin ninguna cuenta todavía, no bloquea: es un paso pendiente', async () => {
    // Una empresa recién dada de alta no ha registrado su banco. Eso no es una
    // configuración rota, es una configuración incompleta.
    const r = await servicio({ bancos: 0, bancosSinContable: 0 }).obtener('emp-1');
    const req = finBancos(r);

    expect(req.completo).toBe(false);
    expect(req.bloqueante).toBe(false);
  });

  it('si no se pudo medir, no dice que está listo', async () => {
    /*
     * Sin la tabla, la cuenta de «sin enlazar» sería 0 y el requisito saldría
     * en verde por no haber podido mirar. Un cero inventado en un diagnóstico
     * es peor que un error: el error se corrige, el cero se cree.
     */
    const r = await servicio({
      bancos: 0,
      bancosSinContable: 0,
      hayTablaBancos: false,
    }).obtener('emp-1');
    const req = finBancos(r);

    expect(req.completo).toBe(false);
    expect(req.titulo).toMatch(/no se pudo comprobar/i);
  });
});
