import { Injectable, Logger, NotFoundException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { esRolAdministrador } from '../iam/utils/roles.util';
import {
  DOCUMENTOS_PUBLICADOS,
  DocumentoPublicado,
  documentoDe,
} from './documentacion.catalogo';
import {
  Capturas,
  EnlaceInterno,
  capturasQueNombra,
  esNombreDeCaptura,
  renderizar,
} from './markdown';
import { paginaImprimible } from './plantilla-impresion';
import { cargarPuppeteer, elegirNavegador } from './navegador-para-el-pdf';

/**
 * ============================================================================
 * La documentación, servida desde el propio ERP
 * ----------------------------------------------------------------------------
 * Los documentos viven en `syncroERP/docs/`, en el repositorio, y se leen de
 * ahí en cada petición. No hay copia dentro del backend a propósito: dos copias
 * del mismo texto divergen, y el día que alguien corrija una regla en el código
 * y en su documento, la pantalla seguiría enseñando la versión vieja.
 *
 * DÓNDE ESTÁ LA CARPETA
 *
 * Se prueban varias rutas porque el backend corre de dos formas —`nest start`
 * desde su carpeta y `node dist/main`— y la carpeta está dos niveles más
 * arriba. `DOCUMENTACION_DIR` manda sobre todas, para un despliegue que las
 * separe.
 *
 * Y si no se encuentra, **se dice en qué rutas se buscó**. Una lista vacía
 * haría creer que no hay documentación, cuando lo que hay es una carpeta mal
 * puesta: es la diferencia entre un problema de cinco minutos y una tarde.
 * ============================================================================
 */
@Injectable()
export class DocumentacionService {
  private readonly logger = new Logger(DocumentacionService.name);

  private candidatos(): string[] {
    const propuesto = process.env.DOCUMENTACION_DIR?.trim();
    const cwd = process.cwd();
    return [
      ...(propuesto ? [resolve(propuesto)] : []),
      resolve(cwd, '..', '..', 'docs'),
      resolve(cwd, '..', 'docs'),
      resolve(cwd, 'docs'),
      resolve(__dirname, '..', '..', '..', '..', 'docs'),
    ];
  }

  carpeta(): { ruta: string | null; buscadas: string[] } {
    const buscadas = this.candidatos();
    const ruta = buscadas.find((c) => existsSync(join(c, DOCUMENTOS_PUBLICADOS[0].archivo)));
    return { ruta: ruta ?? null, buscadas };
  }

  private puedeVer(doc: DocumentoPublicado, rol: string | undefined): boolean {
    return !doc.restringido || esRolAdministrador(rol);
  }

  /** El índice que ve quien pregunta: sólo lo que de verdad puede abrir. */
  listar(rol: string | undefined) {
    const { ruta, buscadas } = this.carpeta();
    const visibles = DOCUMENTOS_PUBLICADOS.filter((d) => this.puedeVer(d, rol))
      .slice()
      .sort((a, b) => a.orden - b.orden);

    return {
      disponible: ruta !== null,
      /*
       * Cuando falta la carpeta esto NO va vacío y en silencio: dice dónde se
       * buscó, que es lo único que le sirve a quien tiene que arreglarlo.
       */
      motivo:
        ruta === null
          ? 'No se encontró la carpeta de documentación. Se buscó en: ' +
            buscadas.join(' · ') +
            '. Se puede fijar con la variable DOCUMENTACION_DIR.'
          : undefined,
      documentos: visibles.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        resumen: d.resumen,
        restringido: d.restringido,
        actualizado: this.fechaDe(ruta, d),
      })),
    };
  }

  private fechaDe(carpeta: string | null, doc: DocumentoPublicado): string | null {
    if (!carpeta) return null;
    try {
      return statSync(join(carpeta, doc.archivo)).mtime.toISOString();
    } catch {
      return null;
    }
  }

  private fuente(id: string, rol: string | undefined) {
    const doc = documentoDe(id);
    if (!doc) throw new NotFoundException('Ese documento no existe.');
    if (!this.puedeVer(doc, rol)) {
      throw new ForbiddenException(
        `«${doc.titulo}» es documentación técnica de la instalación: nombra variables de ` +
          'entorno, claves de servicio y lo que todavía no está probado. Sólo la ve el ' +
          'administrador del sistema.',
      );
    }

    const { ruta, buscadas } = this.carpeta();
    if (!ruta) {
      throw new ServiceUnavailableException(
        'No se encontró la carpeta de documentación. Se buscó en: ' +
          buscadas.join(' · ') +
          '. Se puede fijar con la variable DOCUMENTACION_DIR.',
      );
    }

    const archivo = join(ruta, doc.archivo);
    if (!existsSync(archivo)) {
      throw new ServiceUnavailableException(
        `El documento «${doc.titulo}» está en el catálogo pero falta su archivo ${doc.archivo} en ${ruta}.`,
      );
    }
    return { doc, markdown: readFileSync(archivo, 'utf8'), archivo, carpeta: ruta };
  }

  /**
   * ==========================================================================
   * Las capturas viajan dentro del HTML, no por una URL
   * --------------------------------------------------------------------------
   * POR QUÉ NO UN `/documentacion/img/x.png`
   *
   * Porque un `<img src>` no lleva el token: el navegador pide la imagen por su
   * cuenta, sin el encabezado `Authorization` que pone `lib/api`. Un endpoint
   * para las capturas tendría que quedar abierto, y entonces las pantallas del
   * ERP de una empresa —con sus folios, sus clientes y sus importes— serían
   * públicas para quien adivine el nombre del archivo. No es un riesgo
   * teórico: las capturas son de pantallas con datos dentro.
   *
   * La alternativa era copiarlas al `public/` del frontend. Dos copias del
   * mismo archivo divergen, que es justo lo que este módulo evita con el texto.
   *
   * Así que van incrustadas en el HTML que ya está autenticado. Y de paso es lo
   * ÚNICO que funciona en el PDF: puppeteer recibe el HTML con `setContent`,
   * sin dirección base, así que una ruta relativa ahí no resuelve a nada y el
   * PDF saldría con los huecos de las figuras.
   *
   * El precio es el peso, y por eso está medido: `una-captura-que-se-promete-y-
   * no-esta.spec.ts` pone un techo por archivo y por documento. Un manual que
   * tarda en abrir no se lee.
   * ==========================================================================
   */
  private capturasDe(carpeta: string, markdown: string): Capturas {
    const mapa: Capturas = {};
    for (const nombre of capturasQueNombra(markdown)) {
      /* La forma se comprueba antes de tocar el disco: nunca se arma una ruta
       * con algo que no haya pasado por `esNombreDeCaptura`. */
      if (!esNombreDeCaptura(nombre)) continue;
      const archivo = join(carpeta, nombre);
      try {
        const bytes = readFileSync(archivo);
        const tipo = nombre.toLowerCase().endsWith('.png')
          ? 'image/png'
          : nombre.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        mapa[nombre] = `data:${tipo};base64,${bytes.toString('base64')}`;
      } catch {
        /*
         * No se pone nada: el renderizador pinta el recuadro de «falta la
         * captura», que es más útil que un hueco. Y se deja dicho en el
         * registro, porque en un servidor nadie lee los recuadros.
         */
        this.logger.warn(`El documento nombra la captura ${nombre} y no está en ${carpeta}.`);
      }
    }
    return mapa;
  }

  private enlacesPara(rol: string | undefined): EnlaceInterno[] {
    return DOCUMENTOS_PUBLICADOS.map((d) => ({
      archivo: d.archivo,
      href: `/dashboard/ayuda/${d.id}`,
      titulo: d.titulo,
      visible: this.puedeVer(d, rol),
    }));
  }

  leer(id: string, rol: string | undefined) {
    const { doc, markdown, archivo, carpeta } = this.fuente(id, rol);
    const { html, indice } = renderizar(
      markdown,
      this.enlacesPara(rol),
      this.capturasDe(carpeta, markdown),
    );
    return {
      id: doc.id,
      titulo: doc.titulo,
      resumen: doc.resumen,
      restringido: doc.restringido,
      actualizado: statSync(archivo).mtime.toISOString(),
      html,
      indice,
    };
  }

  /**
   * Qué navegador usa el PDF.
   *
   * La resolución vive en `navegador-para-el-pdf.ts`, aparte y pura, porque la
   * versión que estaba aquí tenía una rama que no se tomaba nunca y ninguna
   * prueba podía verlo. Ahí está contado el porqué.
   */
  private async navegadorInstalado(): Promise<string | undefined> {
    return elegirNavegador(cargarPuppeteer());
  }

  /**
   * El PDF se arma con el navegador que ya trae el proyecto. Si no se puede
   * lanzar —falta el Chromium, o el servidor no lo permite— **no se devuelve un
   * archivo vacío ni un error genérico**: se dice que el PDF no se pudo generar
   * y por qué, para que la pantalla ofrezca imprimir desde el navegador, que es
   * la salida que siempre existe.
   */
  async pdf(id: string, rol: string | undefined): Promise<Buffer> {
    const { doc, markdown, archivo, carpeta } = this.fuente(id, rol);
    // En el PDF nada es navegable: los enlaces internos van como texto.
    const { html, indice } = renderizar(
      markdown,
      DOCUMENTOS_PUBLICADOS.map((d) => ({
        archivo: d.archivo,
        href: '',
        titulo: d.titulo,
        visible: false,
      })),
      this.capturasDe(carpeta, markdown),
    );
    const pagina = paginaImprimible({
      titulo: doc.titulo,
      actualizado: statSync(archivo).mtime,
      html,
      indice,
    });

    let navegador: { newPage: () => Promise<unknown>; close: () => Promise<void> } | null =
      null;
    /*
     * ── Un perfil propio por PDF ──────────────────────────────────────────
     * Sin `userDataDir`, puppeteer se inventa un perfil temporal y lo borra al
     * cerrar. En Windows ese cierre es perezoso: el proceso suelta el archivo
     * después de que la promesa de `close()` ya volvió. Dos PDF seguidos —o
     * dos personas pulsando «PDF» a la vez— se encuentran con
     *
     *   The browser is already running for …puppeteer_dev_chrome_profile-…
     *   EBUSY: resource busy or locked, unlink …first_party_sets.db
     *
     * y el segundo no sale. Se vio en vivo el 9 de octubre: de siete
     * documentos salieron cuatro.
     *
     * Con un directorio propio por petición no hay nada que compartir, y el
     * borrado se intenta con reintentos y sin que su fallo estropee un PDF que
     * ya está hecho: un temporal que sobra es basura, no un error.
     */
    const perfil = mkdtempSync(join(tmpdir(), 'syncro-pdf-'));
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const puppeteer = require('puppeteer');
      const ejecutable = await this.navegadorInstalado();
      navegador = await puppeteer.launch({
        headless: true,
        userDataDir: perfil,
        ...(ejecutable ? { executablePath: ejecutable } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = (await navegador!.newPage()) as {
        setContent: (h: string, o: unknown) => Promise<void>;
        pdf: (o: unknown) => Promise<Buffer | Uint8Array>;
      };
      await page.setContent(pagina, { waitUntil: 'load' });
      const salida = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:8pt;color:#666;padding:0 16mm;' +
          'display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif">' +
          `<span>SyncroERP · ${doc.titulo.replace(/[<>&]/g, '')}</span>` +
          '<span class="pageNumber"></span>/<span class="totalPages"></span></div>',
      });
      return Buffer.from(salida);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      this.logger.error(`No se pudo generar el PDF de «${doc.titulo}»: ${motivo}`);
      throw new ServiceUnavailableException(
        'No se pudo generar el PDF en el servidor. Puedes guardarlo desde el navegador ' +
          'con «Imprimir → Guardar como PDF», que produce el mismo documento. ' +
          'Para que el servidor lo genere solo, falta un navegador: ' +
          '`npx puppeteer browsers install chrome`, o la ruta de uno ya instalado en ' +
          `DOCUMENTACION_NAVEGADOR. Motivo técnico: ${motivo}`,
      );
    } finally {
      if (navegador) await navegador.close().catch(() => undefined);
      try {
        rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        this.logger.warn(`No se pudo borrar el perfil temporal ${perfil}.`);
      }
    }
  }
}
