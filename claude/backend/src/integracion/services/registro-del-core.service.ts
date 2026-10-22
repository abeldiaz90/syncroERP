import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { cifrarParaElCore, descifrarDelCore } from './la-clave-del-core';

/**
 * ============================================================================
 * El registro de inquilinos del core
 * ----------------------------------------------------------------------------
 * La base maestra de Fineract —`tenants` y `tenant_server_connections`— es
 * donde el propio core anota qué instituciones conoce y de qué servidor saca
 * los datos de cada una.
 *
 * El ERP la lee para no inventar inquilinos, y desde hoy también escribe en
 * ella cuando la base la pone el cliente. Las dos cosas pasan por aquí para que
 * haya UN sitio que sepa dónde está ese registro y cómo se le habla.
 *
 * Se conecta con su propia conexión y no con la del ERP: son dos bases
 * distintas y el ERP no administra el core, sólo necesita que exista lo que
 * dice existir.
 * ============================================================================
 */
@Injectable()
export class RegistroDelCoreService {
  private readonly logger = new Logger(RegistroDelCoreService.name);
  private conexion: DataSource | null = null;

  private async abrir(): Promise<DataSource> {
    if (this.conexion?.isInitialized) return this.conexion;

    const url = (process.env.FINERACT_TENANTS_DB_URL ?? '').trim();
    if (!url) {
      throw new BadRequestException(
        'Falta FINERACT_TENANTS_DB_URL: sin acceso al registro de inquilinos del core no se puede ' +
          'comprobar que un inquilino exista, y aceptar cualquiera produce empresas que se ven ' +
          'correctas y comparten cartera.',
      );
    }

    this.conexion = new DataSource({
      type: 'postgres',
      url,
      synchronize: false,
      logging: false,
      extra: { max: 2 },
    });
    await this.conexion.initialize();
    return this.conexion;
  }

  /** Identificadores que el core reconoce, tal como los tiene anotados. */
  async tenants(): Promise<string[]> {
    const ds = await this.abrir();
    const filas: { identifier: string }[] = await ds.query(
      'SELECT identifier FROM tenants ORDER BY id',
    );
    return filas.map((f) => String(f.identifier).trim().toLowerCase()).filter(Boolean);
  }

