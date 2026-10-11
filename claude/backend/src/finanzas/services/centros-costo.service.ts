import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';

import { CentroCosto, TipoCentroCosto } from '../entities/centro-costo.entity';
import { TipoCuenta } from '../entities/cuenta-contable.entity';
import {
  centroDeLaPartida,
  laEmpresaLlevaCentros,
} from '../utils/el-centro-de-la-partida';

@Injectable()
export class CentrosCostoService {
  constructor(
    @InjectRepository(CentroCosto)
    private readonly repo: Repository<CentroCosto>,
    private readonly dataSource: DataSource,
  ) {}

  async listar(empresaId: string, incluirInactivos = false) {
    const centros = await this.repo.find({
      where: incluirInactivos ? { empresaId } : { empresaId, activo: true },
      order: { codigo: 'ASC' },
    });
    /*
     * Se devuelve plano con el nivel calculado, no anidado. La pantalla que lo
     * pinta como árbol puede anidarlo; la que lo pinta como desplegable no
     * tiene que desanidar nada. Al revés obliga a las dos a saber del árbol.
     */
    const porId = new Map(centros.map((c) => [c.id, c]));
    const nivel = (c: CentroCosto): number => {
      let n = 0;
      let actual = c;
      while (actual.padreId && porId.has(actual.padreId) && n < 20) {
        actual = porId.get(actual.padreId)!;
        n += 1;
      }
      return n;
    };
    return centros.map((c) => ({ ...c, nivel: nivel(c) }));
  }

  async obtener(id: string, empresaId: string) {
    const centro = await this.repo.findOne({ where: { id, empresaId } });
    if (!centro) throw new NotFoundException('Centro de costo no encontrado.');
    return centro;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ¿ESTA EMPRESA USA CENTROS DE COSTO?
   * --------------------------------------------------------------------------
   * No hay interruptor, y es a propósito. Es el mismo criterio que gobierna las
   * posiciones de almacén: «no hay un interruptor de *este almacén maneja
   * posiciones*: las maneja cuando tiene alguna».
   *
   * Una bandera aparte sería un segundo estado que puede contradecir al
   * primero —catálogo lleno con la bandera apagada, o bandera encendida sin
   * catálogo, que deja el sistema sin poder registrar nada— y alguien tendría
   * que mantener los dos de acuerdo. El catálogo ya dice la verdad.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async exigeCentro(empresaId: string, manager?: EntityManager): Promise<boolean> {
    return laEmpresaLlevaCentros(manager ?? this.repo.manager, empresaId);
  }

  async crear(empresaId: string, dto: any) {
    const codigo = String(dto.codigo ?? '').trim().toUpperCase();
    if (!codigo) throw new BadRequestException('El código es obligatorio.');
    const nombre = String(dto.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');

    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(CentroCosto);
      const repetido = await repo.findOne({ where: { empresaId, codigo } });
      if (repetido) {
        throw new ConflictException(
          `Ya existe un centro de costo con el código ${codigo}: «${repetido.nombre}».`,
        );
      }
      const padre = await this.padreValido(repo, empresaId, dto.padreId ?? null);

      const creado = await repo.save(
        repo.create({
          empresaId,
          codigo,
          nombre,
          tipo: (dto.tipo as TipoCentroCosto) ?? TipoCentroCosto.DEPARTAMENTO,
          padreId: padre?.id ?? null,
          aceptaMovimientos: dto.aceptaMovimientos ?? true,
          activo: true,
          oficinaExternaId: dto.oficinaExternaId?.trim() || null,
          descripcion: dto.descripcion?.trim() || null,
        }),
      );

      /*
       * El padre deja de aceptar movimientos en cuanto tiene un hijo, y se hace
       * aquí en vez de pedírselo a quien captura. Misma regla que las cuentas
       * contables: si un acumulador recibe sus propios movimientos, su saldo
       * deja de ser la suma de sus hijos y el reporte por centro ya no cuadra
       * con el total. Quien da de alta un hijo no tiene por qué acordarse.
       */
      if (padre && padre.aceptaMovimientos) {
        padre.aceptaMovimientos = false;
        await repo.save(padre);
      }
      return creado;
    });
  }

