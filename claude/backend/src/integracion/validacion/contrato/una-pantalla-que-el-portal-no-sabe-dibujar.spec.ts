import {
  COMPONENTES_SOPORTADOS,
  VERSIONES_DE_CONTRATO_SOPORTADAS,
  camposObligatoriosSinCondicion,
  faltantesDelResultado,
  validarEsquemaDePantalla,
  type EsquemaDePantalla,
} from './pantalla-dinamica';
import {
  TIPOS_CONOCIDOS,
  resolverTipoDePaso,
  salidaDeTipoSinEvaluador,
  tiposNoGuardables,
} from './catalogo-de-pasos';
import { ResultadoPaso, TipoPasoValidacion } from '../validacion.constants';

/**
 * ============================================================================
 * UNA PANTALLA QUE EL PORTAL NO SABE DIBUJAR
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTE ARCHIVO
 *
 * Una pantalla dinámica es una pantalla que el ERP no tiene escrita: la describe
 * quien configuró el flujo y el portal la dibuja leyendo esa descripción. El
 * punto del ejercicio es que agregar un campo **no requiera desplegar**.
 *
 * Eso sólo funciona con un contrato comprobable, y lo que hay que comprobar no
 * es que un esquema correcto se acepte —eso es lo fácil— sino que los esquemas
 * equivocados se rechacen **diciendo qué está mal**, porque quien los escribe
 * está en otro sistema y no puede depurar a ciegas.
 *
 * El inventario de la suite midió la brecha que hace esto urgente: el catálogo
 * declara 37 tipos contratables y el renderizador sabe dibujar 18. Mientras esa
 * distancia exista, un esquema puede nombrar legítimamente algo que el portal no
 * sabe pintar, y lo que pase entonces es una decisión de diseño, no un accidente.
 * ============================================================================
 */


/**
 * Los motivos de un rechazo, o un fallo claro si el esquema se aceptó.
 *
 * Existe para que la prueba no pueda pasar por el camino equivocado: sin esto,
 * un `if (r.valido) return;` deja la prueba en verde cuando el validador acepta
 * lo que debía rechazar, que es el peor resultado posible.
 */
function motivosDe(r: ReturnType<typeof validarEsquemaDePantalla>): string[] {
  if (!('motivos' in r)) {
    throw new Error('el validador ACEPTÓ un esquema que debía rechazar');
  }
  return r.motivos;
}

const PASO_MINIMO = {
  id: 'datos',
  titulo: 'Datos del solicitante',
  campos: [{ nombre: 'curp', componente: 'curp', etiqueta: 'CURP', requerido: true }],
};

const esquema = (extra: Partial<EsquemaDePantalla> = {}) => ({
  contrato: 1,
  pasos: [PASO_MINIMO],
  ...extra,
});

describe('la regla que sostiene todo: un componente desconocido no se dibuja y no se salta', () => {
  it('rechaza el esquema entero y nombra el componente', () => {
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          {
            id: 'datos',
            titulo: 'Datos',
            campos: [
              { nombre: 'curp', componente: 'curp', etiqueta: 'CURP' },
              { nombre: 'huella', componente: 'huella-dactilar', etiqueta: 'Huella' },
            ],
          },
        ],
      } as never),
    );
    expect(motivosDe(r).join(' ')).toContain('huella-dactilar');
  });

  it('y explica por qué no se omite, que es la parte que se olvida', () => {
    /*
     * El mensaje tiene que decir el motivo, no sólo el hecho. Si no lo dice,
     * la reacción natural de quien configura es «pues quítalo del esquema y
     * que el campo no exista», y eso es exactamente el daño: un dato
     * obligatorio sin capturar con la pantalla aparentemente completa.
     */
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          { id: 'd', titulo: 'D', campos: [{ nombre: 'x', componente: 'mapa', etiqueta: 'X' }] },
        ],
      } as never),
    );
    const texto = motivosDe(r).join(' ');
    expect(texto).toMatch(/obligatorio sin capturar|aparentemente completa/i);
    /* Y ofrece la salida: qué sí sabe dibujar. */
    expect(texto).toContain('texto');
  });

  it('el catálogo de componentes es el inventario de lo que hay, no una aspiración', () => {
    /*
     * Si el catálogo promete de más, el esquema pasa la validación y la pantalla
     * queda vacía en ese campo: el error de arriba se convierte en un hueco
     * silencioso. Así que crece cuando alguien escribe el componente.
     */
    expect(COMPONENTES_SOPORTADOS.length).toBeGreaterThan(10);
    expect(new Set(COMPONENTES_SOPORTADOS).size).toBe(COMPONENTES_SOPORTADOS.length);
    /* Los de captura de identidad mexicana, que son los que este ERP necesita. */
    for (const imprescindible of ['curp', 'rfc', 'documento', 'firma']) {
      expect(COMPONENTES_SOPORTADOS).toContain(imprescindible);
    }
  });
});

