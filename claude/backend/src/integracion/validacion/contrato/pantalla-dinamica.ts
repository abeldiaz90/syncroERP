/*
 * ============================================================================
 * EL CONTRATO DE UNA PANTALLA DINÁMICA
 * ----------------------------------------------------------------------------
 * QUÉ ES ESTO Y POR QUÉ VIVE AQUÍ
 *
 * Una pantalla dinámica es una pantalla que **el ERP no tiene escrita**: la
 * describe quien configuró el flujo —hoy la suite de SUMA, en
 * `ClientDetails.config.onboarding.form.steps`— y el portal la dibuja leyendo
 * esa descripción. El punto de todo el ejercicio es que agregar un campo, un
 * documento o un paso **no requiera desplegar**.
 *
 * Eso sólo funciona si hay un contrato escrito y comprobable. Sin él, «dinámico»
 * significa que el portal intenta adivinar y falla en silencio, que es peor que
 * tener la pantalla fija.
 *
 * El contrato vive del lado del **consumidor** —aquí— y no del productor, por una
 * razón: el ERP es quien tiene que decidir qué sabe dibujar. Si el esquema lo
 * valida quien lo emite, el portal se enteraría de que no sabe dibujar un campo
 * en el momento de pintarlo, delante del usuario. El inventario de la suite ya
 * midió esa distancia: el catálogo declara 37 tipos contratables y el
 * renderizador sabe dibujar 18.
 *
 * LAS CUATRO REGLAS, Y POR QUÉ CADA UNA
 *
 * 1 · **Un componente desconocido no se dibuja y no se salta.** Es la regla que
 *     sostiene todo lo demás. Si el portal ignora el campo que no conoce, un
 *     dato obligatorio queda sin capturar y la pantalla se ve completa: el
 *     expediente nace incompleto con aspecto de completo. Se rechaza el esquema
 *     entero y se dice qué componente falta, para que quien configuró sepa que
 *     ese portal todavía no lo soporta.
 *
 * 2 · **La versión se negocia, no se tolera.** El esquema declara `contrato`, el
 *     portal declara qué versiones entiende. Un esquema más nuevo se rechaza
 *     nombrando la diferencia, en vez de intentarlo «con lo que se entienda»:
 *     una pantalla a medias de un contrato que no se conoce es exactamente el
 *     caso 1 repartido por todos los campos.
 *
 * 3 · **El esquema no trae lógica, trae descripción.** Nada de expresiones ni
 *     código: un `visibleSi` que compara el valor de otro campo con una lista de
 *     constantes, y nada más. En cuanto el esquema pueda ejecutar algo, el
 *     portal se convierte en un intérprete de código de terceros y el contrato
 *     deja de ser verificable.
 *
 * 4 · **Lo que se captura se nombra.** Cada campo lleva `nombre`, y dos campos
 *     no pueden compartirlo ni dentro de un paso ni entre pasos del mismo flujo.
 *     El resultado de la pantalla es un objeto plano con esos nombres; si se
 *     repiten, uno sobreescribe al otro y el dato perdido no deja rastro.
 *
 * LO QUE ESTE ARCHIVO NO HACE
 *
 * No dibuja nada: el registro de componentes es de la capa de pantalla. Aquí
 * está la forma, la validación y el catálogo de lo que el portal declara saber
 * dibujar, que es lo que tiene que estar de acuerdo entre las dos partes.
 * ============================================================================
 */

/** Versiones del contrato que este portal entiende. La primera es la única. */
export const VERSIONES_DE_CONTRATO_SOPORTADAS = [1] as const;

/**
 * Los componentes que el portal sabe dibujar.
 *
 * Es deliberadamente corto y deliberadamente **cerrado**: es el inventario
 * honesto de lo que hay, no una aspiración. Crece cuando alguien escribe el
 * componente, no cuando alguien lo necesita. Un catálogo que promete de más
 * convierte el error de la regla 1 en un hueco: el esquema pasaría la validación
 * y la pantalla quedaría vacía en ese campo.
 */