  async actualizar(id: string, empresaId: string, dto: any) {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(CentroCosto);
      const centro = await repo.findOne({ where: { id, empresaId } });
      if (!centro) throw new NotFoundException('Centro de costo no encontrado.');

      if (dto.codigo !== undefined) {
        const codigo = String(dto.codigo).trim().toUpperCase();
        if (!codigo) throw new BadRequestException('El código es obligatorio.');
        const repetido = await repo.findOne({
          where: { empresaId, codigo, id: Not(id) },
        });
        if (repetido) {
          throw new ConflictException(
            `Ya existe un centro de costo con el código ${codigo}: «${repetido.nombre}».`,
          );
        }
        centro.codigo = codigo;
      }
      if (dto.nombre !== undefined) centro.nombre = String(dto.nombre).trim();
      if (dto.tipo !== undefined) centro.tipo = dto.tipo;
      if (dto.descripcion !== undefined) {
        centro.descripcion = dto.descripcion?.trim() || null;
      }
      if (dto.oficinaExternaId !== undefined) {
        centro.oficinaExternaId = dto.oficinaExternaId?.trim() || null;
      }
      if (dto.padreId !== undefined) {
        const padre = await this.padreValido(repo, empresaId, dto.padreId, id);
        centro.padreId = padre?.id ?? null;
        if (padre && padre.aceptaMovimientos) {
          padre.aceptaMovimientos = false;
          await repo.save(padre);
        }
      }
      if (dto.aceptaMovimientos !== undefined) {
        if (dto.aceptaMovimientos === true) {
          const hijos = await repo.count({ where: { padreId: id } });
          if (hijos > 0) {
            throw new BadRequestException(
              `«${centro.nombre}» agrupa a ${hijos} centro(s): su saldo es la suma de ellos. ` +
                'Si recibiera movimientos propios, el reporte por centro dejaría de cuadrar con el total.',
            );
          }
        }
        centro.aceptaMovimientos = dto.aceptaMovimientos;
      }
      if (dto.activo !== undefined) {
        if (dto.activo === false) await this.exigirSinHijosActivos(repo, id);
        centro.activo = dto.activo;
      }
      return repo.save(centro);
    });
  }

  /**
   * No se borra: se desactiva.
   *
   * Un centro borrado deja partidas de pólizas apuntando a nada, y el reporte
   * por centro perdería dinero sin decir dónde. La llave foránea lo impide a
   * nivel base; esto lo explica antes de que el error de base llegue a la
   * pantalla. Si nunca se usó, sí se puede borrar de verdad.
   */
  async eliminar(id: string, empresaId: string) {
    const centro = await this.obtener(id, empresaId);
    /*
     * `partidas_poliza` NO tiene columna de empresa: cuelga de la póliza. Es la
     * misma trampa que los invariantes de la cartera —`amortizacion_cuotas`
     * tampoco la tiene—, y contar sin entrar por la póliza contaría las
     * partidas de todas las empresas de la instalación. Aquí daría un número
     * inflado en una negativa; en una consulta de lectura sería una fuga.
     */
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
         FROM partidas_poliza p
         JOIN polizas pol ON pol.id = p.polizaid
        WHERE pol.empresaid = $1 AND p.centrocostoid = $2`,
      [empresaId, id],
    );
    if (Number(total) > 0) {
      throw new ConflictException(
        `«${centro.nombre}» tiene ${total} partida(s) de póliza registradas y no se puede borrar: ` +
          'los reportes por centro dejarían de cuadrar. Desactívalo en su lugar — deja de ofrecerse ' +
          'para capturar y su historia se conserva.',
      );
    }
    const hijos = await this.repo.count({ where: { padreId: id } });
    if (hijos > 0) {
      throw new ConflictException(
        `«${centro.nombre}» agrupa a ${hijos} centro(s). Muévelos o bórralos primero.`,
      );
    }
    await this.repo.remove(centro);
    return { mensaje: `Centro de costo «${centro.nombre}» eliminado.` };
  }

  /** Delega en `utils/el-centro-de-la-partida`, que es donde vive la regla. */
  async validarParaPartida(
    em: EntityManager,
    empresaId: string,
    datos: { centroCostoId?: string | null; tipoCuenta: TipoCuenta; cuenta?: string },
  ): Promise<string | null> {
    return centroDeLaPartida(em, empresaId, datos);
  }

  private async padreValido(
    repo: Repository<CentroCosto>,
    empresaId: string,
    padreId: string | null,
    hijoId?: string,
  ): Promise<CentroCosto | null> {
    if (!padreId) return null;
    if (hijoId && padreId === hijoId) {
      throw new BadRequestException('Un centro de costo no puede ser su propio padre.');
    }
    const padre = await repo.findOne({ where: { id: padreId, empresaId } });
    if (!padre) {
      throw new BadRequestException('El centro de costo padre no existe o es de otra empresa.');
    }
    /*
     * Un ciclo deja el cálculo de nivel y cualquier recorrido del árbol en un
     * bucle infinito. Se sube por la cadena del padre propuesto buscando al
     * hijo: si aparece, el enlace cerraría el círculo.
     */
    if (hijoId) {
      let actual: CentroCosto | null = padre;
      let saltos = 0;
      while (actual?.padreId && saltos < 50) {
        if (actual.padreId === hijoId) {
          throw new BadRequestException(
            `«${padre.nombre}» ya cuelga de este centro: ponerlo como padre cerraría un círculo.`,
          );
        }
        actual = await repo.findOne({ where: { id: actual.padreId, empresaId } });
        saltos += 1;
      }
    }
    return padre;
  }

  private async exigirSinHijosActivos(repo: Repository<CentroCosto>, id: string) {
    const hijos = await repo.count({ where: { padreId: id, activo: true } });
    if (hijos > 0) {
      throw new BadRequestException(
        `No se puede desactivar: ${hijos} centro(s) activo(s) cuelgan de éste y quedarían ` +
          'colgando de un padre inactivo. Desactiva primero los hijos.',
      );
    }
  }
}
