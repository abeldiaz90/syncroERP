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
  /*
   * Lo que no es de la operación: la utilidad o la pérdida al dar de baja un
   * activo, y el faltante o el sobrante de un arqueo de caja.
   *
   * Los dos roles existían en el enum y NINGUNA cuenta los tenía asignados, así
   * que `buscarCuentaPorRol` devolvía null y los asientos que dependen de ellos
   * no se podían generar. No se notaba porque nadie había dado de baja un
   * activo todavía.
   */
  '403.01': RolCuentaSistema.OTROS_INGRESOS,
  '703.21': RolCuentaSistema.OTROS_GASTOS,
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

/**
 * ============================================================================
 * Las cuentas complementarias van al revés de su tipo
 * ----------------------------------------------------------------------------
 * La naturaleza se derivaba SÓLO del tipo: activo y costo, deudoras; pasivo,
 * capital e ingreso, acreedoras. Es cierto salvo para las cuentas
 * complementarias, que pertenecen al mismo tipo que la cuenta que corrigen y
 * tienen la naturaleza contraria. La depreciación acumulada es de ACTIVO y
 * tiene saldo ACREEDOR; las devoluciones sobre ventas son de INGRESO y tienen
 * saldo DEUDOR.
 *
 * Con la regla vieja, 66 cuentas del catálogo SAT quedaron declaradas al
 * revés: los seis grupos de estimaciones y depreciaciones acumuladas (108,
 * 116, 171, 172, 183, 189), las devoluciones sobre ventas (402) y las
 * devoluciones sobre compras (503).
 *
 * Importa porque `naturaleza` es lo que decide el SIGNO con que cada cuenta se
 * presenta. En la balanza, la depreciación acumulada de mobiliario salía como
 * −450 —un activo en negativo— en vez de 450 acreedor, que es lo que es. Un
 * contador lo ve en el primer vistazo, y con razón desconfía del resto del
 * renglón.
 *
 * Los grupos se nombran por su código, que es el del catálogo del SAT y no
 * cambia, y no por su nombre, que sí.
 * ============================================================================
 */
/*
 * Se exporta para que otras piezas puedan preguntarlo: el motor contable usa
 * prefijos de agrupador como red de compatibilidad cuando una cuenta no tiene
 * su rol asignado, y una red que apunte a un grupo complementario abona los
 * ingresos a la cuenta que los resta.
 */
export const GRUPOS_COMPLEMENTARIOS = [
  '108', // Estimación de cuentas incobrables      (complementaria de activo)
  '116', // Estimación de inventarios obsoletos    (complementaria de activo)
  '171', // Depreciación acumulada de activos fijos
  '172', // Pérdida por deterioro acumulado de activos fijos
  '183', // Amortización acumulada de activos diferidos
  '189', // Estimación por deterioro de inversiones permanentes
  '402', // Devoluciones y descuentos sobre ingresos (complementaria de ingreso)
  '503', // Devoluciones y descuentos sobre compras  (complementaria de costo)
];

function esComplementaria(codigo: string, nombre: string): boolean {
  const raiz = codigo.split(/[.-]/)[0];
  if (GRUPOS_COMPLEMENTARIOS.includes(raiz)) return true;
  /*
   * Las cuentas de orden van en pares: una lleva el saldo y la otra, llamada
   * «Contra cuenta …», lo compensa. Ahí el nombre sí es el criterio, porque el
   * catálogo no las distingue por código.
   */
  return codigo.startsWith('8') && /^contra cuenta\b/i.test(nombre.trim());
}

function naturalezaDeCuenta(
  codigo: string,
  nombre: string,
  tipo: TipoCuenta,
): NaturalezaCuenta {
  const base = naturalezaPorTipo(tipo);
  if (!esComplementaria(codigo, nombre)) return base;
  return base === NaturalezaCuenta.DEUDORA
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
      naturaleza: naturalezaDeCuenta(entrada.codigo, entrada.nombre, tipo),
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
