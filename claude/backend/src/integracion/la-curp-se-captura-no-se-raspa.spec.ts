/**
 * ============================================================================
 * La CURP se captura, no se raspa
 * ----------------------------------------------------------------------------
 * Decisión de Abel, 1-oct-2026: «la CURP ya no la consultes por RPA, solo
 * permite su captura si es necesario».
 *
 * Lo que había era un módulo que abría un navegador sin ventana contra el
 * portal público de gob.mx, le interceptaba la respuesta de su API interno y
 * devolvía los datos del registro nacional. Iba montado sobre
 * `puppeteer-extra-plugin-stealth`, un complemento cuyo único propósito es que
 * el sitio del otro lado no detecte que lo está visitando un robot.
 *
 * Tres razones para que no estuviera ahí, en orden de peso:
 *
 *   1. Esquivar la detección de robots de un portal de gobierno no es algo que
 *      se le entrega a un cliente. No es una zona gris técnica: el complemento
 *      existe para eso y nada más.
 *   2. Es frágil por construcción. Depende de la maquetación y del API interno
 *      de un sitio ajeno; el día que cambien —sin avisar, porque no hay a
 *      quién avisar— el ERP deja de validar identidades y nadie sabe por qué.
 *   3. **No funcionaba.** Consultaba una tabla `curp` que ninguna migración
 *      crea. El tablero de verificación lo decía en ámbar —«faltan migraciones
 *      por correr»— y llevaba meses diciéndolo.
 *
 * Lo que se queda es lo que de verdad hacía falta: la CURP se **captura** en el
 * expediente del cliente y en el alta del empleado, y se valida su estructura
 * de 18 caracteres. Comprobarla contra el registro nacional exige un convenio
 * institucional, no un navegador automatizado, y el puerto de KYC ya está
 * declarado para cuando ese convenio exista.
 *
 * Este archivo existe para que el módulo no vuelva por inercia: alguien
 * buscando «consulta de CURP» en el historial del repositorio encuentra código
 * que funcionaba y lo reinstala sin enterarse de por qué salió.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BACKEND = join(__dirname, '..');
const RAIZ = join(BACKEND, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const archivosDe = (raiz: string, extensiones: string[]): string[] => {
  const salida: string[] = [];
  const caminar = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre === '.next') continue;
      const completo = join(dir, nombre);
      if (statSync(completo).isDirectory()) caminar(completo);
      else if (extensiones.some((e) => completo.endsWith(e)))
        salida.push(completo);
    }
  };
  caminar(raiz);
  return salida;
};

describe('El módulo que raspaba gob.mx ya no está', () => {
  it('no queda el directorio `src/rpa`', () => {
    expect(existsSync(join(BACKEND, 'rpa'))).toBe(false);
  });

  it('no queda registrado en el módulo raíz', () => {
    const app = readFileSync(join(BACKEND, 'app.module.ts'), 'utf8');
    expect(app).not.toMatch(/RpaModule/);
    expect(app).not.toMatch(/curp-rpa/);
  });

  it('ni su pantalla en el frontend', () => {
    if (!FRONTEND) return;
    expect(existsSync(join(FRONTEND, 'app/dashboard/rpa'))).toBe(false);
  });

  it('ni su entrada en el menú', () => {
    if (!FRONTEND) return;
    const menu = readFileSync(
      join(FRONTEND, 'app/dashboard/module-config.ts'),
      'utf8',
    );
    expect(menu).not.toMatch(/dashboard\/rpa/);
  });

  it('ni su endpoint en el catálogo de pantallas navegables', () => {
    /*
     * Si se queda, el servidor sigue ofreciendo un enlace a una ruta que ya no
     * existe y la pantalla contesta 404. Un menú que lleva a ninguna parte es
     * el defecto que este proyecto lleva corrigiendo desde el primer día.
     */
    const catalogo = readFileSync(
      join(BACKEND, 'iam', 'data', 'endpoints-navegables.ts'),
      'utf8',
    );
    expect(catalogo).not.toMatch(/rpa\/curp/);
  });

  it('ni la variable de entorno que lo encendía', () => {
    const entorno = readFileSync(
      join(BACKEND, 'config', 'validar-entorno.ts'),
      'utf8',
    );
    expect(entorno).not.toMatch(/CURP_RPA_HABILITADO/);
  });
});

