import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Poliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';
import { CrearPolizaDto } from '../dto/crear-poliza.dto';
import { CuentaContable } from '../entities/cuenta-contable.entity';

@Injectable()
export class PolizasService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  // ── Folio correlativo compartido ─────────────────────────────────────────
  private async generarFolio(empresaId: string, tipo: string): Promise<string> {
    const prefijos: Record<string, string> = { DIARIO: 'DI', INGRESO: 'IN', EGRESO: 'EG' };
    const pref = prefijos[tipo] ?? tipo.substring(0, 2).toUpperCase();
    const anio = new Date().getFullYear();
    const [last] = await this.dataSource.query(
      `SELECT TOP 1 folio FROM polizas
       WHERE empresaId = @0 AND folio LIKE @1
       ORDER BY folio DESC`,
      [empresaId, `${pref}-${anio}-%`]
    ).catch(() => [null]);
    const seq = last ? parseInt(last.folio.split('-')[2] || '0') + 1 : 1;
    return `${pref}-${anio}-${String(seq).padStart(5, '0')}`;
  }

  // ── Verificar período cerrado ─────────────────────────────────────────────
  private async verificarPeriodoCerrado(empresaId: string, fecha: Date): Promise<void> {
    const mes  = fecha.getMonth() + 1;
    const anio = fecha.getFullYear();
    const cerrado = await this.dataSource.query(
      `SELECT id FROM cierres_contables WHERE empresaId = @0 AND mes = @1 AND anio = @2`,
      [empresaId, mes, anio]
    ).catch(() => []);
    if (cerrado?.length > 0) {
      throw new BadRequestException(
        `El período ${mes}/${anio} está cerrado. No se pueden crear pólizas.`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREAR PÓLIZA (usado desde el controller de pólizas manuales)
  // ══════════════════════════════════════════════════════════════════════════
  async crearPoliza(dto: CrearPolizaDto, empresaId: string) {
    let sumaCargos = Math.round(dto.partidas.reduce((s, p) => s + Number(p.cargo), 0) * 100) / 100;
    let sumaAbonos = Math.round(dto.partidas.reduce((s, p) => s + Number(p.abono), 0) * 100) / 100;

    if (sumaCargos !== sumaAbonos) {
      throw new BadRequestException(
        `La póliza está descuadrada. Total Cargos: $${sumaCargos} | Total Abonos: $${sumaAbonos}`
      );
    }
    if (sumaCargos === 0) {
      throw new BadRequestException('Una póliza no puede tener valor cero.');
    }

    const fecha = new Date(dto.fecha);
    await this.verificarPeriodoCerrado(empresaId, fecha);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const folio = await this.generarFolio(empresaId, dto.tipo);

      const nuevaPoliza = queryRunner.manager.create(Poliza, {
        empresaId,
        tipo:     dto.tipo,
        concepto: dto.concepto,
        fecha,
        folio,
        mes:      fecha.getMonth() + 1,
        anio:     fecha.getFullYear(),
      });
      const polizaGuardada = await queryRunner.manager.save(nuevaPoliza);

      const partidas = dto.partidas.map(p =>
        queryRunner.manager.create(PartidaPoliza, {
          polizaId:         polizaGuardada.id,
          cuentaContableId: p.cuentaContableId,
          cargo:            p.cargo,
          abono:            p.abono,
          referencia:       p.referencia,
        })
      );
      await queryRunner.manager.save(PartidaPoliza, partidas);
      await queryRunner.commitTransaction();

      return {
        mensaje: 'Póliza generada correctamente',
        poliza:  polizaGuardada.id,
        folio,
        cuadre:  sumaCargos,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Error al generar la póliza: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PÓLIZA MANUAL — gastos y asientos que no se generan automáticamente
  // ══════════════════════════════════════════════════════════════════════════
  async crearPolizaManual(datos: {
    empresaId: string;
    tipo:      string;
    fecha:     Date;
    concepto:  string;
    partidas:  Array<{
      cuentaContableId: string;
      cargo:     number;
      abono:     number;
      referencia: string;
    }>;
  }) {
    const totalDebe  = Math.round(datos.partidas.reduce((s, p) => s + Number(p.cargo), 0) * 100) / 100;
    const totalHaber = Math.round(datos.partidas.reduce((s, p) => s + Number(p.abono), 0) * 100) / 100;

    if (Math.abs(totalDebe - totalHaber) >= 0.01) {
      throw new BadRequestException(
        `Póliza descuadrada. Debe: $${totalDebe.toFixed(2)} Haber: $${totalHaber.toFixed(2)}`
      );
    }
    if (totalDebe === 0) {
      throw new BadRequestException('La póliza no puede tener valor cero.');
    }

    await this.verificarPeriodoCerrado(datos.empresaId, datos.fecha);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const folio = await this.generarFolio(datos.empresaId, datos.tipo);
      const mes   = datos.fecha.getMonth() + 1;
      const anio  = datos.fecha.getFullYear();

      const poliza = qr.manager.create(Poliza, {
        empresaId: datos.empresaId,
        tipo:      datos.tipo as any,
        folio,
        fecha:     datos.fecha,
        mes,
        anio,
        concepto:  datos.concepto,
      });
      const guardada = await qr.manager.save(poliza);

      const partidas = datos.partidas.map(p =>
        qr.manager.create(PartidaPoliza, {
          polizaId:         guardada.id,
          cuentaContableId: p.cuentaContableId,
          cargo:            Number(p.cargo),
          abono:            Number(p.abono),
          referencia:       p.referencia || datos.concepto.substring(0, 50),
        })
      );
      await qr.manager.save(PartidaPoliza, partidas);
      await qr.commitTransaction();

      return { ...guardada, partidas };
    } catch (err: any) {
      await qr.rollbackTransaction();
      throw new InternalServerErrorException('Error al crear póliza manual: ' + err.message);
    } finally {
      await qr.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBTENER PÓLIZAS
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerPolizas(empresaId: string) {
    return this.dataSource.getRepository(Poliza).find({
      where:     { empresaId },
      relations: ['partidas', 'partidas.cuentaContable'],
      order:     { fechaCreacion: 'DESC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BALANZA DE COMPROBACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerBalanzaComprobacion(
    empresaId:  string,
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
      const hasta = new Date(fechaHasta); hasta.setHours(23, 59, 59, 999);
      joinCondicion += ' AND pol.fecha <= :fechaHasta';
      joinParams.fechaHasta = hasta;
    }

    const resultados = await this.dataSource.createQueryBuilder()
      .select([
        'c.id AS id', 'c.numeroCuenta AS numeroCuenta', 'c.nombre AS nombre',
        'COALESCE(SUM(p.cargo), 0) AS cargos',
        'COALESCE(SUM(p.abono), 0) AS abonos',
      ])
      .from(CuentaContable, 'c')
      .leftJoin(PartidaPoliza, 'p',   'p.cuentaContableId = c.id')
      .leftJoin(Poliza,        'pol', joinCondicion, joinParams)
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('(p.id IS NULL OR pol.id IS NOT NULL)')
      .groupBy('c.id, c.numeroCuenta, c.nombre')
      .orderBy('c.numeroCuenta', 'ASC')
      .getRawMany();

    return resultados.map(r => {
      const cargos = Number(r.cargos);
      const abonos = Number(r.abonos);
      const primerDigito = String(r.numeroCuenta).charAt(0);
      const saldoFinal = ['1', '5', '6'].includes(primerDigito)
        ? cargos - abonos
        : abonos - cargos;
      return { id: r.id, numeroCuenta: r.numeroCuenta, nombre: r.nombre, cargos, abonos, saldoFinal };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DECLARACIÓN DE IVA
  // ══════════════════════════════════════════════════════════════════════════
  async obtenerDeclaracionIVA(
    empresaId:   string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const movimientos = await this.dataSource.query(`
      SELECT cc.numeroCuenta, cc.nombre,
             pp.cargo, pp.abono, pp.referencia,
             p.fecha, p.folio, p.concepto
      FROM partidas_poliza pp
      JOIN cuentas_contables cc ON cc.id = pp.cuentaContableId
      JOIN polizas p ON p.id = pp.polizaId
      WHERE p.empresaId = @0
        AND (cc.numeroCuenta LIKE '208%' OR cc.numeroCuenta LIKE '116%')
        ${fechaDesde ? 'AND p.fecha >= @1' : ''}
        ${fechaHasta ? `AND p.fecha <= @${fechaDesde ? 2 : 1}` : ''}
      ORDER BY p.fecha ASC
    `, [empresaId, ...(fechaDesde ? [fechaDesde] : []), ...(fechaHasta ? [fechaHasta] : [])]);

    const trasladados  = movimientos.filter((m: any) => m.numeroCuenta.startsWith('208'));
    const acreditables = movimientos.filter((m: any) => m.numeroCuenta.startsWith('116'));

    const ivaTrasladadoTotal  = Math.round(trasladados.reduce( (s: number, m: any) => s + Number(m.abono), 0) * 100) / 100;
    const ivaAcreditableTotal = Math.round(acreditables.reduce((s: number, m: any) => s + Number(m.cargo), 0) * 100) / 100;
    const diferencia          = Math.round((ivaTrasladadoTotal - ivaAcreditableTotal) * 100) / 100;

    return {
      periodo:             { desde: fechaDesde ?? null, hasta: fechaHasta ?? null },
      ivaTrasladadoTotal,
      ivaAcreditableTotal,
      ivaAPagar:           diferencia > 0 ? diferencia : 0,
      saldoAFavor:         diferencia < 0 ? Math.abs(diferencia) : 0,
      detalleTrasladado:   trasladados,
      detalleAcreditable:  acreditables,
    };
  }
}