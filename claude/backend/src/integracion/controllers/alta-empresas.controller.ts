import {
  BadRequestException,
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
import {
  AsignarAdministradorDto,
  CrearEmpresaDto,
  RegistrarIdentidadDto,
  RegistrarReservaDto,
  SolicitadoPorDto,
} from '../dto/alta-empresas.dto';
import { AltaEmpresasService } from '../services/alta-empresas.service';
import { IdentidadEmpresaService } from '../../iam/services/identidad-empresa.service';
import { revisarRfc } from '../../common/utils/rfc.util';

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
  /**
   * El id de empresa que llega por la ruta tiene forma de GUID.
   *
   * No es formalidad: ese valor va a un `where` y a escrituras, y aquí no hay
   * DTO que lo valide porque viene del path. Un parámetro con otra forma sólo
   * puede venir de una llamada mal construida o de alguien probando, y en los
   * dos casos un 400 claro es mejor que una consulta.
   */
  private exigirGuid(empresaId: string): void {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        (empresaId ?? '').trim(),
      )) {
      throw new BadRequestException('El identificador de empresa no es válido.');
    }
  }

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
    @Body() cuerpo: CrearEmpresaDto,
  ) {
    this.exigirServicio(clave);
    /*
     * `solicitadoPor` ya no se comprueba a mano: lo exige el DTO, que además lo
     * acota en largo. Se exige saber a nombre de quién se da el alta porque una
     * credencial de servicio dice QUÉ sistema llamó, no QUIÉN lo pidió, y una
     * bitácora que sólo dice «la consola» no sirve para auditar a nadie.
     */
    /*
     * ──────────────────────────────────────────────────────────────────────
     * EL RFC, COMPROBADO AQUI Y NO EL DIA DEL PRIMER TIMBRADO
     *
     * Entraba tal cual desde la consola y se guardaba sin que lo mirara nadie
     * en ninguna de las tres capas. Es la identidad fiscal que va en CADA CFDI
     * de esa empresa: un error no falla al dar de alta, falla meses despues,
     * con facturas ya emitidas que hay que cancelar.
     *
     * Se comprueba forma y fecha; no el digito verificador, cuyo algoritmo
     * rechaza RFC legitimos anteriores a la homoclave. Ver `rfc.util`.
     *
     * Vacio se sigue aceptando: una empresa puede darse de alta antes de que
     * su RFC se conozca. Lo que no se acepta es uno equivocado.
     * ──────────────────────────────────────────────────────────────────────
     */
    const rfcCrudo = String(cuerpo?.rfc ?? '').trim();
    let rfc: string | null = null;
    if (rfcCrudo) {
      const veredicto = revisarRfc(rfcCrudo);
      if (!veredicto.valido) {
        throw new BadRequestException(veredicto.motivo);
      }
      rfc = veredicto.normalizado;
    }

    return this.alta.crear({
      nombreComercial: String(cuerpo?.nombreComercial ?? ''),
      rfc,
      usaFineract: cuerpo?.usaFineract === true,
      solicitadoPor: cuerpo.solicitadoPor,
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
    @Body() cuerpo: AsignarAdministradorDto,
  ) {
    this.exigirServicio(clave);
    this.exigirGuid(empresaId);
    return this.alta.asignarAdministrador({
      empresaId,
      correo: cuerpo.correo,
      nombre: cuerpo.nombre ?? '',
      apellido: cuerpo.apellido ?? '',
      solicitadoPor: cuerpo.solicitadoPor,
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
    @Body() cuerpo: RegistrarReservaDto,
  ) {
    this.exigirServicio(clave);
    return this.alta.registrarEnReserva(cuerpo.identificadores);
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
    @Body() cuerpo: RegistrarIdentidadDto,
  ) {
    this.exigirServicio(clave);
    this.exigirGuid(empresaId);
    // Que la empresa exista se comprueba antes de escribir: una identidad
    // huérfana no la reclama nadie y no se ve en ninguna pantalla.
    await this.alta.estado(empresaId);
    return this.identidades.registrar({
      empresaId,
      emisor: cuerpo.emisor,
      realm: cuerpo.realm,
      clientIdPublico: cuerpo.clientIdPublico,
      clientIdServicio: cuerpo.clientIdServicio ?? null,
      secretoServicio: cuerpo.secretoServicio ?? null,
      clientIdProvisionador: cuerpo.clientIdProvisionador ?? null,
      secretoProvisionador: cuerpo.secretoProvisionador ?? null,
      dominiosPermitidos: cuerpo.dominiosPermitidos ?? null,
      aprovisionadoPor: cuerpo.solicitadoPor,
    });
  }

  @Public()
  @Post(':empresaId/identidad/activar')
  async activarIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body() cuerpo: SolicitadoPorDto,
  ) {
    this.exigirServicio(clave);
    return this.identidades.activar(empresaId, cuerpo.solicitadoPor);
  }

  @Public()
  @Post(':empresaId/identidad/suspender')
  async suspenderIdentidad(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('empresaId') empresaId: string,
    @Body() cuerpo: SolicitadoPorDto,
  ) {
    this.exigirServicio(clave);
    return this.identidades.suspender(empresaId, cuerpo.solicitadoPor);
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

  /**
   * Qué le falta a una empresa para poder operar, todo en una respuesta.
   *
   * La identidad se junta AQUÍ y no dentro del servicio de alta para no atar el
   * módulo de integración al de identidades por una lectura. Se junta, eso sí:
   * que la consola tenga que hacer dos llamadas y unirlas a mano es justo el
   * trabajo que esta pantalla existe para quitar.
   */
  @Public()
  @Get(':id/estado')
  async estado(
    @Param('id') id: string,
    @Headers('x-aprovisionamiento') clave?: string,
  ) {
    this.exigirServicio(clave);
    const estado = await this.alta.estado(id);
    let identidad: Awaited<ReturnType<IdentidadEmpresaService['resumen']>> | null =
      null;
    let motivoIdentidad: string | null = null;
    try {
      identidad = await this.identidades.resumen(id);
    } catch (error) {
      motivoIdentidad = error instanceof Error ? error.message : String(error);
    }
    return { ...estado, identidad, motivoIdentidad };
  }

  /**
   * Siembra el catálogo de una empresa que se quedó sin él.
   *
   * El alta lo siembra FUERA de su transacción a propósito —deshacer el alta
   * entera por un catálogo dejaría un inquilino de la reserva consumido y
   * perdido—, así que puede fallar con la empresa ya creada. Antes eso sólo
   * constaba en el registro del servidor; ahora el alta lo dice y esto lo
   * arregla sin que nadie entre al ERP de la empresa a capturar productos.
   */
  @Public()
  @Post(':id/catalogo')
  async sembrarCatalogo(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: SolicitadoPorDto,
  ) {
    this.exigirServicio(clave);
    return this.alta.sembrarCatalogoDe(id);
  }

  /**
   * Entrega un inquilino de la reserva a una empresa que contrató el core y no
   * tiene ninguno.
   *
   * La lista de pendientes aconsejaba «reponer la reserva y asignar uno» desde
   * el principio, y asignar uno no se podía por ninguna vía que no fuera
   * escribir en la base de datos. Ésta es la puerta que faltaba.
   */
  @Public()
  @Post(':id/inquilino')
  async asignarInquilino(
    @Headers('x-aprovisionamiento') clave: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: SolicitadoPorDto,
  ) {
    this.exigirServicio(clave);
    return this.alta.asignarInquilino(id, cuerpo.solicitadoPor);
  }
}
