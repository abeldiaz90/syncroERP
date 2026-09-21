import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * Toda área nace con una ruta de aprobación de requisiciones
 * ----------------------------------------------------------------------------
 * Sin esto, abrir un área no alcanzaba para trabajar. La secuencia real, vivida
 * con un usuario de verdad:
 *
 *   1. El almacenista abre «Nueva requisición» y llena el formulario.
 *   2. Al guardar: «Asigna un departamento al solicitante». Algo que él no
 *      puede hacerse a sí mismo.
 *   3. El administrador crea el área —que además pasa por dos aprobaciones— y
 *      se la asigna.
 *   4. El almacenista vuelve, llena el formulario OTRA VEZ, y al guardar:
 *      «No existe una ruta de aprobación activa para requisiciones de este
 *      departamento».
 *
 * Dos configuraciones invisibles, cada una descubierta fallando, y la segunda
 * después de volver a capturar todo. Nada de eso es una decisión de negocio:
 * es andamiaje que el sistema puede ponerse solo.
 *
 * Así que se pone solo. En cada arranque, toda área activa sin ruta de
 * requisiciones recibe una de un nivel. El aprobador se elige por orden de
 * responsabilidad —gerencia, dirección, y si no hay ninguno, quien sea dueño de
 * la empresa—, porque autorizar una compra es una función de mando y no se le
 * puede endosar a quien pase por ahí.
 *
 * Es un PISO, no una jaula: la matriz de aprobaciones sigue ahí para poner
 * niveles, montos y plazos. Lo único que esto garantiza es que nadie se topa
 * con un sistema que no deja trabajar y no explica qué falta.
 *
 * Y es idempotente: si el área ya tiene ruta —la que sea— no se toca.
 * ============================================================================
 */
@Injectable()
export class RutasAprobacionInicialesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RutasAprobacionInicialesService.name);

  /** Quién puede autorizar una compra, en orden de preferencia. */
  private static readonly ROLES_DE_MANDO = ['gerencia', 'direccion', 'admin'];

  constructor(
    @InjectRepository(ConfiguracionAprobacion)
    private readonly configuraciones: Repository<ConfiguracionAprobacion>,
    @InjectRepository(Departamento)
    private readonly departamentos: Repository<Departamento>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  async onApplicationBootstrap() {
    try {
      const creadas = await this.asegurarRutasDeRequisicion();
      if (creadas > 0) {
        this.logger.log(
          `Rutas de aprobación de requisición creadas para ${creadas} área(s) que no tenían ninguna.`,
        );
      }
    } catch (error) {
      /*
       * Que esto falle no puede impedir que el ERP arranque: es una comodidad
       * de puesta en marcha, no una pieza del sistema.
       */
      this.logger.error(
        `No se pudieron asegurar las rutas de aprobación: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async asegurarRutasDeRequisicion(): Promise<number> {
    const areas = await this.departamentos.find({ where: { activo: true } });
    if (!areas.length) return 0;

    const empresas = [...new Set(areas.map((a) => a.empresaId))];
    const candidatosPorEmpresa = new Map<string, Usuario | null>();
    for (const empresaId of empresas) {
      candidatosPorEmpresa.set(empresaId, await this.aprobadorDe(empresaId));
    }

    const conRuta = new Set(
      (
        await this.configuraciones.find({
          where: {
            proceso: 'REQUISICION',
            departamentoId: Not(IsNull()),
            empresaId: In(empresas),
          },
          select: ['departamentoId'],
        })
      ).map((c) => c.departamentoId!),
    );

    let creadas = 0;
    for (const area of areas) {
      if (conRuta.has(area.id)) continue;
      const aprobador = candidatosPorEmpresa.get(area.empresaId);
      if (!aprobador) {
        this.logger.warn(
          `El área "${area.nombre}" se queda sin ruta de aprobación: la empresa no tiene ningún usuario activo con mando que pueda autorizar.`,
        );
        continue;
      }
      await this.configuraciones.save(
        this.configuraciones.create({
          empresaId: area.empresaId,
          proceso: 'REQUISICION',
          departamentoId: area.id,
          usuarioId: aprobador.id,
          orden: 1,
          tiempoLimiteHoras: 24,
          obligatorio: true,
          // Quien pide no se autoriza: la regla vive en el servicio de
          // requisiciones y aquí no se contradice.
          permiteAutoaprobacion: false,
          activo: true,
        }),
      );
      creadas += 1;
    }
    return creadas;
  }

  /** El usuario de mayor responsabilidad que pueda autorizar en esta empresa. */
  private async aprobadorDe(empresaId: string): Promise<Usuario | null> {
    const activos = await this.usuarios.find({
      where: { empresaId, activo: true },
    });
    if (!activos.length) return null;

    for (const rol of RutasAprobacionInicialesService.ROLES_DE_MANDO) {
      const encontrado = activos.find((u) => normalizarRol(u.rol) === rol);
      if (encontrado) return encontrado;
    }
    return activos.find((u) => u.esPropietario) ?? null;
  }
}
