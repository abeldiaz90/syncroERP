/**
 * ============================================================================
 * SyncroERP · Catálogo de productos de crédito, de punta a punta
 * ----------------------------------------------------------------------------
 * Siembra, sincroniza, verifica y activa. En ese orden, que es el único que
 * tiene sentido: sembrar da qué vender, sincronizar hace que exista en los dos
 * lados, verificar comprueba que los dos calculan la misma tabla, y activar es
 * lo que finalmente deja venderlo.
 *
 * Lo que hace depende del modo de la empresa, y eso es a propósito:
 *
 *   · Sin registro externo contratado, el catálogo del ERP es completo y se
 *     activa solo. Las dos plataformas son independientes.
 *   · Con registro externo, ningún producto se activa hasta que exista allá y
 *     su tabla de amortización coincida cuota por cuota.
 *
 *   npm.cmd run productos:catalogo                  muestra el estado
 *   npm.cmd run productos:catalogo -- --aplicar     siembra, sincroniza, verifica y activa
 *   npm.cmd run productos:catalogo -- --aplicar --empresa COTEMAR
 *   npm.cmd run productos:catalogo -- --suspender-importados
 *
 * Sólo se activan solos los productos NACIDOS EN EL ERP. Los importados del
 * registro externo se verifican y se informan, pero quedan en borrador: que un
 * producto exista allá no es razón para venderlo aquí.

 * Es idempotente: correrlo dos veces no duplica nada ni reactiva lo suspendido.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { ProductosCreditoSyncService } from '../src/credito/services/productos-credito-sync.service';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const suspenderImportados = process.argv.includes('--suspender-importados');
  const filtroEmpresa = arg('empresa');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const catalogo = app.get(ProductosCreditoService);
  const sync = app.get(ProductosCreditoSyncService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas
      WHERE activo = true ${filtroEmpresa ? 'AND (nombrecomercial ILIKE $1 OR id::text = $1)' : ''}
      ORDER BY fechacreacion LIMIT 1`,
    filtroEmpresa ? [`%${filtroEmpresa}%`] : [],
  );
  if (!empresa) {
    console.error('No se encontró la empresa.');
    await app.close();
    process.exit(1);
  }

  const exige = await sync.exigeCorrespondencia(empresa.id);
  console.log(`\nEmpresa  ${empresa.nombre}`);
  nota(
    exige
      ? 'Lleva su cartera en un registro externo: el catálogo debe corresponder.'
      : 'No lleva registro externo: su catálogo es independiente y se basta solo.',
  );

  if (suspenderImportados) {
    titulo('Regresando a borrador los productos importados');
    const suspendidos = await sync.suspenderImportados(empresa.id);
    if (suspendidos.length) {
      for (const c of suspendidos) ok(`suspendido ${c}`);
    } else {
      nota('No había ninguno activo.');
    }
    titulo('Estado final');
    imprimir(await sync.estado(empresa.id));
    console.log('');
    await app.close();
    return;
  }

  if (!aplicar) {
    titulo('Estado actual');
    imprimir(await sync.estado(empresa.id));
    titulo('Modo consulta');
    nota('No se cambió nada. Para sembrar, sincronizar, verificar y activar:');
    console.log('\n  npm.cmd run productos:catalogo -- --aplicar\n');
    await app.close();
    return;
  }

  // ── 1. Sembrar ───────────────────────────────────────────────────────────
  titulo('Sembrando el catálogo');
  const sembrado = await catalogo.sembrar(empresa.id, { activar: !exige });
  if (sembrado.creados.length) ok(`creados: ${sembrado.creados.join(', ')}`);
  if (sembrado.existentes.length) {
    nota(`ya existían: ${sembrado.existentes.join(', ')}`);
  }

  // ── 2. Sincronizar ───────────────────────────────────────────────────────
  titulo('Correspondencia con el registro externo');
  const s = await sync.sincronizar(empresa.id);
  if (!s.aplicable) {
    nota(String(s.motivo));
  } else {
    for (const p of s.publicados) ok(`publicado  ${p.codigo} → ${p.idExterno}`);
    for (const p of s.importados) ok(`importado  ${p.codigo} (${p.estado})`);
    for (const p of s.problemas) mal(`${p.codigo ?? p.nombre}: ${p.error}`);
    if (!s.publicados.length && !s.importados.length && !s.problemas.length) {
      nota('Todo ya estaba en correspondencia.');
    }
  }

  // ── 2b. Códigos legibles ─────────────────────────────────────────────────
  if (s.aplicable) {
    const recodificados = await sync.recodificarImportados(empresa.id);
    for (const c of recodificados) ok(`código  ${c.antes} → ${c.ahora}`);
  }

  // ── 3. Verificar y 4. activar ────────────────────────────────────────────
  titulo('Verificación y activación');
  for (const producto of await catalogo.listar(empresa.id)) {
    try {
      const v = await sync.verificar(empresa.id, producto.id);
      if (v.aplicable === false) {
        nota(`${producto.codigo}: sin registro externo, no hay contra qué comparar.`);
      } else if (v.cuadra) {
        ok(`${producto.codigo} cuadra cuota por cuota con el externo.`);
      } else {
        mal(`${producto.codigo} NO cuadra.`);
        for (const d of (v.diferencias ?? []).slice(0, 6)) {
          nota(
            `cuota ${d.cuota ?? '-'} · ${d.campo}: ERP ${d.erp} · externo ${d.externo}`,
          );
        }
        if (v.error) nota(String(v.error));
        continue;
      }

      /*
       * Sólo se activa lo nacido en el ERP. Un producto importado cuadra
       * porque el ERP aprendió a calcular como él, no porque alguien haya
       * decidido venderlo: no trae detrás la política de crédito ni el flujo de
       * validación de esta empresa. Esa decisión es de una persona.
       */
      if (producto.origen !== 'ERP') {
        nota(`${producto.codigo}: importado, queda en borrador. Actívalo tú si lo quieres vender.`);
        continue;
      }

      await sync.activar(empresa.id, producto.id);
      ok(`${producto.codigo} queda vendible.`);
    } catch (e) {
      mal(`${producto.codigo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  titulo('Estado final');
  imprimir(await sync.estado(empresa.id));
  console.log('');
  await app.close();
}

function imprimir(estado: {
  exigeCorrespondencia: boolean;
  productos: Array<Record<string, unknown>>;
}) {
  const cab = ['CÓDIGO', 'PLAZO', 'CUOTAS', 'TASA', 'ESTADO', 'EXTERNO', 'VENDIBLE'];
  const filas = estado.productos.map((p) => [
    String(p.codigo),
    String(p.plazo),
    String(p.cuotas),
    `${Number(p.tasaInteresMensual).toFixed(2)}%`,
    String(p.estado),
    p.idExterno ? String(p.idExterno) : '—',
    p.vendible ? 'sí' : String(p.falta ?? 'no'),
  ]);

  const anchos = cab.map((c, i) =>
    Math.max(c.length, ...filas.map((f) => f[i].length)),
  );
  const linea = (f: string[]) =>
    '  ' + f.map((c, i) => c.padEnd(anchos[i])).join('  ');

  console.log(linea(cab));
  console.log('  ' + anchos.map((a) => '─'.repeat(a)).join('  '));
  for (const f of filas) console.log(linea(f));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
