import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ESTADOS_REQUISICION } from '../../compras/entities/requisicion.entity';
import { ESTADOS_OC } from '../../compras/entities/orden-compra.entity';
import { ESTADOS_COTIZACION } from '../../compras/entities/cotizacion.entity';
import { EstadoTransferenciaInventario } from '../../catalogo/entities/transferencia-inventario.entity';
import { EstadoConteoInventario } from '../../catalogo/entities/conteo-inventario.entity';
import { EstadoCredito } from '../../credito/entities/credito-cliente.entity';
import { EstadoConvenioHotel } from '../../hoteleria/entities/city-ledger.entity';
import { EstadoAviso } from '../../integracion/entities/aviso-integracion.entity';
import { EstadoEventoIntegracion } from '../../integracion/integracion.constants';
import { esRolAdministrador } from '../../iam/utils/roles.util';
import { PermisosDinamicosService } from '../../iam/services/permisos-dinamicos.service';

export interface PendienteOperacion {
  codigo: string;
  modulo:
    | 'COMPRAS'
    | 'INVENTARIO'
    | 'CREDITO'
    | 'CONTABILIDAD'
    | 'VENTAS'
    | 'HOTELERIA'
    | 'CONFIGURACION';
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

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * LO QUE EL CORE Y EL ERP NO SE ESTÁN DICIENDO
   * --------------------------------------------------------------------------
   * MEDIDO el 21-oct-2026 en la instalación local, con ERP + core contratados:
   * el tablero decía «4 pendientes, 3 de alta prioridad» y no contaba nada del
   * core. Debajo había, sin que ninguna pantalla llamara a nadie:
   *
   *   · una diferencia de saldo de −$6,150.00 en un cliente, abierta desde el
   *     3 de octubre y sin refrescar desde el 14, porque desde entonces la
   *     consulta al core de ESE cliente se agota;
   *   · 32 avisos huérfanos PENDIENTES —préstamos aprobados, desembolsados y
   *     pagados en el core que el ERP no sabe que existen—;
   *   · una póliza cuyo asiento no llegó a salir al mayor externo.
   *
   * Cada una de las tres tiene su pantalla, su detección y su bandeja. Lo que
   * no tenían es quien las nombrara en el único sitio donde alguien mira al
   * empezar el día. Es la misma frase que ya está escrita en el controlador de
   * la conciliación contable —«la tarea de fondo lo comprobaba cada diez
   * minutos y dejaba avisos que nadie miraba»— un piso más arriba: se construyó
   * la pantalla y no se llamó a nadie a ella.
   *
   * NO LLEVAN COMPUERTA DE CONTRATACIÓN, Y NO LA NECESITAN. Una empresa que
   * sólo contrató el ERP no tiene filas en estas dos tablas —nadie le genera
   * avisos ni concilia su cartera contra nada—, así que la cuenta sale cero y
   * el renglón ni se publica: el bucle de abajo sólo publica lo que es mayor
   * que cero. La única forma de que le aparezcan es que un día tuviera core,
   * y entonces verlos es exactamente lo correcto.
   * ══════════════════════════════════════════════════════════════════════════
   */
  { codigo:'CORE_AVISO', modulo:'CREDITO', titulo:'Avisos del core sin resolver', tabla:'integracion_avisos', estados:['PENDIENTE','FALLIDO'], prioridad:'ALTA', responsable:'Quien concilia con el core', accion:'Decidir si el hecho del core se refleja en el ERP o se descarta', ruta:'/dashboard/creditos/avisos', vocabulario: Object.values(EstadoAviso) as readonly string[] },

  /*
   * La columna de estado aquí es un booleano, `resuelta`, y no un vocabulario
   * de palabras como las demás. Se declara su vocabulario real —los dos
   * valores que puede tomar— para que la prueba que compara estados contra
   * vocabulario siga teniendo algo contra qué comparar en vez de una
   * excepción.
   */
  { codigo:'CORE_DISCREPANCIA', modulo:'CREDITO', titulo:'Diferencias con el core sin resolver', tabla:'integracion_discrepancias', columnaEstado:'resuelta', estados:['false'], prioridad:'ALTA', responsable:'Quien concilia con el core', accion:'Revisar la diferencia y cerrarla con una nota', ruta:'/dashboard/integracion/conciliacion-cartera', vocabulario: ['true','false'] as readonly string[] },

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * LOS ASIENTOS DETENIDOS, QUE NADIE VA A RECOGER SOLO
   * --------------------------------------------------------------------------
   * FALLIDO es, a propósito, un estado del que no se sale solo: lo dice el
   * propio `contarDetenidos`, que existe «para poder decir la verdad cuando un
   * despacho forzado no mueve nada: *no había nada pendiente* y *hay dos
   * detenidos que nadie va a recoger* son cosas distintas, y de la segunda
   * depende que alguien pulse Reintentar o se vaya a casa creyendo que la
   * póliza ya está afuera».
   *
   * Estaba escrita esa frase y no la leía nadie. MEDIDO el 21-oct-2026: tres
   * pólizas del 7 de octubre fallaron ocho veces con `ECONNREFUSED` —el core
   * estaba caído—, agotaron la escalera, y llevan en FALLIDO desde el 9. El
   * core lleva días arriba y el circuito cerrado: esas tres saldrían al primer
   * reintento. Lo único que las nombraba era un 409 al intentar apagar el
   * espejo contable, que es un sitio al que nadie va a mirar.
   *
   * No se reanudan solas, y está bien que no: reintentar en masa contra un core
   * que acaba de volver es cómo se tira otra vez. Lo que faltaba es que alguien
   * supiera que están ahí.
   * ══════════════════════════════════════════════════════════════════════════
   */
  { codigo:'CORE_ASIENTO_DETENIDO', modulo:'CONTABILIDAD', titulo:'Asientos detenidos sin llegar al mayor externo', tabla:'integracion_eventos', estados:['FALLIDO'], prioridad:'ALTA', responsable:'Quien lleva el espejo contable', accion:'Reintentar o descartar cada uno, y revisar por qué se detuvo', ruta:'/dashboard/finanzas/espejo-contable', vocabulario: Object.values(EstadoEventoIntegracion) as readonly string[] },
];

