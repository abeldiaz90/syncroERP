import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { fechaCalendarioNegocio } from '../utils/business-time.util';

/**
 * ============================================================================
 * Un folio que una persona pueda decir por teléfono
 * ----------------------------------------------------------------------------
 * Hasta hoy, los documentos de compras no tenían folio. Lo que la pantalla
 * llamaba «OC-4F3A9C21» se calculaba al vuelo recortando los primeros ocho
 * caracteres del uuid, en 29 lugares del servidor y 11 pantallas, cada uno por
 * su cuenta.
 *
 * Eso tiene tres problemas, y el tercero es el que lo convierte en un defecto
 * de corrección y no de presentación:
 *
 *   1. No se puede decir por teléfono ni anotar en una factura. Un folio
 *      existe para que dos personas que no están en la misma pantalla puedan
 *      hablar del mismo documento.
 *   2. No se puede ordenar ni auditar. «¿Cuántas órdenes van este año?» no
 *      tiene respuesta si los folios son aleatorios, y un consecutivo con
 *      huecos es lo primero que busca un auditor.
 *   3. **No es único.** Ocho caracteres hexadecimales son 32 bits. Por la
 *      paradoja del cumpleaños, a los ~10,000 documentos ya hay cerca de 1%
 *      de probabilidad de que dos distintos muestren el mismo «folio», y a
 *      los ~77,000 es del 50%. Y nueve de los lugares que lo armaban están en
 *      el motor contable: la póliza referencia su documento de origen por ese
 *      recorte. Dos órdenes con el mismo folio en el rastro contable no es una
 *      incomodidad, es un asiento que no se puede amarrar a su origen.
 *
 * ## Cómo se entrega un número sin carreras
 *
 * Un `SELECT MAX(...) + 1` —que es lo que hacen los cuatro generadores que ya
 * existían en el ERP— tiene una carrera: dos altas simultáneas leen el mismo
 * máximo y se llevan el mismo folio. No se nota en pruebas, porque hace falta
 * que dos personas guarden en el mismo instante, y se nota el día que una
 * sucursal entera captura a la vez.
 *
 * Aquí se usa un `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, que en
 * Postgres es **una sola sentencia atómica**: la segunda transacción espera a
 * que la primera suelte la fila y entonces lee el valor ya incrementado. No
 * hay ventana entre leer y escribir porque no son dos pasos.
 *
 * ## Por qué se entrega dentro de la transacción del documento
 *
 * Porque así, si el alta del documento falla, el número **se devuelve**: la
 * transacción se revierte y la fila de la secuencia vuelve a su valor
 * anterior. El precio es que dos altas concurrentes del mismo tipo se
 * serializan hasta que la primera cierre, lo cual para volúmenes de compras es
 * irrelevante y para la integridad del consecutivo es lo correcto. Un folio
 * con huecos es lo primero que un auditor pregunta, y la respuesta «se
 * canceló» no sirve cuando no hay documento cancelado que mostrar.
 * ============================================================================
 */

/** Los prefijos. Son parte del contrato: se imprimen y se dicen en voz alta. */
export const TIPOS_DE_FOLIO = {
  REQUISICION: 'REQ',
  COTIZACION: 'COT',
  ORDEN_COMPRA: 'OC',
  RECEPCION: 'REC',
  PAGO_PROVEEDOR: 'PP',
} as const;

export type TipoDeFolio = (typeof TIPOS_DE_FOLIO)[keyof typeof TIPOS_DE_FOLIO];

/** Los dígitos del consecutivo. Seis aguanta un millón de documentos al año. */
const DIGITOS = 6;

/**
 * Da forma al folio. Única fuente de la forma: la migración que rellena hacia
 * atrás importa esta misma función para que lo viejo y lo nuevo se escriban
 * igual, sin dos implementaciones que puedan separarse.
 */
export function formatearFolio(
  tipo: string,
  anio: number,
  consecutivo: number,
): string {
  return `${tipo}-${anio}-${String(consecutivo).padStart(DIGITOS, '0')}`;
}

/** La expresión regular que reconoce un folio de esta familia. */
export const PATRON_DE_FOLIO = /^[A-Z]{2,16}-\d{4}-\d{6}$/;

/**
 * El folio de un documento, para mostrar.
 *
 * Devuelve el folio guardado y, sólo si no hay, el recorte del uuid de
 * siempre. El respaldo existe por una razón concreta y temporal: una
 * instalación que actualice el código antes de correr la migración tendría
 * `folio` nulo en todo, y dejar la pantalla en blanco sería cambiar un folio
 * malo por ninguno.
 *
 * No se guarda lo que devuelve esta función. Es presentación: el folio de
 * verdad lo reserva `siguiente()` al crear el documento.
 */
export function folioDe(
  documento: { folio?: string | null; id?: string | null } | null | undefined,
  tipo: string,
): string {
  const guardado = String(documento?.folio ?? '').trim();
  if (guardado) return guardado;
  const id = String(documento?.id ?? '');
  return id ? `${tipo}-${id.slice(0, 8).toUpperCase()}` : `${tipo}-?`;
}

@Injectable()
export class FoliosService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Entrega el siguiente folio del tipo y lo reserva.
   *
   * @param manager el `EntityManager` de la transacción del documento. Se pide
   *   explícitamente —y no se abre una transacción aquí— para que quede escrito
   *   en cada llamada que el número vive y muere con el documento.
   * @param instante el momento del documento, que decide el ejercicio. Se
   *   resuelve en la zona del negocio: un documento guardado a las 19:00 del 31
   *   de diciembre en México es del año que termina, no del siguiente, y con
   *   `getFullYear()` sobre un proceso en UTC habría sido del siguiente.
   */
  async siguiente(
    tipo: TipoDeFolio,
    empresaId: string,
    manager: EntityManager,
    instante: Date = new Date(),
  ): Promise<string> {
    const anio = Number(fechaCalendarioNegocio(instante).slice(0, 4));

    const filas = (await manager.query(
      `INSERT INTO folio_secuencias (empresaid, tipo, anio, ultimo)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (empresaid, tipo, anio)
       DO UPDATE SET ultimo = folio_secuencias.ultimo + 1
       RETURNING ultimo`,
      [empresaId, tipo, anio],
    )) as { ultimo: number | string }[];

    /* `Number()` siempre: un entero de Postgres puede llegar como texto. */
    const consecutivo = Number(filas?.[0]?.ultimo ?? 0);
    if (!Number.isInteger(consecutivo) || consecutivo < 1) {
      /*
       * No se devuelve un folio inventado. Un documento sin folio es un
       * problema visible; un documento con folio 0 o NaN es un problema que
       * alguien descubre al cerrar el año.
       */
      throw new Error(
        `No se pudo reservar un folio ${tipo} para el ejercicio ${anio}.`,
      );
    }

    return formatearFolio(tipo, anio, consecutivo);
  }
}
