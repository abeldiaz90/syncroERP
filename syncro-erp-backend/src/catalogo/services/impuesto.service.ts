import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Impuesto } from '../entities/impuesto.entity';

/**
 * Impuestos estándar de México.
 * IMPORTANTE: estos nombres deben coincidir EXACTO con los que usa la columna
 * "impuesto" de la plantilla de importación de inventario, para que la carga
 * masiva no falle por "impuesto no existe".
 */
export const IMPUESTOS_ESTANDAR_MX = [
  { nombre: 'IVA 16%', porcentaje: 16.0 },
  { nombre: 'IVA 0%', porcentaje: 0.0 },
  { nombre: 'Exento', porcentaje: 0.0 },
  // Descomenta si manejas IEPS:
  // { nombre: 'IEPS 8%', porcentaje: 8.0 },
];

@Injectable()
export class ImpuestoService {
  constructor(
    @InjectRepository(Impuesto)
    private readonly impuestoRepo: Repository<Impuesto>,
  ) {}

  findAll(empresaId: string) {
    return this.impuestoRepo.find({
      where: { empresaId, activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async create(nombre: string, porcentaje: number, empresaId: string) {
    const existe = await this.impuestoRepo.findOne({
      where: { nombre, empresaId },
    });
    if (existe) throw new ConflictException('Ya existe un impuesto con ese nombre.');

    const impuesto = this.impuestoRepo.create({ nombre, porcentaje, empresaId });
    return this.impuestoRepo.save(impuesto);
  }

  async update(id: string, nombre: string, porcentaje: number, empresaId: string) {
    const impuesto = await this.impuestoRepo.findOne({ where: { id, empresaId } });
    if (!impuesto) throw new NotFoundException('Impuesto no encontrado.');

    const duplicado = await this.impuestoRepo.findOne({
      where: { nombre, empresaId },
    });
    if (duplicado && duplicado.id !== id)
      throw new ConflictException('Ya existe otro impuesto con ese nombre.');

    impuesto.nombre = nombre;
    impuesto.porcentaje = porcentaje;
    return this.impuestoRepo.save(impuesto);
  }

  async toggleStatus(id: string, empresaId: string) {
    const impuesto = await this.impuestoRepo.findOne({ where: { id, empresaId } });
    if (!impuesto) throw new NotFoundException('Impuesto no encontrado.');

    impuesto.activo = !impuesto.activo;
    return this.impuestoRepo.save(impuesto);
  }

  /**
   * Precarga los impuestos estándar de México. IDEMPOTENTE: no duplica los
   * que ya existan (por nombre). Se usa desde el wizard de configuración
   * inicial o el botón "Cargar impuestos comunes".
   */
  async precargarEstandar(empresaId: string) {
    const existentes = await this.impuestoRepo.find({ where: { empresaId } });
    const nombresExistentes = new Set(
      existentes.map((i) => i.nombre.toLowerCase()),
    );

    const aCrear = IMPUESTOS_ESTANDAR_MX.filter(
      (i) => !nombresExistentes.has(i.nombre.toLowerCase()),
    ).map((i) => this.impuestoRepo.create({ ...i, empresaId, activo: true }));

    if (aCrear.length > 0) {
      await this.impuestoRepo.save(aCrear);
    }

    return {
      ok: true,
      creados: aCrear.length,
      yaExistian: IMPUESTOS_ESTANDAR_MX.length - aCrear.length,
    };
  }
}
