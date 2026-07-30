import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

import {
  RegistroAuditoria,
  AccionAuditoria,
} from '../entities/registro-auditoria.entity';

export interface DatosRegistro {
  empresaId?: string | null;
  usuarioId?: string | null;
  usuarioEmail?: string | null;
  usuarioRol?: string | null;
  accion: AccionAuditoria;
  entidad: string;
  registroId?: string | null;
  endpoint?: string | null;
  valorAnterior?: any;
  valorNuevo?: any;
  ip?: string | null;
  resultado?: string;
}

/**
 * Servicio de auditoría. Solo dos operaciones: ANEXAR y CONSULTAR.
 * No expone editar ni borrar — una bitácora mutable no sirve de nada.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  /** Campos que NUNCA deben quedar guardados en claro en la bitácora. */
  private static readonly CAMPOS_SENSIBLES = [
    'password',
    'passwordHash',
    'contraseña',
    'nuevaPassword',
    'token',
    'tokenVerificacion',
    'tokenRecuperacion',
    'access_token',
    'secret',
    'apiKey',
    'authorization',
  ];

  constructor(
    @InjectRepository(RegistroAuditoria)
    private readonly repo: Repository<RegistroAuditoria>,
  ) {}

  // ── ANEXAR ────────────────────────────────────────────────────────────────
  /**
   * Registra un evento. Nunca lanza: si la auditoría falla, se loguea pero
   * NO se rompe la operación de negocio que la originó.
   */
  async registrar(datos: DatosRegistro): Promise<void> {
    try {
      const registro = this.repo.create({
        empresaId: datos.empresaId ?? null,
        usuarioId: datos.usuarioId ?? null,
        usuarioEmail: datos.usuarioEmail ?? null,
        usuarioRol: datos.usuarioRol ?? null,
        accion: datos.accion,
        entidad: datos.entidad,
        registroId: datos.registroId != null ? String(datos.registroId) : null,
        endpoint: datos.endpoint ?? null,
        valorAnterior: this.serializar(datos.valorAnterior),
        valorNuevo: this.serializar(datos.valorNuevo),
        ip: datos.ip ?? null,
        resultado: datos.resultado ?? 'OK',
      });
      await this.repo.save(registro);
    } catch (err: any) {
      this.logger.error(`No se pudo registrar auditoría: ${err?.message}`);
    }
  }

  // ── CONSULTAR ─────────────────────────────────────────────────────────────
  async consultar(
    empresaId: string,
    filtros: {
      usuarioEmail?: string;
      entidad?: string;
      accion?: string;
      registroId?: string;
      desde?: string;
      hasta?: string;
      pagina?: number;
      porPagina?: number;
    },
  ) {
    const where: any = { empresaId };
    if (filtros.usuarioEmail) where.usuarioEmail = filtros.usuarioEmail;
    if (filtros.entidad) where.entidad = filtros.entidad;
    if (filtros.accion) where.accion = filtros.accion;
    if (filtros.registroId) where.registroId = String(filtros.registroId);

    if (filtros.desde && filtros.hasta) {
      const h = new Date(filtros.hasta);
      h.setHours(23, 59, 59, 999);
      where.fechaHora = Between(new Date(filtros.desde), h);
    } else if (filtros.desde) {
      where.fechaHora = MoreThanOrEqual(new Date(filtros.desde));
    } else if (filtros.hasta) {
      const h = new Date(filtros.hasta);
      h.setHours(23, 59, 59, 999);
      where.fechaHora = LessThanOrEqual(h);
    }

    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
    const pagina = Math.max(filtros.pagina ?? 1, 1);

    const [datos, total] = await this.repo.findAndCount({
      where,
      order: { fechaHora: 'DESC' },
      take: porPagina,
      skip: (pagina - 1) * porPagina,
    });

    return {
      datos,
      total,
      pagina,
      porPagina,
      totalPaginas: Math.ceil(total / porPagina),
    };
  }

  /** Historial completo de un registro concreto (línea de tiempo). */
  async historialDe(empresaId: string, entidad: string, registroId: string) {
    return this.repo.find({
      where: { empresaId, entidad, registroId: String(registroId) },
      order: { fechaHora: 'ASC' },
    });
  }

  /** Catálogos para los filtros de la pantalla (entidades y usuarios vistos). */
  async opcionesFiltro(empresaId: string) {
    const entidades = await this.repo
      .createQueryBuilder('r')
      .select('DISTINCT r.entidad', 'entidad')
      .where('r.empresaId = :empresaId', { empresaId })
      .orderBy('r.entidad', 'ASC')
      .getRawMany();
    const usuarios = await this.repo
      .createQueryBuilder('r')
      .select('DISTINCT r.usuarioEmail', 'usuarioEmail')
      .where('r.empresaId = :empresaId AND r.usuarioEmail IS NOT NULL', {
        empresaId,
      })
      .orderBy('r.usuarioEmail', 'ASC')
      .getRawMany();
    return {
      entidades: entidades.map((e) => e.entidad),
      usuarios: usuarios.map((u) => u.usuarioEmail),
      acciones: ['CREAR', 'ACTUALIZAR', 'ELIMINAR', 'CANCELAR', 'ACCION'],
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  /** Serializa a JSON ocultando campos sensibles y limitando el tamaño. */
  private serializar(valor: any): string | null {
    if (valor === null || valor === undefined) return null;
    try {
      const limpio = this.enmascarar(valor);
      let json = JSON.stringify(limpio);
      if (json && json.length > 8000)
        json = json.slice(0, 8000) + '…"[truncado]"';
      return json;
    } catch {
      return null;
    }
  }

  private enmascarar(valor: any): any {
    if (Array.isArray(valor)) return valor.map((v) => this.enmascarar(v));
    if (valor && typeof valor === 'object') {
      const salida: any = {};
      for (const [k, v] of Object.entries(valor)) {
        const esSensible = AuditoriaService.CAMPOS_SENSIBLES.some((c) =>
          k.toLowerCase().includes(c.toLowerCase()),
        );
        salida[k] = esSensible ? '***' : this.enmascarar(v);
      }
      return salida;
    }
    return valor;
  }
}
