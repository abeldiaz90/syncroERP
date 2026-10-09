import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Venta } from '../entities/venta.entity';
import { Empresa } from '../../iam/entities/empresa.entity';
import {
  AnchoPapel,
  ImpresoraCaja,
  ModoImpresion,
} from '../../caja/entities/impresora-caja.entity';
import { ImpresoraTermicaService } from './impresora-termica.service';
import { armarTicket } from './ticket-escpos';

/**
 * ============================================================================
 * Imprimir el ticket de una venta
 * ----------------------------------------------------------------------------
 * LO QUE DECIDE ESTE SERVICIO
 *
 *   1. En qué impresora: la de la caja donde se cobró, y si esa caja no tiene
 *      declarada la suya, la de la empresa.
 *   2. Qué dice el papel: lo arma el servidor con lo que está guardado, no con
 *      lo que tenía la pantalla. Un ticket que repite lo que creía el navegador
 *      puede decir un precio que no se cobró.
 *   3. Si es original o reimpresión, contando las veces que ya salió.
 *
 * LO QUE NO DECIDE
 *
 * Si la venta vale. Cuando esto corre, la venta ya está hecha. **Nada de aquí
 * puede deshacerla**, y por eso ningún camino lanza una excepción hacia la
 * venta: se devuelve si se imprimió y, si no, por qué, para que la caja lo
 * enseñe y siga cobrando.
 *
 * EL MODO NAVEGADOR NO ES UN FALLO
 *
 * Una caja con impresora USB no se alcanza desde el servidor y eso no es un
 * error que haya que arreglar: es una configuración legítima. Se contesta
 * `modo: 'NAVEGADOR'` y el punto de venta abre el ticket y lo manda con el
 * diálogo de siempre. Confundir las dos cosas llenaría la pantalla del cajero
 * de avisos rojos por algo que funciona.
 * ============================================================================
 */

export interface RespuestaImpresion {
  modo: ModoImpresion;
  impreso: boolean;
  reimpresion: boolean;
  motivo?: string;
  /** Dónde se intentó, para que el aviso diga algo útil. */
  impresora?: string;
}

@Injectable()
export class ImpresionTicketsService {
  private readonly logger = new Logger(ImpresionTicketsService.name);

  constructor(
    @InjectRepository(Venta) private readonly ventaRepo: Repository<Venta>,
    @InjectRepository(Empresa) private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(ImpresoraCaja)
    private readonly impresoraRepo: Repository<ImpresoraCaja>,
    private readonly termica: ImpresoraTermicaService,
  ) {}

  /**
   * La impresora que le toca a una caja.
   *
   * Primero la suya; si no la declaró, la de la empresa; y si no hay ninguna,
   * `null`, que se trata como NAVEGADOR —lo que había antes— y no como avería.
   */
  async impresoraDe(
    empresaId: string,
    cuentaCajaId?: string | null,
  ): Promise<ImpresoraCaja | null> {
    if (cuentaCajaId) {
      const propia = await this.impresoraRepo.findOne({
        where: { empresaId, cuentaCajaId, activo: true },
      });
      if (propia) return propia;
    }
    return this.impresoraRepo.findOne({
      where: { empresaId, cuentaCajaId: IsNull(), activo: true },
    });
  }