export const COMPONENTES_SOPORTADOS = [
  'texto',
  'texto-largo',
  'numero',
  'moneda',
  'fecha',
  'seleccion',
  'seleccion-multiple',
  'booleano',
  'curp',
  'rfc',
  'telefono',
  'correo',
  'codigo-postal',
  'documento',
  'firma',
  'foto',
  'aviso',
] as const;

export type ComponenteSoportado = (typeof COMPONENTES_SOPORTADOS)[number];

/** Una condición de visibilidad: descripción, nunca código. */
export type CondicionDeVisibilidad = {
  /** El `nombre` de otro campo del mismo flujo. */
  campo: string;
  /** Se muestra cuando el valor de ese campo está en esta lista. */
  igualA: Array<string | number | boolean>;
};

export type CampoDinamico = {
  /** Llave del dato en el resultado. Única en todo el flujo. */
  nombre: string;
  componente: ComponenteSoportado;
  etiqueta: string;
  requerido?: boolean;
  /** Texto de ayuda bajo el campo. */
  ayuda?: string;
  /** Opciones para `seleccion` y `seleccion-multiple`. */
  opciones?: Array<{ valor: string; etiqueta: string }>;
  /** Propiedades propias del componente: largo máximo, acepta, mínimo, máximo. */
  props?: Record<string, string | number | boolean>;
  visibleSi?: CondicionDeVisibilidad;
};

export type PasoDinamico = {
  /** Identificador del paso dentro del flujo. Único. */
  id: string;
  titulo: string;
  descripcion?: string;
  campos: CampoDinamico[];
};

export type EsquemaDePantalla = {
  /** Versión del contrato con la que se escribió este esquema. */
  contrato: number;
  /** Quién lo emitió, para el expediente. No se usa para decidir nada. */
  emisor?: string;
  pasos: PasoDinamico[];
};

export type ResultadoDeValidacion =
  | { valido: true; esquema: EsquemaDePantalla }
  | { valido: false; motivos: string[] };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

const NOMBRE_DE_CAMPO = /^[a-z][a-z0-9_]{0,59}$/;

/**
 * Valida un esquema recibido de fuera y dice **todo** lo que está mal.
 *
 * Devuelve la lista completa de motivos y no el primero: quien configuró el
 * flujo está en otra pantalla, en otro sistema, y hacerle descubrir los errores
 * de uno en uno es lo que convierte una configuración de diez minutos en una
 * tarde. Es la misma razón por la que el validador de permisos del portal
 * acabó nombrando los códigos malos en vez de decir «mapa inválido».
 */
