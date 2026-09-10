/**
 * ============================================================================
 * SyncroERP · Pruebas del catálogo de productos de crédito
 * ----------------------------------------------------------------------------
 * Lo que se comprueba aquí no es que el catálogo funcione —eso ya se vio— sino
 * que SEPA DECIR NO. Un guardián que nunca ha rechazado nada es un guardián sin
 * probar, y este en particular es lo único que separa «los dos sistemas
 * calculan igual» de «los dos sistemas calculan distinto y nadie se enteró
 * durante meses».
 *
 * Ocho comprobaciones, en orden:
 *
 *   1. Un producto nuevo nace en borrador.
 *   2. Activarlo sin vínculo con el registro externo se RECHAZA.
 *   3. Sincronizar lo crea allá y guarda la correspondencia.
 *   4. Verificar cuadra.
 *   5. Activar funciona.
 *   6. Cambiarle el plazo lo regresa a borrador, y restaurarlo lo recupera.
 *   7. Provocada una divergencia real entre los dos catálogos, verificar la
 *      DETECTA y activar se RECHAZA.
 *   8. Un plazo o un importe fuera de rango se rechaza en el servidor, no sólo
 *      en la pantalla.
 *
 * Limpia lo que crea. Lo único que no puede borrar es el producto que quedó en
 * Fineract, porque su API no lo permite; lo dice al final.
 *
 *   npm.cmd run productos:probar
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { ProductosCreditoSyncService } from '../src/credito/services/productos-credito-sync.service';
import { UnidadPlazo } from '../src/credito/entities/producto-credito.entity';

const CODIGO = 'PRUEBA-GUARDIAN';

let pasan = 0;
let fallan = 0;

const ok = (m: string) => { pasan += 1; console.log(`  \x1b[32mPASA\x1b[0m  ${m}`); };
const mal = (m: string) => { fallan += 1; console.log(`  \x1b[31mFALLA\x1b[0m ${m}`); };
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Comprueba que algo se rechaza. Que NO truene es el fallo. */
async function debeRechazar(que: string, accion: () => Promise<unknown>) {
  try {
    await accion();
    mal(`${que} — se permitió, y no debía.`);
  } catch (e) {
    ok(`${que} — rechazado: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const catalogo = app.get(ProductosCreditoService);
  const sync = app.get(ProductosCreditoSyncService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true
      ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;
  const exige = await sync.exigeCorrespondencia(empresaId);

  console.log(`\nEmpresa  ${empresa.nombre}`);
  nota(exige
    ? 'Con registro externo: se prueban las tres condiciones de venta.'
    : 'Sin registro externo: se prueba el camino independiente.');

  // Rastro de una corrida anterior interrumpida.
  const previo = await catalogo.porCodigo(empresaId, CODIGO);
  if (previo) {
    await ds.query(`DELETE FROM integracion_vinculos WHERE empresaid = $1 AND tipo = 'PRODUCTO_CREDITO' AND entidadid = $2`, [empresaId, previo.id]);
    await ds.query(`DELETE FROM productos_credito WHERE id = $1`, [previo.id]);
    nota('Se limpió un producto de prueba de una corrida anterior.');
  }

  let productoId = '';
  try {
    // ── 1. Nace en borrador ────────────────────────────────────────────────
    titulo('1 · Un producto nuevo no se puede vender por el solo hecho de existir');
    const creado = await catalogo.crear(empresaId, {
      codigo: CODIGO,
      nombre: 'Producto de prueba del guardián',
      descripcion: 'Lo crea y lo borra el script de pruebas del catálogo.',
      unidadPlazo: UnidadPlazo.MESES,
      cadaCuantos: 1,
      cuotasMinimas: 3,
      cuotasMaximas: 6,
      sinInteres: false,
      tasaInteresMensual: 1.5,
    });
    productoId = creado.id;
    if (creado.estado === 'BORRADOR') ok('Nace en BORRADOR.');
    else mal(`Nació en ${creado.estado}, debía nacer en BORRADOR.`);

    // ── 2. Activar sin correspondencia ─────────────────────────────────────
    if (exige) {
      titulo('2 · Sin existir en el registro externo no se puede activar');
      await debeRechazar('Activar sin vínculo', () => sync.activar(empresaId, productoId));
    } else {
      titulo('2 · Sin registro externo, se activa con la sola definición del ERP');
      const activo = await sync.activar(empresaId, productoId);
      if (activo.estado === 'ACTIVO') ok('Se activó sin necesitar a nadie más.');
      else mal(`Quedó en ${activo.estado}.`);
    }

    if (exige) {
      // ── 3. Sincronizar ───────────────────────────────────────────────────
      titulo('3 · Sincronizar lo crea allá y guarda la correspondencia');
      await sync.sincronizar(empresaId);
      const idExterno = await sync.idExterno(empresaId, productoId);
      if (idExterno) ok(`Vinculado al producto externo #${idExterno}.`);
      else mal('No quedó vinculado.');

      // ── 4. Verificar ─────────────────────────────────────────────────────
      titulo('4 · Las dos tablas de amortización coinciden');
      const v = await sync.verificar(empresaId, productoId);
      if (v.cuadra) ok('Cuadra cuota por cuota.');
      else mal(`No cuadró: ${v.error ?? `${v.diferencias?.length ?? 0} diferencia(s)`}`);

      // ── 5. Activar ───────────────────────────────────────────────────────
      titulo('5 · Con vínculo y verificación, se activa');
      const activo = await sync.activar(empresaId, productoId);
      if (activo.estado === 'ACTIVO') ok('Queda vendible.');
      else mal(`Quedó en ${activo.estado}.`);

      // ── 6. Editar un producto activo ─────────────────────────────────────
      titulo('6 · Cambiar el plazo de un producto activo lo regresa a borrador');
      const editado = await catalogo.actualizar(empresaId, productoId, { cadaCuantos: 2 });
      if (editado.estado === 'BORRADOR' && editado.verificadoEn === null) {
        ok('Volvió a BORRADOR y perdió la verificación.');
      } else {
        mal(`Quedó en ${editado.estado} con verificadoEn=${String(editado.verificadoEn)}.`);
      }
      await debeRechazar('Activar tras cambiarle el plazo', () => sync.activar(empresaId, productoId));

      nota('Se restaura el plazo original y se vuelve a verificar.');
      await catalogo.actualizar(empresaId, productoId, { cadaCuantos: 1 });
      const rev = await sync.verificar(empresaId, productoId);
      if (rev.cuadra) ok('Restaurado el plazo, vuelve a cuadrar.');
      else mal(`Tras restaurar no cuadra: ${rev.error ?? `${rev.diferencias?.length ?? 0} diferencia(s)`}`);
      await sync.activar(empresaId, productoId);

      // ── 7. Divergencia real entre los dos catálogos ──────────────────────
      titulo('7 · Si los dos catálogos divergen, la verificación lo detecta');
      nota('Se cambia la tasa del ERP por SQL, sin pasar por el servicio, para');
      nota('simular exactamente el caso peligroso: un producto ACTIVO cuya');
      nota('definición dejó de corresponder sin que nadie lo marcara.');
      await ds.query(
        `UPDATE productos_credito SET tasainteresmensual = 4.75 WHERE id = $1`,
        [productoId],
      );
      const divergente = await sync.verificar(empresaId, productoId);
      if (divergente.cuadra === false) {
        ok(`Detectada la divergencia: ${divergente.diferencias?.length ?? 0} diferencia(s).`);
        const m = divergente.diferencias?.[0] as { cuota?: number; campo?: string; erp?: unknown; externo?: unknown } | undefined;
        if (m) nota(`p. ej. cuota ${m.cuota} · ${m.campo}: ERP ${String(m.erp)} · externo ${String(m.externo)}`);
      } else {
        mal('La verificación dijo que cuadra con la tasa cambiada. El guardián no sirve.');
      }

      const tras = await catalogo.obtener(empresaId, productoId);
      if (tras.estado === 'BORRADOR') ok('El producto dejó de ser vendible por sí solo.');
      else mal(`Sigue en ${tras.estado} pese a no corresponder.`);

      await debeRechazar('Activar un producto que no corresponde',
        () => sync.activar(empresaId, productoId));
    }

    // ── 8. Rangos en el servidor ───────────────────────────────────────────
    titulo('8 · Los rangos se aplican en el servidor, no sólo en la pantalla');
    await ds.query(
      `UPDATE productos_credito
          SET tasainteresmensual = 1.5, estado = 'ACTIVO', montominimo = 1000, montomaximo = 50000
        WHERE id = $1`,
      [productoId],
    );
    await debeRechazar('Pedir 30 cuotas de un producto de 3 a 6',
      () => catalogo.resolverParaVenta(empresaId, productoId, { numeroCuotas: 30, importe: 10000 }));
    await debeRechazar('Pedir 1 cuota de un producto de 3 a 6',
      () => catalogo.resolverParaVenta(empresaId, productoId, { numeroCuotas: 1, importe: 10000 }));
    await debeRechazar('Vender por debajo del importe mínimo',
      () => catalogo.resolverParaVenta(empresaId, productoId, { numeroCuotas: 3, importe: 500 }));
    await debeRechazar('Vender por encima del importe máximo',
      () => catalogo.resolverParaVenta(empresaId, productoId, { numeroCuotas: 3, importe: 90000 }));
    await debeRechazar('Mover una tasa que el producto no permite mover',
      () => catalogo.resolverParaVenta(empresaId, productoId, { numeroCuotas: 3, importe: 10000, tasaInteresMensual: 0.5 }));

    const valido = await catalogo.resolverParaVenta(empresaId, productoId, {
      numeroCuotas: 4, importe: 10000, tasaInteresMensual: 1.5,
    });
    if (valido.id === productoId) ok('Una solicitud dentro de rango sí pasa.');
    else mal('Se rechazó una solicitud válida.');

    // ── Empresa sin registro externo ───────────────────────────────────────
    //
    // La otra mitad de la regla, y el escenario de la mayoría de los
    // inquilinos: catálogo propio, completo, sin nada que sincronizar.
    //
    // Si no hay una segunda empresa, se crea una temporal y se borra al final.
    // Sólo la fila de la empresa: dar de alta usuarios con contraseña es otra
    // cosa y no hace falta para esto —las comprobaciones trabajan con el
    // empresaId, no con una sesión—.
    titulo('La otra mitad de la regla: una empresa sin registro externo');

    let empresaSinExterno: { id: string; nombre: string } | null = null;
    let temporal = false;

    const otras = await ds.query<{ id: string; nombre: string }[]>(
      `SELECT id, nombrecomercial AS nombre FROM empresas
        WHERE activo = true AND id <> $1 ORDER BY fechacreacion`,
      [empresaId],
    );
    for (const otra of otras) {
      if (!(await sync.exigeCorrespondencia(otra.id))) {
        empresaSinExterno = otra;
        break;
      }
    }

    if (!empresaSinExterno) {
      const [creada] = await ds.query<{ id: string; nombre: string }[]>(
        `INSERT INTO empresas (nombrecomercial, activo)
         VALUES ('PRUEBA CATALOGO SIN EXTERNO', true)
         RETURNING id, nombrecomercial AS nombre`,
      );
      empresaSinExterno = creada;
      temporal = true;
      nota(`Se creó la empresa temporal ${creada.nombre}.`);
    }

    const otroId = empresaSinExterno.id;
    try {
      if (await sync.exigeCorrespondencia(otroId)) {
        mal(`${empresaSinExterno.nombre} sí exige correspondencia; no sirve para esta prueba.`);
      } else {
        ok(`${empresaSinExterno.nombre}: no exige correspondencia con nadie.`);
      }

      const s2 = await sync.sincronizar(otroId);
      if (s2.aplicable === false) {
        ok('Sincronizar no aplica y lo dice, en lugar de fallar.');
      } else {
        mal('Intentó sincronizar sin tener el módulo contratado.');
      }

      const v2 = await sync.verificar(otroId, productoId).catch(() => null);
      if (v2 === null) {
        ok('Verificar un producto de otra empresa se rechaza.');
      } else {
        mal('Verificó un producto que no es suyo.');
      }

      const sembrado = await catalogo.sembrar(otroId, { activar: true });
      const vendibles = await catalogo.listar(otroId, { soloVendibles: true });
      if (vendibles.length >= 5) {
        ok(`${vendibles.length} producto(s) vendible(s) sin registro externo (${sembrado.creados.length} recién creado(s)).`);
      } else {
        mal(`Sólo ${vendibles.length} vendible(s); se esperaban al menos 5.`);
      }

      const aPlazos = vendibles.find((p) => p.cuotasMaximas > 1);
      if (aPlazos) {
        const resuelto = await catalogo.resolverParaVenta(otroId, aPlazos.id, {
          numeroCuotas: aPlazos.cuotasMinimas,
          importe: 5000,
        });
        if (resuelto.id === aPlazos.id) {
          ok(`Se puede vender ${resuelto.codigo} sin que exista en ningún otro sistema.`);
        } else {
          mal('No se pudo resolver un producto para la venta.');
        }
      }

      const est = await sync.estado(otroId);
      if (est.productos.every((p) => p.vendible || p.estado !== 'ACTIVO')) {
        ok('Ningún producto activo quedó bloqueado esperando un vínculo externo.');
      } else {
        mal('Algún producto activo aparece como no vendible sin razón.');
      }
    } finally {
      if (temporal) {
        await ds.query(`DELETE FROM productos_credito WHERE empresaid = $1`, [otroId]);
        await ds.query(`DELETE FROM empresas WHERE id = $1`, [otroId]);
        nota('Empresa temporal y su catálogo borrados.');
      }
    }

  } finally {
    // ── Limpieza ───────────────────────────────────────────────────────────
    titulo('Limpieza');
    if (productoId) {
      await ds.query(`DELETE FROM integracion_vinculos WHERE empresaid = $1 AND tipo = 'PRODUCTO_CREDITO' AND entidadid = $2`, [empresaId, productoId]);
      await ds.query(`DELETE FROM productos_credito WHERE id = $1`, [productoId]);
      nota(`Borrado ${CODIGO} del ERP y su vínculo.`);
      if (exige) {
        nota('En Fineract queda el producto de préstamo: su API no permite');
        nota('borrarlos. Es inofensivo —nada del ERP apunta a él— pero conviene');
        nota('saberlo antes de enseñar ese catálogo en una junta.');
      }
    }

    titulo(`Resultado: ${pasan} pasan · ${fallan} fallan`);
    if (fallan > 0) process.exitCode = 1;
    console.log('');
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
