import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConciliacionFinanciera } from '../entities/conciliacion-financiera.entity';
import {
  IniciarConciliacionDto,
  ResolverAreaConciliacionDto,
} from '../dto/conciliacion-financiera.dto';
import { ActivacionFinancieraService } from './activacion-financiera.service';

type Area = 'CAJA' | 'BANCOS' | 'CLIENTES' | 'PROVEEDORES' | 'INVENTARIO';
type Resoluciones = Partial<
  Record<
    Area,
    {
      estado: 'CONFIRMADA' | 'JUSTIFICADA' | 'REQUIERE_AJUSTE';
      justificacion?: string;
      fecha: string;
    }
  >
>;

@Injectable()
export class ConciliacionFinancieraService {
  constructor(
    @InjectRepository(ConciliacionFinanciera)
    private readonly conciliacionRepo: Repository<ConciliacionFinanciera>,
    private readonly dataSource: DataSource,
    private readonly activacionService: ActivacionFinancieraService,
  ) {}

  private redondear(valor: unknown) {
    return Math.round(Number(valor ?? 0) * 100) / 100;
  }

  private json<T>(texto: string | null | undefined, respaldo: T): T {
    try {
      return texto ? JSON.parse(texto) : respaldo;
    } catch {
      return respaldo;
    }
  }

  private async tablaExiste(nombre: string) {
    const filas = await this.dataSource.query(
      `SELECT CASE WHEN to_regclass($1) IS NULL THEN 0 ELSE 1 END existe`,
      [nombre],
    );
    return Number(filas?.[0]?.existe ?? 0) === 1;
  }

  private async saldosMayor(empresaId: string, fechaCorte: string) {
    const filas = await this.dataSource.query(
      `
        SELECT
          c.rolSistema,
          SUM(CAST(pp.cargo AS decimal(18,4))) cargos,
          SUM(CAST(pp.abono AS decimal(18,4))) abonos
        FROM partidas_poliza pp
        INNER JOIN polizas p ON p.id = pp.polizaId
        INNER JOIN cuentas_contables c ON c.id = pp.cuentaContableId
        WHERE p.empresaId = $1
          AND p.fecha <= $2
          AND c.rolSistema IS NOT NULL
        GROUP BY c.rolSistema
      `,
      [empresaId, fechaCorte],
    );
    const porRol = new Map<string, { cargos: number; abonos: number }>(
      filas.map((fila: any) => [
        fila.rolSistema,
        {
          cargos: this.redondear(fila.cargos),
          abonos: this.redondear(fila.abonos),
        },
      ]),
    );
    const saldo = (rol: string, acreedora = false) => {
      const movimientos = porRol.get(rol) ?? { cargos: 0, abonos: 0 };
      return this.redondear(
        acreedora
          ? movimientos.abonos - movimientos.cargos
          : movimientos.cargos - movimientos.abonos,
      );
    };
    return {
      CAJA: saldo('CAJA'),
      BANCOS: saldo('BANCOS'),
      CLIENTES: saldo('CLIENTES_CXC'),
      PROVEEDORES: saldo('PROVEEDORES', true),
      INVENTARIO: saldo('INVENTARIO'),
    };
  }

  private async auxiliarTesoreria(empresaId: string, fechaCorte: string) {
    if (
      !(await this.tablaExiste('cuentas_bancarias')) ||
      !(await this.tablaExiste('tesoreria_movimientos'))
    ) {
      return { disponible: false, caja: [], bancos: [] };
    }
    const filas = await this.dataSource.query(
      `
        WITH ultimo AS (
          SELECT
            m.cuentaBancariaId,
            m.saldoPosterior,
            ROW_NUMBER() OVER (
              PARTITION BY m.cuentaBancariaId
              ORDER BY m.fecha DESC, m.fechaCreacion DESC, m.id DESC
            ) rn
          FROM tesoreria_movimientos m
          WHERE m.empresaId = $1
            AND m.fecha <= $2
            AND m.cancelado = false
        )
        SELECT
          c.id,
          c.nombre,
          c.tipo,
          c.numeroCuenta,
          c.cuentaContableId,
          CAST(COALESCE(u.saldoPosterior, 0) AS decimal(18,2)) saldo,
          CASE WHEN u.cuentaBancariaId IS NULL THEN 0 ELSE 1 END tieneMovimientos
        FROM cuentas_bancarias c
        LEFT JOIN ultimo u
          ON u.cuentaBancariaId = c.id AND u.rn = 1
        WHERE c.empresaId = $1 AND c.activo=true
        ORDER BY c.tipo, c.nombre
      `,
      [empresaId, fechaCorte],
    );
    const detalle = filas.map((fila: any) => ({
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      numeroCuenta: fila.numeroCuenta,
      cuentaContableId: fila.cuentaContableId,
      saldo: this.redondear(fila.saldo),
      tieneMovimientos: Boolean(fila.tieneMovimientos),
      vinculada: Boolean(fila.cuentaContableId),
    }));
    return {
      disponible: detalle.some((item: any) => item.tieneMovimientos),
      caja: detalle.filter((item: any) => item.tipo === 'CAJA'),
      bancos: detalle.filter((item: any) => item.tipo !== 'CAJA'),
    };
  }