export function validarEsquemaDePantalla(entrada: unknown): ResultadoDeValidacion {
  const motivos: string[] = [];

  if (!esObjeto(entrada)) {
    return { valido: false, motivos: ['El esquema debe ser un objeto.'] };
  }

  /* ── Regla 2: la versión se negocia ── */
  const contrato = Number(entrada.contrato);
  if (!Number.isInteger(contrato)) {
    motivos.push('Falta `contrato`: el esquema debe declarar con qué versión se escribió.');
  } else if (!(VERSIONES_DE_CONTRATO_SOPORTADAS as readonly number[]).includes(contrato)) {
    const soportadas = VERSIONES_DE_CONTRATO_SOPORTADAS.join(', ');
    motivos.push(
      `El esquema declara el contrato ${contrato} y este portal entiende ${soportadas}. ` +
        (contrato > Math.max(...VERSIONES_DE_CONTRATO_SOPORTADAS)
          ? 'El flujo es más nuevo que el portal: actualiza el portal antes de usarlo.'
          : 'El flujo es más viejo que el portal: vuelve a publicarlo desde la configuración.'),
    );
  }

  const pasos = entrada.pasos;
  if (!Array.isArray(pasos) || pasos.length === 0) {
    motivos.push('El esquema necesita al menos un paso.');
    return { valido: false, motivos };
  }

  const idsDePaso = new Set<string>();
  /* Regla 4: los nombres son únicos en TODO el flujo, no sólo dentro del paso:
     el resultado es un objeto plano y los pasos escriben en el mismo. */
  const nombresUsados = new Map<string, string>();
  const nombresDeclarados = new Set<string>();

  pasos.forEach((pasoCrudo, indice) => {
    const donde = `paso ${indice + 1}`;
    if (!esObjeto(pasoCrudo)) {
      motivos.push(`${donde}: debe ser un objeto.`);
      return;
    }
    const id = typeof pasoCrudo.id === 'string' ? pasoCrudo.id.trim() : '';
    if (!id) motivos.push(`${donde}: falta \`id\`.`);
    else if (idsDePaso.has(id)) motivos.push(`${donde}: el id «${id}» ya lo usa otro paso.`);
    else idsDePaso.add(id);

    if (typeof pasoCrudo.titulo !== 'string' || !pasoCrudo.titulo.trim()) {
      motivos.push(`${donde}: falta \`titulo\`, que es lo que ve la persona.`);
    }

    const campos = pasoCrudo.campos;
    if (!Array.isArray(campos) || campos.length === 0) {
      motivos.push(`${donde}: necesita al menos un campo.`);
      return;
    }

    campos.forEach((campoCrudo, j) => {
      const dondeCampo = `${donde}, campo ${j + 1}`;
      if (!esObjeto(campoCrudo)) {
        motivos.push(`${dondeCampo}: debe ser un objeto.`);
        return;
      }
      const nombre = typeof campoCrudo.nombre === 'string' ? campoCrudo.nombre.trim() : '';
      if (!NOMBRE_DE_CAMPO.test(nombre)) {
        motivos.push(
          `${dondeCampo}: \`nombre\` debe empezar con minúscula y llevar sólo minúsculas, ` +
            `dígitos y guion bajo (hasta 60). Recibido: «${nombre}».`,
        );
      } else if (nombresUsados.has(nombre)) {
        motivos.push(
          `${dondeCampo}: el nombre «${nombre}» ya se usa en ${nombresUsados.get(nombre)}. ` +
            'Dos campos con el mismo nombre se sobreescriben y el dato perdido no deja rastro.',
        );
      } else {
        nombresUsados.set(nombre, dondeCampo);
        nombresDeclarados.add(nombre);
      }

      /* ── Regla 1: un componente desconocido no se dibuja y no se salta ── */
      const componente = campoCrudo.componente;
      if (typeof componente !== 'string' || !componente) {
        motivos.push(`${dondeCampo}: falta \`componente\`.`);
      } else if (!(COMPONENTES_SOPORTADOS as readonly string[]).includes(componente)) {
        motivos.push(
          `${dondeCampo}: este portal no sabe dibujar el componente «${componente}». ` +
            'No se omite el campo a propósito: un dato obligatorio sin capturar con la ' +
            'pantalla aparentemente completa es peor que un error. Componentes disponibles: ' +
            COMPONENTES_SOPORTADOS.join(', ') +
            '.',
        );
      }

      if (typeof campoCrudo.etiqueta !== 'string' || !campoCrudo.etiqueta.trim()) {
        motivos.push(`${dondeCampo}: falta \`etiqueta\`.`);
      }

      if (componente === 'seleccion' || componente === 'seleccion-multiple') {
        const opciones = campoCrudo.opciones;
        if (!Array.isArray(opciones) || opciones.length === 0) {
          motivos.push(
            `${dondeCampo}: un «${componente}» sin opciones es una lista vacía que nadie ` +
              'puede contestar.',
          );
        } else {
          const valores = new Set<string>();
          opciones.forEach((opcion, k) => {
            if (!esObjeto(opcion) || typeof opcion.valor !== 'string' || !opcion.valor) {
              motivos.push(`${dondeCampo}, opción ${k + 1}: falta \`valor\`.`);
              return;
            }
            if (valores.has(opcion.valor)) {
              motivos.push(`${dondeCampo}: la opción «${opcion.valor}» está repetida.`);
            }
            valores.add(opcion.valor);
            if (typeof opcion.etiqueta !== 'string' || !opcion.etiqueta.trim()) {
              motivos.push(`${dondeCampo}, opción «${opcion.valor}»: falta \`etiqueta\`.`);
            }
          });
        }
      }

      /* ── Regla 3: la condición es descripción, no código ── */
      if (campoCrudo.visibleSi !== undefined) {
        const condicion = campoCrudo.visibleSi;
        if (!esObjeto(condicion)) {
          motivos.push(`${dondeCampo}: \`visibleSi\` debe ser un objeto.`);
        } else {
          if (typeof condicion.campo !== 'string' || !condicion.campo.trim()) {
            motivos.push(`${dondeCampo}: \`visibleSi.campo\` debe nombrar otro campo.`);
          }
          if (!Array.isArray(condicion.igualA) || condicion.igualA.length === 0) {
            motivos.push(
              `${dondeCampo}: \`visibleSi.igualA\` debe traer al menos un valor constante.`,
            );
          } else if (
            condicion.igualA.some(
              (v) => !['string', 'number', 'boolean'].includes(typeof v),
            )
          ) {
            motivos.push(
              `${dondeCampo}: \`visibleSi.igualA\` sólo admite texto, número o booleano. ` +
                'El esquema describe, no ejecuta.',
            );
          }
        }
      }
    });
  });

  /*
   * Las condiciones se comprueban al final, cuando ya se conocen todos los
   * nombres: un campo puede depender de otro declarado en un paso posterior
   * —la pantalla lo resuelve con el valor vacío— pero no de uno que no existe,
   * porque entonces la condición nunca se cumple y el campo no aparece JAMÁS.
   * Eso es un campo invisible por error de dedo, y no se nota: la pantalla se
   * ve bien.
   */
  pasos.forEach((pasoCrudo, indice) => {
    if (!esObjeto(pasoCrudo) || !Array.isArray(pasoCrudo.campos)) return;
    pasoCrudo.campos.forEach((campoCrudo, j) => {
      if (!esObjeto(campoCrudo) || !esObjeto(campoCrudo.visibleSi)) return;
      const dependeDe = campoCrudo.visibleSi.campo;
      if (typeof dependeDe !== 'string' || !dependeDe) return;
      if (!nombresDeclarados.has(dependeDe)) {
        motivos.push(
          `paso ${indice + 1}, campo ${j + 1}: \`visibleSi\` depende de «${dependeDe}», ` +
            'que no existe en el flujo. El campo no se mostraría nunca.',
        );
      }
      if (dependeDe === campoCrudo.nombre) {
        motivos.push(
          `paso ${indice + 1}, campo ${j + 1}: \`visibleSi\` depende de sí mismo.`,
        );
      }
    });
  });

  if (motivos.length) return { valido: false, motivos };
  return { valido: true, esquema: entrada as unknown as EsquemaDePantalla };
}

