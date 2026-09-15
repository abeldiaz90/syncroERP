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
    let revisados = 0;
    for (const link of links) {
      const poliza = await this.polizas.findOne({ where: { id: link.entidadId, empresaId }, relations: ['partidas'] });
      const base = { polizaId: link.entidadId, folio: poliza?.folio ?? link.entidadId, asientoId: link.idExterno };
      const agregar = (codigo: string, detalle: string) => hallazgos.push({ ...base, codigo, detalle });
      if (!link.idExterno) { agregar('VINCULO_INCOMPLETO', 'La póliza tiene vínculo sin identificador externo; revisar el envío.'); continue; }
      if (!poliza) { agregar('POLIZA_AUSENTE', 'El vínculo no tiene póliza en esta empresa.'); continue; }
      revisados++;
      try {
        const remoto = await this.externa.consultarAsiento(link.idExterno, cfg.oficinaContableExterna);
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
      } catch {
        agregar('CONSULTA_FALLIDA', 'No se pudo leer íntegramente el asiento externo. No se supone saldo cero ni coincidencia.');
      }
    }
    if (guardarAvisos) {
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
