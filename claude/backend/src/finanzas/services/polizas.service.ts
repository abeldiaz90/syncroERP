import {
  Injectable,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryRunner } from 'typeorm';
import { Poliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';
import { CrearPolizaDto } from '../dto/crear-poliza.dto';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';

@Injectable()
export class PolizasService {
  private readonly logger = new Logger(PolizasService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Comparte un candado por empresa/período con el cierre mensual. Así una
   * póliza no puede entrar entre el diagnóstico final y el bloqueo del mes.
   */
  private async bloquearPeriodoDuranteEscritura(
    qr: QueryRunner,
    empresaId: string,
    fecha: Date | string,
  ) {
    const fechaNormalizada = this.aFecha(fecha);
    const mes = fechaNormalizada.getMonth() + 1;
    const anio = fechaNormalizada.getFullYear();
    const resultado = await qr.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`CIERRE_CONTABLE:${empresaId}:${anio}:${mes}`],
    );
    if (Number(resultado?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException(
        'El período está siendo cerrado. Intenta registrar la póliza nuevamente.',
      );
    }
    const cerrado = await qr.query(
      `SELECT id FROM cierres_contables
       WHERE empresaId = $1 AND mes = $2 AND anio = $3`,
      [empresaId, mes, anio],
    );
    if (cerrado?.length > 0) {
      throw new BadRequestException(
        `El período ${mes}/${anio} está cerrado. No se pueden crear pólizas.`,
      );
    }
  }

  // ── Folio correlativo compartido ─────────────────────────────────────────
  private async generarFolio(empresaId: string, tipo: string): Promise<string> {
    const prefijos: Record<string, string> = {
      DIARIO: 'DI',
      INGRESO: 'IN',
      EGRESO: 'EG',
    };
    const pref = prefijos[tipo] ?? tipo.substring(0, 2).toUpperCase();
    const anio = new Date().getFullYear();
    /*
     * Este `.catch` devolvia `[null]`, con lo que un fallo de la consulta
     * reiniciaba la numeracion en 1 y la siguiente poliza intentaba nacer con
     * un folio ya usado. Un folio contable repetido no es un error tecnico: es
     * una poliza que tapa a otra en cualquier reporte que agrupe por folio.
     * Si no se puede saber cual fue el ultimo, no se inventa el siguiente.
     */
    const [last] = await this.dataSource
      .query(
        `SELECT folio FROM polizas
       WHERE empresaId = $1 AND folio LIKE $2
       ORDER BY folio DESC LIMIT 1`,
        [empresaId, `${pref}-${anio}-%`],
      )
      .catch((error: unknown) => {
        throw new BadRequestException(
          'No se pudo consultar el último folio para continuar la numeración, ' +
            'así que no se generó ninguna póliza: inventar el folio siguiente ' +
            `podría repetir uno existente. Detalle: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      });
    const seq = last ? parseInt(last.folio.split('-')[2] || '0') + 1 : 1;
    return `${pref}-${anio}-${String(seq).padStart(5, '0')}`;
  }

  // ── Verificar período cerrado ─────────────────────────────────────────────
  /** Consulta pura: ¿el período de esa fecha está cerrado? */
  private async periodoEstaCerrado(
    empresaId: string,
    fecha: Date | string,
  ): Promise<boolean> {
    const fechaNormalizada = this.aFecha(fecha);
    const mes = fechaNormalizada.getMonth() + 1;
    const anio = fechaNormalizada.getFullYear();
    /*
     * ────────────────────────────────────────────────────────────────────────
     * UN CANDADO QUE NO PUDO PREGUNTAR NO DICE «ABIERTO»
     *
     * Aqui habia un `.catch(() => [])`, y con el la respuesta a «¿esta cerrado
     * el periodo?» cuando la consulta falla era NO. Es decir: el unico control
     * que impide escribir en un mes ya cerrado se volvia permisivo justo en el
     * momento en que dejaba de funcionar.
     *
     * Es el mismo error contra el que avisa el comentario del cierre contable
     * —«un dato que no se pudo leer no vale cero»— cometido en el candado que
     * protege lo que ese cierre acaba de firmar. Y no deja rastro: la poliza
     * entra, el mes cerrado cambia despues de cerrarse, y la balanza que
     * alguien ya certifico deja de ser la que es.
     *
     * Ahora falla, y dice por que. Entre no poder comprobar y dejar pasar, un
     * candado elige lo primero.
     * ────────────────────────────────────────────────────────────────────────
     */
    const cerrado = await this.dataSource
      .query(
        `SELECT id FROM cierres_contables WHERE empresaId = $1 AND mes = $2 AND anio = $3`,
        [empresaId, mes, anio],
      )
      .catch((error: unknown) => {
        throw new ConflictException(
          `No se pudo comprobar si el período ${mes}/${anio} está cerrado, así ` +
            'que la operación no se realizó. Un período cerrado no puede ' +
            'modificarse, y no comprobarlo equivale a permitirlo. Detalle: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    return (cerrado?.length ?? 0) > 0;
  }

  private async verificarPeriodoCerrado(
    empresaId: string,
    fecha: Date | string,
  ): Promise<void> {
    const fechaNormalizada = this.aFecha(fecha);
    if (await this.periodoEstaCerrado(empresaId, fechaNormalizada)) {
      throw new BadRequestException(
        `El período ${fechaNormalizada.getMonth() + 1}/${fechaNormalizada.getFullYear()} está cerrado. No se pueden crear pólizas.`,
      );
    }
  }

  /** Normaliza columnas SQL `date`, DTOs ISO y objetos Date. */
  private aFecha(valor: Date | string): Date {
    if (valor instanceof Date) {
      if (Number.isNaN(valor.getTime())) {
        throw new BadRequestException('La fecha de la póliza no es válida.');
      }
      return valor;
    }

    const texto = String(valor ?? '').trim();
    if (!texto) {
      throw new BadRequestException('La fecha de la póliza es obligatoria.');
    }

    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto)
      ? new Date(`${texto}T00:00:00`)
      : new Date(texto);

    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`La fecha de la póliza no es válida: ${texto}`);
    }
    return fecha;
  }

  /**
   * ==========================================================================
   * Normalizar no es validar, y confundirlos dejó dos pólizas sin salida
   * --------------------------------------------------------------------------
   * `aFecha` hacía las dos cosas: parseaba la fecha Y exigía que no fuera
   * futura. Como la reversa empieza leyendo la fecha de la póliza ORIGINAL
   * —`this.aFecha(original.fecha)`—, cancelar una póliza ya fechada adelante
   * era imposible:
   *
   *   «No se puede registrar una póliza con fecha 2026-10-15, que todavía no
   *    llega.»
   *
   * ...dicho a quien no estaba registrando nada, sino intentando arreglar
   * precisamente eso. El control tapaba la única salida del problema que
   * venía a evitar. Medido el 25-sep-2026: DI-2026-00013 (15-oct) y
   * EG-2026-00013 (30-sep) seguían atoradas en la bandeja del espejo con
   * «The journal entry cannot be made for a future date» y no había forma de
   * reversarlas desde el ERP.
   *
   * Así que la regla se aplica donde se ESCRIBE una fecha, no donde se lee una
   * que ya está guardada. Sigue siendo un solo punto de enganche para todos los
   * caminos de creación —que era el acierto del diseño original— y la reversa
   * puede hacer su trabajo.
   * ==========================================================================
   */
  private aFechaNueva(valor: Date | string): Date {
    const fecha = this.aFecha(valor);
    this.exigirQueYaHayaOcurrido(fecha);
    return fecha;
  }

  /**
   * ==========================================================================
   * La contabilidad registra lo que ya pasó
   * --------------------------------------------------------------------------
   * No había control de fecha futura, y no es una sutileza: se registró —y se
   * pagó— la nómina del 1 al 15 de OCTUBRE el 23 de septiembre, con su póliza
   * de devengo fechada 22 días adelante. Para el ERP no pasó nada. El mayor
   * externo lo rechazó en cuanto le llegó el asiento: «The journal entry
   * cannot be made for a future date». Una regla contable que el otro sistema
   * cumple y éste no significa que las dos balanzas van a divergir, y que la
   * que está mal es la nuestra.
   *
   * Lo que un asiento futuro rompe, en orden de gravedad: la balanza de un mes
   * ya cerrado puede cambiar después de cerrarlo —basta que alguien fechara
   * algo adelante—; el gasto se reconoce antes de incurrirse; y la
   * conciliación bancaria busca en el estado de cuenta un movimiento que el
   * banco todavía no hizo.
   *
   * Vive en `aFecha` y no en cada camino de creación a propósito: las pólizas
   * nacen desde el motor contable, la captura manual, la captura en
   * transacción, las reversas y el cierre, y todas pasan por aquí. Una lista
   * de puntos de enganche es una lista que alguien olvidará ampliar.
   *
   * El día se compara con el calendario local de la empresa, no con UTC: en
   * México, a partir de las 18:00, comparar contra UTC declara futuro lo que
   * se está capturando hoy mismo.
   * ==========================================================================
   */
  private exigirQueYaHayaOcurrido(fecha: Date): void {
    const hoy = new Date();
    const finDeHoy = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate(),
      23,
      59,
      59,
      999,
    );
    if (fecha.getTime() <= finDeHoy.getTime()) return;
    throw new BadRequestException(
      `No se puede registrar una póliza con fecha ${diaCalendario(fecha)}, que todavía no llega. ` +
        'La contabilidad registra lo que ya ocurrió.',
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREAR PÓLIZA (usado desde el controller de pólizas manuales)
  // ══════════════════════════════════════════════════════════════════════════
  async crearPoliza(dto: CrearPolizaDto, empresaId: string) {
    const sumaCargos =
      Math.round(dto.partidas.reduce((s, p) => s + Number(p.cargo), 0) * 100) /
      100;
    const sumaAbonos =
      Math.round(dto.partidas.reduce((s, p) => s + Number(p.abono), 0) * 100) /
      100;

    if (sumaCargos !== sumaAbonos) {
      throw new BadRequestException(
        `La póliza está descuadrada. Total Cargos: $${sumaCargos} | Total Abonos: $${sumaAbonos}`,
      );
    }
    if (sumaCargos === 0) {
      throw new BadRequestException('Una póliza no puede tener valor cero.');
    }

    const fecha = this.aFechaNueva(dto.fecha);
    await this.verificarPeriodoCerrado(empresaId, fecha);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.bloquearPeriodoDuranteEscritura(queryRunner, empresaId, fecha);
      const folio = await this.generarFolio(empresaId, dto.tipo);

      const nuevaPoliza = queryRunner.manager.create(Poliza, {
        empresaId,
        tipo: dto.tipo,
        concepto: dto.concepto,
        fecha,
        folio,
        mes: fecha.getMonth() + 1,
        anio: fecha.getFullYear(),
      });
      const polizaGuardada = await queryRunner.manager.save(nuevaPoliza);

      const partidas = dto.partidas.map((p) =>
        queryRunner.manager.create(PartidaPoliza, {
          polizaId: polizaGuardada.id,
          cuentaContableId: p.cuentaContableId,
          cargo: p.cargo,
          abono: p.abono,
          referencia: p.referencia,
        }),
      );
      await queryRunner.manager.save(PartidaPoliza, partidas);
      await queryRunner.commitTransaction();

      return {
        mensaje: 'Póliza generada correctamente',
        poliza: polizaGuardada.id,
        folio,
        cuadre: sumaCargos,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error al generar la póliza: ' + error.message,
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PÓLIZA MANUAL — gastos y asientos que no se generan automáticamente
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Rechaza pólizas manuales que toquen cuentas controladas por un auxiliar.
   *
   * Antes se validaba cuadre, importe y periodo, pero nunca A QUÉ CUENTAS se
   * afectaba. Cualquiera con acceso a Finanzas podía cargar o abonar a mano
   * Bancos, Clientes CxC o Inventario: el auxiliar no cambiaba, el mayor sí, y
   * la conciliación cuadraba. Es el mecanismo con el que se disimula un
   * faltante.
   *
   * Los asientos que genera el motor contable NO pasan por aquí: usan
   * `crearPoliza`, que es la vía legítima para mover esas cuentas.
   */
  private async validarCuentasAfectables(
    empresaId: string,
    partidas: Array<{ cuentaContableId: string }>,
  ): Promise<void> {
    const ids = [...new Set(partidas.map((p) => p.cuentaContableId))];
    if (!ids.length) return;

    const cuentas = await this.dataSource.getRepository(CuentaContable).find({
      where: { id: In(ids), empresaId },
    });

    const bloqueadas = cuentas.filter(
      (c) => c.permiteMovimientoManual === false,
    );
    if (bloqueadas.length) {
      const detalle = bloqueadas
        .map((c) => `${c.numeroCuenta} ${c.nombre}`)
        .join(', ');
      throw new BadRequestException(
        `Estas cuentas las controla un auxiliar y no admiten pólizas manuales: ` +
          `${detalle}. Registra la operación en su módulo (tesorería, ventas, ` +
          'compras o inventario) para que el auxiliar y el mayor coincidan.',
      );
    }

    const noAfectables = cuentas.filter((c) => c.esAfectable === false);
    if (noAfectables.length) {
      const detalle = noAfectables
        .map((c) => `${c.numeroCuenta} ${c.nombre}`)
        .join(', ');
      throw new BadRequestException(
        `Son cuentas de mayor y no reciben movimientos directos: ${detalle}. ` +
          'Usa una subcuenta de detalle.',
      );
    }
  }

  async crearPolizaManual(datos: {
    empresaId: string;
    tipo: string;
    fecha: Date | string;
    concepto: string;
    origenClave?: string;
    origenTipo?: string;
    partidas: Array<{
      cuentaContableId: string;
      cargo: number;
      abono: number;
      referencia: string;
    }>;
  }) {
    if (datos.origenClave) {
      const existente = await this.dataSource.getRepository(Poliza).findOne({
        where: {
          empresaId: datos.empresaId,
          origenClave: datos.origenClave,
        },
      });
      if (existente) return existente;
    }
    const totalDebe =
      Math.round(
        datos.partidas.reduce((s, p) => s + Number(p.cargo), 0) * 100,
      ) / 100;
    const totalHaber =
      Math.round(
        datos.partidas.reduce((s, p) => s + Number(p.abono), 0) * 100,
      ) / 100;

    if (Math.abs(totalDebe - totalHaber) >= 0.01) {
      throw new BadRequestException(
        `Póliza descuadrada. Debe: $${totalDebe.toFixed(2)} Haber: $${totalHaber.toFixed(2)}`,
      );
    }
    if (totalDebe === 0) {
      throw new BadRequestException('La póliza no puede tener valor cero.');
    }

    await this.validarCuentasAfectables(datos.empresaId, datos.partidas);

    const fecha = this.aFechaNueva(datos.fecha);
    await this.verificarPeriodoCerrado(datos.empresaId, fecha);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.bloquearPeriodoDuranteEscritura(
        qr,
        datos.empresaId,
        fecha,
      );
      const folio = await this.generarFolio(datos.empresaId, datos.tipo);
      const mes = fecha.getMonth() + 1;
      const anio = fecha.getFullYear();

      const poliza = qr.manager.create(Poliza, {
        empresaId: datos.empresaId,
        tipo: datos.tipo as any,
        folio,
        fecha,
        mes,
        anio,
        concepto: datos.concepto,
        origenClave: datos.origenClave ?? null,
        origenTipo: datos.origenTipo ?? null,
      });
      const guardada = await qr.manager.save(poliza);

      const partidas = datos.partidas.map((p) =>
        qr.manager.create(PartidaPoliza, {
          polizaId: guardada.id,
          cuentaContableId: p.cuentaContableId,
          cargo: Number(p.cargo),
          abono: Number(p.abono),
          referencia: p.referencia || datos.concepto.substring(0, 50),
        }),
      );
      await qr.manager.save(PartidaPoliza, partidas);
      await qr.commitTransaction();

      return { ...guardada, partidas };
    } catch (err: any) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        'Error al crear póliza manual: ' + err.message,
      );
    } finally {
      await qr.release();
    }
  }



  /**
   * Crea una póliza usando la transacción del proceso llamador. Esto evita que
   * nómina confirme una póliza y luego falle al aplicar saldos/estados, dejando
   * contabilidad y operación desalineadas.
   */
  async crearPolizaManualEnTransaccion(
    manager: EntityManager,
    datos: {
      empresaId: string;
      tipo: string;
      fecha: Date | string;
      concepto: string;
      origenClave?: string;
      origenTipo?: string;
      partidas: Array<{
        cuentaContableId: string;
        cargo: number;
        abono: number;
        referencia: string;
      }>;
    },
  ) {
    const totalDebe =
      Math.round(datos.partidas.reduce((s, p) => s + Number(p.cargo), 0) * 100) /
      100;
    const totalHaber =
      Math.round(datos.partidas.reduce((s, p) => s + Number(p.abono), 0) * 100) /
      100;
    if (Math.abs(totalDebe - totalHaber) >= 0.01) {
      throw new BadRequestException(
        `Póliza descuadrada. Debe: $${totalDebe.toFixed(2)} Haber: $${totalHaber.toFixed(2)}`,
      );
    }
    if (totalDebe === 0) {
      throw new BadRequestException('La póliza no puede tener valor cero.');
    }
    if (datos.partidas.some((p) => !p.cuentaContableId)) {
      throw new BadRequestException('Todas las partidas requieren cuenta contable.');
    }

    const fecha = this.aFechaNueva(datos.fecha);
    const mes = fecha.getMonth() + 1;
    const anio = fecha.getFullYear();
    const bloqueo = await manager.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`CIERRE_CONTABLE:${datos.empresaId}:${anio}:${mes}`],
    );
    if (Number(bloqueo?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException(
        'El período está siendo cerrado. Intenta registrar la póliza nuevamente.',
      );
    }
    const cerrado = await manager.query(
      `SELECT id FROM cierres_contables WHERE empresaId = $1 AND mes = $2 AND anio = $3`,
      [datos.empresaId, mes, anio],
    );
    if (cerrado?.length) {
      throw new BadRequestException(
        `El período ${mes}/${anio} está cerrado. No se pueden crear pólizas.`,
      );
    }

    if (datos.origenClave) {
      const existente = await manager.findOne(Poliza, {
        where: { empresaId: datos.empresaId, origenClave: datos.origenClave },
      });
      if (existente) return existente;
    }

    const prefijos: Record<string, string> = {
      DIARIO: 'DI',
      INGRESO: 'IN',
      EGRESO: 'EG',
    };
    const pref = prefijos[datos.tipo] ?? datos.tipo.substring(0, 2).toUpperCase();
    const lockFolio = await manager.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`FOLIO_POLIZA:${datos.empresaId}:${pref}:${anio}`],
    );
    if (Number(lockFolio?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException('No fue posible reservar el folio contable.');
    }
    const ultimo = await manager.query(
      `SELECT folio FROM polizas
       WHERE empresaId = $1 AND folio LIKE $2
       ORDER BY folio DESC LIMIT 1`,
      [datos.empresaId, `${pref}-${anio}-%`],
    );
    const secuencia = ultimo?.[0]
      ? Number.parseInt(String(ultimo[0].folio).split('-')[2] || '0', 10) + 1
      : 1;
    const folio = `${pref}-${anio}-${String(secuencia).padStart(5, '0')}`;

    const poliza = manager.create(Poliza, {
      empresaId: datos.empresaId,
      tipo: datos.tipo as any,
      folio,
      fecha,
      mes,
      anio,
      concepto: datos.concepto,
      origenClave: datos.origenClave ?? null,
      origenTipo: datos.origenTipo ?? null,
    });
    const guardada = await manager.save(poliza);
    await manager.save(
      PartidaPoliza,
      datos.partidas.map((partida) =>
        manager.create(PartidaPoliza, {
          polizaId: guardada.id,
          cuentaContableId: partida.cuentaContableId,
          cargo: Number(partida.cargo),
          abono: Number(partida.abono),
          referencia:
            partida.referencia || datos.concepto.substring(0, 50),
        }),
      ),
    );
    return guardada;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCELAR PÓLIZA (REVERSO)
  //
  // Una póliza NUNCA se borra ni se edita: se emite su REVERSA, una póliza
  // espejo con los cargos y abonos invertidos. Ambas quedan en el libro y
  // se anulan entre sí (igual que el FB08 de SAP).
  //
  // Reglas:
  //  · Motivo obligatorio (rastro de auditoría).
  //  · No se cancela dos veces, ni se cancela una reversa.
  //  · No se revierte una póliza descuadrada (se avisa para revisarla).
  //  · Si el período original está cerrado, la reversa se emite con fecha
  //    de hoy (no se toca el pasado ya cerrado). Si hoy también está
  //    cerrado, se rechaza y el contador debe reabrir el período.
  //  · Todo ocurre en UNA transacción: o queda la reversa y la original
  //    marcada, o no queda nada.
  // ══════════════════════════════════════════════════════════════════════════
  async cancelarPoliza(
    empresaId: string,
    polizaId: string,
    datos: { motivo: string; fechaReverso?: string; usuario?: string },
  ) {
    const motivo = (datos.motivo ?? '').trim();
    if (motivo.length < 5) {
      throw new BadRequestException(
        'Indica el motivo de la cancelación (mínimo 5 caracteres). Queda registrado para auditoría.',
      );
    }

    const original = await this.dataSource.getRepository(Poliza).findOne({
      where: { id: polizaId, empresaId },
      relations: ['partidas'],
    });
    if (!original) throw new NotFoundException('Póliza no encontrada');

    const estatus = original.estatus ?? 'VIGENTE';
    if (estatus === 'CANCELADA') {
      throw new BadRequestException(
        `La póliza ${original.folio} ya fue cancelada anteriormente.`,
      );
    }
    if (estatus === 'REVERSA') {
      throw new BadRequestException(
        `La póliza ${original.folio} es una reversa y no puede cancelarse. ` +
          'Si necesitas revertir el efecto, emite una póliza manual.',
      );
    }
    if (!original.partidas?.length) {
      throw new BadRequestException(
        `La póliza ${original.folio} no tiene partidas.`,
      );
    }

    // Defensa: nunca propagar un descuadre a la reversa
    // Cada partida se lleva primero a centavos. Redondear solamente la suma
    // permite que errores opuestos entre partidas se oculten por compensación.
    const cargosCentavos = original.partidas.reduce(
      (s, p) => s + Math.round(Number(p.cargo) * 100),
      0,
    );
    const abonosCentavos = original.partidas.reduce(
      (s, p) => s + Math.round(Number(p.abono) * 100),
      0,
    );
    if (Math.abs(cargosCentavos - abonosCentavos) > 0) {
      const cargos = cargosCentavos / 100;
      const abonos = abonosCentavos / 100;
      throw new BadRequestException(
        `La póliza ${original.folio} está descuadrada (Cargos $${cargos} / Abonos $${abonos}). ` +
          'Revísala antes de cancelarla.',
      );
    }

    // ── Fecha de la reversa ──
    const fechaOriginal = this.aFecha(original.fecha);
    let fechaReverso: Date;
    if (datos.fechaReverso) {
      fechaReverso = this.aFechaNueva(datos.fechaReverso);
      if (isNaN(fechaReverso.getTime())) {
        throw new BadRequestException(
          'La fecha de reverso no es válida (usa AAAA-MM-DD).',
        );
      }
    } else {
      /*
       * Período original abierto → misma fecha. Cerrado → hoy.
       *
       * Y si la original está fechada adelante —las que quedaron antes de que
       * existiera el control— la reversa NO puede heredar esa fecha: sería otra
       * póliza futura, y el mayor externo la rechazaría igual. Se reversa hoy,
       * que es cuando de verdad se está cancelando.
       */
      const originalEsFutura = fechaOriginal.getTime() > Date.now();
      fechaReverso =
        originalEsFutura ||
        (await this.periodoEstaCerrado(empresaId, fechaOriginal))
          ? new Date()
          : fechaOriginal;
    }
    await this.verificarPeriodoCerrado(empresaId, fechaReverso);

    // ── Transacción: reversa + marca en la original ──
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.bloquearPeriodoDuranteEscritura(qr, empresaId, fechaReverso);
      const folio = await this.generarFolio(empresaId, original.tipo);

      const reversa = qr.manager.create(Poliza, {
        empresaId,
        tipo: original.tipo,
        folio,
        fecha: fechaReverso,
        mes: fechaReverso.getMonth() + 1,
        anio: fechaReverso.getFullYear(),
        concepto: `Cancelación de ${original.folio} — ${motivo}`.substring(
          0,
          255,
        ),
        estatus: 'REVERSA' as const,
        polizaOrigenId: original.id,
      });
      const guardada = await qr.manager.save(reversa);

      // Espejo: cargo ↔ abono
      const partidas = original.partidas.map((p) =>
        qr.manager.create(PartidaPoliza, {
          polizaId: guardada.id,
          cuentaContableId: p.cuentaContableId,
          cargo: Number(p.abono),
          abono: Number(p.cargo),
          referencia: `REV ${original.folio}`.substring(0, 255),
        }),
      );
      await qr.manager.save(PartidaPoliza, partidas);

      // La original queda marcada, nunca borrada
      await qr.manager.update(Poliza, original.id, {
        estatus: 'CANCELADA' as const,
        polizaReversaId: guardada.id,
        motivoCancelacion: motivo.substring(0, 300),
        canceladaPor: datos.usuario ?? null,
        fechaCancelacion: new Date(),
      });

      await qr.commitTransaction();
      this.logger.warn(
        `Póliza ${original.folio} cancelada por ${datos.usuario ?? 'sistema'} — reversa ${folio} — motivo: ${motivo}`,
      );

      return {
        mensaje: `Póliza ${original.folio} cancelada. Se generó la reversa ${folio}.`,
        original: {
          id: original.id,
          folio: original.folio,
          estatus: 'CANCELADA',
        },
        reversa: {
          id: guardada.id,
          folio,
          fecha: fechaReverso,
          importe: cargosCentavos / 100,
        },
      };
    } catch (err: any) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        'Error al cancelar la póliza: ' + err.message,
      );
    } finally {
      await qr.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBTENER PÓLIZAS
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerPolizas(empresaId: string) {
    return this.dataSource.getRepository(Poliza).find({
      where: { empresaId },
      relations: ['partidas', 'partidas.cuentaContable'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BALANZA DE COMPROBACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerBalanzaComprobacion(
    empresaId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    let joinCondicion = 'p.polizaId = pol.id AND pol.empresaId = :empresaId';
    const joinParams: Record<string, any> = { empresaId };

    if (fechaDesde) {
      joinCondicion += ' AND pol.fecha >= :fechaDesde';
      joinParams.fechaDesde = new Date(fechaDesde);
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      joinCondicion += ' AND pol.fecha <= :fechaHasta';
      joinParams.fechaHasta = hasta;
    }

    const resultados = await this.dataSource
      .createQueryBuilder()
      /*
       * ════════════════════════════════════════════════════════════════════
       * Se entrecomilla el ALIAS DE SALIDA, nunca la columna
       * --------------------------------------------------------------------
       * Las dos mitades de esta línea se ven iguales y no lo son:
       *
       *   c.numeroCuenta   → lo traduce TypeORM con la estrategia de nombres,
       *                      que pasa TODAS las columnas a minúsculas, así que
       *                      acaba siendo `"c"."numerocuenta"`, que es la
       *                      columna real.
       *   AS "numeroCuenta" → es el nombre del resultado. Va entrecomillado
       *                      porque sin comillas PostgreSQL lo pliega y
       *                      `fila.numeroCuenta` llegaría undefined.
       *
       * Estaba entrecomillada también la columna —`c."numeroCuenta"`—, y eso
       * le pedía a PostgreSQL una columna en camelCase que no existe: la
       * consulta reventaba con un error de base de datos. Con ella se caían la
       * balanza de comprobación, el estado de resultados y el balance general,
       * los tres, y además el indicador «Por cobrar» del panel, que lee la
       * misma consulta y se quedaba en blanco sin decir por qué.
       * ════════════════════════════════════════════════════════════════════
       */
      .select([
        'c.id AS id',
        'c.numeroCuenta AS "numeroCuenta"',
        'c.nombre AS nombre',
        'COALESCE(SUM(p.cargo), 0) AS cargos',
        'COALESCE(SUM(p.abono), 0) AS abonos',
      ])
      .from(CuentaContable, 'c')
      .leftJoin(PartidaPoliza, 'p', 'p.cuentaContableId = c.id')
      .leftJoin(Poliza, 'pol', joinCondicion, joinParams)
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('(p.id IS NULL OR pol.id IS NOT NULL)')
      .groupBy('c.id, c.numeroCuenta, c.nombre')
      .orderBy('c.numeroCuenta', 'ASC')
      .getRawMany();

    return resultados.map((r) => {
      const cargos = Number(r.cargos);
      const abonos = Number(r.abonos);
      const primerDigito = String(r.numeroCuenta).charAt(0);
      const saldoFinal = ['1', '5', '6'].includes(primerDigito)
        ? cargos - abonos
        : abonos - cargos;
      return {
        id: r.id,
        numeroCuenta: r.numeroCuenta,
        nombre: r.nombre,
        cargos,
        abonos,
        saldoFinal,
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DECLARACIÓN DE IVA
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerDeclaracionIVA(
    empresaId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    /*
     * `@N` era de SQL Server. En PostgreSQL el parámetro se escribe `$N` y `@`
     * es el operador de valor absoluto, así que la consulta reventaba; y el
     * índice además estaba corrido en uno. Resultado: la pantalla desde la que
     * se prepara la declaración mensual del IVA fallaba en cuanto se acotaba el
     * periodo — que es como se usa siempre.
     */
    const movimientos = await this.dataSource.query(
      `
      -- Los alias, entrecomillados. Sin ellos m.rolSistema era undefined en
      -- cada fila, los cuatro filtros de abajo devolvían listas vacías y la
      -- pantalla de la declaración mensual de IVA informaba CERO trasladado y
      -- CERO acreditable sobre un mes con movimientos.
      SELECT cc.numeroCuenta AS "numeroCuenta", cc.nombre AS nombre,
             cc.rolSistema AS "rolSistema",
             pp.cargo AS cargo, pp.abono AS abono, pp.referencia AS referencia,
             p.fecha AS fecha, p.folio AS folio, p.concepto AS concepto
      FROM partidas_poliza pp
      JOIN cuentas_contables cc ON cc.id = pp.cuentaContableId
      JOIN polizas p ON p.id = pp.polizaId
      WHERE p.empresaId = $1
        AND cc.rolSistema IN (
          'IVA_TRASLADADO_COBRADO', 'IVA_ACREDITABLE_PAGADO',
          'IVA_TRASLADADO_NO_COBRADO', 'IVA_ACREDITABLE_PENDIENTE'
        )
        ${fechaDesde ? 'AND p.fecha >= $2' : ''}
        ${fechaHasta ? `AND p.fecha <= $${fechaDesde ? 3 : 2}` : ''}
      ORDER BY p.fecha ASC
    `,
      [
        empresaId,
        ...(fechaDesde ? [fechaDesde] : []),
        ...(fechaHasta ? [fechaHasta] : []),
      ],
    );

    const trasladados = movimientos.filter(
      (m: any) => m.rolSistema === 'IVA_TRASLADADO_COBRADO',
    );
    const acreditables = movimientos.filter(
      (m: any) => m.rolSistema === 'IVA_ACREDITABLE_PAGADO',
    );
    const trasladadosPendientes = movimientos.filter(
      (m: any) => m.rolSistema === 'IVA_TRASLADADO_NO_COBRADO',
    );
    const acreditablesPendientes = movimientos.filter(
      (m: any) => m.rolSistema === 'IVA_ACREDITABLE_PENDIENTE',
    );

    const ivaTrasladadoTotal =
      Math.round(
        trasladados.reduce(
          (s: number, m: any) => s + Number(m.abono) - Number(m.cargo),
          0,
        ) * 100,
      ) / 100;
    const ivaAcreditableTotal =
      Math.round(
        acreditables.reduce(
          (s: number, m: any) => s + Number(m.cargo) - Number(m.abono),
          0,
        ) * 100,
      ) / 100;
    const diferencia =
      Math.round((ivaTrasladadoTotal - ivaAcreditableTotal) * 100) / 100;

    return {
      periodo: { desde: fechaDesde ?? null, hasta: fechaHasta ?? null },
      ivaTrasladadoTotal,
      ivaAcreditableTotal,
      ivaAPagar: diferencia > 0 ? diferencia : 0,
      saldoAFavor: diferencia < 0 ? Math.abs(diferencia) : 0,
      ivaTrasladadoNoCobrado:
        Math.round(
          trasladadosPendientes.reduce(
            (s: number, m: any) => s + Number(m.abono) - Number(m.cargo),
            0,
          ) * 100,
        ) / 100,
      ivaAcreditablePendiente:
        Math.round(
          acreditablesPendientes.reduce(
            (s: number, m: any) => s + Number(m.cargo) - Number(m.abono),
            0,
          ) * 100,
        ) / 100,
      detalleTrasladado: trasladados,
      detalleAcreditable: acreditables,
    };
  }
}