@Injectable()
export class OperacionesPendientesService {
  private esquema: EsquemaCache | null = null;
  private readonly ttlEsquemaMs = Math.max(
    60_000,
    Number(process.env.SCHEMA_CACHE_TTL_MS ?? 10 * 60_000),
  );

  /*
   * `PermisosDinamicosService` llega OPCIONAL a propósito. Este servicio se
   * construye en pruebas con sólo el `DataSource`, y atarlo duro obligaría a
   * montar medio IAM para contar requisiciones. Si no está, el renglón de la
   * reconciliación simplemente no se publica, que es lo que ya pasaba.
   */
  constructor(
    private readonly ds: DataSource,
    @Optional()
    @Inject(PermisosDinamicosService)
    private readonly permisos?: PermisosDinamicosService,
  ) {}

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
    /*
     * ────────────────────────────────────────────────────────────────────────
     * UNA TABLA SIN COLUMNA DE EMPRESA NO SE CUENTA: SE DICE QUE NO SE PUDO
     * ------------------------------------------------------------------------
     * Esto era `const whereEmpresa = tieneEmpresa ? 'empresaId=$1 AND ' : ''`, y
     * una definición sobre una tabla SIN esa columna no devolvía `null` como los
     * otros dos casos imposibles de arriba: contaba **todas las filas de todas
     * las empresas** y se las devolvía al que preguntaba como pendientes suyos.
     *
     * Hoy no filtra nada —las diez tablas de `DEFINICIONES_PENDIENTES` la
     * tienen— así que esto no es un arreglo, es quitar una trampa armada para
     * la próxima definición que alguien añada sobre una tabla hija.
     *
     * Y es el mismo defecto que motivó este archivo, por el otro lado: allí se
     * reportaba un pendiente que no existía; aquí se reportarían los de otros.
     * `null` es «no se pudo medir», que es la verdad, y el llamador ya sabe
     * tratarlo.
     * ────────────────────────────────────────────────────────────────────────
     */
    const tieneEmpresa = columnas.has('empresaid');
    if (!tieneEmpresa) return null;
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

  /**
   * Avisos del core sin empresa a la que atribuirlos.
   *
   * Devuelve `null` —«no se pudo medir»— con el mismo criterio que `contar`:
   * si la tabla o la columna no están, no se inventa un cero.
   */
  private async contarHuerfanos(esquema: EsquemaCache): Promise<number | null> {
    const tabla = 'integracion_avisos';
    if (!esquema.tablas.has(tabla)) return null;
    const columnas = esquema.columnas.get(tabla) ?? new Set<string>();
    if (!columnas.has('empresaid') || !columnas.has('estado')) return null;
    const filas = await this.ds.query(
      `SELECT COUNT(1) total FROM "${tabla}" WHERE empresaid IS NULL AND estado IN ($1,$2)`,
      ['PENDIENTE', 'FALLIDO'],
    );
    return Number(filas?.[0]?.total ?? 0);
  }

