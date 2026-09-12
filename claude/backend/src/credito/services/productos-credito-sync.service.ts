import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CuotaProyectada,
  ErrorIntegracionExterna,
  ProductoCreditoExterno,
  PuertoCarteraExterna,
} from '../../integracion/ports/cartera-externa.port';
import {
  ModoCartera,
  PUERTO_CARTERA_EXTERNA,
  TipoVinculo,
} from '../../integracion/integracion.constants';
import { IntegracionModoService } from '../../integracion/services/integracion-modo.service';
import { IntegracionVinculosService } from '../../integracion/services/integracion-vinculos.service';
import {
  EstadoProductoCredito,
  OrigenProductoCredito,
  ProductoCredito,
  UnidadPlazo,
} from '../entities/producto-credito.entity';
import { ProductosCreditoService } from './productos-credito.service';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';
import { CreditosService } from './creditos.service';
import { PoliticaVencimientoService } from './politica-vencimiento.service';

/**
 * ============================================================================
 * Correspondencia del catálogo entre el ERP y el registro externo
 * ----------------------------------------------------------------------------
 * Este servicio es el ÚNICO punto donde el catálogo comercial se encuentra con
 * el proveedor. El catálogo en sí —`ProductosCreditoService`— no sabe que
 * Fineract existe, que es lo que permite que una empresa sin registro externo
 * tenga su catálogo completo y venda con él.
 *
 * Tres operaciones, en este orden:
 *
 *   1. `sincronizar` — que el producto exista en los dos lados. En los dos
 *      sentidos: lo que se dio de alta aquí se crea allá, y lo que ya existía
 *      allá se importa aquí en borrador. Nace de una asimetría real: Fineract
 *      es un sistema completo y alguien pudo haber capturado productos por su
 *      interfaz.
 *
 *   2. `verificar` — que los dos calculen la MISMA tabla. Es el paso que no
 *      existía y costó caro: durante semanas los importes cuadraron peso por
 *      peso mientras los créditos a 30, 60 y 90 días vencían todos el mismo día
 *      del otro lado. Un producto mal traducido no truena: cobra mal, en
 *      silencio, durante meses.
 *
 *   3. `activar` — que no se pueda vender hasta que 1 y 2 hayan pasado. Es
 *      donde la verificación deja de ser un informe y se vuelve una condición.
 * ============================================================================
 */

/** Diferencia máxima tolerada por cuota. Menos que un centavo es redondeo. */
const TOLERANCIA = 0.01;

/**
 * Resultado de comparar las dos tablas.
 *
 * `aplicable: false` no es un fallo: es una empresa sin registro externo, donde
 * no hay contra qué comparar y el ERP se basta solo. Distinguirlo de `cuadra:
 * false` importa, porque uno se resuelve activando y el otro arreglando.
 */
export interface ResultadoVerificacion {
  aplicable: boolean;
  motivo?: string;
  cuadra?: boolean;
  capital?: number;
  numeroCuotas?: number;
  fechaInicio?: string;
  idExterno?: string;
  error?: string;
  diferencias?: Record<string, unknown>[];
  verificadoEn?: string;
}

@Injectable()
export class ProductosCreditoSyncService {
  private readonly logger = new Logger(ProductosCreditoSyncService.name);

  constructor(
    private readonly catalogo: ProductosCreditoService,
    private readonly creditos: CreditosService,
    private readonly vencimientos: PoliticaVencimientoService,
    private readonly vinculos: IntegracionVinculosService,
    private readonly modos: IntegracionModoService,
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externo: PuertoCarteraExterna,
  ) {}

  /**
   * ¿Esta empresa tiene el registro externo contratado?
   *
   * De aquí salen las dos mitades de la regla: con externo, el catálogo tiene
   * que corresponder; sin externo, las dos plataformas son independientes y el
   * ERP es autosuficiente.
   */
  async exigeCorrespondencia(empresaId: string): Promise<boolean> {
    const modo = await this.modos.modoDe(empresaId);
    return modo !== ModoCartera.APAGADO;
  }

  async idExterno(
    empresaId: string,
    productoId: string,
  ): Promise<string | null> {
    return this.vinculos.idExterno(
      empresaId,
      TipoVinculo.PRODUCTO_CREDITO,
      productoId,
    );
  }