describe('la versión del contrato se negocia, no se tolera', () => {
  it('un esquema sin `contrato` se rechaza', () => {
    const r = validarEsquemaDePantalla({ pasos: [PASO_MINIMO] });
    expect(r.valido).toBe(false);
  });

  it('uno más nuevo dice que hay que actualizar el portal', () => {
    const futuro = Math.max(...VERSIONES_DE_CONTRATO_SOPORTADAS) + 1;
    const r = validarEsquemaDePantalla(esquema({ contrato: futuro } as never));
    expect(motivosDe(r).join(' ')).toMatch(/actualiza el portal/i);
  });

  it('uno más viejo dice que hay que volver a publicar el flujo', () => {
    const r = validarEsquemaDePantalla(esquema({ contrato: 0 } as never));
    expect(motivosDe(r).join(' ')).toMatch(/vuelve a publicarlo/i);
  });

  it('no se intenta «con lo que se entienda»', () => {
    /*
     * Una pantalla a medias de un contrato desconocido es el caso del componente
     * desconocido repartido por todos los campos. El rechazo es total.
     */
    const r = validarEsquemaDePantalla(esquema({ contrato: 99 } as never));
    expect(r.valido).toBe(false);
  });
});

describe('lo que se captura se nombra, y el nombre es único en todo el flujo', () => {
  it('dos campos con el mismo nombre se rechazan, aunque estén en pasos distintos', () => {
    /*
     * El resultado es un objeto plano y los pasos escriben en el mismo: con el
     * nombre repetido uno sobreescribe al otro y el dato perdido no deja rastro.
     * Por eso la unicidad es del flujo y no del paso.
     */
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          { id: 'a', titulo: 'A', campos: [{ nombre: 'ingreso', componente: 'moneda', etiqueta: 'Ingreso' }] },
          { id: 'b', titulo: 'B', campos: [{ nombre: 'ingreso', componente: 'numero', etiqueta: 'Ingreso 2' }] },
        ],
      } as never),
    );
    expect(motivosDe(r).join(' ')).toMatch(/ya se usa en/);
    expect(motivosDe(r).join(' ')).toMatch(/no deja rastro/);
  });

  it('un nombre con mayúsculas o espacios se rechaza nombrando lo recibido', () => {
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          { id: 'a', titulo: 'A', campos: [{ nombre: 'Ingreso Mensual', componente: 'moneda', etiqueta: 'I' }] },
        ],
      } as never),
    );
    expect(motivosDe(r).join(' ')).toContain('Ingreso Mensual');
  });
});

describe('las condiciones describen, no ejecutan', () => {
  it('acepta comparar contra una lista de constantes', () => {
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          {
            id: 'a',
            titulo: 'A',
            campos: [
              {
                nombre: 'tipo_persona',
                componente: 'seleccion',
                etiqueta: 'Tipo',
                opciones: [
                  { valor: 'fisica', etiqueta: 'Física' },
                  { valor: 'moral', etiqueta: 'Moral' },
                ],
              },
              {
                nombre: 'acta_constitutiva',
                componente: 'documento',
                etiqueta: 'Acta',
                visibleSi: { campo: 'tipo_persona', igualA: ['moral'] },
              },
            ],
          },
        ],
      } as never),
    );
    expect(r.valido).toBe(true);
  });

  it('rechaza una condición que no es una constante', () => {
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          {
            id: 'a',
            titulo: 'A',
            campos: [
              { nombre: 'x', componente: 'texto', etiqueta: 'X' },
              {
                nombre: 'y',
                componente: 'texto',
                etiqueta: 'Y',
                visibleSi: { campo: 'x', igualA: [{ expresion: 'x > 10' }] },
              },
            ],
          },
        ],
      } as never),
    );
    expect(motivosDe(r).join(' ')).toMatch(/describe, no ejecuta/i);
  });

  it('rechaza depender de un campo que no existe: ese campo no aparecería nunca', () => {
    /*
     * El defecto más difícil de ver de todo el contrato: una errata en el nombre
     * del campo del que se depende deja un campo **invisible**, y la pantalla se
     * ve perfectamente bien. Nadie lo descubre hasta que falta el dato.
     */
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          {
            id: 'a',
            titulo: 'A',
            campos: [
              { nombre: 'tipo', componente: 'texto', etiqueta: 'T' },
              {
                nombre: 'extra',
                componente: 'texto',
                etiqueta: 'E',
                visibleSi: { campo: 'tipoo', igualA: ['moral'] },
              },
            ],
          },
        ],
      } as never),
    );
    expect(motivosDe(r).join(' ')).toMatch(/no se mostraría nunca/i);
  });

  it('y rechaza depender de sí mismo', () => {
    const r = validarEsquemaDePantalla(
      esquema({
        pasos: [
          {
            id: 'a',
            titulo: 'A',
            campos: [
              { nombre: 'x', componente: 'texto', etiqueta: 'X', visibleSi: { campo: 'x', igualA: ['s'] } },
            ],
          },
        ],
      } as never),
    );
    expect(r.valido).toBe(false);
  });
});

