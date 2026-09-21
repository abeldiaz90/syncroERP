import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { AltaEmpresasService } from '../services/alta-empresas.service';
import { IdentidadEmpresaService } from '../../iam/services/identidad-empresa.service';

/**
 * ============================================================================
 * Aprovisionamiento · el ERP como EJECUTOR, no como administrador
 * ----------------------------------------------------------------------------
 * Quién es cliente de SUMA, qué contrata y quién puede entrar es una decisión
 * de SUMA, y se toma en su consola. El ERP no la toma ni la puede tomar: aquí
 * sólo se ejecuta lo ya decidido —crear la fila de la empresa, sembrar su
 * catálogo, apuntar qué inquilino le tocó—.
 *
 * Por eso NO hay pantalla y NO se entra con sesión de usuario. Existía una, y
 * era un error: dejaba que un administrador de la empresa operadora —gente que
 * entra todos los días a vender y a cobrar— diera de alta clientes. Convertía
 * a un inquilino del sistema en administrador de los demás inquilinos.
 *
 * La puerta es una clave de servicio en la cabecera, no un token de persona.
 * Es deliberado: una credencial de servicio no se hereda de una sesión robada,
 * no aparece en un navegador y no depende de qué roles se haya otorgado
 * alguien. Sin `APROVISIONAMIENTO_TOKEN` configurada, estas rutas responden 404
 * como si no existieran, que es el estado correcto para una instalación que
 * todavía no tiene consola.
 * ============================================================================
 */
@Controller('aprovisionamiento/empresas')
export class AltaEmpresasController {
  constructor(
    private readonly alta: AltaEmpresasService,
    private readonly cfg: ConfigService,
    private readonly identidades: IdentidadEmpresaService,
  ) {}

  /**
   * Comprueba la clave de servicio.
   *
   * La comparación recorre siempre la clave completa: salir en el primer
   * carácter distinto haría que el tiempo de respuesta revelara cuántos
   * caracteres se acertaron.
   */
  private exigirServicio(clave?: string): void {
    const esperada = (this.cfg.get<string>('APROVISIONAMIENTO_TOKEN') ?? '').trim();
    if (!esperada || esperada.length < 32) throw new NotFoundException();

    const dada = (clave ?? '').trim();
    if (dada.length !== esperada.length) throw new NotFoundException();
    let diferencia = 0;
    for (let i = 0; i < esperada.length; i += 1) {
      diferencia |= esperada.charCodeAt(i) ^ dada.charCodeAt(i);
    }
    if (diferencia !== 0) throw new NotFoundException();
  }

  @Public()
  @Get()
  async listar(@Headers('x-aprovisionamiento') clave?: string) {
    this.exigirServicio(clave);
    return {
      reserva: await this.alta.estadoReserva(),
      empresas: await this.alta.listar(),
    };
  }

  @Public()
  @Post()
  async crear(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Body()
    cuerpo: {
      nombreComercial?: string;
      rfc?: string;
      usaFineract?: boolean;
      /** Quién lo autorizó del lado de SUMA. Va a la bitácora. */
      solicitadoPor?: string;
      /** El administrador de la empresa cliente. Sin él nadie puede entrar. */
      administrador?: { correo?: string; nombre?: string; apellido?: string };
    },
  ) {
    this.exigirServicio(clave);
    if (!cuerpo?.solicitadoPor?.trim()) {
      /*
       * Se exige saber a nombre de quién se da el alta. Una credencial de
       * servicio dice QUÉ sistema llamó, no QUIÉN lo pidió, y una bitácora que
       * sólo dice «la consola» no sirve para auditar a nadie.
       */
      throw new ForbiddenException(
        'Falta indicar quién autoriza el alta del lado de SUMA (solicitadoPor).',
      );
    }
    return this.alta.crear({
      nombreComercial: String(cuerpo?.nombreComercial ?? ''),
      rfc: cuerpo?.rfc ?? null,
      usaFineract: cuerpo?.usaFineract === true,
      solicitadoPor: cuerpo.solicitadoPor.trim(),
      administrador: cuerpo?.administrador?.correo?.trim()
        ? {
            correo: cuerpo.administrador.correo.trim(),
            nombre: (cuerpo.administrador.nombre ?? '').trim(),
            apellido: (cuerpo.administrador.apellido ?? '').trim(),
          }
        : null,
    });
  }

