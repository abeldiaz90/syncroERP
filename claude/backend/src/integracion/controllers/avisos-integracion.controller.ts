import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { EstadoAviso } from '../entities/aviso-integracion.entity';
import { AvisosIntegracionService } from '../services/avisos-integracion.service';
import { ResolverAvisoDto } from '../dto/resolver-aviso.dto';

/**
 * ============================================================================
 * Avisos entrantes del registro externo
 * ----------------------------------------------------------------------------
 * Hasta ahora la integración era de un solo sentido. Ésta es la puerta de
 * regreso.
 *
 * La ruta de recepción es PÚBLICA porque el core llama sin credenciales del
 * ERP: el hook web de Fineract manda un POST y no negocia una sesión. Lo que la
 * protege es una clave larga en la dirección, que es donde se puede poner
 * —ese hook no permite encabezados propios—. Sin `FINERACT_WEBHOOK_TOKEN`
 * configurada la ruta contesta 404, como si no existiera: una integración a
 * medio configurar no debe dejar un buzón abierto.
 *
 * Responde 200 SIEMPRE que la clave sea válida, incluso ante un aviso que no
 * entiende. Un receptor que devuelve errores hace que el core acumule fallos de
 * entrega y termine desactivando el hook, y entonces se pierden los avisos que
 * sí importaban. El aviso se guarda; entenderlo es problema de este lado.
 * ============================================================================
 */
@Controller('integracion/avisos')
export class AvisosIntegracionController {
  constructor(private readonly avisos: AvisosIntegracionService) {}

  @Public()
  @Post(':clave')
  @HttpCode(200)
  async recibir(
    @Param('clave') clave: string,
    @Req() peticion: Request,
    @Headers('x-fineract-entity') entidad?: string,
    @Headers('x-fineract-action') accion?: string,
    @Headers('fineract-platform-tenantid') tenant?: string,
  ) {
    if (!this.avisos.claveValida(clave)) throw new NotFoundException();

    /*
     * El cuerpo llega ya interpretado por Nest, pero para la huella hace falta
     * el texto exacto: dos avisos distintos pueden producir el mismo objeto si
     * se reordenan las llaves, y la huella tiene que distinguirlos.
     */
    const cuerpo = peticion.body as unknown;
    const cuerpoTexto = (() => {
      try {
        return typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo ?? null);
      } catch {
        return '';
      }
    })();

    const resultado = await this.avisos.recibir({
      // Un aviso sin encabezados de entidad se guarda igual, marcado como
      // desconocido: perderlo sería perder la única señal de que llegó.
      entidad: entidad?.trim() || 'DESCONOCIDA',
      accion: accion?.trim() || 'DESCONOCIDA',
      tenant: tenant?.trim() || null,
      cuerpo,
      cuerpoTexto,
    });

    return { recibido: true, duplicado: resultado.duplicado, estado: resultado.estado };
  }

  /*
   * ORDEN. Todo lo que sea una ruta FIJA tiene que declararse antes que
   * `:clave`, porque Nest resuelve por orden de declaración y `:clave` acepta
   * cualquier cosa: con «huerfanos» declarado después, la petición entraba como
   * si «huerfanos» fuera la clave, no coincidía, y contestaba 404 —un 404 que
   * parecía decir «no hay avisos huérfanos» cuando en realidad decía «esa ruta
   * no existe»—.
   */
  /**
   * Avisos que no se pudieron atribuir a ninguna empresa.
   *
   * Son los más interesantes: significan que existe en el core un recurso que
   * el ERP nunca creó. Van aparte porque no tienen empresa por la cual
   * filtrarlos, y por eso quedan sólo para administración.
   */
  @Get('huerfanos')
  @Roles('administrador')
  async huerfanos(@Query('limite') limite?: string) {
    /*
     * Se devuelve la FICHA, no el cuerpo del aviso.
     *
     * Un aviso queda huérfano precisamente cuando su identificador externo no
     * se pudo atribuir a una empresa, o apunta a más de una. Es decir: cuando
     * es probable que el cuerpo describa a un cliente, un crédito o un pago de
     * OTRO inquilino. Entregar ese JSON crudo —nombres, montos, folios— al
     * administrador de cualquier empresa es una fuga entre clientes, y no hace
     * falta para lo que esta pantalla sirve: saber que existe algo en el core
     * que el ERP no creó, y cuándo llegó.
     *
     * El contenido completo sigue en la base para SUMA, que es quien opera la
     * integración y quien puede mirar entre inquilinos.
     */
    const avisos = await this.avisos.listarHuerfanos(Number(limite ?? 100));
    return {
      avisos: avisos.map((a) => ({
        id: a.id,
        proveedor: a.proveedor,
        entidad: a.entidad,
        accion: a.accion,
        tenant: a.tenant,
        idExterno: a.idExterno,
        estado: a.estado,
        recibidoEn: a.recibidoEn,
        diagnostico: a.diagnostico,
        error: a.error,
        detalle:
          'El contenido del aviso no se muestra aquí: un aviso sin empresa atribuida puede describir a un cliente de otro inquilino.',
      })),
    };
  }


  /** Comprobación de la dirección. Fineract la usa antes de guardar el hook. */
  @Public()
  @Get(':clave')
  comprobar(@Param('clave') clave: string) {
    if (!this.avisos.claveValida(clave)) throw new NotFoundException();
    return { receptor: 'listo' };
  }

  // ── Consulta y resolución, ya con sesión del ERP ──────────────────────────

  @Get()
  // `CONTABILIDAD` no es un rol del catálogo —el rol se llama `contador`—, así
  // que al encender el guardia habría dejado fuera justo a quien conciliaba.
  @Roles('administrador', 'direccion', 'contador')
  async listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoAviso,
    @Query('limite') limite?: string,
  ) {
    return {
      resumen: await this.avisos.resumen(empresaId),
      avisos: await this.avisos.listar(empresaId, estado, Number(limite ?? 100)),
    };
  }

  @Patch(':id/resolver')
  // `CONTABILIDAD` no es un rol del catálogo —el rol se llama `contador`—, así
  // que al encender el guardia habría dejado fuera justo a quien conciliaba.
  @Roles('administrador', 'direccion', 'contador')
  async resolver(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
    @Body() cuerpo: ResolverAvisoDto,
  ) {
    /*
     * La decisión viaja ya validada por el DTO: es obligatoria, sólo admite
     * los dos valores, y descartar exige nota. Antes se derivaba con
     * `cuerpo?.decision === 'DESCARTADO' ? 'DESCARTADO' : 'PROCESADO'`, así
     * que un cuerpo vacío o un dedazo marcaban el aviso como PROCESADO sin
     * que nadie hubiera decidido nada.
     */
    const aviso = await this.avisos.resolver(
      id,
      empresaId,
      usuarioId,
      cuerpo.decision,
      cuerpo.nota,
    );
    if (!aviso) throw new NotFoundException('No existe ese aviso en esta empresa.');
    return aviso;
  }
}
