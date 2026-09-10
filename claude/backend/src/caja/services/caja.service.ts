import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import {
  MovimientoCaja,
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../entities/movimiento-caja.entity';
import { EstadoTurnoCaja, TurnoCaja } from '../entities/turno-caja.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import {
  AbrirTurnoCajaDto,
  CerrarTurnoCajaDto,
  MovimientoManualCajaDto,
} from '../dto/caja.dto';

const dinero = (valor: unknown) =>
  Math.round((Number(valor ?? 0) + Number.EPSILON) * 100) / 100;

export type RegistrarMovimientoCajaInput = {
  cuentaCajaId: string;
  naturaleza: NaturalezaMovimientoCaja;
  tipo: TipoMovimientoCaja;
  importe: number;
  concepto: string;
  referencia?: string;
  documentoId?: string;
  tipoDocumento?: string;
};

@Injectable()
export class CajaService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TurnoCaja)
    private readonly turnos: Repository<TurnoCaja>,
    @InjectRepository(MovimientoCaja)
    private readonly movimientos: Repository<MovimientoCaja>,
    private readonly tesoreria: TesoreriaService,
  ) {}

  private async validarCuentaCaja(
    em: EntityManager,
    cuentaCajaId: string,
    empresaId: string,
  ) {
    const cuenta = await em.findOne(CuentaBancaria, {
      where: {
        id: cuentaCajaId,
        empresaId,
        activo: true,
        tipo: TipoCuentaBancaria.CAJA,
      },
    });
    if (!cuenta) {
      throw new BadRequestException(
        'La caja no existe, está inactiva, pertenece a otra empresa o no es de tipo CAJA.',
      );
    }
    return cuenta;
  }

  async abrir(
    dto: AbrirTurnoCajaDto,
    empresaId: string,
    usuarioId: string,
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const [candado] = await em.query(
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
        [`CAJA:${empresaId}:${dto.cuentaCajaId}`],
      );
      if (Number(candado?.resultado) < 0) {
        throw new ConflictException(
          'No fue posible reservar la caja para abrir el turno. Intenta nuevamente.',
        );
      }
      await this.validarCuentaCaja(em, dto.cuentaCajaId, empresaId);
      const abierta = await em.findOne(TurnoCaja, {
        where: {
          empresaId,
          cuentaCajaId: dto.cuentaCajaId,
          estado: EstadoTurnoCaja.ABIERTO,
        },
      });
      if (abierta) {
        throw new ConflictException(
          'La caja ya tiene un turno abierto. Debe cerrarse antes de abrir otro.',
        );
      }
      return em.save(
        em.create(TurnoCaja, {
          empresaId,
          cuentaCajaId: dto.cuentaCajaId,
          usuarioAperturaId: usuarioId,
          usuarioCierreId: null,
          estado: EstadoTurnoCaja.ABIERTO,
          fondoInicial: dinero(dto.fondoInicial),
          totalEntradas: 0,
          totalSalidas: 0,
          efectivoEsperado: dinero(dto.fondoInicial),
          efectivoContado: null,
          diferencia: null,
          observacionesApertura: dto.observaciones?.trim() || null,
          observacionesCierre: null,
          fechaCierre: null,
        }),
      );
    });
  }

  async registrarEnTransaccion(
    em: EntityManager,
    input: RegistrarMovimientoCajaInput,
    empresaId: string,
    usuarioId?: string,
  ): Promise<MovimientoCaja> {
    const importe = dinero(input.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      throw new BadRequestException(
        'El importe del movimiento de caja debe ser mayor a cero.',
      );
    }
    await this.validarCuentaCaja(em, input.cuentaCajaId, empresaId);
    const turno = await em
      .createQueryBuilder(TurnoCaja, 'turno')
      .setLock('pessimistic_write')
      .where(
        'turno.empresaId = :empresaId AND turno.cuentaCajaId = :cuentaCajaId AND turno.estado = :estado',
        {
          empresaId,
          cuentaCajaId: input.cuentaCajaId,
          estado: EstadoTurnoCaja.ABIERTO,
        },
      )
      .getOne();
    if (!turno) {
      throw new ConflictException(
        'No existe un turno abierto para la caja seleccionada. Abre la caja antes de cobrar o reembolsar efectivo.',
      );
    }

    if (input.documentoId) {
      const previo = await em.findOne(MovimientoCaja, {
        where: {
          turnoCajaId: turno.id,
          tipo: input.tipo,
          documentoId: input.documentoId,
        },
      });
      if (previo) return previo;
    }

    const totalEntradas =
      input.naturaleza === NaturalezaMovimientoCaja.ENTRADA
        ? dinero(turno.totalEntradas + importe)
        : dinero(turno.totalEntradas);
    const totalSalidas =
      input.naturaleza === NaturalezaMovimientoCaja.SALIDA
        ? dinero(turno.totalSalidas + importe)
        : dinero(turno.totalSalidas);
    const efectivoEsperado = dinero(
      turno.fondoInicial + totalEntradas - totalSalidas,
    );
    if (efectivoEsperado < 0) {
      throw new BadRequestException(
        `La salida excede el efectivo disponible. Disponible: ${dinero(
          turno.efectivoEsperado,
        ).toFixed(2)}.`,
      );
    }

    const movimiento = await em.save(
      em.create(MovimientoCaja, {
        empresaId,
        turnoCajaId: turno.id,
        cuentaCajaId: input.cuentaCajaId,
        naturaleza: input.naturaleza,
        tipo: input.tipo,
        importe,
        concepto: input.concepto.trim().slice(0, 300),
        referencia: input.referencia?.trim().slice(0, 120) || null,
        documentoId: input.documentoId ?? null,
        tipoDocumento: input.tipoDocumento?.slice(0, 40) ?? null,
        usuarioId: usuarioId ?? null,
      }),
    );

    turno.totalEntradas = totalEntradas;
    turno.totalSalidas = totalSalidas;
    turno.efectivoEsperado = efectivoEsperado;
    await em.save(turno);
    return movimiento;
  }

  /**
   * Entrada o retiro manual de efectivo.
   *
   * Antes sólo escribía en `MovimientoCaja` y actualizaba el turno. El saldo
   * de esa misma cuenta en Tesorería no cambiaba y el mayor tampoco: un retiro
   * del cajón bajaba el `efectivoEsperado` del turno mientras Tesorería seguía
   * diciendo que el dinero estaba ahí. Ahora el movimiento se propaga a
   * tesorería dentro de la misma transacción, y tesorería encola el asiento.
   */
  async registrarManual(
    dto: MovimientoManualCajaDto,
    naturaleza: NaturalezaMovimientoCaja,
    empresaId: string,
    usuarioId: string,
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const movimiento = await this.registrarEnTransaccion(
        em,
        {
          cuentaCajaId: dto.cuentaCajaId,
          naturaleza,
          tipo:
            naturaleza === NaturalezaMovimientoCaja.ENTRADA
              ? TipoMovimientoCaja.INGRESO_MANUAL
              : TipoMovimientoCaja.RETIRO,
          importe: dto.importe,
          concepto: dto.concepto,
          referencia: dto.referencia,
        },
        empresaId,
        usuarioId,
      );

      await this.tesoreria.registrarEnTransaccion(
        {
          cuentaBancariaId: dto.cuentaCajaId,
          fecha: fechaCalendarioNegocio(),
          tipo:
            naturaleza === NaturalezaMovimientoCaja.ENTRADA
              ? TipoMovimiento.INGRESO
              : TipoMovimiento.EGRESO,
          importe: dto.importe,
          concepto: dto.concepto,
          origen: OrigenMovimiento.MANUAL,
          referencia: dto.referencia,
          documentoId: movimiento.id,
          tipoDocumento: 'MOVIMIENTO_CAJA',
          cuentaContrapartidaId: dto.cuentaContrapartidaId,
        },
        empresaId,
        usuarioId,
        em,
      );

      return movimiento;
    });
  }

  async resumen(id: string, empresaId: string) {
    const turno = await this.turnos.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException('Turno de caja no encontrado.');
    const porTipo = await this.movimientos
      .createQueryBuilder('movimiento')
      .select('movimiento.tipo', 'tipo')
      .addSelect('movimiento.naturaleza', 'naturaleza')
      .addSelect('SUM(movimiento.importe)', 'importe')
      .where(
        'movimiento.turnoCajaId = :id AND movimiento.empresaId = :empresaId',
        { id, empresaId },
      )
      .groupBy('movimiento.tipo')
      .addGroupBy('movimiento.naturaleza')
      .getRawMany<{ tipo: string; naturaleza: string; importe: string }>();
    return {
      turno,
      resumenPorTipo: porTipo.map((fila) => ({
        ...fila,
        importe: dinero(fila.importe),
      })),
    };
  }

  async cerrar(
    id: string,
    dto: CerrarTurnoCajaDto,
    empresaId: string,
    usuarioId: string,
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const turno = await em
        .createQueryBuilder(TurnoCaja, 'turno')
        .setLock('pessimistic_write')
        .where('turno.id = :id AND turno.empresaId = :empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!turno) throw new NotFoundException('Turno de caja no encontrado.');
      if (turno.estado !== EstadoTurnoCaja.ABIERTO) {
        throw new ConflictException('El turno de caja ya está cerrado.');
      }
      const contado = dinero(dto.efectivoContado);
      const esperado = dinero(
        turno.fondoInicial + turno.totalEntradas - turno.totalSalidas,
      );
      const diferencia = dinero(contado - esperado);
      if (Math.abs(diferencia) >= 0.01 && !dto.observaciones?.trim()) {
        throw new BadRequestException(
          'Explica la diferencia de arqueo antes de cerrar la caja.',
        );
      }
      turno.estado = EstadoTurnoCaja.CERRADO;
      turno.efectivoEsperado = esperado;
      turno.efectivoContado = contado;
      turno.diferencia = diferencia;
      turno.usuarioCierreId = usuarioId;
      turno.observacionesCierre = dto.observaciones?.trim() || null;
      turno.fechaCierre = new Date();
      return em.save(turno);
    });
  }

  turnosAbiertos(empresaId: string) {
    return this.turnos.find({
      where: { empresaId, estado: EstadoTurnoCaja.ABIERTO },
      order: { fechaApertura: 'ASC' },
    });
  }

  async listarTurnos(empresaId: string, pagina = 1, limite = 20) {
    const take = Math.min(Math.max(limite, 1), 100);
    const page = Math.max(pagina, 1);
    const [data, total] = await this.turnos.findAndCount({
      where: { empresaId },
      order: { fechaApertura: 'DESC' },
      skip: (page - 1) * take,
      take,
    });
    return { data, total, pagina: page, limite: take };
  }

  async movimientosTurno(id: string, empresaId: string) {
    const existe = await this.turnos.exist({ where: { id, empresaId } });
    if (!existe) throw new NotFoundException('Turno de caja no encontrado.');
    return this.movimientos.find({
      where: { turnoCajaId: id, empresaId },
      order: { fechaCreacion: 'ASC' },
      take: 5000,
    });
  }
}
