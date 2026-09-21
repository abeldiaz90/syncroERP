import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';
import { IntegracionModoService } from './integracion-modo.service';
import { ContextoInquilinoService } from './contexto-inquilino.service';

export interface AccesoExterno {
  disponible: boolean;
  url: string | null;
  tenant: string | null;
  /**
   * La sesión no se transfiere con un token en la URL: el destino autentica
   * contra el mismo Keycloak y reconoce la sesión del navegador.
   */
  autenticacion: 'keycloak-sso';
  motivo?: string;
}

/**
 * Acceso a la interfaz web del registro externo desde el ERP.
 *
 * Sólo lo ven las empresas que contrataron el módulo. No se emite ningún token
 * ni se pasa credencial por la URL: el destino comparte Keycloak con el ERP, así
 * que basta con que el navegador ya tenga sesión. Firmar una URL de acceso
 * sería inventar un segundo mecanismo de autenticación al lado del que ya
 * existe, y el segundo siempre es el que se rompe.
 */
@Injectable()
export class AccesoExternoService {
  constructor(
    private readonly inquilinos: ContextoInquilinoService,
    private readonly config: ConfigService,
    private readonly modos: IntegracionModoService,
  ) {}

  async para(empresaId: string): Promise<AccesoExterno> {
    // El predicado vive en `IntegracionModoService`: aquí había una copia, y
    // dos copias de la misma regla se separan el día que alguien toca una.
    if (!(await this.modos.usaRegistroExterno(empresaId))) {
      throw new ForbiddenException(
        'Esta empresa no tiene contratado el registro financiero externo.',
      );
    }

    const url = (this.config.get<string>('FINERACT_WEB_APP_URL') ?? '').trim();
    if (!url) {
      return {
        disponible: false,
        url: null,
        tenant: null,
        autenticacion: 'keycloak-sso',
        motivo:
          'Falta configurar FINERACT_WEB_APP_URL con la dirección de la interfaz web.',
      };
    }

    return {
      disponible: true,
      url: url.replace(/\/$/, ''),
      /*
       * El inquilino de ESTA empresa, no el global. Devolver el global abría el
       * portal del core en la base de otro cliente: la persona entraba y veía
       * una cartera que no es la suya.
       */
      tenant:
        (await this.inquilinos.inquilinoDe(empresaId)) ??
        (this.config.get<string>('FINERACT_TENANT') ?? 'default'),
      autenticacion: 'keycloak-sso',
    };
  }
}
