// finanzas/data/plan-cuentas-estandar.ts
// ═══════════════════════════════════════════════════════════════════════
// Catálogo de cuentas contables ESTÁNDAR para precarga automática.
// Son las 7 cuentas mínimas que el motor contable necesita para generar
// pólizas de ventas, compras, inventario y mermas.
//
// Todas son AFECTABLES (esAfectable: true) porque reciben pólizas directas.
// El código agrupador SAT es orientativo; el usuario puede editarlo después.
// ═══════════════════════════════════════════════════════════════════════

import { NaturalezaCuenta, TipoCuenta } from '../entities/cuenta-contable.entity';

export interface CuentaEstandar {
  numeroCuenta: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
  esAfectable: boolean;
  codigoAgrupadorSAT?: string;
  // clave lógica para que el auto-mapeo de categorías sepa cuál es cuál
  rol:
    | 'CAJA'
    | 'INVENTARIO'
    | 'PROVEEDORES'
    | 'IVA_TRASLADADO'
    | 'VENTAS'
    | 'COSTO_VENTAS'
    | 'MERMAS';
}

export const PLAN_CUENTAS_ESTANDAR: CuentaEstandar[] = [
  {
    numeroCuenta: '110-01',
    nombre: 'Caja General',
    tipo: TipoCuenta.ACTIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '101.01',
    rol: 'CAJA',
  },
  {
    numeroCuenta: '130-01',
    nombre: 'Inventario de Mercancías',
    tipo: TipoCuenta.ACTIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '115.01',
    rol: 'INVENTARIO',
  },
  {
    numeroCuenta: '210-01',
    nombre: 'Proveedores',
    tipo: TipoCuenta.PASIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '201.01',
    rol: 'PROVEEDORES',
  },
  {
    numeroCuenta: '208-01',
    nombre: 'IVA Trasladado',
    tipo: TipoCuenta.PASIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '208.01',
    rol: 'IVA_TRASLADADO',
  },
  {
    numeroCuenta: '401-01',
    nombre: 'Ventas Nacionales',
    tipo: TipoCuenta.INGRESO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '401.01',
    rol: 'VENTAS',
  },
  {
    numeroCuenta: '501-01',
    nombre: 'Costo de Ventas',
    tipo: TipoCuenta.COSTO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '501.01',
    rol: 'COSTO_VENTAS',
  },
  {
    numeroCuenta: '601-01',
    nombre: 'Mermas y Pérdidas',
    tipo: TipoCuenta.GASTO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esAfectable: true,
    codigoAgrupadorSAT: '601.84',
    rol: 'MERMAS',
  },
];