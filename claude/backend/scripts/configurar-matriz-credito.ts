/**
 * ============================================================================
 * SyncroERP · Arma la matriz de aprobación de líneas de crédito
 * ----------------------------------------------------------------------------
 * Sin matriz, ninguna línea puede autorizarse: el ciclo maker-checker no tiene
 * a quién preguntarle. Es la pieza que faltaba para que el gobierno de crédito
 * pase de estar escrito a estar operando.
 *
 *   npm.cmd run credito:matriz                                 muestra el estado
 *   npm.cmd run credito:matriz -- --rol direccion --aplicar     un solo nivel
 *   npm.cmd run credito:matriz -- --rol gerencia --hasta 500000 --rolFinal direccion --aplicar
 *
 * LAS REGLAS DEL FLUJO FINANCIERO, que el ERP valida y aquí se respetan:
 *  · El primer nivel arranca en cero.
 *  · Los niveles son contiguos: cada uno empieza donde termina el anterior.
 *  · El ÚLTIMO nivel va sin tope, para que ningún importe quede sin aprobador.
 *  · Todos obligatorios y sin autoaprobación. No es configurable: quien
 *    solicita una línea no puede autorizarla, y eso no se negocia desde aquí.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ConfiguracionAprobacion } from '../src/compras/entities/configuracion-aprobacion.entity';
import { normalizarRol } from '../src/iam/utils/roles.util';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m   ${m}`);
const mal = (m: string) => console.log(`  \x1b[31m!\x1b[0m    ${m}`);
const info = (m: string) => console.log(`       \x1b[90m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const rehacer = process.argv.includes('--rehacer');
  const rol = (arg('rol', 'direccion') || 'direccion').toLowerCase();
  const hasta = Number(arg('hasta', '0')) || null;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const repo = ds.getRepository(ConfiguracionAprobacion);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  const usuarios = await ds.query<{ email: string; rol: string }[]>(
    `SELECT email, rol FROM usuarios WHERE empresaid = $1 AND activo = true ORDER BY email`,
    [empresaId],
  );

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log('\n\x1b[1mUsuarios activos\x1b[0m');
  for (const u of usuarios) console.log(`  ${u.email.padEnd(34)} ${u.rol}`);

  const actual = await repo.find({
    where: { empresaId, proceso: 'CREDITO_CLIENTE' },
    order: { orden: 'ASC' },
  });
  console.log('\n\x1b[1mMatriz actual de CREDITO_CLIENTE\x1b[0m');
  if (actual.length === 0) {
    mal('No hay ningún nivel configurado: ninguna línea de crédito puede autorizarse.');
  } else {
    for (const n of actual) {
      console.log(
        `  nivel ${n.orden} · ${(n.rolAprobador ?? 'usuario específico').padEnd(14)} · hasta ${n.montoHasta ?? 'sin tope'} · ${n.activo ? 'activo' : 'inactivo'}`,
      );
    }
  }

  // ── Comprobación de segregación de funciones ─────────────────────────────
  console.log('\n\x1b[1mSegregación de funciones\x1b[0m');
  const conRol = usuarios.filter((u) => normalizarRol(u.rol) === normalizarRol(rol));
  if (conRol.length === 0) {
    mal(`No hay ningún usuario activo con el rol "${rol}".`);
    info('La matriz se puede guardar, pero la primera solicitud fallará hasta que exista.');
  } else if (conRol.length === 1 && usuarios.length === 1) {
    mal(`"${rol}" existe pero es la única persona activa: no puede solicitar y autorizar.`);
    info('Hace falta un segundo usuario. No se puede evitar sin romper el control.');
  } else {
    ok(`${conRol.length} usuario(s) con rol "${rol}" pueden autorizar.`);
  }

  // ── Se arma la escalera de niveles ───────────────────────────────────────
  // Un solo nivel sin tope, o dos: uno con autoridad limitada y otro que
  // recoge todo lo que la excede. Sin el segundo, una línea por encima del
  // tope no tendría a quién preguntarle — que es justo lo que el ERP rechaza.
  const rolFinal = (arg('rolFinal', '') || '').toLowerCase();
  const niveles: {
    orden: number;
    rol: string;
    desde: number;
    hasta: number | null;
  }[] = hasta
    ? [
        { orden: 1, rol, desde: 0, hasta },
        { orden: 2, rol: rolFinal || rol, desde: hasta, hasta: null },
      ]
    : [{ orden: 1, rol, desde: 0, hasta: null }];

  if (hasta && !rolFinal) {
    console.log('');
    mal('Con --hasta hace falta --rolFinal: quién autoriza lo que excede ese tope.');
    info('El último nivel no puede tener tope, o los importes mayores quedan sin aprobador.');
    info(`Ejemplo: --rol ${rol} --hasta ${hasta} --rolFinal direccion`);
    console.log('');
    await app.close();
    process.exit(1);
  }

  console.log('\n\x1b[1mNiveles a configurar\x1b[0m');
  for (const n of niveles) {
    const cobertura = n.hasta === null
      ? `desde ${n.desde} sin tope`
      : `de ${n.desde} a ${n.hasta}`;
    const hay = usuarios.filter((u) => normalizarRol(u.rol) === normalizarRol(n.rol)).length;
    console.log(`  nivel ${n.orden} · ${n.rol.padEnd(14)} · ${cobertura}`);
    if (hay === 0) mal(`   no hay ningún usuario activo con el rol "${n.rol}"`);
  }

  if (!aplicar) {
    console.log('\n  obligatorio: sí · autoaprobación: no (no es configurable)');
    console.log('\n  Agrega --aplicar para guardarlo.\n');
    await app.close();
    process.exit(0);
  }

  if (actual.length > 0) {
    if (!rehacer) {
      console.log('\n  Ya existe una matriz. Agrega --rehacer para reemplazarla.\n');
      await app.close();
      process.exit(1);
    }
    await repo.delete({ empresaId, proceso: 'CREDITO_CLIENTE' });
    info(`Se borraron ${actual.length} nivel(es) anteriores.`);
  }

  await repo.save(
    niveles.map((n) =>
      repo.create({
        empresaId,
        proceso: 'CREDITO_CLIENTE',
        // La restricción de la base exige departamentoId nulo para este
        // proceso: el crédito de un cliente no pertenece a un departamento.
        departamentoId: undefined,
        rolAprobador: n.rol,
        orden: n.orden,
        montoDesde: n.desde,
        montoHasta: n.hasta ?? undefined,
        tiempoLimiteHoras: 48,
        obligatorio: true,
        permiteAutoaprobacion: false,
        activo: true,
      }),
    ),
  );

  console.log('');
  ok(`Matriz creada con ${niveles.length} nivel(es).`);
  console.log('');
  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSe cayó:', e);
  process.exit(1);
});
