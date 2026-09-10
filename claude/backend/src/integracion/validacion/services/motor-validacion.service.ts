import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../../../clientes/entities/cliente.entity';
import { TipoVinculo } from '../../integracion.constants';
import { IntegracionVinculosService } from '../../services/integracion-vinculos.service';
import { EjecucionValidacion } from '../entities/ejecucion-validacion.entity';
import { FlujoValidacion } from '../entities/flujo-validacion.entity';
import { PasoFlujoValidacion } from '../entities/paso-flujo-validacion.entity';
import { ResultadoPasoValidacion } from '../entities/resultado-paso.entity';
import {
  EstadoEjecucion,
  PoliticaPaso,
  PropositoFlujo,
  REGISTRO_EVALUADORES,
  ResultadoPaso,
  TipoPasoValidacion,
} from '../validacion.constants';
import { ContextoValidacion, EvaluadorPaso } from '../evaluadores/evaluador.port';

export interface PasoEjecutado {
  orden: number;
  tipo: TipoPasoValidacion;
  etiqueta: string;
  politica: PoliticaPaso;
  resultado: ResultadoPaso;
  puntaje: number | null;
  puntosAportados: number;
  proveedor: string | null;
  detalle: string | null;
  evidencia: Record<string, unknown> | null;
}

export interface VeredictoFlujo {
  estado: EstadoEjecucion;
  puntaje: number;
  limiteSugerido: number;
  motivos: string[];
}

/**
 * Resuelve el veredicto a partir de lo que contestó cada paso.
 *
 * Función pura y separada del servicio para que la política de la empresa sea
 * auditable y probable sin levantar nada. El orden de las reglas importa: las
 * causales de corte se evalúan primero.
 */
export function resolverVeredicto(
  pasos: PasoEjecutado[],
  flujo: { puntajeMinimo: number; topeAutomatico: number },
  limiteSolicitado: number,
): VeredictoFlujo {
  const motivos: string[] = [];

  // 1. Un paso bloqueante que no salió aprobado corta el flujo. No hay puntaje
  //    que compense una identidad rechazada.
  const corte = pasos.find(
    (p) =>
      p.politica === PoliticaPaso.BLOQUEANTE &&
      p.resultado !== ResultadoPaso.APROBADO &&
      p.resultado !== ResultadoPaso.OMITIDO,
  );
  if (corte) {
    const rechazo = corte.resultado === ResultadoPaso.RECHAZADO;
    return {
      estado: rechazo ? EstadoEjecucion.RECHAZADA : EstadoEjecucion.REVISION_MANUAL,
      puntaje: 0,
      limiteSugerido: 0,
      motivos: [
        rechazo
          ? `«${corte.etiqueta}» rechazó al solicitante.`
          : `«${corte.etiqueta}» no pudo resolverse y es un paso bloqueante.`,
        ...(corte.detalle ? [corte.detalle] : []),
      ],
    };
  }

  const puntaje = Math.max(
    0,
    Math.min(100, pasos.reduce((t, p) => t + p.puntosAportados, 0)),
  );
  for (const p of pasos) {
    motivos.push(
      `${p.etiqueta}: ${p.resultado}${p.detalle ? ' — ' + p.detalle : ''}`,
    );
  }

  // 2. Cualquier paso que derive a revisión manda el expediente a una persona,
  //    aunque el puntaje alcance.
  const deriva = pasos.find(
    (p) =>
      p.politica === PoliticaPaso.DERIVA_A_REVISION &&
      p.resultado !== ResultadoPaso.APROBADO &&
      p.resultado !== ResultadoPaso.OMITIDO,
  );
  if (deriva) {
    return {
      estado: EstadoEjecucion.REVISION_MANUAL,
      puntaje,
      limiteSugerido: 0,
      motivos: [...motivos, `«${deriva.etiqueta}» exige revisión humana.`],
    };
  }

  // 3. Puntaje.
  if (puntaje < flujo.puntajeMinimo) {
    return {
      estado: EstadoEjecucion.RECHAZADA,
      puntaje,
      limiteSugerido: 0,
      motivos: [
        ...motivos,
        `El puntaje ${puntaje} no alcanza el mínimo de ${flujo.puntajeMinimo}.`,
      ],
    };
  }

  // 4. Techo automático. Cero significa que todo pasa por comité, que es el
  //    valor seguro por omisión.
  const solicitado = Math.max(0, limiteSolicitado);
  if (flujo.topeAutomatico <= 0) {
    return {
      estado: EstadoEjecucion.REVISION_MANUAL,
      puntaje,
      limiteSugerido: 0,
      motivos: [...motivos, 'El flujo no autoriza montos de forma automática.'],
    };
  }
  if (solicitado > flujo.topeAutomatico) {
    return {
      estado: EstadoEjecucion.REVISION_MANUAL,
      puntaje,
      limiteSugerido: flujo.topeAutomatico,
      motivos: [
        ...motivos,
        `Lo solicitado (${solicitado}) excede el tope automático (${flujo.topeAutomatico}).`,
      ],
    };
  }

  return {
    estado: EstadoEjecucion.APROBADA,
    puntaje,
    limiteSugerido: solicitado,
    motivos,
  };
}

