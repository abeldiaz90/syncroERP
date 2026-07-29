import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AtributoGrupo } from '../entities/atributo-grupo.entity';
import { AtributoDefinicion } from '../entities/atributo-definicion.entity';

type TipoValor = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';

/**
 * Atributos personalizados — el usuario construye sus propios grupos y campos.
 * El formulario de la ficha del producto se dibuja a partir de esto.
 */
@Injectable()
export class AtributosPersonalizadosService {
  constructor(
    @InjectRepository(AtributoGrupo)
    private readonly grupoRepo: Repository<AtributoGrupo>,
    @InjectRepository(AtributoDefinicion)
    private readonly defRepo: Repository<AtributoDefinicion>,
  ) {}

  // ═══════════════ GRUPOS ═══════════════

  async listarGrupos(empresaId: string, incluirDefiniciones = false) {
    return this.grupoRepo.find({
      where: { empresaId, activo: true },
      relations: incluirDefiniciones ? ['definiciones'] : [],
      order: { orden: 'ASC', nombre: 'ASC' },
    }).then((grupos) => {
      if (incluirDefiniciones) {
        grupos.forEach((g) => {
          g.definiciones = (g.definiciones ?? [])
            .filter((d) => d.activo)
            .sort((a, b) => a.orden - b.orden);
        });
      }
      return grupos;
    });
  }

  async crearGrupo(empresaId: string, dto: { nombre: string; descripcion?: string; orden?: number }) {
    const nombre = (dto.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El nombre del grupo es obligatorio');
    const existe = await this.grupoRepo.findOne({ where: { empresaId, nombre } });
    if (existe) throw new BadRequestException(`Ya existe un grupo llamado '${nombre}'`);
    return this.grupoRepo.save(this.grupoRepo.create({
      empresaId, nombre,
      descripcion: dto.descripcion?.trim() || null,
      orden: dto.orden ?? 0,
    }));
  }

  async actualizarGrupo(empresaId: string, id: string, dto: { nombre?: string; descripcion?: string; orden?: number }) {
    const grupo = await this.grupoRepo.findOne({ where: { id, empresaId } });
    if (!grupo) throw new NotFoundException('Grupo no encontrado');
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre no puede quedar vacío');
      const duplicado = await this.grupoRepo.findOne({ where: { empresaId, nombre } });
      if (duplicado && duplicado.id !== id) {
        throw new BadRequestException(`Ya existe un grupo llamado '${nombre}'`);
      }
      grupo.nombre = nombre;
    }
    if (dto.descripcion !== undefined) grupo.descripcion = dto.descripcion?.trim() || null;
    if (dto.orden !== undefined) grupo.orden = dto.orden;
    return this.grupoRepo.save(grupo);
  }

  /** Baja lógica: el grupo desaparece del constructor y del modal,
   *  pero los valores ya capturados en productos NO se tocan. */
  async eliminarGrupo(empresaId: string, id: string) {
    const grupo = await this.grupoRepo.findOne({ where: { id, empresaId } });
    if (!grupo) throw new NotFoundException('Grupo no encontrado');
    grupo.activo = false;
    await this.grupoRepo.save(grupo);
    return { eliminado: true };
  }

  // ═══════════════ DEFINICIONES (campos) ═══════════════

