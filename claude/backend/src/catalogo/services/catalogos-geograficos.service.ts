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

  /**
   * Nombres de país en español, sin agregar una dependencia.
   *
   * `country-state-city` trae los nombres en inglés —«Mexico», «Germany»,
   * «Aland Islands»— y así llegaban al desplegable de un ERP mexicano. Las
   * subdivisiones sí vienen en español, de modo que el formulario mostraba
   * «Mexico» arriba y «Nuevo León» abajo: se leía como una traducción a medias,
   * que es peor que no traducir.
   *
   * `Intl.DisplayNames` vive en el runtime de Node y traduce a partir del
   * código ISO, así que no hay una tabla propia que mantener ni un catálogo que
   * se quede viejo. Si el runtime no trae datos de español —algunas
   * distribuciones mínimas— devuelve el código y ahí se conserva el nombre
   * original en vez de dejar «MX» en la pantalla.
   */
  private nombresEnEspanol(): (isoCode: string, original: string) => string {
    let traductor: Intl.DisplayNames | null = null;
    try {
      traductor = new Intl.DisplayNames(['es-MX', 'es'], { type: 'region' });
    } catch {
      traductor = null;
    }
    return (isoCode, original) => {
      if (!traductor) return original;
      try {
        const traducido = traductor.of(isoCode);
        if (!traducido || traducido === isoCode) return original;
        return traducido;
      } catch {
        return original;
      }
    };
  }

  async sincronizar() {
    const countries = Country.getAllCountries();
    const enEspanol = this.nombresEnEspanol();
    const existentes = await this.paises.find();
    const porCodigo = new Map(
      existentes.map((pais) => [pais.codigoIso2 || pais.codigo, pais]),
    );
    const paises = countries.map((country) =>
      this.paises.create({
        ...porCodigo.get(country.isoCode),
        nombre: enEspanol(country.isoCode, country.name),
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
    // SQL Server admite como máximo 2,100 parámetros por sentencia.
    // Con 7 columnas persistidas, lotes de 500 excedían ese límite y por eso
    // se guardaban países pero fallaban silenciosamente los estados.
    await this.estados.save(aGuardar, { chunk: 100 });
    const totalEstados = aGuardar.length;
    this.logger.log(
      `Catálogo geográfico listo: ${countries.length} países y ${totalEstados} subdivisiones.`,
    );
    return { paises: countries.length, estados: totalEstados };
  }
}
