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
  {
    nombre: 'IVA 16%',
    porcentaje: 16.0,
    claveImpuestoSAT: '002',
    tipoFactor: 'TASA' as const,
    objetoImpuesto: '02' as const,
  },
  {
    nombre: 'IVA 0%',
    porcentaje: 0.0,
    claveImpuestoSAT: '002',
    tipoFactor: 'TASA' as const,
    objetoImpuesto: '02' as const,
  },
  {
    nombre: 'Exento',
    porcentaje: 0.0,
    claveImpuestoSAT: '002',
    tipoFactor: 'EXENTO' as const,
    objetoImpuesto: '02' as const,
  },
  {
    nombre: 'No objeto de impuesto',
    porcentaje: 0.0,
    claveImpuestoSAT: '002',
    tipoFactor: 'NO_OBJETO' as const,
    objetoImpuesto: '01' as const,
  },
];

const IVA_FRONTERA = {
  nombre: 'IVA 8%',
  porcentaje: 8.0,
  claveImpuestoSAT: '002',
  tipoFactor: 'TASA' as const,
  objetoImpuesto: '02' as const,
};

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
    if (existe)
      throw new ConflictException('Ya existe un impuesto con ese nombre.');

    const impuesto = this.impuestoRepo.create({
      nombre,
      porcentaje,
      empresaId,
    });
    return this.impuestoRepo.save(impuesto);
  }

  async update(
    id: string,
    nombre: string,
    porcentaje: number,
    empresaId: string,
  ) {
    const impuesto = await this.impuestoRepo.findOne({
      where: { id, empresaId },
    });
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
    const impuesto = await this.impuestoRepo.findOne({
      where: { id, empresaId },
    });
    if (!impuesto) throw new NotFoundException('Impuesto no encontrado.');

    impuesto.activo = !impuesto.activo;
    return this.impuestoRepo.save(impuesto);
  }

  /**
   * Precarga los impuestos estándar de México. IDEMPOTENTE: no duplica los
   * que ya existan (por nombre). Se usa desde el wizard de configuración
   * inicial o el botón "Cargar impuestos comunes".
   */
  async precargarEstandar(empresaId: string, incluirIva8 = false) {
    const catalogo = incluirIva8
      ? [...IMPUESTOS_ESTANDAR_MX, IVA_FRONTERA]
      : IMPUESTOS_ESTANDAR_MX;
    const existentes = await this.impuestoRepo.find({ where: { empresaId } });
    const porNombre = new Map(
      existentes.map((i) => [i.nombre.toLowerCase(), i]),
    );

    // También corrige catálogos creados por versiones anteriores del ERP, que
    // sólo guardaban porcentaje y por ello confundían tasa 0 con exento.
    const aActualizar = catalogo
      .filter((def) => porNombre.has(def.nombre.toLowerCase()))
      .map((def) => {
        const actual = porNombre.get(def.nombre.toLowerCase())!;
        Object.assign(actual, def);
        return actual;
      });
    const aCrear = catalogo
      .filter((i) => !porNombre.has(i.nombre.toLowerCase()))
      .map((i) => this.impuestoRepo.create({ ...i, empresaId, activo: true }));

    if (aActualizar.length > 0) await this.impuestoRepo.save(aActualizar);
    if (aCrear.length > 0) await this.impuestoRepo.save(aCrear);

    return {
      ok: true,
      creados: aCrear.length,
      actualizados: aActualizar.length,
      yaExistian: catalogo.length - aCrear.length,
    };
  }
}
