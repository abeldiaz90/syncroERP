import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { CentroCosto } from '../entities/centro-costo.entity';
import { CuentaContable, TipoCuenta } from '../entities/cuenta-contable.entity';
import {
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoLinea,
} from '../entities/presupuesto.entity';
import { CUENTAS_QUE_EXIGEN_CENTRO } from '../utils/el-centro-de-la-partida';

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

@Injectable()
export class PresupuestosService {
  constructor(
    @InjectRepository(Presupuesto)
    private readonly repo: Repository<Presupuesto>,
    @InjectRepository(PresupuestoLinea)
    private readonly lineasRepo: Repository<PresupuestoLinea>,
    private readonly dataSource: DataSource,
  ) {}

  listar(empresaId: string, ejercicio?: number) {
    return this.repo.find({
      where: ejercicio ? { empresaId, ejercicio } : { empresaId },
      order: { ejercicio: 'DESC', nombre: 'ASC' },
    });
  }

  async obtener(id: string, empresaId: string) {
    const presupuesto = await this.repo.findOne({ where: { id, empresaId } });
    if (!presupuesto) throw new NotFoundException('Presupuesto no encontrado.');
    const lineas = await this.lineasRepo.find({
      where: { presupuestoId: id },
      order: { mes: 'ASC' },
    });
    return { ...presupuesto, lineas };
  }

