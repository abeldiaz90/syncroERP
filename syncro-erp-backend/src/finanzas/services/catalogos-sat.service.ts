import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BANCOS_ANEXO_24_2026,
  CODIGOS_AGRUPADORES_SAT_2026,
  METODOS_PAGO_ANEXO_24_2026,
  MONEDAS_ANEXO_24_2026,
  SAT_ANEXO_24_2026,
} from '../data/catalogos-sat-2026';
import { CatalogoFiscalVersion } from '../entities/catalogo-fiscal-version.entity';
import {
  CatalogoSatEntrada,
  TipoCatalogoSat,
} from '../entities/catalogo-sat-entrada.entity';
import { CuentaContableSatMapeo } from '../entities/cuenta-contable-sat-mapeo.entity';
import {
  CuentaContable,
  RolCuentaSistema,
} from '../entities/cuenta-contable.entity';
import { MapearCuentaSatDto } from '../dto/mapear-cuenta-sat.dto';

const CODIGOS_AGRUPADORES = new Set<string>(
  CODIGOS_AGRUPADORES_SAT_2026.map((entrada) => entrada.codigo),
);

@Injectable()
export class CatalogosSatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogosSatService.name);

  constructor(
    @InjectRepository(CatalogoFiscalVersion)
    private readonly versionRepo: Repository<CatalogoFiscalVersion>,
    @InjectRepository(CatalogoSatEntrada)
    private readonly entradaRepo: Repository<CatalogoSatEntrada>,
    @InjectRepository(CuentaContableSatMapeo)
    private readonly mapeoRepo: Repository<CuentaContableSatMapeo>,
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    // En desarrollo DB_SYNC crea las tablas sin ejecutar migraciones. Esta
    // carga idempotente garantiza el mismo catálogo que en producción.
    await this.asegurarCatalogo2026();
  }

  async asegurarCatalogo2026() {
    let version = await this.versionRepo.findOne({
      where: { clave: SAT_ANEXO_24_2026.clave },
    });
    if (!version) {
      version = await this.versionRepo.save(
        this.versionRepo.create({
          ...SAT_ANEXO_24_2026,
          nombre: 'Anexo 24 de la Resolución Miscelánea Fiscal para 2026',
          fechaPublicacion: new Date(SAT_ANEXO_24_2026.fechaPublicacion),
          vigenciaDesde: new Date(SAT_ANEXO_24_2026.vigenciaDesde),
          vigenciaHasta: null,
          estado: 'VIGENTE',
        }),
      );
    }

    const existentes = await this.entradaRepo.find({
      select: { tipo: true, clave: true },
      where: { versionId: version.id },
    });
    const llaves = new Set(existentes.map((e) => `${e.tipo}:${e.clave}`));
    const nuevas: Partial<CatalogoSatEntrada>[] = [];

    for (const entrada of CODIGOS_AGRUPADORES_SAT_2026) {
      if (!llaves.has(`AGRUPADOR:${entrada.codigo}`)) {
        nuevas.push({
          versionId: version.id,
          tipo: TipoCatalogoSat.AGRUPADOR,
          clave: entrada.codigo,
          nombre: entrada.nombre,
          nivel: entrada.nivel,
          clavePadre: entrada.codigoPadre ? String(entrada.codigoPadre) : null,
          activo: true,
        });
      }
    }
    for (const [tipo, catalogo] of [
      [TipoCatalogoSat.MONEDA, MONEDAS_ANEXO_24_2026],
      [TipoCatalogoSat.BANCO, BANCOS_ANEXO_24_2026],
      [TipoCatalogoSat.METODO_PAGO, METODOS_PAGO_ANEXO_24_2026],
    ] as const) {
      for (const entrada of catalogo) {
        if (!llaves.has(`${tipo}:${entrada.clave}`)) {
          nuevas.push({
            versionId: version.id,
            tipo,
            clave: entrada.clave,
            nombre: entrada.nombre,
            nivel: null,
            clavePadre: null,
            activo: true,
          });
        }
      }
    }

    for (let index = 0; index < nuevas.length; index += 200) {
      await this.entradaRepo.save(
        this.entradaRepo.create(nuevas.slice(index, index + 200)),
      );
    }
    if (nuevas.length) {
      this.logger.log(
        `Anexo 24 SAT 2026 precargado: ${nuevas.length} entradas nuevas.`,
      );
    }
    return version;
  }

  async resumen() {
    const version = await this.asegurarCatalogo2026();
    const conteos = await this.entradaRepo
      .createQueryBuilder('e')
      .select('e.tipo', 'tipo')
      .addSelect('COUNT(*)', 'total')
      .where('e.versionId = :versionId', { versionId: version.id })
      .andWhere('e.activo = :activo', { activo: true })
      .groupBy('e.tipo')
      .getRawMany<{ tipo: TipoCatalogoSat; total: string }>();
    return {
      version: {
        clave: version.clave,
        ejercicio: version.ejercicio,
        fechaPublicacion: version.fechaPublicacion,
        vigenciaDesde: version.vigenciaDesde,
        fuenteUrl: version.fuenteUrl,
        sha256: version.sha256,
        estado: version.estado,
      },
      catalogos: Object.fromEntries(
        conteos.map((fila) => [fila.tipo, Number(fila.total)]),
      ),
    };
  }

  async listar(
    tipo: TipoCatalogoSat,
    buscar?: string,
    pagina = 1,
    limite = 50,
  ) {
    if (!Object.values(TipoCatalogoSat).includes(tipo)) {
      throw new BadRequestException('El tipo de catálogo SAT no es válido.');
    }
    const version = await this.asegurarCatalogo2026();
    const safePage = Math.max(1, Number(pagina) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limite) || 50));
    const qb = this.entradaRepo
      .createQueryBuilder('e')
      .where('e.versionId = :versionId', { versionId: version.id })
      .andWhere('e.tipo = :tipo', { tipo })
      .andWhere('e.activo = :activo', { activo: true });
    if (buscar?.trim()) {
      qb.andWhere('(e.clave LIKE :buscar OR e.nombre LIKE :buscar)', {
        buscar: `%${buscar.trim()}%`,
      });
    }
    const [datos, total] = await qb
      .orderBy('e.clave', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    return { datos, total, pagina: safePage, limite: safeLimit };
  }

  validarCodigoAgrupador(codigo?: string | null) {
    if (!codigo) return;
    if (!CODIGOS_AGRUPADORES.has(codigo)) {
      throw new BadRequestException(
        `El código agrupador SAT "${codigo}" no existe en el Anexo 24 de 2026.`,
      );
    }
  }

  async mapearCuenta(
    cuentaId: string,
    empresaId: string,
    dto: MapearCuentaSatDto,
    usuarioId?: string,
    sugeridoPorSistema = false,
  ) {
    this.validarCodigoAgrupador(dto.codigoAgrupador);
    const fecha = new Date(
      `${(dto.vigenciaDesde ?? SAT_ANEXO_24_2026.vigenciaDesde).substring(0, 10)}T00:00:00`,
    );
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('La fecha de vigencia no es válida.');
    }

    return this.dataSource.transaction(async (em) => {
      const cuenta = await em.findOne(CuentaContable, {
        where: { id: cuentaId, empresaId },
      });
      if (!cuenta) throw new NotFoundException('Cuenta no encontrada.');
      const version = await em.findOne(CatalogoFiscalVersion, {
        where: { clave: SAT_ANEXO_24_2026.clave },
      });
      if (!version) {
        throw new BadRequestException(
          'El catálogo SAT 2026 todavía no está disponible.',
        );
      }
      const entrada = await em.findOne(CatalogoSatEntrada, {
        where: {
          versionId: version.id,
          tipo: TipoCatalogoSat.AGRUPADOR,
          clave: dto.codigoAgrupador,
          activo: true,
        },
      });
      if (!entrada) {
        throw new BadRequestException(
          'El código no pertenece a la versión SAT vigente.',
        );
      }

      const activos = await em.find(CuentaContableSatMapeo, {
        where: { empresaId, cuentaContableId: cuenta.id, activo: true },
      });
      const vigente = activos.find((mapeo) => mapeo.entradaId === entrada.id);
      if (vigente) {
        cuenta.codigoAgrupadorSAT = entrada.clave;
        await em.save(cuenta);
        if (dto.confirmar === true && !vigente.confirmado) {
          vigente.confirmado = true;
          vigente.confirmadoPorId = usuarioId ?? null;
          vigente.fechaConfirmacion = new Date();
          return em.save(vigente);
        }
        return vigente;
      }
      for (const anterior of activos) {
        anterior.activo = false;
        anterior.vigenciaHasta = new Date(fecha.getTime() - 86_400_000);
      }
      if (activos.length) await em.save(activos);

      cuenta.codigoAgrupadorSAT = entrada.clave;
      await em.save(cuenta);
      const confirmado = dto.confirmar === true;
      return em.save(
        em.create(CuentaContableSatMapeo, {
          empresaId,
          cuentaContableId: cuenta.id,
          versionId: version.id,
          entradaId: entrada.id,
          vigenciaDesde: fecha,
          vigenciaHasta: null,
          activo: true,
          sugeridoPorSistema,
          confirmado,
          confirmadoPorId: confirmado ? usuarioId : null,
          fechaConfirmacion: confirmado ? new Date() : null,
        }),
      );
    });
  }

  async sincronizarCuenta(
    cuenta: CuentaContable,
    confirmar = false,
    usuarioId?: string,
  ) {
    if (!cuenta.codigoAgrupadorSAT) return null;
    return this.mapearCuenta(
      cuenta.id,
      cuenta.empresaId,
      {
        codigoAgrupador: cuenta.codigoAgrupadorSAT,
        confirmar,
      },
      usuarioId,
      !confirmar,
    );
  }

  /**
   * Versión por lotes usada por la carga inicial de 1,080 cuentas.
   * Evita abrir una transacción por cuenta y no reemplaza clasificaciones que
   * un contador ya haya confirmado manualmente.
   */
  async sincronizarCuentasMasivo(cuentas: CuentaContable[]) {
    const mapeables = cuentas.filter(
      (cuenta) => cuenta.codigoAgrupadorSAT && cuenta.esAfectable,
    );
    if (!mapeables.length) return { creados: 0, existentes: 0 };

    const version = await this.asegurarCatalogo2026();
    const [entradas, mapeosActivos] = await Promise.all([
      this.entradaRepo.find({
        where: {
          versionId: version.id,
          tipo: TipoCatalogoSat.AGRUPADOR,
          activo: true,
        },
      }),
      this.mapeoRepo.find({
        where: { empresaId: mapeables[0].empresaId, activo: true },
      }),
    ]);
    const entradaPorClave = new Map(
      entradas.map((entrada) => [entrada.clave, entrada]),
    );
    const yaMapeadas = new Set(
      mapeosActivos.map((mapeo) => mapeo.cuentaContableId),
    );
    const nuevas: CuentaContableSatMapeo[] = [];

    for (const cuenta of mapeables) {
      if (yaMapeadas.has(cuenta.id)) continue;
      const entrada = entradaPorClave.get(cuenta.codigoAgrupadorSAT);
      if (!entrada) {
        throw new BadRequestException(
          `La cuenta ${cuenta.numeroCuenta} usa un agrupador inexistente.`,
        );
      }
      nuevas.push(
        this.mapeoRepo.create({
          empresaId: cuenta.empresaId,
          cuentaContableId: cuenta.id,
          versionId: version.id,
          entradaId: entrada.id,
          vigenciaDesde: new Date(
            `${SAT_ANEXO_24_2026.vigenciaDesde}T00:00:00`,
          ),
          vigenciaHasta: null,
          activo: true,
          sugeridoPorSistema: true,
          confirmado: false,
          confirmadoPorId: null,
          fechaConfirmacion: null,
        }),
      );
    }
    if (nuevas.length) {
      await this.mapeoRepo.save(nuevas, { chunk: 100 });
    }
    return {
      creados: nuevas.length,
      existentes: mapeables.length - nuevas.length,
    };
  }

  async diagnosticoMapeo(empresaId: string) {
    const cuentas = await this.cuentaRepo.find({
      where: { empresaId, activo: true },
      order: { numeroCuenta: 'ASC' },
    });
    const mapeos = await this.mapeoRepo.find({
      where: { empresaId, activo: true },
      relations: ['entrada', 'version'],
    });
    const cuentasPorId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
    const porCuenta = new Map(mapeos.map((m) => [m.cuentaContableId, m]));
    const mapeables = cuentas.filter(
      (cuenta) =>
        cuenta.esAfectable &&
        cuenta.rolSistema !== RolCuentaSistema.SALDOS_INICIALES,
    );
    const pendientes = mapeables
      .filter((cuenta) => !porCuenta.has(cuenta.id))
      .map((cuenta) => ({
        cuentaId: cuenta.id,
        numeroCuenta: cuenta.numeroCuenta,
        nombre: cuenta.nombre,
        codigoAnterior: cuenta.codigoAgrupadorSAT,
      }));
    const sinConfirmar = mapeos
      .filter((mapeo) => !mapeo.confirmado)
      .map((mapeo) => {
        const cuenta = cuentasPorId.get(mapeo.cuentaContableId);
        return {
          cuentaId: mapeo.cuentaContableId,
          numeroCuenta: cuenta?.numeroCuenta,
          cuenta: cuenta?.nombre,
          codigo: mapeo.entrada?.clave,
          nombre: mapeo.entrada?.nombre,
        };
      });
    return {
      completo: pendientes.length === 0,
      totalCuentasAfectables: mapeables.length,
      totalMapeadas: mapeos.length,
      pendientes,
      sinConfirmar,
      advertencias: this.advertenciasSemanticas(cuentas),
    };
  }

  async diagnosticoHistoricoIva(empresaId: string) {
    const [ventas, compras, cobranzas, pagosProveedor] = await Promise.all([
      this.dataSource.query<Array<{ total: number | string }>>(
        `
          SELECT COUNT(DISTINCT v.id) total
          FROM ventas v
          INNER JOIN polizas p
            ON p.empresaId = v.empresaId
           AND p.origenTipo = 'VENTA'
           AND p.origenId = v.id
          INNER JOIN partidas_poliza pp ON pp.polizaId = p.id
          INNER JOIN cuentas_contables c ON c.id = pp.cuentaContableId
          WHERE v.empresaId = @0
            AND v.metodoPago IN (
              'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES'
            )
            AND c.rolSistema = 'IVA_TRASLADADO_COBRADO'
            AND NOT EXISTS (
              SELECT 1
              FROM partidas_poliza pp2
              INNER JOIN cuentas_contables c2 ON c2.id = pp2.cuentaContableId
              WHERE pp2.polizaId = p.id
                AND c2.rolSistema = 'IVA_TRASLADADO_NO_COBRADO'
            )
        `,
        [empresaId],
      ),
      this.dataSource.query<Array<{ total: number | string }>>(
        `
          SELECT COUNT(DISTINCT p.id) total
          FROM polizas p
          INNER JOIN partidas_poliza pp ON pp.polizaId = p.id
          INNER JOIN cuentas_contables c ON c.id = pp.cuentaContableId
          WHERE p.empresaId = @0
            AND p.origenTipo = 'RECEPCION_COMPRA'
            AND c.rolSistema = 'IVA_ACREDITABLE_PAGADO'
            AND NOT EXISTS (
              SELECT 1
              FROM partidas_poliza pp2
              INNER JOIN cuentas_contables c2 ON c2.id = pp2.cuentaContableId
              WHERE pp2.polizaId = p.id
                AND c2.rolSistema = 'IVA_ACREDITABLE_PENDIENTE'
            )
        `,
        [empresaId],
      ),
      this.dataSource.query<Array<{ total: number | string }>>(
        `
          SELECT COUNT(*) total
          FROM pagos_cobranza pc
          INNER JOIN creditos_clientes cr ON cr.id = pc.creditoId
          INNER JOIN ventas v ON v.id = cr.ventaId
          WHERE pc.empresaId = @0
            AND v.impuestoTotal > 0
            AND pc.montoCapital > 0
            AND pc.ivaReclasificado = 0
        `,
        [empresaId],
      ),
      this.dataSource.query<Array<{ total: number | string }>>(
        `
          SELECT COUNT(*) total
          FROM pagos_proveedor pg
          INNER JOIN ordenes_compra oc ON oc.id = pg.ordenCompraId
          INNER JOIN cotizaciones cot ON cot.id = oc.cotizacionId
          WHERE pg.empresaId = @0
            AND cot.impuestoTotal > 0
            AND pg.ivaReclasificado = 0
        `,
        [empresaId],
      ),
    ]);
    const resultado = {
      ventasCreditoConIvaCobrado: Number(ventas?.[0]?.total ?? 0),
      comprasConIvaMarcadoPagado: Number(compras?.[0]?.total ?? 0),
      cobranzasSinReclasificacionIva: Number(cobranzas?.[0]?.total ?? 0),
      pagosProveedorSinReclasificacionIva: Number(
        pagosProveedor?.[0]?.total ?? 0,
      ),
    };
    return {
      ...resultado,
      requiereRegularizacion: Object.values(resultado).some(
        (total) => total > 0,
      ),
      mensaje:
        'No se modifican pólizas históricas automáticamente. Si aparecen operaciones, deben regularizarse con una póliza auditable revisada por el contador.',
    };
  }

  private advertenciasSemanticas(cuentas: CuentaContable[]) {
    const advertencias: string[] = [];
    for (const cuenta of cuentas) {
      if (
        cuenta.rolSistema === RolCuentaSistema.INTERESES &&
        cuenta.codigoAgrupadorSAT === '702.01'
      ) {
        advertencias.push(
          `${cuenta.numeroCuenta}: 702.01 es utilidad cambiaria, no intereses.`,
        );
      }
      if (
        cuenta.rolSistema === RolCuentaSistema.SALDOS_INICIALES &&
        cuenta.codigoAgrupadorSAT === '304.01'
      ) {
        advertencias.push(
          `${cuenta.numeroCuenta}: una cuenta técnica de apertura no siempre corresponde a utilidad de ejercicios anteriores.`,
        );
      }
    }
    return advertencias;
  }
}
