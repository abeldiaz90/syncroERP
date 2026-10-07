import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import {
  EstadoEventoIntegracion,
  ModoContabilidad,
  PUERTO_CONTABILIDAD_EXTERNA,
  TipoEventoIntegracion,
  TipoVinculo,
} from '../integracion.constants';
import { PuertoContabilidadExterna } from '../ports/contabilidad-externa.port';
import { VinculoIntegracion } from '../entities/vinculo-integracion.entity';
import { MapeoCuentaExterna } from '../entities/mapeo-cuenta-externa.entity';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { AvisoIntegracion, EstadoAviso } from '../entities/aviso-integracion.entity';
import { EventoIntegracion } from '../entities/evento-integracion.entity';
import { IntegracionModoService } from './integracion-modo.service';

/**
 * Corta en el último espacio, no a media palabra. Un mensaje técnico cortado en
 * «for a future » se lee como un error del sistema, no como una explicación.
 */
function recortarEnPalabra(texto: string, maximo: number): string {
  const limpio = texto.trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, maximo);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > maximo * 0.6 ? corte.slice(0, espacio) : corte).replace(/[.,;:\s]+$/, '')}…`;
}

export interface HallazgoContable {
  polizaId: string;
  folio: string;
  asientoId: string | null;
  codigo: string;
  detalle: string;
}

/** Revisa solamente el universo enviado: no presupone saldos de apertura. */
@Injectable()
export class ContabilidadConciliacionService {
  private readonly logger = new Logger(ContabilidadConciliacionService.name);
  private ejecutando = false;
  constructor(
    @Inject(PUERTO_CONTABILIDAD_EXTERNA) private readonly externa: PuertoContabilidadExterna,
    private readonly modos: IntegracionModoService,
    @InjectRepository(VinculoIntegracion) private readonly vinculos: Repository<VinculoIntegracion>,
    @InjectRepository(Poliza) private readonly polizas: Repository<Poliza>,
    @InjectRepository(MapeoCuentaExterna) private readonly mapeos: Repository<MapeoCuentaExterna>,
    @InjectRepository(ConfiguracionIntegracionEmpresa) private readonly configuraciones: Repository<ConfiguracionIntegracionEmpresa>,
    @InjectRepository(AvisoIntegracion) private readonly avisos: Repository<AvisoIntegracion>,
    /*
     * La cola de salida. Se mira para distinguir «no salió y hay que hacer
     * algo» de «no salió TODAVÍA, y ya se sabe por qué». Ver `porQueNoSalio`.
     */
    @InjectRepository(EventoIntegracion)
    private readonly eventos: Repository<EventoIntegracion>,
  ) {}

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «AÚN NO HA SALIDO» NO ES UNA DIVERGENCIA ENTRE LOS DOS LIBROS
   * --------------------------------------------------------------------------
   * La conciliación marcaba `VINCULO_INCOMPLETO` para toda póliza sin
   * identificador externo y aconsejaba lo mismo siempre: «Reintenta desde el
   * espejo contable».
   *
   * Medido el 7-oct con dos pólizas de una devolución: su evento estaba en
   * REINTENTABLE porque el core todavía no llega a esa fecha —«The journal
   * entry cannot be made for a future date»— y el despachador las reintenta
   * solo cuando llegue. Reintentar ahora **no puede funcionar**, así que el
   * consejo era falso; y, peor, la comparación las contaba como discrepancia
   * al lado de una cola que ya las daba por atendidas.
   *
   * Una conciliación que marca en rojo lo que la pantalla de al lado explica y
   * resuelve sola se acaba mirando por encima, que es lo único que un control
   * no se puede permitir.
   *
   * Aquí se lee la cola y se dice lo que de verdad pasa. No se inventa nada:
   * el motivo es el que el despachador escribió.
   * ══════════════════════════════════════════════════════════════════════════
   */
  private async porQueNoSalio(
    empresaId: string,
    polizaId: string,
  ): Promise<{ esperando: boolean; detalle: string } | null> {
    const evento = await this.eventos.findOne({
      /*
       * Con el tipo puesto: el outbox es uno solo y un identificador de
       * entidad podría repetirse en otro hecho. Un control que mira la fila
       * equivocada es peor que no mirar.
       */
      where: { empresaId, entidadId: polizaId, tipo: TipoEventoIntegracion.POLIZA_REGISTRADA },
      order: { fechaCreacion: 'DESC' },
    });
    if (!evento) return null;
    const esperando =
      evento.estado === EstadoEventoIntegracion.REINTENTABLE ||
      evento.estado === EstadoEventoIntegracion.PENDIENTE;
    if (!esperando) return null;
    /*
     * El motivo es el que escribió el despachador, TAL CUAL. Ponerle delante
     * un «Dijo:» propio producía esto, medido por pantalla el 7-oct:
     *
     *   «…y la cola ya sabe por qué. Se reintenta solo a partir del
     *    2026-10-08. Dijo: La fecha de este documento todavía no ha llegado…
     *    Se reintenta solo cuando llegue. Dijo: Fineract respondió 403: The
     *    journal entry cannot be made for a future »
     *
     * Tres veces «se reintenta», dos veces «Dijo:», y cortado a media palabra.
     * Un mensaje así se deja de leer entero, y entonces da igual lo que diga.
     */
    const cuando = evento.proximoIntento
      ? ` Próximo intento a partir del ${evento.proximoIntento.toISOString().slice(0, 10)}.`
      : ' Sale en el siguiente despacho.';
    return {
      esperando: true,
      detalle: `Todavía no ha salido.${cuando}${
        evento.ultimoError ? ` ${recortarEnPalabra(evento.ultimoError, 240)}` : ''
      }`,
    };
  }

  @Cron('0 */10 * * * *', { name: 'contabilidad-conciliar' })
  async ejecutar(): Promise<void> {
    if (omitirTareaProgramada('contabilidad-conciliar') || this.ejecutando || !this.externa.configurado()) return;
    this.ejecutando = true;
    try {
      for (const cfg of await this.configuraciones.find({ where: { modoContabilidad: ModoContabilidad.ESPEJO } })) {
        if (await this.modos.modoContabilidadDe(cfg.empresaId) !== ModoContabilidad.ESPEJO) continue;
        try { await this.conciliarEmpresa(cfg.empresaId, true); }
        catch { this.logger.error(`No se pudo conciliar el mayor de ${cfg.empresaId}`); }
      }
    } finally { this.ejecutando = false; }
  }

  async conciliarEmpresa(empresaId: string, guardarAvisos = false) {
    if (!this.externa.configurado()) throw new Error('Mayor externo no configurado');
    const cfg = await this.configuraciones.findOne({ where: { empresaId } });
    if (!cfg?.oficinaContableExterna) throw new Error('Falta la oficina contable externa');
    const links = await this.vinculos.find({ where: { empresaId, tipo: TipoVinculo.POLIZA, proveedor: this.externa.proveedor } });
    const mappings = await this.mapeos.find({ where: { empresaId, proveedor: this.externa.proveedor, activo: true } });
    const cuentas = new Map(mappings.map(m => [m.cuentaContableId, m.idExterno]));
    const hallazgos: HallazgoContable[] = [];
    /*
     * Los asientos que esta corrida SÍ alcanzó a leer.
     *
     * «No se pudo leer» casi siempre es transitorio —el core reiniciándose, el
     * circuito abierto tras unos timeouts— y el aviso que deja describe ese
     * instante, no un problema de la póliza. Sin nadie que los cierre, cada
     * caída deja su sedimento: ayer había diecinueve de éstos, todos de fallas
     * ya resueltas, y entre ellos se perdía el único aviso real. La bandeja
     * deja de leerse cuando la mayoría de lo que hay en ella ya no es cierto.
     */
    const leidos: { polizaId: string; asientoId: string }[] = [];
    let revisados = 0;
    /*
     * ════════════════════════════════════════════════════════════════════════
     * Una comparación que se cae no sigue afirmando
     * ------------------------------------------------------------------------
     * El cortacircuitos hacia el mayor externo se abre a los cinco fallos
     * seguidos y se queda abierto veinte segundos. Este bucle recorre las
     * pólizas una tras otra sin pausa, así que en cuanto se abría, las
     * CIENTO CINCO restantes fallaban al instante —sin llamar siquiera— y
     * cada una dejaba su «no se pudo leer el asiento externo».
     *
     * Medido en vivo el 30-sep-2026: la comparación devolvió ~110 hallazgos
     * idénticos de «Circuito abierto hacia Fineract». Tres consecuencias, y
     * ninguna buena: los cinco fallos de verdad quedaron enterrados entre cien
     * copias; la bandeja de avisos se llenó de sedimento; y, sobre todo, la
     * corrida afirmaba ciento diez cosas habiendo medido cinco.
     *
     * Ahora, cuando el enlace se cae, la comparación SE DETIENE y lo dice. Lo
     * que no se miró no se reporta: se cuenta como pendiente.
     * ════════════════════════════════════════════════════════════════════════
     */
    let interrumpida: string | null = null;
    let pendientesDeComparar = 0;
    for (const link of links) {
      const poliza = await this.polizas.findOne({ where: { id: link.entidadId, empresaId }, relations: ['partidas'] });
      const base = { polizaId: link.entidadId, folio: poliza?.folio ?? link.entidadId, asientoId: link.idExterno };
      const agregar = (codigo: string, detalle: string) => hallazgos.push({ ...base, codigo, detalle });
      /*
       * Un vínculo sin identificador tiene dos historias distintas y decirlas
       * igual convierte el hallazgo en ruido: «se envió y no supimos la
       * respuesta» pide que alguien mire el otro sistema; «no llegó a salir»
       * se resuelve reintentando desde el espejo. Decían las dos «revisar el
       * envío», que no dice cuál de las dos es.
       */
      if (!link.idExterno) {
        /*
         * Primero se pregunta a la cola. Si el evento sigue vivo esperando su
         * turno o su fecha, esto NO es una divergencia: es un envío en camino
         * con su razón escrita, y se cuenta aparte para no inflar el rojo.
         */
        const enCola = await this.porQueNoSalio(empresaId, link.entidadId);
        if (enCola) {
          agregar('PENDIENTE_DE_SALIR', enCola.detalle);
          continue;
        }
        const detalle =
          link.estadoRemoto === 'NO_ENVIADO'
            ? 'El asiento no llegó a salir: el mayor externo lo rechazó o no hubo enlace. Reintenta desde el espejo contable; el motivo está en la cola.'
            : link.estadoRemoto === 'EN_VUELO'
              ? 'Se envió y no se supo la respuesta. El despachador lo resolverá preguntando al mayor externo; si persiste, revísalo allá.'
              : 'La póliza tiene vínculo sin identificador externo; revisar el envío.';
        agregar('VINCULO_INCOMPLETO', detalle);
        continue;
      }
      if (!poliza) { agregar('POLIZA_AUSENTE', 'El vínculo no tiene póliza en esta empresa.'); continue; }
      revisados++;
      try {
        const remoto = await this.externa.consultarAsiento(link.idExterno, cfg.oficinaContableExterna);
        // Se respondió: la lectura funcionó, diga lo que diga el contenido.
        leidos.push({ polizaId: link.entidadId, asientoId: link.idExterno });
        if (!remoto) { agregar('ASIENTO_AUSENTE', 'El mayor externo no devuelve el asiento vinculado.'); continue; }
        if (remoto.reversado) agregar('REVERSA_EXTERNA', 'El asiento vinculado fue reversado directamente en el mayor externo. Revisar contra las pólizas ERP; no se aplicó ninguna corrección automática.');
        if (remoto.referencia !== `SYNCRO-${poliza.folio}` || remoto.moneda !== 'MXN') agregar('CABECERA_DIFERENTE', 'La referencia o moneda del asiento externo no coincide con la póliza enviada.');
        const esperado = new Map<string, { cargo: number; abono: number }>();
        let sinMapeo = false;
        for (const p of poliza.partidas) {
          const cuenta = cuentas.get(p.cuentaContableId);
          if (!cuenta) { sinMapeo = true; continue; }
          const sum = esperado.get(cuenta) ?? { cargo: 0, abono: 0 };
          sum.cargo += Math.round(Number(p.cargo) * 100);
          sum.abono += Math.round(Number(p.abono) * 100);
          esperado.set(cuenta, sum);
        }
        if (sinMapeo) { agregar('MAPEO_AUSENTE', 'Falta un mapeo activo para comparar las partidas de esta póliza.'); continue; }
        const recibido = new Map<string, { cargo: number; abono: number }>();
        for (const p of remoto.movimientos) {
          const sum = recibido.get(p.cuentaIdExterna) ?? { cargo: 0, abono: 0 };
          sum.cargo += Math.round(p.cargo * 100); sum.abono += Math.round(p.abono * 100);
          recibido.set(p.cuentaIdExterna, sum);
        }
        const distintas = [...new Set([...esperado.keys(), ...recibido.keys()])].some(c => {
          const a = esperado.get(c) ?? { cargo: 0, abono: 0 }, b = recibido.get(c) ?? { cargo: 0, abono: 0 };
          return a.cargo !== b.cargo || a.abono !== b.abono;
        });
        if (distintas) agregar('PARTIDAS_DIFERENTES', 'Las cuentas, cargos o abonos no coinciden con la póliza ERP al centavo.');
      } catch (error) {
        /*
         * La causa va en el aviso.
         *
         * Antes este `catch` no recibía el error: el aviso decía «no se pudo
         * leer» y nada más, y con veinte pólizas en ese estado no había por
         * dónde empezar —¿el asiento no existe, la oficina está mal, el core
         * no contesta, la respuesta viene incompleta?—. Cada una de esas
         * causas se atiende distinto, y ninguna se adivina desde la pantalla.
         */
        const causa = error instanceof Error ? error.message : String(error);
        agregar(
          'CONSULTA_FALLIDA',
          `No se pudo leer íntegramente el asiento externo (${causa}). No se supone saldo cero ni coincidencia.`,
        );
        /*
         * Si el enlace se cayó, lo que sigue no es información: es el mismo
         * fallo repetido tantas veces como pólizas queden.
         */
        if (!this.externa.disponible()) {
          interrumpida =
            `El enlace con el mayor externo se cortó tras revisar ${revisados} ` +
            `de ${links.length} póliza(s) (${causa}). Las demás no se compararon: ` +
            'no se sabe nada de ellas hasta la próxima corrida.';
          pendientesDeComparar = links.length - revisados;
          break;
        }
      }
    }
    /*
     * Dos montones, no uno.
     *
     * «Aún no ha salido, y la cola dice por qué» no es una diferencia entre los
     * dos libros: se resuelve solo. «Salió y no coincide» pide atención ahora.
     * Contarlos juntos le quita filo al control: el rojo deja de significar
     * algo cuando casi siempre está encendido por lo que se arregla sin nadie.
     */
    const divergencias = hallazgos.filter((h) => h.codigo !== 'PENDIENTE_DE_SALIR');
    const enCamino = hallazgos.filter((h) => h.codigo === 'PENDIENTE_DE_SALIR');
    if (guardarAvisos) {
      /*
       * Primero se cierra, después se abre.
       *
       * Un aviso de lectura fallida sobre un asiento que esta corrida acaba de
       * leer bien es un hecho que dejó de ser cierto, y dejarlo abierto es
       * pedirle a una persona que revise algo que el sistema ya sabe resuelto.
       * Sólo se cierran los de ESE código: un `PARTIDAS_DIFERENTES` o una
       * `REVERSA_EXTERNA` siguen siendo verdad aunque la consulta funcione, y
       * ésos no se tocan.
       */
      for (const leido of leidos) {
        const huella = createHash('sha256')
          .update(
            JSON.stringify([
              'conciliacion-contable',
              empresaId,
              this.externa.proveedor,
              leido.polizaId,
              leido.asientoId,
              'CONSULTA_FALLIDA',
            ]),
          )
          .digest('hex');
        await this.avisos.update(
          { huella, estado: EstadoAviso.PENDIENTE },
          {
            estado: EstadoAviso.PROCESADO,
            resueltoEn: new Date(),
            // Sin `resueltoPor`: no lo resolvió una persona.
            resueltoPor: null,
          },
        );
      }

      /*
       * Y se cierra también el consejo que dejó de ser cierto.
       *
       * Una póliza que hoy está «en camino» pudo dejar ayer un aviso de
       * VINCULO_INCOMPLETO que decía «reintenta desde el espejo contable».
       * Reintentar no puede funcionar mientras el core no llegue a su fecha,
       * así que ese aviso manda a una persona a pulsar un botón que no hace
       * nada. Se cierra, y sin `resueltoPor`: no lo resolvió nadie.
       */
      for (const h of enCamino) {
        const huella = createHash('sha256')
          .update(
            JSON.stringify([
              'conciliacion-contable',
              empresaId,
              this.externa.proveedor,
              h.polizaId,
              h.asientoId,
              'VINCULO_INCOMPLETO',
            ]),
          )
          .digest('hex');
        await this.avisos.update(
          { huella, estado: EstadoAviso.PENDIENTE },
          { estado: EstadoAviso.PROCESADO, resueltoEn: new Date(), resueltoPor: null },
        );
      }

      /* Sólo las divergencias abren aviso: lo que vuelve solo no pide a nadie. */
      for (const h of divergencias) {
        const huella = createHash('sha256').update(JSON.stringify(['conciliacion-contable', empresaId, this.externa.proveedor, h.polizaId, h.asientoId, h.codigo])).digest('hex');
        // Índice único existente: el cron y una ejecución manual no duplican el aviso.
        await this.avisos.createQueryBuilder().insert().values({
          empresaId, proveedor: this.externa.proveedor, entidad: 'POLIZA', accion: 'CONCILIACION_CONTABLE',
          idExterno: h.asientoId, entidadId: h.polizaId, tipoVinculo: TipoVinculo.POLIZA,
          cuerpo: { origen: 'conciliacion-erp', ...h }, huella, estado: EstadoAviso.PENDIENTE,
          diagnostico: `${h.folio}: ${h.detalle}`.slice(0, 500), recibidoEn: new Date(),
        }).orIgnore().execute();
      }
    }
    return {
      fecha: new Date().toISOString(),
      alcance: 'POLIZAS_VINCULADAS',
      revisados,
      discrepancias: divergencias.length,
      hallazgos: divergencias,
      /*
       * Viajan aparte y con su motivo, para que la pantalla pueda decir «no
       * coincide» y «todavía no ha salido» con dos palabras distintas.
       */
      enCamino,
      /*
       * `completa` va en el resultado y no se deduce de que no haya hallazgos:
       * una corrida que se cortó a la tercera póliza y no encontró nada no
       * dice lo mismo que una que recorrió las ciento diez.
       */
      completa: interrumpida === null,
      interrumpida,
      pendientesDeComparar,
    };
  }
}
