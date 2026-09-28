import { EntradaIndice } from './markdown';

/**
 * ============================================================================
 * La hoja impresa
 * ----------------------------------------------------------------------------
 * El PDF no es una captura de la pantalla: es el mismo texto compuesto para
 * papel. Cambia lo que tiene que cambiar —tipografía con serifa, medidas en
 * puntos, tablas que no se parten a mitad de fila, encabezados que no quedan
 * huérfanos al pie de una página— y nada más.
 *
 * Se escribe aquí, junto al renderizador, y no en el frontend, porque el PDF lo
 * produce el servidor: si viviera en la pantalla, imprimir sin abrir la
 * pantalla daría un documento distinto.
 * ============================================================================
 */

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function paginaImprimible(datos: {
  titulo: string;
  actualizado: Date;
  html: string;
  indice: EntradaIndice[];
}): string {
  const contenido = datos.indice
    .filter((e) => e.nivel === 2)
    .map((e) => `<li>${escapar(e.texto)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapar(datos.titulo)}</title>
<style>
  @page { size: Letter; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10.5pt; line-height: 1.55; color: #16181d; margin: 0;
  }
  .portada { page-break-after: always; padding-top: 22vh; }
  .portada .marca { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt;
    letter-spacing: .18em; text-transform: uppercase; color: #6b7280; }
  .portada h1 { font-size: 28pt; line-height: 1.15; margin: .4em 0 .2em; }
  .portada .fecha { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #6b7280; }
  .portada ul { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt;
    color: #374151; margin-top: 2.4em; padding-left: 1.1em; }
  .portada ul li { margin: .3em 0; }

  h1, h2, h3, h4 { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.25;
    page-break-after: avoid; break-after: avoid; }
  h1 { font-size: 19pt; margin: 1.6em 0 .5em; }
  h2 { font-size: 14.5pt; margin: 1.5em 0 .45em; padding-bottom: .25em;
    border-bottom: 1px solid #d8dbe0; }
  h3 { font-size: 11.5pt; margin: 1.2em 0 .35em; }
  h4 { font-size: 10.5pt; margin: 1em 0 .3em; color: #374151; }
  p { margin: .55em 0; orphans: 2; widows: 2; }
  ul, ol { margin: .5em 0; padding-left: 1.35em; }
  li { margin: .22em 0; }
  code { font-family: 'Consolas', 'Courier New', monospace; font-size: .9em;
    background: #f1f2f4; padding: .08em .3em; border-radius: 3px; }
  pre { background: #f1f2f4; padding: .7em .9em; border-radius: 5px;
    page-break-inside: avoid; overflow-wrap: anywhere; }
  pre code { background: none; padding: 0; font-size: .85em; }
  blockquote { margin: .8em 0; padding: .1em 0 .1em 1em;
    border-left: 3px solid #b9bec7; color: #3b4048; page-break-inside: avoid; }
  hr { border: 0; border-top: 1px solid #d8dbe0; margin: 1.6em 0; }
  .tabla { page-break-inside: avoid; margin: .8em 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt;
    font-family: 'Segoe UI', Arial, sans-serif; }
  th, td { border: 1px solid #d8dbe0; padding: .38em .55em; text-align: left;
    vertical-align: top; }
  th { background: #f1f2f4; font-weight: 600; }
  tr { page-break-inside: avoid; }
  .casilla { font-family: 'Segoe UI Symbol', sans-serif; }
</style></head>
<body>
  <section class="portada">
    <div class="marca">SyncroERP · Documentación</div>
    <h1>${escapar(datos.titulo)}</h1>
    <div class="fecha">Actualizado el ${FECHA.format(datos.actualizado)}</div>
    ${contenido ? `<ul>${contenido}</ul>` : ''}
  </section>
  ${datos.html}
</body></html>`;
}
