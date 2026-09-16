import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import {
  PREFIJO_REFERENCIA_ERP,
  PUERTO_CARTERA_EXTERNA,
  TIPOS_TRANSACCION_PROPIOS_DEL_CORE,
  TIPOS_TRANSACCION_REFLEJABLES,
  TipoVinculo,
  tipoTransaccionNormalizado,
} from '../integracion.constants';
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

    /*
     * Lo que esta corrida vuelve a encontrar, y sobre qué entidades tuvo
     * opinión. Con las dos cosas se pueden cerrar solas las diferencias que
     * ya se arreglaron, sin cerrar a ciegas las de entidades que esta pasada
     * ni siquiera miró.
     */
    const vigentes = new Set<string>();
    const revisadas = new Set<string>();

    for (const vinculo of await this.vinculos.clientesVinculados(empresaId)) {
      if (!vinculo.idExterno) continue;
      revisados += 1;
      revisadas.add(vinculo.entidadId);

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
          await this.registrar(empresaId, fechaCorte, vigentes, {
            concepto: 'SALDO_CLIENTE',
            entidadId: vinculo.entidadId,
            valorErp: saldoErp,
            valorExterno: remoto.saldoTotal,
            detalle: `Diferencia de ${diferencia.toFixed(2)} sobre una tolerancia de ${tolerancia}.`,
          });
          encontradas += 1;
        }
      } catch (error) {
        await this.registrar(empresaId, fechaCorte, vigentes, {
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
    const creditos: Array<{
      id: string;
      saldo: string;
      estado: string;
      vencido: string;
    }> =
      await this.discrepancias.manager.query(
        /*
         * Los vivos, MÁS cualquiera que tenga una diferencia abierta.
         *
         * Sin la segunda mitad, una diferencia sobre un crédito que después
         * se liquida no se puede cerrar nunca: deja de revisarse justo cuando
         * habría que comprobar si se arregló, y se queda abierta para siempre
         * bloqueando el paso a AUTORIDAD. Lo que ya está señalado se sigue
         * mirando hasta que deje de estarlo.
         */
        `SELECT c.id, c.saldopendiente AS saldo, c.estado,
                COALESCE((SELECT SUM(q.montocuota - q.montopagado)
                            FROM amortizacion_cuotas q
                           WHERE q.creditoid = c.id
                             AND q.estado <> 'PAGADA'
                             AND q.fechavencimiento < CURRENT_DATE), 0) AS vencido
           FROM creditos_clientes c
          WHERE c.empresaid = $1
            AND (c.estado IN ('ACTIVO', 'VENCIDO')
                 OR c.id IN (SELECT d.entidadid
                               FROM integracion_discrepancias d
                              WHERE d.empresaid = $1 AND d.resuelta = false))`,
        [empresaId],
      );

    for (const credito of creditos) {
      const saldoErp = Number(credito.saldo ?? 0);
      revisadas.add(credito.id);
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
        await this.registrar(empresaId, fechaCorte, vigentes, {
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
          await this.registrar(empresaId, fechaCorte, vigentes, {
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
          await this.registrar(empresaId, fechaCorte, vigentes, {
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
        /*
         * «Vivo aquí y cerrado allá». Las dos mitades importan: comprobar
         * sólo que el externo no está activo marca como divergente un crédito
         * que también está liquidado aquí, es decir, dos sistemas que
         * coinciden. Esa diferencia falsa no se puede cerrar nunca, porque
         * vuelve a aparecer en cada corrida.
         */
        /*
         * Morosidad.
         *
         * Sin esto la conciliación es ciega a la mora: compara importes, y
         * dos sistemas pueden coincidir al centavo mientras uno da el crédito
         * por vencido y el otro por corriente. Eso cambia provisiones, buró y
         * a quién se le vuelve a prestar, así que es una divergencia tan real
         * como una de saldo —y hasta ahora no la veía nadie.
         */
        const vencidoErp = Number(credito.vencido ?? 0);
        const vencidoExterno = Number(remoto.saldoVencido ?? 0);
        if (Math.abs(vencidoErp - vencidoExterno) > tolerancia) {
          await this.registrar(empresaId, fechaCorte, vigentes, {
            concepto: 'MORA_DIVERGENTE',
            entidadId: credito.id,
            valorErp: vencidoErp,
            valorExterno: vencidoExterno,
            detalle:
              `El ERP reporta ${vencidoErp.toFixed(2)} vencido y el registro externo ${vencidoExterno.toFixed(2)}. ` +
              'Los saldos pueden cuadrar y aun así estar en desacuerdo sobre la mora.',
          });
          encontradas += 1;
        }

        const vivoEnElErp =
          credito.estado !== 'LIQUIDADO' && credito.estado !== 'CANCELADO';
        if (!remoto.activo && vivoEnElErp) {
          await this.registrar(empresaId, fechaCorte, vigentes, {
            concepto: 'ESTADO_DIVERGENTE',
            entidadId: credito.id,
            valorErp: saldoErp,
            valorExterno: remoto.saldoTotal,
            detalle: `El ERP lo tiene ${credito.estado} y el registro externo lo reporta como ${remoto.estado || 'no activo'}.`,
          });
          encontradas += 1;
        }

        encontradas += await this.revisarTransacciones(
          empresaId,
          fechaCorte,
          vigentes,
          credito.id,
          vinculo.idExterno,
        );
      } catch (error) {
        await this.registrar(empresaId, fechaCorte, vigentes, {
          concepto: 'CONSULTA_FALLIDA',
          entidadId: credito.id,
          valorErp: saldoErp,
          valorExterno: 0,
          detalle: error instanceof Error ? error.message : String(error),
        });
        encontradas += 1;
      }
    }

    await this.cerrarResueltas(empresaId, vigentes, revisadas);

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

  /**
   * Busca movimientos que ocurrieron en el registro externo y el ERP no sabe.
   *
   * El discriminador no es el importe ni la fecha, que es donde estas
   * comparaciones se rompen en cuanto dos relojes se separan: el ERP escribe
   * `syncro:<tipo>:<id>` como identificador externo en todo lo que origina, de
   * modo que una transacción sin ese prefijo nació fuera. Es exacto.
   *
   * Aquí sólo se detecta. Reflejarlo en el ERP es trabajo de otra pieza, y
   * debe entrar por los servicios del ERP con sus validaciones, nunca
   * escribiendo saldos a mano.
   */
  private async revisarTransacciones(
    empresaId: string,
    fechaCorte: Date,
    vigentes: Set<string>,
    creditoId: string,
    creditoIdExterno: string,
  ): Promise<number> {
    let encontradas = 0;
    let transacciones;
    try {
      transacciones = await this.externa.transaccionesCredito(creditoIdExterno);
    } catch (error) {
      await this.registrar(empresaId, fechaCorte, vigentes, {
        concepto: 'CONSULTA_FALLIDA',
        entidadId: creditoId,
        valorErp: 0,
        valorExterno: 0,
        detalle: `No se pudieron leer las transacciones del crédito externo ${creditoIdExterno}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return 1;
    }

    // Null es «el crédito ya no existe allá». La pasada del saldo ya lo
    // reportó como DESAPARECIDO; repetirlo aquí sólo duplicaría el hallazgo.
    if (!transacciones) return 0;

    for (const t of transacciones) {
      const propia = t.referenciaErp?.startsWith(PREFIJO_REFERENCIA_ERP) === true;

      /*
       * Una transacción del ERP que alguien reversó allá. El ERP la sigue
       * contando y el externo ya no: divergencia real, y de las peores,
       * porque los totales del cliente dejan de cuadrar sin que nadie haya
       * tocado el ERP.
       */
      if (propia && t.reversada) {
        /*
         * Puede ser el eco de nuestra propia cancelación: el ERP canceló el
         * pago, publicó la reversa, el externo la aplicó, y ahora vuelve a
         * nosotros con pinta de reversa ajena. Si el pago ya está cancelado
         * aquí, los dos lados coinciden y no hay nada que denunciar.
         */
        const pagoId = t.referenciaErp?.split(':').pop() ?? '';
        const [propio] = await this.discrepancias.manager.query(
          `SELECT cancelado FROM pagos_cobranza WHERE id = $1 AND empresaid = $2`,
          [pagoId, empresaId],
        );
        if (propio?.cancelado === true) continue;

        await this.registrar(empresaId, fechaCorte, vigentes, {
          concepto: 'TRANSACCION_REVERSADA_FUERA',
          entidadId: creditoId,
          valorErp: t.monto,
          valorExterno: 0,
          detalle: `La transacción ${t.idExterno} (${t.referenciaErp}) de ${t.monto.toFixed(2)} fue reversada en el registro externo el ${t.fecha}. El ERP la sigue dando por válida.`,
        });
        encontradas += 1;
        continue;
      }

      if (propia) continue;

      /*
       * Ya reflejada por el aplicador. Sigue sin llevar referencia del ERP
       * —su identificador en el core no se puede cambiar— así que la única
       * forma de no denunciarla para siempre es preguntar por el vínculo que
       * el aplicador dejó al aplicarla.
       */
      const yaReflejada = await this.vinculos.porIdExterno(
        empresaId,
        TipoVinculo.PAGO_COBRANZA,
        t.idExterno,
      );
      if (yaReflejada) continue;

      // Nació fuera y ya se deshizo allá: neta cero. No hay nada que
      // reflejar y denunciarlo sería ruido.
      if (t.reversada) continue;

      const tipo = tipoTransaccionNormalizado(t.tipo);
      if (TIPOS_TRANSACCION_PROPIOS_DEL_CORE.includes(tipo)) continue;

      if (!TIPOS_TRANSACCION_REFLEJABLES.includes(tipo)) {
        /*
         * No se ignora en silencio. Un tipo que no conocemos puede ser dinero
         * real; callarlo sería decidir que no lo es sin haberlo mirado.
         */
        await this.registrar(empresaId, fechaCorte, vigentes, {
          concepto: 'TIPO_EXTERNO_DESCONOCIDO',
          entidadId: creditoId,
          valorErp: 0,
          valorExterno: t.monto,
          detalle: `La transacción externa ${t.idExterno} es de tipo «${t.tipo}», que esta versión no sabe clasificar. Revisar si debe reflejarse en el ERP.`,
        });
        encontradas += 1;
        continue;
      }

      await this.registrar(empresaId, fechaCorte, vigentes, {
        concepto: 'TRANSACCION_EXTERNA',
        entidadId: creditoId,
        valorErp: 0,
        valorExterno: t.monto,
        detalle: `La transacción ${t.idExterno} de tipo ${tipo}, ${t.monto.toFixed(2)} el ${t.fecha}, se registró directamente en el externo y no está reflejada en el ERP.`,
      });
      encontradas += 1;
    }

    return encontradas;
  }

  /**
   * Cierra las diferencias que esta corrida ya no encuentra.
   *
   * Sin esto, una diferencia que se arregla sola —porque el reflejo aplicó el
   * pago que faltaba, por ejemplo— se queda abierta para siempre. Y no es
   * sólo ruido: mientras haya diferencias abiertas, la empresa no puede
   * promoverse a AUTORIDAD. Un tablero que nunca se vacía deja de leerse, y
   * entonces el que importa de verdad pasa desapercibido.
   *
   * Sólo se cierran las de entidades que esta pasada SÍ revisó. Un crédito
   * que dejó de revisarse —al liquidarse, por ejemplo— conserva las suyas: no
   * mirar algo no es lo mismo que comprobar que está bien, y confundirlo
   * sería la forma más silenciosa de perder un descuadre.
   */
  private async cerrarResueltas(
    empresaId: string,
    vigentes: Set<string>,
    revisadas: Set<string>,
  ): Promise<void> {
    if (!revisadas.size) return;

    const abiertas = await this.discrepancias.find({
      where: { empresaId, resuelta: false },
    });

    for (const d of abiertas) {
      if (!revisadas.has(d.entidadId)) continue;
      if (vigentes.has(`${d.concepto}|${d.entidadId}`)) continue;

      d.resuelta = true;
      // No hay columna de nota: se deja constancia en el detalle, que es lo
      // que alguien leerá al preguntarse por qué esta diferencia está cerrada.
      d.detalle = `${d.detalle ?? ''} | Cerrada automáticamente el ${new Date()
        .toISOString()
        .slice(0, 10)}: la conciliación revisó la entidad y ya no encuentra la diferencia.`.slice(
        0,
        1000,
      );
      await this.discrepancias.save(d);
    }
  }

  private async registrar(
    empresaId: string,
    fechaCorte: Date,
    vigentes: Set<string>,
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
    vigentes.add(`${datos.concepto}|${datos.entidadId}`);

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