  /**
   * Da administrador a una empresa que ya existe.
   *
   * Va por la misma puerta de servicio que el alta y exige lo mismo: saber
   * quién lo autoriza. Crear el acceso de una empresa es tan sensible como
   * crearla.
   */
  @Public()
  @Post(':empresaId/administrador')
  async asignarAdministrador(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body()
    cuerpo: {
      correo?: string;
      nombre?: string;
      apellido?: string;
      solicitadoPor?: string;
    },
  ) {
    this.exigirServicio(clave);
    if (!cuerpo?.solicitadoPor?.trim()) {
      throw new ForbiddenException(
        'Falta indicar quién autoriza el alta del lado de SUMA (solicitadoPor).',
      );
    }
    if (!cuerpo?.correo?.trim()) {
      throw new ForbiddenException('Falta el correo del administrador.');
    }
    return this.alta.asignarAdministrador({
      empresaId,
      correo: cuerpo.correo.trim(),
      nombre: (cuerpo.nombre ?? '').trim(),
      apellido: (cuerpo.apellido ?? '').trim(),
      solicitadoPor: cuerpo.solicitadoPor.trim(),
    });
  }

  @Public()
  @Get('reserva')
  async reserva(@Headers('x-aprovisionamiento') clave?: string) {
    this.exigirServicio(clave);
    return this.alta.estadoReserva();
  }

  @Public()
  @Post('reserva')
  async registrarReserva(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Body() cuerpo: { identificadores?: string[] },
  ) {
    this.exigirServicio(clave);
    return this.alta.registrarEnReserva(cuerpo?.identificadores ?? []);
  }

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * La identidad de la empresa · realm propio
   * --------------------------------------------------------------------------
   * Aquí la consola anota en qué directorio vive un cliente después de crearle
   * su realm. Es lo que hace que el ERP pueda recibir a alguien de un realm que
   * no conocía al arrancar, sin reiniciar y sin tocar ningún `.env`.
   *
   * Son DOS rutas y no una a propósito. Registrar deja la identidad en
   * APROVISIONANDO —existe, pero no abre ninguna puerta—; activar es el paso que
   * la enciende. Así un realm a medio armar no autentica a nadie, y quien
   * enciende sabe que lo está encendiendo.
   * ══════════════════════════════════════════════════════════════════════════
   */
  @Public()
  @Post(':empresaId/identidad')
  async registrarIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body()
    cuerpo: {
      emisor?: string;
      realm?: string;
      clientIdPublico?: string;
      clientIdServicio?: string;
      secretoServicio?: string;
      clientIdProvisionador?: string;
      secretoProvisionador?: string;
      dominiosPermitidos?: string;
      solicitadoPor?: string;
    },
  ) {
    this.exigirServicio(clave);
    if (!cuerpo?.solicitadoPor?.trim()) {
      throw new ForbiddenException(
        'Falta indicar quién autoriza el registro de identidad (solicitadoPor).',
      );
    }
    // Que la empresa exista se comprueba antes de escribir: una identidad
    // huérfana no la reclama nadie y no se ve en ninguna pantalla.
    await this.alta.estado(empresaId);
    return this.identidades.registrar({
      empresaId,
      emisor: String(cuerpo?.emisor ?? ''),
      realm: String(cuerpo?.realm ?? ''),
      clientIdPublico: String(cuerpo?.clientIdPublico ?? ''),
      clientIdServicio: cuerpo?.clientIdServicio ?? null,
      secretoServicio: cuerpo?.secretoServicio ?? null,
      clientIdProvisionador: cuerpo?.clientIdProvisionador ?? null,
      secretoProvisionador: cuerpo?.secretoProvisionador ?? null,
      dominiosPermitidos: cuerpo?.dominiosPermitidos ?? null,
      aprovisionadoPor: cuerpo.solicitadoPor.trim(),
    });
  }

  @Public()
  @Post(':empresaId/identidad/activar')
  async activarIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body() cuerpo: { solicitadoPor?: string },
  ) {
    this.exigirServicio(clave);
    if (!cuerpo?.solicitadoPor?.trim()) {
      throw new ForbiddenException(
        'Falta indicar quién autoriza la activación (solicitadoPor).',
      );
    }
    return this.identidades.activar(empresaId, cuerpo.solicitadoPor.trim());
  }

  @Public()
  @Post(':empresaId/identidad/suspender')
  async suspenderIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body() cuerpo: { solicitadoPor?: string },
  ) {
    this.exigirServicio(clave);
    if (!cuerpo?.solicitadoPor?.trim()) {
      throw new ForbiddenException(
        'Falta indicar quién autoriza la suspensión (solicitadoPor).',
      );
    }
    return this.identidades.suspender(empresaId, cuerpo.solicitadoPor.trim());
  }

  /** Qué identidad tiene una empresa. Nunca devuelve secretos. */
  @Public()
  @Get(':empresaId/identidad')
  async verIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
  ) {
    this.exigirServicio(clave);
    return this.identidades.resumen(empresaId);
  }

  @Public()
  @Get(':id/estado')
  async estado(
    @Param('id') id: string,
    @Headers('x-aprovisionamiento') clave?: string,
  ) {
    this.exigirServicio(clave);
    return this.alta.estado(id);
  }
}
