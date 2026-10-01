/**
 * ============================================================================
 * Lo que se publica, y a quién
 * ----------------------------------------------------------------------------
 * Dos cosas que ninguna prueba de unidad corriente cubriría:
 *
 * 1. **El renderizador se mide contra los documentos de verdad.** No contra
 *    ejemplos escritos aquí, que es la trampa en la que ya caí esta semana: una
 *    prueba que medía una copia del código en el propio archivo de prueba daba
 *    verde con el servicio roto. Aquí se leen los seis archivos de `docs/` y se
 *    comprueba lo que salió. El día que un documento use algo que el
 *    renderizador no entiende, esto se pone rojo.
 *
 * 2. **Quién ve qué.** Los cuatro documentos técnicos nombran variables de
 *    entorno, claves de servicio y lo que todavía no está probado. Que un
 *    usuario de una empresa cliente no los alcance no puede depender de que
 *    nadie escriba la URL a mano.
 * ============================================================================
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { DOCUMENTOS_PUBLICADOS } from './documentacion.catalogo';
import { DocumentacionService } from './documentacion.service';
import { renderizar } from './markdown';

const CARPETA = [
  resolve(__dirname, '..', '..', '..', 'docs'),
  resolve(__dirname, '..', '..', '..', '..', 'docs'),
  resolve(process.cwd(), '..', '..', 'docs'),
  resolve(process.cwd(), '..', 'docs'),
].find((c) => existsSync(join(c, '03-manual-por-rol.md')));

describe('lo que se publica, y a quién', () => {
  const servicio = new DocumentacionService();

  describe('el catálogo', () => {
    it('no repite identificadores ni archivos', () => {
      const ids = DOCUMENTOS_PUBLICADOS.map((d) => d.id);
      const archivos = DOCUMENTOS_PUBLICADOS.map((d) => d.archivo);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(archivos).size).toBe(archivos.length);
    });

    it('el identificador de la URL nunca se usa para construir una ruta', () => {
      /*
       * Es lo que impide `GET /documentacion/..%2f..%2f.env`. El id se busca en
       * la tabla; el nombre de archivo sale de la tabla, no de la petición. Si
       * alguien cambia eso, esta prueba no lo ve —pero el `join` con `doc.archivo`
       * sí está a la vista aquí, y esa es la línea que hay que vigilar.
       */
      const fuente = readFileSync(join(__dirname, 'documentacion.service.ts'), 'utf8');
      expect(fuente).toMatch(/join\(ruta,\s*doc\.archivo\)/);
      expect(fuente).not.toMatch(/join\([^)]*\bid\b[^)]*\)/);
    });

    it('los cuatro documentos técnicos están marcados como restringidos', () => {
      const restringidos = DOCUMENTOS_PUBLICADOS.filter((d) => d.restringido).map(
        (d) => d.id,
      );
      expect(restringidos.sort()).toEqual(
        ['aprovisionamiento', 'arquitectura', 'instalacion', 'limites-conocidos'].sort(),
      );
    });
  });

  describe('quién ve qué', () => {
    it('un usuario corriente ve exactamente los no restringidos, en su orden', () => {
      /*
       * Antes esta prueba y la de abajo llevaban la lista y el número escritos a
       * mano —«los dos manuales», «los seis»—, así que publicar un documento
       * nuevo las ponía rojas siendo correcto el cambio. Una prueba que hay que
       * editar cada vez que el sistema crece bien enseña a editar pruebas en vez
       * de a pensar.
       *
       * Lo que de verdad se quiere fijar es la REGLA: quien no es administrador
       * ve todo lo no restringido y nada más, en el orden del catálogo.
       */
      const esperados = [...DOCUMENTOS_PUBLICADOS]
        .filter((d) => !d.restringido)
        .sort((a, b) => a.orden - b.orden)
        .map((d) => d.id);
      const { documentos } = servicio.listar('contador');
      expect(documentos.map((d) => d.id)).toEqual(esperados);
      expect(esperados.length).toBeGreaterThan(0);
    });

    it('el administrador los ve todos', () => {
      const { documentos } = servicio.listar('administrador');
      expect(documentos).toHaveLength(DOCUMENTOS_PUBLICADOS.length);
      expect(documentos.some((d) => d.restringido)).toBe(true);
    });

    it('sin rol no se ve la documentación técnica', () => {
      const { documentos } = servicio.listar(undefined);
      expect(documentos.every((d) => !d.restringido)).toBe(true);
    });

    it('escribir la dirección a mano tampoco abre un documento técnico', () => {
      expect(() => servicio.leer('instalacion', 'contador')).toThrow(ForbiddenException);
      expect(() => servicio.leer('limites-conocidos', 'tesoreria')).toThrow(
        ForbiddenException,
      );
    });

    it('y la negativa dice por qué, no un «no autorizado» a secas', () => {
      expect(() => servicio.leer('instalacion', 'contador')).toThrow(
        /variables de entorno|claves de servicio/i,
      );
    });

    it('un documento que no existe se dice como tal', () => {
      expect(() => servicio.leer('inventado', 'administrador')).toThrow(NotFoundException);
    });

    it('cuando falta la carpeta, la lista dice dónde se buscó', () => {
      /*
       * Devolver la lista vacía haría creer que no hay documentación, cuando lo
       * que hay es una carpeta mal puesta. Es la diferencia entre cinco minutos
       * y una tarde.
       */
      const suelto = new DocumentacionService();
      jest
        .spyOn(suelto, 'carpeta')
        .mockReturnValue({ ruta: null, buscadas: ['/una/ruta', '/otra/ruta'] });
      const r = suelto.listar('administrador');
      expect(r.disponible).toBe(false);
      expect(r.motivo).toMatch(/\/una\/ruta/);
      expect(r.motivo).toMatch(/DOCUMENTACION_DIR/);
    });
  });

  describe('los documentos de verdad se renderizan enteros', () => {
    if (!CARPETA) {
      it('la carpeta docs/ tiene que estar junto al backend', () => {
        throw new Error(
          'No se encontró la carpeta docs/. Esta prueba mide los documentos reales, ' +
            'no ejemplos: sin ellos no demuestra nada.',
        );
      });
      return;
    }

    for (const doc of DOCUMENTOS_PUBLICADOS) {
      it(`«${doc.titulo}» sale sin restos de Markdown`, () => {
        const markdown = readFileSync(join(CARPETA, doc.archivo), 'utf8');
        const { html, indice } = renderizar(markdown, []);

        // Salió algo, y con estructura.
        expect(html.length).toBeGreaterThan(2000);
        expect(indice.length).toBeGreaterThan(2);

        // Y no quedó sintaxis sin reconocer suelta en el texto.
        const texto = html.replace(/<[^>]+>/g, '');
        expect(texto).not.toMatch(/\*\*/); // negrita sin cerrar
        expect(texto).not.toMatch(/^\s*\|.*\|\s*$/m); // fila de tabla sin convertir
        expect(texto).not.toMatch(/^\s*#{1,6}\s/m); // encabezado sin convertir
        expect(texto).not.toMatch(/^\s*[-*]\s+\S/m); // viñeta sin convertir
        expect(texto).not.toMatch(/```/); // bloque de código sin convertir
      });
    }

    it('ninguna tabla pierde columnas por una barra dentro de `código`', () => {
      /*
       * `| `A | B` |` es UNA celda. Partir por toda barra la convertía en dos y
       * desplazaba la fila entera, en silencio y con las cabeceras intactas: el
       * lector ve una tabla bien formada que dice otra cosa.
       */
      const { html } = renderizar(
        ['| Variable | Valores |', '|---|---|', "| `MODO` | `A` · `B` |"].join('\n'),
        [],
      );
      expect((html.match(/<td>/g) ?? []).length).toBe(2);

      const conBarra = renderizar(
        ['| Campo | Tipo |', '|---|---|', "| `x` | `'a' | 'b'` |"].join('\n'),
        [],
      );
      expect((conBarra.html.match(/<td>/g) ?? []).length).toBe(2);
    });

    it('un enlace a un documento que el lector no puede abrir no queda como enlace', () => {
      const { html } = renderizar(
        'Está en [Límites conocidos](06-limites-conocidos.md).',
        [
          {
            archivo: '06-limites-conocidos.md',
            href: '/dashboard/ayuda/limites-conocidos',
            titulo: 'Límites conocidos',
            visible: false,
          },
        ],
      );
      expect(html).not.toMatch(/<a /);
      expect(html).toMatch(/Límites conocidos/);
    });

    it('y si puede abrirlo, lleva a la pantalla de la ayuda', () => {
      const { html } = renderizar('Ver [Arquitectura](02-arquitectura.md).', [
        {
          archivo: '02-arquitectura.md',
          href: '/dashboard/ayuda/arquitectura',
          titulo: 'Arquitectura',
          visible: true,
        },
      ]);
      expect(html).toMatch(/href="\/dashboard\/ayuda\/arquitectura"/);
    });

    it('un destino desconocido no se convierte en un enlace roto', () => {
      const { html } = renderizar('Ver [algo](99-que-no-existe.md).', []);
      expect(html).not.toMatch(/<a /);
      expect(html).toMatch(/algo/);
    });

    it('el HTML que venga dentro del texto sale como texto', () => {
      const { html } = renderizar('Cuidado con <script>alert(1)</script> aquí.', []);
      expect(html).not.toMatch(/<script/);
      expect(html).toMatch(/&lt;script&gt;/);
    });

    it('el guion bajo no es cursiva: APROVISIONAMIENTO_TOKEN se lee entero', () => {
      const { html } = renderizar('La clave APROVISIONAMIENTO_TOKEN y _uat-tokens.json.', []);
      expect(html).not.toMatch(/<em>/);
      expect(html).toMatch(/APROVISIONAMIENTO_TOKEN/);
    });
  });

  describe('el PDF', () => {
    it('o sale un PDF de verdad, o la negativa dice cómo guardarlo igual', async () => {
      /*
       * Las dos ramas se comprueban, porque las dos ocurren: hay servidores
       * donde el Chromium de puppeteer no arranca. Lo que NO puede pasar es un
       * botón que falla sin decir nada, ni un archivo vacío que el navegador
       * descarga y no abre.
       */
      let salida: Buffer | null = null;
      let error: Error | null = null;
      try {
        salida = await servicio.pdf('manual-por-rol', 'administrador');
      } catch (e) {
        error = e as Error;
      }

      if (salida) {
        expect(salida.length).toBeGreaterThan(10_000);
        // La firma de un PDF, para no dar por bueno un archivo vacío.
        expect(salida.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      } else {
        expect(error?.message ?? '').toMatch(/Imprimir/i);
        expect(error?.message ?? '').toMatch(/Guardar como PDF/i);
      }
    }, 60000);

    it('un usuario corriente tampoco se descarga la documentación técnica', async () => {
      await expect(servicio.pdf('arquitectura', 'contador')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
