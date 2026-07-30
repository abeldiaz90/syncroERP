import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CuentaContable,
  RolCuentaSistema,
} from '../entities/cuenta-contable.entity';
import { CrearCuentaContableDto } from '../dto/crear-cuenta-contable.dto';
import { PLAN_CUENTAS_ESTANDAR } from '../data/plan-cuentas-estandar';
import { CatalogosSatService } from './catalogos-sat.service';

@Injectable()
export class CuentasContablesService {
  constructor(
    @InjectRepository(CuentaContable)
    private readonly cuentaRepository: Repository<CuentaContable>,
    private readonly catalogosSat: CatalogosSatService,
  ) {}

  async crearCuenta(
    dto: CrearCuentaContableDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    this.catalogosSat.validarCodigoAgrupador(dto.codigoAgrupadorSAT);
    const nueva = this.cuentaRepository.create({ ...dto, empresaId });
    try {
      const guardada = await this.cuentaRepository.save(nueva);
      await this.catalogosSat.sincronizarCuenta(guardada, true, usuarioId);
      return guardada;
    } catch (error: any) {
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictException('Ya existe una cuenta con este número.');
      }
      throw new InternalServerErrorException(
        'Error al crear la cuenta contable.',
      );
    }
  }

  async editarCuenta(
    id: string,
    dto: Partial<CrearCuentaContableDto>,
    empresaId: string,
    usuarioId?: string,
  ) {
    if (dto.codigoAgrupadorSAT !== undefined) {
      this.catalogosSat.validarCodigoAgrupador(dto.codigoAgrupadorSAT);
    }
    const cuenta = await this.cuentaRepository.findOne({
      where: { id, empresaId },
    });
    if (!cuenta) throw new NotFoundException('Cuenta no encontrada.');
    Object.assign(cuenta, dto);
    const guardada = await this.cuentaRepository.save(cuenta);
    if (dto.codigoAgrupadorSAT !== undefined) {
      await this.catalogosSat.sincronizarCuenta(guardada, true, usuarioId);
    }
    return guardada;
  }

  async cambiarEstado(id: string, empresaId: string) {
    const cuenta = await this.cuentaRepository.findOne({
      where: { id, empresaId },
    });
    if (!cuenta) throw new NotFoundException('Cuenta no encontrada.');
    cuenta.activo = !cuenta.activo;
    return this.cuentaRepository.save(cuenta);
  }

  async obtenerCuentas(empresaId: string, soloAfectables: boolean = false) {
    const whereClause: any = { empresaId, activo: true };
    if (soloAfectables) whereClause.esAfectable = true;
    return this.cuentaRepository.find({
      where: whereClause,
      order: { numeroCuenta: 'ASC' },
    });
  }

  async precargarPlanEstandar(empresaId: string) {
    await this.catalogosSat.asegurarCatalogo2026();

    // Nunca se elimina ni renombra una cuenta del usuario. La plantilla sólo
    // completa por número lo que falte y conserva roles ya configurados.
    const existentes = await this.cuentaRepository.find({
      where: { empresaId },
    });
    for (const cuenta of existentes) {
      if ((cuenta.rolSistema as string) === 'IVA_ACREDITABLE') {
        cuenta.rolSistema = RolCuentaSistema.IVA_ACREDITABLE_PAGADO;
        await this.cuentaRepository.save(cuenta);
      }
      if ((cuenta.rolSistema as string) === 'IVA_TRASLADADO') {
        cuenta.rolSistema = RolCuentaSistema.IVA_TRASLADADO_COBRADO;
        await this.cuentaRepository.save(cuenta);
      }
    }
    const porNumero = new Map<string, CuentaContable>(
      existentes.map((c) => [c.numeroCuenta, c]),
    );
    const porRol = new Map(
      existentes
        .filter((c) => c.rolSistema)
        .map((c) => [c.rolSistema as RolCuentaSistema, c]),
    );

    const creadas: string[] = [];
    const yaExistian: string[] = [];
    const mapaRoles: Record<string, string> = {};
    const advertencias: string[] = [];
    const porCrear = PLAN_CUENTAS_ESTANDAR.filter((def) => {
      const existente = porNumero.get(def.numeroCuenta);
      if (!existente) return true;
      yaExistian.push(def.numeroCuenta);
      return false;
    });

    // Se crean por niveles para que cuentaPadreId siempre apunte a una cuenta
    // ya persistida. Esto conserva la jerarquía de mayor/subcuenta del Anexo.
    let pendientes = [...porCrear];
    while (pendientes.length) {
      const listas = pendientes.filter(
        (def) => !def.cuentaPadreNumero || porNumero.has(def.cuentaPadreNumero),
      );
      if (!listas.length) {
        throw new InternalServerErrorException(
          'El plan contable oficial contiene una referencia de cuenta padre inválida.',
        );
      }

      const entidades = listas.map((def) => {
        const rolDisponible = def.rol && !porRol.has(def.rol) ? def.rol : null;
        return this.cuentaRepository.create({
          empresaId,
          numeroCuenta: def.numeroCuenta,
          nombre: def.nombre,
          tipo: def.tipo,
          naturaleza: def.naturaleza,
          esAfectable: def.esAfectable,
          codigoAgrupadorSAT: def.codigoAgrupadorSAT,
          cuentaPadreId: def.cuentaPadreNumero
            ? porNumero.get(def.cuentaPadreNumero)?.id
            : null,
          activo: true,
          rolSistema: rolDisponible,
        });
      });

      let procesadas = new Set<string>();
      try {
        const guardadas = await this.cuentaRepository.save(entidades, {
          chunk: 100,
        });
        for (const cuenta of guardadas) {
          porNumero.set(cuenta.numeroCuenta, cuenta);
          creadas.push(cuenta.numeroCuenta);
          if (cuenta.rolSistema) {
            porRol.set(cuenta.rolSistema, cuenta);
          }
        }
        procesadas = new Set(guardadas.map((cuenta) => cuenta.numeroCuenta));
      } catch (error: any) {
        if (error.number !== 2627 && error.number !== 2601) throw error;
        // Otra petición pudo completar parte de la plantilla. Se vuelve a
        // leer y la siguiente iteración continúa desde el estado real.
        const recuperadas = await this.cuentaRepository.find({
          where: { empresaId },
        });
        for (const cuenta of recuperadas) {
          porNumero.set(cuenta.numeroCuenta, cuenta);
          if (cuenta.rolSistema) porRol.set(cuenta.rolSistema, cuenta);
        }
        procesadas = new Set(
          listas
            .filter((def) => porNumero.has(def.numeroCuenta))
            .map((def) => def.numeroCuenta),
        );
        if (!procesadas.size) throw error;
      }
      pendientes = pendientes.filter(
        (def) => !procesadas.has(def.numeroCuenta),
      );
    }

    // Si una empresa ya tenía la cuenta oficial, se le asigna el rol sólo
    // cuando no existe otra cuenta operativa con ese mismo rol.
    const conCambios: CuentaContable[] = [];
    for (const def of PLAN_CUENTAS_ESTANDAR) {
      if (!def.rol) continue;
      const cuenta = porNumero.get(def.numeroCuenta);
      const cuentaConRol = porRol.get(def.rol);
      if (cuenta && !cuenta.rolSistema && !cuentaConRol) {
        cuenta.rolSistema = def.rol;
        porRol.set(def.rol, cuenta);
        conCambios.push(cuenta);
      }
      const asignada = porRol.get(def.rol);
      if (asignada) mapaRoles[def.rol] = asignada.id;
    }
    if (conCambios.length) {
      await this.cuentaRepository.save(conCambios, { chunk: 100 });
    }

    try {
      await this.catalogosSat.sincronizarCuentasMasivo([...porNumero.values()]);
    } catch (error: any) {
      advertencias.push(
        error?.message ?? 'No fue posible completar los mapeos SAT.',
      );
    }

    return {
      ok: true,
      totalCatalogo: PLAN_CUENTAS_ESTANDAR.length,
      creadas: creadas.length,
      yaExistian: yaExistian.length,
      detalleCreadas: creadas,
      detalleYaExistian: yaExistian,
      mapaRoles, // { CAJA: 'uuid', VENTAS: 'uuid', ... }
      advertencias,
    };
  }
}
