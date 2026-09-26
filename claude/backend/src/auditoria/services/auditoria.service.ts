import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  DataSource,
} from 'typeorm';

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
    private readonly dataSource: DataSource,
  ) {}

  // ── ANEXAR ────────────────────────────────────────────────────────────────
  /**
   * Registra un evento. Nunca lanza: si la auditoría falla, se loguea pero
   * NO se rompe la operación de negocio que la originó.
   */
  async registrar(datos: DatosRegistro): Promise<void> {
    try {
      const fechaHora = new Date();
      const base = {
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
        fechaHora,
      };

      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const llaveEmpresa = base.empresaId ?? 'GLOBAL';
        const lock = await manager.query(
          `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
          [`AUDITORIA:CADENA:${llaveEmpresa}`],
        );
        if (Number(lock?.[0]?.resultado ?? -999) < 0) {
          throw new Error('No fue posible reservar la cadena de auditoría.');
        }

        /*
         * ────────────────────────────────────────────────────────────────────
         * LA CADENA DE AUDITORIA NUNCA ESTUVO ENCADENADA
         *
         * `SELECT hashRegistro` sin comillas. PostgreSQL pliega a minusculas
         * todo identificador que no venga entrecomillado, asi que la fila
         * llegaba como `{ hashregistro: '...' }` y `anteriores[0].hashRegistro`
         * era `undefined`. El `?? null` lo convertia en `null`, y CADA registro
         * de auditoria se guardaba con `hashAnterior = null`.
         *
         * Lo que eso significa: la bitacora dejaba de ser una cadena y pasaba a
         * ser una pila de registros sueltos. Se puede borrar uno de en medio y
         * nada lo delata —que es exactamente lo unico que un hash encadenado
         * viene a impedir—. Y de rebote, `verificarIntegridad` compara
         * `r.hashAnterior` contra el hash del registro previo, asi que a partir
         * del SEGUNDO registro contestaba «integra: false · La referencia al
         * hash anterior no coincide», siempre, en cualquier instalacion:
         * acusaba de manipulacion a una bitacora intacta.
         *
         * La columna real es minuscula; lo que hay que entrecomillar es el
         * ALIAS, que es la llave con la que JavaScript lee la fila.
         * ────────────────────────────────────────────────────────────────────
         */
        const anteriores: Array<{ hashRegistro: string | null }> =
          base.empresaId == null
            ? await manager.query(
                `SELECT hashRegistro AS "hashRegistro"
                   FROM registros_auditoria
                  WHERE empresaId IS NULL
                  ORDER BY fechaHora DESC, id DESC
                  LIMIT 1 FOR UPDATE`,
              )
            : await manager.query(
                `SELECT hashRegistro AS "hashRegistro"
                   FROM registros_auditoria
                  WHERE empresaId=$1
                  ORDER BY fechaHora DESC, id DESC
                  LIMIT 1 FOR UPDATE`,
                [base.empresaId],
              );

        const hashAnterior = anteriores?.[0]?.hashRegistro ?? null;
        const hashRegistro = this.calcularHash(base, hashAnterior);
        const registro = manager.getRepository(RegistroAuditoria).create({
          ...base,
          hashAnterior,
          hashRegistro,
        });
        await manager.getRepository(RegistroAuditoria).save(registro);
      });
    } catch (err: any) {
      this.logger.error(`No se pudo registrar auditoría: ${err?.message}`);
    }
  }

  /** Comprueba la cadena creada desde la migración que habilitó los hashes. */
  async verificarIntegridad(empresaId: string) {
    const registros = await this.repo.find({
      where: { empresaId },
      order: { fechaHora: 'ASC', id: 'ASC' },
    });

    let anterior: string | null = null;
    let verificados = 0;
    for (const r of registros) {
      // Filas históricas anteriores a la migración no poseen hash.
      if (!r.hashRegistro) continue;
      const base = {
        empresaId: r.empresaId,
        usuarioId: r.usuarioId,
        usuarioEmail: r.usuarioEmail,
        usuarioRol: r.usuarioRol,
        accion: r.accion,
        entidad: r.entidad,
        registroId: r.registroId,
        endpoint: r.endpoint,
        valorAnterior: r.valorAnterior,
        valorNuevo: r.valorNuevo,
        ip: r.ip,
        resultado: r.resultado,
        fechaHora: r.fechaHora,
      };
      const esperado = this.calcularHash(base, r.hashAnterior);
      if (r.hashAnterior !== anterior || esperado !== r.hashRegistro) {
        /*
         * Hay que distinguir DOS fallas que se veian iguales y no lo son.
         *
         * Los registros escritos antes del 25-sep-2026 se guardaron todos con
         * `hashAnterior = null` por el defecto del alias sin comillas. No los
         * altero nadie: nunca se encadenaron. Decirle a un auditor «el
         * contenido del registro fue alterado» sobre una bitacora intacta es
         * una acusacion falsa, y ademas tapa la manipulacion de verdad el dia
         * que la haya, porque todo el mundo aprende a ignorar ese mensaje.
         *
         * Sigue devolviendo `integra: false` —porque de verdad no hay cadena
         * que verificar en ese tramo— pero dice cual de las dos cosas pasa. No
         * es una puerta trasera: un registro sin encadenar no se da por bueno,
         * solo se nombra bien.
         */
        const sinEncadenar = r.hashAnterior === null && esperado === r.hashRegistro;
        return {
          integra: false,
          verificados,
          registroInvalidoId: r.id,
          motivo: sinEncadenar
            ? 'Este registro no quedó encadenado con el anterior. Es el defecto ' +
              'corregido el 25-sep-2026: hasta esa fecha la bitácora se escribía ' +
              'sin enlace. El contenido coincide con su propio hash, así que no ' +
              'fue alterado; simplemente no hay cadena que verificar hasta aquí.'
            : r.hashAnterior !== anterior
              ? 'La referencia al hash anterior no coincide.'
              : 'El contenido del registro fue alterado.',
          contenidoIntacto: sinEncadenar,
        };
      }
      anterior = r.hashRegistro;
      verificados += 1;
    }
    return {
      integra: true,
      verificados,
      registroInvalidoId: null,
      contenidoIntacto: true,
    };
  }

  private calcularHash(
    base: Record<string, unknown>,
    hashAnterior: string | null,
  ): string {
    const canonico = JSON.stringify({
      hashAnterior,
      empresaId: base.empresaId ?? null,
      usuarioId: base.usuarioId ?? null,
      usuarioEmail: base.usuarioEmail ?? null,
      usuarioRol: base.usuarioRol ?? null,
      accion: base.accion,
      entidad: base.entidad,
      registroId: base.registroId ?? null,
      endpoint: base.endpoint ?? null,
      valorAnterior: base.valorAnterior ?? null,
      valorNuevo: base.valorNuevo ?? null,
      ip: base.ip ?? null,
      resultado: base.resultado,
      fechaHora:
        base.fechaHora instanceof Date
          ? base.fechaHora.toISOString()
          : new Date(String(base.fechaHora)).toISOString(),
    });
    return createHash('sha256').update(canonico, 'utf8').digest('hex');
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
