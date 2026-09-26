import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ESTADOS_REQUISICION } from '../../compras/entities/requisicion.entity';
import { ESTADOS_OC } from '../../compras/entities/orden-compra.entity';
import { ESTADOS_COTIZACION } from '../../compras/entities/cotizacion.entity';
import { EstadoTransferenciaInventario } from '../../catalogo/entities/transferencia-inventario.entity';
import { EstadoConteoInventario } from '../../catalogo/entities/conteo-inventario.entity';
import { EstadoCredito } from '../../credito/entities/credito-cliente.entity';
import { EstadoConvenioHotel } from '../../hoteleria/entities/city-ledger.entity';

export interface PendienteOperacion {
  codigo: string;
  modulo: 'COMPRAS' | 'INVENTARIO' | 'CREDITO' | 'CONTABILIDAD' | 'VENTAS' | 'HOTELERIA';
  titulo: string;
  cantidad: number;
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  responsable: string;
  accion: string;
  ruta: string;
}

interface EsquemaCache {
  expiraEn: number;
  tablas: Set<string>;
  columnas: Map<string, Set<string>>;
}

/**
 * ============================================================================
 * Los pendientes del día, y el vocabulario con el que se cuentan
 * ----------------------------------------------------------------------------
 * Cada control busca filas por su ESTADO. Si el estado que nombra no es uno de
 * los que esa tabla escribe, la consulta es válida, la tabla existe, la columna
 * existe… y el resultado es cero en cualquier base del mundo. No falla, no se
 * registra, y el panel informa con toda confianza que no hay nada pendiente.
 *
 * Medido el 25-sep-2026: «Requisiciones pendientes de aprobación» buscaba
 * PENDIENTE_APROBACION y EN_APROBACION —ninguno existe; el estado real es
 * PENDIENTE— y «Órdenes pendientes de envío» buscaba BORRADOR y GENERADA, que
 * tampoco existen. Los dos controles llevaban desde siempre contando cero.
 *
 * Por eso cada definición declara ahora su `vocabulario`: la lista real de
 * estados de esa tabla, tomada de la entidad. La prueba
 * `un-estado-que-nadie-escribe.spec.ts` compara lo uno contra lo otro.
 * ============================================================================
 */
export interface DefinicionPendiente
  extends Omit<PendienteOperacion, 'cantidad'> {
  tabla: string;
  estados: string[];
  columnaEstado?: string;
  /** Los estados que esa tabla sí puede tener. */
  vocabulario: readonly string[];
}

/** El maker-checker de la propuesta de línea, en `clientes.estadoSolicitudCredito`. */
export const ESTADOS_SOLICITUD_CREDITO = [
  'NINGUNA',
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'CANCELADA',
] as const;

