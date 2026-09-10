/**
 * Plan contable mexicano inicial.
 *
 * A diferencia de la primera versión (14 cuentas), esta plantilla contiene
 * TODOS los códigos agrupadores publicados en el Anexo 24 de la RMF 2026.
 * El agrupador SAT sigue siendo un catálogo fiscal de referencia; aquí se
 * transforma además en una estructura contable utilizable por cada empresa:
 *
 * - las cuentas con hijos son cuentas de mayor (no afectables);
 * - las hojas son auxiliares afectables;
 * - cada cuenta conserva su código agrupador SAT;
 * - sólo las cuentas que usa automáticamente el ERP reciben rolSistema.
 *
 * El archivo fuente de los 1,080 agrupadores es generado y versionado. No se
 * copian a mano para evitar diferencias entre el catálogo fiscal y el plan.
 */
import {
  NaturalezaCuenta,
  RolCuentaSistema,
  TipoCuenta,
} from '../entities/cuenta-contable.entity';
import { CODIGOS_AGRUPADORES_SAT_2026 } from './catalogos-sat-2026';

export interface CuentaEstandar {
  numeroCuenta: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
  esAfectable: boolean;
  codigoAgrupadorSAT?: string;
  cuentaPadreNumero?: string | null;
  rol?: RolCuentaSistema;
  origen: 'SAT_2026' | 'SISTEMA';
}

const ROLES_POR_AGRUPADOR: Readonly<Record<string, RolCuentaSistema>> = {
  '101.01': RolCuentaSistema.CAJA,
  '102.01': RolCuentaSistema.BANCOS,
  '105.01': RolCuentaSistema.CLIENTES_CXC,
  '115.01': RolCuentaSistema.INVENTARIO,
  '118.01': RolCuentaSistema.IVA_ACREDITABLE_PAGADO,
  '119.01': RolCuentaSistema.IVA_ACREDITABLE_PENDIENTE,
  '201.01': RolCuentaSistema.PROVEEDORES,
  '206.01': RolCuentaSistema.SALDOS_FAVOR_CLIENTES,
  '208.01': RolCuentaSistema.IVA_TRASLADADO_COBRADO,
  '209.01': RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO,
  '401.01': RolCuentaSistema.VENTAS,
  '401.32': RolCuentaSistema.INTERESES,
  '501.01': RolCuentaSistema.COSTO_VENTAS,
  '601.84': RolCuentaSistema.MERMAS,
};

const CODIGOS: ReadonlySet<string> = new Set<string>(
  CODIGOS_AGRUPADORES_SAT_2026.map((entrada) => entrada.codigo),
);
const CON_HIJOS = new Set(
  CODIGOS_AGRUPADORES_SAT_2026.flatMap((entrada) => {
    const padre = resolverPadre(
      entrada.codigo,
      entrada.codigoPadre ? String(entrada.codigoPadre) : null,
    );
    return padre ? [padre] : [];
  }),
);

function resolverPadre(codigo: string, padreExplicito: string | null) {
  if (padreExplicito && CODIGOS.has(padreExplicito)) return padreExplicito;

  const punto = codigo.lastIndexOf('.');
  if (punto > 0) {
    const candidato = codigo.substring(0, punto);
    if (CODIGOS.has(candidato)) return candidato;
  }

  if (/^\d{3}$/.test(codigo)) {
    const raiz = `${codigo.charAt(0)}00`;
    if (codigo !== raiz && CODIGOS.has(raiz)) return raiz;
  }
  return null;
}

function tipoPorCodigo(codigo: string): TipoCuenta {
  if (codigo.startsWith('1')) return TipoCuenta.ACTIVO;
  if (codigo.startsWith('2')) return TipoCuenta.PASIVO;
  if (codigo.startsWith('3')) return TipoCuenta.CAPITAL;
  if (codigo.startsWith('4')) return TipoCuenta.INGRESO;
  if (codigo.startsWith('5')) return TipoCuenta.COSTO;
  if (codigo.startsWith('6')) return TipoCuenta.GASTO;
  if (codigo.startsWith('702') || codigo.startsWith('704')) {
    return TipoCuenta.INGRESO;
  }
  if (codigo.startsWith('7')) return TipoCuenta.GASTO;
  return TipoCuenta.ORDEN;
}

function naturalezaPorTipo(tipo: TipoCuenta) {
  return [TipoCuenta.PASIVO, TipoCuenta.CAPITAL, TipoCuenta.INGRESO].includes(
    tipo,
  )
    ? NaturalezaCuenta.ACREEDORA
    : NaturalezaCuenta.DEUDORA;
}

const CUENTAS_SAT: CuentaEstandar[] = CODIGOS_AGRUPADORES_SAT_2026.map(
  (entrada) => {
    const tipo = tipoPorCodigo(entrada.codigo);
    return {
      numeroCuenta: entrada.codigo,
      nombre: entrada.nombre,
      tipo,
      naturaleza: naturalezaPorTipo(tipo),
      esAfectable: entrada.nivel !== 0 && !CON_HIJOS.has(entrada.codigo),
      codigoAgrupadorSAT: entrada.codigo,
      cuentaPadreNumero: resolverPadre(
        entrada.codigo,
        entrada.codigoPadre ? String(entrada.codigoPadre) : null,
      ),
      rol: ROLES_POR_AGRUPADOR[entrada.codigo],
      origen: 'SAT_2026' as const,
    };
  },
);

/**
 * Cuenta técnica sin agrupador: sirve únicamente como contrapartida de la
 * póliza de apertura. No se presenta como agrupador fiscal.
 */
const CUENTAS_SISTEMA: CuentaEstandar[] = [
  {
    numeroCuenta: '399-01',
    nombre: 'Carga de saldos iniciales',
    tipo: TipoCuenta.CAPITAL,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    cuentaPadreNumero: null,
    rol: RolCuentaSistema.SALDOS_INICIALES,
    origen: 'SISTEMA',
  },
  {
    numeroCuenta: '401-HOTEL',
    nombre: 'Ingresos por hospedaje',
    tipo: TipoCuenta.INGRESO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '401.01',
    cuentaPadreNumero: '401',
    rol: RolCuentaSistema.INGRESOS_HOSPEDAJE,
    origen: 'SISTEMA',
  },
  {
    numeroCuenta: '213-ISH',
    nombre: 'Impuesto sobre hospedaje por pagar',
    tipo: TipoCuenta.PASIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '213.05',
    cuentaPadreNumero: '213',
    rol: RolCuentaSistema.IMPUESTO_HOSPEDAJE_POR_PAGAR,
    origen: 'SISTEMA',
  },
];

export const PLAN_CUENTAS_ESTANDAR: readonly CuentaEstandar[] = [
  ...CUENTAS_SAT,
  ...CUENTAS_SISTEMA,
];

export const TOTAL_CUENTAS_SAT_PLAN = CUENTAS_SAT.length;
