/**
 * ============================================================================
 * Capturar las pantallas del ERP para el manual
 * ----------------------------------------------------------------------------
 *   npm run docs:capturar              todas las de la lista
 *   npm run docs:capturar -- pedido    sólo las que su nombre contenga «pedido»
 *
 * ── POR QUÉ ESTE SCRIPT Y NO UNA CAPTURA A MANO ─────────────────────────────
 *
 * Porque a mano son veinte minutos por pantalla y, lo que importa más, no se
 * repiten iguales. El manual va a pedir que se rehagan: cambia un botón,
 * cambia una columna, y entonces hay que volver a sacar las treinta con el
 * mismo ancho, el mismo zoom y el mismo recorte. Eso lo hace un script o no se
 * hace.
 *
 * ── LA CONTRASEÑA NO PASA POR AQUÍ ──────────────────────────────────────────
 *
 * El script NO escribe credenciales en ninguna parte y no las pide. Abre una
 * ventana de verdad, se queda esperando, y quien corre el script entra con su
 * usuario en Keycloak como cualquier día. Cuando el script ve que la sesión ya
 * existe —hay token en el almacenamiento de la pantalla—, sigue solo.
 *
 * El perfil del navegador queda en una carpeta temporal del equipo, no en el
 * repositorio, así que la segunda vez normalmente ya no hay que entrar: la
 * sesión sigue ahí. Y si expiró, vuelve a esperar. No hay un caso en el que
 * este script decida entrar por su cuenta.
 *
 * ── LO QUE SE CAPTURA, Y CON QUÉ ROL ────────────────────────────────────────
 *
 * Con el rol de quien entró. Una pantalla capturada como administrador enseña
 * botones que un almacenista no tiene, y un manual por rol que enseña botones
 * que el lector no va a encontrar es peor que uno sin capturas. Por eso cada
 * entrada de la lista dice con qué rol tiene sentido, y el script lo IMPRIME
 * al terminar junto al rol con el que de hecho entró: si no coinciden, lo dice.
 * No lo decide él —no sabe la contraseña de nadie— pero no deja que pase en
 * silencio.
 *
 * ── EL PESO ─────────────────────────────────────────────────────────────────
 *
 * Las capturas viajan dentro del HTML del manual (el porqué está en
 * `documentacion.service.ts`), así que su peso es el peso del manual.
 * `una-captura-que-se-promete-y-no-esta.spec.ts` pone el techo en 400 KB por
 * archivo; aquí se recorta el alto y se avisa de cada una que se pase, con su
 * tamaño, para no descubrirlo en la suite.
 * ============================================================================
 */

