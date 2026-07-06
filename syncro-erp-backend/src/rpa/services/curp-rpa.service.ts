import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteerExtra = require('puppeteer-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(StealthPlugin());

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Injectable()
export class CurpRpaService implements OnModuleDestroy {
  private readonly logger = new Logger(CurpRpaService.name);
  private browser: any = null;

  constructor(private readonly dataSource: DataSource) {}

  // ── Inicializar Puppeteer con stealth ─────────────────────────────────────
  private async getBrowser() {
    if (this.browser) return this.browser;

    this.browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });
    this.logger.log('[CURP RPA] Browser iniciado');
    return this.browser;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTAR — intercepta la respuesta del API interno del portal gob.mx
  // ══════════════════════════════════════════════════════════════════════════
  async consultar(
    tipo:    'CURP' | 'DATOS',
    payload: {
      curp?:            string;
      nombre?:          string;
      primerApellido?:  string;
      segundoApellido?: string;
      fechaNacimiento?: string; // DD/MM/YYYY
      sexo?:            string;
      entidadNacimiento?: string;
    },
    empresaId: string,
    usuarioId?: string,
  ) {
    // ── Cache: si ya existe la CURP en BD, devolver sin hacer RPA ──────────
    if (tipo === 'CURP' && payload.curp) {
      const curpLimpia = payload.curp.toUpperCase().trim();
      const cache = await this.dataSource.query(
        'SELECT TOP 1 id, curp, nombre, primerApellido, segundoApellido, ' +
        'fechaNacimiento, sexo, entidadNacimiento, statusCurp, docProbatorio, ' +
        'anioRegistro, numActa, entidadRegistro, municipioRegistro ' +
        'FROM curp ' +
        'WHERE empresaId = @0 AND curp = @1',
        [empresaId, curpLimpia]
      ).catch(() => []);

      if (cache.length > 0) {
        const c = cache[0];
        this.logger.log('[CURP RPA] ✅ CURP encontrada en caché — sin RPA');
        const resultadoCache = {
          exitosa: true, desdeCache: true,
          curp: c.curpRegistrada ?? c.curp, nombre: c.nombre,
          primerApellido: c.primerApellido, segundoApellido: c.segundoApellido,
          fechaNacimiento: c.fechaNacimiento, sexo: c.sexo,
          entidadNacimiento: c.entidadNacimiento, statusCurp: c.statusCurp,
          docProbatorio: c.docProbatorio,
          anioRegistro: c.anioRegistro, numActa: c.numActa,
          entidadRegistro: c.entidadRegistro, municipioRegistro: c.municipioRegistro,
        };
        // Registrar la consulta en auditoría aunque sea caché
        await this.guardarConsulta(tipo, payload, resultadoCache, empresaId, usuarioId, c.id, true);
        return resultadoCache;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const browser = await this.getBrowser();
    const page    = await browser.newPage();

    try {
      // Emular navegador real
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-MX,es;q=0.9' });

      // Interceptar la respuesta del API interno
      let apiResponse: any = null;
      page.on('response', async (response: any) => {
        const url = response.url();
        // Capturar TODA respuesta JSON — el portal puede usar cualquier endpoint
        const contentType = response.headers()['content-type'] ?? '';
        const esJson = contentType.includes('json');
        const esCurpUrl = url.includes('curp') || url.includes('renapo') ||
                          url.includes('segob') || url.includes('gobmx');

        if (esJson && (esCurpUrl || url.includes('gob.mx'))) {
          try {
            const json = await response.json().catch(() => null);
            if (json && typeof json === 'object' && !Array.isArray(json)) {
              // Solo guardar si tiene datos relevantes de persona
              const tieneDatos = json.curp || json.CURP || json.nombres || json.NOMBRES ||
                                 json.primerApellido || json.nombre || json.statusCurp ||
                                 json.status === 'OK' || json.estatus === 'OK';
              if (tieneDatos) {
                apiResponse = json;
                this.logger.log('[CURP RPA] ✅ Datos CURP interceptados de: ' + url);
              } else {
                this.logger.debug('[CURP RPA] JSON sin datos CURP: ' + url);
              }
            }
          } catch { /* ignorar */ }
        }
      });

      // Navegar al portal
      this.logger.log('[CURP RPA] Navegando a gob.mx/curp...');
      await page.goto('https://www.gob.mx/curp/', {
        waitUntil: 'networkidle2',
        timeout:   30000,
      });

      // Esperar que cargue la SPA de Ember
      await page.waitForSelector('input, .curp-input, [data-curp], form', { timeout: 15000 })
        .catch(() => this.logger.warn('[CURP RPA] Selector principal no encontrado, continuando...'));

      await esperar(3000); // Dar más tiempo a Ember para renderizar

      if (tipo === 'CURP') {
        await this.buscarPorCurp(page, payload.curp!);
      } else {
        await this.buscarPorDatos(page, payload);
      }

      // La espera de section.results se hace después — ya no necesitamos este race

      // Esperar específicamente a que aparezca section.results (resultado del portal)
      try {
        await page.waitForSelector('section.results', { timeout: 30000 });
        this.logger.log('[CURP RPA] ✅ section.results encontrada — extrayendo datos');
        await esperar(800); // pequeña pausa para que Ember termine de renderizar
      } catch {
        this.logger.warn('[CURP RPA] Timeout esperando section.results');
      }

      // Si no interceptamos el API, extraer directamente del DOM
      if (!apiResponse) {
        apiResponse = await this.extraerResultadoDOM(page);
        if (apiResponse?.curp) {
          this.logger.log('[CURP RPA] ✅ Datos extraídos del DOM: ' + apiResponse.curp);
        } else {
          this.logger.warn('[CURP RPA] Sin datos en DOM — posible error o CAPTCHA');
        }
      }

      const resultado = this.parsearRespuesta(apiResponse, tipo === 'CURP' ? payload.curp : undefined);

      // 1. Guardar datos maestros en tabla curp
      const curpId = await this.upsertCurp(resultado, empresaId);

      // 2. Guardar auditoría en consultas_curp
      await this.guardarConsulta(tipo, payload, resultado, empresaId, usuarioId, curpId, false);

      return resultado;

    } catch (err: any) {
      this.logger.error('[CURP RPA] Error: ' + err?.message);
      return { exitosa: false, error: err?.message ?? 'Error en RPA' };
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ── Llenar formulario por CURP ────────────────────────────────────────────
  private async buscarPorCurp(page: any, curp: string) {
    this.logger.log('[CURP RPA] Buscando por CURP: ' + curp);

    // Intentar varios selectores comunes del portal
    const selectores = [
      'input[placeholder*="CURP"]',
      'input[id*="curp"]',
      'input[name*="curp"]',
      '#curpInput',
      '.curp-field input',
      'input[maxlength="18"]',
    ];

    let inputEncontrado = false;
    for (const sel of selectores) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel, { clickCount: 3 });
        await page.type(sel, curp, { delay: 80 });
        inputEncontrado = true;
        this.logger.log('[CURP RPA] Campo encontrado con selector: ' + sel);
        break;
      } catch { /* probar siguiente */ }
    }

    if (!inputEncontrado) {
      // Intentar con evaluación directa
      await page.evaluate((c: string) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const field  = inputs.find(i =>
          i.placeholder?.toUpperCase().includes('CURP') ||
          i.id?.toLowerCase().includes('curp') ||
          i.maxLength === 18
        );
        if (field) { field.value = c; field.dispatchEvent(new Event('input', { bubbles: true })); }
      }, curp);
    }

    await esperar(500);

    // Presionar Enter o buscar botón de búsqueda
    await page.keyboard.press('Enter').catch(() => {});

    const botones = ['button[type="submit"]', 'button.buscar', '.btn-buscar', 'button:contains("Buscar")'];
    for (const btn of botones) {
      try { await page.click(btn); break; } catch { /* siguiente */ }
    }
  }

  // ── Llenar formulario por datos (escritura real para Ember.js) ────────────
  private async buscarPorDatos(page: any, datos: any) {
    this.logger.log('[CURP RPA] Buscando por datos personales');

    // Helper: clic + limpiar + teclear (simula humano — Ember lo acepta)
    const teclear = async (sel: string, valor: string) => {
      if (!valor) return;
      try {
        await page.click(sel, { clickCount: 3 }); // seleccionar todo
        await page.keyboard.press('Backspace');
        await page.type(sel, valor, { delay: 50 });
        this.logger.log('[CURP RPA] Tecleado: ' + sel + ' = ' + valor);
      } catch (e: any) {
        this.logger.warn('[CURP RPA] No se pudo teclear en ' + sel + ': ' + e?.message);
      }
    };

    // Helper: select con clic y tecla (más compatible con Ember)
    const seleccionar = async (sel: string, valor: string) => {
      if (!valor) return;
      try {
        await page.select(sel, valor);
        // También disparar eventos manualmente por si acaso
        await page.evaluate((s: string, v: string) => {
          const el = document.querySelector(s) as HTMLSelectElement;
          if (el) {
            el.value = v;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, sel, valor);
        this.logger.log('[CURP RPA] Select: ' + sel + ' = ' + valor);
      } catch (e: any) {
        this.logger.warn('[CURP RPA] No se pudo seleccionar en ' + sel + ': ' + e?.message);
      }
    };

    // Hacer clic en tab "Datos Personales" (a[href="#tab-02"])
    await page.click('a[href="#tab-02"]').catch(async () => {
      await page.evaluate(() => {
        const el = document.querySelector('a[href="#tab-02"]') as HTMLElement;
        if (el) el.click();
      });
    });
    this.logger.log('[CURP RPA] Tab #tab-02 activado');
    await esperar(1500); // Bootstrap necesita tiempo para mostrar el tab

    // Parsear fecha DD/MM/YYYY → partes separadas
    let dia = '', mes = '', anio = '';
    if (datos.fechaNacimiento) {
      const partes = datos.fechaNacimiento.split('/');
      if (partes.length === 3) {
        dia  = partes[0].padStart(2, '0');
        mes  = partes[1].padStart(2, '0');
        anio = partes[2];
      }
    }

    // Llenar campos texto (IDs exactos del portal gob.mx/curp)
    await teclear('#nombre',         (datos.nombre           ?? '').toUpperCase());
    await teclear('#primerApellido', (datos.primerApellido   ?? '').toUpperCase());
    await teclear('#segundoApellido',(datos.segundoApellido  ?? '').toUpperCase());
    await teclear('#selectedYear',   anio);

    // Selects
    await seleccionar('#diaNacimiento', dia);
    await seleccionar('#mesNacimiento', mes);
    await seleccionar('#sexo',          datos.sexo              ?? '');
    await seleccionar('#claveEntidad',  datos.entidadNacimiento ?? '');

    await esperar(1000);

    // Capturar HTML antes de enviar para debug
    const htmlAntes = await page.content();
    require('fs').writeFileSync(
      require('path').join(process.cwd(), 'curp-debug-antes-submit.html'), htmlAntes
    );

    // Clic en botón #searchButton
    await page.click('#searchButton').catch(async () => {
      this.logger.warn('[CURP RPA] #searchButton no disponible — usando keyboard Enter');
      await page.keyboard.press('Enter');
    });
    this.logger.log('[CURP RPA] Formulario enviado');
  }

  // ── Extraer resultado del DOM (fallback) ──────────────────────────────────
  private async extraerResultadoDOM(page: any) {
    return page.evaluate(() => {
      // ── Estructura confirmada del portal gob.mx/curp ──────────────────────
      // Los datos están en section.results > table > tr > td (pares label:valor)
      const section = document.querySelector('section.results');
      if (!section) return null;

      // Construir mapa label => valor desde las filas de la tabla
      const mapa: Record<string, string> = {};
      const filas = section.querySelectorAll('tr');
      filas.forEach((fila: Element) => {
        const tds = fila.querySelectorAll('td');
        if (tds.length >= 2) {
          const label = tds[0].textContent?.replace(':', '').trim().toLowerCase() ?? '';
          const valor = tds[1].textContent?.trim() ?? '';
          if (label && valor) mapa[label] = valor;
        }
      });

      // CURP desde atributo del ember-view
      const emberView = document.querySelector('[curp]');
      const curpAttr  = emberView?.getAttribute('curp') ?? mapa['curp'] ?? '';

      return {
        curp:              curpAttr,
        nombres:           mapa['nombre(s)']            ?? mapa['nombres']            ?? '',
        primerApellido:    mapa['primer apellido']      ?? '',
        segundoApellido:   mapa['segundo apellido']     ?? '',
        sexo:              mapa['sexo']                 ?? '',
        fechaNacimiento:   mapa['fecha de nacimiento']  ?? '',
        nacionalidad:      mapa['nacionalidad']         ?? '',
        entidad:           mapa['entidad de nacimiento']?? '',
        docProbatorio:     mapa['documento probatorio'] ?? '',
        anioRegistro:      mapa['año registro']         ?? '',
        numActa:           mapa['número de acta']       ?? '',
        entidadRegistro:   mapa['entidad de registro']  ?? '',
        municipioRegistro: mapa['municipio de registro']?? '',
        statusCurp:        'RCN',
        _fromDOM: true,
        _mapa:    mapa,
      };
    }).catch(() => null);
  }

  // ── Parsear respuesta ─────────────────────────────────────────────────────
  private parsearRespuesta(raw: any, curpBuscada?: string): any {
    if (!raw) return { exitosa: false, error: 'Sin respuesta del portal RENAPO' };

    // Verificar que tiene datos reales
    const curp = raw.curp ?? raw.CURP ?? curpBuscada;
    const nombre = raw.nombres ?? raw.NOMBRES ?? raw.nombre;
    const apellido = raw.primerApellido ?? raw.APELLIDO1 ?? raw.apellidoPaterno;

    if (!curp && !nombre && !apellido) {
      return { exitosa: false, error: raw.message ?? 'CURP no encontrada en RENAPO', raw };
    }

    return {
      exitosa:           true,
      curp,
      nombre,
      primerApellido:    raw.primerApellido   ?? raw.APELLIDO1        ?? raw.apellidoPaterno  ?? '',
      segundoApellido:   raw.segundoApellido  ?? raw.APELLIDO2        ?? raw.apellidoMaterno  ?? '',
      fechaNacimiento:   raw.fechNac          ?? raw.FECHNAC          ?? raw.fechaNacimiento  ?? '',
      sexo:              raw.sexo             ?? raw.SEXO             ?? '',
      entidadNacimiento: raw.entidad          ?? raw.ENTIDAD          ?? raw.estadoNacimiento ?? '',
      nacionalidad:      raw.nacionalidad     ?? raw.NACIONALIDAD     ?? '',
      docProbatorio:     raw.docProbatorio    ?? raw.DOCPROBATORIO    ?? raw.documento        ?? '',
      statusCurp:        raw.statusCurp       ?? raw.STATUS           ?? raw.estatusCurp      ?? 'RCN',
      municipioRegistro: raw.municipioRegistro ?? raw.municipio        ?? raw.datosDocProbatorio?.municipioRegistro ?? '',
      entidadRegistro:   raw.entidadRegistro  ?? raw.datosDocProbatorio?.entidadRegistro ?? '',
      anioRegistro:      raw.anioRegistro     ?? raw.datosDocProbatorio?.anioReg ?? '',
      numActa:           raw.numActa          ?? raw.datosDocProbatorio?.numActa ?? '',
      raw,
    };
  }

  // ── Upsert en tabla curp (datos maestros) ────────────────────────────────
  private async upsertCurp(resultado: any, empresaId: string): Promise<string | null> {
    if (!resultado.exitosa || !resultado.curp) return null;

    const curp = resultado.curp.toUpperCase().trim();

    // Verificar si ya existe
    const [existe] = await this.dataSource.query(
      'SELECT id FROM curp WHERE curp = @0 AND empresaId = @1',
      [curp, empresaId]
    ).catch(() => [null]);

    if (existe) {
      // Actualizar datos y fecha de actualización
      await this.dataSource.query(
        'UPDATE curp SET ' +
        'nombre=@2, primerApellido=@3, segundoApellido=@4, ' +
        'fechaNacimiento=@5, sexo=@6, nacionalidad=@7, ' +
        'entidadNacimiento=@8, docProbatorio=@9, anioRegistro=@10, ' +
        'numActa=@11, entidadRegistro=@12, municipioRegistro=@13, ' +
        'statusCurp=@14, fechaActualizacion=GETDATE() ' +
        'WHERE curp=@0 AND empresaId=@1',
        [
          curp, empresaId,
          resultado.nombre           ?? null,
          resultado.primerApellido   ?? null,
          resultado.segundoApellido  ?? null,
          resultado.fechaNacimiento  ?? null,
          resultado.sexo             ?? null,
          resultado.nacionalidad     ?? null,
          resultado.entidadNacimiento ?? null,
          resultado.docProbatorio    ?? null,
          resultado.anioRegistro     ?? null,
          resultado.numActa          ?? null,
          resultado.entidadRegistro  ?? null,
          resultado.municipioRegistro ?? null,
          resultado.statusCurp       ?? 'RCN',
        ]
      ).catch((e: any) => this.logger.error('[CURP BD] Error update:', e?.message));
      return existe.id;
    } else {
      // Insertar nuevo
      const [inserted] = await this.dataSource.query(
        'INSERT INTO curp ' +
        '(curp, empresaId, nombre, primerApellido, segundoApellido, ' +
        ' fechaNacimiento, sexo, nacionalidad, entidadNacimiento, ' +
        ' docProbatorio, anioRegistro, numActa, entidadRegistro, ' +
        ' municipioRegistro, statusCurp) ' +
        'OUTPUT INSERTED.id ' +
        'VALUES (@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11,@12,@13,@14)',
        [
          curp, empresaId,
          resultado.nombre           ?? null,
          resultado.primerApellido   ?? null,
          resultado.segundoApellido  ?? null,
          resultado.fechaNacimiento  ?? null,
          resultado.sexo             ?? null,
          resultado.nacionalidad     ?? null,
          resultado.entidadNacimiento ?? null,
          resultado.docProbatorio    ?? null,
          resultado.anioRegistro     ?? null,
          resultado.numActa          ?? null,
          resultado.entidadRegistro  ?? null,
          resultado.municipioRegistro ?? null,
          resultado.statusCurp       ?? 'RCN',
        ]
      ).catch((e: any) => { this.logger.error('[CURP BD] Error insert:', e?.message); return [null]; });
      return inserted?.id ?? null;
    }
  }

  // ── Guardar auditoría en consultas_curp ───────────────────────────────────
  private async guardarConsulta(
    tipo: string, payload: any, resultado: any,
    empresaId: string, usuarioId?: string,
    curpId?: string | null, desdeCache = false,
  ) {
    await this.dataSource.query(
      'INSERT INTO consultas_curp ' +
      '(empresaId, curpId, usuarioId, tipoConsulta, desdeCache, exitosa, errorMensaje, ' +
      ' paramCurp, paramNombre, paramPrimerApellido, paramSegundoApellido, ' +
      ' paramFechaNacimiento, paramSexo, paramEntidad) ' +
      'VALUES (@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11,@12,@13)',
      [
        empresaId,
        curpId             ?? null,
        usuarioId          ?? null,
        tipo,
        desdeCache ? 1 : 0,
        resultado.exitosa ? 1 : 0,
        resultado.error    ?? null,
        payload.curp       ?? resultado.curp ?? null,
        payload.nombre     ?? null,
        payload.primerApellido  ?? null,
        payload.segundoApellido ?? null,
        payload.fechaNacimiento ?? null,
        payload.sexo       ?? null,
        payload.entidadNacimiento ?? null,
      ]
    ).catch((e: any) => this.logger.error('[CURP BD] Error auditoría:', e?.message));
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  async obtenerHistorial(empresaId: string, pagina = 1, limite = 20) {
    const offset = (pagina - 1) * limite;
    const [rows, total] = await Promise.all([
      this.dataSource.query(
        'SELECT id, tipoConsulta, curp, nombre, primerApellido, segundoApellido, ' +
        'statusCurp, curpRegistrada, exitosa, fechaConsulta ' +
        'FROM consultas_curp WHERE empresaId = @0 ' +
        'ORDER BY fechaConsulta DESC ' +
        'OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY',
        [empresaId, offset, limite]
      ),
      this.dataSource.query(
        'SELECT COUNT(*) AS total FROM consultas_curp WHERE empresaId = @0',
        [empresaId]
      ),
    ]);
    return {
      datos: rows,
      total: Number(total[0]?.total ?? 0),
      pagina,
      totalPaginas: Math.ceil(Number(total[0]?.total ?? 0) / limite),
    };
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.logger.log('[CURP RPA] Browser cerrado');
    }
  }
}
