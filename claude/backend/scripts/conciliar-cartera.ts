/**
 * ============================================================================
 * SyncroERP · Conciliar la cartera contra el registro externo
 * ----------------------------------------------------------------------------
 * Compara los dos sistemas y enseña las diferencias. Es el instrumento que
 * decide si la integración está lista: la regla operativa es que una empresa no
 * pasa de SOMBRA a AUTORIDAD mientras haya discrepancias abiertas.
 *
 * Compara en dos niveles, y el segundo es el que importa:
 *
 *  · Por CLIENTE, saldo total. Barato y detecta lo grueso.
 *  · Por CRÉDITO, uno por uno. Dos errores que se cancelan —uno de más en un
 *    préstamo y uno de menos en otro— dan un total de cliente idéntico y
 *    perfecto. Sólo la pasada por crédito los ve.
 *
 * Además distingue lo que NO es un descuadre de importes, porque el remedio es
 * distinto: un crédito vivo aquí sin correspondencia allá (el hecho no llegó),
 * uno que allá ya no existe, y uno que aquí está vivo y allá cerrado.
 *
 * Sólo lee del registro externo; escribe únicamente en la tabla de
 * discrepancias del ERP.
 *
 *   npm.cmd run conciliacion:correr
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CarteraConciliacionService } from '../src/integracion/services/cartera-conciliacion.service';
import { IntegracionModoService } from '../src/integracion/services/integracion-modo.service';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mALTO\x1b[0m  ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33mAVISO\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Qué significa cada concepto y qué hay que hacer con él. */
const QUE_HACER: Record<string, string> = {
  SALDO_CLIENTE: 'Los totales del cliente no cuadran. Revisa sus créditos uno por uno.',
  SALDO_CREDITO: 'El importe difiere. Suele ser un pago aplicado de un solo lado.',
  SIN_CONTRAPARTE: 'El hecho no llegó al core. Se resuelve reenviando el evento del outbox.',
  DESAPARECIDO: 'El core ya no tiene ese crédito. Alguien lo eliminó o se creó en otro inquilino.',
  ESTADO_DIVERGENTE: 'Los importes pueden cuadrar y aun así uno lo da por terminado y el otro no.',
  CONSULTA_FALLIDA: 'No se pudo preguntar. No es una diferencia: es que no se sabe.',
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const conciliacion = app.get(CarteraConciliacionService);
  const modos = app.get(IntegracionModoService);

  const empresas = await modos.empresasActivas();
  if (!empresas.length) {
    aviso('Ninguna empresa tiene la integración de cartera encendida.');
    await app.close();
    return;
  }

  for (const empresa of empresas) {
    titulo(`Empresa ${empresa.empresaId}`);
    try {
      const r = await conciliacion.conciliarEmpresa(empresa.empresaId);
      nota(`${r.revisados} comprobación(es) · ${r.discrepancias} diferencia(s) nueva(s).`);
    } catch (e) {
      mal(`No se pudo conciliar: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
      continue;
    }

    const abiertas = await conciliacion.abiertas(empresa.empresaId);
    if (!abiertas.length) {
      ok('Sin discrepancias abiertas. Los dos sistemas dicen lo mismo.');
      continue;
    }

    mal(`${abiertas.length} discrepancia(s) abierta(s):`);

    // Agrupadas por concepto: veinte diferencias del mismo tipo son UN
    // problema, y listarlas una por una lo haría parecer veinte.
    const porConcepto = new Map<string, typeof abiertas>();
    for (const d of abiertas) {
      const lista = porConcepto.get(d.concepto) ?? [];
      lista.push(d);
      porConcepto.set(d.concepto, lista);
    }

    for (const [concepto, lista] of porConcepto) {
      console.log(`\n  \x1b[1m${concepto}\x1b[0m · ${lista.length}`);
      nota(QUE_HACER[concepto] ?? 'Sin guía registrada para este concepto.');
      for (const d of lista.slice(0, 8)) {
        const erp = Number(d.valorErp ?? 0).toFixed(2);
        const ext = Number(d.valorExterno ?? 0).toFixed(2);
        nota(`· ${d.entidadId ?? '—'} · ERP ${erp} vs externo ${ext}`);
        if (d.detalle) nota(`  ${String(d.detalle).slice(0, 180)}`);
      }
      if (lista.length > 8) nota(`… y ${lista.length - 8} más.`);
    }

    console.log('');
    nota('Mientras haya discrepancias abiertas, la empresa NO debe pasar a');
    nota('AUTORIDAD: se estaría dando por bueno un registro que no cuadra.');
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