  async crearDefinicion(empresaId: string, grupoId: string, dto: {
    etiqueta: string; tipoValor?: TipoValor; unidad?: string;
    opciones?: string; requerido?: boolean; orden?: number;
  }) {
    const grupo = await this.grupoRepo.findOne({ where: { id: grupoId, empresaId } });
    if (!grupo) throw new NotFoundException('Grupo no encontrado');

    const etiqueta = (dto.etiqueta ?? '').trim();
    if (!etiqueta) throw new BadRequestException('La etiqueta del campo es obligatoria');

    const clave = this.generarClave(etiqueta);
    const existe = await this.defRepo.findOne({ where: { grupoId, clave } });
    if (existe) throw new BadRequestException(`Ya existe un campo '${etiqueta}' en este grupo`);

    const tipoValor = dto.tipoValor ?? 'TEXT';
    if (tipoValor === 'SELECT' && !(dto.opciones ?? '').trim()) {
      throw new BadRequestException("Un campo de tipo lista necesita opciones (sepáralas con '|')");
    }

    return this.defRepo.save(this.defRepo.create({
      empresaId, grupoId, clave, etiqueta, tipoValor,
      unidad: dto.unidad?.trim() || null,
      opciones: tipoValor === 'SELECT' ? this.normalizarOpciones(dto.opciones!) : null,
      requerido: dto.requerido ?? false,
      orden: dto.orden ?? 0,
    }));
  }

  async actualizarDefinicion(empresaId: string, id: string, dto: {
    etiqueta?: string; tipoValor?: TipoValor; unidad?: string;
    opciones?: string; requerido?: boolean; orden?: number;
  }) {
    const def = await this.defRepo.findOne({ where: { id, empresaId } });
    if (!def) throw new NotFoundException('Campo no encontrado');

    if (dto.etiqueta !== undefined) {
      const etiqueta = dto.etiqueta.trim();
      if (!etiqueta) throw new BadRequestException('La etiqueta no puede quedar vacía');
      def.etiqueta = etiqueta;
      // La clave NO se regenera al renombrar: así los valores ya guardados
      // en productos (que referencian la clave) siguen ligados.
    }
    if (dto.tipoValor !== undefined) def.tipoValor = dto.tipoValor;
    if (dto.unidad !== undefined) def.unidad = dto.unidad?.trim() || null;
    if (dto.opciones !== undefined) {
      def.opciones = def.tipoValor === 'SELECT' ? this.normalizarOpciones(dto.opciones) : null;
    }
    if (dto.requerido !== undefined) def.requerido = dto.requerido;
    if (dto.orden !== undefined) def.orden = dto.orden;

    if (def.tipoValor === 'SELECT' && !(def.opciones ?? '').trim()) {
      throw new BadRequestException("Un campo de tipo lista necesita opciones (sepáralas con '|')");
    }
    return this.defRepo.save(def);
  }

  async eliminarDefinicion(empresaId: string, id: string) {
    const def = await this.defRepo.findOne({ where: { id, empresaId } });
    if (!def) throw new NotFoundException('Campo no encontrado');
    def.activo = false;
    await this.defRepo.save(def);
    return { eliminado: true };
  }

  // ═══════════════ PLANTILLAS DE EJEMPLO (precarga idempotente) ═══════════════

