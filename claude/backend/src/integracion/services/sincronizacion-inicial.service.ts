import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModoCartera, TipoVinculo } from '../integracion.constants';
import { VinculoIntegracion } from '../entities/vinculo-integracion.entity';
import { CarteraPublicadorService } from './cartera-publicador.service';
import { IntegracionModoService } from './integracion-modo.service';

export interface InformeSincronizacionInicial {
  simulacion: boolean;
  modoCartera: ModoCartera;
  clientes: number;
  creditos: number;
  pagos: number;
  /** Lo que NO se va a sincronizar, y por qué. */
  excluidos: { entidad: string; id: string; motivo: string }[];
}

/**
 * Pone al día el registro externo con lo que el ERP ya tenía.
 *
 * Existe porque encender un eje NO es retroactivo: los productores consultan
 * el modo efectivo antes de encolar, así que todo lo ocurrido con el eje
 * apagado no dejó rastro y no hay nada que lo recupere. Un cliente que contrata
 * Fineract después de llevar meses vendiendo a crédito arrancaría con el core
 * permanentemente atrasado, y además no podría promoverse nunca a AUTORIDAD,
 * porque esa promoción se rechaza con discrepancias abiertas.
 *
 * Es un paso EXPLÍCITO y no un efecto secundario de cambiar el modo. En un
 * cliente real esto puede mover miles de eventos, y eso no debe ocurrir porque
 * alguien tocó un selector en una pantalla. Por eso trae simulación: primero
 * se ve qué haría, después se hace.
 */
@Injectable()
export class SincronizacionInicialService {
  private readonly logger = new Logger(SincronizacionInicialService.name);

  constructor(
    private readonly modos: IntegracionModoService,
    private readonly cartera: CarteraPublicadorService,
    @InjectRepository(VinculoIntegracion)
    private readonly vinculos: Repository<VinculoIntegracion>,
  ) {}

  async sincronizar(
    empresaId: string,
    opciones: { simular?: boolean } = {},
  ): Promise<InformeSincronizacionInicial> {
    const simulacion = opciones.simular === true;
    const modoCartera = await this.modos.modoDe(empresaId);
    const informe: InformeSincronizacionInicial = {
      simulacion,
      modoCartera,
      clientes: 0,
      creditos: 0,
      pagos: 0,
      excluidos: [],
    };

    // Con el eje apagado no hay nada que poner al día: el externo no debe
    // enterarse de esta empresa.
    if (modoCartera === ModoCartera.APAGADO) return informe;

    const manager = this.vinculos.manager;

    /*
     * Créditos vivos que nunca llegaron al externo.
     *
     * Se excluyen a propósito los que tienen ajustes por devolución: el
     * externo se originaría por el importe completo y el ajuste que lo bajó no
     * viaja con él, así que el préstamo nacería descuadrado. Más vale dejarlo
     * fuera y decirlo que crear una contraparte que nunca va a cuadrar.
     */
    const creditos: Array<{ id: string; clienteid: string; ajustes: string }> =
      await manager.query(
        `SELECT c.id, c.clienteid, c.montoajustesdevolucion AS ajustes
           FROM creditos_clientes c
          WHERE c.empresaid = $1
            AND c.estado IN ('ACTIVO', 'VENCIDO')
            AND NOT EXISTS (SELECT 1 FROM integracion_vinculos v
                             WHERE v.empresaid = c.empresaid
                               AND v.tipo = $2
                               AND v.entidadid = c.id)
          ORDER BY c.fechacreacion ASC`,
        [empresaId, TipoVinculo.CREDITO],
      );

    const sincronizables = creditos.filter(c => {
      if (Number(c.ajustes ?? 0) > 0) {
        informe.excluidos.push({
          entidad: 'CREDITO',
          id: c.id,
          motivo:
            'Tiene ajustes por devolución. Originarlo en el externo lo crearía por el importe completo y nacería descuadrado. Requiere decidir cómo se traslada la devolución.',
        });
        return false;
      }
      return true;
    });

    /*
     * Clientes de esos créditos que aún no existen allá. Van primero: un
     * préstamo no se puede originar sobre un cliente que el externo no conoce.
     */
    const clientes = new Set<string>();
    for (const c of sincronizables) {
      const vinculo = await this.vinculos.findOne({
        where: { empresaId, tipo: TipoVinculo.CLIENTE, entidadId: c.clienteid },
      });
      if (!vinculo?.idExterno) clientes.add(c.clienteid);
    }

    for (const clienteId of clientes) {
      if (!simulacion) await this.cartera.clienteAlta(empresaId, clienteId);
      informe.clientes += 1;
    }

    for (const c of sincronizables) {
      if (!simulacion) await this.cartera.creditoOriginado(empresaId, c.id);
      informe.creditos += 1;
    }

    /*
     * Y los pagos ya aplicados, en orden. Sin ellos el préstamo externo
     * nacería por el importe original y el saldo no coincidiría con el del
     * ERP: la conciliación abriría una discrepancia por cada crédito que se
     * acaba de sincronizar, que es peor que no haber sincronizado.
     */
    if (sincronizables.length) {
      const ids = sincronizables.map(c => c.id);
      const pagos: Array<{
        id: string;
        creditoid: string;
        montopagado: string;
        fechapago: Date;
        referencia: string | null;
      }> = await manager.query(
        `SELECT p.id, p.creditoid, p.montopagado, p.fechapago, p.referencia
           FROM pagos_cobranza p
          WHERE p.empresaid = $1 AND p.creditoid = ANY($2::uuid[])
          ORDER BY p.fechapago ASC, p.fechacreacion ASC`,
        [empresaId, ids],
      );

      for (const p of pagos) {
        if (!simulacion) {
          await this.cartera.pagoRegistrado(empresaId, {
            pagoId: p.id,
            creditoId: p.creditoid,
            monto: Number(p.montopagado),
            fechaPago: p.fechapago,
            referencia: p.referencia,
          });
        }
        informe.pagos += 1;
      }
    }

    if (!simulacion) {
      this.logger.log(
        `Sincronización inicial ${empresaId}: ${informe.clientes} cliente(s), ${informe.creditos} crédito(s), ${informe.pagos} pago(s), ${informe.excluidos.length} excluido(s).`,
      );
    }

    return informe;
  }
}
