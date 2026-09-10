import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PUERTO_BURO_CREDITO,
  PUERTO_CARTERA_EXTERNA,
  PUERTO_VALIDACION_IDENTIDAD,
} from '../integracion.constants';
import {
  PuertoBuroCredito,
  ReporteBuro,
} from '../ports/buro-credito.port';
import {
  PuertoValidacionIdentidad,
  ResultadoIdentidad,
  VeredictoIdentidad,
} from '../ports/validacion-identidad.port';
import {
  PuertoCarteraExterna,
  ResumenCarteraCliente,
} from '../ports/cartera-externa.port';

export enum VeredictoCredito {
  APROBADO = 'APROBADO',
  /** Aprobado pero por debajo de lo solicitado. */
  APROBADO_CON_AJUSTE = 'APROBADO_CON_AJUSTE',
  /** Necesita autorización humana en el flujo de aprobaciones del ERP. */
  REVISION_MANUAL = 'REVISION_MANUAL',
  RECHAZADO = 'RECHAZADO',
}

export interface EntradaDecision {
  limiteSolicitado: number;
  identidad: VeredictoIdentidad;
  buro: ReporteBuro;
  /** Historial interno del registro externo. Null si es cliente nuevo. */
  historial: ResumenCarteraCliente | null;
  /** Techo que la empresa permite otorgar sin comité. */
  topeAutomatico: number;
}

export interface ResultadoDecision {
  veredicto: VeredictoCredito;
  limiteSugerido: number;
  puntaje: number;
  motivos: string[];
}

/**
 * Reglas de originación, como función pura.
 *
 * Se mantiene separada del servicio para que sea auditable y probable sin
 * levantar nada: una política de crédito enterrada en llamadas HTTP es una
 * política que nadie puede revisar. El orden importa — las causales de rechazo
 * duro se evalúan primero y cortan.
 */
export function decidir(entrada: EntradaDecision): ResultadoDecision {
  const motivos: string[] = [];
  const solicitado = Math.max(0, Number(entrada.limiteSolicitado) || 0);

  // ── Puertas duras ────────────────────────────────────────────────────────
  if (entrada.identidad.resultado === ResultadoIdentidad.RECHAZADA) {
    return {
      veredicto: VeredictoCredito.RECHAZADO,
      limiteSugerido: 0,
      puntaje: 0,
      motivos: [
        'La validación de identidad fue rechazada.',
        ...entrada.identidad.motivos,
      ],
    };
  }

  if (entrada.identidad.resultado !== ResultadoIdentidad.VERIFICADA) {
    return {
      veredicto: VeredictoCredito.REVISION_MANUAL,
      limiteSugerido: 0,
      puntaje: 0,
      motivos: [
        entrada.identidad.resultado === ResultadoIdentidad.NO_INICIADA
          ? 'No se ha validado la identidad del cliente.'
          : 'La validación de identidad no fue concluyente.',
        ...entrada.identidad.motivos,
      ],
    };
  }

  const atrasoInterno = entrada.historial?.diasAtrasoMaximo ?? 0;
  if (atrasoInterno >= 90) {
    return {
      veredicto: VeredictoCredito.RECHAZADO,
      limiteSugerido: 0,
      puntaje: 0,
      motivos: [
        `El cliente arrastra ${atrasoInterno} días de atraso en su cartera actual.`,
      ],
    };
  }

  // ── Puntaje ──────────────────────────────────────────────────────────────
  let puntaje = 50;

  puntaje += Math.round((entrada.identidad.puntaje / 100) * 15);
  motivos.push(
    `Identidad verificada por ${entrada.identidad.proveedor} (${entrada.identidad.puntaje}/100).`,
  );

  if (entrada.buro.disponible && entrada.buro.puntaje !== null) {
    // Un puntaje de buró se normaliza a la banda 300–850 usual en México.
    const normalizado = Math.min(
      1,
      Math.max(0, (entrada.buro.puntaje - 300) / 550),
    );
    puntaje += Math.round(normalizado * 30) - 10;
    motivos.push(`Buró de crédito: ${entrada.buro.puntaje}.`);

    if ((entrada.buro.peorAtrasoDias ?? 0) >= 90) {
      puntaje -= 20;
      motivos.push(
        `Atraso histórico externo de ${entrada.buro.peorAtrasoDias} días.`,
      );
    }
  } else {
    puntaje -= 5;
    motivos.push('Sin información de buró de crédito.');
  }

  if (!entrada.historial || entrada.historial.creditosActivos === 0) {
    puntaje -= 5;
    motivos.push('Cliente sin historial interno.');
  } else if (atrasoInterno === 0) {
    puntaje += 15;
    motivos.push('Historial interno al corriente.');
  } else {
    puntaje -= Math.min(25, Math.round(atrasoInterno / 3));
    motivos.push(`Atraso interno vigente de ${atrasoInterno} días.`);
  }

  puntaje = Math.max(0, Math.min(100, puntaje));

  // ── Resolución ───────────────────────────────────────────────────────────
  if (puntaje < 40) {
    return {
      veredicto: VeredictoCredito.RECHAZADO,
      limiteSugerido: 0,
      puntaje,
      motivos,
    };
  }

  // El límite otorgado escala con el puntaje, no es todo o nada.
  const factor = puntaje >= 75 ? 1 : puntaje >= 55 ? 0.6 : 0.3;
  const porPuntaje = Math.round(solicitado * factor);
  const limiteSugerido = Math.min(porPuntaje, entrada.topeAutomatico);

  if (limiteSugerido <= 0) {
    return {
      veredicto: VeredictoCredito.REVISION_MANUAL,
      limiteSugerido: 0,
      puntaje,
      motivos: [...motivos, 'El tope automático de la empresa es cero.'],
    };
  }

  if (solicitado > entrada.topeAutomatico) {
    motivos.push(
      `Lo solicitado excede el tope automático de ${entrada.topeAutomatico}; requiere autorización.`,
    );
    return {
      veredicto: VeredictoCredito.REVISION_MANUAL,
      limiteSugerido,
      puntaje,
      motivos,
    };
  }

  return {
    veredicto:
      limiteSugerido < solicitado
        ? VeredictoCredito.APROBADO_CON_AJUSTE
        : VeredictoCredito.APROBADO,
    limiteSugerido,
    puntaje,
    motivos,
  };
}

