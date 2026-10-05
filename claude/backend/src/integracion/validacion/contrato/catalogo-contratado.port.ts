/*
 * ============================================================================
 * EL CATÁLOGO DE LO QUE LA EMPRESA CONTRATÓ
 * ----------------------------------------------------------------------------
 * POR QUÉ UN PUERTO Y NO UNA CONSULTA
 *
 * Abrir el vocabulario de pasos sólo sirve si alguien puede decir «esta empresa
 * contrató la verificación de domicilio». Ese catálogo **no es del ERP**: vive en
 * la suite de SUMA, en `permissionTypes` filtrado por lo que cada empresa compró,
 * junto con los contadores de consumo y las credenciales de los terceros. Y tiene
 * que seguir ahí: si viviera en el ERP, cada instalación necesitaría las
 * credenciales de Círculo de Crédito, del puente a RENAPO y de Auth0.
 *
 * Así que el ERP lo pregunta, y lo pregunta por un puerto, exactamente igual que
 * pregunta por un buró. El puerto permite tres cosas que una consulta directa no:
 *
 *  · que el motor se pruebe sin red;
 *  · que la implementación de hoy sea «no hay catálogo» y la de mañana sea la
 *    llamada a SUMA, sin tocar el motor;
 *  · que una instalación del ERP sin la suite contratada funcione igual, con el
 *    vocabulario reducido a lo que el portal trae escrito.
 *
 * LA IMPLEMENTACIÓN POR OMISIÓN DEVUELVE VACÍO, Y ESO ES LO SEGURO
 *
 * Sin catálogo, un tipo que el portal no conoce es **desconocido** —una errata— y
 * no se puede guardar. Es más estricto que el comportamiento final y es el lado
 * correcto del error: hoy nadie puede configurar un paso que el ERP no sepa
 * ejecutar, y el día que el catálogo responda, se podrá configurar con
 * `NO_DISPONIBLE` hasta que exista su evaluador.
 * ============================================================================
 */

export const PUERTO_CATALOGO_CONTRATADO = Symbol('PUERTO_CATALOGO_CONTRATADO');

export interface CatalogoContratadoPort {
  /**
   * Los códigos de tipo de validación que esta empresa contrató.
   *
   * Vacío significa «no se sabe» y «no hay», que para esta decisión son lo
   * mismo: en los dos casos no se puede afirmar que la empresa lo compró.
   */
  tiposContratados(empresaId: string): Promise<string[]>;
}

/**
 * Lo que hay hoy: ningún catálogo.
 *
 * No lanza ni registra advertencias. Un puerto sin proveedor que grita en cada
 * llamada enseña a la gente a ignorar el log, y aquí la ausencia de catálogo es
 * el estado normal de una instalación del ERP sin la suite de SUMA.
 */
export class CatalogoContratadoNoConfigurado implements CatalogoContratadoPort {
  async tiposContratados(): Promise<string[]> {
    return [];
  }
}