  /**
   * Anota un inquilino nuevo que vive en la base del cliente.
   *
   * ── Por qué la fila de conexión se COPIA ─────────────────────────────────
   * `tenant_server_connections` lleva columnas que cambian entre versiones del
   * core: el tamaño del pool, los reintentos, los tiempos de espera, las de
   * sólo lectura. Una fila escrita a mano con la mitad de las columnas produce
   * un inquilino que arranca y se porta raro bajo carga, y eso se descubre el
   * día que el cliente tiene gente dentro.
   *
   * Así que se toma la fila de un inquilino que YA funciona en esta
   * instalación y se le cambia únicamente de dónde salen los datos. Lo que no
   * sabemos, lo heredamos de lo que ya va bien.
   *
   * Si no hay ninguna fila de la que copiar, se para: una instalación sin un
   * solo inquilino sano no es el sitio donde improvisar el primero.
   */
  async registrarInquilino(datos: {
    identificador: string;
    nombre: string;
    servidor: string;
    puerto: number;
    baseDatos: string;
    usuario: string;
    clave: string;
    parametros?: string | null;
  }): Promise<void> {
    /*
     * La contraseña maestra PRIMERO, antes de abrir nada: es lo único que se
     * puede comprobar sin tocar la base, y si falta no hay nada que anotar.
     */
    const maestra = this.contrasenaMaestra();
    const ds = await this.abrir();

    const [yaEsta] = await ds.query(
      'SELECT id FROM tenants WHERE lower(identifier) = lower($1) LIMIT 1',
      [datos.identificador],
    );
    if (yaEsta) {
      throw new ConflictException(
        `El core ya conoce un inquilino «${datos.identificador}». Dos no pueden llamarse igual, y renombrar el de dentro no es cosa del ERP.`,
      );
    }

    const [molde] = await ds.query(
      `SELECT * FROM tenant_server_connections
        WHERE id IN (SELECT oltp_id FROM tenants)
        ORDER BY id
        LIMIT 1`,
    );
    if (!molde) {
      throw new ConflictException(
        'No hay en el core ninguna conexión de inquilino de la que copiar los ajustes. ' +
          'Una instalación sin un solo inquilino sano no es el sitio donde improvisar el primero.',
      );
    }

    /*
     * Se copian TODAS las columnas del molde menos la llave, y se pisan las
     * seis que describen de dónde salen los datos. Así una columna que este
     * core tenga y nosotros no conozcamos viaja igual, con el valor que ya
     * funciona.
     */
    const columnas = Object.keys(molde).filter((c) => c !== 'id');
    const valores: Record<string, unknown> = { ...molde };
    delete valores.id;

    const pisar: Record<string, unknown> = {
      schema_server: datos.servidor,
      schema_server_port: String(datos.puerto),
      schema_name: datos.baseDatos,
      schema_username: datos.usuario,
      /*
       * CIFRADA, no en claro. Ver `la-clave-del-core.ts`: esta columna la
       * descifra el core al arrancar, y una clave en claro no tumba a este
       * inquilino sino al core entero. Pasó el 21-oct-2026.
       */
      schema_password: cifrarParaElCore(maestra, datos.clave),
      schema_connection_parameters: datos.parametros ?? molde.schema_connection_parameters ?? null,
      /*
       * Las de sólo lectura apuntan al mismo sitio: el core las usa para los
       * informes, y dejarlas apuntando al molde haría que los informes de este
       * cliente leyeran la base de OTRO. Es el peor error posible aquí, y sería
       * silencioso.
       */
      readonly_schema_server: datos.servidor,
      readonly_schema_server_port: String(datos.puerto),
      readonly_schema_name: datos.baseDatos,
      readonly_schema_username: datos.usuario,
      readonly_schema_password: cifrarParaElCore(maestra, datos.clave),
    };
    for (const [columna, valor] of Object.entries(pisar)) {
      if (columna in valores) valores[columna] = valor;
    }

    const listaColumnas = columnas.map((c) => `"${c}"`).join(', ');
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
    const parametros = columnas.map((c) => valores[c]);

    await ds.transaction(async (em) => {
      const [conexionNueva] = await em.query(
        `INSERT INTO tenant_server_connections (${listaColumnas}) VALUES (${marcadores}) RETURNING id`,
        parametros,
      );
      /*
       * ── SE COMPRUEBA LO QUE SE ACABA DE ESCRIBIR ───────────────────────
       * Una contraseña maestra equivocada produce un sobre perfectamente
       * válido que el core no puede abrir. Sin esta vuelta, eso se descubre
       * en el siguiente arranque —con el core caído y todas las
       * instituciones dentro— y no aquí, donde todavía se puede deshacer.
       *
       * Va DENTRO de la transacción: si no cuadra, no queda renglón.
       */
      const [escrito] = await em.query(
        'SELECT schema_password, readonly_schema_password FROM tenant_server_connections WHERE id = $1',
        [conexionNueva.id],
      );
      for (const columna of ['schema_password', 'readonly_schema_password'] as const) {
        let devuelta: string;
        try {
          devuelta = descifrarDelCore(maestra, String(escrito?.[columna] ?? ''));
        } catch {
          throw new ConflictException(
            `La clave quedó escrita en \`${columna}\` de una forma que el core no puede abrir. ` +
              'Casi siempre es la contraseña maestra: `FINERACT_TENANTS_MASTER_PASSWORD` tiene que ser ' +
              'la misma que `fineract.tenant.master-password` del core. No se anotó nada.',
          );
        }
        if (devuelta !== datos.clave) {
          throw new ConflictException(
            `Lo que el core leería de \`${columna}\` no es la clave que se capturó. No se anotó nada.`,
          );
        }
      }

      await em.query(
        `INSERT INTO tenants (identifier, name, timezone_id, oltp_id, report_id)
         VALUES ($1, $2, $3, $4, $4)`,
        [
          datos.identificador,
          datos.nombre.slice(0, 100),
          'America/Mexico_City',
          conexionNueva.id,
        ],
      );
    });

    this.logger.log(
      `Inquilino «${datos.identificador}» anotado en el registro del core, apuntando a la base del cliente.`,
    );
  }

