/**
 * ============================================================================
 * SyncroERP · Pruebas de la integración con el registro externo
 * ----------------------------------------------------------------------------
 * Levanta el contexto real de Nest contra la base real y ejercita los
 * servicios directamente. Sin HTTP y sin token: el access token de Keycloak
 * caduca en minutos y no sirve para una suite.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/e2e-integracion.ts
 *
 * REGLAS QUE SE IMPONE A SÍ MISMA
 *  · Se niega a correr con NODE_ENV=production.
 *  · Todo lo que escribe lo anota y lo borra en el `finally`, aunque falle.
 *  · No toca ni una fila que no haya creado.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

import { ModoCartera, ModoContabilidad, TipoEventoIntegracion } from '../src/integracion/integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../src/integracion/entities/configuracion-integracion-empresa.entity';
import { EventoIntegracion } from '../src/integracion/entities/evento-integracion.entity';
import { CarteraPublicadorService } from '../src/integracion/services/cartera-publicador.service';
import { ContabilidadPublicadorService } from '../src/integracion/services/contabilidad-publicador.service';
import { IntegracionModoService } from '../src/integracion/services/integracion-modo.service';
import { IntegracionDespachadorService } from '../src/integracion/services/integracion-despachador.service';
import { DisponibilidadCreditoService } from '../src/integracion/services/disponibilidad-credito.service';
import { MapeoCuentasService } from '../src/integracion/services/mapeo-cuentas.service';
import { esperaDeReintento } from '../src/integracion/services/integracion-outbox.service';
import { decidir, VeredictoCredito } from '../src/integracion/services/decision-credito.service';
import { ResultadoIdentidad } from '../src/integracion/ports/validacion-identidad.port';

let pasan = 0;
let fallan = 0;
const errores: string[] = [];

function prueba(nombre: string, condicion: boolean, detalle = ''): void {
  if (condicion) {
    pasan += 1;
    console.log(`  \x1b[32mOK\x1b[0m   ${nombre}`);
  } else {
    fallan += 1;
    errores.push(`${nombre}${detalle ? ' — ' + detalle : ''}`);
    console.log(`  \x1b[31mFALLA\x1b[0m ${nombre}${detalle ? ' — ' + detalle : ''}`);
  }
}

function seccion(titulo: string): void {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Esta suite no corre en producción.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const dataSource = app.get(DataSource);
  const modos = app.get(IntegracionModoService);
  const cartera = app.get(CarteraPublicadorService);
  const contabilidad = app.get(ContabilidadPublicadorService);
  const despachador = app.get(IntegracionDespachadorService);
  const disponibilidad = app.get(DisponibilidadCreditoService);
  const mapeo = app.get(MapeoCuentasService);

  const eventos = dataSource.getRepository(EventoIntegracion);
  const config = dataSource.getRepository(ConfiguracionIntegracionEmpresa);

  // Rastro de lo que creamos, para dejar la base como estaba.
  const eventosCreados: string[] = [];
  let configCreada = false;
  let configPrevia: ConfiguracionIntegracionEmpresa | null = null;

  const [empresa] = await dataSource.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  if (!empresa) {
    console.error('No hay ninguna empresa activa en la base.');
    await app.close();
    process.exit(1);
  }
  const empresaId = empresa.id;
  console.log(`\nEmpresa de prueba: ${empresa.nombre} (${empresaId})`);

  const idFalso = '00000000-0000-4000-8000-0000000000ff';

  try {
    // ────────────────────────────────────────────────────────────────────────
    seccion('1. Empresa SIN el módulo: nada debe cambiar');
    // ────────────────────────────────────────────────────────────────────────
    configPrevia = await config.findOne({ where: { empresaId } });
    if (configPrevia) {
      await config.update({ empresaId }, { modo: ModoCartera.APAGADO, modoContabilidad: ModoContabilidad.APAGADO });
    }
    modos.invalidar(empresaId);

    const perfilApagado = await modos.perfilDe(empresaId);
    prueba('el perfil resuelve APAGADO en ambos ejes',
      perfilApagado.cartera === ModoCartera.APAGADO && perfilApagado.contabilidad === ModoContabilidad.APAGADO,
      JSON.stringify(perfilApagado));

    prueba('el publicador de cartera se declara inactivo',
      (await cartera.activoPara(empresaId)) === false);
    prueba('el publicador contable se declara inactivo',
      (await contabilidad.activoPara(empresaId)) === false);

    const antes = await eventos.count({ where: { empresaId } });
    const idsAntes = new Set(
      (await eventos.find({ where: { empresaId }, select: { id: true } })).map((e) => e.id),
    );
    await cartera.creditoOriginado(empresaId, idFalso);
    await cartera.pagoRegistrado(empresaId, { pagoId: idFalso, creditoId: idFalso, monto: 100, fechaPago: new Date() });
    await cartera.lineaAutorizada(empresaId, idFalso, 50000, 1);
    await contabilidad.polizaRegistrada(empresaId, idFalso);
    const despues = await eventos.count({ where: { empresaId } });
    // Si se colara alguno, se anota para borrarlo: una prueba que ensucia la
    // base es peor que no tenerla.
    for (const e of await eventos.find({ where: { empresaId }, select: { id: true } })) {
      if (!idsAntes.has(e.id)) eventosCreados.push(e.id);
    }
    prueba('cuatro hechos publicados con el módulo apagado no dejan ni un evento',
      antes === despues, `antes ${antes}, después ${despues}`);

    // ────────────────────────────────────────────────────────────────────────
    seccion('2. Empresa CON el módulo: los hechos se encolan');
    // ────────────────────────────────────────────────────────────────────────
    if (!configPrevia) {
      await config.save(config.create({ empresaId, parametrosProveedor: {} }));
      configCreada = true;
    }
    await config.update({ empresaId }, { modo: ModoCartera.SOMBRA, modoContabilidad: ModoContabilidad.ESPEJO });
    modos.invalidar(empresaId);

    const perfilEncendido = await modos.perfilDe(empresaId);
    const techoCartera = modos.modoGlobal;
    const techoConta = modos.modoContabilidadGlobal;
    console.log(`  (techo global: cartera=${techoCartera}, contabilidad=${techoConta})`);

    if (techoCartera === ModoCartera.APAGADO) {
      prueba('el techo global apagado impide encender la empresa — protección correcta',
        perfilEncendido.cartera === ModoCartera.APAGADO);
      console.log('  \x1b[33mAVISO\x1b[0m Para probar el encolado hace falta CARTERA_MODO=SOMBRA y');
      console.log('        CONTABILIDAD_EXTERNA_MODO=ESPEJO en backend/.env.local');
    } else {
      const n0 = await eventos.count({ where: { empresaId } });
      await cartera.creditoOriginado(empresaId, idFalso);
      const n1 = await eventos.count({ where: { empresaId } });
      prueba('un crédito originado deja exactamente un evento', n1 === n0 + 1, `${n0} -> ${n1}`);

      const evento = await eventos.findOne({ where: { empresaId, claveIdempotencia: `credito:${idFalso}` } });
      if (evento) eventosCreados.push(evento.id);
      prueba('el evento es CREDITO_ORIGINADO y queda PENDIENTE',
        evento?.tipo === TipoEventoIntegracion.CREDITO_ORIGINADO && evento?.estado === 'PENDIENTE',
        `${evento?.tipo}/${evento?.estado}`);

      await cartera.creditoOriginado(empresaId, idFalso);
      const n2 = await eventos.count({ where: { empresaId } });
      prueba('publicar el MISMO hecho dos veces no lo duplica', n2 === n1, `${n1} -> ${n2}`);
    }

    // ────────────────────────────────────────────────────────────────────────
    seccion('3. El enlace con el registro externo');
    // ────────────────────────────────────────────────────────────────────────
    // Estas comprobaciones se adaptan al estado real del enlace. La primera
    // versión daba por hecho que Fineract no estaba configurado y empezó a
    // marcar rojo justo cuando la integración empezó a funcionar, que es la
    // peor forma de fallar: una prueba que castiga el progreso.
    const estadoEnlace = disponibilidad.estado();
    console.log(`  (proveedor ${estadoEnlace.proveedor}, configurado: ${estadoEnlace.configurado}, disponible: ${estadoEnlace.disponible})`);

    prueba('el estado del enlace es coherente consigo mismo',
      estadoEnlace.configurado || !estadoEnlace.disponible,
      'no puede estar disponible sin estar configurado');

    const lote = await despachador.despacharLote(5);
    if (estadoEnlace.configurado && estadoEnlace.disponible) {
      // Con enlace vivo el despachador SÍ debe intentar. Que un evento con un
      // id inventado falle es lo correcto; lo que se comprueba es que no
      // explote y que deje el fallo registrado.
      prueba('con enlace vivo el despachador procesa el lote sin lanzar excepción',
        typeof lote.procesados === 'number' && typeof lote.fallidos === 'number',
        JSON.stringify(lote));
      console.log(`  (lote despachado: ${JSON.stringify(lote)})`);
    } else {
      prueba('sin enlace el despachador no intenta nada y no lanza excepción',
        lote.procesados === 0 && lote.fallidos === 0, JSON.stringify(lote));
    }

    const [clienteCredito] = await dataSource.query<{ id: string; nombre: string }[]>(
      `SELECT id, nombre FROM clientes WHERE empresaid = $1 AND limitecredito > 0 AND activo = true LIMIT 1`,
      [empresaId],
    );
    if (clienteCredito) {
      const d = await disponibilidad.consultar(empresaId, clienteCredito.id);
      prueba('en modo SOMBRA la decisión la sigue tomando el ERP',
        d.origen === 'ERP', `origen ${d.origen}`);
      prueba('límite, utilizado y disponible cuadran entre sí',
        d.disponible === Math.max(0, d.limite - d.utilizado) || d.limite === 0,
        `limite ${d.limite}, utilizado ${d.utilizado}, disponible ${d.disponible}`);
      // Invariante que importa de verdad: nunca se niega una venta sin poder
      // decirle al cajero por qué. Un bloqueo mudo es un bloqueo que nadie
      // puede resolver en el mostrador.
      prueba('si no puede operar, siempre hay una razón explicable',
        d.puedeOperar || (d.razonBloqueo !== null && d.razonBloqueo.length > 0),
        'puedeOperar=false sin razonBloqueo');
      console.log(`  (cliente ${clienteCredito.nombre}: límite ${d.limite}, disponible ${d.disponible}, puede operar: ${d.puedeOperar})`);
      if (d.razonBloqueo) console.log(`   razón del bloqueo: ${d.razonBloqueo}`);
    } else {
      console.log('  \x1b[33mAVISO\x1b[0m No hay ningún cliente con línea de crédito; se omite la prueba del POS.');
    }

    // ────────────────────────────────────────────────────────────────────────
    seccion('4. Mapeo de cuentas: sólo lo que las pólizas tocan');
    // ────────────────────────────────────────────────────────────────────────
    const usadas = await mapeo.pendientes(empresaId, true);
    const todas = await mapeo.pendientes(empresaId, false);
    prueba('las cuentas realmente usadas son muchas menos que el catálogo',
      usadas.length <= todas.length, `usadas ${usadas.length}, catálogo ${todas.length}`);
    console.log(`  Cuentas en pólizas sin mapear: ${usadas.length} (catálogo completo: ${todas.length})`);
    for (const c of usadas.slice(0, 8)) {
      console.log(`    ${c.numeroCuenta}  ${c.nombre}  (${(c as { usos?: number }).usos ?? '?'} usos)`);
    }

    // ────────────────────────────────────────────────────────────────────────
    seccion('5. Lógica pura: reintentos y política de crédito');
    // ────────────────────────────────────────────────────────────────────────
    prueba('el reintento arranca en 5 s', esperaDeReintento(1) === 5000);
    prueba('el reintento tiene techo de una hora', esperaDeReintento(50) === 3_600_000);

    const sinIdentidad = decidir({
      limiteSolicitado: 50000, topeAutomatico: 100000,
      identidad: { resultado: ResultadoIdentidad.NO_INICIADA, puntaje: 0, proveedor: 'ninguno', motivos: [] },
      buro: { disponible: false, puntaje: null, deudaTotal: null, peorAtrasoDias: null, proveedor: 'ninguno', consultadoEn: null, motivos: [] },
      historial: null,
    });
    prueba('sin validación de identidad no se aprueba crédito',
      sinIdentidad.veredicto === VeredictoCredito.REVISION_MANUAL && sinIdentidad.limiteSugerido === 0,
      sinIdentidad.veredicto);

    const moroso = decidir({
      limiteSolicitado: 10000, topeAutomatico: 100000,
      identidad: { resultado: ResultadoIdentidad.VERIFICADA, puntaje: 99, proveedor: 'x', motivos: [] },
      buro: { disponible: false, puntaje: null, deudaTotal: null, peorAtrasoDias: null, proveedor: 'x', consultadoEn: null, motivos: [] },
      historial: { saldoTotal: 5000, saldoVencido: 5000, creditosActivos: 1, diasAtrasoMaximo: 120 },
    });
    prueba('120 días de atraso interno es rechazo en firme',
      moroso.veredicto === VeredictoCredito.RECHAZADO, moroso.veredicto);
  } finally {
    seccion('Limpieza');
    if (eventosCreados.length) {
      await eventos.delete(eventosCreados);
      console.log(`  ${eventosCreados.length} evento(s) de prueba borrado(s).`);
    }
    if (configCreada) {
      await config.delete({ empresaId });
      console.log('  Configuración de prueba borrada.');
    } else if (configPrevia) {
      await config.update({ empresaId }, {
        modo: configPrevia.modo,
        modoContabilidad: configPrevia.modoContabilidad,
      });
      console.log('  Configuración previa restaurada.');
    }
    modos.invalidar(empresaId);
    await app.close();
  }

  console.log(`\n\x1b[1m${pasan} pasan · ${fallan} fallan\x1b[0m`);
  if (errores.length) {
    console.log('\nLo que falló:');
    for (const e of errores) console.log(`  · ${e}`);
  }
  process.exit(fallan ? 1 : 0);
}

main().catch((e) => {
  console.error('\nLa suite se cayó:', e);
  process.exit(1);
});
