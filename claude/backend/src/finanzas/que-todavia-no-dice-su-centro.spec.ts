/**
 * ============================================================================
 * Qué todavía no dice su centro de costo
 * ----------------------------------------------------------------------------
 * EL TRINQUETE, Y LA LISTA HONESTA.
 *
 * La dimensión ya existe en la partida y los tres caminos por los que nace una
 * póliza la validan. Lo que NO existe todavía es que los generadores
 * automáticos la resuelvan: la venta sabe de qué almacén salió, la nómina de
 * qué departamento y el folio de qué habitación, y **ninguno lo trae hasta la
 * partida**. Sus partidas de resultado nacen sin clasificar.
 *
 * Eso es deliberado. La alternativa —inventarles un centro por omisión— daría
 * un reporte de aspecto correcto donde todo el costo de ventas de la empresa
 * cae en el mismo sitio, y nadie volvería a mirarlo. Es el patrón que este
 * proyecto lleva una semana cerrando: **un hueco que se sabe ausente cuesta una
 * conversación; uno que se cree puesto cuesta un cliente**.
 *
 * Así que la lista se escribe, se vigila, y se va acortando. Cuando un
 * generador aprenda a decir su centro, se quita de aquí y la prueba obliga a
 * que así sea.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(SRC, ruta), 'utf8');

/**
 * Generadores que todavía no resuelven el centro, con lo que SÍ saben y de
 * dónde podrían sacarlo. No es una lista de deseos: es de dónde vendría el
 * dato el día que se haga.
 */
const TODAVIA_SIN_CENTRO: Array<{ archivo: string; sabe: string }> = [
  {
    archivo: 'finanzas/services/motor-contable.service.ts',
    sabe: 'el almacén de la venta, la cuenta bancaria del cobro y el producto; de ahí saldrían el centro de la sucursal y el de la línea',
  },
  {
    archivo: 'rrhh/services/nomina-calculo.service.ts',
    sabe: 'el departamento del empleado, y además `Empleado.centroCostos` existe HOY como texto libre — ése es el que hay que migrar al catálogo',
  },
  {
    archivo: 'hoteleria/services/operacion-hotel.service.ts',
    sabe: 'el hotel y la habitación del folio',
  },
];

describe('Centro de costo · lo que todavía no lo dice', () => {
  it('los generadores de la lista siguen existiendo donde dice', () => {
    const perdidos = TODAVIA_SIN_CENTRO.filter((g) => {
      try {
        return !leer(g.archivo);
      } catch {
        return true;
      }
    }).map((g) => g.archivo);
    /*
     * La prueba de la prueba: si un archivo se renombra, esta lista deja de
     * describir el sistema y hay que rehacerla, no arrastrarla.
     */
    expect(perdidos).toEqual([]);
  });

  it('el motor contable valida el centro pero NO lo exige', async () => {
    /*
     * La primera versión de esta prueba buscaba `centroCostoId:` en el fuente
     * de cada generador y se puso roja al instante: el motor MENCIONA el campo
     * —lo declara en `PartidaInput` y lo escribe en la partida— sin que ningún
     * generador lo RESUELVA. Medir la palabra no mide la regla; es justo el
     * defecto del hallazgo 57 cometido en una prueba recién escrita.
     *
     * Lo que de verdad hay que fijar es la exención, porque es una decisión:
     * por el motor nacen casi todas las pólizas del sistema y ninguno de sus
     * generadores trae centro todavía. Si el motor exigiera, dar de alta el
     * primer centro de costo de una empresa la dejaría sin poder facturar, sin
     * poder recibir mercancía y sin poder cobrar.
     *
     * Y se mide que no toque la base: si alguien le pone una consulta aquí,
     * cada póliza del sistema paga una consulta de más.
     */
    const { MotorContableService } = await import('./services/motor-contable.service');
    const motor: any = Object.create(MotorContableService.prototype);
    const em = {
      getRepository: () => {
        throw new Error('el motor no debería consultar nada cuando no hay centros');
      },
    };
    const partidas = [
      { cuentaContableId: 'c1', cargo: 100, abono: 0, referencia: 'x' },
      { cuentaContableId: 'c2', cargo: 0, abono: 100, referencia: 'x' },
    ];
    await expect(
      motor.resolverCentros(em, 'empresa-1', partidas),
    ).resolves.toEqual([null, null]);
  });

  it('pero sí rechaza un centro inválido que alguien le pase', async () => {
    /*
     * La exención es sobre EXIGIR, no sobre validar: un centro inexistente
     * descuadra el reporte venga de una persona o de una máquina.
     */
    const { MotorContableService } = await import('./services/motor-contable.service');
    const motor: any = Object.create(MotorContableService.prototype);
    const em = { getRepository: () => ({ findOne: async () => null, count: async () => 0 }) };
    await expect(
      motor.resolverCentros(em, 'empresa-1', [
        { cuentaContableId: 'c1', cargo: 100, abono: 0, referencia: 'x', centroCostoId: 'cc-inventado' },
      ]),
    ).rejects.toThrow(/no existe/);
  });

  it('la captura manual SÍ lo pasa, que es lo que ya está hecho', () => {
    const polizas = leer('finanzas/services/polizas.service.ts');
    expect(polizas).toMatch(/resolverCentros\(/);
    expect(polizas).toMatch(/centroCostoId: centros\[i\]/);
  });

  it('la reversa hereda el centro de la póliza original', () => {
    /*
     * Si la reversa cayera en otro centro —o en ninguno—, el centro se quedaría
     * con el cargo y sin su reverso, y su resultado quedaría mal para siempre.
     * Espejar el importe y no la dimensión es el mismo defecto que ya pagamos
     * reversando una venta con enganche.
     */
    const polizas = leer('finanzas/services/polizas.service.ts');
    const reversa = polizas.slice(polizas.indexOf('Espejo: cargo ↔ abono'));
    expect(reversa).toMatch(/centroCostoId: p\.centroCostoId/);
  });

  it('el espejo a Fineract decide la oficina y lo deja dicho', () => {
    const despachador = leer('integracion/services/integracion-despachador.service.ts');
    /* Fineract admite UNA oficina por asiento; la decisión está escrita ahí. */
    expect(despachador).toMatch(/oficinasDeLosCentros/);
    expect(despachador).toMatch(/variasOficinas/);
    expect(despachador).toMatch(/reparte entre varios centros de costo/);
  });
});