  async obtener(empresaId: string, rol?: string) {
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
    /*
     * ════════════════════════════════════════════════════════════════════════
     * LA RECONCILIACIÓN DE PERMISOS QUE NADIE CORRIÓ
     * ------------------------------------------------------------------------
     * No se cuenta de una tabla: se compara lo que el servidor SIRVE contra lo
     * que la tabla de endpoints conoce. Una ruta que no está ahí la niega el
     * guard a los trece roles —el valor seguro de una puerta desconocida es
     * cerrada— y el administrador no lo nota, porque él entra a todo.
     *
     * MEDIDO el 21-oct-2026 en esta instalación: 604 rutas servidas, 514
     * conocidas. Las noventa que faltaban eran módulos enteros de octubre
     * —centros de costo, presupuestos, pedidos de venta, cierre anual,
     * impresoras del mostrador— que sólo abría el administrador.
     *
     * El código ya lo advertía, en una línea de log del arranque: «es un atajo
     * para desarrollar, no una configuración para producción». Aquí lo dice
     * donde alguien mira, y se apaga solo en cuanto se reconcilia.
     * ════════════════════════════════════════════════════════════════════════
     */
    if (this.permisos) {
      try {
        const sinRegistrar = await this.permisos.contarRutasSinRegistrar();
        if (sinRegistrar > 0) {
          pendientes.push({
            codigo: 'PERMISOS_SIN_RECONCILIAR',
            modulo: 'CONFIGURACION',
            titulo: 'Rutas del servidor fuera del sistema de permisos',
            prioridad: 'ALTA',
            responsable: 'Administrador del sistema',
            accion:
              'Reconciliar permisos: hasta entonces sólo el administrador puede usarlas',
            ruta: '/dashboard/permisos',
            cantidad: sinRegistrar,
          });
        }
      } catch {
        noVerificados.push('PERMISOS_SIN_RECONCILIAR');
      }
    }

    /*
     * ═════════════════════════════════════════════════════════════════════════
     * LOS AVISOS QUE NO SON DE NADIE
     * ------------------------------------------------------------------------
     * Un aviso huérfano es uno que el ERP no pudo atribuir a ninguna empresa:
     * significa que existe en el core un recurso que el ERP nunca creó, o que
     * su identificador apunta a dos inquilinos a la vez.
     *
     * Y por eso mismo no cabe en `contar`, que filtra por `empresaid` —y hace
     * bien: un pendiente es de alguien—. MEDIDO el 21-oct-2026: había 32 y no
     * aparecían en ningún contador. La pantalla que sí los lista existe desde
     * hace semanas; lo que faltaba era que alguien supiera que hay que ir.
     *
     * SE PUBLICA A QUIEN PUEDE ABRIR LA PANTALLA, y a nadie más. La ruta que
     * los lista es `@Roles('administrador')`, así que este renglón también, y
     * se pregunta CON `esRolAdministrador`, que es lo que pregunta el guardia.
     *
     * La primera versión comparó `rol === 'administrador'` a mano. MEDIDO en
     * vivo el 22-oct-2026: el token de esta instalación dice `admin`, el
     * sistema reconoce seis escrituras de administrador, y el renglón no
     * salió en el tablero de quien SÍ puede abrir la pantalla. `roles.util.ts`
     * lleva en su cabecera la lista de las tres veces anteriores que alguien
     * hizo esta misma comparación a mano; ésta fue la cuarta.
     * un pendiente cuyo enlace le va a contestar que no al que lo lee es otra
     * forma de «un botón que lleva a un no», y además un huérfano puede
     * describir a un cliente, un crédito o un pago de otro inquilino.
     *
     * La primera versión lo gateaba con `EMPRESA_OPERADORA_ID`. Se cambió al
     * comprobarlo: esa variable NO está definida en ninguna instalación
     * —sólo la nombra un comentario viejo, de cuando el alta de empresas se
     * cerraba así; hoy se cierra con una clave de servicio— y el contador
     * habría quedado escrito y apagado para siempre, que es peor que no
     * tenerlo: nadie lo echa de menos.
     * ═════════════════════════════════════════════════════════════════════════
     */
    if (esRolAdministrador(rol)) {
      try {
        /*
         * Con `this.ds` y el mismo caché de esquema que `contar`, no con el
         * servicio de avisos: importar el módulo de integración aquí cerraría
         * un ciclo con el de configuración, y sería meter un acoplamiento
         * entero por un contador.
         */
        const huerfanos = await this.contarHuerfanos(esquema);
        /*
         * `null` es «no se pudo medir», y hay que DECIRLO. Esto compruébalo
         * la prueba y el código no lo hacía: se trataba igual que un cero, así
         * que una tabla ausente —una instalación sin migrar, un rename— se
         * habría leído como «no hay huérfanos». Es el mismo defecto que este
         * archivo lleva en su cabecera: afirmar un vacío que no se comprobó.
         */
        if (huerfanos === null) {
          noVerificados.push('AVISOS_HUERFANOS');
        } else if (huerfanos > 0) {
          pendientes.push({
            codigo: 'AVISOS_HUERFANOS',
            modulo: 'CREDITO',
            titulo: 'Avisos del core que no son de ninguna empresa',
            prioridad: 'ALTA',
            responsable: 'Operación de SUMA',
            accion:
              'Existe en el core algo que el ERP no creó, o su identificador apunta a dos ' +
              'inquilinos. Hay que mirarlos uno a uno.',
            /*
             * A la pantalla que YA los enseña, no a una propia. El buzón de
             * avisos los pide aparte y los suma en su titular desde hace
             * semanas; inventarle aquí una ruta `/huerfanos` que no existe
             * sería mandar a quien lee el tablero a un 404.
             */
            ruta: '/dashboard/creditos/avisos',
            cantidad: huerfanos,
          });
        }
      } catch {
        noVerificados.push('AVISOS_HUERFANOS');
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
