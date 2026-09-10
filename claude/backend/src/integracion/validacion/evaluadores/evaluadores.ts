import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PUERTO_BURO_CREDITO,
  PUERTO_CARTERA_EXTERNA,
  PUERTO_VALIDACION_IDENTIDAD,
} from '../../integracion.constants';
import { PuertoBuroCredito } from '../../ports/buro-credito.port';
import { PuertoCarteraExterna } from '../../ports/cartera-externa.port';
import {
  PuertoValidacionIdentidad,
  ResultadoIdentidad,
} from '../../ports/validacion-identidad.port';
import { Cliente } from '../../../clientes/entities/cliente.entity';
import { PasoFlujoValidacion } from '../entities/paso-flujo-validacion.entity';
import { ResultadoPaso, TipoPasoValidacion } from '../validacion.constants';
import {
  ContextoValidacion,
  EvaluadorPaso,
  SalidaPaso,
} from './evaluador.port';

/** Respuesta forzada en simulación, si la hay para este tipo. */
function forzado(
  contexto: ContextoValidacion,
  tipo: TipoPasoValidacion,
  proveedor: string,
): SalidaPaso | null {
  const r = contexto.simulado?.[tipo];
  if (!r) return null;
  return {
    resultado: r,
    puntaje: r === ResultadoPaso.APROBADO ? 90 : 20,
    proveedor: `${proveedor} (simulado)`,
    detalle: 'Respuesta forzada por la simulación.',
  };
}

// ── Identidad ───────────────────────────────────────────────────────────────
@Injectable()
export class EvaluadorIdentidadIne implements EvaluadorPaso {
  readonly tipo = TipoPasoValidacion.IDENTIDAD_INE;

  constructor(
    @Inject(PUERTO_VALIDACION_IDENTIDAD)
    private readonly identidad: PuertoValidacionIdentidad,
  ) {}

  async evaluar(contexto: ContextoValidacion): Promise<SalidaPaso> {
    const simulado = forzado(contexto, this.tipo, 'INE');
    if (simulado) return simulado;

    const veredicto =
      (await this.identidad.consultar(contexto.empresaId, contexto.clienteId)) ??
      (await this.identidad.validar({
        empresaId: contexto.empresaId,
        clienteId: contexto.clienteId,
        nombre: contexto.nombre,
        rfc: contexto.rfc,
        curp: contexto.curp,
      }));

    const mapa: Record<ResultadoIdentidad, ResultadoPaso> = {
      [ResultadoIdentidad.VERIFICADA]: ResultadoPaso.APROBADO,
      [ResultadoIdentidad.RECHAZADA]: ResultadoPaso.RECHAZADO,
      [ResultadoIdentidad.INDETERMINADA]: ResultadoPaso.INDETERMINADO,
      [ResultadoIdentidad.NO_INICIADA]: ResultadoPaso.NO_DISPONIBLE,
    };

    return {
      resultado: mapa[veredicto.resultado],
      puntaje: veredicto.puntaje,
      proveedor: veredicto.proveedor,
      detalle: veredicto.motivos.join(' ') || null,
      evidencia: { referencia: veredicto.referencia ?? null },
    };
  }
}

// ── Burós ───────────────────────────────────────────────────────────────────
/**
 * Sirve tanto a Buró como a Círculo. Son dos sociedades de información
 * crediticia distintas pero el contrato es el mismo; el proveedor concreto se
 * elige por parámetro del paso.
 */
abstract class EvaluadorBuroBase implements EvaluadorPaso {
  abstract readonly tipo: TipoPasoValidacion;
  protected abstract readonly nombreProveedor: string;

  constructor(protected readonly buro: PuertoBuroCredito) {}

  async evaluar(
    contexto: ContextoValidacion,
    paso: PasoFlujoValidacion,
  ): Promise<SalidaPaso> {
    const simulado = forzado(contexto, this.tipo, this.nombreProveedor);
    if (simulado) return simulado;

    // Sin autorización firmada del titular la consulta es ilegal en México.
    // No es una validación defensiva: es la ley.
    if (!contexto.folioAutorizacionBuro) {
      return {
        resultado: ResultadoPaso.NO_DISPONIBLE,
        proveedor: this.nombreProveedor,
        detalle:
          'No hay autorización firmada del titular para consultar la sociedad de información crediticia.',
      };
    }

    const reporte = await this.buro.consultar({
      empresaId: contexto.empresaId,
      clienteId: contexto.clienteId,
      rfc: contexto.rfc,
      curp: contexto.curp,
      folioAutorizacion: contexto.folioAutorizacionBuro,
    });

    if (!reporte.disponible) {
      return {
        resultado: ResultadoPaso.NO_DISPONIBLE,
        proveedor: reporte.proveedor,
        detalle: reporte.motivos.join(' ') || null,
      };
    }

    const umbral = paso.umbralMinimo ?? 600;
    const puntaje = reporte.puntaje ?? 0;
    const atrasoGrave = (reporte.peorAtrasoDias ?? 0) >= 90;

    return {
      resultado:
        atrasoGrave || puntaje < umbral
          ? ResultadoPaso.RECHAZADO
          : ResultadoPaso.APROBADO,
      puntaje,
      proveedor: reporte.proveedor,
      detalle: atrasoGrave
        ? `Atraso histórico de ${reporte.peorAtrasoDias} días.`
        : `Puntaje ${puntaje} contra umbral ${umbral}.`,
      evidencia: {
        deudaTotal: reporte.deudaTotal,
        peorAtrasoDias: reporte.peorAtrasoDias,
      },
    };
  }
}

