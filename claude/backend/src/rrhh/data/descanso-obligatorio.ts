/**
 * ============================================================================
 * Los días de descanso obligatorio · LFT art. 74
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * MEDIDO EL 30-SEP-2026, por pantalla, con la sesión de `rrhh`.
 *
 * Se pidieron vacaciones del viernes 2 al martes 6 de octubre —cinco días
 * naturales— y el sistema descontó **cuatro días laborables**. El cálculo era
 * coherente con su propia regla:
 *
 *     const laborable = excepcion !== undefined ? excepcion : fecha.getDay() !== 0;
 *
 * es decir: **todo es laborable salvo el domingo**. Eso es correcto como
 * mínimo legal —la LFT exige un día de descanso a la semana, art. 69— y por
 * eso el sábado cuenta salvo que la empresa diga otra cosa.
 *
 * Lo que NO estaba es el otro artículo. La misma ley fija en el **art. 74**
 * unos días de descanso OBLIGATORIO que no son negociables, y el ERP no los
 * conocía. Existía la tabla `rrhh_calendario_laboral` para excepciones… y
 * **ningún endpoint ni pantalla que la llenara**. Nadie podía cargarlos.
 *
 * La consecuencia es de dinero y es del trabajador: unas vacaciones que
 * cruzan el 16 de septiembre le consumían un día que por ley no debía
 * consumirse. Lo mismo el 1 de enero, el 1 de mayo o el 25 de diciembre.
 *
 * CÓMO SE RESOLVIÓ
 *
 * Los días del art. 74 se calculan; no se capturan. Su fecha es conocida para
 * cualquier año y tres de ellos se movieron a lunes por el decreto de 2006, así
 * que pedirle a alguien que los teclee cada enero es pedirle que se equivoque.
 *
 * La tabla de excepciones SIGUE MANDANDO: una empresa que de verdad opera el
 * 1 de mayo marca ese día como laborable y esta lista se aparta. Lo que cambia
 * es el punto de partida: antes era «sólo el domingo descansa», ahora es «el
 * domingo y lo que la ley obliga».
 *
 * LO QUE ESTE ARCHIVO NO HACE, a propósito:
 *
 *  · No incluye días de costumbre que NO son de descanso obligatorio —10 de
 *    mayo, 2 de noviembre, 12 de diciembre—. No están en el art. 74 y darlos
 *    por descanso sería regalar días que la ley no concede.
 *  · No incluye el descanso por jornada electoral (art. 74 fr. IX) porque
 *    depende de la convocatoria de cada año y no se puede calcular.
 * ============================================================================
 */

/** Un día de descanso obligatorio, ya resuelto a fecha. */
export interface DiaDescansoObligatorio {
  /** `YYYY-MM-DD` en hora local. */
  fecha: string;
  descripcion: string;
  /** La fracción del art. 74 que lo ordena. */
  fraccion: string;
}

/** `YYYY-MM-DD` de una fecha, en hora local y sin pasar por UTC. */
function iso(anio: number, mes1a12: number, dia: number): string {
  return `${anio}-${String(mes1a12).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * El día del mes en que cae el n-ésimo lunes.
 *
 * El decreto de 2006 movió tres descansos a lunes «para favorecer los fines de
 * semana largos»: el 5 de febrero al primer lunes, el 21 de marzo al tercero y
 * el 20 de noviembre al tercero. Sus fechas nominales dejaron de ser las de
 * descanso, y ése es justo el detalle que se olvida al teclearlas a mano.
 */
function lunesNumero(anio: number, mes1a12: number, cual: number): number {
  const primero = new Date(anio, mes1a12 - 1, 1);
  // getDay(): 0 domingo, 1 lunes…
  const desplazamiento = (8 - primero.getDay()) % 7;
  return 1 + desplazamiento + (cual - 1) * 7;
}

/**
 * Los días de descanso obligatorio del año, según la LFT vigente.
 *
 * El 1 de octubre sólo es descanso cada seis años, cuando toca la transmisión
 * del Poder Ejecutivo Federal (art. 74 fr. VIII). La última fue en 2024, así
 * que la serie es 2024, 2030, 2036…
 */
export function descansosObligatorios(anio: number): DiaDescansoObligatorio[] {
  const dias: DiaDescansoObligatorio[] = [
    { fecha: iso(anio, 1, 1), descripcion: 'Año nuevo', fraccion: 'I' },
    {
      fecha: iso(anio, 2, lunesNumero(anio, 2, 1)),
      descripcion: 'Aniversario de la Constitución (primer lunes de febrero)',
      fraccion: 'II',
    },
    {
      fecha: iso(anio, 3, lunesNumero(anio, 3, 3)),
      descripcion: 'Natalicio de Benito Juárez (tercer lunes de marzo)',
      fraccion: 'III',
    },
    { fecha: iso(anio, 5, 1), descripcion: 'Día del trabajo', fraccion: 'IV' },
    {
      fecha: iso(anio, 9, 16),
      descripcion: 'Independencia de México',
      fraccion: 'V',
    },
    {
      fecha: iso(anio, 11, lunesNumero(anio, 11, 3)),
      descripcion: 'Aniversario de la Revolución (tercer lunes de noviembre)',
      fraccion: 'VI',
    },
    { fecha: iso(anio, 12, 25), descripcion: 'Navidad', fraccion: 'VII' },
  ];

  /*
   * Transmisión del Poder Ejecutivo Federal. 2024 fue la última; se repite
   * cada seis años. Escrito como resta y módulo para que no haya que tocar
   * este archivo en 2030 ni en 2036.
   */
  if ((anio - 2024) % 6 === 0 && anio >= 2024) {
    dias.push({
      fecha: iso(anio, 10, 1),
      descripcion: 'Transmisión del Poder Ejecutivo Federal',
      fraccion: 'VIII',
    });
  }

  return dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Los descansos obligatorios que caen DENTRO del rango, como mapa
 * `YYYY-MM-DD → descripción`. Cubre rangos que cruzan de un año a otro.
 *
 * Filtra de verdad por el rango, y no es un detalle: la primera versión
 * devolvía los descansos de todos los años tocados sin recortar. Para contar
 * días daba igual —el recorrido sólo consulta fechas de dentro— pero el nombre
 * decía «en rango» y el contenido era otra cosa. Un nombre que miente acaba
 * usándose para lo que promete: aquí, para decirle a quien aprueba QUÉ días
 * del periodo son de descanso, donde los de fuera serían ruido.
 */
export function descansosEnRango(
  inicio: Date,
  fin: Date,
): Map<string, string> {
  const desde = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
  const hasta = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;

  const mapa = new Map<string, string>();
  for (let anio = inicio.getFullYear(); anio <= fin.getFullYear(); anio += 1) {
    for (const dia of descansosObligatorios(anio)) {
      if (dia.fecha >= desde && dia.fecha <= hasta) {
        mapa.set(dia.fecha, dia.descripcion);
      }
    }
  }
  return mapa;
}
