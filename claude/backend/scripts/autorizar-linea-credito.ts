/**
 * ============================================================================
 * SyncroERP · Autoriza una línea de crédito y observa el camino hacia Fineract
 * ----------------------------------------------------------------------------
 * Ejercita el camino 2 del mapa de flujos: solicitud → maker-checker →
 * LINEA_AUTORIZADA → outbox → cliente replicado en el registro externo.
 *
 *   npm.cmd run credito:autorizar -- --cliente COTEMAR --limite 150000
 *
 * Sin --aplicar sólo muestra el estado actual y qué haría.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ClientesService } from '../src/clientes/clientes.service';
import { AprobacionesDocumentosService } from '../src/aprobaciones/services/aprobaciones-documentos.service';
import { IntegracionDespachadorService } from '../src/integracion/services/integracion-despachador.service';
import { IntegracionVinculosService } from '../src/integracion/services/integracion-vinculos.service';
import { EventoIntegracion } from '../src/integracion/entities/evento-integracion.entity';
import { TipoVinculo } from '../src/integracion/integracion.constants';

const arg = (nombre: string, porOmision = '') => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porOmision;
};

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m   ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const info = (m: string) => console.log(`       \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const nombreCliente = arg('cliente', 'COTEMAR');
  const limite = Number(arg('limite', '150000'));
  const dias = Number(arg('dias', '30'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const dataSource = app.get(DataSource);
  const clientes = app.get(ClientesService);
  const aprobaciones = app.get(AprobacionesDocumentosService);
  const despachador = app.get(IntegracionDespachadorService);
  const vinculos = app.get(IntegracionVinculosService);
  const eventos = dataSource.getRepository(EventoIntegracion);

  const [empresa] = await dataSource.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  // La tabla de usuarios no tiene columna de fecha de creación: se ordena por
  // correo para que la elección sea estable entre corridas.
  const usuarios = await dataSource.query<
    { id: string; email: string; rol: string }[]
  >(
    `SELECT id, email, rol FROM usuarios
      WHERE empresaid = $1 AND activo = true
      ORDER BY email`,
    [empresaId],
  );
  if (usuarios.length === 0) {
    console.error('No hay usuarios activos en la empresa.');
    await app.close();
    process.exit(1);
  }

  // El ciclo maker-checker exige DOS personas: quien solicita no autoriza.
  // Antes hacía falta correr esto dos veces, una por cada usuario. Ahora se
  // eligen los dos de una vez y una sola corrida completa el ciclo.
  const correoSolicita = arg('solicitante');
  const correoAutoriza = arg('usuario');
  const porCorreo = (c: string) =>
    usuarios.find((u) => u.email.toLowerCase() === c.toLowerCase());

  const solicitante = correoSolicita
    ? porCorreo(correoSolicita)
    : usuarios.find((u) => /admin/i.test(u.rol)) ?? usuarios[0];
  if (!solicitante) {
    console.error(`No encontré al solicitante ${correoSolicita}.`);
    console.error(`Disponibles: ${usuarios.map((u) => `${u.email} (${u.rol})`).join(', ')}`);
    await app.close();
    process.exit(1);
  }

  const autorizador = correoAutoriza
    ? porCorreo(correoAutoriza)
    : usuarios.find(
        (u) => u.id !== solicitante.id && /direccion|admin/i.test(u.rol),
      ) ?? usuarios.find((u) => u.id !== solicitante.id);
  if (!autorizador) {
    console.error('No hay un segundo usuario activo que pueda autorizar.');
    console.error('La segregación de funciones exige dos personas distintas.');
    await app.close();
    process.exit(1);
  }
  if (autorizador.id === solicitante.id) {
    console.error('Solicitante y autorizador son la misma persona; el flujo lo va a rechazar.');
    console.error('Pásalos por separado:  --solicitante <correo> --usuario <correo>');
    await app.close();
    process.exit(1);
  }
  const usuario = autorizador;

  const [cliente] = await dataSource.query<
    {
      id: string;
      nombre: string;
      limitecredito: string;
      diascredito: number;
      estadocredito: string;
      estadosolicitudcredito: string;
      versioncredito: number;
    }[]
  >(
    `SELECT id, nombre, limitecredito, diascredito, estadocredito,
            estadosolicitudcredito, versioncredito
       FROM clientes
      WHERE empresaid = $1 AND activo = true AND UPPER(nombre) LIKE UPPER($2)
      LIMIT 1`,
    [empresaId, `%${nombreCliente}%`],
  );

  if (!cliente) {
    console.error(`No encontré ningún cliente que contenga "${nombreCliente}".`);
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log(`Solicita ${solicitante.email} (${solicitante.rol})`);
  console.log(`Autoriza ${autorizador.email} (${autorizador.rol})`);
  info('Dos personas distintas: es la segregación de funciones, no un requisito del script.');
  titulo('Estado actual del cliente');
  console.log(`  ${cliente.nombre}`);
  info(`límite ${cliente.limitecredito} · ${cliente.diascredito} días`);
  info(`estado de crédito: ${cliente.estadocredito} · solicitud: ${cliente.estadosolicitudcredito} · versión ${cliente.versioncredito}`);

  if (!aplicar) {
    titulo('Modo simulación');
    console.log(`  Se solicitaría una línea de ${limite} a ${dias} días y se intentaría autorizar.`);
    console.log('  Agrega --aplicar para hacerlo.\n');
    await app.close();
    process.exit(0);
  }

  // ── 1. Solicitud (maker) ─────────────────────────────────────────────────
  titulo('1. Solicitud de línea (maker)');
  // Si ya hay una solicitud viva no se pisa: el ciclo maker-checker se
  // completa con DOS personas y por tanto con dos corridas de este script.
  // Volver a solicitar aquí borraría la solicitud que espera autorización.
  const yaPendiente = cliente.estadosolicitudcredito === 'PENDIENTE';
  // Pedir exactamente lo que el cliente ya tiene no genera solicitud alguna:
  // no hay cambio que aprobar. Decirlo aquí evita que el paso 2 culpe a la
  // segregación de funciones de algo que nunca se solicitó.
  const sinCambios =
    !yaPendiente &&
    Number(cliente.limitecredito) === limite &&
    Number(cliente.diascredito) === dias;
  let seSolicito = false;
  if (sinCambios) {
    ok(`La línea ya está en ${limite} a ${dias} días: no hay nada que solicitar.`);
    info('Cambia --limite o --dias si querías mover algo.');
  } else if (yaPendiente) {
    ok('Ya hay una solicitud pendiente; no se vuelve a solicitar.');
    info('Se pasa directo a la autorización.');
  } else try {
    await clientes.actualizar(
      cliente.id,
      {
        limiteCredito: limite,
        diasCredito: dias,
        nivelRiesgo: 'MEDIO',
        bloquearCreditoConSaldoVencido: true,
      } as never,
      empresaId,
      solicitante.id,
    );
    seSolicito = true;
    ok(`Solicitud registrada: ${limite} a ${dias} días`);
  } catch (e) {
    mal('No se pudo registrar la solicitud');
    info(e instanceof Error ? e.message : String(e));
    await app.close();
    process.exit(1);
  }

  // ── 2. Autorización (checker) ────────────────────────────────────────────
  titulo('2. Autorización (checker)');
  const pendientes = await aprobaciones.listarPendientes(
    empresaId,
    usuario.id,
    usuario.rol,
  );
  const lista = Array.isArray(pendientes) ? pendientes : (pendientes as { items?: unknown[] })?.items ?? [];
  const mia = (lista as { id: string; proceso: string; documentoId: string }[])
    .find((a) => a.proceso === 'CREDITO_CLIENTE' && a.documentoId === cliente.id);

  if (!mia && sinCambios && !yaPendiente) {
    // No es una falla: no se solicitó nada, así que no hay nada que autorizar.
    ok('No hay nada que autorizar; la línea ya estaba en esas condiciones.');
  } else if (!mia) {
    mal(`No aparece en la bandeja de ${usuario.email} (rol ${usuario.rol})`);
    info(`Su bandeja trae ${lista.length} pendiente(s).`);
    if (seSolicito) {
      info('La solicitud se registró pero no llegó a esta bandeja: revisa la matriz');
      info('de aprobación del proceso CREDITO_CLIENTE en Gobierno de aprobaciones.');
    }
    const otros = usuarios.filter(
      (u) => u.id !== usuario.id && u.id !== solicitante.id,
    );
    if (otros.length) {
      info('Prueba autorizando con otra persona con rol aprobador:');
      otros.forEach((u) =>
        console.log(`         npm.cmd run credito:autorizar -- --aplicar --usuario ${u.email}`),
      );
    }
  } else {
    try {
      await aprobaciones.resolver(
        mia.id,
        { estado: 'APROBADA', comentario: 'Autorizada para prueba de integración.' },
        empresaId,
        { id: usuario.id, rol: usuario.rol },
      );
      ok('Línea autorizada');
    } catch (e) {
      mal('No se pudo autorizar');
      info(e instanceof Error ? e.message : String(e));
      info('Si habla de segregación de funciones, el control está funcionando.');
    }
  }

  // ── 3. El evento ─────────────────────────────────────────────────────────
  titulo('3. El hecho en el outbox');
  const evento = await eventos.findOne({
    where: { empresaId, entidadId: cliente.id },
    order: { fechaCreacion: 'DESC' },
  });
  if (!evento) {
    mal('No se encoló ningún evento para este cliente');
    info('Revisa que la empresa tenga el eje de cartera encendido.');
  } else {
    ok(`${evento.tipo} · ${evento.estado} · clave ${evento.claveIdempotencia}`);
  }

  // ── 4. Despacho hacia el registro externo ────────────────────────────────
  titulo('4. Despacho hacia el registro externo');
  const lote = await despachador.despacharLote(10);
  console.log(`  procesados ${lote.procesados} · fallidos ${lote.fallidos}`);

  const idExterno = await vinculos.idExterno(
    empresaId,
    TipoVinculo.CLIENTE,
    cliente.id,
  );
  if (idExterno) {
    ok(`El cliente quedó replicado con id externo ${idExterno}`);
  } else {
    mal('El cliente NO quedó replicado');
    const ultimo = await eventos.findOne({
      where: { empresaId, entidadId: cliente.id },
      order: { fechaCreacion: 'DESC' },
    });
    if (ultimo?.ultimoError) info(ultimo.ultimoError);
  }

  console.log('');
  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSe cayó:', e);
  process.exit(1);
});
