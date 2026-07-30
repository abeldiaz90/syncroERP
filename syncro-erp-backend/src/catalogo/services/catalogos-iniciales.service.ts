import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CuentasContablesService } from '../../finanzas/services/cuentas-contables.service';
import { CatalogosSatService } from '../../finanzas/services/catalogos-sat.service';

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
}
