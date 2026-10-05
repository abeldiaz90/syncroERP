import { readFileSync } from 'fs';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un embudo que terminaba en el vacío, y una etapa a la que no se podía llegar
 * ----------------------------------------------------------------------------
 * DOS DEFECTOS EN EL MISMO BOTÓN: el que mueve una oportunidad de etapa.
 *
 * 1. MOVER A «PERDIDA» SIEMPRE FALLABA.
 *
 *    El servidor exige el motivo —«indica el motivo de la pérdida: es lo que
 *    permite mejorar el proceso»— y la pantalla mandaba sólo `{ etapaId }`. Así
 *    que arrastrar una oportunidad a una etapa perdida contestaba 400, siempre,
 *    con cualquier rol. Y perder oportunidades es más frecuente que ganarlas:
 *    era el camino más transitado del módulo y estaba cerrado.
 *
 *    Es el mismo defecto que ya apareció en el alta de clientes y en el rechazo
 *    de una limpieza: el servidor pide un dato que la pantalla no tiene dónde
 *    escribir.
 *
 * 2. GANAR NO TRASPASABA NADA.
 *
 *    El servicio decía en un comentario que ganar «convierte al prospecto en
 *    cliente; es el punto de traspaso al ERP», y lo único que hacía era un
 *    `logger.log`. `prospecto.clienteId` no se asigna en NINGÚN sitio del
 *    sistema. La oportunidad se ganaba, la pantalla decía «Oportunidad movida de
 *    etapa» y el cliente no nacía nunca. El embudo terminaba en el vacío.
 *
 *    No se da de alta el cliente solo, y es deliberado: necesita RFC, régimen
 *    fiscal y domicilio para poder facturarle. Lo que se hace es DECIRLO, y a
 *    quien está mirando: la respuesta lleva el prospecto que quedó pendiente y la
 *    pantalla lo pone delante con el enlace al alta.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const servicio = () =>
  readFileSync(join(SRC, 'crm', 'services', 'crm.service.ts'), 'utf8');

describe('un embudo que terminaba en el vacío', () => {
  describe('ganar dice qué quedó pendiente', () => {
    it('el servicio devuelve el prospecto por dar de alta, no sólo un log', () => {
      const s = servicio();
      expect(s).toMatch(/prospectoPorDarDeAlta/);
      /*
       * Y lo devuelve: si sólo apareciera junto al `logger`, seguiría siendo un
       * mensaje para nadie.
       */
      const retorno = s.slice(s.indexOf('return {', s.indexOf('prospectoPorDarDeAlta')));
      expect(retorno.slice(0, 300)).toMatch(/prospectoPorDarDeAlta/);
    });
  });

  describe('la pantalla puede llegar a una etapa perdida', () => {
    if (!FRONTEND) {
      it('se salta: el frontend no está junto al backend', () => {
        expect(true).toBe(true);
      });
      return;
    }

    const pipeline = readFileSync(
      join(FRONTEND, 'app/dashboard/crm/pipeline/page.tsx'),
      'utf8',
    );

    it('manda el motivo de la pérdida', () => {
      // El servidor lo exige por nombre; la pantalla tiene que nombrarlo igual.
      expect(servicio()).toMatch(/motivoPerdida/);
      expect(pipeline).toMatch(/motivoPerdida/);
    });

    it('y avisa de lo que quedó pendiente al ganar', () => {
      expect(pipeline).toMatch(/prospectoPorDarDeAlta/);
    });
  });

  describe('nadie más manda una etapa sin lo que esa etapa exige', () => {
    /*
     * El barrido: cualquier pantalla que llame a `oportunidades/:id/etapa` tiene
     * que ser capaz de mandar el motivo. Si mañana aparece otra —un tablero, un
     * atajo desde la agenda— esta prueba la ve.
     */
    if (!FRONTEND) {
      it('se salta: el frontend no está junto al backend', () => {
        expect(true).toBe(true);
      });
      return;
    }

    function archivos(dir: string, acumulado: string[] = []): string[] {
      if (!existsSync(dir)) return acumulado;
      for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === '.next') continue;
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
        else if (/\.tsx?$/.test(nombre)) acumulado.push(ruta);
      }
      return acumulado;
    }

    it('todas las pantallas que mueven de etapa saben del motivo', () => {
      const culpables: string[] = [];
      for (const archivo of archivos(join(FRONTEND, 'app'))) {
        const texto = readFileSync(archivo, 'utf8');
        if (!/oportunidades\/\$\{[^}]+\}\/etapa/.test(texto)) continue;
        if (!/motivoPerdida/.test(texto)) {
          culpables.push(archivo.slice(FRONTEND.length + 1));
        }
      }
      expect(culpables).toEqual([]);
    });
  });
});
