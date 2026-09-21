/**
 * ============================================================================
 * Corrida completa del ciclo de compras, contra la base real
 * ----------------------------------------------------------------------------
 *   npm.cmd run compras:e2e              (sólo dice qué haría)
 *   npm.cmd run compras:e2e -- --aplicar (lo hace)
 *   npm.cmd run compras:e2e -- --limpiar (desactiva lo sembrado)
 *
 * Por qué un script y no el navegador: el ciclo lo tocan cuatro personas
 * distintas —quien solicita, quien aprueba, quien recibe y quien paga— y el
 * sistema, con razón, no deja que una apruebe lo que otra pidió. Recorrerlo por
 * la interfaz exige cuatro sesiones. Aquí se actúa como cada quien llamando a
 * los mismos servicios que usan los controladores, que es donde vive toda la
 * lógica que interesa comprobar.
 *
 * Lo que NO cubre, y conviene saberlo: las guardas HTTP y la validación de los
 * DTO. Eso se prueba desde la interfaz, en el Bloque G del guion de UAT.
 *
 * ── Lo que siembra ──────────────────────────────────────────────────────────
 * Todo lleva el prefijo `UAT` y queda listado al final para poder darlo de
 * baja. Es idempotente: si ya existe, lo reutiliza.
 *
 * ── Lo que comprueba ────────────────────────────────────────────────────────
 * El camino que estaba roto, paso por paso:
 *   recepción parcial → pago de lo recibido → recepción del resto → liquidación
 * y que al final el IVA pendiente de pago de la orden vuelva a cero.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Empresa } from '../src/iam/entities/empresa.entity';
import { Usuario } from '../src/iam/entities/usuario.entity';
import { Departamento } from '../src/departamentos/entities/departamento.entity';
import { Producto } from '../src/catalogo/entities/producto.entity';
import { Impuesto } from '../src/catalogo/entities/impuesto.entity';
import { Almacen } from '../src/catalogo/entities/almacen.entity';
import { UbicacionAlmacen } from '../src/catalogo/entities/ubicacion-almacen.entity';
import { Proveedor } from '../src/proveedores/entities/proveedor.entity';
import { ConfiguracionAprobacion } from '../src/compras/entities/configuracion-aprobacion.entity';
import { CuentaBancaria } from '../src/credito/entities/cuenta-bancaria.entity';
import { RequisicionesService } from '../src/compras/services/requisiciones.service';
import { CotizacionesService } from '../src/compras/services/cotizaciones.service';
import { OrdenesCompraService } from '../src/compras/services/ordenes-compra.service';
import { Aprobacion } from '../src/compras/entities/aprobacion.entity';
import { OrdenCompra } from '../src/compras/entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../src/compras/entities/detalle-orden-compra.entity';
import { randomUUID } from 'node:crypto';

const APLICAR = process.argv.includes('--aplicar');
const LIMPIAR = process.argv.includes('--limpiar');

const MARCA = 'UAT COMPRAS';
const CANTIDAD = 10;
const PRECIO = 100;
const PRIMERA_ENTREGA = 8;

let fallos = 0;
const paso = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`);
const ok = (t: string) => console.log(`   ✔ ${t}`);
const mal = (t: string) => { fallos += 1; console.log(`   ✖ ${t}`); };
const dato = (t: string) => console.log(`     ${t}`);
const $ = (n: number) => `$${Number(n).toFixed(2)}`;

function comparar(etiqueta: string, obtenido: unknown, esperado: unknown) {
  if (JSON.stringify(obtenido) === JSON.stringify(esperado)) {
    ok(`${etiqueta}: ${JSON.stringify(obtenido)}`);
  } else {
    mal(`${etiqueta}: ${JSON.stringify(obtenido)} — se esperaba ${JSON.stringify(esperado)}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const requisiciones = app.get(RequisicionesService);
    const cotizaciones = app.get(CotizacionesService);
    const ordenes = app.get(OrdenesCompraService);

    // ── Contexto ────────────────────────────────────────────────────────────
    const empresa = await ds.getRepository(Empresa).findOne({ where: {} });
    if (!empresa) throw new Error('No hay empresa en la base.');
    const empresaId = empresa.id;
    console.log(`\nEmpresa: ${empresa.nombreComercial ?? empresaId}`);

    const usuarios = await ds.getRepository(Usuario).find({
      where: { empresaId, activo: true },
      order: { nombreCompleto: 'ASC' },
    });
    if (usuarios.length < 2) {
      throw new Error('Se necesitan al menos dos usuarios activos: uno solicita y otro aprueba.');
    }
    const solicitante = usuarios.find((u) => u.rol !== 'admin') ?? usuarios[0];
    const aprobador = usuarios.find((u) => u.id !== solicitante.id)!;
    dato(`Solicita: ${solicitante.nombreCompleto} (${solicitante.rol})`);
    dato(`Aprueba:  ${aprobador.nombreCompleto} (${aprobador.rol})`);

    if (LIMPIAR) {
      paso('Limpieza');
      if (!APLICAR) { console.log('   (agrega --aplicar para ejecutarla)'); return; }
      await ds.getRepository(Proveedor).update({ empresaId, nombre: `${MARCA} · Proveedor` }, { activo: false });
      await ds.getRepository(Producto).update({ empresaId, sku: 'UAT-COMPRAS-001' }, { activo: false });
      await ds.getRepository(ConfiguracionAprobacion).update({ empresaId, proceso: 'REQUISICION' }, { activo: false });
      await ds.getRepository(ConfiguracionAprobacion).update({ empresaId, proceso: 'COTIZACION' }, { activo: false });
      ok('Proveedor, producto y rutas de UAT desactivados.');
      console.log('   Las órdenes, recepciones y pólizas NO se tocan: ya son contabilidad.');
      return;
    }

    if (!APLICAR) {
      paso('Simulación');
      console.log('   Sembraría departamento, producto, proveedor y rutas de aprobación,');
      console.log('   y correría el ciclo completo. Vuelve a llamarlo con --aplicar.');
      return;
    }

    // ── Siembra ─────────────────────────────────────────────────────────────
    paso('Siembra de datos maestros');

    const depRepo = ds.getRepository(Departamento);
    let departamento = await depRepo.findOne({ where: { empresaId, nombre: `${MARCA} · Depto` } });
    if (!departamento) {
      departamento = await depRepo.save(depRepo.create({ empresaId, nombre: `${MARCA} · Depto` }));
    }
    ok(`Departamento ${departamento.nombre}`);

    /*
     * El solicitante necesita departamento: el servicio lo exige y hoy ningún
     * usuario lo tenía, que es la razón por la que el módulo no arrancaba.
     */
    if (solicitante.departamentoId !== departamento.id) {
      await ds.getRepository(Usuario).update({ id: solicitante.id }, { departamentoId: departamento.id });
      ok(`Departamento asignado a ${solicitante.nombreCompleto}`);
    }

    const iva16 = await ds.getRepository(Impuesto).findOne({ where: { empresaId, porcentaje: 16, activo: true } });
    if (!iva16) throw new Error('No existe un impuesto al 16 % en el catálogo.');

    const prodRepo = ds.getRepository(Producto);
    let producto = await prodRepo.findOne({ where: { empresaId, sku: 'UAT-COMPRAS-001' } });
    if (!producto) {
      producto = await prodRepo.save(prodRepo.create({
        empresaId, nombre: `${MARCA} · Artículo`, sku: 'UAT-COMPRAS-001',
        unidadMedida: 'PZA', precioCompra: PRECIO, precioVenta: PRECIO * 1.4,
        impuestoId: iva16.id, activo: true,
      } as Partial<Producto>));
    } else if (!producto.activo || producto.impuestoId !== iva16.id) {
      await prodRepo.update({ id: producto.id }, { activo: true, impuestoId: iva16.id });
    }
    ok(`Producto ${producto.sku} con IVA 16 %`);

    const almacen = await ds.getRepository(Almacen).findOne({ where: { empresaId } });
    if (!almacen) throw new Error('No hay almacén configurado.');
    const ubiRepo = ds.getRepository(UbicacionAlmacen);
    let ubicacion = await ubiRepo.findOne({ where: { empresaId, almacenId: almacen.id, activo: true } });
    if (!ubicacion) {
      ubicacion = await ubiRepo.save(ubiRepo.create({
        empresaId, almacenId: almacen.id, codigo: 'UAT-A1', activo: true,
      } as Partial<UbicacionAlmacen>));
    }
    ok(`Almacén ${almacen.nombre} · ubicación ${ubicacion.codigo}`);

    const provRepo = ds.getRepository(Proveedor);
    const proveedores: Proveedor[] = [];
    for (const sufijo of ['A', 'B']) {
      let p = await provRepo.findOne({ where: { empresaId, nombre: `${MARCA} · Proveedor ${sufijo}` } });
      if (!p) {
        p = await provRepo.save(provRepo.create({
          empresaId, nombre: `${MARCA} · Proveedor ${sufijo}`, activo: true,
          estadoHomologacion: 'APROBADO', nivelRiesgo: 'BAJO',
        } as Partial<Proveedor>));
      } else {
        await provRepo.update({ id: p.id }, { activo: true, estadoHomologacion: 'APROBADO' });
        p = (await provRepo.findOne({ where: { id: p.id } }))!;
      }
      proveedores.push(p);
    }
    ok(`Dos proveedores homologados`);

    const cfgRepo = ds.getRepository(ConfiguracionAprobacion);
    for (const [proceso, departamentoId] of [
      ['REQUISICION', departamento.id],
      ['COTIZACION', null],
    ] as const) {
      const existente = await cfgRepo.findOne({ where: { empresaId, proceso, orden: 1 } });
      if (!existente) {
        await cfgRepo.save(cfgRepo.create({
          empresaId, proceso, departamentoId: departamentoId ?? undefined,
          usuarioId: aprobador.id, orden: 1, tiempoLimiteHoras: 24,
          obligatorio: true, permiteAutoaprobacion: false, activo: true,
        }));
      } else {
        await cfgRepo.update({ id: existente.id }, {
          usuarioId: aprobador.id, activo: true,
          departamentoId: departamentoId ?? undefined,
        });
      }
    }
    ok('Rutas de aprobación de requisición y cotización');

    const cuenta = await ds.getRepository(CuentaBancaria).findOne({ where: { empresaId, activo: true } });
    if (!cuenta) throw new Error('No hay cuenta bancaria activa para registrar el pago.');
    ok(`Cuenta de pago: ${cuenta.nombre} (${cuenta.tipo})`);

    // ── G1 · Requisición ────────────────────────────────────────────────────
    paso('G1 · Requisición y aprobación');
    const req = await requisiciones.crear(
      { detalles: [{ productoId: producto.id, cantidadSolicitada: CANTIDAD }], prioridad: 'NORMAL' } as never,
      empresaId, solicitante.id,
    );
    comparar('Estado inicial', req!.estado, 'PENDIENTE');

    const pendiente = await ds.getRepository(Aprobacion).findOne({
      where: { requisicionId: req!.id, estado: 'PENDIENTE' }, order: { orden: 'ASC' },
    });
    if (!pendiente) throw new Error('No se generó la cadena de aprobación.');

    try {
      await requisiciones.resolverAprobacion(pendiente.id, 'APROBADO', 'intento del solicitante', empresaId, solicitante.id);
      mal('El solicitante pudo aprobar su propia requisición.');
    } catch {
      ok('El solicitante no puede aprobar lo que pidió');
    }

    await requisiciones.resolverAprobacion(pendiente.id, 'APROBADO', 'UAT', empresaId, aprobador.id);
    const reqAprobada = await ds.getRepository('requisiciones').findOne({ where: { id: req!.id } }) as { estado: string };
    comparar('Tras aprobar', reqAprobada.estado, 'COTIZANDO');

    // ── G2 · Cotizaciones ───────────────────────────────────────────────────
    paso('G2 · Cotizaciones · el impuesto lo calcula el servidor');
    const cots = [];
    for (const [i, prov] of proveedores.entries()) {
      const cot = await cotizaciones.crear({
        requisicionId: req!.id, proveedorId: prov.id,
        // A propósito: el formulario manda CERO de impuesto.
        subtotal: 0, impuestoTotal: 0, total: 0,
        detalles: [{ productoId: producto.id, cantidad: CANTIDAD, precioUnitario: PRECIO + i * 5 }],
      } as never, empresaId);
      cots.push(cot);
    }
    const ganadora = cots[0];
    comparar('Subtotal', Number(ganadora.subtotal), CANTIDAD * PRECIO);
    comparar('IVA calculado pese al cero del formulario', Number(ganadora.impuestoTotal), CANTIDAD * PRECIO * 0.16);
    comparar('Total', Number(ganadora.total), CANTIDAD * PRECIO * 1.16);
    comparar('Tasa congelada en la partida', Number(ganadora.detalles[0].tasaIva), 0.16);

    // ── G3 · Adjudicación ───────────────────────────────────────────────────
    paso('G3 · Adjudicación');
    await cotizaciones.solicitarAprobacion(ganadora.id, empresaId, solicitante.id, 'mejor precio');
    try {
      await cotizaciones.aprobar(ganadora.id, empresaId, solicitante.id, solicitante.rol);
      mal('Quien pidió la adjudicación pudo aprobarla.');
    } catch {
      ok('Quien pide la adjudicación no la aprueba');
    }
    await cotizaciones.aprobar(ganadora.id, empresaId, aprobador.id, aprobador.rol, 'UAT');
    const cotAprobada = await cotizaciones.obtenerPorId(ganadora.id, empresaId);
    comparar('Cotización', cotAprobada.estado, 'APROBADA');

    // ── G4 · Orden ──────────────────────────────────────────────────────────
    paso('G4 · Orden de compra');
    const oc = await ordenes.crearDesdeCotizacion(ganadora.id, empresaId);
    comparar('Total de la orden', Number(oc!.total), CANTIDAD * PRECIO * 1.16);
    comparar('Impuesto copiado a la partida', Number(oc!.detalles[0].impuestoImporte), CANTIDAD * PRECIO * 0.16);
    const perdedora = await cotizaciones.obtenerPorId(cots[1].id, empresaId);
    comparar('La cotización perdedora', perdedora.estado, 'RECHAZADA');
    await ordenes.cambiarEstado(oc!.id, empresaId, 'ENVIADA');
    ok('Orden enviada al proveedor');

    // ── G5 · Recepción parcial ──────────────────────────────────────────────
    paso(`G5 · Recepción parcial (${PRIMERA_ENTREGA} de ${CANTIDAD})`);
    const detalleId = oc!.detalles[0].id;
    await ordenes.recibir(oc!.id, empresaId, almacen.id, [{
      id: detalleId, cantidadRecibidaOk: PRIMERA_ENTREGA, cantidadRechazada: 0,
      ubicacionId: ubicacion.id,
    }], { id: aprobador.id }, randomUUID());

    let actual = await ds.getRepository(OrdenCompra).findOne({ where: { id: oc!.id } });
    comparar('Eje de recepción', actual!.estadoRecepcion, 'PARCIAL');
    comparar('Etiqueta', actual!.estado, 'CON_INCIDENCIAS');

    // ── G6 · Pago de lo recibido ────────────────────────────────────────────
    paso('G6 · Pago de lo recibido');
    const pagable = Math.round(CANTIDAD * PRECIO * 1.16 * (PRIMERA_ENTREGA / CANTIDAD) * 100) / 100;
    try {
      await ordenes.pagarOrden(oc!.id, empresaId, {
        montoPagado: CANTIDAD * PRECIO * 1.16, cuentaBancariaId: cuenta.id,
        claveIdempotencia: randomUUID(),
      }, aprobador.id);
      mal('Dejó pagar el total de una entrega incompleta.');
    } catch (e) {
      ok(`Rechaza pagar el total: "${(e as Error).message.slice(0, 90)}…"`);
    }

    const pago1 = await ordenes.pagarOrden(oc!.id, empresaId, {
      montoPagado: pagable, cuentaBancariaId: cuenta.id, claveIdempotencia: randomUUID(),
    }, aprobador.id);
    comparar(`Pago de ${$(pagable)}`, Number(pago1.pago!.monto), pagable);
    actual = await ds.getRepository(OrdenCompra).findOne({ where: { id: oc!.id } });
    comparar('Eje de pago', actual!.estadoPago, 'PARCIAL');
    comparar('La recepción NO se perdió', actual!.estadoRecepcion, 'PARCIAL');

    // ── G7 · Recepción del resto ────────────────────────────────────────────
    paso('G7 · Recepción del resto, ya estando pagada a medias');
    await ordenes.recibir(oc!.id, empresaId, almacen.id, [{
      id: detalleId, cantidadRecibidaOk: CANTIDAD - PRIMERA_ENTREGA, cantidadRechazada: 0,
      ubicacionId: ubicacion.id,
    }], { id: aprobador.id }, randomUUID());
    actual = await ds.getRepository(OrdenCompra).findOne({ where: { id: oc!.id } });
    comparar('Eje de recepción', actual!.estadoRecepcion, 'COMPLETA');

    // ── G8 · Liquidación ────────────────────────────────────────────────────
    paso('G8 · Liquidación');
    const resto = Math.round((CANTIDAD * PRECIO * 1.16 - pagable) * 100) / 100;
    const pago2 = await ordenes.pagarOrden(oc!.id, empresaId, {
      montoPagado: resto, cuentaBancariaId: cuenta.id, claveIdempotencia: randomUUID(),
    }, aprobador.id);
    actual = await ds.getRepository(OrdenCompra).findOne({ where: { id: oc!.id } });
    comparar('Eje de pago', actual!.estadoPago, 'PAGADA');
    comparar('Etiqueta final', actual!.estado, 'PAGADA');

    const ivaPartida = Number(
      (await ds.getRepository(DetalleOrdenCompra).findOne({ where: { id: detalleId } }))!.impuestoImporte,
    );
    const ivaAcreditado =
      Number(pago1.ivaReclasificado ?? 0) + Number(pago2.ivaReclasificado ?? 0);
    comparar('IVA acreditado = IVA de la orden', Math.round(ivaAcreditado * 100) / 100, ivaPartida);

    // ── G10 · Lo que debe negarse ───────────────────────────────────────────
    paso('G10 · Lo que no se puede hacer');
    try {
      await ordenes.cambiarEstado(oc!.id, empresaId, 'CANCELADA');
      mal('Dejó cancelar una orden ya recibida y pagada.');
    } catch (e) {
      ok(`Niega cancelar: "${(e as Error).message.slice(0, 80)}…"`);
    }
    try {
      await ordenes.recibir(oc!.id, empresaId, almacen.id, [{
        id: detalleId, cantidadRecibidaOk: 1, cantidadRechazada: 0, ubicacionId: ubicacion.id,
      }], { id: aprobador.id }, randomUUID());
      mal('Dejó recibir de más.');
    } catch (e) {
      ok(`Niega recibir de más: "${(e as Error).message.slice(0, 80)}…"`);
    }

    // ── Cierre ──────────────────────────────────────────────────────────────
    paso('Resultado');
    console.log(`   Orden de compra: ${oc!.id}`);
    console.log(`   Requisición:     ${req!.id}`);
    console.log(`   Sembrado con el prefijo «${MARCA}» — desactívalo con --limpiar.`);
    console.log(
      fallos
        ? `\n   ${fallos} comprobación(es) FALLARON.\n`
        : '\n   Las comprobaciones pasaron todas.\n',
    );
  } finally {
    await app.close();
  }
  if (fallos) process.exit(1);
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