describe('Y no queda nadie llamándolo', () => {
  it('ninguna línea del servidor menciona `rpa/curp`', () => {
    const codigo = archivosDe(BACKEND, ['.ts'])
      .filter((f) => !f.endsWith('la-curp-se-captura-no-se-raspa.spec.ts'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(codigo).not.toMatch(/rpa\/curp/);
  });

  it('ninguna pantalla pregunta por el historial de consultas', () => {
    /*
     * El tablero de verificación lo hacía, y era la única llamada que quedaba
     * viva: la que destapó este pendiente al dejar huérfano un endpoint.
     */
    if (!FRONTEND) return;
    const codigo = ['app', 'components']
      .map((d) => join(FRONTEND, d))
      .filter((d) => existsSync(d))
      .flatMap((d) => archivosDe(d, ['.tsx', '.ts']))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(codigo).not.toMatch(/rpa\/curp/);
  });
});

describe('El complemento de evasión de detección salió del proyecto', () => {
  const paquete = JSON.parse(
    readFileSync(join(BACKEND, '..', 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const deps = Object.keys(paquete.dependencies ?? {});

  it('`puppeteer-extra-plugin-stealth` ya no es dependencia', () => {
    /*
     * Es la pieza concreta cuyo propósito es esquivar la detección de robots.
     * Mientras siga instalada, el módulo se puede rehacer en una tarde.
     */
    expect(deps).not.toContain('puppeteer-extra-plugin-stealth');
  });

  it('ni `puppeteer-extra`', () => {
    expect(deps).not.toContain('puppeteer-extra');
  });

  it('pero `puppeteer` se queda: la documentación imprime PDF con él', () => {
    /*
     * La prueba en el otro sentido. «Quitar lo del navegador» se convierte muy
     * fácil en quitar también lo legítimo, y el manual del ERP se genera con
     * puppeteer.
     */
    expect(deps).toContain('puppeteer');
    const docu = readFileSync(
      join(BACKEND, 'documentacion', 'documentacion.service.ts'),
      'utf8',
    );
    expect(docu).toMatch(/require\('puppeteer'\)/);
  });
});

describe('Lo que se queda es la captura', () => {
  it('el cliente tiene su campo CURP y el servidor lo acepta', () => {
    const dto = readFileSync(
      join(BACKEND, 'clientes', 'crear-cliente.dto.ts'),
      'utf8',
    );
    expect(dto).toMatch(/curp/);
    const entidad = readFileSync(
      join(BACKEND, 'clientes', 'entities', 'cliente.entity.ts'),
      'utf8',
    );
    expect(entidad).toMatch(/curp/);
  });

  it('el empleado también', () => {
    const entidad = readFileSync(
      join(BACKEND, 'rrhh', 'entities', 'rrhh.entity.ts'),
      'utf8',
    );
    expect(entidad).toMatch(/curp/i);
  });

  it('y la pantalla valida la estructura antes de guardar', () => {
    /*
     * Sin consulta al registro, la validación de estructura es lo único que
     * separa una CURP de una cadena cualquiera de 18 caracteres. Si se quita,
     * la captura deja de valer y entonces sí no quedaría nada.
     */
    if (!FRONTEND) return;
    const alta = readFileSync(
      join(FRONTEND, 'app/dashboard/rrhh/components/AsistenteEmpleado.tsx'),
      'utf8',
    );
    expect(alta).toMatch(/\^\[A-Z\]\{4\}\\d\{6\}\[HM\]\[A-Z\]\{5\}\[A-Z0-9\]\\d\$/);

    const clientes = readFileSync(
      join(FRONTEND, 'app/dashboard/clientes/page.tsx'),
      'utf8',
    );
    expect(clientes).toMatch(/La CURP debe tener exactamente 18 caracteres/);
  });
});

describe('El tablero dice la verdad en lugar de contar consultas', () => {
  const ruta = FRONTEND
    ? join(FRONTEND, 'components/verificaciones/tablero-verificaciones.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const tablero = hay ? readFileSync(ruta, 'utf8') : '';

  it('ya no avisa de migraciones que no existen', () => {
    /*
     * Ese aviso en ámbar llevaba meses pidiendo correr una migración que nadie
     * escribió nunca. Un pendiente que no se puede cerrar enseña a ignorar los
     * avisos del tablero, que es lo contrario de lo que un tablero hace.
     */
    if (!hay) return;
    expect(tablero).not.toMatch(/faltan migraciones por correr/);
  });

  it('y la tarjeta sigue ahí, explicando cómo entra la CURP', () => {
    /*
     * Borrarla habría dejado un hueco, y un hueco manda a buscar un módulo que
     * ya no está. La pregunta que contestaba —«¿qué pasa con la CURP aquí?»—
     * sigue siendo válida; lo que cambia es la respuesta.
     */
    if (!hay) return;
    expect(tablero).toMatch(/No hay consulta automatizada al/);
    expect(tablero).toMatch(/valida su estructura/);
  });
});

describe('Y el puerto de KYC ya no lo nombra como su implementación', () => {
  it('no se promete RENAPO por la puerta del RPA', () => {
    /*
     * El puerto decía «implementaciones previstas: INE/RENAPO vía el RPA de
     * CURP que ya existe en el ERP». Dejarlo escrito sería dejar el plan de
     * volver a ponerlo, en el archivo que alguien lee justo antes de elegir
     * proveedor.
     */
    const puerto = readFileSync(
      join(BACKEND, 'integracion', 'ports', 'validacion-identidad.port.ts'),
      'utf8',
    );
    const previstas = puerto.slice(
      puerto.indexOf('Implementaciones previstas'),
      puerto.indexOf('Aquí decía'),
    );
    expect(previstas).not.toBe('');
    expect(previstas).not.toMatch(/RPA/);
    expect(previstas).toMatch(/integración institucional autorizada/);
    /* Y queda escrito por qué salió, que es lo que evita que vuelva. */
    expect(puerto).toMatch(/Ese RPA se retiró/);
  });
});