  /**
   * Reescribe la clave de un inquilino que YA está anotado en el core.
   *
   * Existe por un caso muy concreto y muy caro: un renglón escrito antes de
   * que esto cifrara, que el core no puede abrir y que le impide arrancar. Sin
   * esta puerta, repararlo obliga a entrar a mano a la base maestra del core,
   * que es justo lo que `RegistroDelCoreService` viene a evitar.
   *
   * NO CAMBIA A DÓNDE APUNTA el inquilino: exige que el servidor, el puerto y
   * la base del renglón sean los que el ERP tiene declarados y, si no
   * coinciden, se niega. Mudar un inquilino de servidor es una migración, con
   * su ventana y su respaldo, y no una pantalla de alta.
   */
  async reescribirClaveDelInquilino(datos: {
    identificador: string;
    servidor: string;
    puerto: number;
    baseDatos: string;
    usuario: string;
    clave: string;
  }): Promise<void> {
    const maestra = this.contrasenaMaestra();
    const ds = await this.abrir();

    const [conexion] = await ds.query(
      `SELECT c.id, c.schema_server, c.schema_server_port, c.schema_name
         FROM tenant_server_connections c
         JOIN tenants t ON t.oltp_id = c.id
        WHERE lower(t.identifier) = lower($1)
        LIMIT 1`,
      [datos.identificador],
    );
    if (!conexion) {
      throw new ConflictException(
        `El core no tiene anotado ningún inquilino «${datos.identificador}» que reparar.`,
      );
    }

    const mismoSitio =
      String(conexion.schema_server) === datos.servidor &&
      String(conexion.schema_server_port) === String(datos.puerto) &&
      String(conexion.schema_name) === datos.baseDatos;
    if (!mismoSitio) {
      throw new ConflictException(
        `El renglón de «${datos.identificador}» en el core apunta a otro sitio que el que ` +
          'el ERP tiene declarado. Reescribirle la clave sería tocar un inquilino que no es ' +
          'éste; mudarlo de servidor es una migración, no un arreglo de pantalla.',
      );
    }

    const sobre = cifrarParaElCore(maestra, datos.clave);
    await ds.transaction(async (em) => {
      await em.query(
        `UPDATE tenant_server_connections
            SET schema_username = $2, schema_password = $3,
                readonly_schema_username = $2, readonly_schema_password = $3
          WHERE id = $1`,
        [conexion.id, datos.usuario, sobre],
      );
      /* La misma vuelta de comprobación que en el alta, y por la misma razón. */
      const [escrito] = await em.query(
        'SELECT schema_password, readonly_schema_password FROM tenant_server_connections WHERE id = $1',
        [conexion.id],
      );
      for (const columna of ['schema_password', 'readonly_schema_password'] as const) {
        let devuelta: string;
        try {
          devuelta = descifrarDelCore(maestra, String(escrito?.[columna] ?? ''));
        } catch {
          throw new ConflictException(
            `La clave quedó escrita en \`${columna}\` de una forma que el core no puede abrir. ` +
              'Comprueba que `FINERACT_TENANTS_MASTER_PASSWORD` es la del core. No se cambió nada.',
          );
        }
        if (devuelta !== datos.clave) {
          throw new ConflictException(
            `Lo que el core leería de \`${columna}\` no es la clave capturada. No se cambió nada.`,
          );
        }
      }
    });

    this.logger.log(
      `Clave del inquilino «${datos.identificador}» reescrita cifrada en el registro del core.`,
    );
  }

  /**
   * La contraseña maestra con la que el core cifra y descifra las claves de
   * sus inquilinos.
   *
   * NO TIENE VALOR POR OMISIÓN. El core sí lo tiene —`fineract` si nadie dice
   * otra cosa— y copiarlo aquí significaría que una instalación que SÍ
   * cambió la suya escribiría renglones ilegibles sin que nadie se entere
   * hasta el siguiente arranque, que es el fallo que esto viene a impedir.
   * Si no está declarada, no se anota: es preferible no poder dar de alta un
   * inquilino on-premise a dejar el core sin arrancar.
   */
  private contrasenaMaestra(): string {
    const maestra = (process.env.FINERACT_TENANTS_MASTER_PASSWORD ?? '').trim();
    if (!maestra) {
      throw new BadRequestException(
        'Falta FINERACT_TENANTS_MASTER_PASSWORD. El core guarda la clave de cada inquilino cifrada ' +
          'con su contraseña maestra y la descifra al arrancar: sin ella, el renglón quedaría ' +
          'ilegible y el core no levantaría —ni para esta institución ni para ninguna otra—. ' +
          'Tiene que valer lo mismo que `fineract.tenant.master-password` del core.',
      );
    }
    return maestra;
  }
}
