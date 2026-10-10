/**
 * ============================================================================
 * El día en que vence una cuota todavía no es mora
 * ----------------------------------------------------------------------------
 * `actualizarVencidos` comparaba `fechaVencimiento < new Date()` — el INSTANTE.
 * Como `fechaVencimiento` es una columna `date`, o sea medianoche, una cuota
 * que vence hoy cumplía esa condición desde las 00:00:01 y la primera corrida
 * del día la marcaba VENCIDA. Al cliente le quedaba el día entero para pagar y
 * el sistema ya lo tenía por moroso: entra al reporte de vencidos, dispara el
 * bloqueo por mora y se le niega una compra a crédito que tenía derecho a
 * hacer.
 *
 * Había cinco nociones de «vencido» conviviendo. Tres ya medían contra el día
 * de calendario —la política de crédito, la devolución de ventas con
 * `CAST(CURRENT_TIMESTAMP AS date)` y City Ledger—. Las dos que medían contra
 * el instante eran `actualizarVencidos` y el tablero ejecutivo, y por eso el
 * tablero contaba más vencidos que el reporte de cartera el mismo día.
 * ============================================================================
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { EstadoCuota } from './entities/amortizacion-cuota.entity';
import { estadoDeUnaCuota } from './utils/estado-de-una-cuota.util';

const hoyLocal = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
const diaRelativo = (dias: number) => {
  const d = hoyLocal();
  d.setDate(d.getDate() + dias);
  return d;
};

describe('La frontera de la mora', () => {
  it('la cuota que vence HOY no está vencida, ni siquiera a mediodía', () => {
    expect(
      estadoDeUnaCuota(
        { montoPagado: 0, montoCuota: 1000, fechaVencimiento: hoyLocal() },
        new Date(hoyLocal().getTime() + 12 * 3600 * 1000),
      ),
    ).toBe(EstadoCuota.PENDIENTE);
  });

  it('la de ayer sí', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: 0, montoCuota: 1000, fechaVencimiento: diaRelativo(-1) }),
    ).toBe(EstadoCuota.VENCIDA);
  });

  it('la de mañana, no', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: 0, montoCuota: 1000, fechaVencimiento: diaRelativo(1) }),
    ).toBe(EstadoCuota.PENDIENTE);
  });
});

describe('Nadie mide la mora contra el instante —barrido—', () => {
  /*
   * EL TRINQUETE. Lo de arriba vale para un sitio; esto vigila que no vuelva a
   * aparecer otra noción. Se busca cualquier comparación de un vencimiento
   * contra `CURRENT_TIMESTAMP` sin convertir a `date`, que es la forma que
   * tenía el tablero ejecutivo.
   */
  const SRC = join(__dirname, '..');

  function archivos(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const ruta = join(dir, e.name);
      if (statSync(ruta).isDirectory()) archivos(ruta, acc);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(ruta);
    }
    return acc;
  }

  it('ninguna consulta compara un vencimiento contra CURRENT_TIMESTAMP crudo', () => {
    const culpables: string[] = [];
    for (const ruta of archivos(SRC)) {
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (!/fechaVencimiento\s*<\s*CURRENT_TIMESTAMP/i.test(linea)) return;
        if (/CAST\(\s*CURRENT_TIMESTAMP\s+AS\s+date\s*\)/i.test(linea)) return;
        culpables.push(`${ruta.slice(SRC.length + 1).replace(/\\/g, '/')}:${i + 1}`);
      });
    }
    expect(culpables).toEqual([]);
  });

  it('y `actualizarVencidos` mide contra el día de negocio', () => {
    const texto = readFileSync(join(SRC, 'credito/services/cobranza.service.ts'), 'utf8');
    const cuerpo = texto.slice(texto.indexOf('async actualizarVencidos('));
    const corte = cuerpo.slice(0, cuerpo.indexOf('cuotasParaVencer'));
    expect(corte).toMatch(/const hoy = fechaContableNegocio\(\)/);
    expect(corte).not.toMatch(/const hoy = new Date\(\)/);
  });
});
