import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
        limiteSolicitado: Number(entrada.limiteSolicitado),
        limiteSugerido: Number(veredicto.limiteSugerido),
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

  /**
   * ==========================================================================
   * El expediente de la empresa, no el de un cliente
   * --------------------------------------------------------------------------
   * Hasta ahora las verificaciones sólo se podían mirar de una en una: abrir un
   * cliente y ver sus corridas. Eso responde «¿a éste lo revisaron?» y no
   * responde la pregunta que hace un comité de crédito o un auditor: **cuánto
   * se está verificando, de qué, y con qué resultado**. Sin ese agregado, un
   * control que lleva dos meses devolviendo NO_DISPONIBLE —porque nadie
   * contrató al proveedor— no se nota hasta que alguien revisa cliente por
   * cliente.
   *
   * Se cuenta por CONTROL y por RESULTADO, y se separan las simulaciones de las
   * corridas reales. Mezclarlas inflaría la cifra con ensayos que no habilitan
   * ninguna autorización, que es justo la confusión que este tablero existe
   * para evitar.
   * ==========================================================================
   */
  async tablero(empresaId: string, dias = 90) {
    const ventana = Math.min(Math.max(Number(dias) || 90, 1), 730);
    const desde = new Date(Date.now() - ventana * 24 * 60 * 60 * 1000);

    const porEstado = await this.ejecuciones
      .createQueryBuilder('e')
      .select('e.estado', 'estado')
      .addSelect('e.simulacion', 'simulacion')
      .addSelect('COUNT(*)', 'total')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('e.fechaCreacion >= :desde', { desde })
      .groupBy('e.estado')
      .addGroupBy('e.simulacion')
      .getRawMany<{ estado: string; simulacion: boolean; total: string }>();

    /*
     * Los pasos se filtran por la corrida a la que pertenecen, no por su propia
     * fecha: un paso sin su corrida no se puede atribuir a una empresa, y
     * `resultado_paso` no guarda `empresaId`.
     */
    const porControl = await this.resultados
      .createQueryBuilder('r')
      .innerJoin(EjecucionValidacion, 'e', 'e.id = r.ejecucionId')
      .select('r.tipo', 'tipo')
      .addSelect('r.resultado', 'resultado')
      .addSelect('e.simulacion', 'simulacion')
      .addSelect('COUNT(*)', 'total')
      .addSelect('MAX(r.fechaCreacion)', 'ultima')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('e.fechaCreacion >= :desde', { desde })
      .groupBy('r.tipo')
      .addGroupBy('r.resultado')
      .addGroupBy('e.simulacion')
      .getRawMany<{
        tipo: string;
        resultado: string;
        simulacion: boolean;
        total: string;
        ultima: Date | null;
      }>();

    const proveedores = await this.resultados
      .createQueryBuilder('r')
      .innerJoin(EjecucionValidacion, 'e', 'e.id = r.ejecucionId')
      .select('r.tipo', 'tipo')
      .addSelect('r.proveedor', 'proveedor')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('e.fechaCreacion >= :desde', { desde })
      .andWhere('r.proveedor IS NOT NULL')
      .groupBy('r.tipo')
      .addGroupBy('r.proveedor')
      .getRawMany<{ tipo: string; proveedor: string }>();

    const recientes = await this.ejecuciones.find({
      where: { empresaId },
      order: { fechaCreacion: 'DESC' },
      take: 12,
    });
    const nombres = new Map<string, string>();
    if (recientes.length) {
      const clientes = await this.clientes.find({
        where: { empresaId, id: In([...new Set(recientes.map((r) => r.clienteId))]) },
      });
      for (const c of clientes) nombres.set(c.id, c.razonSocial || c.nombre);
    }

    const cubiertos = await this.ejecuciones
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.clienteId)', 'total')
      .where('e.empresaId = :empresaId', { empresaId })
      .andWhere('e.simulacion = false')
      .getRawOne<{ total: string }>();

    const clientesTotales = await this.clientes.count({ where: { empresaId, activo: true } });

    const numero = (v: unknown) => Number(v ?? 0);
    const agregado = { reales: 0, simulaciones: 0 };
    const estados: Record<string, number> = {};
    for (const fila of porEstado) {
      const total = numero(fila.total);
      if (fila.simulacion) agregado.simulaciones += total;
      else {
        agregado.reales += total;
        estados[fila.estado] = (estados[fila.estado] ?? 0) + total;
      }
    }

    const controles = new Map<
      string,
      {
        tipo: string;
        corridasReales: number;
        simulaciones: number;
        porResultado: Record<string, number>;
        ultima: string | null;
        proveedores: string[];
      }
    >();
    const asegurar = (tipo: string) => {
      if (!controles.has(tipo)) {
        controles.set(tipo, {
          tipo,
          corridasReales: 0,
          simulaciones: 0,
          porResultado: {},
          ultima: null,
          proveedores: [],
        });
      }
      return controles.get(tipo)!;
    };
    for (const fila of porControl) {
      const c = asegurar(fila.tipo);
      const total = numero(fila.total);
      if (fila.simulacion) c.simulaciones += total;
      else {
        c.corridasReales += total;
        c.porResultado[fila.resultado] = (c.porResultado[fila.resultado] ?? 0) + total;
      }
      const cuando = fila.ultima ? new Date(fila.ultima).toISOString() : null;
      if (cuando && (!c.ultima || cuando > c.ultima)) c.ultima = cuando;
    }
    for (const fila of proveedores) {
      const c = asegurar(fila.tipo);
      if (fila.proveedor && fila.proveedor !== 'ninguno' && !c.proveedores.includes(fila.proveedor)) {
        c.proveedores.push(fila.proveedor);
      }
    }

    return {
      ventanaDias: ventana,
      desde: desde.toISOString(),
      corridas: {
        reales: agregado.reales,
        simulaciones: agregado.simulaciones,
        porEstado: estados,
      },
      controles: [...controles.values()].sort((a, b) => b.corridasReales - a.corridasReales),
      cobertura: {
        clientesActivos: clientesTotales,
        conVerificacionReal: numero(cubiertos?.total),
        sinVerificacion: Math.max(0, clientesTotales - numero(cubiertos?.total)),
      },
      recientes: recientes.map((r) => ({
        id: r.id,
        fecha: r.fechaCreacion,
        clienteId: r.clienteId,
        cliente: nombres.get(r.clienteId) ?? 'Cliente dado de baja',
        flujoNombre: r.flujoNombre,
        estado: r.estado,
        puntaje: r.puntaje,
        limiteSolicitado: r.limiteSolicitado,
        simulacion: r.simulacion,
      })),
    };
  }

  async historial(empresaId: string, clienteId: string) {
    return this.ejecuciones.find({
      where: { empresaId, clienteId },
      order: { fechaCreacion: 'DESC' },
      take: 50,
    });
  }
}
