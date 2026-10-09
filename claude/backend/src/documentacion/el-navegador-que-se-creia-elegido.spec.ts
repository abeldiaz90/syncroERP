import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RUTAS_CONOCIDAS,
  elegirNavegador,
} from './navegador-para-el-pdf';

/**
 * ============================================================================
 * El navegador que se creía elegido
 * ----------------------------------------------------------------------------
 * La resolución del navegador del PDF tenía una rama muerta: comprobaba con
 * `existsSync` el resultado de `executablePath()`, que desde puppeteer 23 es
 * una promesa. `existsSync` de una promesa devuelve `false` sin quejarse, así
 * que la rama «usa el Chromium del proyecto» no se tomaba nunca.
 *
 * No se cayó nada —se seguía a la lista de rutas conocidas y, al final, a
 * `undefined`, que también funciona— y por eso duró. Es el patrón de siempre:
 * la pieza buena existe y el camino real no la usa.
 *
 * Estas pruebas no necesitan navegador ni puppeteer: la resolución recibe el
 * módulo, el entorno y el comprobador de existencia. Lo de punta a punta lo
 * hace `npm run documentacion:pdf`, en node de verdad, porque bajo jest el
 * `require` de puppeteer (sólo ESM) falla siempre y ninguna prueba de aquí
 * puede llegar a generar un PDF.
 * ============================================================================
 */
describe('la elección del navegador para el PDF', () => {
  const SIN_NADA = {} as NodeJS.ProcessEnv;
  const nadaExiste = () => false;

  describe('lo que manda', () => {
    it('DOCUMENTACION_NAVEGADOR gana a todo lo demás', async () => {
      const elegido = await elegirNavegador(
        { executablePath: () => Promise.resolve('/del/proyecto') },
        { DOCUMENTACION_NAVEGADOR: '/el/mio', PUPPETEER_EXECUTABLE_PATH: '/otro' },
        () => true,
      );
      expect(elegido).toBe('/el/mio');
    });

    it('PUPPETEER_EXECUTABLE_PATH manda si no hay la nuestra', async () => {
      const elegido = await elegirNavegador(
        null,
        { PUPPETEER_EXECUTABLE_PATH: '/otro' },
        () => true,
      );
      expect(elegido).toBe('/otro');
    });

    it('una variable con espacios no cuenta como declarada', async () => {
      const elegido = await elegirNavegador(
        null,
        { DOCUMENTACION_NAVEGADOR: '   ' },
        nadaExiste,
      );
      expect(elegido).toBeUndefined();
    });
  });

  describe('el Chromium del propio puppeteer', () => {
    /*
     * El caso que el código anterior no atendía. Si esto se rompe otra vez,
     * `elegido` dejará de ser `undefined` y la prueba lo dirá.
     */
    it('se usa cuando `executablePath` devuelve una PROMESA y el archivo está', async () => {
      const elegido = await elegirNavegador(
        { executablePath: () => Promise.resolve('/cache/chrome') },
        SIN_NADA,
        (r) => r === '/cache/chrome',
      );
      expect(elegido).toBeUndefined();
    });

    it('se usa también cuando devuelve una CADENA, como en puppeteer viejo', async () => {
      const elegido = await elegirNavegador(
        { executablePath: () => '/cache/chrome' },
        SIN_NADA,
        (r) => r === '/cache/chrome',
      );
      expect(elegido).toBeUndefined();
    });

    it('si la ruta que anuncia no existe, se sigue buscando', async () => {
      const elegido = await elegirNavegador(
        { executablePath: () => Promise.resolve('/cache/chrome') },
        SIN_NADA,
        (r) => r === RUTAS_CONOCIDAS[0],
      );
      expect(elegido).toBe(RUTAS_CONOCIDAS[0]);
    });

    it('si `executablePath` revienta, no tumba la resolución', async () => {
      const elegido = await elegirNavegador(
        {
          executablePath: () => {
            throw new Error('no está descargado');
          },
        },
        SIN_NADA,
        (r) => r === RUTAS_CONOCIDAS[0],
      );
      expect(elegido).toBe(RUTAS_CONOCIDAS[0]);
    });

    it('sin módulo de puppeteer, se cae a las rutas conocidas', async () => {
      const elegido = await elegirNavegador(null, SIN_NADA, (r) =>
        r === RUTAS_CONOCIDAS[0],
      );
      expect(elegido).toBe(RUTAS_CONOCIDAS[0]);
    });
  });

  describe('cuando no hay ninguno', () => {
    it('devuelve undefined, para que lo intente puppeteer con lo suyo', async () => {
      const elegido = await elegirNavegador(null, SIN_NADA, nadaExiste);
      expect(elegido).toBeUndefined();
    });
  });

  describe('la prueba de la prueba', () => {
    /*
     * Un `existsSync` crudo sobre lo que devuelve `executablePath()` es
     * exactamente el error que estuvo aquí. Que no vuelva por copiar y pegar.
     */
    it('nadie comprueba la ruta del navegador sin esperar la promesa', () => {
      const fuente = readFileSync(
        join(__dirname, 'navegador-para-el-pdf.ts'),
        'utf8',
      );
      expect(fuente).toMatch(/await \(modulo\.executablePath/);
      expect(fuente).not.toMatch(/existe\(\s*modulo\.executablePath\(\)\s*\)/);
    });

    it('el servicio ya no resuelve el navegador por su cuenta', () => {
      const fuente = readFileSync(
        join(__dirname, 'documentacion.service.ts'),
        'utf8',
      );
      expect(fuente).toMatch(/await this\.navegadorInstalado\(\)/);
      expect(fuente).not.toMatch(/const conocidas = \[/);
    });

    /*
     * Dos PDF a la vez compartían el perfil temporal que puppeteer se inventa
     * y el segundo no salía. Un directorio propio por petición lo arregla; si
     * alguien lo quita, esto se pone rojo antes de que lo note un usuario.
     */
    it('cada PDF se arma con su propio perfil temporal, y lo recoge', () => {
      const fuente = readFileSync(
        join(__dirname, 'documentacion.service.ts'),
        'utf8',
      );
      expect(fuente).toMatch(/mkdtempSync\(join\(tmpdir\(\), 'syncro-pdf-'\)\)/);
      expect(fuente).toMatch(/userDataDir: perfil,/);
      expect(fuente).toMatch(/rmSync\(perfil, \{[^}]*recursive: true/);
      /* El borrado no puede tumbar un PDF que ya está hecho. */
      expect(fuente).toMatch(/\} catch \{\s*this\.logger\.warn\(/);
    });
  });
});