/**
 * Orquesta la originación: reúne evidencia de los puertos y aplica la política.
 *
 * No escribe nada. Quien decide qué hacer con el veredicto es el flujo de
 * aprobaciones del ERP, que ya existe y ya tiene la matriz de autorizadores.
 */
@Injectable()
export class DecisionCreditoService {
  private readonly logger = new Logger(DecisionCreditoService.name);

  constructor(
    @Inject(PUERTO_VALIDACION_IDENTIDAD)
    private readonly identidad: PuertoValidacionIdentidad,
    @Inject(PUERTO_BURO_CREDITO)
    private readonly buro: PuertoBuroCredito,
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
  ) {}

  async evaluar(entrada: {
    empresaId: string;
    clienteId: string;
    nombre: string;
    rfc?: string | null;
    curp?: string | null;
    limiteSolicitado: number;
    topeAutomatico: number;
    folioAutorizacionBuro?: string | null;
    /** Id del cliente en el registro externo, si ya está replicado. */
    clienteIdExterno?: string | null;
  }): Promise<ResultadoDecision> {
    const historial = await this.historial(entrada.clienteIdExterno);

    const identidad =
      (await this.identidad.consultar(entrada.empresaId, entrada.clienteId)) ??
      (await this.identidad.validar({
        empresaId: entrada.empresaId,
        clienteId: entrada.clienteId,
        nombre: entrada.nombre,
        rfc: entrada.rfc,
        curp: entrada.curp,
      }));

    // Sin autorización firmada del titular no se consulta buró. No es una
    // preferencia de diseño: es un requisito legal.
    const buro = entrada.folioAutorizacionBuro
      ? await this.buro.consultar({
          empresaId: entrada.empresaId,
          clienteId: entrada.clienteId,
          rfc: entrada.rfc,
          curp: entrada.curp,
          folioAutorizacion: entrada.folioAutorizacionBuro,
        })
      : {
          disponible: false,
          puntaje: null,
          deudaTotal: null,
          peorAtrasoDias: null,
          proveedor: 'ninguno',
          consultadoEn: null,
          motivos: ['Sin autorización del titular para consultar buró.'],
        };

    return decidir({
      limiteSolicitado: entrada.limiteSolicitado,
      identidad,
      buro,
      historial,
      topeAutomatico: entrada.topeAutomatico,
    });
  }

  /**
   * El historial no se exige: un cliente nuevo, o un registro externo caído, no
   * son razón para negarse a evaluar. Pesan en el puntaje, no bloquean.
   */
  private async historial(
    clienteIdExterno?: string | null,
  ): Promise<ResumenCarteraCliente | null> {
    if (!clienteIdExterno || !this.externa.disponible()) return null;
    try {
      return await this.externa.resumenCliente(clienteIdExterno);
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el historial de ${clienteIdExterno}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