describe('el validador dice TODO lo que está mal, no el primero', () => {
  it('acumula los motivos de varios campos y varios pasos', () => {
    /*
     * Quien configura el flujo está en otra pantalla, en otro sistema. Decirle
     * los errores de uno en uno convierte una configuración de diez minutos en
     * una tarde. Es la misma lección que el validador de permisos del portal de
     * Fineract, que acabó nombrando los códigos malos en vez de decir «mapa
     * inválido».
     */
    const r = validarEsquemaDePantalla({
      contrato: 1,
      pasos: [
        { id: 'a', titulo: '', campos: [{ nombre: 'MAL', componente: 'ninguno', etiqueta: '' }] },
        { id: 'a', titulo: 'B', campos: [] },
      ],
    });
    expect(motivosDe(r).length).toBeGreaterThanOrEqual(4);
    /* Y cada motivo dice DÓNDE, que es lo que lo hace accionable. */
    expect(motivosDe(r).every((m) => /paso \d/.test(m))).toBe(true);
  });
});

describe('la vuelta del contrato: lo que la pantalla entrega', () => {
  const conCondicion: EsquemaDePantalla = {
    contrato: 1,
    pasos: [
      {
        id: 'a',
        titulo: 'A',
        campos: [
          { nombre: 'curp', componente: 'curp', etiqueta: 'CURP', requerido: true },
          { nombre: 'ingreso', componente: 'moneda', etiqueta: 'Ingreso', requerido: true },
          { nombre: 'acepta', componente: 'booleano', etiqueta: 'Acepta', requerido: true },
          {
            nombre: 'acta',
            componente: 'documento',
            etiqueta: 'Acta',
            requerido: true,
            visibleSi: { campo: 'curp', igualA: ['X'] },
          },
        ],
      },
    ],
  };

  it('los obligatorios condicionados no cuentan como obligatorios de entrada', () => {
    /* Su obligatoriedad depende de un valor que sólo se conoce al capturar. */
    expect(camposObligatoriosSinCondicion(conCondicion)).toEqual(['curp', 'ingreso', 'acepta']);
  });

  it('señala lo que falta, por nombre', () => {
    expect(faltantesDelResultado(conCondicion, { curp: 'AAAA000101HDFAAA01' })).toEqual([
      'ingreso',
      'acepta',
    ]);
  });

  it('`false` y `0` son respuestas, no ausencias', () => {
    /*
     * El error clásico de los formularios: tratar lo falsy como vacío. Un «no»
     * capturado a conciencia se leería como un campo sin contestar y la pantalla
     * volvería a pedirlo — o, peor, el flujo lo trataría como incompleto y
     * derivaría a revisión manual una solicitud que estaba completa.
     */
    expect(
      faltantesDelResultado(conCondicion, {
        curp: 'AAAA000101HDFAAA01',
        ingreso: 0,
        acepta: false,
      }),
    ).toEqual([]);
  });

  it('un resultado nulo no revienta: lo que falta es todo', () => {
    expect(faltantesDelResultado(conCondicion, null)).toEqual(['curp', 'ingreso', 'acepta']);
  });
});

/* ══════════════════════ El catálogo de pasos ══════════════════════ */