  /**
   * Convierte los antiguos presets hardcodeados en grupos EDITABLES.
   * Idempotente: si el grupo ya existe (por nombre), no lo duplica.
   */
  async precargarEjemplos(empresaId: string) {
    const plantillas: Array<{
      nombre: string; descripcion: string;
      campos: Array<{ etiqueta: string; tipoValor: TipoValor; unidad?: string; opciones?: string }>;
    }> = [
      {
        nombre: 'Farmacéutico',
        descripcion: 'Plantilla de ejemplo — edítala o elimínala',
        campos: [
          { etiqueta: 'Principio Activo', tipoValor: 'TEXT' },
          { etiqueta: 'Concentración', tipoValor: 'TEXT', unidad: 'mg/ml' },
          { etiqueta: 'Forma Farmacéutica', tipoValor: 'SELECT', opciones: 'Tableta|Cápsula|Jarabe|Suspensión|Inyectable|Crema|Gotas' },
          { etiqueta: 'Vía de Administración', tipoValor: 'SELECT', opciones: 'Oral|Tópica|Intravenosa|Intramuscular|Oftálmica|Ótica' },
          { etiqueta: 'Registro Sanitario', tipoValor: 'TEXT' },
          { etiqueta: 'Requiere Receta', tipoValor: 'BOOLEAN' },
          { etiqueta: 'Contenido (piezas)', tipoValor: 'NUMBER' },
          { etiqueta: 'Laboratorio Fabricante', tipoValor: 'TEXT' },
        ],
      },
      {
        nombre: 'Cárnico / Alimentos',
        descripcion: 'Plantilla de ejemplo — edítala o elimínala',
        campos: [
          { etiqueta: 'Especie', tipoValor: 'SELECT', opciones: 'Bovino|Porcino|Avícola|Ovino|Pescados y mariscos' },
          { etiqueta: 'Corte', tipoValor: 'TEXT' },
          { etiqueta: 'Clasificación USDA', tipoValor: 'SELECT', opciones: 'Prime|Choice|Select|Standard' },
          { etiqueta: 'Proceso de Conservación', tipoValor: 'SELECT', opciones: 'Fresco|Refrigerado|Congelado|Madurado' },
          { etiqueta: 'Tipo Procesado', tipoValor: 'SELECT', opciones: 'Sin procesar|Marinado|Ahumado|Embutido' },
          { etiqueta: 'Origen Geográfico', tipoValor: 'TEXT' },
        ],
      },
      {
        nombre: 'Petrolero / Petroquímica',
        descripcion: 'Plantilla de ejemplo — edítala o elimínala',
        campos: [
          { etiqueta: 'Grado API', tipoValor: 'NUMBER', unidad: '°API' },
          { etiqueta: 'Contenido de Azufre', tipoValor: 'NUMBER', unidad: '%' },
          { etiqueta: 'Punto de Inflamación', tipoValor: 'NUMBER', unidad: '°C' },
          { etiqueta: 'Viscosidad', tipoValor: 'NUMBER', unidad: 'cSt' },
          { etiqueta: 'Norma Aplicable', tipoValor: 'TEXT' },
          { etiqueta: 'Clasificación ONU', tipoValor: 'TEXT' },
        ],
      },
      {
        nombre: 'Hotelero',
        descripcion: 'Plantilla de ejemplo — edítala o elimínala',
        campos: [
          { etiqueta: 'Tipo de Amenidad', tipoValor: 'SELECT', opciones: 'Baño|Cama|Bienvenida|Minibar|Papelería' },
          { etiqueta: 'Área de Suministro', tipoValor: 'SELECT', opciones: 'Habitaciones|Áreas públicas|Restaurante|Spa|Alberca' },
          { etiqueta: 'Dosis por Habitación', tipoValor: 'NUMBER' },
          { etiqueta: 'Proveedor Específico', tipoValor: 'TEXT' },
        ],
      },
    ];

    let creados = 0;
    for (const p of plantillas) {
      const existe = await this.grupoRepo.findOne({ where: { empresaId, nombre: p.nombre } });
      if (existe) continue;
      const grupo = await this.grupoRepo.save(this.grupoRepo.create({
        empresaId, nombre: p.nombre, descripcion: p.descripcion, orden: creados,
      }));
      let orden = 1;
      for (const c of p.campos) {
        await this.defRepo.save(this.defRepo.create({
          empresaId, grupoId: grupo.id,
          clave: this.generarClave(c.etiqueta),
          etiqueta: c.etiqueta,
          tipoValor: c.tipoValor,
          unidad: c.unidad ?? null,
          opciones: c.opciones ?? null,
          requerido: false,
          orden: orden++,
        }));
      }
      creados++;
    }
    return { gruposCreados: creados };
  }

  // ═══════════════ helpers ═══════════════

  /** 'Principio Activo' → 'principioActivo' (sin acentos ni símbolos) */
  private generarClave(etiqueta: string): string {
    const limpio = etiqueta
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .trim().toLowerCase();
    const palabras = limpio.split(/\s+/);
    return palabras
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join('')
      .slice(0, 100) || 'campo';
  }

  private normalizarOpciones(raw: string): string {
    return raw.split('|').map((o) => o.trim()).filter(Boolean).join('|').slice(0, 1000);
  }
}
