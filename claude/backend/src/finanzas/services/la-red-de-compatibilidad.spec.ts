import { readFileSync } from 'fs';
import { join } from 'path';

import { PLAN_CUENTAS_ESTANDAR } from '../data/plan-cuentas-estandar';

/**
 * ============================================================================
 * La red de compatibilidad tiene que atrapar la cuenta correcta
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * `buscarCuentaPorRol(rol, tipo, prefijo)` busca la cuenta por su rol de
 * sistema y, si no la encuentra, cae en una red: la primera cuenta afectable
 * de ese tipo cuyo número empiece por `prefijo`. La red existe para
 * instalaciones donde nadie asignó los roles —justo las más frágiles—.
 *
 * Ocho de esas redes apuntaban a otra cuenta:
 *
 *   · IVA trasladado NO cobrado caía en `207`, que es el grupo padre
 *     «Impuestos trasladados», no `209`, que es «no cobrados». La declaración
 *     de IVA distingue una cosa de la otra; la red las mezclaba.
 *   · IVA acreditable pagado caía en `116` —«Estimación de inventarios
 *     obsoletos»— y el pendiente en `117` —«Obras en proceso de inmuebles»—.
 *     Los grupos correctos son 118 y 119.
 *   · Los intereses cobrados y los consumos del folio caían en `402`,
 *     «Devoluciones y descuentos sobre ingresos»: una complementaria deudora
 *     que RESTA ingresos.
 *   · Caja caía en `1`, que atrapa cualquier activo del catálogo; proveedores
 *     en `21`, que atrapa «Provisión de sueldos» y «Impuestos por pagar»;
 *     clientes, en un `14` que en el catálogo SAT no existe.
 *   · Y la baja de un activo pedía `701` para la utilidad y `702` para la
 *     pérdida: gastos financieros y productos financieros, cruzados además
 *     entre sí.
 *
 * Ninguna se notaba mientras los roles estuvieran asignados. El día que
 * faltara uno —una empresa recién sembrada, un catálogo importado— el dinero
 * se iba a la cuenta de al lado sin que nada fallara.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el prefijo de cada red coincida con el grupo del agrupador que el plan
 * estándar asigna a ese rol. El plan es la autoridad; si allí cambia un
 * agrupador, esto lo exige aquí.
 * ============================================================================
 */

const MOTOR = join(__dirname, 'motor-contable.service.ts');

/** rol → grupo del agrupador («101.01» → «101»), según el plan estándar. */
const GRUPO_DEL_ROL = new Map<string, string>();
for (const cuenta of PLAN_CUENTAS_ESTANDAR) {
  if (!cuenta.rol) continue;
  const codigo = cuenta.codigoAgrupadorSAT ?? cuenta.numeroCuenta;
  GRUPO_DEL_ROL.set(String(cuenta.rol), codigo.split(/[.-]/)[0]);
}

interface Red {
  rol: string;
  prefijos: string[];
  linea: number;
}

/** El contenido entre los paréntesis de una llamada, contándolos. */
function argumentos(texto: string, desde: number): string {
  let nivel = 0;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '(') nivel++;
    else if (texto[i] === ')') {
      nivel--;
      if (nivel === 0) return texto.slice(desde + 1, i);
    }
  }
  return '';
}

function redes(texto: string): Red[] {
  const encontradas: Red[] = [];
  const LLAMADA = 'buscarCuentaPorRol(';
  for (
    let pos = texto.indexOf(LLAMADA);
    pos >= 0;
    pos = texto.indexOf(LLAMADA, pos + 1)
  ) {
    const frag = argumentos(texto, pos + LLAMADA.length - 1);
    const roles = [...frag.matchAll(/RolCuentaSistema\.(\w+)/g)].map(
      (r) => r[1],
    );
    const prefijos = [...frag.matchAll(/'(\d{1,3})'/g)].map((r) => r[1]);
    if (!roles.length || !prefijos.length) continue;
    const linea = texto.slice(0, pos).split('\n').length;
    /*
     * Una llamada con dos roles es un ternario —crédito o contado, utilidad o
     * pérdida—: lleva dos prefijos, uno por rama, y se comprueban los dos
     * contra los dos roles.
     */
    roles.forEach((rol, indice) => {
      encontradas.push({
        rol,
        prefijos: roles.length > 1 ? [prefijos[indice] ?? ''] : prefijos,
        linea,
      });
    });
  }
  return encontradas;
}

describe('Motor contable · la red de compatibilidad atrapa la cuenta correcta', () => {
  const texto = readFileSync(MOTOR, 'utf8');
  const todas = redes(texto);

  it('se encontraron redes que comprobar', () => {
    expect(todas.length).toBeGreaterThan(20);
  });

  it('cada red apunta al grupo que el plan estándar asigna a ese rol', () => {
    const malas: string[] = [];
    for (const red of todas) {
      const esperado = GRUPO_DEL_ROL.get(red.rol);
      /* Un rol sin cuenta en el plan no se puede comprobar aquí. */
      if (!esperado) continue;
      for (const prefijo of red.prefijos) {
        if (!prefijo) continue;
        if (prefijo !== esperado) {
          malas.push(
            `línea ${red.linea}: ${red.rol} cae en '${prefijo}' y su cuenta es del grupo '${esperado}'`,
          );
        }
      }
    }
    expect(malas.sort()).toEqual([]);
  });

  it('los roles que el motor usa tienen cuenta en el plan estándar', () => {
    /*
     * Un rol que ninguna cuenta lleva es un asiento que no se puede generar,
     * y sólo se descubre el día que alguien hace esa operación por primera
     * vez. Pasó con la baja de activos y con el arqueo de caja.
     */
    const sinCuenta = [
      ...new Set(todas.map((r) => r.rol).filter((r) => !GRUPO_DEL_ROL.has(r))),
    ];
    expect(sinCuenta.sort()).toEqual([]);
  });
});