/**
 * Ejecuta el flujo que diseñó el administrador de la empresa.
 *
 * No otorga nada: produce un expediente y un veredicto. Quien autoriza sigue
 * siendo el flujo de aprobaciones del ERP, con su matriz de autorizadores.
 */
@Injectable()
export class MotorValidacionService {
  private readonly logger = new Logger(MotorValidacionService.name);
  private readonly porTipo: Map<TipoPasoValidacion, EvaluadorPaso>;

  constructor(
    @Inject(REGISTRO_EVALUADORES)
    evaluadores: EvaluadorPaso[],
    @InjectRepository(FlujoValidacion)
    private readonly flujos: Repository<FlujoValidacion>,
    @InjectRepository(PasoFlujoValidacion)
    private readonly pasos: Repository<PasoFlujoValidacion>,
    @InjectRepository(EjecucionValidacion)
    private readonly ejecuciones: Repository<EjecucionValidacion>,
    @InjectRepository(ResultadoPasoValidacion)
    private readonly resultados: Repository<ResultadoPasoValidacion>,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
    private readonly vinculos: IntegracionVinculosService,
  ) {
    this.porTipo = new Map(evaluadores.map((e) => [e.tipo, e]));
  }

  /** Flujo activo de la empresa, con sus pasos en orden. */
  async flujoActivo(empresaId: string): Promise<FlujoValidacion | null> {
    const flujo = await this.flujos.findOne({
      where: {
        empresaId,
        proposito: PropositoFlujo.ORIGINACION_CREDITO,
        activo: true,
      },
    });
    if (!flujo) return null;
    flujo.pasos = await this.pasos.find({
      where: { flujoId: flujo.id, activo: true },
      order: { orden: 'ASC' },
    });
    return flujo;
  }