@Injectable()
export class EvaluadorBuroCredito extends EvaluadorBuroBase {
  readonly tipo = TipoPasoValidacion.BURO_CREDITO;
  protected readonly nombreProveedor = 'Buró de Crédito';
  constructor(@Inject(PUERTO_BURO_CREDITO) buro: PuertoBuroCredito) {
    super(buro);
  }
}

@Injectable()
export class EvaluadorCirculoCredito extends EvaluadorBuroBase {
  readonly tipo = TipoPasoValidacion.CIRCULO_CREDITO;
  protected readonly nombreProveedor = 'Círculo de Crédito';
  constructor(@Inject(PUERTO_BURO_CREDITO) buro: PuertoBuroCredito) {
    super(buro);
  }
}

// ── Historial interno ───────────────────────────────────────────────────────
@Injectable()
export class EvaluadorHistorialInterno implements EvaluadorPaso {
  readonly tipo = TipoPasoValidacion.HISTORIAL_INTERNO;
  private readonly logger = new Logger(EvaluadorHistorialInterno.name);

  constructor(
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
  ) {}

  async evaluar(
    contexto: ContextoValidacion,
    paso: PasoFlujoValidacion,
  ): Promise<SalidaPaso> {
    const simulado = forzado(contexto, this.tipo, 'cartera propia');
    if (simulado) return simulado;

    // Primero el registro externo, que es la fuente de verdad de la cartera.
    if (contexto.clienteIdExterno && this.externa.disponible()) {
      try {
        const r = await this.externa.resumenCliente(contexto.clienteIdExterno);
        const umbral = paso.umbralMinimo ?? 30;
        return {
          resultado:
            r.diasAtrasoMaximo >= umbral
              ? ResultadoPaso.RECHAZADO
              : ResultadoPaso.APROBADO,
          puntaje: Math.max(0, 100 - r.diasAtrasoMaximo),
          proveedor: this.externa.proveedor,
          detalle: `Saldo ${r.saldoTotal.toFixed(2)}, vencido ${r.saldoVencido.toFixed(2)}, atraso máximo ${r.diasAtrasoMaximo} días.`,
          evidencia: { ...r },
        };
      } catch (error) {
        this.logger.warn(
          `No se pudo leer el historial externo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Sin registro externo, el propio ERP alcanza para lo básico.
    const [fila] = await this.clientes.manager.query<
      { saldo: string; vencido: string }[]
    >(
      `SELECT
         COALESCE(SUM(c.saldopendiente), 0) AS saldo,
         COALESCE(SUM(CASE WHEN c.estado = 'VENCIDO' THEN c.saldopendiente ELSE 0 END), 0) AS vencido
       FROM creditos_clientes c
       WHERE c.empresaid = $1 AND c.clienteid = $2 AND c.estado IN ('ACTIVO','VENCIDO')`,
      [contexto.empresaId, contexto.clienteId],
    );

    const vencido = Number(fila?.vencido ?? 0);
    return {
      resultado: vencido > 0 ? ResultadoPaso.RECHAZADO : ResultadoPaso.APROBADO,
      puntaje: vencido > 0 ? 20 : 80,
      proveedor: 'ERP',
      detalle:
        vencido > 0
          ? `El cliente tiene ${vencido.toFixed(2)} vencidos en la cartera del ERP.`
          : 'Sin saldo vencido en la cartera del ERP.',
      evidencia: { saldo: Number(fila?.saldo ?? 0), vencido },
    };
  }
}

// ── Política interna ────────────────────────────────────────────────────────
@Injectable()
export class EvaluadorPoliticaInterna implements EvaluadorPaso {
  readonly tipo = TipoPasoValidacion.POLITICA_INTERNA;

  async evaluar(
    contexto: ContextoValidacion,
    paso: PasoFlujoValidacion,
  ): Promise<SalidaPaso> {
    const simulado = forzado(contexto, this.tipo, 'política interna');
    if (simulado) return simulado;

    const maximo = Number(paso.parametros?.montoMaximo ?? 0);
    if (maximo > 0 && contexto.limiteSolicitado > maximo) {
      return {
        resultado: ResultadoPaso.RECHAZADO,
        proveedor: 'política interna',
        detalle: `Lo solicitado (${contexto.limiteSolicitado}) excede el máximo de la política (${maximo}).`,
      };
    }
    return {
      resultado: ResultadoPaso.APROBADO,
      proveedor: 'política interna',
      detalle: 'El monto solicitado cabe en la política.',
    };
  }
}

// ── Lista de bloqueo ────────────────────────────────────────────────────────
@Injectable()
export class EvaluadorListaBloqueo implements EvaluadorPaso {
  readonly tipo = TipoPasoValidacion.LISTA_BLOQUEO;

  async evaluar(contexto: ContextoValidacion): Promise<SalidaPaso> {
    const simulado = forzado(contexto, this.tipo, 'listas');
    if (simulado) return simulado;

    return {
      resultado: ResultadoPaso.NO_DISPONIBLE,
      proveedor: 'ninguno',
      detalle:
        'No hay proveedor de listas de bloqueo configurado. Llegará con la migración de la suite de SUMA.',
    };
  }
}

// ── Revisión humana ─────────────────────────────────────────────────────────
@Injectable()
export class EvaluadorRevisionManual implements EvaluadorPaso {
  readonly tipo = TipoPasoValidacion.REVISION_MANUAL;

  /**
   * Nunca aprueba por su cuenta. Devuelve INDETERMINADO para que el motor lo
   * derive al flujo de aprobaciones del ERP, donde una persona con el rol
   * correspondiente resuelve. Un paso llamado "revisión manual" que se aprueba
   * solo no es un control, es un adorno.
   */
  async evaluar(): Promise<SalidaPaso> {
    return {
      resultado: ResultadoPaso.INDETERMINADO,
      proveedor: 'humano',
      detalle: 'Requiere autorización de una persona.',
    };
  }
}
