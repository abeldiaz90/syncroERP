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
    const [last] = await this.dataSource
      .query(
        `SELECT folio FROM polizas
       WHERE empresaId = $1 AND folio LIKE $2
       ORDER BY folio DESC LIMIT 1`,
        [empresaId, `${pref}-${anio}-%`],
      )
      .catch(() => [null]);
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
    const cerrado = await this.dataSource
      .query(
        `SELECT id FROM cierres_contables WHERE empresaId = $1 AND mes = $2 AND anio = $3`,
        [empresaId, mes, anio],
      )
      .catch(() => []);
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

    const fecha = this.aFecha(dto.fecha);
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

    const fecha = this.aFecha(datos.fecha);
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

    const fecha = this.aFecha(datos.fecha);
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
      fechaReverso = this.aFecha(datos.fechaReverso);
      if (isNaN(fechaReverso.getTime())) {
        throw new BadRequestException(
          'La fecha de reverso no es válida (usa AAAA-MM-DD).',
        );
      }
    } else {
      // Período original abierto → misma fecha. Cerrado → hoy.
      fechaReverso = (await this.periodoEstaCerrado(empresaId, fechaOriginal))
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
      .select([
        'c.id AS id',
        'c.numeroCuenta AS numeroCuenta',
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
    const movimientos = await this.dataSource.query(
      `
      SELECT cc.numeroCuenta, cc.nombre, cc.rolSistema,
             pp.cargo, pp.abono, pp.referencia,
             p.fecha, p.folio, p.concepto
      FROM partidas_poliza pp
      JOIN cuentas_contables cc ON cc.id = pp.cuentaContableId
      JOIN polizas p ON p.id = pp.polizaId
      WHERE p.empresaId = $1
        AND cc.rolSistema IN (
          'IVA_TRASLADADO_COBRADO', 'IVA_ACREDITABLE_PAGADO',
          'IVA_TRASLADADO_NO_COBRADO', 'IVA_ACREDITABLE_PENDIENTE'
        )
        ${fechaDesde ? 'AND p.fecha >= $2' : ''}
        ${fechaHasta ? `AND p.fecha <= @${fechaDesde ? 2 : 1}` : ''}
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