import { existsSync, mkdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/** Cuánto se espera a que alguien entre, antes de rendirse. */
const ESPERA_DE_SESION_MS = 6 * 60 * 1000;

/**
 * El ancho es 1440: es el portátil corriente y es donde el ERP enseña sus
 * tablas completas sin barra horizontal. Más ancho hace letras pequeñas en el
 * manual impreso; más estrecho esconde columnas que el texto explica.
 */
const ANCHO = 1440;
const ALTO_VENTANA = 980;
/**
 * Alto máximo de la captura. Una pantalla de lista con cincuenta renglones da
 * una imagen de cuatro mil píxeles: pesa, y en el PDF sale del tamaño de un
 * sello. Lo que documenta una lista son sus primeros renglones.
 */
const ALTO_MAXIMO = 1600;
const TECHO_KB = 400;

interface Pantalla {
  /** Nombre del archivo, sin extensión. Es lo que el Markdown va a nombrar. */
  archivo: string;
  ruta: string;
  /** Para qué sirve la captura; se imprime, y sirve de pie en el documento. */
  pie: string;
  /** Con qué rol tiene sentido esta pantalla. */
  rol: string;
  /** Algo que tiene que estar en la página antes de disparar. */
  espera?: string;
  /** Texto de un botón que hay que pulsar antes (para capturar un modal). */
  pulsar?: string;
  /** Milisegundos extra, para pantallas que piden varias consultas. */
  calma?: number;
}

/**
 * ── LA LISTA ────────────────────────────────────────────────────────────────
 *
 * Crece por los flujos del manual, no por el árbol de carpetas: una captura
 * sin un párrafo que la explique es peso. El orden es el de los flujos de
 * `07-flujos-y-procesos.md`.
 */
const PANTALLAS: Pantalla[] = [
  // 11 · Pedido de venta
  {
    archivo: 'pedido-lista',
    ruta: '/dashboard/ventas/pedidos',
    pie: 'La lista de pedidos, con el estado derivado de lo que falta por surtir.',
    rol: 'ventas',
    espera: 'Pedidos de venta',
  },
  {
    archivo: 'pedido-nuevo',
    ruta: '/dashboard/ventas/pedidos',
    pie: 'Alta de un pedido: lo que se aparta se decide renglón por renglón.',
    rol: 'ventas',
    pulsar: 'Nuevo pedido',
  },
  // 12 · Factura de proveedor
  {
    archivo: 'factura-proveedor-lista',
    ruta: '/dashboard/compras/facturas-proveedor',
    pie: 'Facturas de proveedor: el cotejo de tres vías queda dicho en el estado.',
    rol: 'comprador',
    espera: 'Facturas de proveedor',
  },
  {
    archivo: 'factura-proveedor-diferencias',
    ruta: '/dashboard/compras/facturas-proveedor',
    pie: 'Una factura CON DIFERENCIAS dice cuáles renglones y con qué números.',
    rol: 'comprador',
    calma: 1200,
  },
  // 13 · Centros de costo y presupuestos
  {
    archivo: 'centros-costo',
    ruta: '/dashboard/finanzas/centros-costo',
    pie: 'El árbol de centros de costo.',
    rol: 'contador',
    espera: 'Centros de costo',
  },
  {
    archivo: 'presupuestos',
    ruta: '/dashboard/finanzas/presupuestos',
    pie: 'Presupuesto por centro y cuenta, con lo ejercido al día.',
    rol: 'contador',
    espera: 'Presupuestos',
  },
  {
    archivo: 'resultado-por-centro',
    ruta: '/dashboard/finanzas/resultado-por-centro',
    pie: 'Resultado por centro de costo.',
    rol: 'contador',
    espera: 'Resultado por centro',
  },
  // 14 · Cierre del ejercicio
  {
    archivo: 'cierre-anual',
    ruta: '/dashboard/finanzas/cierre-anual',
    pie: 'El diagnóstico del cierre: cada impedimento con su nombre antes de permitir el traspaso.',
    rol: 'contador',
    espera: 'Cierre del ejercicio',
  },
  // Pantallas que los flujos ya documentados nombran sin enseñar
  {
    archivo: 'pos',
    ruta: '/dashboard/ventas/pos',
    pie: 'El punto de venta.',
    rol: 'cajero / mostrador',
    calma: 1200,
  },
  {
    archivo: 'caja',
    ruta: '/dashboard/tesoreria/caja',
    pie: 'Apertura, cobro y arqueo de la caja.',
    rol: 'tesorería',
    espera: 'Caja',
  },
  {
    archivo: 'reposicion',
    ruta: '/dashboard/productos/reposicion',
    pie: 'Qué hay que reponer: lo libre, lo apartado y lo que un cliente ya está esperando.',
    rol: 'comprador',
    espera: 'Reposición',
  },
  {
    archivo: 'existencias',
    ruta: '/dashboard/almacenes/existencias',
    pie: 'Existencias por almacén y ubicación.',
    rol: 'almacenista',
    espera: 'Existencias',
  },
  {
    archivo: 'orden-compra',
    ruta: '/dashboard/compras/ordenes',
    pie: 'Órdenes de compra y su estado de recepción y pago.',
    rol: 'comprador',
    espera: 'Órdenes de compra',
  },
  {
    archivo: 'polizas',
    ruta: '/dashboard/finanzas/polizas',
    pie: 'Pólizas contables: toda operación que mueve dinero deja una.',
    rol: 'contador',
    espera: 'Pólizas',
  },
  {
    archivo: 'aprobaciones',
    ruta: '/dashboard/aprobaciones',
    pie: 'Lo que espera una segunda firma.',
    rol: 'gobierno',
    espera: 'Aprobaciones',
  },
  {
    archivo: 'ayuda',
    ruta: '/dashboard/ayuda',
    pie: 'La documentación, dentro del propio ERP.',
    rol: 'cualquiera',
    espera: 'Documentación',
  },
];

const BASE = process.env.CAPTURAS_URL?.trim() || 'http://localhost:3000';
const SALIDA = resolve(__dirname, '..', '..', '..', 'docs', 'img');

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const filtro = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const lista = filtro.length
    ? PANTALLAS.filter((p) => filtro.some((f) => p.archivo.includes(f) || p.ruta.includes(f)))
    : PANTALLAS;

  if (!lista.length) {
    console.error(`Ninguna pantalla de la lista coincide con: ${filtro.join(' ')}`);
    console.error(`Hay ${PANTALLAS.length}: ${PANTALLAS.map((p) => p.archivo).join(', ')}`);
    process.exit(1);
  }

  if (!existsSync(SALIDA)) mkdirSync(SALIDA, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = require('puppeteer');
  const perfil = join(tmpdir(), 'syncro-capturas-perfil');

  console.log(`\nSe abrirá una ventana en ${BASE}.`);
  console.log('Entra con tu usuario como cualquier día. Yo no escribo contraseñas.');
  console.log('Cuando vea tu sesión abierta, sigo solo con las ' + lista.length + ' pantallas.\n');

  const navegador = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: ANCHO, height: ALTO_VENTANA },
    userDataDir: perfil,
    args: [`--window-size=${ANCHO},${ALTO_VENTANA + 120}`],
  });

  try {
    const [pagina] = await navegador.pages();
    await pagina.setViewport({ width: ANCHO, height: ALTO_VENTANA, deviceScaleFactor: 1 });
    await pagina.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });

    /*
     * Esperar a la SESIÓN, no a la URL. Entrar deja la pantalla en
     * `/dashboard`, pero la pantalla también se queda ahí un momento mientras
     * redirige a Keycloak: mirar la dirección daba por entrada una sesión que
     * no existía y las primeras capturas salían de la pantalla de carga.
     */
    const desde = Date.now();
    let rol = '(no se pudo leer)';
    for (;;) {
      if (Date.now() - desde > ESPERA_DE_SESION_MS) {
        throw new Error(
          'Pasaron seis minutos sin sesión. No capturé nada: una captura de la ' +
            'pantalla de entrada no documenta nada.',
        );
      }
      const sesion = await pagina
        .evaluate(() => {
          const t = window.localStorage.getItem('syncro_token');
          if (!t) return null;
          try {
            const cuerpo = JSON.parse(atob(t.split('.')[1] ?? ''));
            return { rol: String(cuerpo.rol ?? cuerpo.realm_access?.roles?.[0] ?? 'sin rol') };
          } catch {
            return { rol: 'sin rol legible' };
          }
        })
        .catch(() => null);
      if (sesion) {
        rol = sesion.rol;
        break;
      }
      await dormir(1500);
    }
    console.log(`Sesión vista. Rol: ${rol}\n`);

    const hechas: { archivo: string; kb: number; rol: string }[] = [];
    const fallidas: string[] = [];

    for (const p of lista) {
      try {
        await pagina.goto(`${BASE}${p.ruta}`, { waitUntil: 'networkidle2', timeout: 45_000 });
        await dormir(p.calma ?? 700);

        if (p.espera) {
          const vista = await pagina.evaluate(
            (texto: string) => document.body.innerText.includes(texto),
            p.espera,
          );
          if (!vista) {
            /*
             * Lo más probable: este rol no alcanza esta pantalla. Se dice con
             * el nombre de la pantalla, porque una captura ausente que nadie
             * nombre es exactamente el hueco que este trabajo vino a cerrar.
             */
            fallidas.push(`${p.archivo}: no apareció «${p.espera}» en ${p.ruta} (¿rol ${rol}?)`);
            continue;
          }
        }

        if (p.pulsar) {
          const pulsado = await pagina.evaluate((texto: string) => {
            const botones = [...document.querySelectorAll('button, a')];
            const b = botones.find((x) => (x.textContent ?? '').trim().includes(texto));
            if (!b) return false;
            (b as HTMLElement).click();
            return true;
          }, p.pulsar);
          if (!pulsado) {
            fallidas.push(`${p.archivo}: no encontré el botón «${p.pulsar}» en ${p.ruta}`);
            continue;
          }
          await dormir(900);
        }

        const alto = await pagina.evaluate(() =>
          Math.min(document.body.scrollHeight, 4000),
        );
        const destino = join(SALIDA, `${p.archivo}.jpg`);
        await pagina.screenshot({
          path: destino,
          /*
           * JPEG y no PNG. Un PNG de una pantalla del ERP a 1440 px ronda los
           * 300 KB y un JPEG de calidad 85 ronda los 70, con el texto igual de
           * legible. Importa porque las capturas viajan dentro del HTML del
           * manual: el formato es el tiempo que tarda en abrir.
           */
          type: 'jpeg',
          quality: 85,
          clip: { x: 0, y: 0, width: ANCHO, height: Math.min(alto, ALTO_MAXIMO) },
        });
        const kb = Math.round(statSync(destino).size / 1024);
        hechas.push({ archivo: `img/${p.archivo}.jpg`, kb, rol: p.rol });
        console.log(`  ${kb.toString().padStart(4)} KB  img/${p.archivo}.jpg   ${p.pie}`);
      } catch (e) {
        fallidas.push(`${p.archivo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(`\n${hechas.length} capturas en ${SALIDA}`);

    const pesadas = hechas.filter((h) => h.kb > TECHO_KB);
    if (pesadas.length) {
      console.log(
        `\nSe pasan de ${TECHO_KB} KB y la suite las va a rechazar:\n` +
          pesadas.map((h) => `  ${h.archivo} (${h.kb} KB)`).join('\n'),
      );
    }

    /* El aviso del rol: lo único que este script no puede comprobar solo. */
    const otrosRoles = [...new Set(hechas.map((h) => h.rol))].filter(
      (r) => r !== 'cualquiera' && !r.includes(rol),
    );
    if (otrosRoles.length) {
      console.log(
        `\nEntraste como «${rol}» y estas capturas documentan pantallas de: ` +
          `${otrosRoles.join(', ')}.\nSi el manual promete enseñar lo que ve ese puesto, ` +
          'hay que rehacerlas entrando con él: un botón que el lector no tiene es peor que ninguna captura.',
      );
    }

    if (fallidas.length) {
      console.log(`\nNo salieron ${fallidas.length}:\n` + fallidas.map((f) => `  ${f}`).join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await navegador.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
