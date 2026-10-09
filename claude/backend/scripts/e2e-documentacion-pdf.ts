/**
 * ============================================================================
 * El PDF de la documentación, comprobado donde sí se puede
 * ----------------------------------------------------------------------------
 * La prueba del PDF acepta dos finales —un PDF de verdad, o una negativa que
 * explica cómo imprimirlo desde el navegador— porque los dos ocurren en
 * servidores reales. El problema es que bajo jest **siempre** sale el segundo:
 * puppeteer 25 es sólo ESM y el transformador de jest no lo puede cargar. Una
 * prueba que toma la rama de error en cada corrida no comprueba el PDF: da por
 * bueno el mensaje de disculpa.
 *
 * Este guion corre en node de verdad, donde `require` de ESM sí funciona, y
 * **exige** el PDF: si no sale, sale en rojo.
 *
 *     npm run documentacion:pdf
 *
 * No toca la base de datos. Lee los documentos de `syncroERP/docs/` y arma el
 * PDF de cada uno con el navegador que resuelva `elegirNavegador`, diciendo
 * cuál eligió —que es justo lo que no se veía.
 * ============================================================================
 */
import { DocumentacionService } from '../src/documentacion/documentacion.service';
import { DOCUMENTOS_PUBLICADOS } from '../src/documentacion/documentacion.catalogo';
import {
  cargarPuppeteer,
  elegirNavegador,
} from '../src/documentacion/navegador-para-el-pdf';

const MINIMO_BYTES = 10_000;

async function main(): Promise<void> {
  console.log('── PDF de la documentación ───────────────────────────────');

  const modulo = cargarPuppeteer();
  console.log(
    `  puppeteer cargado: ${modulo ? 'sí' : 'NO — se intentará igual'}`,
  );

  const elegido = await elegirNavegador(modulo);
  console.log(
    `  navegador elegido: ${elegido ?? 'el propio de puppeteer'}`,
  );

  const servicio = new DocumentacionService();
  const fallos: string[] = [];

  for (const doc of DOCUMENTOS_PUBLICADOS) {
    process.stdout.write(`  ${doc.id.padEnd(34, '.')} `);
    try {
      const pdf = await servicio.pdf(doc.id, 'administrador');
      const firma = pdf.subarray(0, 5).toString('latin1');
      if (firma !== '%PDF-') {
        fallos.push(`${doc.id}: lo devuelto no empieza con %PDF-`);
        console.log('MAL (no es un PDF)');
      } else if (pdf.length < MINIMO_BYTES) {
        fallos.push(`${doc.id}: ${pdf.length} bytes, demasiado poco`);
        console.log(`MAL (${pdf.length} bytes)`);
      } else {
        console.log(`ok (${Math.round(pdf.length / 1024)} KB)`);
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      fallos.push(`${doc.id}: ${motivo}`);
      console.log('MAL');
      console.log(`      ${motivo}`);
    }
  }

  /*
   * Dos a la vez. Es el caso que rompió el 9 de octubre: sin perfil propio,
   * el segundo navegador se encontraba el del primero todavía abierto. Uno
   * detrás de otro ya no basta para comprobarlo; hay que pisarlos.
   */
  process.stdout.write(`  ${'dos PDF a la vez'.padEnd(34, '.')} `);
  try {
    const [a, b] = await Promise.all([
      servicio.pdf('manual-por-rol', 'administrador'),
      servicio.pdf('compras-y-nomina', 'administrador'),
    ]);
    if (a.length < MINIMO_BYTES || b.length < MINIMO_BYTES) {
      fallos.push('dos a la vez: alguno salió demasiado corto');
      console.log('MAL');
    } else {
      console.log('ok (los dos)');
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    fallos.push(`dos a la vez: ${motivo}`);
    console.log('MAL');
    console.log(`      ${motivo}`);
  }

  console.log('──────────────────────────────────────────────────────────');
  if (fallos.length) {
    console.error(`  ${fallos.length} documento(s) sin PDF:`);
    for (const f of fallos) console.error(`   · ${f}`);
    console.error(
      '\n  Si falta el navegador: `npx puppeteer browsers install chrome`,\n' +
        '  o la ruta de uno instalado en DOCUMENTACION_NAVEGADOR.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  ${DOCUMENTOS_PUBLICADOS.length} documentos, todos en PDF.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
