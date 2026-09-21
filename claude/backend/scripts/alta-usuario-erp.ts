/**
 * ============================================================================
 * SyncroERP · Da de alta en el ERP una identidad que ya existe en Keycloak
 * ----------------------------------------------------------------------------
 * NO crea identidades ni contraseñas. La identidad, la credencial y su ciclo de
 * vida viven en Keycloak; esto sólo escribe el renglón que dice «esta persona
 * opera en el ERP con este rol».
 *
 *   npm.cmd run usuario:alta
 *   npm.cmd run usuario:alta -- --email autorizador1@sumamexico.com --rol direccion --nombre "Ana Ruiz" --aplicar
 *
 * SOBRE LA CONTRASEÑA
 * Con AUTH_MODE=keycloak el ERP nunca compara contraseñas: valida el token y
 * busca al usuario por correo o por sujeto. La columna `passwordHash` queda con
 * un valor imposible de adivinar y que nadie conoce — deliberadamente. Si
 * alguien cambiara el ERP a autenticación local, esta cuenta NO podría entrar,
 * que es el modo correcto de fallar.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { Usuario } from '../src/iam/entities/usuario.entity';
import { PLANTILLAS_PERMISOS } from '../src/iam/data/plantillas-permisos';
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
  const email = arg('email').trim().toLowerCase();
  const rol = arg('rol').trim().toLowerCase();
  const nombre = arg('nombre');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Usuario);

  /*
   * La empresa no se adivina.
   *
   * Esto tomaba la empresa activa mas antigua y seguia. En una base con varias
   * —y esta tiene las de las pruebas de aislamiento— eso significa dar de alta
   * a una persona en la empresa equivocada: entra, no ve nada de lo suyo, y
   * el diagnostico se va en permisos cuando el problema era el inquilino.
   *
   * Con una sola empresa activa se usa. Con varias hay que elegir.
   */
  const empresas = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY nombrecomercial ASC`,
  );
  if (!empresas.length) {
    mal('No hay ninguna empresa activa en la base.');
    await app.close();
    process.exit(1);
  }
  const empresaPedida = arg('empresa').trim().toLowerCase();
  let empresa = empresas[0];
  if (empresaPedida) {
    const hallada = empresas.find(
      (e) =>
        String(e.id).toLowerCase() === empresaPedida ||
        String(e.nombre ?? '').toLowerCase().includes(empresaPedida),
    );
    if (!hallada) {
      mal(`Ninguna empresa activa coincide con "${empresaPedida}".`);
      for (const e of empresas) info(`  ${e.id}  ${e.nombre}`);
      await app.close();
      process.exit(1);
    }
    empresa = hallada;
  } else if (empresas.length > 1) {
    mal('Hay varias empresas activas: elige una con --empresa.');
    for (const e of empresas) info(`  ${e.id}  ${e.nombre}`);
    info('');
    info('  npm.cmd run usuario:alta -- --empresa "<parte del nombre>" --email <correo> --rol <rol> --nombre "<nombre>" --aplicar');
    await app.close();
    process.exit(1);
  }

  const existentes = await repo.find({
    where: { empresaId: empresa.id },
    order: { email: 'ASC' },
  });

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log('\n\x1b[1mUsuarios del ERP\x1b[0m');
  for (const u of existentes) {
    console.log(`  ${u.email.padEnd(34)} ${u.rol.padEnd(14)} ${u.activo ? 'activo' : 'inactivo'}`);
  }

  if (!email || !rol) {
    console.log('\n\x1b[1mRoles disponibles\x1b[0m');
    for (const p of PLANTILLAS_PERMISOS) {
      console.log(`  ${p.rol.padEnd(14)} ${p.etiqueta}`);
    }
    console.log('\n  Para dar de alta a alguien:');
    console.log('    npm.cmd run usuario:alta -- --email <correo> --rol <rol> --nombre "<nombre>" --aplicar\n');
    console.log('  El correo debe corresponder a una identidad que YA exista en Keycloak.');
    console.log('  Si no existe allá, créala primero en Keycloak: aquí no se crean identidades.\n');
    await app.close();
    process.exit(0);
  }

  const rolValido = PLANTILLAS_PERMISOS.some(
    (p) => normalizarRol(p.rol) === normalizarRol(rol),
  );
  if (!rolValido) {
    mal(`"${rol}" no es un rol del ERP.`);
    info(`Válidos: ${PLANTILLAS_PERMISOS.map((p) => p.rol).join(', ')}`);
    await app.close();
    process.exit(1);
  }

  const yaEsta = existentes.find((u) => u.email.toLowerCase() === email);
  if (yaEsta) {
    mal(`${email} ya está dado de alta con rol ${yaEsta.rol}.`);
    info('Si necesitas cambiarle el rol, hazlo desde la pantalla de usuarios del ERP.');
    await app.close();
    process.exit(1);
  }

  if (!aplicar) {
    console.log('\n\x1b[1mQué haría\x1b[0m');
    console.log(`  Alta de ${email} con rol "${rol}"${nombre ? ` (${nombre})` : ''}.`);
    console.log('  Sin contraseña utilizable: la autenticación va por Keycloak.');
    console.log('\n  Agrega --aplicar para guardarlo.\n');
    await app.close();
    process.exit(0);
  }

  // Hash de una cadena aleatoria que nadie ve ni conserva. No es una
  // credencial: es un valor que impide que la columna quede vacía y que
  // garantiza que nadie pueda entrar por autenticación local con esta cuenta.
  const inservible = await bcrypt.hash(randomBytes(48).toString('base64'), 10);

  const usuario = await repo.save(
    repo.create({
      empresaId: empresa.id,
      email,
      nombreCompleto: nombre || email.split('@')[0],
      rol: normalizarRol(rol).toLowerCase(),
      passwordHash: inservible,
      activo: true,
      emailVerificado: false,
      keycloakSubject: null,
    }),
  );

  console.log('');
  ok(`${usuario.email} dado de alta con rol "${usuario.rol}".`);
  info('Se vinculará con su identidad de Keycloak la primera vez que inicie sesión.');
  info('No hay contraseña que entregar: entra con su cuenta de SUMA.');
  console.log('');
  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSe cayó:', e);
  process.exit(1);
});
