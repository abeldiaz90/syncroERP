import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Country, State } from "country-state-city";
import { Repository } from "typeorm";
import { Pais } from "../entities/pais.entity";
import { Estado } from "../entities/estado.entity";

/**
 * Copia a la base el catálogo empaquetado de países y subdivisiones.
 * Es idempotente: una base vacía se nutre sola y un despliegue posterior
 * actualiza nombres/metadatos sin borrar altas realizadas por los usuarios.
 *
 * Y es idempotente además en el sentido barato: cuando no hay nada que
 * cambiar no escribe ni relee nada. Ver `cambio()` más abajo.
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
      traductor = new Intl.DisplayNames(["es-MX", "es"], { type: "region" });
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

  /**
   * ¿Cambió algo de verdad entre lo que hay guardado y lo que traemos?
   *
   * ==========================================================================
   * POR QUÉ HACE FALTA ESTA COMPARACIÓN
   * --------------------------------------------------------------------------
   * `sincronizar()` le pasaba a `save()` las 250 filas de países y las 4,963
   * de subdivisiones **en cada arranque**, iguales o no. TypeORM no emite un
   * solo `UPDATE` cuando nada cambió —eso estaba bien—, pero para averiguarlo
   * recarga cada lote de la base: con `chunk: 100` son unos cincuenta
   *
   *     SELECT … FROM "estados" WHERE "Estado"."id" IN ($1 … $100)
   *
   * uno detrás de otro. En el registro de arranque que Abel pegó el
   * 1-oct-2026, diez de esos `SELECT` tardaron entre 2.0 y 2.4 segundos cada
   * uno: del orden de **veinte segundos de arranque gastados en releer un
   * catálogo que no había cambiado**, y ninguna escritura al final.
   *
   * La comparación la podemos hacer aquí, con lo que ya leímos de una sola
   * vez, y pasarle a `save()` nada más lo nuevo y lo distinto. En un arranque
   * normal eso son cero filas: ni lotes, ni recargas.
   *
   * De paso desaparece el `DeprecationWarning` de `pg` del mismo registro
   * —«client.query() when the client is already executing a query»—, que lo
   * produce `save()` al partir en lotes y sin lotes no se produce.
   *
   * Medido contra un PostgreSQL de verdad con el catálogo ya puesto: 55
   * consultas por arranque antes, 2 después.
   * ==========================================================================
   */
  private cambio<T>(
    antes: T | undefined,
    ahora: T,
    campos: (keyof T)[],
  ): boolean {
    if (!antes) return true;
    return campos.some((campo) => {
      /*
       * `??` y no `||`: una cadena vacía y un nulo son valores distintos en la
       * base, y confundirlos dejaría sin corregir una fila que sí difiere. Lo
       * que sí hace falta es que `undefined` y `null` cuenten como lo mismo,
       * porque la columna nula llega de una forma y el candidato la arma de la
       * otra.
       */
      return (antes[campo] ?? null) !== (ahora[campo] ?? null);
    });
  }

  private static readonly CAMPOS_PAIS: (keyof Pais)[] = [
    "nombre",
    "codigo",
    "codigoIso2",
    "codigoIso3",
    "lada",
    "moneda",
    "esOficial",
    "activo",
  ];

  private static readonly CAMPOS_ESTADO: (keyof Estado)[] = [
    "paisId",
    "nombre",
    "codigo",
    "tipo",
    "esOficial",
    "activo",
  ];

  async sincronizar() {
    const countries = Country.getAllCountries();
    const enEspanol = this.nombresEnEspanol();
    const existentes = await this.paises.find();
    const porCodigo = new Map(
      existentes.map((pais) => [pais.codigoIso2 || pais.codigo, pais]),
    );

    const paisesAEscribir: Pais[] = [];
    const paisPorCodigo = new Map<string, Pais>();
    for (const country of countries) {
      const antes = porCodigo.get(country.isoCode);
      const candidato = this.paises.create({
        ...antes,
        nombre: enEspanol(country.isoCode, country.name),
        codigo: country.isoCode,
        codigoIso2: country.isoCode,
        codigoIso3: null,
        lada: country.phonecode?.slice(0, 10) || null,
        moneda: country.currency?.slice(0, 3) || null,
        esOficial: true,
        activo: true,
      });
      paisPorCodigo.set(country.isoCode, candidato);
      if (
        this.cambio(antes, candidato, CatalogosGeograficosService.CAMPOS_PAIS)
      )
        paisesAEscribir.push(candidato);
    }
    /*
     * Sólo lo que cambió. `save()` le pone el id a las filas nuevas sobre el
     * mismo objeto que quedó en el mapa, así que las subdivisiones de abajo
     * encuentran su `paisId` ya asignado.
     */
    if (paisesAEscribir.length)
      await this.paises.save(paisesAEscribir, { chunk: 500 });

    const estadosExistentes = await this.estados.find();
    const estadoPorClave = new Map(
      estadosExistentes
        .filter((estado) => estado.paisId && estado.codigo)
        .map((estado) => [`${estado.paisId}|${estado.codigo}`, estado]),
    );
    const estadosAEscribir: Estado[] = [];
    let totalEstados = 0;
    for (const country of countries) {
      const pais = paisPorCodigo.get(country.isoCode)!;
      for (const subdivision of State.getStatesOfCountry(country.isoCode)) {
        /*
         * El mismo `codigo` recortado se usa para buscar y para guardar. Antes
         * la búsqueda usaba el `isoCode` entero y la escritura su recorte a
         * diez caracteres: hoy ninguna subdivisión pasa de cinco, así que no
         * mordía, pero bastaba una más larga para que la fila no se
         * reconociera nunca y se intentara insertar en cada arranque.
         */
        const codigo = subdivision.isoCode?.slice(0, 10) || null;
        const antes = estadoPorClave.get(`${pais.id}|${codigo}`);
        const candidato = this.estados.create({
          ...antes,
          paisId: pais.id,
          nombre: subdivision.name,
          codigo,
          tipo: null,
          esOficial: true,
          activo: true,
        });
        totalEstados++;
        if (
          this.cambio(
            antes,
            candidato,
            CatalogosGeograficosService.CAMPOS_ESTADO,
          )
        )
          estadosAEscribir.push(candidato);
      }
    }
    /*
     * El lote era de 100 por un límite de SQL Server —2,100 parámetros por
     * sentencia— que esta instalación ya no tiene: corre sobre PostgreSQL,
     * donde el techo son 65,535. Con seis columnas, 500 filas son 3,000
     * parámetros. Y en un arranque normal esta lista va vacía y no se parte en
     * nada.
     */
    if (estadosAEscribir.length)
      await this.estados.save(estadosAEscribir, { chunk: 500 });

    const escrito = paisesAEscribir.length + estadosAEscribir.length;
    this.logger.log(
      escrito === 0
        ? `Catálogo geográfico listo: ${countries.length} países y ${totalEstados} subdivisiones, sin cambios.`
        : `Catálogo geográfico listo: ${countries.length} países y ${totalEstados} subdivisiones ` +
            `(escritas ${paisesAEscribir.length} y ${estadosAEscribir.length}).`,
    );
    return {
      paises: countries.length,
      estados: totalEstados,
      paisesEscritos: paisesAEscribir.length,
      estadosEscritos: estadosAEscribir.length,
    };
  }
}
