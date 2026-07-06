import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { CrearCuentaContableDto } from '../dto/crear-cuenta-contable.dto';

@Injectable()
export class CuentasContablesService {
    constructor(
        @InjectRepository(CuentaContable)
        private readonly cuentaRepository: Repository<CuentaContable>,
    ) {}

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
}