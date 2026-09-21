/**
 * ============================================================================
 * SyncroERP · Cuentas puente y actividades financieras de Fineract
 * ----------------------------------------------------------------------------
 *   npm.cmd run fineract:contabilidad            (sólo mira)
 *   npm.cmd run fineract:contabilidad -- --aplicar
 *
 * Fineract no asienta una transferencia interna directamente de origen a
 * destino: la carga contra una cuenta puente y la abona desde ella. Mientras
 * esa cuenta no esté declarada, el core rechaza la operación entera. Es el
 * mismo diseño que usa Odoo con su «cuenta de transferencia interna» y que SAP
 * llama *clearing account*; la diferencia es que Odoo la crea sola según la
 * localización y Fineract obliga a declararla.
 *
 * Tres reglas guían lo que este script crea, y conviene no romperlas después:
 *
 *  · **Las puente son cuentas dedicadas.** Reutilizar la cuenta de control de
 *    ahorros haría que los dos asientos de una transferencia se cancelen contra
 *    el mismo renglón, y una transferencia a medio camino quedaría invisible en
 *    la balanza. Es exactamente lo que la puente existe para evitar.
 *
 *  · **Deben quedar en cero al cierre.** Un saldo distinto de cero significa una
 *    transferencia colgada. Ese indicador es el beneficio de tenerlas aparte.
 *
 *  · **Bóveda y ventanilla son cuentas distintas.** El traspaso de bóveda a un
 *    cajero es un movimiento real; con una sola cuenta se deja de saber cuánto
 *    efectivo tiene cada ventanilla.
 *
 * La actividad de transferencias se define a nivel organización y no por
 * producto —así lo especifica la documentación de Apache— para que todos los
 * productos usen la misma y la conciliación sea una sola.
 *
 * ── Requiere credenciales de administración ─────────────────────────────────
 * El usuario de servicio del ERP **no** tiene —ni debe tener— permiso para
 * crear cuentas contables ni para reconfigurar las actividades financieras de
 * la institución. Su trabajo es replicar clientes, créditos y pagos; darle la
 * llave del catálogo contable ampliaría el daño de una credencial filtrada a
 * algo que ninguna integración necesita.
 *
 * Correrlo tal cual falla con «User has no authority to READ
 * financialactivityaccounts», y ese 403 es el sistema funcionando. Para usarlo
 * hay que apuntar `FINERACT_USER`/`FINERACT_PASSWORD` a un usuario con permisos
 * de administración, sólo mientras dura el aprovisionamiento.
 *
 * En la instalación de SUMA esto se hizo desde el portal, con la sesión de un
 * administrador, el 19 de septiembre de 2026. Este script queda como el registro
 * de qué se creó y como punto de partida para la siguiente instalación.
 *
 * ── Idempotente ─────────────────────────────────────────────────────────────
 * Reconoce las cuentas por su código contable y los mapeos por su actividad. Se
 * puede correr las veces que haga falta: informa lo que ya existe y sólo crea
 * lo que falta. Nunca reasigna un mapeo ya configurado —eso movería asientos
 * históricos de cuenta y no es una decisión de un script—.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';

/** Tipos contables de Fineract. */
const TIPO = { ACTIVO: 1, PASIVO: 2, CAPITAL: 3 } as const;
/** `usage`: 1 = cuenta de detalle (recibe movimientos), 2 = agrupadora. */
const DETALLE = 1;

interface Requerimiento {
  actividadId: number;
  etiqueta: string;
  glCode: string;
  nombre: string;
  tipo: number;
  descripcion: string;
}

/**
 * Los códigos son agrupadores del SAT, no un rango inventado.
 *
 * La primera versión de este script usaba un rango propio (x190) suponiendo que
 * el catálogo de Fineract sería ajeno al del ERP. Al mirarlo resultó falso: ya
 * venía sembrado con códigos agrupadores del SAT —101.01, 105.01, 401.32— y
 * hasta con la cuenta de capital `399-01 Carga de saldos iniciales`, que es
 * exactamente la contrapartida que pide la actividad 300. Inventar un rango
 * paralelo habría dejado dos convenciones en el mismo libro.
 *
 * De ahí que varias entradas apunten a cuentas que ya existen: la actividad no
 * necesita una cuenta nueva, necesita que se le diga cuál usar.
 */