  async crear(empresaId: string, dto: any) {
    const ejercicio = Number(dto.ejercicio);
    if (!Number.isInteger(ejercicio) || ejercicio < 2000 || ejercicio > 2999) {
      throw new BadRequestException('El ejercicio tiene que ser un año válido.');
    }
    const nombre = String(dto.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('Ponle nombre al presupuesto.');

    const repetido = await this.repo.findOne({
      where: { empresaId, ejercicio, nombre },
    });
    if (repetido) {
      throw new ConflictException(
        `Ya hay un presupuesto ${ejercicio} llamado «${nombre}». ` +
          'Dos con el mismo nombre en el mismo año dejarían a quien lo lee sin saber contra cuál se mide.',
      );
    }
    return this.repo.save(
      this.repo.create({
        empresaId,
        ejercicio,
        nombre,
        estado: EstadoPresupuesto.BORRADOR,
        notas: dto.notas?.trim() || null,
      }),
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CAPTURAR LÍNEAS, Y POR QUÉ SÓLO EN BORRADOR
   * --------------------------------------------------------------------------
   * El estado es el control. Un presupuesto que se puede editar después de
   * aprobado no mide a nadie: siempre se puede ajustar al real, y entonces no
   * hay desviación nunca. Es el mismo razonamiento del cierre contable —lo que
   * ya se firmó no se reescribe— y por eso la salida cuando hace falta cambiar
   * es la misma que allá: se crea otro, no se reabre éste.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async capturar(id: string, empresaId: string, lineas: any[]) {
    const presupuesto = await this.repo.findOne({ where: { id, empresaId } });
    if (!presupuesto) throw new NotFoundException('Presupuesto no encontrado.');
    if (presupuesto.estado !== EstadoPresupuesto.BORRADOR) {
      throw new ConflictException(
        `Este presupuesto está ${presupuesto.estado} y ya no se edita: contra él se está midiendo. ` +
          'Si las cifras cambiaron, crea una revisión —«Revisión de junio»— y compara contra ésa. ' +
          'Un presupuesto que se ajusta al real no tiene desviaciones nunca.',
      );
    }
    if (!Array.isArray(lineas) || !lineas.length) {
      throw new BadRequestException('No hay líneas que guardar.');
    }

    const cuentasIds = [...new Set(lineas.map((l) => l.cuentaContableId))];
    const cuentas = await this.dataSource.getRepository(CuentaContable).find({
      where: { id: In(cuentasIds), empresaId },
    });
    const porId = new Map(cuentas.map((c) => [c.id, c]));

    const centrosIds = [
      ...new Set(lineas.map((l) => l.centroCostoId).filter(Boolean)),
    ] as string[];
    const centros = centrosIds.length
      ? await this.dataSource
          .getRepository(CentroCosto)
          .find({ where: { id: In(centrosIds), empresaId } })
      : [];
    const centroPorId = new Map(centros.map((c) => [c.id, c]));

    for (const linea of lineas) {
      const cuenta = porId.get(linea.cuentaContableId);
      if (!cuenta) {
        throw new BadRequestException(
          'Una de las líneas apunta a una cuenta que no existe o es de otra empresa.',
        );
      }
      /*
       * Sólo cuentas de RESULTADO, misma convención que el centro de costo. Un
       * presupuesto de balance es otra cosa —un plan de inversión o de
       * tesorería— y mezclarlo aquí haría que el comparativo sumara peras con
       * manzanas: el saldo de un banco no se «ejerce».
       */
      if (!CUENTAS_QUE_EXIGEN_CENTRO.includes(cuenta.tipo as TipoCuenta)) {
        throw new BadRequestException(
          `La cuenta ${cuenta.numeroCuenta} ${cuenta.nombre} es de ${cuenta.tipo} y no se presupuesta aquí: ` +
            'este presupuesto es de resultado —ingresos, costos y gastos—. El saldo de una cuenta de ' +
            'balance no se ejerce, así que compararlo contra un presupuesto no diría nada.',
        );
      }
      /*
       * Y no se presupuesta una cuenta acumuladora, por lo mismo que no recibe
       * pólizas: su saldo es la suma de sus hijas, y presupuestar las dos
       * cosas contaría el mismo dinero dos veces en el comparativo.
       */
      if (cuenta.esAfectable === false) {
        throw new BadRequestException(
          `${cuenta.numeroCuenta} ${cuenta.nombre} es una cuenta de mayor: su saldo es la suma de sus ` +
            'hijas. Presupuéstalas a ellas, o el comparativo contaría el mismo importe dos veces.',
        );
      }
      const mes = Number(linea.mes);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        throw new BadRequestException('El mes de cada línea va de 1 a 12.');
      }
      if (!(Number(linea.importe) >= 0)) {
        throw new BadRequestException(
          'El importe presupuestado se captura en positivo, en el sentido natural de la cuenta: ' +
            'lo que se espera ingresar en una de ingreso, lo que se espera gastar en una de gasto.',
        );
      }
      if (linea.centroCostoId) {
        const centro = centroPorId.get(linea.centroCostoId);
        if (!centro) {
          throw new BadRequestException(
            'Una de las líneas apunta a un centro de costo que no existe o es de otra empresa.',
          );
        }
        if (!centro.aceptaMovimientos) {
          throw new BadRequestException(
            `«${centro.nombre}» agrupa a otros centros: su presupuesto es la suma de ellos. ` +
              'Captúralo en los que cuelgan de él.',
          );
        }
      }
    }

    /*
     * Se reemplaza el presupuesto COMPLETO, no se mezcla. Guardar sólo lo que
     * viene dejaría líneas viejas de una captura anterior conviviendo con las
     * nuevas, y nadie podría decir cuáles son del plan vigente. Todo dentro de
     * una transacción: un presupuesto a medio reemplazar es peor que el viejo.
     */
    return this.dataSource.transaction(async (em) => {
      await em.delete(PresupuestoLinea, { presupuestoId: id });
      const guardadas = await em.save(
        PresupuestoLinea,
        lineas.map((l) =>
          em.create(PresupuestoLinea, {
            presupuestoId: id,
            cuentaContableId: l.cuentaContableId,
            centroCostoId: l.centroCostoId || null,
            mes: Number(l.mes),
            importe: redondear(Number(l.importe)),
          }),
        ),
      );
      return { lineas: guardadas.length };
    });
  }

  async aprobar(id: string, empresaId: string, usuarioId?: string) {
    const presupuesto = await this.repo.findOne({ where: { id, empresaId } });
    if (!presupuesto) throw new NotFoundException('Presupuesto no encontrado.');
    if (presupuesto.estado !== EstadoPresupuesto.BORRADOR) {
      throw new ConflictException(`El presupuesto ya está ${presupuesto.estado}.`);
    }
    const lineas = await this.lineasRepo.count({ where: { presupuestoId: id } });
    if (!lineas) {
      /*
       * Un presupuesto aprobado y vacío es la peor versión de esto: el
       * comparativo diría que TODO el gasto es desviación, y el reporte más
       * alarmante del sistema sería ruido. Es el mismo defecto que «un cero
       * que se lee como buena noticia», con el signo cambiado.
       */
      throw new BadRequestException(
        'No se puede aprobar un presupuesto sin líneas: el comparativo diría que todo el gasto ' +
          'del ejercicio es desviación.',
      );
    }
    presupuesto.estado = EstadoPresupuesto.APROBADO;
    presupuesto.aprobadoPorId = usuarioId ?? null;
    presupuesto.fechaAprobacion = new Date();
    return this.repo.save(presupuesto);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * PRESUPUESTO CONTRA REAL
   * --------------------------------------------------------------------------
   * El real sale del mayor con el MISMO criterio que el estado de resultados:
   * el ingreso es acreedor y el costo y el gasto son deudores, así que cada uno
   * se mide en su sentido. Restar siempre cargos menos abonos daría el ingreso
   * en negativo — el defecto que ya costó una corrección en la balanza.
   *
   * `favorable` lo decide el TIPO de cuenta y no el signo de la diferencia:
   * ingresar más de lo previsto es bueno y gastar más es malo, y son la misma
   * resta. Dejar que la pantalla lo deduzca es pedirle que repita esta regla.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async comparativo(
    id: string,
    empresaId: string,
    opciones: { mesDesde?: number; mesHasta?: number; centroCostoId?: string } = {},
  ) {
    const presupuesto = await this.repo.findOne({ where: { id, empresaId } });
    if (!presupuesto) throw new NotFoundException('Presupuesto no encontrado.');

    const desde = Math.min(Math.max(Number(opciones.mesDesde) || 1, 1), 12);
    const hasta = Math.min(Math.max(Number(opciones.mesHasta) || 12, desde), 12);
    const filtroCentro = opciones.centroCostoId;

    /*
     * `presupuesto_lineas` no tiene columna de empresa: cuelga del
     * presupuesto. Es la tercera tabla de este sistema con esa forma
     * —`partidas_poliza` y `amortizacion_cuotas` son las otras dos— y en las
     * tres el error es el mismo: filtrar sólo por el padre y confiar en que el
     * id ya está validado. Se entra por `presupuestos` con la empresa, que
     * además es lo que el detector de aislamiento exige y hace bien.
     */
    const params: any[] = [id, empresaId, desde, hasta];
    let condicionCentro = '';
    if (filtroCentro === 'SIN_CLASIFICAR') {
      condicionCentro = ' AND l.centrocostoid IS NULL';
    } else if (filtroCentro) {
      params.push(filtroCentro);
      condicionCentro = ` AND l.centrocostoid = $${params.length}`;
    }
    const presupuestado = await this.dataSource.query(
      `SELECT l.cuentacontableid AS "cuentaContableId",
              l.centrocostoid    AS "centroCostoId",
              COALESCE(SUM(l.importe), 0)::float AS "presupuesto"
         FROM presupuesto_lineas l
         JOIN presupuestos pre ON pre.id = l.presupuestoid AND pre.empresaid = $2
        WHERE l.presupuestoid = $1 AND l.mes BETWEEN $3 AND $4${condicionCentro}
        GROUP BY l.cuentacontableid, l.centrocostoid`,
      params,
    );

    const paramsReal: any[] = [empresaId, presupuesto.ejercicio, desde, hasta];
    let condicionCentroReal = '';
    if (filtroCentro === 'SIN_CLASIFICAR') {
      condicionCentroReal = ' AND p.centrocostoid IS NULL';
    } else if (filtroCentro) {
      paramsReal.push(filtroCentro);
      condicionCentroReal = ` AND p.centrocostoid = $${paramsReal.length}`;
    }
    const real = await this.dataSource.query(
      `SELECT p.cuentacontableid AS "cuentaContableId",
              p.centrocostoid    AS "centroCostoId",
              COALESCE(SUM(p.cargo), 0)::float AS "cargos",
              COALESCE(SUM(p.abono), 0)::float AS "abonos"
         FROM partidas_poliza p
         JOIN polizas pol ON pol.id = p.polizaid AND pol.empresaid = $1
        WHERE pol.estatus <> 'CANCELADA'
          AND pol.anio = $2
          AND pol.mes BETWEEN $3 AND $4${condicionCentroReal}
        GROUP BY p.cuentacontableid, p.centrocostoid`,
      paramsReal,
    );

    const cuentasIds = [
      ...new Set([
        ...presupuestado.map((f: any) => f.cuentaContableId),
        ...real.map((f: any) => f.cuentaContableId),
      ]),
    ];
    const cuentas = cuentasIds.length
      ? await this.dataSource
          .getRepository(CuentaContable)
          .find({ where: { id: In(cuentasIds), empresaId } })
      : [];
    const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

    const centrosIds = [
      ...new Set(
        [...presupuestado, ...real].map((f: any) => f.centroCostoId).filter(Boolean),
      ),
    ] as string[];
    const centros = centrosIds.length
      ? await this.dataSource
          .getRepository(CentroCosto)
          .find({ where: { id: In(centrosIds), empresaId } })
      : [];
    const centroPorId = new Map(centros.map((c) => [c.id, c]));

    const llave = (c: string, cc: string | null) => `${c}|${cc ?? ''}`;
    const filas = new Map<string, any>();

    const asegurar = (cuentaId: string, centroId: string | null) => {
      const k = llave(cuentaId, centroId);
      if (!filas.has(k)) {
        const cuenta = cuentaPorId.get(cuentaId);
        const centro = centroId ? centroPorId.get(centroId) : null;
        filas.set(k, {
          cuentaContableId: cuentaId,
          numeroCuenta: cuenta?.numeroCuenta ?? null,
          cuenta: cuenta?.nombre ?? null,
          tipo: cuenta?.tipo ?? null,
          centroCostoId: centroId,
          centro: centro?.nombre ?? (centroId ? null : 'Sin clasificar'),
          presupuesto: 0,
          real: 0,
        });
      }
      return filas.get(k);
    };

    for (const f of presupuestado) {
      asegurar(f.cuentaContableId, f.centroCostoId).presupuesto += Number(f.presupuesto);
    }
    for (const f of real) {
      const cuenta = cuentaPorId.get(f.cuentaContableId);
      /*
       * El real sólo cuenta para las cuentas de resultado. Si una partida de
       * balance se colara, sumaría al comparativo un importe que no tiene
       * presupuesto contra el que medirse y aparecería como desviación total.
       */
      if (!cuenta || !CUENTAS_QUE_EXIGEN_CENTRO.includes(cuenta.tipo as TipoCuenta)) {
        continue;
      }
      const fila = asegurar(f.cuentaContableId, f.centroCostoId);
      fila.real +=
        cuenta.tipo === TipoCuenta.INGRESO
          ? Number(f.abonos) - Number(f.cargos)
          : Number(f.cargos) - Number(f.abonos);
    }

    const renglones = [...filas.values()].map((f) => {
      const presupuestoF = redondear(f.presupuesto);
      const realF = redondear(f.real);
      const diferencia = redondear(realF - presupuestoF);
      return {
        ...f,
        presupuesto: presupuestoF,
        real: realF,
        diferencia,
        /* Ingresar de más es bueno; gastar de más, no. Misma resta, lectura contraria. */
        favorable: f.tipo === TipoCuenta.INGRESO ? diferencia >= 0 : diferencia <= 0,
        /* Sin presupuesto no hay porcentaje: dividir entre cero da Infinity y
         * la pantalla lo pinta como «∞ %», que no informa de nada. */
        porcentajeEjercido:
          presupuestoF > 0 ? redondear((realF / presupuestoF) * 100) : null,
      };
    });

    const suma = (campo: 'presupuesto' | 'real', tipo: TipoCuenta) =>
      redondear(
        renglones.filter((r) => r.tipo === tipo).reduce((a, r) => a + r[campo], 0),
      );

    return {
      presupuesto: {
        id: presupuesto.id,
        nombre: presupuesto.nombre,
        ejercicio: presupuesto.ejercicio,
        estado: presupuesto.estado,
      },
      periodo: { mesDesde: desde, mesHasta: hasta },
      renglones: renglones.sort((a, b) =>
        String(a.numeroCuenta).localeCompare(String(b.numeroCuenta)),
      ),
      totales: {
        ingresos: {
          presupuesto: suma('presupuesto', TipoCuenta.INGRESO),
          real: suma('real', TipoCuenta.INGRESO),
        },
        costos: {
          presupuesto: suma('presupuesto', TipoCuenta.COSTO),
          real: suma('real', TipoCuenta.COSTO),
        },
        gastos: {
          presupuesto: suma('presupuesto', TipoCuenta.GASTO),
          real: suma('real', TipoCuenta.GASTO),
        },
      },
      /*
       * Lo que se gastó en cuentas que nadie presupuestó. Se dice aparte porque
       * es un aviso distinto: no es una desviación, es un plan incompleto.
       */
      sinPresupuesto: renglones.filter((r) => r.presupuesto === 0 && r.real !== 0).length,
    };
  }

  async eliminar(id: string, empresaId: string) {
    const presupuesto = await this.repo.findOne({ where: { id, empresaId } });
    if (!presupuesto) throw new NotFoundException('Presupuesto no encontrado.');
    if (presupuesto.estado !== EstadoPresupuesto.BORRADOR) {
      throw new ConflictException(
        `Un presupuesto ${presupuesto.estado} no se borra: alguien se comprometió con esas cifras y ` +
          'los comparativos de los meses pasados dejarían de poder rehacerse.',
      );
    }
    await this.repo.remove(presupuesto);
    return { mensaje: `Presupuesto «${presupuesto.nombre}» eliminado.` };
  }
}
