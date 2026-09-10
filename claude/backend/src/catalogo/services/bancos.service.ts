import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Banco } from '../entities/banco.entity';
import { CrearBancoDto } from '../dto/crear-banco.dto';
import { ActualizarBancoDto } from '../dto/actualizar-banco.dto';
import {
  BANCOS_ANEXO_24_2026,
  SAT_ANEXO_24_2026,
} from '../../finanzas/data/catalogos-sat-2026';

@Injectable()
export class BancosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BancosService.name);

  constructor(@InjectRepository(Banco) private repo: Repository<Banco>) {}

  async onApplicationBootstrap() {
    await this.precargarOficiales();
  }

  /**
   * Upsert idempotente. Restaura registros faltantes o desactivados después
   * de un reinicio/reset sin tocar los bancos personalizados del usuario.
   */
  async precargarOficiales() {
    const existentes = await this.repo.find();
    const porClave = new Map(
      existentes.filter((b) => b.clave).map((b) => [b.clave!, b]),
    );
    const guardar: Banco[] = [];
    let creados = 0;
    let actualizados = 0;

    for (const oficial of BANCOS_ANEXO_24_2026) {
      const actual = porClave.get(oficial.clave);
      if (actual) {
        const cambio =
          actual.nombre !== oficial.nombre ||
          !actual.activo ||
          !actual.esOficial ||
          actual.versionCatalogo !== SAT_ANEXO_24_2026.clave;
        if (cambio) {
          actual.nombre = oficial.nombre;
          actual.activo = true;
          actual.esOficial = true;
          actual.versionCatalogo = SAT_ANEXO_24_2026.clave;
          guardar.push(actual);
          actualizados += 1;
        }
      } else {
        guardar.push(
          this.repo.create({
            clave: oficial.clave,
            nombre: oficial.nombre,
            activo: true,
            esOficial: true,
            versionCatalogo: SAT_ANEXO_24_2026.clave,
          }),
        );
        creados += 1;
      }
    }
    if (guardar.length) await this.repo.save(guardar, { chunk: 100 });
    if (creados || actualizados) {
      this.logger.log(
        `Catálogo bancario SAT asegurado: ${creados} creados, ${actualizados} actualizados.`,
      );
    }
    return {
      ok: true,
      totalOficial: BANCOS_ANEXO_24_2026.length,
      creados,
      actualizados,
    };
  }

  findAll(activos = true) {
    const where: any = {};
    if (activos) where.activo = true;
    return this.repo.find({ where, order: { nombre: 'ASC' } });
  }

  async create(dto: CrearBancoDto) {
    const duplicado = await this.repo.findOne({
      where: { clave: dto.clave },
    });
    if (duplicado) {
      throw new ConflictException(
        `Ya existe un banco con la clave ${dto.clave}.`,
      );
    }
    const banco = this.repo.create({
      nombre: dto.nombre.trim(),
      clave: dto.clave,
      esOficial: false,
      versionCatalogo: null,
    });
    return this.repo.save(banco);
  }

  async update(id: string, dto: ActualizarBancoDto) {
    const banco = await this.repo.findOne({ where: { id } });
    if (!banco) throw new NotFoundException('Banco no encontrado');
    if (banco.esOficial) {
      throw new ConflictException(
        'Los bancos del catálogo oficial no se editan manualmente.',
      );
    }
    if (dto.clave && dto.clave !== banco.clave) {
      const duplicado = await this.repo.findOne({
        where: { clave: dto.clave },
      });
      if (duplicado) {
        throw new ConflictException(
          `Ya existe un banco con la clave ${dto.clave}.`,
        );
      }
    }
    if (dto.nombre !== undefined) banco.nombre = dto.nombre.trim();
    if (dto.clave !== undefined) banco.clave = dto.clave;
    return this.repo.save(banco);
  }

  async toggle(id: string) {
    const banco = await this.repo.findOne({ where: { id } });
    if (!banco) throw new NotFoundException('Banco no encontrado');
    if (banco.esOficial) {
      throw new ConflictException(
        'Los bancos oficiales permanecen activos mientras su catálogo esté vigente.',
      );
    }
    banco.activo = !banco.activo;
    return this.repo.save(banco);
  }
}