  private async auxiliarClientes(empresaId: string, fechaCorte: string) {
    if (!(await this.tablaExiste('creditos_clientes'))) {
      return { disponible: false, detalle: [] };
    }
    const [filas, evidencia] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          cr.clienteId id,
          COALESCE(cl.nombre, 'Cliente sin nombre') nombre,
          COUNT(*) documentos,
          CAST(SUM(cr.saldoPendiente) AS decimal(18,2)) saldo
        FROM creditos_clientes cr
        LEFT JOIN clientes cl
          ON cl.id = cr.clienteId AND cl.empresaId = cr.empresaId
        WHERE cr.empresaId = $1
          AND cr.fechaInicio <= $2
          AND cr.estado IN ('ACTIVO', 'VENCIDO')
          AND cr.saldoPendiente <> 0
        GROUP BY cr.clienteId, cl.nombre
        ORDER BY saldo DESC
      `,
        [empresaId, fechaCorte],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) registros
           FROM creditos_clientes
          WHERE empresaId = $1 AND fechaInicio <= $2`,
        [empresaId, fechaCorte],
      ),
    ]);
    return {
      // Una cartera en cero también es comprobable si existe historia propia.
      disponible: Number(evidencia?.[0]?.registros ?? 0) > 0,
      detalle: filas.map((fila: any) => ({
        id: fila.id,
        nombre: fila.nombre,
        documentos: Number(fila.documentos),
        saldo: this.redondear(fila.saldo),
      })),
    };
  }

  private async auxiliarProveedores(empresaId: string, fechaCorte: string) {
    if (!(await this.tablaExiste('ordenes_compra'))) {
      return { disponible: false, detalle: [] };
    }
    const [filas, evidencia] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          oc.proveedorId id,
          COALESCE(pr.nombre, 'Proveedor sin nombre') nombre,
          COUNT(*) documentos,
          CAST(SUM(oc.saldoPendiente) AS decimal(18,2)) saldo
        FROM ordenes_compra oc
        LEFT JOIN proveedores pr
          ON pr.id = oc.proveedorId AND pr.empresaId = oc.empresaId
        WHERE oc.empresaId = $1
          AND CAST(oc.fechaCreacion AS date) <= $2
          AND oc.estado NOT IN ('PAGADA', 'CANCELADA')
          AND oc.saldoPendiente <> 0
        GROUP BY oc.proveedorId, pr.nombre
        ORDER BY saldo DESC
      `,
        [empresaId, fechaCorte],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) registros
           FROM ordenes_compra
          WHERE empresaId = $1 AND CAST(fechaCreacion AS date) <= $2`,
        [empresaId, fechaCorte],
      ),
    ]);
    return {
      disponible: Number(evidencia?.[0]?.registros ?? 0) > 0,
      detalle: filas.map((fila: any) => ({
        id: fila.id,
        nombre: fila.nombre,
        documentos: Number(fila.documentos),
        saldo: this.redondear(fila.saldo),
      })),
    };
  }

  private async auxiliarInventario(empresaId: string, fechaCorte: string) {
    if (!(await this.tablaExiste('lotes_inventario'))) {
      return { disponible: false, detalle: [], lotesCostoCero: 0 };
    }
    const [filas, evidencia] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          l.productoId id,
          COALESCE(p.nombre, 'Producto sin nombre') nombre,
          COALESCE(p.sku, '') referencia,
          COUNT(*) documentos,
          CAST(SUM(l.stockRestante) AS decimal(18,4)) cantidad,
          CAST(SUM(l.valorTotal) AS decimal(18,2)) saldo,
          SUM(CASE
            WHEN l.stockRestante > 0 AND l.costoUnitario = 0 THEN 1
            ELSE 0
          END) AS "lotesCostoCero"
        FROM lotes_inventario l
        LEFT JOIN productos p
          ON p.id = l.productoId AND p.empresaId = l.empresaId
        WHERE l.empresaId = $1
          AND CAST(l.fechaIngreso AS date) <= $2
          AND l.activo=true
          AND l.stockRestante <> 0
        GROUP BY l.productoId, p.nombre, p.sku
        ORDER BY saldo DESC
      `,
        [empresaId, fechaCorte],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) registros
           FROM lotes_inventario
          WHERE empresaId = $1 AND CAST(fechaIngreso AS date) <= $2`,
        [empresaId, fechaCorte],
      ),
    ]);
    return {
      disponible: Number(evidencia?.[0]?.registros ?? 0) > 0,
      lotesCostoCero: filas.reduce(
        (suma: number, fila: any) => suma + Number(fila.lotesCostoCero ?? 0),
        0,
      ),
      detalle: filas.map((fila: any) => ({
        id: fila.id,
        nombre: fila.nombre,
        referencia: fila.referencia,
        documentos: Number(fila.documentos),
        cantidad: this.redondear(fila.cantidad),
        saldo: this.redondear(fila.saldo),
        lotesCostoCero: Number(fila.lotesCostoCero ?? 0),
      })),
    };
  }

  private area(
    clave: Area,
    titulo: string,
    saldoContable: number,
    detalle: any[],
    disponible: boolean,
    advertencias: string[] = [],
  ) {
    const saldoAuxiliar = this.redondear(
      detalle.reduce((suma, item) => suma + Number(item.saldo ?? 0), 0),
    );
    const diferencia = this.redondear(saldoContable - saldoAuxiliar);
    return {
      clave,
      titulo,
      saldoContable: this.redondear(saldoContable),
      saldoAuxiliar,
      diferencia,
      disponible,
      cuadra: disponible && Math.abs(diferencia) < 0.01,
      detalle,
      advertencias,
    };
  }

  private async crearSnapshot(empresaId: string, fechaCorte: string) {
    const [mayor, tesoreria, clientes, proveedores, inventario] =
      await Promise.all([
        this.saldosMayor(empresaId, fechaCorte),
        this.auxiliarTesoreria(empresaId, fechaCorte),
        this.auxiliarClientes(empresaId, fechaCorte),
        this.auxiliarProveedores(empresaId, fechaCorte),
        this.auxiliarInventario(empresaId, fechaCorte),
      ]);

    const cajaAdvertencias = [
      ...(tesoreria.caja.some((item: any) => !item.vinculada)
        ? ['Hay cajas sin cuenta contable vinculada.']
        : []),
      ...(tesoreria.caja.some((item: any) => !item.tieneMovimientos)
        ? ['Hay cajas sin movimientos que demuestren su saldo actual.']
        : []),
    ];
    const bancoAdvertencias = [
      ...(tesoreria.bancos.some((item: any) => !item.vinculada)
        ? ['Hay bancos o TPV sin cuenta contable vinculada.']
        : []),
      ...(tesoreria.bancos.some((item: any) => !item.tieneMovimientos)
        ? ['Hay bancos o TPV sin movimientos que demuestren su saldo actual.']
        : []),
    ];
    const inventarioAdvertencias =
      inventario.lotesCostoCero > 0
        ? [
            `${inventario.lotesCostoCero} lote(s) con existencia conservan costo cero.`,
          ]
        : [];

    const areas = [
      this.area(
        'CAJA',
        'Cajas y fondos',
        mayor.CAJA,
        tesoreria.caja,
        tesoreria.caja.length > 0 &&
          tesoreria.caja.every((item: any) => item.tieneMovimientos),
        cajaAdvertencias,
      ),
      this.area(
        'BANCOS',
        'Bancos y terminales',
        mayor.BANCOS,
        tesoreria.bancos,
        tesoreria.bancos.length > 0 &&
          tesoreria.bancos.every((item: any) => item.tieneMovimientos),
        bancoAdvertencias,
      ),
      this.area(
        'CLIENTES',
        'Clientes por cobrar',
        mayor.CLIENTES,
        clientes.detalle,
        clientes.disponible,
      ),
      this.area(
        'PROVEEDORES',
        'Proveedores por pagar',
        mayor.PROVEEDORES,
        proveedores.detalle,
        proveedores.disponible,
      ),
      this.area(
        'INVENTARIO',
        'Inventario valuado',
        mayor.INVENTARIO,
        inventario.detalle,
        inventario.disponible,
        inventarioAdvertencias,
      ),
    ];
    return {
      fechaCorte,
      generadoEn: new Date().toISOString(),
      areas,
      resumen: {
        cuadradas: areas.filter((area) => area.cuadra).length,
        conDiferencia: areas.filter((area) => area.disponible && !area.cuadra)
          .length,
        sinEvidencia: areas.filter((area) => !area.disponible).length,
      },
    };
  }

  private presentar(entidad: ConciliacionFinanciera) {
    return {
      id: entidad.id,
      fechaCorte: entidad.fechaCorte,
      estado: entidad.estado,
      version: entidad.version,
      snapshot: this.json(entidad.snapshotJson, { areas: [], resumen: {} }),
      resoluciones: this.json<Resoluciones>(entidad.resolucionesJson, {}),
      fechaCreacion: entidad.fechaCreacion,
      fechaConfirmacion: entidad.fechaConfirmacion,
    };
  }

  async obtenerActual(empresaId: string) {
    await this.activacionService.exigirActiva(empresaId);
    const actual = await this.conciliacionRepo.findOne({
      where: { empresaId },
      order: { fechaCreacion: 'DESC' },
    });
    return actual ? this.presentar(actual) : null;
  }

  async iniciar(
    empresaId: string,
    usuarioId: string,
    dto: IniciarConciliacionDto,
  ) {
    await this.activacionService.exigirActiva(empresaId);
    const fechaCorte = dto.fechaCorte.substring(0, 10);
    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(ahora.getDate()).padStart(2, '0')}`;
    if (fechaCorte !== hoy) {
      throw new BadRequestException(
        'La conciliación inicial debe tomarse con fecha de hoy porque los auxiliares conservan saldos actuales, no reconstrucciones históricas.',
      );
    }
    const snapshot = await this.crearSnapshot(empresaId, fechaCorte);
    const entidad = await this.conciliacionRepo.save(
      this.conciliacionRepo.create({
        empresaId,
        fechaCorte: new Date(`${fechaCorte}T00:00:00`),
        estado:
          snapshot.resumen.conDiferencia > 0 ||
          snapshot.resumen.sinEvidencia > 0
            ? 'CON_DIFERENCIAS'
            : 'BORRADOR',
        snapshotJson: JSON.stringify(snapshot),
        resolucionesJson: '{}',
        creadoPor: usuarioId,
        version: 1,
      }),
    );
    return this.presentar(entidad);
  }

  async resolverArea(
    empresaId: string,
    id: string,
    area: Area,
    dto: ResolverAreaConciliacionDto,
  ) {
    const entidad = await this.conciliacionRepo.findOne({
      where: { id, empresaId },
    });
    if (!entidad) throw new NotFoundException('Conciliación no encontrada.');
    if (entidad.estado === 'CONCILIADA') {
      throw new ConflictException(
        'La conciliación ya fue confirmada y no puede modificarse.',
      );
    }
    const snapshot = this.json<any>(entidad.snapshotJson, { areas: [] });
    const encontrada = snapshot.areas.find((item: any) => item.clave === area);
    if (!encontrada) throw new BadRequestException('Área no válida.');
    if (
      dto.estado === 'CONFIRMADA' &&
      (!encontrada.disponible || !encontrada.cuadra)
    ) {
      throw new BadRequestException(
        'Sólo puede confirmarse directamente un área con evidencia disponible y diferencia cero.',
      );
    }
    if (
      dto.estado !== 'CONFIRMADA' &&
      (!dto.justificacion || dto.justificacion.trim().length < 10)
    ) {
      throw new BadRequestException(
        'Explica la diferencia o la acción necesaria con al menos 10 caracteres.',
      );
    }
    const resoluciones = this.json<Resoluciones>(entidad.resolucionesJson, {});
    resoluciones[area] = {
      estado: dto.estado,
      justificacion: dto.justificacion?.trim(),
      fecha: new Date().toISOString(),
    };
    entidad.resolucionesJson = JSON.stringify(resoluciones);
    entidad.version += 1;
    await this.conciliacionRepo.save(entidad);
    return this.presentar(entidad);
  }

  async confirmar(empresaId: string, id: string, usuarioId: string) {
    const entidad = await this.conciliacionRepo.findOne({
      where: { id, empresaId },
    });
    if (!entidad) throw new NotFoundException('Conciliación no encontrada.');
    if (entidad.estado === 'CONCILIADA') return this.presentar(entidad);
    const snapshot = this.json<any>(entidad.snapshotJson, { areas: [] });
    const resoluciones = this.json<Resoluciones>(entidad.resolucionesJson, {});
    const pendientes = snapshot.areas.filter(
      (area: any) => !resoluciones[area.clave as Area],
    );
    if (pendientes.length) {
      throw new BadRequestException(
        `Revisa todas las áreas antes de confirmar: ${pendientes
          .map((area: any) => area.titulo)
          .join(', ')}.`,
      );
    }
    const requierenAjuste = Object.values(resoluciones).filter(
      (resolucion) => resolucion?.estado === 'REQUIERE_AJUSTE',
    );
    if (requierenAjuste.length) {
      throw new BadRequestException(
        'Hay áreas marcadas para ajuste. Registra y verifica las correcciones antes de confirmar.',
      );
    }
    entidad.estado = 'CONCILIADA';
    entidad.confirmadoPor = usuarioId;
    entidad.fechaConfirmacion = new Date();
    entidad.version += 1;
    await this.conciliacionRepo.save(entidad);
    return this.presentar(entidad);
  }
}