describe('el vocabulario de pasos se abre sin abrir el veredicto', () => {
  it('los tipos conocidos salen del enum, no de una lista aparte', () => {
    /* Dos listas del mismo concepto acaban divergiendo, y la que se olvida es
       siempre la que decide. */
    expect(TIPOS_CONOCIDOS).toEqual(Object.values(TipoPasoValidacion));
    expect(resolverTipoDePaso(TipoPasoValidacion.BURO_CREDITO).clase).toBe('conocido');
  });

  it('un tipo contratado que el portal no conoce NO aprueba: queda no disponible', () => {
    /*
     * La regla que hace seguro abrir el vocabulario. Es la misma que ya gobierna
     * los evaluadores sin proveedor, y por el mismo motivo escrito en su puerto:
     * un evaluador permisivo por omisión termina otorgando crédito sin validar a
     * nadie.
     */
    const r = resolverTipoDePaso('VERIFICACION_DOMICILIO', ['VERIFICACION_DOMICILIO']);
    expect(r.clase).toBe('contratado');
    expect(r.resultadoPorOmision).toBe(ResultadoPaso.NO_DISPONIBLE);
    expect(r.resultadoPorOmision).not.toBe(ResultadoPaso.APROBADO);
  });

  it('un tipo que nadie declaró es una errata, y se distingue del anterior', () => {
    /*
     * La distinción no es cosmética: «no disponible todavía» manda a esperar un
     * despliegue y «ese tipo no existe» manda a corregir la configuración.
     * Confundirlos le cuesta la tarde a quien configura.
     */
    const r = resolverTipoDePaso('BURO_CREDTIO', ['VERIFICACION_DOMICILIO']);
    expect(r.clase).toBe('desconocido');
    expect(r.resultadoPorOmision).toBe(ResultadoPaso.ERROR);
    expect(r.explicacion).toMatch(/catálogo de servicios|Revisa el código/i);
  });

  it('un código con forma de inyección no pasa', () => {
    for (const malo of ['DROP TABLE x', 'buro;select', '', '  ', 'ab', null, 7]) {
      expect(resolverTipoDePaso(malo as never).clase).toBe('desconocido');
    }
  });

  it('se puede GUARDAR un flujo con un tipo contratado sin evaluador', () => {
    /*
     * Es el objetivo entero: la configuración va por delante del despliegue. Lo
     * que no se deja guardar es una errata, porque un paso que siempre da ERROR
     * no es una validación pendiente, es un flujo roto que nadie pidió.
     */
    const contratados = ['VERIFICACION_DOMICILIO'];
    expect(
      tiposNoGuardables([TipoPasoValidacion.IDENTIDAD_INE, 'VERIFICACION_DOMICILIO'], contratados),
    ).toEqual([]);
    const malos = tiposNoGuardables(['BURO_CREDTIO'], contratados);
    expect(malos).toHaveLength(1);
    expect(malos[0].codigo).toBe('BURO_CREDTIO');
  });

  it('la salida registrada explica por qué no se validó', () => {
    /*
     * El expediente de una originación se lee meses después, cuando nadie
     * recuerda qué estaba contratado. «NO_DISPONIBLE» a secas no dice si faltaba
     * el proveedor, el contrato o el código.
     */
    const salida = salidaDeTipoSinEvaluador(
      resolverTipoDePaso('VERIFICACION_DOMICILIO', ['VERIFICACION_DOMICILIO']),
    );
    expect(salida.resultado).toBe(ResultadoPaso.NO_DISPONIBLE);
    expect(salida.detalle.length).toBeGreaterThan(40);
    expect(salida.puntaje).toBeNull();
  });
});

describe('el motor usa el catálogo, no lo reinventa', () => {
  /*
   * La mitad que convierte dos archivos en arquitectura. Un contrato que nadie
   * llama es documentación con sintaxis de TypeScript: el motor tiene que
   * resolver el tipo contra el catálogo, y el módulo tiene que enchufar el
   * puerto. Las dos cosas se comprueban sobre el fuente porque son costuras, y
   * una costura que se descose no produce ningún error: produce un paso que
   * vuelve a dar ERROR donde debía dar NO_DISPONIBLE.
   */
  const leer = (ruta: string) =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', '..', ruta),
      'utf8',
    ) as string;

  it('el despacho de pasos resuelve el tipo contra el catálogo', () => {
    const motor = leer('integracion/validacion/services/motor-validacion.service.ts');
    expect(motor).toContain('resolverTipoDePaso(paso.tipo, tiposContratados)');
    expect(motor).toContain('salidaDeTipoSinEvaluador');
    /* Y ya no decide el resultado por su cuenta en ese punto. */
    expect(motor).not.toContain('No hay evaluador registrado para');
  });

  it('un catálogo que falla no tumba la ejecución', () => {
    /*
     * El catálogo es un dato de apoyo: si la suite de SUMA no responde, el flujo
     * sigue con el vocabulario que el portal conoce. Tumbar una originación
     * porque no se pudo leer un catálogo sería cambiar un control por una
     * dependencia.
     */
    const motor = leer('integracion/validacion/services/motor-validacion.service.ts');
    expect(motor).toMatch(/tiposContratados\(entrada\.empresaId\)[\s\S]{0,80}catch/);
  });

  it('el módulo enchufa el puerto, con la implementación vacía de hoy', () => {
    const modulo = leer('integracion/modules/integracion.module.ts');
    expect(modulo).toContain('PUERTO_CATALOGO_CONTRATADO');
    expect(modulo).toContain('CatalogoContratadoNoConfigurado');
  });

  it('la implementación de hoy devuelve vacío y no grita', () => {
    /*
     * Un puerto sin proveedor que registra una advertencia en cada llamada
     * enseña a la gente a ignorar el log, y aquí la ausencia de catálogo es el
     * estado normal de una instalación sin la suite.
     */
    const puerto = leer('integracion/validacion/contrato/catalogo-contratado.port.ts');
    expect(puerto).not.toMatch(/logger|warn|console/i);
    expect(puerto).toContain('return [];');
  });
});
