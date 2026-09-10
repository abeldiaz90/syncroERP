import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../entities/cuenta-bancaria.entity';
import { Banco } from '../../catalogo/entities/banco.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { CrearCuentaBancariaDto } from '../dto/crear-cuenta-bancaria.dto';
import { ActualizarCuentaBancariaDto } from '../dto/actualizar-cuenta-bancaria.dto';
import {
  claveBancoDeClabe,
  esClabeValida,
} from '../../common/validators/clabe.validator';

@Injectable()
export class CuentasBancariasService {
  constructor(
    @InjectRepository(CuentaBancaria)
    private readonly repo: Repository<CuentaBancaria>,
    @InjectRepository(Banco)
    private readonly bancos: Repository<Banco>,
    @InjectRepository(CuentaContable)
    private readonly cuentasContables: Repository<CuentaContable>,
  ) {}

  async crear(dto: CrearCuentaBancariaDto, empresaId: string) {
    const datos = await this.validarYNormalizar(dto, empresaId);
    await this.validarClabeUnica(datos.clabe, empresaId);

    if (datos.esPorDefecto) {
      await this.quitarPredeterminada(empresaId, datos.tipo);
    }
    const cb = this.repo.create({ ...datos, empresaId });
    return this.repo.save(cb);
  }

  async obtenerTodas(empresaId: string) {
    return this.repo.find({
      where: { empresaId, activo: true },
      relations: ['cuentaContable', 'banco'],
      order: { tipo: 'ASC', nombre: 'ASC' },
    });
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cb = await this.repo.findOne({
      where: { id, empresaId },
      relations: ['cuentaContable', 'banco'],
    });
    if (!cb) throw new NotFoundException('Cuenta bancaria no encontrada');
    return cb;
  }

  async obtenerPorDefecto(empresaId: string) {
    return this.repo.findOne({
      where: { empresaId, esPorDefecto: true, activo: true },
    });
  }

  async editar(
    id: string,
    dto: ActualizarCuentaBancariaDto,
    empresaId: string,
  ) {
    const cb = await this.obtenerPorId(id, empresaId);
    const datos = await this.validarYNormalizar(
      {
        nombre: dto.nombre ?? cb.nombre,
        tipo: dto.tipo ?? cb.tipo,
        numeroCuenta:
          dto.numeroCuenta === undefined ? cb.numeroCuenta : dto.numeroCuenta,
        bancoId: dto.bancoId === undefined ? cb.bancoId : dto.bancoId,
        clabe: dto.clabe === undefined ? cb.clabe : dto.clabe,
        cuentaContableId:
          dto.cuentaContableId === undefined
            ? cb.cuentaContableId
            : dto.cuentaContableId,
        esPorDefecto: dto.esPorDefecto ?? cb.esPorDefecto,
      },
      empresaId,
    );
    await this.validarClabeUnica(datos.clabe, empresaId, id);
    if (datos.esPorDefecto) {
      await this.quitarPredeterminada(empresaId, datos.tipo, id);
    }
    Object.assign(cb, datos);
    return this.repo.save(cb);
  }

  async toggleEstado(id: string, empresaId: string) {
    const cb = await this.obtenerPorId(id, empresaId);
    cb.activo = !cb.activo;
    if (!cb.activo) cb.esPorDefecto = false;
    return this.repo.save(cb);
  }

  private async validarYNormalizar(
    dto: CrearCuentaBancariaDto,
    empresaId: string,
  ): Promise<CrearCuentaBancariaDto> {
    const datos: CrearCuentaBancariaDto = {
      ...dto,
      nombre: dto.nombre.trim(),
      numeroCuenta: dto.numeroCuenta?.trim() || null,
      bancoId: dto.bancoId || null,
      clabe: dto.clabe?.trim() || null,
      cuentaContableId: dto.cuentaContableId || null,
      esPorDefecto: dto.esPorDefecto ?? false,
    };

    if (datos.tipo === TipoCuentaBancaria.CAJA) {
      datos.numeroCuenta = null;
      datos.bancoId = null;
      datos.clabe = null;
    }

    if (datos.tipo === TipoCuentaBancaria.TPV) {
      datos.clabe = null;
    }

    if (datos.tipo === TipoCuentaBancaria.BANCO) {
      if (!datos.bancoId) {
        throw new BadRequestException(
          'Selecciona la institución bancaria de la cuenta.',
        );
      }
      if (!datos.clabe || !esClabeValida(datos.clabe)) {
        throw new BadRequestException(
          'La CLABE debe tener 18 dígitos y un dígito verificador válido.',
        );
      }
    }

    if (datos.bancoId) {
      const banco = await this.bancos.findOne({
        where: { id: datos.bancoId, activo: true },
      });
      if (!banco) {
        throw new BadRequestException(
          'La institución bancaria seleccionada no existe o está inactiva.',
        );
      }
      if (
        datos.clabe &&
        banco.clave &&
        claveBancoDeClabe(datos.clabe) !== banco.clave
      ) {
        throw new BadRequestException(
          `La CLABE inicia con ${claveBancoDeClabe(datos.clabe)}, pero el banco seleccionado usa la clave ${banco.clave}.`,
        );
      }
    }

    /*
     * La cuenta contable es OBLIGATORIA, no opcional.
     *
     * La pantalla ya la marcaba con asterisco, pero nadie la validaba: se podía
     * guardar una caja o un banco sin cuenta contable. El problema aparece
     * después y lejos: `buscarCuentaSegunMetodoPago` devuelve null y
     * `generarAsientoDeTesoreria` no puede resolver la cuenta, así que TODA
     * póliza que toque esa cuenta —ventas, cobranza, pagos, traspasos, nómina—
     * falla y cae en la bandeja de asientos pendientes. El usuario descubre el
     * problema al cerrar el mes, sin forma de relacionarlo con el alta.
     */
    if (!datos.cuentaContableId) {
      throw new BadRequestException(
        'Elige la cuenta contable de esta caja o banco. Sin ella, ninguna ' +
          'operación que la use podrá generar su póliza.',
      );
    }

    {
      const cuenta = await this.cuentasContables.findOne({
        where: {
          id: datos.cuentaContableId,
          empresaId,
          activo: true,
          esAfectable: true,
        },
      });
      if (!cuenta) {
        throw new BadRequestException(
          'La cuenta contable no pertenece a la empresa, está inactiva o no es afectable.',
        );
      }
    }

    return datos;
  }

  private async validarClabeUnica(
    clabe: string | null | undefined,
    empresaId: string,
    ignorarId?: string,
  ) {
    if (!clabe) return;
    const existente = await this.repo.findOne({
      where: { empresaId, clabe },
    });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(
        'Ya existe una cuenta bancaria de esta empresa con la misma CLABE.',
      );
    }
  }

  private async quitarPredeterminada(
    empresaId: string,
    tipo: TipoCuentaBancaria,
    ignorarId?: string,
  ) {
    const actuales = await this.repo.find({
      where: { empresaId, tipo, esPorDefecto: true },
    });
    const cambiar = actuales.filter((cuenta) => cuenta.id !== ignorarId);
    if (!cambiar.length) return;
    for (const cuenta of cambiar) cuenta.esPorDefecto = false;
    await this.repo.save(cambiar);
  }
}
