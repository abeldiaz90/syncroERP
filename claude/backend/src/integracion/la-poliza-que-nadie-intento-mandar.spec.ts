/**
 * ============================================================================
 * La póliza que nadie intentó mandar
 * ----------------------------------------------------------------------------
 * El 25-sep-2026 se añadió al cierre mensual el control `ESPEJO_CONTABLE`,
 * porque agosto se había cerrado con cinco pólizas que nunca llegaron al mayor
 * externo. Ese control cuenta la bandeja de salida: FALLIDO, REINTENTABLE y
 * PENDIENTE. Cubre todo lo que se intentó y no salió.
 *
 * El 30-sep-2026, revisando el espejo contra la instalación, apareció la otra
 * mitad. Ocho pólizas VIGENTES de los días 13, 14 y 15 de septiembre **sin un
 * solo evento de espejo**:
 *
 *   DI-2026-00010  Costo de ventas — Ticket #9
 *   IN-2026-00013  Ingresos — Ticket #9
 *   IN-2026-00003  Cobranza — Crédito 38d4b3be
 *   IN-2026-00004  Ingresos — Ticket #3
 *   DI-2026-00002  Devolución DEV-2 · Venta #2
 *   IN-2026-00002  Ingresos — Ticket #2
 *   IN-2026-00001  Cobranza — Crédito ab28035f
 *   DI-2026-00001  Devolución DEV-1 · Venta #1
 *
 * Nacieron antes del suscriptor, o con el espejo apagado. No fallaron: nadie
 * las intentó. Y ahí está lo importante — **no están en ninguna bandeja**, así
 * que el control no las veía y septiembre se habría cerrado en verde con los
 * dos libros distintos. El mismo defecto que el control vino a impedir,
 * entrando por la puerta de al lado.
 *
 * Un asiento que falló da la cara. Uno que nunca se encoló, no.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { existsSync } from 'fs';

import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const RUTA_PANTALLA = FRONTEND
  ? join(FRONTEND, 'app/dashboard/finanzas/espejo-contable/page.tsx')
  : '';
const hayPantalla = Boolean(RUTA_PANTALLA && existsSync(RUTA_PANTALLA));
const pantalla = hayPantalla ? readFileSync(RUTA_PANTALLA, 'utf8') : '';

const cierre = readFileSync(
  join(__dirname, '..', 'finanzas', 'services', 'cierre-contable.service.ts'),
  'utf8',
);
const publicador = readFileSync(
  join(__dirname, 'services', 'contabilidad-publicador.service.ts'),
  'utf8',
);
const controlador = readFileSync(
  join(__dirname, 'controllers', 'integracion.controller.ts'),
  'utf8',
);
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('El cierre cuenta también lo que nunca se encoló', () => {
  const codigo = sinComentarios(cierre);

  it('la consulta busca pólizas VIGENTES sin evento de espejo', () => {
    expect(codigo).toMatch(/AS "sinEncolar"/);
    expect(codigo).toMatch(/p2\.estatus = 'VIGENTE'/);
    expect(codigo).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM integracion_eventos ev\s*WHERE ev\.entidadId = p2\.id/,
    );
  });

  it('respeta el corte del período, como el resto del control', () => {
    /*
     * La regla asimétrica del control: lo anterior al corte cuenta, lo
     * posterior no. Una póliza de octubre no puede bloquear el cierre de
     * septiembre por no estar espejada todavía.
     */
    expect(codigo).toMatch(/p2\.fecha <= \$3::date/);
  });

  it('no cuenta pólizas de otra empresa', () => {
    expect(codigo).toMatch(/p2\.empresaId = \$1/);
  });

  it('lo que nunca se encoló SUMA al total que bloquea', () => {
    expect(codigo).toMatch(
      /const espejoSinEntregar =[\s\S]{0,200}\+\s*espejoSinEncolar;/,
    );
  });

  it('la descripción distingue los dos casos, porque se arreglan distinto', () => {
    expect(cierre).toMatch(/que nunca se encolaron/);
    expect(cierre).toMatch(/no están detenidas en ninguna /);
    expect(cierre).toMatch(/Encólalas desde Integración › Espejo contable/);
  });

  it('y el verde ya no habla sólo de la bandeja', () => {
    /*
     * Decía «la bandeja de salida no tiene nada sin entregar», que era cierto
     * y aun así insuficiente: la bandeja puede estar impecable y faltar ocho
     * pólizas que nunca entraron en ella.
     */
    expect(cierre).not.toMatch(
      /La bandeja de salida no tiene nada sin entregar/,
    );
    expect(cierre).toMatch(
      /Todas las pólizas del período llegaron al mayor externo/,
    );
  });
});

