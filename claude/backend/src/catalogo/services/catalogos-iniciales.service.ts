import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CuentasContablesService } from '../../finanzas/services/cuentas-contables.service';
import { CatalogosSatService } from '../../finanzas/services/catalogos-sat.service';
import { FormaPago } from '../entities/forma-pago.entity';

/**
 * Garantiza que una instalación recién creada y las empresas existentes
 * tengan los catálogos base sin botones ni scripts manuales.
 */
@Injectable()
export class CatalogosInicialesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogosInicialesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cuentas: CuentasContablesService,
    private readonly catalogosSat: CatalogosSatService,
  ) {}

  async onApplicationBootstrap() {
    await this.catalogosSat.asegurarCatalogo2026();
    await this.asegurarFormasDePago();
    const empresas = await this.dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM Empresas',
    );
    for (const empresa of empresas) {
      const resultado = await this.cuentas.precargarPlanEstandar(
        String(empresa.id),
      );
      if (resultado.creadas > 0) {
        this.logger.log(
          `Plan mexicano inicial: ${resultado.creadas} cuentas creadas para ${empresa.id}.`,
        );
      }
    }
  }

  /**
   * Formas de pago del SAT (c_FormaPago).
   *
   * La tabla estaba VACIA y el campo es obligatorio en el alta de proveedor:
   * el comprador abria el formulario, llenaba todo y se topaba con un combo
   * "Forma de Pago *" sin una sola opcion. No hay forma de salir de ahi, y la
   * pantalla no dice por que. Verificado el 21-sep-2026 con el usuario de
   * Compras.
   *
   * Es un catalogo publicado por el SAT: no cambia por empresa, no lo decide
   * nadie de la operacion y no tiene por que capturarse a mano. Nace con el
   * sistema, igual que los bancos y el plan de cuentas.
   *
   * Idempotente: se siembra solo lo que falta, comparando por nombre. Lo que
   * SUMA no use se desactiva desde el catalogo, que para eso existe `activo`;
   * el arranque no vuelve a encender lo que alguien apago, porque solo crea.
   */
  private async asegurarFormasDePago() {
    const repo = this.dataSource.getRepository(FormaPago);
    const existentes = await repo.find();
    if (existentes.length > 0) return;

    const oficiales = [
      '01 - Efectivo',
      '02 - Cheque nominativo',
      '03 - Transferencia electronica',
      '04 - Tarjeta de credito',
      '05 - Monedero electronico',
      '06 - Dinero electronico',
      '08 - Vales de despensa',
      '12 - Dacion en pago',
      '13 - Pago por subrogacion',
      '14 - Pago por consignacion',
      '15 - Condonacion',
      '17 - Compensacion',
      '23 - Novacion',
      '24 - Confusion',
      '25 - Remision de deuda',
      '26 - Prescripcion o caducidad',
      '27 - A satisfaccion del acreedor',
      '28 - Tarjeta de debito',
      '29 - Tarjeta de servicios',
      '30 - Aplicacion de anticipos',
      '31 - Intermediario pagos',
      '99 - Por definir',
    ];

    await repo.save(
      oficiales.map((nombre) => repo.create({ nombre, activo: true })),
    );
    this.logger.log(
      `Formas de pago del SAT: ${oficiales.length} sembradas (el catalogo estaba vacio).`,
    );
  }

}