const REQUERIDAS: Requerimiento[] = [
  {
    actividadId: 200,
    etiqueta: 'Transferencia de pasivos',
    glCode: '205.06',
    nombre: 'Transferencias en tránsito — pasivo',
    tipo: TIPO.PASIVO,
    descripcion:
      'Puente de las transferencias entre cuentas de captación. Debe cerrar en cero cada día; un saldo distinto de cero es una transferencia colgada.',
  },
  {
    actividadId: 100,
    etiqueta: 'Transferencia de activos',
    glCode: '107.05',
    nombre: 'Transferencias en tránsito — activo',
    tipo: TIPO.ACTIVO,
    descripcion:
      'Puente de las transferencias cuando lo que se mueve es un activo. Mismo criterio que la de pasivo: cierra en cero.',
  },
  {
    actividadId: 300,
    etiqueta: 'Contra de saldos iniciales',
    glCode: '399-01',
    nombre: 'Carga de saldos iniciales',
    tipo: TIPO.CAPITAL,
    descripcion:
      'Contrapartida de la carga de saldos iniciales. Ya venía sembrada en el catálogo: la actividad sólo necesitaba que se le dijera cuál usar.',
  },
  {
    actividadId: 101,
    etiqueta: 'Efectivo en bóveda principal',
    glCode: '101.01',
    nombre: 'Caja y efectivo',
    tipo: TIPO.ACTIVO,
    descripcion: 'Efectivo resguardado en bóveda, antes de asignarse a una ventanilla.',
  },
  {
    actividadId: 102,
    etiqueta: 'Efectivo en caja',
    glCode: '101.02',
    nombre: 'Efectivo en ventanilla',
    tipo: TIPO.ACTIVO,
    descripcion:
      'Efectivo en poder de los cajeros. Separada de bóveda a propósito: el traspaso entre ambas es un movimiento real que tiene que verse.',
  },
  {
    actividadId: 103,
    etiqueta: 'Fuente de fondos',
    glCode: '102.01',
    nombre: 'Bancos nacionales',
    tipo: TIPO.ACTIVO,
    descripcion: 'Cuenta bancaria de la que sale el dinero al desembolsar un crédito.',
  },
  {
    actividadId: 201,
    etiqueta: 'Dividendos por pagar',
    glCode: '214.01',
    nombre: 'Dividendos por pagar',
    tipo: TIPO.PASIVO,
    descripcion:
      'Dividendos decretados y no pagados de cuentas de participación. Sólo se mueve si se usa el módulo de acciones.',
  },
];

const ok = (m: string) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const info = (m: string) => console.log(`  \x1b[90m·\x1b[0m ${m}`);
const alto = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const http = app.get(FineractHttpService);

    const cuentas = await http.get<any[]>('/v1/glaccounts');
    const porCodigo = new Map<string, any>(
      (cuentas ?? []).map((c) => [String(c.glCode), c]),
    );
    const mapeos = await http.get<any[]>('/v1/financialactivityaccounts');
    const porActividad = new Map<number, any>(
      (mapeos ?? []).map((m) => [Number(m.financialActivityData?.id), m]),
    );

    titulo(
      `Catálogo actual: ${cuentas?.length ?? 0} cuentas · ${mapeos?.length ?? 0} de 7 actividades mapeadas`,
    );

    if (!aplicar) {
      titulo('Lo que haría (nada se escribe todavía)');
    }

    let cuentasCreadas = 0;
    let mapeosCreados = 0;

    for (const req of REQUERIDAS) {
      titulo(`${req.actividadId} · ${req.etiqueta}`);

      // ── La cuenta ────────────────────────────────────────────────────────
      let cuenta = porCodigo.get(req.glCode);
      if (cuenta) {
        info(`Cuenta ${req.glCode} «${cuenta.name}» ya existe (id ${cuenta.id}).`);
      } else if (!aplicar) {
        info(`Crearía la cuenta ${req.glCode} «${req.nombre}».`);
      } else {
        const respuesta = await http.post<{ resourceId?: number }>('/v1/glaccounts', {
          name: req.nombre,
          glCode: req.glCode,
          type: req.tipo,
          usage: DETALLE,
          manualEntriesAllowed: true,
          description: req.descripcion,
        });
        cuenta = { id: respuesta?.resourceId, name: req.nombre, glCode: req.glCode };
        porCodigo.set(req.glCode, cuenta);
        cuentasCreadas += 1;
        ok(`Cuenta ${req.glCode} «${req.nombre}» creada (id ${cuenta.id}).`);
      }

      // ── El mapeo ─────────────────────────────────────────────────────────
      const yaMapeada = porActividad.get(req.actividadId);
      if (yaMapeada) {
        /*
         * Un mapeo existente no se reasigna. Cambiar la cuenta de una actividad
         * después de que se asentaron movimientos deja los asientos históricos
         * apuntando a una cuenta y los nuevos a otra, sin nada que lo explique.
         * Si hay que cambiarlo, lo hace una persona sabiendo por qué.
         */
        const nombre =
          yaMapeada.glAccountData?.name ?? `cuenta ${yaMapeada.glAccountData?.id ?? '—'}`;
        alto(`Ya está mapeada a «${nombre}». No se toca.`);
        continue;
      }
      if (!aplicar) {
        info(`Mapearía la actividad ${req.actividadId} a la cuenta ${req.glCode}.`);
        continue;
      }
      if (!cuenta?.id) {
        alto('Sin id de cuenta: no se puede mapear. Revisa el error anterior.');
        continue;
      }
      await http.post('/v1/financialactivityaccounts', {
        financialActivityId: req.actividadId,
        glAccountId: Number(cuenta.id),
      });
      mapeosCreados += 1;
      ok(`Actividad ${req.actividadId} mapeada a ${req.glCode}.`);
    }

    titulo('Resultado');
    if (!aplicar) {
      info('Nada se escribió. Para aplicarlo:');
      info('  npm.cmd run fineract:contabilidad -- --aplicar');
    } else {
      const finales = await http.get<any[]>('/v1/financialactivityaccounts');
      ok(
        `${cuentasCreadas} cuenta(s) creada(s) · ${mapeosCreados} mapeo(s) nuevo(s) · ` +
          `${finales?.length ?? 0} de 7 actividades configuradas.`,
      );
      info('Las cuentas puente 107.05 y 205.06 deben cerrar en cero cada día.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
