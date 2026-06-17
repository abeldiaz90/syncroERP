import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';

/**
 * Servicio de integración con Facturama PAC.
 * Docs: https://apisandbox.facturama.mx/docs
 */
@Injectable()
export class FacturamaService {
  private readonly logger = new Logger(FacturamaService.name);

  /** Construye un cliente HTTP autenticado para la empresa */
  private getClient(config: ConfiguracionFiscal): AxiosInstance {
    const baseURL = config.sandbox
      ? 'https://apisandbox.facturama.mx'
      : 'https://api.facturama.mx';

    const token = Buffer.from(
      `${config.facturamaUser}:${config.facturamaPassword}`
    ).toString('base64');

    return axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Timbra un CFDI 4.0 ante el SAT mediante Facturama.
   * Retorna el objeto de factura timbrada con UUID, XML y PDF.
   */
  async timbrarCFDI(config: ConfiguracionFiscal, payload: any): Promise<any> {
    const client = this.getClient(config);
    try {
      const { data } = await client.post('/api/3/cfdis', payload);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.Details?.[0]
        ?? error.response?.data?.Message
        ?? error.message
        ?? 'Error de comunicación con Facturama';
      this.logger.error(`Error timbrado: ${msg}`, error.response?.data);
      throw new BadRequestException(`Error al timbrar: ${msg}`);
    }
  }

  /**
   * Descarga el PDF o XML de una factura timbrada.
   * formato: 'pdf' | 'xml'
   */
  async descargarDocumento(
    config: ConfiguracionFiscal,
    facturamaId: string,
    formato: 'pdf' | 'xml',
  ): Promise<Buffer> {
    const client = this.getClient(config);
    try {
      const { data } = await client.get(
        `/api/Cfdi/${formato}/${facturamaId}`,
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(data);
    } catch (error: any) {
      throw new BadRequestException(`Error al descargar ${formato.toUpperCase()}`);
    }
  }

  /**
   * Cancela un CFDI ante el SAT.
   * motivo: 01=Comprobante con errores sin relación
   *         02=Comprobante con errores con relación
   *         03=No se llevó a cabo la operación
   *         04=Operación nominativa relacionada en la factura global
   */
  async cancelarCFDI(
    config: ConfiguracionFiscal,
    facturamaId: string,
    motivo: string,
    uuidSustitucion?: string,
  ): Promise<any> {
    const client = this.getClient(config);
    try {
      const params: any = { motive: motivo };
      if (uuidSustitucion) params.uuidReplacement = uuidSustitucion;

      const { data } = await client.delete(`/api/3/cfdis/${facturamaId}`, { params });
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.Message ?? error.message ?? 'Error al cancelar';
      throw new BadRequestException(`Error al cancelar: ${msg}`);
    }
  }

  /**
   * Envía el PDF y XML al correo del receptor.
   */
  async enviarPorCorreo(
    config: ConfiguracionFiscal,
    facturamaId: string,
    correo: string,
  ): Promise<void> {
    const client = this.getClient(config);
    try {
      await client.post(
        `/api/Cfdi/${facturamaId}/send/${encodeURIComponent(correo)}`
      );
    } catch (error: any) {
      this.logger.warn(`No se pudo enviar correo: ${error.message}`);
      // No lanzar error — el timbrado ya fue exitoso
    }
  }
}