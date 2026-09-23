import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import { ModoContabilidad, PUERTO_CONTABILIDAD_EXTERNA, TipoVinculo } from '../integracion.constants';
import { PuertoContabilidadExterna } from '../ports/contabilidad-externa.port';
import { VinculoIntegracion } from '../entities/vinculo-integracion.entity';
import { MapeoCuentaExterna } from '../entities/mapeo-cuenta-externa.entity';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { AvisoIntegracion, EstadoAviso } from '../entities/aviso-integracion.entity';
import { IntegracionModoService } from './integracion-modo.service';

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
  ) {}

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
      }
    }
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

      for (const h of hallazgos) {
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
    return { fecha: new Date().toISOString(), alcance: 'POLIZAS_VINCULADAS', revisados, discrepancias: hallazgos.length, hallazgos };
  }
}
