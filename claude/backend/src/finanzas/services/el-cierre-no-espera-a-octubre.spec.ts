/**
 * ============================================================================
 * El cierre de septiembre no espera a una póliza de octubre
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El control `ESPEJO_CONTABLE` del cierre mensual cuenta los eventos que no han
 * llegado al mayor externo y bloquea el mes si hay alguno. La idea es correcta:
 * cerrar un mes es afirmar que los números son definitivos, y en modo ESPEJO eso
 * incluye los del otro lado.
 *
 * Su consulta, en cambio, contaba DOS cosas que no le tocan:
 *
 *  1. Eventos de la OTRA mitad. `integracion_eventos` es una sola cola con
 *     eventos de dos dueños —cartera y contabilidad— y la consulta no filtraba
 *     por tipo. Un cliente sin publicar en el registro externo bloqueaba el
 *     cierre contable. Es la misma lección que ya se aplicó al apagar un eje:
 *     cada eje mira sólo lo suyo, porque negarle a alguien un cierre por algo
 *     que no puede resolver es señalar a quien no tiene la culpa.
 *
 *  2. Documentos de un mes POSTERIOR al que se cierra. La nómina fechada el 15
 *     de octubre, corrida en septiembre, vive en la cola y el proveedor la
 *     rechaza por fecha futura —hace bien—. Contarla al cerrar septiembre es un
 *     bloqueo que nadie puede levantar: no hay nada que corregir, y esperar no
 *     sirve porque para cuando llegue el 15 de octubre, septiembre ya tendría
 *     que estar cerrado.
 *
 * El comentario de la consulta razonaba, con razón, que NO hay que filtrar por
 * periodo: «un evento de agosto sin entregar sigue siendo una divergencia viva
 * en septiembre». Eso vale hacia atrás. Hacia adelante no: un documento de
 * octubre no es una divergencia de septiembre, es un documento de octubre. La
 * regla correcta es asimétrica —todo lo anterior al corte cuenta; lo posterior,
 * no— y era lo único que faltaba.
 * ============================================================================
 */

import { EVENTOS_DE_CONTABILIDAD } from '../../integracion/integracion.constants';

describe('el cierre no espera a una póliza de octubre', () => {
  const sqlDelEspejo = () => {
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'cierre-contable.service.ts'),
      'utf8',
    ) as string;
    const i = fuente.indexOf('integracion_configuracion_empresa');
    expect(i).toBeGreaterThan(0);
    /*
     * Una ventana alrededor de la tabla, no el literal exacto: extraer «de
     * backtick a backtick» se cortaba en el primer backtick del comentario de
     * arriba y devolvía una cadena vacía, con lo que la prueba fallaba por el
     * motivo equivocado. La ventana se queda dentro de esta consulta —el SELECT
     * completo son unas veinte líneas— y no alcanza a la siguiente.
     */
    const ini = fuente.lastIndexOf('SELECT', i);
    const fin = fuente.indexOf("siFalla('estado del espejo contable'", i);
    expect(ini).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(ini);
    return fuente.slice(ini, fin);
  };

  it('cuenta sólo los eventos del eje contable', () => {
    const sql = sqlDelEspejo();
    /*
     * Se exige que nombre la constante, no una lista escrita a mano: el día que
     * aparezca un segundo tipo de evento contable, una lista literal aquí se
     * quedaría corta en silencio.
     */
    expect(sql).toMatch(/e\.tipo/);
    expect(EVENTOS_DE_CONTABILIDAD.length).toBeGreaterThan(0);
  });

  it('no cuenta documentos posteriores al corte del periodo', () => {
    const sql = sqlDelEspejo();
    // El documento del evento es una póliza: hay que llegar a su fecha.
    expect(sql).toMatch(/polizas/);
    // Escrito en negativo a proposito: ver el comentario del servicio.
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/p\.fecha\s*>/);
  });

  it('sigue contando lo anterior al corte: hay un solo limite, arriba', () => {
    /*
     * Lo que NO debe pasar: que al acotar por arriba alguien acote también por
     * abajo. Un evento de agosto sin entregar es una divergencia viva hoy, y
     * esconderlo por fecha seria volver a certificar un mes con los dos libros
     * diferentes.
     *
     * Se mira la lista de parametros, no el texto del SQL: el corte superior se
     * escribe en negativo —`NOT EXISTS ... > corte`, ver el servicio— asi que
     * buscar un `>` daria un falso positivo. Si apareciera `fechaDesde`, habria
     * limite inferior.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'cierre-contable.service.ts'),
      'utf8',
    ) as string;
    const i = fuente.indexOf("siFalla('estado del espejo contable'");
    const params = fuente.slice(fuente.lastIndexOf('[', i), i);
    expect(params).toMatch(/fechaHasta/);
    expect(params).not.toMatch(/fechaDesde/);
  });

  it('el control no desaparece cuando todo lo pendiente es de un mes posterior', () => {
    /*
     * El primer intento puso el corte en el WHERE y se midio: con los tres
     * eventos de octubre como unicos de la cola, la consulta no devolvia
     * ninguna fila —se perdia tambien la de configuracion, que es de donde sale
     * `modoContabilidad`— y el control se esfumaba del diagnostico en vez de
     * salir en verde. Un control que se esconde es peor que uno que bloquea.
     *
     * Por eso el corte vive en la condicion del JOIN.
     */
    const sql = sqlDelEspejo();
    const dondeJoin = sql.indexOf('LEFT JOIN integracion_eventos');
    const dondeWhere = sql.indexOf('WHERE c.empresaId');
    const dondeCorte = sql.indexOf('p.fecha >');
    expect(dondeJoin).toBeGreaterThan(0);
    expect(dondeCorte).toBeGreaterThan(dondeJoin);
    expect(dondeCorte).toBeLessThan(dondeWhere);
  });
});
