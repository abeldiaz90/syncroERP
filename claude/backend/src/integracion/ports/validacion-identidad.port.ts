/**
 * Puerto de validación de identidad (KYC).
 *
 * Todavía no hay proveedor. Se declara ahora porque el motor de decisión de
 * crédito ya lo necesita como paso obligatorio, y porque definir la frontera
 * antes de elegir proveedor evita que el proveedor termine dictando el modelo
 * de dominio del ERP.
 *
 * Implementaciones previstas: INE/RENAPO vía el RPA de CURP que ya existe en
 * el ERP, prueba de vida biométrica, y validación documental de un tercero.
 */
export enum ResultadoIdentidad {
  VERIFICADA = 'VERIFICADA',
  RECHAZADA = 'RECHAZADA',
  /** Requiere revisión humana: el proveedor no fue concluyente. */
  INDETERMINADA = 'INDETERMINADA',
  /** Aún no se ha solicitado. */
  NO_INICIADA = 'NO_INICIADA',
}

export interface SolicitudValidacionIdentidad {
  empresaId: string;
  clienteId: string;
  nombre: string;
  rfc?: string | null;
  curp?: string | null;
  documentos?: { tipo: string; url: string }[];
}

export interface VeredictoIdentidad {
  resultado: ResultadoIdentidad;
  /** 0 a 100. Confianza del proveedor en la coincidencia. */
  puntaje: number;
  proveedor: string;
  referencia?: string | null;
  motivos: string[];
  verificadaEn?: Date | null;
}

export interface PuertoValidacionIdentidad {
  validar(
    solicitud: SolicitudValidacionIdentidad,
  ): Promise<VeredictoIdentidad>;
  consultar(
    empresaId: string,
    clienteId: string,
  ): Promise<VeredictoIdentidad | null>;
}

/**
 * Implementación por omisión mientras no haya proveedor contratado.
 *
 * Devuelve NO_INICIADA en lugar de VERIFICADA a propósito: un stub permisivo
 * es la clase de decisión que se olvida y termina autorizando crédito sin
 * validar a nadie. Que falle en cerrado obliga a configurarlo.
 */
export class ValidacionIdentidadNoConfigurada
  implements PuertoValidacionIdentidad
{
  async validar(): Promise<VeredictoIdentidad> {
    return {
      resultado: ResultadoIdentidad.NO_INICIADA,
      puntaje: 0,
      proveedor: 'ninguno',
      motivos: ['No hay proveedor de validación de identidad configurado.'],
      verificadaEn: null,
    };
  }

  async consultar(): Promise<VeredictoIdentidad | null> {
    return null;
  }
}
