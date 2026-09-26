/**
 * ============================================================================
 * Una regla de confidencialidad correcta que bloqueaba la operación
 * ----------------------------------------------------------------------------
 * `GET /credito/cuentas-bancarias` está VEDADA al rol `empleado`, y con razón:
 * devuelve número de cuenta y CLABE, que no tienen por qué estar a la vista de
 * quien atiende al público. La plantilla lo dice con todas sus letras.
 *
 * Pero el punto de venta exige elegir caja, banco o TPV en todo cobro
 * inmediato —`METODOS_QUE_REQUIEREN_CUENTA`— y pedía esa misma lista. La
 * pantalla envuelve la llamada en `intentar(..., [])`, así que el 403 no se
 * veía: el desplegable salía vacío, `contextoCompleto` era false y **ninguna
 * venta de contado podía cerrarse**. Medido el 25-sep-2026: el API responde
 * «El método EFECTIVO requiere seleccionar una caja, banco o TPV activa» y el
 * cajero no tenía ninguna que seleccionar.
 *
 * La vista corta es lo que faltaba: el nombre de la caja y su tipo, que es lo
 * que el cajero necesita nombrar. Esta prueba fija que siga siendo corta — si
 * algún día alguien le añade la CLABE «porque hacía falta para otra pantalla»,
 * se cae aquí.
 * ============================================================================
 */
import { CuentasBancariasService } from './cuentas-bancarias.service';

describe('la lista de cajas para cobrar no lleva datos bancarios', () => {
  const fila = {
    id: 'c1',
    nombre: 'Caja mostrador',
    tipo: 'CAJA',
    esPorDefecto: true,
    // Lo que NO debe salir, aunque el repositorio lo devolviera:
    clabe: '012180001234567895',
    numeroCuenta: '1234567890',
    cuentaContableId: 'cta-1',
  };

  function crear() {
    const repo: any = { find: jest.fn(async () => [fila]) };
    return {
      servicio: new CuentasBancariasService(repo, {} as any, {} as any),
      repo,
    };
  }

  it('devuelve sólo lo que el mostrador necesita para nombrar la caja', async () => {
    const { servicio } = crear();
    const lista = await servicio.obtenerParaCobro('e1');

    expect(lista).toEqual([
      { id: 'c1', nombre: 'Caja mostrador', tipo: 'CAJA', esPorDefecto: true },
    ]);
    const claves = Object.keys(lista[0]);
    for (const prohibida of ['clabe', 'numeroCuenta', 'cuentaContableId']) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it('pide sólo las cuentas activas de la empresa', async () => {
    const { servicio, repo } = crear();
    await servicio.obtenerParaCobro('e1');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: 'e1', activo: true } }),
    );
  });
});