  async ejecutar(entrada: {
    empresaId: string;
    clienteId: string;
    limiteSolicitado: number;
    folioAutorizacionBuro?: string | null;
    usuarioId?: string | null;
    /** Sólo evalúa y guarda el expediente marcado como simulación. */
    simulacion?: boolean;
    /** Respuestas forzadas por tipo de paso. Sólo con `simulacion`. */
    simulado?: Partial<Record<TipoPasoValidacion, ResultadoPaso>>;
  }) {
    const flujo = await this.flujoActivo(entrada.empresaId);
    if (!flujo) {
      throw new NotFoundException(
        'La empresa no tiene un flujo de validación activo.',
      );
    }

    const cliente = await this.clientes.findOne({
      where: { id: entrada.clienteId, empresaId: entrada.empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    const contexto: ContextoValidacion = {
      empresaId: entrada.empresaId,
      clienteId: cliente.id,
      nombre: cliente.razonSocial || cliente.nombre,
      rfc: cliente.rfc ?? null,
      curp: cliente.curp ?? null,
      limiteSolicitado: entrada.limiteSolicitado,
      folioAutorizacionBuro: entrada.folioAutorizacionBuro ?? null,
      clienteIdExterno: await this.vinculos.idExterno(
        entrada.empresaId,
        TipoVinculo.CLIENTE,
        cliente.id,
      ),
      simulado: entrada.simulacion ? entrada.simulado : undefined,
    };

    const ejecutados: PasoEjecutado[] = [];

    for (const paso of flujo.pasos) {
      const evaluador = this.porTipo.get(paso.tipo);
      let salida;

      if (!evaluador) {
        salida = {
          resultado: ResultadoPaso.ERROR,
          detalle: `No hay evaluador registrado para ${paso.tipo}.`,
        };
      } else {
        try {
          salida = await evaluador.evaluar(contexto, paso);
        } catch (error) {
          // Que un proveedor se caiga no puede tumbar el expediente entero: se
          // registra como ERROR y la política del paso decide si eso corta.
          this.logger.error(
            `El paso ${paso.tipo} falló: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          salida = {
            resultado: ResultadoPaso.ERROR,
            detalle: error instanceof Error ? error.message : String(error),
          };
        }
      }

      const aporta =
        salida.resultado === ResultadoPaso.APROBADO ? paso.peso : 0;

      ejecutados.push({
        orden: paso.orden,
        tipo: paso.tipo,
        etiqueta: paso.etiqueta,
        politica: paso.politica,
        resultado: salida.resultado,
        puntaje: salida.puntaje ?? null,
        puntosAportados: aporta,
        proveedor: salida.proveedor ?? null,
        detalle: salida.detalle ?? null,
        evidencia: salida.evidencia ?? null,
      });

      // Un bloqueante que no pasó detiene el recorrido: no tiene sentido
      // gastar una consulta de buró —que se cobra— cuando la identidad ya
      // fue rechazada.
      if (
        paso.politica === PoliticaPaso.BLOQUEANTE &&
        salida.resultado !== ResultadoPaso.APROBADO &&
        salida.resultado !== ResultadoPaso.OMITIDO
      ) {
        break;
      }
    }

    const veredicto = resolverVeredicto(
      ejecutados,
      {
        puntajeMinimo: flujo.puntajeMinimo,
        topeAutomatico: Number(flujo.topeAutomatico),
      },
      entrada.limiteSolicitado,
    );

    const ejecucion = await this.ejecuciones.save(
      this.ejecuciones.create({
        empresaId: entrada.empresaId,
        clienteId: cliente.id,
        flujoId: flujo.id,
        flujoVersion: flujo.version,
        flujoNombre: flujo.nombre,
        limiteSolicitado: String(entrada.limiteSolicitado),
        limiteSugerido: String(veredicto.limiteSugerido),
        puntaje: veredicto.puntaje,
        estado: veredicto.estado,
        motivos: veredicto.motivos,
        simulacion: entrada.simulacion === true,
        usuarioId: entrada.usuarioId ?? null,
        fechaFin: new Date(),
      }),
    );

    await this.resultados.save(
      ejecutados.map((p) =>
        this.resultados.create({
          ejecucionId: ejecucion.id,
          orden: p.orden,
          tipo: p.tipo,
          etiqueta: p.etiqueta,
          resultado: p.resultado,
          puntaje: p.puntaje,
          puntosAportados: p.puntosAportados,
          proveedor: p.proveedor,
          detalle: p.detalle?.slice(0, 1000) ?? null,
          evidencia: p.evidencia,
        }),
      ),
    );

    return { ejecucion, pasos: ejecutados, veredicto };
  }

  async expediente(id: string, empresaId: string) {
    const ejecucion = await this.ejecuciones.findOne({
      where: { id, empresaId },
    });
    if (!ejecucion) throw new NotFoundException('Expediente no encontrado.');
    const pasos = await this.resultados.find({
      where: { ejecucionId: id },
      order: { orden: 'ASC' },
    });
    return { ejecucion, pasos };
  }

  async historial(empresaId: string, clienteId: string) {
    return this.ejecuciones.find({
      where: { empresaId, clienteId },
      order: { fechaCreacion: 'DESC' },
      take: 50,
    });
  }
}