  async imprimirVenta(
    ventaId: string,
    empresaId: string,
  ): Promise<RespuestaImpresion> {
    const venta = await this.ventaRepo.findOne({
      where: { id: ventaId, empresaId },
      relations: ['cliente', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');

    const impresora = await this.impresoraDe(empresaId, venta.cuentaBancariaId);

    /*
     * La cuenta de impresiones sube SIEMPRE que se pide el ticket, salga o no.
     * Si sólo subiera cuando sale, un cajero podría pedir el mismo ticket diez
     * veces con la impresora apagada y, al encenderla, llevarse diez
     * originales.
     */
    const yaSalio = (venta.impresionesTicket ?? 0) > 0;
    await this.ventaRepo.increment({ id: venta.id }, 'impresionesTicket', 1);

    if (!impresora || impresora.modo === ModoImpresion.NAVEGADOR) {
      return {
        modo: ModoImpresion.NAVEGADOR,
        impreso: false,
        reimpresion: yaSalio,
      };
    }
    if (impresora.modo === ModoImpresion.NINGUNA) {
      return {
        modo: ModoImpresion.NINGUNA,
        impreso: false,
        reimpresion: yaSalio,
      };
    }

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });

    const bytes = armarTicket({
      empresa: {
        nombreComercial: empresa?.nombreComercial ?? '',
        rfc: empresa?.rfc ?? null,
        direccion: empresa?.direccion ?? null,
        ciudad: empresa?.ciudad ?? null,
        estado: empresa?.estado ?? null,
        codigoPostal: empresa?.codigoPostal ?? null,
      },
      folio: venta.folio,
      fecha: venta.fechaVenta ?? new Date(),
      cajero:
        (venta.usuario as { nombreCompleto?: string; email?: string } | undefined)
          ?.nombreCompleto ??
        (venta.usuario as { email?: string } | undefined)?.email ??
        null,
      cliente: venta.cliente
        ? {
            nombre:
              (venta.cliente as { nombre?: string }).nombre ?? 'Público general',
            rfc: (venta.cliente as { rfc?: string }).rfc ?? null,
          }
        : null,
      renglones: (venta.detalles ?? []).map((d) => ({
        nombre:
          (d.producto as { nombre?: string } | undefined)?.nombre ?? 'Artículo',
        sku: (d.producto as { sku?: string } | undefined)?.sku ?? null,
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        descuento: Number(d.descuento ?? 0),
        subtotal: Number(d.subtotal),
      })),
      subtotal: Number(venta.subtotal),
      descuento: Number(venta.descuento),
      impuestoTotal: Number(venta.impuestoTotal),
      total: Number(venta.total),
      metodoPago: String(venta.metodoPago),
      montoRecibido:
        venta.montoRecibido === undefined || venta.montoRecibido === null
          ? null
          : Number(venta.montoRecibido),
      cambio: venta.cambio === undefined ? null : Number(venta.cambio),
      saldoFavorAplicado: Number(venta.saldoFavorAplicado ?? 0),
      notas: venta.notas ?? null,
      pie: impresora.pie,
      reimpresion: yaSalio,
      ancho: impresora.ancho || AnchoPapel.MM80,
      abrirCajon: impresora.abrirCajon && String(venta.metodoPago) === 'EFECTIVO',
    });

    let resultado = await this.termica.enviar(
      impresora.host ?? '',
      impresora.puerto,
      bytes,
    );

    /*
     * Las copias son un número, no un bucle infinito: si la primera no salió,
     * no se insiste. Una impresora apagada no se arregla mandándole tres veces
     * lo mismo, y el cajero espera tres plazos en vez de uno.
     */
    if (resultado.impreso && impresora.copias > 1) {
      for (let i = 1; i < Math.min(impresora.copias, 3); i++) {
        const copia = await this.termica.enviar(
          impresora.host ?? '',
          impresora.puerto,
          bytes,
        );
        if (!copia.impreso) {
          resultado = copia;
          break;
        }
      }
    }

    await this.impresoraRepo.update(
      { id: impresora.id },
      {
        ultimoIntento: new Date(),
        ultimoExito: resultado.impreso,
        ultimoMotivo: resultado.motivo?.slice(0, 300) ?? null,
      },
    );

    if (!resultado.impreso) {
      this.logger.warn(
        `Ticket de la venta ${venta.folio} sin imprimir en ${impresora.host}: ${resultado.detalle ?? resultado.motivo}`,
      );
    }

    return {
      modo: ModoImpresion.RED,
      impreso: resultado.impreso,
      reimpresion: yaSalio,
      motivo: resultado.motivo,
      impresora: impresora.host ?? impresora.nombre,
    };
  }

  /**
   * Una página de prueba, para enchufar la impresora sin tener que vender.
   *
   * Existe porque la alternativa es configurar la caja y descubrir el error
   * con el primer cliente enfrente.
   */
  async probar(
    empresaId: string,
    cuentaCajaId?: string | null,
  ): Promise<RespuestaImpresion> {
    const impresora = await this.impresoraDe(empresaId, cuentaCajaId);
    if (!impresora || impresora.modo !== ModoImpresion.RED) {
      return {
        modo: impresora?.modo ?? ModoImpresion.NAVEGADOR,
        impreso: false,
        reimpresion: false,
        motivo:
          'Esta caja no imprime por red; el ticket se manda desde el navegador.',
      };
    }

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    const bytes = armarTicket({
      empresa: {
        nombreComercial: empresa?.nombreComercial ?? 'SyncroERP',
        rfc: empresa?.rfc ?? null,
      },
      folio: '000000',
      fecha: new Date(),
      cajero: 'Prueba de impresora',
      renglones: [
        {
          nombre: 'Página de prueba',
          cantidad: 1,
          precioUnitario: 0,
          subtotal: 0,
        },
      ],
      subtotal: 0,
      descuento: 0,
      impuestoTotal: 0,
      total: 0,
      metodoPago: 'EFECTIVO',
      pie:
        'Si lees esto, la impresora de esta caja está lista. ' +
        'Comprueba que los acentos salgan bien: áéíóú ñÑ.',
      ancho: impresora.ancho || AnchoPapel.MM80,
      /* En una prueba el cajón no se abre: nadie está vendiendo. */
      abrirCajon: false,
    });

    const resultado = await this.termica.enviar(
      impresora.host ?? '',
      impresora.puerto,
      bytes,
    );

    await this.impresoraRepo.update(
      { id: impresora.id },
      {
        ultimoIntento: new Date(),
        ultimoExito: resultado.impreso,
        ultimoMotivo: resultado.motivo?.slice(0, 300) ?? null,
      },
    );

    return {
      modo: ModoImpresion.RED,
      impreso: resultado.impreso,
      reimpresion: false,
      motivo: resultado.motivo,
      impresora: impresora.host ?? impresora.nombre,
    };
  }
}
