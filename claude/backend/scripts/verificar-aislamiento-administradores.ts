/**
 * ============================================================================
 * SyncroERP · ¿Puede un administrador ver la empresa de otro?
 * ----------------------------------------------------------------------------
 * El ERP no decide a qué empresa perteneces por el token de Keycloak: lo
 * resuelve por SU tabla de usuarios. Eso hace que esta tabla —y no el
 * directorio— sea la barrera que separa a una empresa de otra, y que valga la
 * pena mirarla directamente en vez de confiar en que la pantalla del alta dijo
 * LISTO.
 *
 * Comprueba tres cosas, cada una una forma distinta de romper el aislamiento:
 *
 *   1. Ninguna empresa sin administrador. Es un alta a medias: existe, consumió
 *      un inquilino si contrató core, y nadie puede entrar.
 *   2. Ningún correo repetido. Un correo en dos empresas es una persona que
 *      entra a las dos, porque la estrategia JWT busca por correo.
 *   3. Ninguna contraseña local utilizable en los administradores creados por
 *      la consola. Se entra por el directorio; un hash válido ahí sería una
 *      segunda puerta que alguien tuvo que teclear.
 *
 *   npm.cmd run aislamiento:administradores
 * ============================================================================
 */
/*
 * Las tablas se nombran en MINÚSCULAS: `LowercaseNamingStrategy` pliega el
 * nombre de la entidad, así que `@Entity('Empresas')` vive en Postgres como
 * `empresas`. Escribir «Empresas» entre comillas falla con «relation does not
 * exist», y es un error fácil de cometer leyendo sólo las entidades.
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mALTO\x1b[0m  ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  let hallazgos = 0;

  titulo('1 · Empresas sin nadie que pueda entrar');
  const huerfanas: { nombrecomercial: string; id: string }[] = await ds.query(
    `SELECT e.id, e.nombrecomercial
       FROM "empresas" e
       LEFT JOIN "usuarios" u ON u.empresaid = e.id
      WHERE u.id IS NULL
      ORDER BY e.nombrecomercial`,
  );
  if (!huerfanas.length) ok('Todas las empresas tienen al menos un usuario.');
  for (const e of huerfanas) {
    hallazgos += 1;
    mal(`«${e.nombrecomercial}» no tiene ningún usuario.`);
  }

  titulo('2 · Correos que aparecen en más de una empresa');
  const repetidos: { email: string; empresas: string }[] = await ds.query(
    `SELECT LOWER(u.email) AS email, STRING_AGG(DISTINCT e.nombrecomercial, ' | ') AS empresas
       FROM "usuarios" u
       JOIN "empresas" e ON e.id = u.empresaid
      GROUP BY LOWER(u.email)
     HAVING COUNT(DISTINCT u.empresaid) > 1`,
  );
  if (!repetidos.length) ok('Ningún correo pertenece a dos empresas.');
  for (const r of repetidos) {
    hallazgos += 1;
    mal(`${r.email} está en: ${r.empresas}`);
    nota('La estrategia JWT busca por correo: esta persona entra a las dos.');
  }

  titulo('3 · Administradores y su forma de entrar');
  const admins: {
    email: string;
    rol: string;
    nombrecomercial: string;
    passwordhash: string;
    keycloaksubject: string | null;
  }[] = await ds.query(
    `SELECT u.email, u.rol, u.passwordhash, u.keycloaksubject, e.nombrecomercial
       FROM "usuarios" u
       JOIN "empresas" e ON e.id = u.empresaid
      WHERE u.rol = 'admin'
      ORDER BY e.nombrecomercial`,
  );
  for (const a of admins) {
    /*
     * Un hash de bcrypt empieza por $2. Cualquier otra cosa no puede coincidir
     * con ninguna contraseña, que es exactamente lo que se quiere en un
     * administrador creado por la consola.
     */
    const conClaveLocal = /^\$2[aby]?\$/.test(a.passwordhash ?? '');
    const vinculado = a.keycloaksubject ? 'ya entró al menos una vez' : 'todavía no ha entrado';
    if (conClaveLocal) {
      nota(`${a.email} · ${a.nombrecomercial} · ${a.rol} · CON contraseña local · ${vinculado}`);
    } else {
      ok(`${a.email} · ${a.nombrecomercial} · sin contraseña local · ${vinculado}`);
    }
  }
  if (!admins.length) mal('No hay ningún usuario con rol admin.');

  titulo(hallazgos ? `${hallazgos} hallazgo(s)` : 'Sin hallazgos');
  if (huerfanas.length) {
    nota('Las empresas sin usuario se pueden completar dando de alta a su');
    nota('administrador, o borrarse si fueron pruebas.');
  }
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