  // ── 1. Sincronizar ───────────────────────────────────────────────────────

  async sincronizar(
    empresaId: string,
    opciones: { simular?: boolean } = {},
  ) {
    if (!(await this.exigeCorrespondencia(empresaId))) {
      return {
        aplicable: false,
        motivo:
          'La empresa no lleva su cartera en un registro externo. Su catálogo de crédito es independiente y no hay nada que sincronizar.',
        publicados: [],
        importados: [],
        problemas: [],
      };
    }
    if (!this.externo.configurado() || !this.externo.disponible()) {
      throw new BadRequestException(
        'El registro externo de cartera no responde ahora mismo. Vuelve a intentarlo cuando esté disponible.',
      );
    }

    const locales = await this.catalogo.listar(empresaId);
    const remotos = await this.externo.listarProductosCredito(empresaId);

    const publicados: Record<string, unknown>[] = [];
    const importados: Record<string, unknown>[] = [];
    const problemas: Record<string, unknown>[] = [];

    // ── ERP → externo ──────────────────────────────────────────────────────
    for (const producto of locales) {
      try {
        if (await this.idExterno(empresaId, producto.id)) continue;

        if (opciones.simular) {
          publicados.push({ codigo: producto.codigo, accion: 'SE_CREARIA' });
          continue;
        }

        const creado = await this.externo.crearProductoCredito({
          empresaId,
          productoId: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          unidadPlazo: producto.unidadPlazo,
          cadaCuantos: producto.cadaCuantos,
          cuotasMinimas: producto.cuotasMinimas,
          cuotasMaximas: producto.cuotasMaximas,
          sinInteres: producto.sinInteres,
          tasaInteresMensual: Number(producto.tasaInteresMensual),
          moneda: producto.moneda,
        });

        await this.vinculos.vincular({
          empresaId,
          tipo: TipoVinculo.PRODUCTO_CREDITO,
          entidadId: producto.id,
          idExterno: creado.idExterno,
          proveedor: this.externo.proveedor,
        });

        publicados.push({
          codigo: producto.codigo,
          nombre: producto.nombre,
          idExterno: creado.idExterno,
        });
      } catch (error) {
        problemas.push({
          codigo: producto.codigo,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ── Externo → ERP ──────────────────────────────────────────────────────
    //
    // Lo que existe allá y aquí no, entra como BORRADOR. No se activa solo: un
    // producto capturado en el otro sistema no trae detrás la política de
    // crédito ni el flujo de validación de esta empresa, y ponerlo a la venta
    // sin que nadie lo mire sería regalar crédito con reglas ajenas.
    const vinculados = new Set<string>();
    for (const producto of locales) {
      const id = await this.idExterno(empresaId, producto.id);
      if (id) vinculados.add(id);
    }

    for (const remoto of remotos) {
      if (vinculados.has(remoto.idExterno)) continue;
      try {
        if (opciones.simular) {
          importados.push({ nombre: remoto.nombre, accion: 'SE_IMPORTARIA' });
          continue;
        }
        const fila = await this.importar(empresaId, remoto);
        importados.push({
          codigo: fila.codigo,
          nombre: fila.nombre,
          idExterno: remoto.idExterno,
          estado: fila.estado,
        });
      } catch (error) {
        problemas.push({
          nombre: remoto.nombre,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      aplicable: true,
      simulacion: opciones.simular === true,
      publicados,
      importados,
      problemas,
    };
  }

  private async importar(
    empresaId: string,
    remoto: ProductoCreditoExterno,
  ): Promise<ProductoCredito> {
    const codigo = await this.codigoLibre(empresaId, remoto);

    const fila = await this.catalogo.crear(
      empresaId,
      {
        codigo,
        nombre: remoto.nombre,
        descripcion: `Importado del registro externo (id ${remoto.idExterno}). Revisa plazo, tasa y validaciones antes de activarlo.`,
        unidadPlazo:
          remoto.unidadPlazo === 'DIAS' ? UnidadPlazo.DIAS : UnidadPlazo.MESES,
        cadaCuantos: Math.max(1, remoto.cadaCuantos),
        cuotasMinimas: Math.max(1, remoto.cuotasMinimas),
        cuotasMaximas: Math.max(remoto.cuotasMinimas, remoto.cuotasMaximas),
        sinInteres: remoto.sinInteres,
        tasaInteresMensual: remoto.sinInteres ? 0 : remoto.tasaInteresMensual,
        moneda: remoto.moneda,
      },
      OrigenProductoCredito.EXTERNO,
    );

    await this.vinculos.vincular({
      empresaId,
      tipo: TipoVinculo.PRODUCTO_CREDITO,
      entidadId: fila.id,
      idExterno: remoto.idExterno,
      proveedor: this.externo.proveedor,
    });

    return fila;
  }

  /**
   * Código derivado del externo, sin pisar uno que la empresa ya use.
   *
   * `exceptoId` es el producto que se está renombrando: sin él, recodificar dos
   * veces encuentra el producto a sí mismo, cree que el código está ocupado y
   * le cuelga un sufijo. Se ve feo y además cambia en cada corrida.
   */
  private async codigoLibre(
    empresaId: string,
    remoto: ProductoCreditoExterno,
    exceptoId?: string,
  ): Promise<string> {
    // Se deriva del NOMBRE, no del nombre corto del proveedor: «E826» no le
    // dice nada a quien abra el catálogo. El nombre corto queda de respaldo.
    const base =
      (remoto.nombre || remoto.codigo || '')
        // Los acentos se descomponen y se quitan; si no, «CRÉDITO» acaba en
        // «CR-DITO», que es peor que no traducirlo.
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase()
        .slice(0, 24) || `EXT-${remoto.idExterno}`;

    const choca = await this.catalogo.porCodigo(empresaId, base);
    if (!choca || choca.id === exceptoId) return base;
    return `${base}-${remoto.idExterno}`.slice(0, 30);
  }

  /**
   * Repara los códigos de los productos importados.
   *
   * La primera versión de la importación tomaba el nombre corto del proveedor
   * —«E826», «MTR1»—, que no le dice nada a nadie. Esto los vuelve a derivar
   * del nombre. Sólo toca productos importados que sigan en borrador: uno que
   * ya se activó tiene ese código impreso en los dos catálogos.
   */
  async recodificarImportados(empresaId: string) {
    const remotos = await this.externo.listarProductosCredito(empresaId);
    const porId = new Map(remotos.map((r) => [r.idExterno, r]));
    const cambios: Record<string, string>[] = [];

    for (const producto of await this.catalogo.listar(empresaId)) {
      if (producto.origen !== OrigenProductoCredito.EXTERNO) continue;
      if (producto.estado === EstadoProductoCredito.ACTIVO) continue;

      const idExterno = await this.idExterno(empresaId, producto.id);
      const remoto = idExterno ? porId.get(idExterno) : undefined;
      if (!remoto) continue;

      const propuesto = await this.codigoLibre(empresaId, remoto, producto.id);
      if (propuesto === producto.codigo) continue;

      await this.catalogo.renombrarCodigo(empresaId, producto.id, propuesto);
      cambios.push({ antes: producto.codigo, ahora: propuesto });
    }
    return cambios;
  }

  /**
   * Regresa a borrador los productos importados que estén activos.
   *
   * Existe porque el catálogo de un registro externo que lleva tiempo en uso
   * trae de todo: pruebas de integración, productos abandonados, ensayos de
   * alguien. Que existan allá no es razón para venderlos aquí.
   */
  async suspenderImportados(empresaId: string) {
    const suspendidos: string[] = [];
    for (const p of await this.catalogo.listar(empresaId)) {
      if (p.origen !== OrigenProductoCredito.EXTERNO) continue;
      if (p.estado !== EstadoProductoCredito.ACTIVO) continue;
      await this.catalogo.suspender(empresaId, p.id);
      suspendidos.push(p.codigo);
    }
    return suspendidos;
  }

  // ── 2. Verificar ─────────────────────────────────────────────────────────

  /**
   * Manda una amortización de prueba a los dos sistemas y las compara cuota por
   * cuota: número, fecha e importes.
   *
   * El capital de prueba no es redondo a propósito: 12,345.67 saca a la luz
   * diferencias de redondeo que 10,000 esconde.
   */
  async verificar(
    empresaId: string,
    productoId: string,
  ): Promise<ResultadoVerificacion> {
    const producto = await this.catalogo.obtener(empresaId, productoId);

    if (!(await this.exigeCorrespondencia(empresaId))) {
      return {
        aplicable: false,
        motivo:
          'La empresa no lleva su cartera en un registro externo: no hay contra qué verificar. El producto se activa con la definición del ERP.',
      };
    }

    const idExterno = await this.idExterno(empresaId, productoId);
    if (!idExterno) {
      throw new BadRequestException(
        `${producto.codigo} no existe todavía en el registro externo. Sincroniza el catálogo antes de verificarlo.`,
      );
    }

    const capital = 12345.67;
    const numeroCuotas = producto.cuotasMaximas > 1
      ? Math.min(producto.cuotasMaximas, Math.max(producto.cuotasMinimas, 6))
      : 1;
    let fechaInicio = diaCalendario(new Date());

    /*
     * Fineract exige un cliente para proyectar aunque no cree nada. Se usa
     * cualquiera de los ya replicados: lo que se compara es la FORMA de la
     * tabla, no de quién es. Si la empresa no tiene ninguno replicado todavía,
     * no se puede verificar, y decirlo así es mejor que dejar el producto en
     * un limbo sin explicación.
     */
    const clientes = await this.vinculos.clientesVinculados(empresaId);
    const clienteIdExterno =
      clientes.find((c) => c.idExterno)?.idExterno ?? null;
    if (!clienteIdExterno) {
      const detalle = {
        error:
          'No hay ningún cliente replicado en el registro externo, y sin cliente no se puede pedir una amortización de prueba. Replica al menos un cliente y vuelve a verificar.',
        capital,
        numeroCuotas,
        fechaInicio,
      };
      await this.catalogo.registrarVerificacion(empresaId, productoId, {
        cuadra: false,
        detalle,
      });
      return { aplicable: true, cuadra: false, ...detalle, diferencias: [] };
    }

    let nuestra: ReturnType<CreditosService['calcularAmortizacion']>;
    let suya: CuotaProyectada[];
    try {
      // La activación remota puede caer en el día siguiente por la zona horaria.
      // Es una simulación: ambos motores deben usar la misma fecha válida.
      const minima = await this.externo.fechaMinimaProyeccion?.(clienteIdExterno);
      if (minima && minima > fechaInicio) fechaInicio = minima;
      const ajustar = await this.vencimientos.ajustadorDe(empresaId);
      nuestra = this.creditos.calcularAmortizacion(
        {
          capital,
          numeroCuotas,
          tasaInteresMensual: Number(producto.tasaInteresMensual),
          sinInteres: producto.sinInteres,
          fechaInicio,
          // El plazo sale del producto. Deducirlo de `tipoCreditoHeredado` sería
          // volver a la deducción que causó el problema que esto viene a evitar,
          // y además los productos importados no tienen tipo heredado.
          unidadPlazo: producto.unidadPlazo,
          cadaCuantos: producto.cadaCuantos,
        },
        ajustar,
      );

      // No se manda la tasa ni el tipo de interés: los toma de su propio
      // producto. Si se los mandáramos, estaríamos comparando el ERP contra sí
      // mismo con pasos extra.
      suya = await this.externo.proyectarAmortizacion({
        empresaId,
        productoIdExterno: idExterno,
        capital,
        numeroCuotas,
        fechaInicio,
        clienteIdExterno,
      });
    } catch (error) {
      const mensaje =
        error instanceof ErrorIntegracionExterna || error instanceof Error
          ? error.message
          : String(error);
      const detalle = { error: mensaje, capital, numeroCuotas, fechaInicio };
      await this.catalogo.registrarVerificacion(empresaId, productoId, {
        cuadra: false,
        detalle,
      });
      return { aplicable: true, cuadra: false, ...detalle, diferencias: [] };
    }

    const diferencias: Record<string, unknown>[] = [];

    if (suya.length !== nuestra.length) {
      diferencias.push({
        campo: 'numeroDeCuotas',
        erp: nuestra.length,
        externo: suya.length,
      });
    }

    for (const cuota of nuestra) {
      const par = suya.find((s) => s.numeroCuota === cuota.numeroCuota);
      if (!par) {
        diferencias.push({
          cuota: cuota.numeroCuota,
          campo: 'existencia',
          erp: 'presente',
          externo: 'ausente',
        });
        continue;
      }
      const nuestraFecha = this.dia(cuota.fechaVencimiento);
      if (nuestraFecha !== par.fechaVencimiento) {
        diferencias.push({
          cuota: cuota.numeroCuota,
          campo: 'fechaVencimiento',
          erp: nuestraFecha,
          externo: par.fechaVencimiento,
        });
      }
      for (const [campo, aqui, alla] of [
        ['montoCapital', cuota.montoCapital, par.montoCapital],
        ['montoInteres', cuota.montoInteres, par.montoInteres],
        ['montoCuota', cuota.montoCuota, par.montoCuota],
      ] as const) {
        if (Math.abs(Number(aqui) - Number(alla)) >= TOLERANCIA) {
          diferencias.push({
            cuota: cuota.numeroCuota,
            campo,
            erp: Number(aqui),
            externo: Number(alla),
          });
        }
      }
    }

    const cuadra = diferencias.length === 0;
    const detalle = {
      capital,
      numeroCuotas,
      fechaInicio,
      idExterno,
      diferencias,
      verificadoEn: new Date().toISOString(),
    };

    await this.catalogo.registrarVerificacion(empresaId, productoId, {
      cuadra,
      detalle,
    });

    if (!cuadra) {
      this.logger.warn(
        `El producto ${producto.codigo} no corresponde con el registro externo: ${diferencias.length} diferencia(s).`,
      );
    }

    return { aplicable: true, cuadra, ...detalle };
  }

  // ── 3. Activar ───────────────────────────────────────────────────────────

  /**
   * Deja el producto vendible, aplicando la regla que corresponda a la empresa.
   *
   * Sin registro externo se activa con la sola definición del ERP —que es
   * completa—. Con registro externo hace falta el vínculo y la verificación.
   * Nadie tiene que acordarse de esa distinción: se resuelve aquí, con el modo
   * de la empresa.
   */
  async activar(empresaId: string, productoId: string) {
    const exigir = await this.exigeCorrespondencia(empresaId);
    const vinculo = exigir ? await this.idExterno(empresaId, productoId) : null;
    return this.catalogo.activar(empresaId, productoId, exigir, !!vinculo);
  }

  /**
   * Estado de la correspondencia, producto por producto. Es lo que contesta
   * «¿qué me falta para poder vender esto?».
   */
  async estado(empresaId: string) {
    const exigir = await this.exigeCorrespondencia(empresaId);
    const productos = await this.catalogo.listar(empresaId);

    const filas = [];
    for (const p of productos) {
      const idExterno = await this.idExterno(empresaId, p.id);
      filas.push({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        origen: p.origen,
        plazo: `${p.cadaCuantos} ${p.unidadPlazo.toLowerCase()}`,
        cuotas: `${p.cuotasMinimas}-${p.cuotasMaximas}`,
        tasaInteresMensual: Number(p.tasaInteresMensual),
        idExterno,
        verificadoEn: p.verificadoEn,
        vendible:
          p.estado === EstadoProductoCredito.ACTIVO &&
          (!exigir || (!!idExterno && !!p.verificadoEn)),
        falta: this.queFalta(p, exigir, idExterno),
      });
    }

    return { exigeCorrespondencia: exigir, productos: filas };
  }

  private queFalta(
    p: ProductoCredito,
    exigir: boolean,
    idExterno: string | null,
  ): string | null {
    // Suspendido se contesta primero: es una decisión de alguien, no un
    // requisito pendiente. Decirle «verifica la correspondencia» a un producto
    // que el dueño apagó a propósito manda a arreglar lo que no está roto.
    if (p.estado === EstadoProductoCredito.SUSPENDIDO) return 'Está suspendido.';
    if (exigir && !idExterno) return 'Sincronizar con el registro externo.';
    if (exigir && !p.verificadoEn) return 'Verificar la correspondencia.';
    if (p.estado === EstadoProductoCredito.BORRADOR) return 'Activarlo.';
    return null;
  }

  private dia(fecha: Date | string): string {
    return diaCalendario(fecha);
  }
}
