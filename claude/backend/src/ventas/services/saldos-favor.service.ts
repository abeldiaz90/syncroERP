import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  SaldoFavorClienteMovimiento,
  TipoMovimientoSaldoFavor,
} from '../entities/saldo-favor-cliente.entity';

@Injectable()
export class SaldosFavorService {
  constructor(private readonly dataSource: DataSource) {}

  private redondear(valor: number) {
    return Math.round((Number(valor) + Number.EPSILON) * 10000) / 10000;
  }

  private async bloquear(
    em: EntityManager,
    empresaId: string,
    clienteId: string,
  ) {
    await em.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [`saldo-favor:${empresaId}:${clienteId}`],
    );
  }

  private async saldoEn(em: EntityManager, empresaId: string, clienteId: string) {
    const fila = await em
      .createQueryBuilder(SaldoFavorClienteMovimiento, 'm')
      .select(
        `COALESCE(SUM(CASE WHEN m.tipo='ABONO' THEN m.importe ELSE -m.importe END),0)`,
        'saldo',
      )
      .where('m.empresaId=:empresaId AND m.clienteId=:clienteId', {
        empresaId,
        clienteId,
      })
      .getRawOne<{ saldo: string }>();
    return this.redondear(Number(fila?.saldo ?? 0));
  }

  async aplicar(
    em: EntityManager,
    datos: {
      empresaId: string;
      clienteId: string;
      ventaId: string;
      solicitado: number;
      totalVenta: number;
      folio: number;
      usuarioId?: string;
    },
  ) {
    const solicitado = this.redondear(Number(datos.solicitado ?? 0));
    if (solicitado <= 0) return 0;
    await this.bloquear(em, datos.empresaId, datos.clienteId);
    const saldo = await this.saldoEn(em, datos.empresaId, datos.clienteId);
    if (solicitado > saldo + 0.0001) {
      throw new BadRequestException(
        `Saldo a favor insuficiente. Disponible: ${saldo.toFixed(2)}.`,
      );
    }
    const importe = Math.min(solicitado, this.redondear(datos.totalVenta));
    const repo = em.getRepository(SaldoFavorClienteMovimiento);
    const existente = await repo.findOne({
      where: {
        empresaId: datos.empresaId,
        ventaId: datos.ventaId,
        tipo: TipoMovimientoSaldoFavor.CARGO,
      },
    });
    if (existente) return Number(existente.importe);
    await repo.save(
      repo.create({
        empresaId: datos.empresaId,
        clienteId: datos.clienteId,
        ventaId: datos.ventaId,
        devolucionId: null,
        tipo: TipoMovimientoSaldoFavor.CARGO,
        importe,
        saldoPosterior: this.redondear(saldo - importe),
        concepto: `Aplicación a venta #${datos.folio}`,
        usuarioId: datos.usuarioId ?? null,
      }),
    );
    return importe;
  }

  async abonar(
    em: EntityManager,
    datos: {
      empresaId: string;
      clienteId: string;
      devolucionId: string;
      importe: number;
      concepto: string;
      usuarioId?: string;
    },
  ) {
    if (datos.importe <= 0) return;
    await this.bloquear(em, datos.empresaId, datos.clienteId);
    const saldo = await this.saldoEn(em, datos.empresaId, datos.clienteId);
    const repo = em.getRepository(SaldoFavorClienteMovimiento);
    const existente = await repo.findOne({
      where: { empresaId: datos.empresaId, devolucionId: datos.devolucionId },
    });
    if (existente) return;
    await repo.save(
      repo.create({
        ...datos,
        ventaId: null,
        tipo: TipoMovimientoSaldoFavor.ABONO,
        importe: this.redondear(datos.importe),
        saldoPosterior: this.redondear(saldo + datos.importe),
        usuarioId: datos.usuarioId ?? null,
      }),
    );
  }

  /**
   * Devuelve al cliente el saldo a favor que una venta ANULADA había consumido.
   *
   * POR QUÉ HACE FALTA UN MÉTODO APARTE
   *
   * `abonar` identifica el abono por `devolucionId`, que es su clave de
   * idempotencia. Una anulación no tiene devolución —ésa es justo la diferencia
   * entre las dos operaciones—, así que pasarle el id de la venta por ese campo
   * dejaría el auxiliar diciendo que hubo una devolución que nunca existió.
   *
   * LO QUE ESTO CIERRA
   *
   * Hasta el 5-oct-2026 la anulación de una venta pagada con saldo a favor
   * estaba **prohibida**, y el manual del sistema lo documentaba con su motivo:
   * «anularla dejaría ese saldo sin restituir y la cuenta de cobro
   * descuadrada». Ese día se levantó el bloqueo porque la póliza de reversión
   * pasó a espejar la de la venta, y el pasivo con el cliente ya se restituye
   * en el MAYOR.
   *
   * Pero el auxiliar —esta tabla, que es la que dice cuánto saldo le queda al
   * cliente— no se tocaba. El cliente perdía ese dinero y los dos libros
   * divergían por ese importe exacto: el mismo descuadre que el bloqueo evitaba,
   * sólo que ahora sin aviso. El manual tenía razón; lo que faltaba era hacer
   * las dos mitades, no quitar la advertencia.
   */
  async abonarPorAnulacionDeVenta(
    em: EntityManager,
    datos: {
      empresaId: string;
      clienteId: string;
      ventaId: string;
      importe: number;
      concepto: string;
      usuarioId?: string;
    },
  ) {
    const importe = this.redondear(Number(datos.importe ?? 0));
    if (importe <= 0) return;
    await this.bloquear(em, datos.empresaId, datos.clienteId);
    const repo = em.getRepository(SaldoFavorClienteMovimiento);
    /*
     * Idempotencia por venta: una venta se anula una vez, y el reintento de un
     * proceso a medias no puede abonarle el saldo dos veces. No hay índice
     * único para esto —el de la tabla cubre sólo el CARGO—, así que se
     * comprueba aquí, dentro del candado por cliente.
     */
    const existente = await repo.findOne({
      where: {
        empresaId: datos.empresaId,
        ventaId: datos.ventaId,
        tipo: TipoMovimientoSaldoFavor.ABONO,
      },
    });
    if (existente) return;
    const saldo = await this.saldoEn(em, datos.empresaId, datos.clienteId);
    await repo.save(
      repo.create({
        empresaId: datos.empresaId,
        clienteId: datos.clienteId,
        ventaId: datos.ventaId,
        devolucionId: null,
        tipo: TipoMovimientoSaldoFavor.ABONO,
        importe,
        saldoPosterior: this.redondear(saldo + importe),
        concepto: datos.concepto,
        usuarioId: datos.usuarioId ?? null,
      }),
    );
  }

  async consultar(clienteId: string, empresaId: string) {
    const repo = this.dataSource.getRepository(SaldoFavorClienteMovimiento);
    const saldo = await this.saldoEn(this.dataSource.manager, empresaId, clienteId);
    return {
      clienteId,
      saldo,
      movimientos: await repo.find({
        where: { empresaId, clienteId },
        order: { fecha: 'DESC', id: 'DESC' },
        take: 100,
      }),
    };
  }
}
