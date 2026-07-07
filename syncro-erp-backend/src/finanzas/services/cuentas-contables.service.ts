import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { CrearCuentaContableDto } from '../dto/crear-cuenta-contable.dto';
import { PLAN_CUENTAS_ESTANDAR } from '../data/plan-cuentas-estandar';

@Injectable()
export class CuentasContablesService {
    constructor(
        @InjectRepository(CuentaContable)
        private readonly cuentaRepository: Repository<CuentaContable>,
    ) { }

    async crearCuenta(dto: CrearCuentaContableDto, empresaId: string) {
        const nueva = this.cuentaRepository.create({ ...dto, empresaId });
        try {
            return await this.cuentaRepository.save(nueva);
        } catch (error: any) {
            if (error.number === 2627 || error.number === 2601) {
                throw new ConflictException('Ya existe una cuenta con este número.');
            }
            throw new InternalServerErrorException('Error al crear la cuenta contable.');
        }
    }

    async editarCuenta(id: string, dto: Partial<CrearCuentaContableDto>, empresaId: string) {
        const cuenta = await this.cuentaRepository.findOne({ where: { id, empresaId } });
        if (!cuenta) throw new NotFoundException('Cuenta no encontrada.');
        Object.assign(cuenta, dto);
        return this.cuentaRepository.save(cuenta);
    }

    async cambiarEstado(id: string, empresaId: string) {
        const cuenta = await this.cuentaRepository.findOne({ where: { id, empresaId } });
        if (!cuenta) throw new NotFoundException('Cuenta no encontrada.');
        cuenta.activo = !cuenta.activo;
        return this.cuentaRepository.save(cuenta);
    }

    async obtenerCuentas(empresaId: string, soloAfectables: boolean = false) {
        const whereClause: any = { empresaId, activo: true };
        if (soloAfectables) whereClause.esAfectable = true;
        return this.cuentaRepository.find({
            where: whereClause,
            order: { numeroCuenta: 'ASC' }
        });
    }

    async precargarPlanEstandar(empresaId: string) {
        // Cuentas que ya tiene la empresa (para no duplicar)
        const existentes = await this.cuentaRepository.find({
            where: { empresaId },
        });
        const porNumero = new Map(
            existentes.map((c) => [c.numeroCuenta, c]),
        );

        const creadas: string[] = [];
        const yaExistian: string[] = [];
        const mapaRoles: Record<string, string> = {}; // rol -> cuentaId

        for (const def of PLAN_CUENTAS_ESTANDAR) {
            const existente = porNumero.get(def.numeroCuenta);
            if (existente) {
                yaExistian.push(def.numeroCuenta);
                mapaRoles[def.rol] = existente.id;
                continue;
            }

            const nueva = this.cuentaRepository.create({
                empresaId,
                numeroCuenta: def.numeroCuenta,
                nombre: def.nombre,
                tipo: def.tipo,
                naturaleza: def.naturaleza,
                esAfectable: def.esAfectable,
                codigoAgrupadorSAT: def.codigoAgrupadorSAT,
                activo: true,
            });

            try {
                const guardada = await this.cuentaRepository.save(nueva);
                creadas.push(def.numeroCuenta);
                mapaRoles[def.rol] = guardada.id;
            } catch (error: any) {
                // Si por carrera otra petición ya la creó (violación de unique),
                // la recuperamos en vez de fallar todo el setup.
                if (error.number === 2627 || error.number === 2601) {
                    const recuperada = await this.cuentaRepository.findOne({
                        where: { empresaId, numeroCuenta: def.numeroCuenta },
                    });
                    if (recuperada) {
                        yaExistian.push(def.numeroCuenta);
                        mapaRoles[def.rol] = recuperada.id;
                        continue;
                    }
                }
                throw error;
            }
        }

        return {
            ok: true,
            totalCatalogo: PLAN_CUENTAS_ESTANDAR.length,
            creadas: creadas.length,
            yaExistian: yaExistian.length,
            detalleCreadas: creadas,
            detalleYaExistian: yaExistian,
            mapaRoles, // { CAJA: 'uuid', VENTAS: 'uuid', ... }
        };
    }
}