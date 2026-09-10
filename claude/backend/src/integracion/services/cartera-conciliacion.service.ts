import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import { PUERTO_CARTERA_EXTERNA, TipoVinculo } from '../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { DiscrepanciaIntegracion } from '../entities/discrepancia-integracion.entity';
import { PuertoCarteraExterna } from '../ports/cartera-externa.port';
import { IntegracionModoService } from './integracion-modo.service';
import { IntegracionVinculosService } from './integracion-vinculos.service';

/**
 * Compara la cartera del ERP con la del registro externo, cliente por cliente.
 *
 * Es el instrumento que decide si la integración está lista. La regla operativa
 * no se negocia: una empresa no pasa de SOMBRA a AUTORIDAD mientras esta tabla
 * tenga discrepancias abiertas.
 */
@Injectable()
export class CarteraConciliacionService {
  private readonly logger = new Logger(CarteraConciliacionService.name);

  constructor(
    private readonly modos: IntegracionModoService,
    private readonly vinculos: IntegracionVinculosService,
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
    @InjectRepository(DiscrepanciaIntegracion)
    private readonly discrepancias: Repository<DiscrepanciaIntegracion>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
  ) {}

  @Cron('30 5 * * *', { name: 'cartera-conciliar' })
  async ejecutar(): Promise<void> {
    if (omitirTareaProgramada('cartera-conciliar')) return;
    if (!this.externa.configurado()) return;

    for (const empresa of await this.modos.empresasActivas()) {
      try {
        const resultado = await this.conciliarEmpresa(empresa.empresaId);
        this.logger.log(
          `Conciliación ${empresa.empresaId}: ${resultado.revisados} cliente(s), ${resultado.discrepancias} discrepancia(s).`,
        );
      } catch (error) {
        this.logger.error(
          `Falló la conciliación de ${empresa.empresaId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async conciliarEmpresa(
    empresaId: string,
  ): Promise<{ revisados: number; discrepancias: number }> {
    if (!this.externa.disponible()) {
      throw new Error('El registro externo de cartera no está disponible.');
    }

    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const tolerancia = Number(cfg?.toleranciaConciliacion ?? 1);
    const fechaCorte = new Date();

    let revisados = 0;
    let encontradas = 0;

    for (const vinculo of await this.vinculos.clientesVinculados(empresaId)) {
      if (!vinculo.idExterno) continue;
      revisados += 1;

      const [fila] = await this.discrepancias.manager.query(
        `SELECT COALESCE(SUM(c.saldopendiente), 0) AS saldo
           FROM creditos_clientes c
          WHERE c.empresaid = $1 AND c.clienteid = $2
            AND c.estado IN ('ACTIVO', 'VENCIDO')`,
        [empresaId, vinculo.entidadId],
      );
      const saldoErp = Number(fila?.saldo ?? 0);

      try {
        const remoto = await this.externa.resumenCliente(vinculo.idExterno);
        const diferencia = saldoErp - remoto.saldoTotal;
        if (Math.abs(diferencia) > tolerancia) {
          await this.registrar(empresaId, fechaCorte, {
            concepto: 'SALDO_CLIENTE',
            entidadId: vinculo.entidadId,
            valorErp: saldoErp,
            valorExterno: remoto.saldoTotal,
            detalle: `Diferencia de ${diferencia.toFixed(2)} sobre una tolerancia de ${tolerancia}.`,
          });
          encontradas += 1;
        }
      } catch (error) {
        await this.registrar(empresaId, fechaCorte, {
          concepto: 'CONSULTA_FALLIDA',
          entidadId: vinculo.entidadId,
          valorErp: saldoErp,
          valorExterno: 0,
          detalle: error instanceof Error ? error.message : String(error),
        });
        encontradas += 1;
      }
    }

    /*
     * ── Crédito por crédito ────────────────────────────────────────────────
     * La pasada por cliente compara totales, y dos errores que se cancelan
     * —uno de más aquí, uno de menos allá— dan un total idéntico. Esta segunda
     * pasada es la que de verdad prueba la correspondencia.
     */
    const creditos: Array<{ id: string; saldo: string; estado: string }> =
      await this.discrepancias.manager.query(
        `SELECT c.id, c.saldopendiente AS saldo, c.estado
           FROM creditos_clientes c
          WHERE c.empresaid = $1 AND c.estado IN ('ACTIVO', 'VENCIDO')`,
        [empresaId],
      );

    for (const credito of creditos) {
      const saldoErp = Number(credito.saldo ?? 0);
      const vinculo = await this.vinculos.buscar(
        empresaId,
        TipoVinculo.CREDITO,
        credito.id,
      );

      /*
       * Un crédito vivo del ERP sin vínculo es un hecho que no llegó al core.
       * No es un descuadre de importes: es una ausencia, y se reporta como tal
       * porque el remedio es otro —reenviar el evento, no ajustar un saldo—.
       */
      if (!vinculo?.idExterno) {
        await this.registrar(empresaId, fechaCorte, {
          concepto: 'SIN_CONTRAPARTE',
          entidadId: credito.id,
          valorErp: saldoErp,
          valorExterno: 0,
          detalle:
            'El crédito está vivo en el ERP y no tiene correspondencia en el registro externo.',
        });
        encontradas += 1;
        continue;
      }

      try {
        const remoto = await this.externa.saldoCredito(vinculo.idExterno);

        if (!remoto) {
          await this.registrar(empresaId, fechaCorte, {
            concepto: 'DESAPARECIDO',
            entidadId: credito.id,
            valorErp: saldoErp,
            valorExterno: 0,
            detalle: `El registro externo ya no conoce el crédito ${vinculo.idExterno}, pero el ERP lo tiene vivo.`,
          });
          encontradas += 1;
          continue;
        }

        const diferencia = saldoErp - remoto.saldoTotal;
        if (Math.abs(diferencia) > tolerancia) {
          await this.registrar(empresaId, fechaCorte, {
            concepto: 'SALDO_CREDITO',
            entidadId: credito.id,
            valorErp: saldoErp,
            valorExterno: remoto.saldoTotal,
            detalle:
              `Diferencia de ${diferencia.toFixed(2)} sobre una tolerancia de ${tolerancia}. ` +
              `Externo ${vinculo.idExterno}, estado ${remoto.estado || '—'}.`,
          });
          encontradas += 1;
        }

        /*
         * Un crédito vivo aquí y cerrado allá cuadra en importe cuando los dos
         * saldos son cero, y aun así es una divergencia real: el ERP seguiría
         * cobrando algo que el core da por terminado.
         */
        if (!remoto.activo) {
          await this.registrar(empresaId, fechaCorte, {
            concepto: 'ESTADO_DIVERGENTE',
            entidadId: credito.id,
            valorErp: saldoErp,
            valorExterno: remoto.saldoTotal,
            detalle: `El ERP lo tiene ${credito.estado} y el registro externo lo reporta como ${remoto.estado || 'no activo'}.`,
          });
          encontradas += 1;
        }
      } catch (error) {
        await this.registrar(empresaId, fechaCorte, {
          concepto: 'CONSULTA_FALLIDA',
          entidadId: credito.id,
          valorErp: saldoErp,
          valorExterno: 0,
          detalle: error instanceof Error ? error.message : String(error),
        });
        encontradas += 1;
      }
    }

    return { revisados: revisados + creditos.length, discrepancias: encontradas };
  }

  /** Discrepancias abiertas. Mientras haya, no se sube el modo a AUTORIDAD. */
  async abiertas(empresaId: string) {
    return this.discrepancias.find({
      where: { empresaId, resuelta: false },
      order: { fechaCorte: 'DESC' },
      take: 200,
    });
  }

  /**
   * Marca una discrepancia como revisada por una persona.
   *
   * La nota no es opcional por capricho: sin ella queda una fila resuelta sin
   * decir por qué, y quien la lea después no puede distinguir «se corrigió el
   * dato» de «era residuo de una prueba» ni de «se marcó para desbloquear
   * AUTORIDAD». Resolver sin motivo es exactamente lo que hace inútil a esta
   * tabla.
   */
  async marcarResuelta(id: string, empresaId: string, nota?: string): Promise<boolean> {
    const fila = await this.discrepancias.findOne({ where: { id, empresaId } });
    if (!fila) return false;
    fila.resuelta = true;
    // La nota se anexa al detalle: la fila conserva qué se vio y qué se decidió.
    if (nota?.trim()) {
      fila.detalle = `${fila.detalle ?? ''} · Resuelta: ${nota.trim()}`.slice(0, 1000);
    }
    await this.discrepancias.save(fila);
    return true;
  }

  private async registrar(
    empresaId: string,
    fechaCorte: Date,
    datos: {
      concepto: string;
      entidadId: string;
      valorErp: number;
      valorExterno: number;
      detalle: string;
    },
  ): Promise<void> {
    const llave = {
      empresaId,
      concepto: datos.concepto,
      entidadId: datos.entidadId,
    };

    /*
     * Si la misma diferencia sigue abierta, se ACTUALIZA en vez de insertar
     * otra. La primera versión insertaba siempre, y como conciliar no arregla
     * el dato —sólo lo mira—, cada corrida dejaba una copia más: a la semana,
     * un problema se vería como setenta.
     */
    const abierta = await this.discrepancias.findOne({
      where: { ...llave, resuelta: false },
    });
    if (abierta) {
      abierta.fechaCorte = fechaCorte;
      abierta.valorErp = datos.valorErp;
      abierta.valorExterno = datos.valorExterno;
      abierta.diferencia = datos.valorErp - datos.valorExterno;
      abierta.detalle = datos.detalle.slice(0, 1000);
      await this.discrepancias.save(abierta);
      return;
    }

    /*
     * Si ya se había resuelto y VUELVE, se abre de nuevo diciéndolo. Es
     * deliberado que reaparezca: resolver significa «alguien lo revisó», no
     * «ya no pasa». Si una resuelta silenciara la diferencia para siempre,
     * marcarla sería la forma más fácil de esconder un descuadre — y esta
     * tabla es la que decide si la empresa puede pasar a AUTORIDAD.
     */
    const previa = await this.discrepancias.findOne({
      where: { ...llave, resuelta: true },
      order: { fechaCorte: 'DESC' },
    });
    const detalle = previa
      ? `${datos.detalle} · Ya se había marcado como resuelta y la diferencia persiste.`
      : datos.detalle;

    await this.discrepancias.save(
      this.discrepancias.create({
        ...llave,
        fechaCorte,
        valorErp: datos.valorErp,
        valorExterno: datos.valorExterno,
        diferencia: datos.valorErp - datos.valorExterno,
        detalle: detalle.slice(0, 1000),
        resuelta: false,
      }),
    );
  }
}