export const DEFINICIONES_PENDIENTES: DefinicionPendiente[] = [
  { codigo:'REQ_APROBAR', modulo:'COMPRAS', titulo:'Requisiciones pendientes de aprobación', tabla:'requisiciones', estados:['PENDIENTE'], prioridad:'ALTA', responsable:'Aprobadores de compras', accion:'Revisar y resolver requisiciones', ruta:'/dashboard/compras/aprobaciones', vocabulario: ESTADOS_REQUISICION as readonly string[] },
  { codigo:'COT_ADJUDICAR', modulo:'COMPRAS', titulo:'Cotizaciones pendientes de adjudicación', tabla:'cotizaciones', estados:['PENDIENTE_APROBACION'], prioridad:'ALTA', responsable:'Aprobador de adjudicación', accion:'Comparar y aprobar proveedor', ruta:'/dashboard/compras/cotizaciones', vocabulario: ESTADOS_COTIZACION as readonly string[] },
  { codigo:'OC_ENVIAR', modulo:'COMPRAS', titulo:'Órdenes pendientes de envío', tabla:'ordenes_compra', estados:['PENDIENTE'], prioridad:'MEDIA', responsable:'Comprador', accion:'Enviar orden al proveedor', ruta:'/dashboard/compras/ordenes', vocabulario: ESTADOS_OC as readonly string[] },
  { codigo:'OC_RECIBIR', modulo:'COMPRAS', titulo:'Órdenes pendientes de recepción', tabla:'ordenes_compra', estados:['ENVIADA','CON_INCIDENCIAS'], prioridad:'ALTA', responsable:'Almacén receptor', accion:'Registrar recepción', ruta:'/dashboard/inventario/recepciones', vocabulario: ESTADOS_OC as readonly string[] },
  { codigo:'TRF_AUTORIZAR', modulo:'INVENTARIO', titulo:'Transferencias pendientes de autorización', tabla:'transferencias_inventario', estados:['SOLICITADA'], prioridad:'ALTA', responsable:'Responsable de almacén', accion:'Autorizar o cancelar transferencia', ruta:'/dashboard/inventario/transferencias', vocabulario: Object.values(EstadoTransferenciaInventario) as readonly string[] },
  { codigo:'TRF_RECIBIR', modulo:'INVENTARIO', titulo:'Transferencias en tránsito', tabla:'transferencias_inventario', estados:['EN_TRANSITO'], prioridad:'ALTA', responsable:'Almacén destino', accion:'Confirmar recepción', ruta:'/dashboard/inventario/transferencias', vocabulario: Object.values(EstadoTransferenciaInventario) as readonly string[] },
  { codigo:'CONTEO_CERRAR', modulo:'INVENTARIO', titulo:'Conteos físicos abiertos', tabla:'conteos_inventario', estados:['BORRADOR','ABIERTO','EN_CONTEO','PENDIENTE_AUTORIZACION'], prioridad:'MEDIA', responsable:'Supervisor de inventario', accion:'Completar o autorizar conteo', ruta:'/dashboard/inventario/conteos', vocabulario: Object.values(EstadoConteoInventario) as readonly string[] },
  { codigo:'CRED_APROBAR', modulo:'CREDITO', titulo:'Propuestas de crédito pendientes de aprobación', tabla:'clientes', columnaEstado:'estadoSolicitudCredito', estados:['PENDIENTE'], prioridad:'ALTA', responsable:'Aprobadores de crédito', accion:'Revisar condiciones propuestas sin sustituir la línea vigente', ruta:'/dashboard/aprobaciones', vocabulario: ESTADOS_SOLICITUD_CREDITO as readonly string[] },
  { codigo:'HOTEL_CONVENIO_APROBAR', modulo:'HOTELERIA', titulo:'Convenios hoteleros pendientes de aprobación', tabla:'hoteleria_convenios_credito', estados:['PENDIENTE'], prioridad:'ALTA', responsable:'Aprobadores de convenios', accion:'Revisar convenio y segregación de funciones', ruta:'/dashboard/aprobaciones', vocabulario: Object.values(EstadoConvenioHotel) as readonly string[] },
  { codigo:'CRED_VENCIDO', modulo:'CREDITO', titulo:'Créditos vencidos por gestionar', tabla:'creditos_clientes', estados:['VENCIDO'], prioridad:'ALTA', responsable:'Cobranza', accion:'Gestionar cartera vencida', ruta:'/dashboard/creditos/cartera-vencida', vocabulario: Object.values(EstadoCredito) as readonly string[] },
];

@Injectable()
export class OperacionesPendientesService {
  private esquema: EsquemaCache | null = null;
  private readonly ttlEsquemaMs = Math.max(
    60_000,
    Number(process.env.SCHEMA_CACHE_TTL_MS ?? 10 * 60_000),
  );

  constructor(private readonly ds: DataSource) {}

  /**
   * El esquema no cambia en cada visita al dashboard. Antes se ejecutaban más
   * de veinte consultas a INFORMATION_SCHEMA por petición; ahora se obtiene en
   * una sola consulta y se conserva con TTL.
   */
  private async cargarEsquema(): Promise<EsquemaCache> {
    if (this.esquema && this.esquema.expiraEn > Date.now()) {
      return this.esquema;
    }
    const filas = await this.ds.query<Array<{
      tabla: string;
      columna: string | null;
    }>>(`
      SELECT t.TABLE_NAME tabla, c.COLUMN_NAME columna
        FROM INFORMATION_SCHEMA.TABLES t
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c
          ON c.TABLE_SCHEMA=t.TABLE_SCHEMA AND c.TABLE_NAME=t.TABLE_NAME
       WHERE t.TABLE_TYPE='BASE TABLE'
    `);
    const tablas = new Set<string>();
    const columnas = new Map<string, Set<string>>();
    for (const fila of filas) {
      const tabla = String(fila.tabla).toLowerCase();
      tablas.add(tabla);
      const set = columnas.get(tabla) ?? new Set<string>();
      if (fila.columna) set.add(String(fila.columna).toLowerCase());
      columnas.set(tabla, set);
    }
    this.esquema = {
      expiraEn: Date.now() + this.ttlEsquemaMs,
      tablas,
      columnas,
    };
    return this.esquema;
  }