describe('Y hay por dónde arreglarlo, que si no el bloqueo no tiene salida', () => {
  const codigo = sinComentarios(publicador);

  it('el espejo apagado no reclama nada', () => {
    /*
     * Quien no espeja contabilidad no tiene pólizas «faltantes»: pedirle que
     * encole ochenta asientos a un mayor que no usa es ruido con consecuencias.
     */
    expect(codigo).toMatch(
      /async polizasSinEspejo\([\s\S]{0,200}if \(!\(await this\.activoPara\(empresaId\)\)\) return \[\];/,
    );
  });

  it('la subconsulta nombra la empresa, aunque hoy sea redundante', () => {
    expect(codigo).toMatch(/ev\.empresaId = p\.empresaId/);
  });

  it('encolar es idempotente: pulsarlo dos veces no duplica nada', () => {
    /*
     * La clave del outbox es `poliza:<id>`, así que el segundo intento choca
     * con la única de idempotencia y no escribe. Quien lo pulse dos veces por
     * nervios no hace daño.
     */
    expect(publicador).toMatch(/claveIdempotencia: `poliza:\$\{polizaId\}`/);
    expect(codigo).toMatch(
      /async encolarFaltantes\([\s\S]{0,400}await this\.polizaRegistrada\(empresaId, poliza\.id\)/,
    );
  });

  it('encolar NO despacha: son dos decisiones distintas', () => {
    expect(codigo).not.toMatch(/encolarFaltantes[\s\S]{0,600}despachar/);
  });

  it('devuelve los folios, no sólo un número', () => {
    /*
     * «Encoladas: 8» obliga a ir a buscar cuáles. Los folios son lo que quien
     * cierra el mes va a pegar en su papel de trabajo.
     */
    expect(codigo).toMatch(/folios: faltantes\.map\(\(p\) => p\.folio\)/);
  });
});

describe('Quien lleva el espejo puede verlas y encolarlas', () => {
  it('las dos rutas existen y están bajo el rol del espejo', () => {
    const codigo = sinComentarios(controlador);
    expect(codigo).toMatch(
      /@Get\('contabilidad\/polizas-sin-espejo'\)\s*@Roles\(\.\.\.ROLES_ESPEJO_CONTABLE\)/,
    );
    expect(codigo).toMatch(
      /@Post\('contabilidad\/encolar-faltantes'\)\s*@Roles\(\.\.\.ROLES_ESPEJO_CONTABLE\)/,
    );
  });

  it('y son irrenunciables para quien lleva el espejo', () => {
    /*
     * Si se pudieran quitar por rol, el cierre bloquearía sin que nadie
     * pudiera desbloquearlo: un control sin salida es una puerta tapiada.
     */
    const conEspejo = PLANTILLAS_PERMISOS.filter((p) =>
      (p.accionesIrrenunciables ?? []).includes('POST /integracion/outbox/despachar'),
    );
    expect(conEspejo.length).toBeGreaterThan(0);
    for (const plantilla of conEspejo) {
      expect(plantilla.accionesIrrenunciables).toContain(
        'GET /integracion/contabilidad/polizas-sin-espejo',
      );
      expect(plantilla.accionesIrrenunciables).toContain(
        'POST /integracion/contabilidad/encolar-faltantes',
      );
      expect(plantilla.accionesVedadas ?? []).not.toContain(
        'POST /integracion/contabilidad/encolar-faltantes',
      );
    }
  });
});

describe('La pantalla del espejo las enseña, y no promete de más', () => {
  it('pide las que nunca se encolaron', () => {
    if (!hayPantalla) return;
    expect(pantalla).toContain(
      '"/integracion/contabilidad/polizas-sin-espejo"',
    );
  });

  it('el botón sólo se dibuja para quien puede pulsarlo', () => {
    /*
     * Esta pantalla ya aprendió esto una vez: el contador corrió, pulsó
     * «Despachar la cola» y recibió un 403 con un aviso que se desvanecía.
     */
    if (!hayPantalla) return;
    expect(pantalla).toMatch(
      /puedeEncolarFaltantes = tienePermiso\(\s*"POST",\s*"\/integracion\/contabilidad\/encolar-faltantes",/,
    );
    expect(pantalla).toMatch(/puedeEncolarFaltantes \? \(/);
  });

  it('dice que encolar no es mandar', () => {
    if (!hayPantalla) return;
    expect(pantalla).toMatch(/Encolarlas no las manda/);
    expect(pantalla).toMatch(/Todavía no han salido: despacha la cola/);
  });

  it('el «nada detenido» ya no afirma que todas están espejadas', () => {
    /*
     * Decía «Todas las pólizas encontraron su reflejo en el mayor externo» y
     * sólo sabía que nada estaba detenido. Con ocho sin encolar, esa frase
     * salía en verde y era falsa.
     */
    if (!hayPantalla) return;
    expect(pantalla).not.toMatch(
      /Todas las pólizas encontraron su reflejo en el mayor externo/,
    );
    expect(pantalla).toMatch(/nunca se encolaron: están arriba/);
  });

  it('el indicador «sin espejar» cuenta las dos cosas', () => {
    if (!hayPantalla) return;
    expect(pantalla).toMatch(
      /valor=\{\(sinEntregar\.datos\?\.length \?\? 0\) \+ totalSinEncolar\}/,
    );
  });

  it('mientras no se sabe, es cero: no dibuja el panel ni suma', () => {
    if (!hayPantalla) return;
    expect(pantalla).toMatch(
      /const totalSinEncolar = sinEncolar\.datos\?\.total \?\? 0;/,
    );
  });
});

describe('«No llegaron» es más que «fallaron»', () => {
  /*
   * Encolar las ocho las movió de «sin encolar» a PENDIENTE — y la pantalla
   * volvió a decir «nada detenido», ahora con ocho esperando, porque la tabla
   * pedía sólo FALLIDO. El arreglo creó un punto ciego nuevo a dos pasos del
   * que venía a tapar. Visto en vivo el 30-sep-2026, con el contador.
   */
  const outbox = readFileSync(
    join(__dirname, 'services', 'integracion-outbox.service.ts'),
    'utf8',
  );

  it('el listado admite varios estados', () => {
    expect(outbox).toMatch(/estados\.length === 1 \? estados\[0\] : In\(estados\)/);
  });

  it('sin estado sigue devolviendo todo, no nada', () => {
    /*
     * `''.split(',')` da `['']`, que filtrado queda vacío. Si eso se colara
     * como estado, la pantalla sin filtro no devolvería ni una fila.
     */
    expect(outbox).toMatch(/\.filter\(Boolean\)/);
    expect(outbox).toMatch(/\.\.\.\(estados\.length/);
  });

  it('la pantalla pide los tres estados que el cierre cuenta', () => {
    if (!hayPantalla) return;
    expect(pantalla).toMatch(/estado: "FALLIDO,REINTENTABLE,PENDIENTE"/);
  });

  it('y un PENDIENTE no se enseña como avería', () => {
    if (!hayPantalla) return;
    expect(pantalla).toMatch(
      /Todavía no se ha intentado; sale en el siguiente despacho/,
    );
  });
});
