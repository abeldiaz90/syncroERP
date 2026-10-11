import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { CentroCosto } from '../entities/centro-costo.entity';
import { TipoCuenta } from '../entities/cuenta-contable.entity';

/**
 * ============================================================================
 * A QUÉ CENTRO PERTENECE UNA PARTIDA, DICHO UNA SOLA VEZ
 * ----------------------------------------------------------------------------
 * Las pólizas nacen por tres caminos —la captura manual, la captura en
 * transacción y el motor contable—. Si esta regla viviera en cada uno, el día
 * que cambie habría que acordarse de los tres, y el tercero es el que se
 * olvida: es exactamente lo que pasó con el control de «la póliza no puede ser
 * de fecha futura», que se creía puesto en todos y cubría la minoría.
 *
 * Así que vive aquí, y los tres la llaman.
 *
 * ── QUÉ CUENTAS LO EXIGEN ─────────────────────────────────────────────────
 *
 * Sólo las de RESULTADO: ingreso, costo y gasto. Es la convención de todos los
 * ERP que llevan esta dimensión, y la razón es que el balance dice qué TIENE
 * la empresa y el resultado dice qué HIZO. «Qué hizo» sin decir dónde no
 * sirve para decidir nada; «qué tiene» no pertenece a ningún centro — el saldo
 * de un banco o el IVA por cobrar no son de la sucursal norte—. Exigirlo en
 * balance acabaría con todo el activo clasificado en un centro inventado
 * llamado «general», que es ruido con aspecto de dato.
 *
 * ── Y SÓLO CUANDO LA EMPRESA LOS USA ──────────────────────────────────────
 *
 * No hay interruptor: una empresa usa centros de costo cuando ha dado de alta
 * alguno que acepte movimientos. Mismo criterio que las posiciones de almacén.
 * Una instalación que nunca abrió el catálogo no nota que esto existe.
 * ============================================================================
 */
export const CUENTAS_QUE_EXIGEN_CENTRO: TipoCuenta[] = [
  TipoCuenta.INGRESO,
  TipoCuenta.COSTO,
  TipoCuenta.GASTO,
];

export async function laEmpresaLlevaCentros(
  em: EntityManager,
  empresaId: string,
): Promise<boolean> {
  const cuantos = await em.getRepository(CentroCosto).count({
    where: { empresaId, activo: true, aceptaMovimientos: true },
  });
  return cuantos > 0;
}

/**
 * Devuelve el centro ya validado, o lanza. **Nunca devuelve `null` por un dato
 * inválido**: un centro que no existe guardado como nulo es una partida mal
 * clasificada que nadie va a volver a mirar.
 */
export async function centroDeLaPartida(
  em: EntityManager,
  empresaId: string,
  datos: {
    centroCostoId?: string | null;
    tipoCuenta: TipoCuenta;
    cuenta?: string;
    /** Resuelto una vez por póliza y pasado aquí, para no contar en cada partida. */
    llevaCentros?: boolean;
  },
): Promise<string | null> {
  const lleva =
    datos.llevaCentros ?? (await laEmpresaLlevaCentros(em, empresaId));
  const exige = CUENTAS_QUE_EXIGEN_CENTRO.includes(datos.tipoCuenta) && lleva;

  if (!datos.centroCostoId) {
    if (!exige) return null;
    throw new BadRequestException(
      `La cuenta ${datos.cuenta ?? ''} es de resultado y esta empresa lleva centros de costo, ` +
        'así que la partida tiene que decir a cuál pertenece. Sin eso, el estado de resultados ' +
        'por centro no suma el total y nadie puede saber de dónde sale la diferencia.',
    );
  }

  const centro = await em
    .getRepository(CentroCosto)
    .findOne({ where: { id: datos.centroCostoId, empresaId } });

  if (!centro) {
    throw new BadRequestException(
      'El centro de costo de la partida no existe o pertenece a otra empresa.',
    );
  }
  if (!centro.activo) {
    throw new BadRequestException(
      `El centro de costo «${centro.nombre}» está desactivado y no admite movimientos nuevos.`,
    );
  }
  if (!centro.aceptaMovimientos) {
    throw new BadRequestException(
      `«${centro.nombre}» agrupa a otros centros: su saldo es la suma de ellos. ` +
        'Carga el movimiento a uno de los que cuelgan de él.',
    );
  }
  return centro.id;
}