  private async contar(
    tabla: string,
    empresaId: string,
    estados: string[],
    esquema: EsquemaCache,
    columnaEstado = 'estado',
  ): Promise<number | null> {
    const clave = tabla.toLowerCase();
    if (!esquema.tablas.has(clave)) return null;
    const columnas = esquema.columnas.get(clave) ?? new Set<string>();
    const estadoNormalizado = columnaEstado.toLowerCase();
    if (!columnas.has(estadoNormalizado)) return null;
    const tieneEmpresa = columnas.has('empresaid');
    // Los nombres de tabla provienen de una lista estática del servidor, no de
    // la entrada del usuario. Aun así se limita el formato por defensa extra.
    if (
      !/^[a-z0-9_]+$/i.test(tabla) ||
      !/^[a-z0-9_]+$/i.test(columnaEstado)
    ) return null;
    const params: unknown[] = tieneEmpresa ? [empresaId, ...estados] : estados;
    const offset = tieneEmpresa ? 1 : 0;
    const placeholders = estados.map((_, i) => `$${i + offset + 1}`).join(',');
    const whereEmpresa = tieneEmpresa ? 'empresaId=$1 AND ' : '';
    const filas = await this.ds.query(
      `SELECT COUNT(1) total FROM "${tabla.toLowerCase()}" WHERE ${whereEmpresa}"${columnaEstado.toLowerCase()}" IN (${placeholders})`,
      params,
    );
    return Number(filas?.[0]?.total ?? 0);
  }

  async obtener(empresaId: string) {
    const definiciones = DEFINICIONES_PENDIENTES;

    const esquema = await this.cargarEsquema();
    const resultados = await Promise.all(
      definiciones.map(async (definicion) => {
        try {
          const cantidad = await this.contar(
            definicion.tabla,
            empresaId,
            definicion.estados,
            esquema,
            definicion.columnaEstado,
          );
          return { definicion, cantidad };
        } catch {
          return { definicion, cantidad: null };
        }
      }),
    );

    const pendientes: PendienteOperacion[] = [];
    const noVerificados: string[] = [];
    for (const { definicion, cantidad } of resultados) {
      if (cantidad === null) {
        noVerificados.push(definicion.codigo);
      } else if (cantidad > 0) {
        /*
         * Se publica sólo lo que la pantalla necesita. Extender la definición
         * entera sacaba a la respuesta el nombre de la tabla, la lista de
         * estados y el vocabulario: detalles internos que ni sirven ahí ni
         * conviene que viajen.
         */
        pendientes.push({
          codigo: definicion.codigo,
          modulo: definicion.modulo,
          titulo: definicion.titulo,
          prioridad: definicion.prioridad,
          responsable: definicion.responsable,
          accion: definicion.accion,
          ruta: definicion.ruta,
          cantidad,
        });
      }
    }
    const orden = { ALTA: 0, MEDIA: 1, BAJA: 2 } as const;
    pendientes.sort(
      (a, b) =>
        orden[a.prioridad] - orden[b.prioridad] || b.cantidad - a.cantidad,
    );
    return {
      total: pendientes.reduce((suma, pendiente) => suma + pendiente.cantidad, 0),
      altaPrioridad: pendientes
        .filter((pendiente) => pendiente.prioridad === 'ALTA')
        .reduce((suma, pendiente) => suma + pendiente.cantidad, 0),
      pendientes,
      noVerificados,
      fecha: new Date().toISOString(),
    };
  }
}
