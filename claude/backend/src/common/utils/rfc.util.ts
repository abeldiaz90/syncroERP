/**
 * ============================================================================
 * SyncroERP · El RFC, comprobado donde se captura
 * ----------------------------------------------------------------------------
 * POR QUE EXISTE
 *
 * El RFC de la empresa entra por la consola de SUMA, viaja por
 * `POST /aprovisionamiento/empresas` y se guarda tal cual. Nadie lo miraba en
 * ninguna de las tres capas: ni la consola, ni el controlador, ni el servicio.
 *
 * No es un dato mas. Es la identidad fiscal que va en CADA CFDI que emita esa
 * empresa. Un digito de mas o una letra cambiada no falla al darse de alta;
 * falla el dia del primer timbrado, cuando ya hay facturas emitidas con el
 * dato equivocado y corregirlo significa cancelarlas y volver a emitirlas.
 *
 * Es exactamente la forma de defecto que este sistema lleva semanas quitando:
 * algo que parece estar bien durante meses y se cobra tarde.
 *
 * ----------------------------------------------------------------------------
 * QUE SE COMPRUEBA, Y QUE NO
 *
 * Se comprueba la FORMA y la FECHA, que es lo que se puede afirmar sin
 * consultar al SAT:
 *
 *   Persona moral  3 letras + AAMMDD + 3 de homoclave   (12)
 *   Persona fisica 4 letras + AAMMDD + 3 de homoclave   (13)
 *
 * La fecha tiene que existir de verdad: `ABC130229` —29 de febrero de un año
 * que no es bisiesto— se rechaza, y es el error de captura mas comun despues
 * del mes 13.
 *
 * NO se comprueba el digito verificador. Su algoritmo tiene casos historicos
 * —RFC anteriores a la homoclave, las «&» y «Ñ» de las razones sociales— en los
 * que rechaza identificadores legitimos. Un validador que rechaza un RFC bueno
 * es peor que no tener validador: obliga a la gente a buscarle la vuelta, y
 * quien le busca la vuelta a un control deja de creer en los demas.
 *
 * Tampoco se comprueba que exista: eso solo lo sabe el SAT.
 * ============================================================================
 */

/** `XAXX010101000` y `XEXX010101000` son los RFC genericos del SAT y son validos. */
const GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

const FORMA = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{3})$/;

/*
 * Una sola forma, no una union discriminada. El proyecto compila con
 * `strictNullChecks: false`, y sin el TypeScript no estrecha por el
 * discriminante: `if (!v.valido) v.motivo` no compila aunque sea correcto.
 * Un tipo que obliga a pelearse con el compilador acaba resolviendose con un
 * `as any`, y ahi se pierde la comprobacion entera.
 */
export type VeredictoRfc = {
  valido: boolean;
  /** El RFC en mayusculas y sin separadores. `null` si no es valido. */
  normalizado: string | null;
  tipo: 'FISICA' | 'MORAL' | 'GENERICO' | null;
  /** Que esta mal, en palabras. `null` si es valido. */
  motivo: string | null;
};

const bien = (
  normalizado: string,
  tipo: 'FISICA' | 'MORAL' | 'GENERICO',
): VeredictoRfc => ({ valido: true, normalizado, tipo, motivo: null });

const mal = (motivo: string): VeredictoRfc => ({
  valido: false,
  normalizado: null,
  tipo: null,
  motivo,
});

/** Mayusculas y sin espacios ni guiones, que es como lo pide el SAT. */
export function normalizarRfc(valor: string): string {
  return valor.toUpperCase().replace(/[\s.\-]/g, '');
}

function fechaExiste(aa: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12) return false;
  if (dd < 1) return false;
  // Los RFC no llevan siglo. Se prueban los dos: 19xx y 20xx.
  return [1900 + aa, 2000 + aa].some((anio) => {
    const f = new Date(Date.UTC(anio, mm - 1, dd));
    return f.getUTCMonth() === mm - 1 && f.getUTCDate() === dd;
  });
}

export function revisarRfc(valor: string | null | undefined): VeredictoRfc {
  const texto = normalizarRfc(String(valor ?? ''));
  if (!texto) {
    return mal('El RFC viene vacío.');
  }
  if (GENERICOS.has(texto)) {
    return bien(texto, 'GENERICO');
  }
  if (texto.length !== 12 && texto.length !== 13) {
    return mal(
      `El RFC «${texto}» tiene ${texto.length} caracteres. ` +
        'Son 12 para persona moral y 13 para persona física.',
    );
  }
  const partes = FORMA.exec(texto);
  if (!partes) {
    return mal(
      `El RFC «${texto}» no tiene la forma que pide el SAT. ` +
        'Una persona moral lleva 3 letras + AAMMDD + 3 de homoclave; ' +
        'una persona física, 4 letras + AAMMDD + 3 de homoclave.',
    );
  }
  const [, letras, aa, mm, dd] = partes;
  /*
   * AQUI HABIA UNA COMPROBACION MAS Y SE QUITO POR IMPOSIBLE.
   *
   * Comparaba las letras iniciales contra la longitud total —«3 letras y 12
   * caracteres, o 4 y 13»— y no podia fallar nunca: si la expresion regular
   * casa, 3 letras dan 12 y 4 dan 13 por construccion. Era un control que no
   * podia dispararse, que es justo la familia de defectos que este proyecto
   * lleva semanas quitando, cometida al escribir el validador que venia a
   * evitar otra. La delato su propia prueba, al exigir un mensaje que el codigo
   * no llegaba a producir.
   *
   * El caso que queria cazar —una letra de mas— lo caza la expresion regular y
   * lo dice el mensaje de forma, que por eso nombra las dos formas validas.
   */
  if (!fechaExiste(Number(aa), Number(mm), Number(dd))) {
    return mal(`La fecha del RFC «${texto}» no existe: ${dd}/${mm}/${aa}.`);
  }
  return bien(texto, letras.length === 3 ? 'MORAL' : 'FISICA');
}

/**
 * ----------------------------------------------------------------------------
 * El RFC contra el tipo de persona que se declaró
 *
 * Una persona moral lleva 12 caracteres y una física 13. Quien elige «Moral» en
 * el formulario y teclea un RFC de 13 se equivocó en una de las dos cosas, y
 * vale la pena decírselo antes de que ese dato salga en una factura.
 *
 * Esta regla vivía escrita a mano en `clientes.service` y `proveedores.service`,
 * con su propia expresión regular, que no miraba la fecha. Ahora usa la misma
 * comprobación que todo lo demás y sólo añade lo suyo.
 * ----------------------------------------------------------------------------
 */
export function revisarRfcDeTipo(
  valor: string | null | undefined,
  tipoPersona: 'FISICA' | 'MORAL',
): VeredictoRfc {
  const veredicto = revisarRfc(valor);
  if (!veredicto.valido) return veredicto;
  // El genérico del SAT no declara tipo de persona: se acepta tal cual.
  if (veredicto.tipo === 'GENERICO') return veredicto;
  if (veredicto.tipo !== tipoPersona) {
    const esperados = tipoPersona === 'FISICA' ? 13 : 12;
    return mal(
      `El RFC «${veredicto.normalizado}» es de persona ` +
        `${veredicto.tipo === 'FISICA' ? 'física' : 'moral'}, pero se declaró ` +
        `persona ${tipoPersona === 'FISICA' ? 'física' : 'moral'}, que lleva ` +
        `${esperados} caracteres. Corrige el RFC o el tipo de persona.`,
    );
  }
  return veredicto;
}
