import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Conexión al servicio de Fineract. Sólo conexión: el grado de autoridad que se
 * le concede vive en el núcleo (`IntegracionModoService`), no aquí.
 *
 * Todo es opcional: si FINERACT_URL no está definida el adaptador queda inerte
 * y el ERP arranca igual que antes. Es deliberado — la integración no debe
 * poder impedir que el ERP inicie.
 */
@Injectable()
export class FineractConfig {
  private readonly logger = new Logger(FineractConfig.name);

  readonly url: string;
  readonly tenant: string;
  readonly oficinaPorDefecto: number;
  readonly monedaPorDefecto: string;
  readonly formatoFecha = 'yyyy-MM-dd';
  readonly localePorDefecto = 'es';

  /** Milisegundos que el POS está dispuesto a esperar a Fineract. */
  readonly timeoutPosMs: number;
  /** Milisegundos para llamadas de fondo (outbox, conciliación). */
  readonly timeoutFondoMs: number;

  /** Autenticación por client_credentials contra el mismo Keycloak del ERP. */
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuerUrl: string;

  /** Respaldo de autenticación básica, sólo para entornos locales. */
  readonly basicUser: string;
  readonly basicPassword: string;

  /**
   * Ruta al certificado de la autoridad que firma el de Fineract.
   *
   * Existe porque `NODE_EXTRA_CA_CERTS` sólo aplica al proceso que lo tenía en
   * su entorno al arrancar: un script lanzado en otra ventana no lo hereda, y
   * el diagnóstico fallaba por una razón que no tenía que ver con el enlace.
   * Leyéndolo aquí, la confianza viaja con la configuración y no con la
   * ventana desde la que se ejecuta.
   *
   * NO desactiva la verificación TLS: añade una autoridad de confianza.
   */
  readonly rutaCertificadoCA: string;

  readonly maxIntentosOutbox: number;

  /**
   * Nombre del bucket de morosidad de Fineract que se ata a cada producto que
   * el ERP crea alla.
   *
   * Se guarda el NOMBRE y no el id porque el id cambia entre instalaciones y
   * un id equivocado ata la cartera a una escala de mora que nadie reviso. El
   * adaptador lo resuelve consultando el catalogo.
   *
   * Importa mas de lo que parece: un producto sin bucket produce creditos que
   * reportan importe vencido correcto y NUNCA reportan dias de atraso, aunque
   * el cierre de dia corra todas las noches. Es un silencio, no un error.
   */
  readonly bucketMoraNombre: string;

  constructor(private readonly cfg: ConfigService) {
    this.url = (cfg.get<string>('FINERACT_URL') ?? '').replace(/\/$/, '');
    this.tenant = cfg.get<string>('FINERACT_TENANT') ?? 'default';
    this.oficinaPorDefecto = Number(cfg.get<string>('FINERACT_OFICINA_ID') ?? 1);
    this.monedaPorDefecto = cfg.get<string>('FINERACT_MONEDA') ?? 'MXN';


    this.timeoutPosMs = Number(cfg.get<string>('FINERACT_TIMEOUT_POS_MS') ?? 1200);
    this.timeoutFondoMs = Number(
      cfg.get<string>('FINERACT_TIMEOUT_FONDO_MS') ?? 15000,
    );

    this.issuerUrl = (
      cfg.get<string>('FINERACT_KEYCLOAK_ISSUER_URL') ??
      cfg.get<string>('KEYCLOAK_ISSUER_URL') ??
      ''
    ).replace(/\/$/, '');
    this.clientId = cfg.get<string>('FINERACT_CLIENT_ID') ?? '';
    this.clientSecret = cfg.get<string>('FINERACT_CLIENT_SECRET') ?? '';

    this.basicUser = cfg.get<string>('FINERACT_BASIC_USER') ?? '';
    this.basicPassword = cfg.get<string>('FINERACT_BASIC_PASSWORD') ?? '';
    this.rutaCertificadoCA = cfg.get<string>('FINERACT_CA_CERT') ?? '';

    this.maxIntentosOutbox = Number(
      cfg.get<string>('FINERACT_OUTBOX_MAX_INTENTOS') ?? 8,
    );

    this.bucketMoraNombre =
      cfg.get<string>('FINERACT_BUCKET_MORA') ?? 'Escala de mora SUMA';

    if (!this.habilitado) {
      this.logger.log(
        'Fineract no está configurado (falta FINERACT_URL). La integración queda inerte.',
      );
    } else {
      this.logger.log(
        `Fineract en ${this.url} · tenant ${this.tenant}`,
      );
    }
  }

  /** Hay a dónde llamar y con qué autenticarse. */
  get habilitado(): boolean {
    return (
      this.url.length > 0 &&
      (this.tieneOAuth || (!!this.basicUser && !!this.basicPassword))
    );
  }

  get tieneOAuth(): boolean {
    return !!this.issuerUrl && !!this.clientId && !!this.clientSecret;
  }

}
