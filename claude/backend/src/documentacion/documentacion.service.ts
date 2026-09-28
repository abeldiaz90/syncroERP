import { Injectable, Logger, NotFoundException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { esRolAdministrador } from '../iam/utils/roles.util';
import {
  DOCUMENTOS_PUBLICADOS,
  DocumentoPublicado,
  documentoDe,
} from './documentacion.catalogo';
import { EnlaceInterno, renderizar } from './markdown';
import { paginaImprimible } from './plantilla-impresion';

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
    return { doc, markdown: readFileSync(archivo, 'utf8'), archivo };
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
    const { doc, markdown, archivo } = this.fuente(id, rol);
    const { html, indice } = renderizar(markdown, this.enlacesPara(rol));
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
   * Por omisión, el Chromium que puppeteer se descarga al instalar. Pero en un
   * servidor donde ese paso no corrió —pasa: hay despliegues con
   * `PUPPETEER_SKIP_DOWNLOAD`— el PDF fallaría teniendo un Chrome instalado a
   * un palmo. Se busca, en orden, y sin instalar nada:
   *
   *   1. `DOCUMENTACION_NAVEGADOR`, si alguien quiere mandar sobre esto.
   *   2. `PUPPETEER_EXECUTABLE_PATH`, la variable que ya entiende puppeteer.
   *   3. Nada: que decida puppeteer con lo que trae.
   *   4. Las rutas habituales de Chrome y Edge, si lo de puppeteer no está.
   *
   * Devuelve `undefined` para dejar que puppeteer use el suyo, que es lo
   * correcto cuando existe.
   */
  private navegadorInstalado(): string | undefined {
    const declarado =
      process.env.DOCUMENTACION_NAVEGADOR?.trim() ||
      process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    if (declarado) return declarado;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const p = require('puppeteer');
      if (typeof p.executablePath === 'function' && existsSync(p.executablePath())) {
        return undefined; // el suyo está: que lo use
      }
    } catch {
      /* se sigue con las rutas conocidas */
    }

    const conocidas = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ];
    return conocidas.find((c) => existsSync(c));
  }

  /**
   * El PDF se arma con el navegador que ya trae el proyecto. Si no se puede
   * lanzar —falta el Chromium, o el servidor no lo permite— **no se devuelve un
   * archivo vacío ni un error genérico**: se dice que el PDF no se pudo generar
   * y por qué, para que la pantalla ofrezca imprimir desde el navegador, que es
   * la salida que siempre existe.
   */
  async pdf(id: string, rol: string | undefined): Promise<Buffer> {
    const { doc, markdown, archivo } = this.fuente(id, rol);
    // En el PDF nada es navegable: los enlaces internos van como texto.
    const { html, indice } = renderizar(
      markdown,
      DOCUMENTOS_PUBLICADOS.map((d) => ({
        archivo: d.archivo,
        href: '',
        titulo: d.titulo,
        visible: false,
      })),
    );
    const pagina = paginaImprimible({
      titulo: doc.titulo,
      actualizado: statSync(archivo).mtime,
      html,
      indice,
    });

    let navegador: { newPage: () => Promise<unknown>; close: () => Promise<void> } | null =
      null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const puppeteer = require('puppeteer');
      const ejecutable = this.navegadorInstalado();
      navegador = await puppeteer.launch({
        headless: true,
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
    }
  }
}
