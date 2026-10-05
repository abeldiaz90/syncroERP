import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * ============================================================================
 * Quien cobra no podía contar su propia caja
 * ----------------------------------------------------------------------------
 * MEDIDO EL 29-SEP-2026, por pantalla, con la sesión de `empleado`
 *
 * «Caja, corte y arqueo» pedía `GET /credito/cuentas-bancarias` —el catálogo
 * completo de cuentas, con CLABE y números de cuenta—. A `empleado` ese
 * endpoint le está vedado a propósito, y la plantilla lo razona:
 *
 *     accionesVedadas: ['GET /credito/cuentas-bancarias']
 *     «No necesita las cuentas bancarias de la empresa […]: números de cuenta
 *      y CLABE a la vista de quien atiende al público.»
 *
 * Esa decisión es correcta. Lo que estaba mal es que la pantalla no pedía otra
 * cosa. El mostrador —el único puesto que cobra efectivo, y que tiene el
 * módulo `caja` CONCEDIDO— abría la pantalla, leía «El catálogo de cajas no
 * está en tu perfil» y ahí se acababa: no podía abrir el turno, ni registrar
 * una entrada o un retiro, ni cerrarlo. El corte de caja era imposible
 * justo para quien maneja el dinero.
 *
 * La pantalla degradaba con elegancia —eso se arregló el 25-sep para el
 * contador— y por eso no parecía una avería: parecía una decisión. Es la
 * familia de siempre, otra vez: una ausencia que se lee como si alguien la
 * hubiera resuelto.
 *
 * QUÉ SE HIZO
 *
 * La pantalla pide `…/para-cobro`, que devuelve id, nombre y tipo y nada más.
 * No se le concedió nada nuevo a nadie: se dejó de exigir de más.
 *
 * LO QUE VIGILA ESTA PRUEBA
 *
 * Dos mitades, porque el defecto vivía en la juntura y cada mitad por separado
 * se veía sana:
 *
 *  1. La plantilla: quien tiene el módulo `caja` en ESCRITURA tiene que poder
 *     listar cajas. Si mañana alguien veda `…/para-cobro` para un rol que
 *     opera una caja, o se lo quita sin dárselo por módulo, esto falla aquí y
 *     no seis meses después en el mostrador de un cliente.
 *  2. La pantalla: que siga pidiendo la lista corta. Volver a pedir el
 *     catálogo completo reproduce el defecto exacto.
 *
 * Los roles que tienen `caja` sólo en CONSULTA —cobranza, gerencia,
 * dirección— miran turnos ajenos y no arquean, así que no entran en la regla
 * 1: se les exige menos a propósito.
 * ============================================================================
 */

const CORTA = 'GET /credito/cuentas-bancarias/para-cobro';
const COMPLETA = 'GET /credito/cuentas-bancarias';

const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  // src/iam/data → src/iam → src → backend → claude, y ahí vive `frontend`.
  .map((nombre) => join(__dirname, '..', '..', '..', '..', nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const PANTALLA = 'app/dashboard/tesoreria/caja/page.tsx';

/** Quita comentarios: una prueba que mide la prosa no mide el código. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const operanCaja = PLANTILLAS_PERMISOS.filter((p) => p.modulos.includes('caja'));

describe('Caja · quien opera una caja puede listarla', () => {
  it('hay roles que operan caja, y el mostrador es uno', () => {
    // Si esta lista se vacía, las reglas de abajo pasarían sin medir nada.
    expect(operanCaja.length).toBeGreaterThan(0);
    expect(operanCaja.map((p) => p.rol)).toContain('empleado');
  });

  it.each(operanCaja.map((p) => [p.rol, p] as const))(
    '«%s» puede pedir la lista corta de cajas',
    (_rol, plantilla) => {
      const vedadas = plantilla.accionesVedadas ?? [];
      expect(vedadas).not.toContain(CORTA);

      const porModulo = [
        ...plantilla.modulos,
        ...(plantilla.modulosConsulta ?? []),
      ].includes('credito');
      const declarada = (plantilla.accionesIrrenunciables ?? []).includes(CORTA);

      // Una de las dos vías basta; ninguna de las dos es el defecto.
      expect(porModulo || declarada).toBe(true);
    },
  );

  it('al mostrador se le sigue vedando el catálogo COMPLETO', () => {
    /*
     * El arreglo no consistió en abrirle las cuentas bancarias. Si algún día
     * alguien «resuelve» esto concediéndole el catálogo entero, CLABE incluida,
     * esta prueba lo dice.
     */
    const mostrador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'empleado');

    expect(mostrador?.accionesVedadas ?? []).toContain(COMPLETA);
    expect(mostrador?.accionesIrrenunciables ?? []).toContain(CORTA);
  });
});

describe('Caja · la pantalla de arqueo pide lo poco que necesita', () => {
  it('encuentra el frontend y la pantalla', () => {
    expect(FRONTEND).toBeDefined();
    expect(existsSync(join(FRONTEND as string, PANTALLA))).toBe(true);
  });

  it('pide la lista corta', () => {
    const codigo = sinComentarios(
      readFileSync(join(FRONTEND as string, PANTALLA), 'utf8'),
    );

    expect(codigo).toMatch(/['"]\/credito\/cuentas-bancarias\/para-cobro['"]/);
  });

  it('y no depende únicamente del catálogo completo', () => {
    /*
     * El respaldo al catálogo completo se conserva —hay roles que lo tienen y
     * podrían no tener el corto—, pero no puede ser la ÚNICA fuente: eso es
     * exactamente lo que dejaba al mostrador sin cajas.
     */
    const codigo = sinComentarios(
      readFileSync(join(FRONTEND as string, PANTALLA), 'utf8'),
    );

    const pideCompleta = /['"]\/credito\/cuentas-bancarias['"]/.test(codigo);
    const pideCorta = /['"]\/credito\/cuentas-bancarias\/para-cobro['"]/.test(
      codigo,
    );

    expect(pideCompleta && !pideCorta).toBe(false);
  });
});