/**
 * Los nombres de los campos obligatorios del esquema, para comprobar el
 * resultado que devuelve la pantalla.
 *
 * Existe porque la otra mitad del contrato es la vuelta: una pantalla dinámica
 * que entrega menos de lo que declaró obligatorio no se puede detectar leyendo
 * el esquema. Un campo condicionado **no** entra en la lista: su obligatoriedad
 * depende de un valor que sólo se conoce al capturar.
 */
export function camposObligatoriosSinCondicion(esquema: EsquemaDePantalla): string[] {
  return esquema.pasos
    .flatMap((paso) => paso.campos)
    .filter((campo) => campo.requerido === true && campo.visibleSi === undefined)
    .map((campo) => campo.nombre);
}

/**
 * Qué falta en un resultado capturado, comparado con el esquema.
 *
 * Devuelve los nombres que faltan; vacío significa completo. No lanza: quien
 * llama decide si eso bloquea el paso o deriva a revisión, que es una política
 * del flujo y no del contrato.
 */
export function faltantesDelResultado(
  esquema: EsquemaDePantalla,
  resultado: Record<string, unknown> | null | undefined,
): string[] {
  const capturado = resultado ?? {};
  return camposObligatoriosSinCondicion(esquema).filter((nombre) => {
    const valor = capturado[nombre];
    /*
     * `false` y `0` son respuestas. Tratarlos como ausencia es el error clásico
     * de los formularios: un «no» capturado a conciencia se leería como un campo
     * sin contestar y la pantalla volvería a pedirlo.
     */
    return valor === undefined || valor === null || valor === '';
  });
}
