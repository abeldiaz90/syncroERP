/**
 * ============================================================================
 * SyncroERP · ¿Este cliente quedó duplicado en el registro externo?
 * ----------------------------------------------------------------------------
 * Muestra, para un nombre dado: qué clientes existen en el ERP, con cuál
 * cliente del core están vinculados, y qué clientes del core se llaman parecido
 * —con su externalId, su fecha de alta y cuántos créditos cuelgan de cada uno—.
 *
 * Los créditos son lo que decide cuál de los dos es el bueno. Un cliente del
 * core con préstamos es el expediente real; uno recién creado y vacío es el
 * duplicado. Y es una distinción que hay que hacer antes de tocar nada: Fineract
 * no borra clientes con historia, así que equivocarse de lado no se deshace.
 *
 * Esto sólo MIRA. No vincula, no borra, no corrige.
 *
 *   npm.cmd run cliente:duplicado -- "Alejandra Nava"
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';

const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`      \x1b[90m${m}\x1b[0m`);

const fecha = (v: unknown): string => {
  if (Array.isArray(v)) {
    const [a, m, d] = v as unknown[];
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return v ? String(v) : '—';
};

async function main() {
  const buscado = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
  if (!buscado) {
    throw new Error('Uso: npm.cmd run cliente:duplicado -- "Nombre o fragmento"');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const http = app.get(FineractHttpService);

    titulo(`ERP — clientes que coinciden con «${buscado}»`);
    const enErp: any[] = await ds.query(
      `SELECT c.id, c.nombre, c.razonsocial, c.rfc, c.email, c.empresaid,
              v.idexterno, v.referenciaidempotencia, v.fechacreacion AS vinculadoen
         FROM clientes c
         LEFT JOIN integracion_vinculos v
           ON v.entidadid = c.id AND v.tipo = 'CLIENTE' AND v.empresaid = c.empresaid
        WHERE lower(c.nombre) LIKE lower($1)
           OR lower(coalesce(c.razonsocial,'')) LIKE lower($1)
        ORDER BY c.nombre`,
      [`%${buscado}%`],
    );

    if (!enErp.length) console.log('      (ninguno)');
    for (const c of enErp) {
      console.log(`  · ${c.nombre}${c.razonsocial ? ` / ${c.razonsocial}` : ''}`);
      nota(`ERP id     ${c.id}`);
      nota(`RFC        ${c.rfc ?? '—'}   correo ${c.email ?? '—'}`);
      nota(
        c.idexterno
          ? `vinculado  cliente ${c.idexterno} del core (desde ${new Date(c.vinculadoen).toISOString().slice(0, 10)})`
          : `vinculado  \x1b[33mSIN VÍNCULO\x1b[0m — el ERP no sabe quién es en el core`,
      );
    }

    titulo(`Core (Fineract) — clientes que coinciden con «${buscado}»`);
    const respuesta = await http.get<any>(
      `/v1/clients?displayName=${encodeURIComponent(buscado)}&limit=50`,
    );
    const encontrados: any[] = respuesta?.pageItems ?? [];

    if (!encontrados.length) console.log('      (ninguno)');
    for (const c of encontrados) {
      const cuentas = await http
        .get<any>(`/v1/clients/${c.id}/accounts`)
        .catch(() => null);
      const prestamos: any[] = cuentas?.loanAccounts ?? [];
      const activos = prestamos.filter((p) => p.status?.active).length;

      console.log(
        `  · [${c.id}] ${c.displayName}   ${prestamos.length ? `\x1b[1m${prestamos.length} crédito(s)\x1b[0m` : '\x1b[33msin créditos\x1b[0m'}${activos ? `, ${activos} activo(s)` : ''}`,
      );
      nota(`externalId ${c.externalId ?? '— (ninguno: por eso una corrección no lo encuentra)'}`);

      /*
       * De quién es esta ficha, según su propia referencia.
       *
       * Es la pregunta que decide si un duplicado es un problema vivo o un
       * resto de algo que ya no existe: una ficha del core cuya referencia
       * apunta a un cliente que el ERP ya no tiene es huérfana, y nadie la va
       * a volver a tocar desde aquí.
       */
      const uuid = String(c.externalId ?? '').split(':').pop() ?? '';
      if (/^[0-9a-f-]{36}$/i.test(uuid)) {
        const duenos: any[] = await ds.query(
          `SELECT nombre, activo FROM clientes WHERE id = $1`,
          [uuid],
        );
        nota(
          duenos.length
            ? `apunta a   cliente del ERP «${duenos[0].nombre}»${duenos[0].activo === false ? ' (inactivo)' : ''}`
            : `apunta a   \x1b[33mun cliente del ERP que ya no existe\x1b[0m — ficha huérfana`,
        );
      }
      nota(`alta       ${fecha(c.activationDate ?? c.timeline?.activatedOnDate)}   oficina ${c.officeName ?? c.officeId}`);
      nota(`estado     ${c.status?.value ?? '—'}`);
    }

    titulo('Cómo leerlo');
    nota('El cliente del core con créditos es el expediente real, aunque su nombre');
    nota('esté mal escrito. El que no tiene ninguno es el duplicado que se creó.');
    nota('El vínculo del ERP debe apuntar al que tiene los créditos.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
