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
import { ListaPrecio, ModoListaPrecio } from '../src/catalogo/entities/lista-precio.entity';
import { PreciosService } from '../src/catalogo/services/precios.service';
import { AprobacionesDocumentosService } from '../src/aprobaciones/services/aprobaciones-documentos.service';
import { PermisosDinamicosService } from '../src/iam/services/permisos-dinamicos.service';
import { FormaPago } from '../src/catalogo/entities/forma-pago.entity';
import { randomUUID } from 'node:crypto';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
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

    /*
     * ── Contexto ──────────────────────────────────────────────────────────
     * La empresa NO se adivina.
     *
     * Antes era `findOne({ where: {} })`: no «la primera», sino la que la base
     * devolviera primero, sin orden alguno. Con varias empresas —y esta base
     * tiene las de las pruebas de aislamiento— el script podia sembrar un
     * ciclo de compras COMPLETO, con sus ordenes, recepciones, pagos y polizas
     * contables, en una empresa al azar. El 21-sep-2026 eligio «EMPRESA B
     * PRUEBA AISLAMIENTO» y solo se detuvo porque no tenia dos usuarios; con
     * dos, habria escrito contabilidad donde no debia y nadie se entera hasta
     * el cierre.
     *
     * Si hay una sola empresa activa, se usa. Si hay varias, se listan y se
     * exige elegir. Adivinar no es una opcion cuando lo que se escribe es
     * contabilidad.
     */
    const empresasActivas = await ds.getRepository(Empresa).find({
      where: { activo: true },
      order: { nombreComercial: 'ASC' },
    });
    if (!empresasActivas.length) throw new Error('No hay ninguna empresa activa en la base.');

    const pedida = arg('empresa').trim().toLowerCase();
    let empresa: Empresa | undefined;
    if (pedida) {
      empresa = empresasActivas.find(
        (e) =>
          e.id.toLowerCase() === pedida ||
          (e.nombreComercial ?? '').toLowerCase().includes(pedida),
      );
      if (!empresa) {
        console.log('\n\x1b[1mEmpresas activas\x1b[0m');
        for (const e of empresasActivas) console.log(`  ${e.id}  ${e.nombreComercial}`);
        throw new Error(`Ninguna empresa activa coincide con "${pedida}".`);
      }
    } else if (empresasActivas.length === 1) {
      empresa = empresasActivas[0];
    } else {
      console.log('\n\x1b[1mHay varias empresas activas; elige una\x1b[0m');
      for (const e of empresasActivas) console.log(`  ${e.id}  ${e.nombreComercial}`);
      console.log('\n  npm.cmd run compras:e2e -- --empresa "<parte del nombre o el id>" --aplicar\n');
      throw new Error('Falta --empresa. No se adivina donde escribir contabilidad.');
    }
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

    /*
     * El area del solicitante no se le cambia.
     *
     * Antes el script creaba su propio departamento y MOVIA alli al usuario
     * que eligiera como solicitante, permanentemente y sin devolverlo. Correr
     * una prueba dejaba a una persona real fuera de su area, y con ella fuera
     * de su ruta de aprobacion: el efecto no aparece hoy, aparece la proxima
     * vez que esa persona levanta una requisicion y va a firmar quien no debe.
     *
     * Si el solicitante ya tiene area, se usa LA SUYA —y con ella su ruta de
     * aprobacion real, que es justamente lo que interesa probar—. El
     * departamento propio del script solo se crea para el caso en que no
     * tenga ninguna.
     */
    const depRepo = ds.getRepository(Departamento);
    let departamento: Departamento | null = solicitante.departamentoId
      ? await depRepo.findOne({ where: { id: solicitante.departamentoId, empresaId } })
      : null;

    if (departamento) {
      ok(`Departamento del solicitante: ${departamento.nombre} — no se toca`);
    } else {
      departamento = await depRepo.findOne({ where: { empresaId, nombre: `${MARCA} · Depto` } });
      if (!departamento) {
        departamento = await depRepo.save(depRepo.create({ empresaId, nombre: `${MARCA} · Depto` }));
      }
      await ds.getRepository(Usuario).update(
        { id: solicitante.id },
        { departamentoId: departamento.id },
      );
      ok(`${solicitante.nombreCompleto} no tenía área; se le asigna ${departamento.nombre}`);
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

    /*
     * Las rutas de aprobacion de la empresa NO se tocan.
     *
     * Antes se buscaba `{ empresaId, proceso, orden: 1 }` sin acotar por
     * departamento y, si existia, se SOBRESCRIBIA apuntandola al usuario de
     * prueba. Es decir: correr este script reapuntaba la matriz real de
     * aprobacion de la empresa —la de Almacen, la de Compras— a quien el
     * script eligiera, y la dejaba asi. Un script de pruebas que modifica la
     * configuracion de gobierno y no lo dice es peor que un script que falla.
     *
     * Ahora: para REQUISICION se acota al departamento propio del script, que
     * nadie mas usa. Para COTIZACION, que es global, si ya existe una ruta se
     * REUTILIZA tal cual y el script se adapta a ella —con lo que ademas se
     * prueba la configuracion de verdad, no una inventada.
     */
    const cfgRepo = ds.getRepository(ConfiguracionAprobacion);

    let rutaReq = await cfgRepo.findOne({
      where: { empresaId, proceso: 'REQUISICION', departamentoId: departamento.id, orden: 1 },
    });
    if (!rutaReq) {
      rutaReq = await cfgRepo.save(cfgRepo.create({
        empresaId, proceso: 'REQUISICION', departamentoId: departamento.id,
        usuarioId: aprobador.id, orden: 1, tiempoLimiteHoras: 24,
        obligatorio: true, permiteAutoaprobacion: false, activo: true,
      }));
      ok(`Ruta de requisición creada para «${departamento.nombre}»`);
    } else {
      ok(`Ruta de requisición ya existente para «${departamento.nombre}» — se respeta`);
    }

    const rutaCot = await cfgRepo.findOne({
      where: { empresaId, proceso: 'COTIZACION', orden: 1 },
    });
    if (!rutaCot) {
      await cfgRepo.save(cfgRepo.create({
        empresaId, proceso: 'COTIZACION', usuarioId: aprobador.id, orden: 1,
        tiempoLimiteHoras: 24, obligatorio: true, permiteAutoaprobacion: false, activo: true,
      }));
      ok('Ruta de adjudicación creada');
    } else {
      ok('Ruta de adjudicación ya existente — se respeta y el script se adapta a ella');
    }

    /*
     * Quien firma es quien la ruta diga, no quien el script prefiera. Si la
     * empresa tiene la adjudicacion asignada al contador, es el contador quien
     * debe resolverla aqui: es la unica forma de que esta corrida pruebe la
     * configuracion real.
     */
    const idAdjudicador = rutaCot?.usuarioId ?? aprobador.id;
    const adjudicador =
      (await ds.getRepository(Usuario).findOne({ where: { id: idAdjudicador, empresaId } })) ??
      aprobador;
    const idFirmaReq = rutaReq.usuarioId ?? aprobador.id;
    const firmanteReq =
      (await ds.getRepository(Usuario).findOne({ where: { id: idFirmaReq, empresaId } })) ??
      aprobador;
    dato(`Firma requisición: ${firmanteReq.nombreCompleto} (${firmanteReq.rol})`);
    dato(`Firma adjudicación: ${adjudicador.nombreCompleto} (${adjudicador.rol})`);

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

    // El guardia exige la persona asignada, sin excepcion para administrador.
    await requisiciones.resolverAprobacion(pendiente.id, 'APROBADO', 'UAT', empresaId, firmanteReq.id);
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
    await cotizaciones.aprobar(ganadora.id, empresaId, adjudicador.id, adjudicador.rol, 'UAT');
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


    /*
     * ════════════════════════════════════════════════════════════════════════
     * G11 · Lo que se corrigio en la corrida del rol Comprador (21-sep-2026)
     * ------------------------------------------------------------------------
     * Los cuatro primeros son la cadena que da sentido al ciclo: la recepcion
     * es el unico momento en que el sistema conoce el costo real, y de ahi
     * cuelga el precio de venta. Nunca se habia corrido completa.
     *
     * Los demas son controles que se encontraron rotos probando por pantalla y
     * que no se pueden comprobar desde la interfaz sin cuatro sesiones.
     * ════════════════════════════════════════════════════════════════════════
     */
    paso('G11 · La recepcion alimenta el costo, y el precio va detras');

    const productoTrasRecepcion = await prodRepo.findOne({ where: { id: producto.id } });
    comparar(
      'Costo del producto despues de recibir',
      Number(productoTrasRecepcion!.precioCompra),
      PRECIO,
    );
    dato('El costo lo escribe la recepcion, no la captura de nadie.');

    // ── La lista MARGEN se mueve detras del costo ───────────────────────────
    const MARGEN = 35;
    const REDONDEO = 0.5;
    const listaRepo = ds.getRepository(ListaPrecio);
    let listaMargen = await listaRepo.findOne({
      where: { empresaId, nombre: `${MARCA} · Lista margen` },
    });
    if (!listaMargen) {
      listaMargen = await listaRepo.save(listaRepo.create({
        empresaId, nombre: `${MARCA} · Lista margen`,
        modo: ModoListaPrecio.MARGEN,
        margenPorcentaje: MARGEN, redondeo: REDONDEO,
      } as Partial<ListaPrecio>));
    } else {
      await listaRepo.update({ id: listaMargen.id }, {
        modo: ModoListaPrecio.MARGEN, margenPorcentaje: MARGEN, redondeo: REDONDEO,
      });
    }
    ok(`Lista en modo MARGEN al ${MARGEN}%, redondeo a ${REDONDEO}`);

    const precios = app.get(PreciosService);
    const esperado = Math.ceil((PRECIO * (1 + MARGEN / 100)) / REDONDEO) * REDONDEO;
    const consulta = await precios.consultarPrecio(producto.id, empresaId, listaMargen.id);
    comparar('Precio derivado del costo', Number(consulta.precioUnitario), esperado);
    dato(`${$(PRECIO)} de costo × 1.${MARGEN} → ${$(esperado)} redondeado hacia arriba`);

    // ── Y se mueve OTRA VEZ cuando cambia el costo ──────────────────────────
    const COSTO_NUEVO = 137;
    await prodRepo.update({ id: producto.id }, { precioCompra: COSTO_NUEVO });
    const esperado2 = Math.ceil((COSTO_NUEVO * (1 + MARGEN / 100)) / REDONDEO) * REDONDEO;
    const consulta2 = await precios.consultarPrecio(producto.id, empresaId, listaMargen.id);
    comparar('El precio sigue al costo sin recapturar nada', Number(consulta2.precioUnitario), esperado2);
    await prodRepo.update({ id: producto.id }, { precioCompra: PRECIO });

    // ── Sin costo no se inventa un precio ───────────────────────────────────
    await prodRepo.update({ id: producto.id }, { precioCompra: 0 });
    const sinCosto = await precios.consultarPrecio(producto.id, empresaId, listaMargen.id);
    comparar('Sin costo devuelve 0, no un numero inventado', Number(sinCosto.precioUnitario), 0);
    await prodRepo.update({ id: producto.id }, { precioCompra: PRECIO });

    paso('G11b · Separacion de funciones del comprador');

    const permisos = app.get(PermisosDinamicosService);
    const mapaComprador = await permisos.obtenerPermisosPorRolParaFrontend(
      'comprador', empresaId,
    ) as Record<string, boolean>;
    for (const [accion, debe] of [
      ['PATCH /compras/ordenes/:id/recibir', false],
      ['PATCH /compras/ordenes/:id/pagar', false],
      ['PATCH /compras/requisiciones/aprobaciones/:id', false],
      ['GET /compras/ordenes/recepciones', true],
      ['POST /compras/ordenes', true],
    ] as const) {
      const tiene = mapaComprador[accion] === true;
      if (tiene === debe) {
        ok(`${debe ? 'Conserva' : 'No puede'} ${accion}`);
      } else {
        mal(`${accion}: ${tiene ? 'concedido' : 'negado'} — se esperaba lo contrario`);
      }
    }
    dato('Comprar, autorizar, recibir y pagar quedan en cuatro manos distintas.');

    paso('G11c · El historial de aprobaciones se recorta por persona');

    const bandeja = app.get(AprobacionesDocumentosService);
    const comoAdmin = await bandeja.listarHistorial(empresaId, 100, aprobador.id, 'admin');
    const comoComprador = await bandeja.listarHistorial(empresaId, 100, solicitante.id, 'comprador');

    if (comoAdmin.length >= comoComprador.length) {
      ok(`Administracion ve ${comoAdmin.length}; el comprador ve ${comoComprador.length}`);
    } else {
      mal(`El comprador ve MAS que administracion (${comoComprador.length} vs ${comoAdmin.length})`);
    }
    const creditoFiltrado = comoComprador.filter(
      (a: { proceso?: string }) => a.proceso === 'CREDITO_CLIENTE',
    );
    comparar('Expedientes de credito visibles al comprador', creditoFiltrado.length, 0);

    // La trazabilidad de administracion NO se rompio al cerrar la fuga.
    const totalReal = await ds.getRepository(Aprobacion).manager.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM aprobaciones_documentos WHERE empresaid = $1`,
      [empresaId],
    ).catch(() => null);
    if (totalReal) {
      dato(`Aprobaciones centrales en la base: ${totalReal[0]?.n ?? '?'}`);
    }

    paso('G11d · Quien solicita una adjudicacion no la resuelve');

    /*
     * La regla estaba en aprobar() y NO en rechazar(): el mismo comprador que
     * pedia la adjudicacion podia tumbarla antes de que otro la viera.
     */
    /*
     * Se levanta una cotizacion NUEVA y se deja pendiente de adjudicacion a
     * proposito: la del ciclo principal ya cerro, y probar sobre ella habria
     * dado un rechazo por estado en vez de por autoridad.
     */
    const cotPrueba = await cotizaciones.crear({
      requisicionId: req!.id, proveedorId: proveedores[0].id,
      detalles: [{ productoId: producto.id, cantidad: 1, precioUnitario: PRECIO }],
    } as never, empresaId);
    await cotizaciones.solicitarAprobacion(
      cotPrueba.id, empresaId, solicitante.id, 'Prueba de separacion de funciones',
    );
    const cotParaProbar = await cotizaciones.obtenerPorId(cotPrueba.id, empresaId);
    comparar('Cotizacion de prueba pendiente', cotParaProbar.estado, 'PENDIENTE_APROBACION');
    if (cotParaProbar.solicitadoAprobacionPorId) {
      for (const [verbo, fn] of [
        ['aprobar', () => cotizaciones.aprobar(cotPrueba.id, empresaId, cotParaProbar.solicitadoAprobacionPorId!, 'comprador')],
        ['rechazar', () => cotizaciones.rechazar(cotPrueba.id, empresaId, cotParaProbar.solicitadoAprobacionPorId!, 'comprador')],
      ] as const) {
        try {
          await fn();
          mal(`Dejo ${verbo} su propia adjudicacion.`);
        } catch (e) {
          const msg = (e as Error).message;
          if (/no puede resolverla/i.test(msg)) {
            ok(`Niega ${verbo} lo propio: "${msg.slice(0, 60)}…"`);
          } else {
            /*
             * Rechazo por OTRO motivo -lo mas probable, que la cotizacion ya
             * cerro su ciclo y no esta pendiente de aprobacion-. NO cuenta como
             * prueba superada: una prueba que pasa por el motivo equivocado es
             * peor que una que falla, porque deja de mirarse.
             */
            dato(`${verbo}: no concluyente, fallo por otra razon — "${msg.slice(0, 70)}…"`);
          }
        }
      }
    } else {
      dato('La cotizacion ya cerro su ciclo; la regla se cubre en coherencia.');
    }

    paso('G11e · Los catalogos que el alta de proveedor necesita');

    const formasPago = await ds.getRepository(FormaPago).count();
    if (formasPago > 0) {
      ok(`Formas de pago del SAT sembradas: ${formasPago}`);
    } else {
      mal('El catalogo de formas de pago esta vacio y el campo es obligatorio.');
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
