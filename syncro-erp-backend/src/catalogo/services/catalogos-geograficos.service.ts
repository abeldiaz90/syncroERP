import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Country, State } from 'country-state-city';
import { Repository } from 'typeorm';
import { Pais } from '../entities/pais.entity';
import { Estado } from '../entities/estado.entity';

/**
 * Copia a SQL Server el catálogo empaquetado de países y subdivisiones.
 * Es idempotente: una base vacía se nutre sola y un despliegue posterior
 * actualiza nombres/metadatos sin borrar altas realizadas por los usuarios.
 */
@Injectable()
export class CatalogosGeograficosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogosGeograficosService.name);

  constructor(
    @InjectRepository(Pais) private readonly paises: Repository<Pais>,
    @InjectRepository(Estado) private readonly estados: Repository<Estado>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.sincronizar();
    } catch (error: any) {
      this.logger.error(`No se pudo precargar geografía: ${error?.message}`);
    }
  }

  async sincronizar() {
    const countries = Country.getAllCountries();
    const existentes = await this.paises.find();
    const porCodigo = new Map(
      existentes.map((pais) => [pais.codigoIso2 || pais.codigo, pais]),
    );
    const paises = countries.map((country) =>
      this.paises.create({
        ...porCodigo.get(country.isoCode),
        nombre: country.name,
        codigo: country.isoCode,
        codigoIso2: country.isoCode,
        codigoIso3: null,
        lada: country.phonecode?.slice(0, 10) || null,
        moneda: country.currency?.slice(0, 3) || null,
        esOficial: true,
        activo: true,
      }),
    );
    const guardados = await this.paises.save(paises, { chunk: 100 });
    const paisPorCodigo = new Map(guardados.map((p) => [p.codigoIso2, p]));

    const estadosExistentes = await this.estados.find();
    const estadoPorClave = new Map(
      estadosExistentes
        .filter((estado) => estado.paisId && estado.codigo)
        .map((estado) => [`${estado.paisId}|${estado.codigo}`, estado]),
    );
    const aGuardar: Estado[] = [];
    for (const country of countries) {
      const pais = paisPorCodigo.get(country.isoCode)!;
      for (const subdivision of State.getStatesOfCountry(country.isoCode)) {
        aGuardar.push(
          this.estados.create({
            ...estadoPorClave.get(`${pais.id}|${subdivision.isoCode}`),
            paisId: pais.id,
            nombre: subdivision.name,
            codigo: subdivision.isoCode?.slice(0, 10) || null,
            tipo: null,
            esOficial: true,
            activo: true,
          }),
        );
      }
    }
    await this.estados.save(aGuardar, { chunk: 500 });
    const totalEstados = aGuardar.length;
    this.logger.log(
      `Catálogo geográfico listo: ${countries.length} países y ${totalEstados} subdivisiones.`,
    );
    return { paises: countries.length, estados: totalEstados };
  }
}
