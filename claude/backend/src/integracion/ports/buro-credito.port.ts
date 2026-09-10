/**
 * Puerto de consulta a buró de crédito.
 *
 * Igual que el de identidad: la frontera se define antes de elegir proveedor.
 * En México la consulta requiere autorización firmada del cliente, así que el
 * contrato incluye la referencia de esa autorización — sin ella, la consulta
 * es ilegal y el puerto debe negarse a hacerla.
 */
export interface SolicitudBuro {
  empresaId: string;
  clienteId: string;
  rfc?: string | null;
  curp?: string | null;
  /** Folio de la autorización del titular. Obligatorio. */
  folioAutorizacion: string;
}

export interface ReporteBuro {
  disponible: boolean;
  /** Puntaje del proveedor, si lo entrega. */
  puntaje: number | null;
  /** Deuda total reportada con otras instituciones. */
  deudaTotal: number | null;
  /** Peor atraso histórico en días. */
  peorAtrasoDias: number | null;
  proveedor: string;
  consultadoEn: Date | null;
  motivos: string[];
}

export interface PuertoBuroCredito {
  consultar(solicitud: SolicitudBuro): Promise<ReporteBuro>;
}

export class BuroNoConfigurado implements PuertoBuroCredito {
  async consultar(): Promise<ReporteBuro> {
    return {
      disponible: false,
      puntaje: null,
      deudaTotal: null,
      peorAtrasoDias: null,
      proveedor: 'ninguno',
      consultadoEn: null,
      motivos: ['No hay proveedor de buró de crédito configurado.'],
    };
  }
}
