/**
 * ============================================================================
 * SyncroERP · Dar de alta el aviso de Fineract hacia el ERP
 * ----------------------------------------------------------------------------
 * Cierra el sentido que faltaba. Hasta ahora el ERP publicaba hechos al core y
 * el core no contestaba nada: un cobro capturado en el portal de Fineract no
 * llegaba jamás al ERP, y las dos carteras se separaban en silencio.
 *
 * Este script NO inventa la forma del hook: lee la plantilla y los eventos que
 * la instalación declara y arma el alta con lo que existe. Dos veces hoy dimos
 * por sabido un nombre que era otro.
 *
 * La clave del receptor se toma de FINERACT_WEBHOOK_TOKEN, del entorno del ERP.
 * NUNCA se imprime: viaja en la dirección del hook porque el hook web de
 * Fineract no admite encabezados propios, y una clave impresa en una consola
 * termina en una captura de pantalla.
 *
 *   npm.cmd run fineract:avisos              muestra el plan
 *   npm.cmd run fineract:avisos -- --aplicar lo da de alta
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { AvisosIntegracionService } from '../src/integracion/services/avisos-integracion.service';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const paso = (m: string) => console.log(`  \x1b[36mHARÍA\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Lo que interesa que el core avise. Se filtra contra lo que declara. */
const DESEADOS: Array<{ entityName: string; actionName: string; porque: string }> = [
  { entityName: 'LOAN', actionName: 'REPAYMENT', porque: 'un cobro hecho en el core que el ERP no tiene' },
  { entityName: 'LOAN', actionName: 'DISBURSE', porque: 'un desembolso que no salió del ERP' },
  { entityName: 'LOAN', actionName: 'APPROVE', porque: 'una autorización hecha allá' },
  { entityName: 'LOAN', actionName: 'WRITEOFF', porque: 'un castigo de cartera' },
  { entityName: 'LOAN', actionName: 'CLOSE', porque: 'un crédito cerrado allá' },
  { entityName: 'CLIENT', actionName: 'CREATE', porque: 'un cliente dado de alta directamente en el core' },
];

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);
  const cfg = app.get(ConfigService);
  const avisos = app.get(AvisosIntegracionService);

  if (!aplicar) nota('Modo plan: no se cambia nada en Fineract.');

  // ── 1. El receptor del ERP ───────────────────────────────────────────────
  titulo('1 · El receptor del lado del ERP');
  const clave = avisos.claveConfigurada;
  if (!clave) {
    mal('No hay FINERACT_WEBHOOK_TOKEN válida en el entorno del ERP.');
    nota('El receptor está apagado: contesta 404 y no guarda nada.');
    nota('Genera una clave larga y ponla en backend/.env.local como');
    nota('FINERACT_WEBHOOK_TOKEN=… (mínimo 24 caracteres), y reinicia el ERP.');
    await app.close();
    process.exit(1);
  }
  ok(`Clave configurada (${clave.length} caracteres). No se imprime.`);

  /*
   * El «/api» NO es adorno: la API del ERP corre con prefijo global
   * (`setGlobalPrefix('api')`). La primera version armo la direccion sin el, y
   * el hook quedaba apuntando a una ruta que contesta 404: Fineract entregaria
   * puntualmente a un buzon que no existe y del lado del ERP no apareceria
   * nunca nada, sin ningun error que lo explicara.
   *
   * Se admite que ERP_URL_PUBLICA ya lo traiga, para no duplicarlo.
   */
  const raiz = (cfg.get<string>('ERP_URL_PUBLICA') ?? 'http://localhost:4000').replace(/\/+$/, '');
  const base = /\/api$/.test(raiz) ? raiz : `${raiz}/api`;
  /*
   * La diagonal final NO es cosmetica. Al dar de alta el hook, Fineract valida
   * la direccion construyendo un cliente Retrofit con ella como `baseUrl`, y
   * Retrofit exige que termine en «/»: si no, lanza IllegalArgumentException,
   * que no es IOException y por lo tanto no cae en el catch que devolveria un
   * 400 «url.invalid». Se escapa como error no controlado y el alta responde
   * 500 sin cuerpo, sin decir nunca que el problema era una diagonal.
   */
  const destino = `${base}/integracion/avisos/${clave}/`;
  const destinoVisible = `${base}/integracion/avisos/${'·'.repeat(8)}`;
  ok(`Fineract llamará a ${destinoVisible}`);
  if (/localhost|127\.0\.0\.1/.test(base)) {
    nota('Es una dirección local: sólo funciona si Fineract corre en esta misma');
    nota('máquina. Para otro servidor, define ERP_URL_PUBLICA.');
  }

  // ── 2. Lo que la instalación declara ─────────────────────────────────────
  titulo('2 · Plantillas y eventos que declara Fineract');
  const plantilla = await http
    .get<Record<string, unknown>>('/v1/hooks/template', { timeoutMs: 45000 })
    .catch((e) => {
      mal(`No se pudo leer la plantilla: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      return null;
    });

  if (!plantilla) {
    await app.close();
    process.exit(1);
  }

  const plantillas = (plantilla.templates ?? []) as Array<{ name?: string; id?: number }>;
  const nombres = plantillas.map((t) => String(t.name ?? ''));
  ok(`plantillas: ${nombres.join(', ') || '—'}`);
  const web = nombres.find((n) => /^web$/i.test(n)) ?? nombres[0];
  if (!web) {
    mal('Esta instalación no declara ninguna plantilla de hook.');
    await app.close();
    process.exit(1);
  }

  /*
   * Qué eventos existen de verdad, aplanados a «ENTIDAD/ACCION».
   *
   * La primera version asumia `groupings[].entities[].actionNames[].actionName`
   * y conto CERO eventos en una instalacion que si los tiene: el nombre del
   * arreglo cambia entre versiones y las acciones a veces son cadenas sueltas y
   * no objetos. Asi que en vez de recorrer una ruta fija se BUSCA: se baja por
   * la respuesta hasta encontrar algo con nombre de entidad y su lista de
   * acciones, en cualquiera de las dos formas.
   */
  const existentes = new Set<string>();
  const accionesDe = (valor: unknown): string[] => {
    if (!Array.isArray(valor)) return [];
    return valor
      .map((a) =>
        typeof a === 'string'
          ? a
          : String((a as Record<string, unknown>)?.actionName ?? (a as Record<string, unknown>)?.name ?? ''),
      )
      .filter(Boolean);
  };

  const recorrer = (valor: unknown, profundidad = 0) => {
    if (!valor || profundidad > 6) return;
    if (Array.isArray(valor)) {
      for (const v of valor) recorrer(v, profundidad + 1);
      return;
    }
    if (typeof valor !== 'object') return;
    const obj = valor as Record<string, unknown>;
    /*
     * `name` tambien: esta version nombra la entidad asi. Se acepta solo cuando
     * el mismo objeto trae su lista de acciones, que es lo que distingue una
     * entidad de una agrupacion —las dos usan `name`—.
     */
    const entidad = String(obj.entityName ?? obj.entity ?? obj.name ?? '').trim();
    const acciones = accionesDe(obj.actionNames ?? obj.actions ?? obj.actionName);
    if (entidad && acciones.length) {
      for (const a of acciones) existentes.add(`${entidad.toUpperCase()}/${a.toUpperCase()}`);
    }
    for (const v of Object.values(obj)) recorrer(v, profundidad + 1);
  };
  recorrer(plantilla);

  nota(`${existentes.size} evento(s) disponibles en total.`);
  if (!existentes.size) {
    // Sin esto, «cero eventos» no se puede distinguir de «no supe leerlos».
    nota(`llaves de la plantilla: ${Object.keys(plantilla).join(', ')}`);
    nota(`respuesta recortada: ${JSON.stringify(plantilla).slice(0, 1200)}`);
  }

  const elegidos = DESEADOS.filter((d) => existentes.has(`${d.entityName}/${d.actionName}`));
  const ausentes = DESEADOS.filter((d) => !existentes.has(`${d.entityName}/${d.actionName}`));
  for (const d of elegidos) ok(`${d.entityName}/${d.actionName} — ${d.porque}`);
  for (const d of ausentes) nota(`no existe en esta versión: ${d.entityName}/${d.actionName}`);

  if (!elegidos.length) {
    mal('Ninguno de los eventos que interesan existe en esta instalación.');
    await app.close();
    process.exit(1);
  }

  // ── 3. ¿Ya está dado de alta? ────────────────────────────────────────────
  titulo('3 · Hooks existentes');
  const hooks = await http
    .get<Array<{ id?: number; name?: string; isActive?: boolean; config?: Array<{ fieldName?: string; fieldValue?: string }> }>>(
      '/v1/hooks',
      { timeoutMs: 45000 },
    )
    .catch(() => []);

  const urlDe = (h: { config?: Array<{ fieldName?: string; fieldValue?: string }> }) =>
    (h.config ?? []).find((c) => /payload\s*url/i.test(String(c.fieldName ?? '')))?.fieldValue ?? '';

  for (const h of hooks ?? []) {
    const u = urlDe(h);
    /*
     * La direccion lleva la clave dentro, asi que se recorta el ultimo tramo.
     * La primera version no quitaba la diagonal final, y en una URL terminada
     * en «/» el ultimo tramo esta vacio: recortaba la nada y IMPRIMIA la clave
     * completa del receptor de pruebas del portal. Enmascarar mal es peor que
     * no enmascarar, porque se ve seguro.
     */
    const sinFinal = u.replace(/\/+$/, '');
    const recortada = sinFinal.includes('/') ? `${sinFinal.slice(0, sinFinal.lastIndexOf('/'))}/····` : sinFinal;
    nota(`· ${h.id} ${h.name} ${h.isActive ? 'activo' : 'inactivo'} → ${recortada}`);
  }

  const yaEsta = (hooks ?? []).find((h) => urlDe(h) === destino);
  if (yaEsta) {
    ok(`Ya existe el hook ${yaEsta.id} apuntando al ERP. No se duplica.`);
    await app.close();
    return;
  }

  /*
   * Hooks que apuntan al buzon del ERP pero a OTRA direccion. Se retiran en vez
   * de dejarlos: un hook con la direccion equivocada entrega puntualmente a una
   * ruta que contesta 404, acumula fallos de entrega y termina desactivandose,
   * y mientras tanto parece que la integracion existe.
   */
  const equivocados = (hooks ?? []).filter(
    (h) => urlDe(h).includes('/integracion/avisos/') && urlDe(h) !== destino,
  );
  for (const h of equivocados) {
    if (!aplicar) {
      paso(`retirar el hook ${h.id}: apunta al buzon del ERP con otra direccion`);
      continue;
    }
    try {
      await http.delete(`/v1/hooks/${h.id}`, { timeoutMs: 45000 });
      ok(`Hook ${h.id} retirado (dirección equivocada).`);
    } catch (e) {
      mal(`No se pudo retirar el hook ${h.id}: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
  }

  // ── 4. El alta ───────────────────────────────────────────────────────────
  titulo('4 · Alta del hook');
  const cuerpo = {
    name: web,
    /*
     * `displayName` es obligatorio en la tabla del hook aunque el validador no
     * lo exija: sin el, el alta pasa la validacion y revienta al guardar con un
     * 500 sin detalle.
     */
    displayName: 'SyncroERP · avisos al ERP',
    isActive: true,
    /*
     * `config` va como OBJETO nombre→valor al crear, aunque la consulta lo
     * DEVUELVA como arreglo de {fieldName, fieldValue}. Mandarlo con la forma
     * que se lee produce un «The referenced JSON data is invalid» que habla de
     * formatos de fecha y no menciona el campo verdadero.
     */
    config: {
      'Payload URL': destino,
      'Content Type': 'json',
    } as Record<string, string>,
    events: elegidos.map(({ entityName, actionName }) => ({ entityName, actionName })),
  };

  if (!aplicar) {
    paso(`crear el hook «${web}» con ${elegidos.length} evento(s) apuntando al ERP`);
    nota('Se ejecuta con --aplicar.');
    await app.close();
    return;
  }

  try {
    const r = await http.post<{ resourceId?: number }>('/v1/hooks', cuerpo, { timeoutMs: 60000 });
    ok(`Hook ${r?.resourceId ?? '?'} creado y activo.`);
    nota('Haz un cobro de prueba en el portal y revisa el buzón del ERP:');
    nota('GET /integracion/avisos  (con sesión de ADMIN).');
  } catch (e) {
    mal(`No se pudo crear: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
