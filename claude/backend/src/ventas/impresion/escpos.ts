/**
 * ============================================================================
 * ESC/POS · los bytes que entiende una impresora térmica
 * ----------------------------------------------------------------------------
 * QUÉ ES ESTO
 *
 * Una impresora térmica de punto de venta no imprime HTML ni PDF: recibe texto
 * plano con unos pocos comandos de escape intercalados —negritas, centrado,
 * doble alto, corte de papel, pulso al cajón—. Ese lenguaje, ESC/POS, lo hablan
 * Epson, Star, Bixolon y los clones chinos que es lo que hay en el mostrador.
 *
 * Aquí sólo se arman los bytes. No se abre ningún socket, no se toca ninguna
 * base de datos y no se sabe nada de ventas. Por eso se puede comprobar entero
 * sin impresora y sin servidor, que es la única manera de que esto esté bien
 * antes del día que se enchufa el aparato.
 *
 * POR QUÉ NO SE USA UNA LIBRERÍA
 *
 * Las de npm traen descubrimiento USB, dependencias nativas y un modelo de
 * conexión propio. Lo que hace falta de ESC/POS para un ticket cabe en este
 * archivo, se lee entero en cinco minutos y no añade nada que compilar en el
 * servidor del cliente.
 *
 * EL ACENTO
 *
 * Es lo que más se rompe. La impresora no habla UTF-8: trae tablas de códigos
 * de un byte. Se selecciona CP858 —la europea con el símbolo del euro, que es
 * la que traen casi todas— y se traduce el texto a esa tabla. Lo que no esté en
 * ella se transcribe sin acento en vez de salir como un garabato: un ticket que
 * dice «Jose Perez» se entiende; uno que dice «Jos? P?rez» parece una avería.
 * ============================================================================
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Alineación del texto que sigue. */
export type Alineacion = 'izquierda' | 'centro' | 'derecha';

/**
 * CP858, la tabla de códigos que se selecciona en la impresora.
 *
 * Sólo se listan los caracteres que puede traer un ticket en español: el resto
 * del rango alto no se usa nunca y enumerarlo entero sería ruido.
 */
const CP858: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87,
  ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f,
  É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97,
  ÿ: 0x98, Ö: 0x99, Ü: 0x9a, '€': 0xd5, ƒ: 0x9f,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7,
  '¿': 0xa8, '¬': 0xaa, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
  Á: 0xb5, Â: 0xb6, À: 0xb7, Í: 0xd6, Î: 0xd7, Ì: 0xd8, Ó: 0xe0, Ú: 0xe9,
  Ô: 0xe2, Ò: 0xe3, õ: 0xe4, Õ: 0xe5, Ù: 0xeb, '°': 0xf8, '·': 0xfa,
};

/** Lo que se pone cuando el carácter no está en la tabla: la letra sin adorno. */
const SIN_ADORNO: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
  ñ: 'n', Ñ: 'N', ü: 'u', Ü: 'U', '¿': '?', '¡': '!', '€': 'EUR', '°': 'o',
  '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...',
};

/**
 * Traduce una cadena a los bytes de la tabla de códigos de la impresora.
 *
 * El orden importa: primero la tabla, y sólo si el carácter no está en ella se
 * cae a la versión sin acento. Al revés se perderían los acentos que la
 * impresora SÍ sabe poner.
 */
export function aBytesDeImpresora(texto: string): Buffer {
  const salida: number[] = [];
  for (const car of texto) {
    const codigo = car.charCodeAt(0);
    if (codigo < 0x80) {
      salida.push(codigo);
      continue;
    }
    const enTabla = CP858[car];
    if (enTabla !== undefined) {
      salida.push(enTabla);
      continue;
    }
    const plano = SIN_ADORNO[car];
    if (plano) {
      for (const c of plano) salida.push(c.charCodeAt(0));
      continue;
    }
    /* Ni en la tabla ni con equivalente: un espacio antes que un garabato. */
    salida.push(0x20);
  }
  return Buffer.from(salida);
}

/**
 * Arma un ticket por partes. Se encadena y al final `bytes()` entrega todo.
 *
 * Es deliberadamente tonto: no sabe qué es una venta ni un total. Quien decide
 * qué dice el ticket es `ticket-escpos.ts`; esto sólo sabe escribir.
 */
export class Ticket {
  private readonly partes: Buffer[] = [];

  /** @param ancho Caracteres por renglón: 32 en papel de 58 mm, 48 en 80 mm. */
  constructor(readonly ancho: number = 48) {
    if (ancho < 24 || ancho > 64) {
      throw new Error(`Ancho de ticket fuera de rango: ${ancho}`);
    }
  }

  private crudo(...bytes: number[]): this {
    this.partes.push(Buffer.from(bytes));
    return this;
  }

  /** ESC @ · deja la impresora como recién encendida. */
  iniciar(): this {
    /* ESC @ reinicia; ESC t 19 selecciona CP858. */
    return this.crudo(ESC, 0x40).crudo(ESC, 0x74, 19);
  }

  alinear(donde: Alineacion): this {
    const n = donde === 'centro' ? 1 : donde === 'derecha' ? 2 : 0;
    return this.crudo(ESC, 0x61, n);
  }

  negrita(encendida: boolean): this {
    return this.crudo(ESC, 0x45, encendida ? 1 : 0);
  }

  /** Doble alto y doble ancho, para el total y el nombre del negocio. */
  doble(encendido: boolean): this {
    return this.crudo(GS, 0x21, encendido ? 0x11 : 0x00);
  }

  texto(linea: string): this {
    this.partes.push(aBytesDeImpresora(linea));
    return this;
  }

  linea(texto = ''): this {
    return this.texto(texto).crudo(0x0a);
  }

  /**
   * Una etiqueta a la izquierda y un importe a la derecha, separados por los
   * espacios que quepan. Si no cabe, se recorta la etiqueta, nunca el importe:
   * un ticket donde el total sale a medias no sirve para nada.
   */
  renglon(etiqueta: string, importe: string): this {
    const hueco = this.ancho - importe.length;
    const izquierda =
      etiqueta.length > hueco - 1 ? etiqueta.slice(0, Math.max(hueco - 1, 0)) : etiqueta;
    const relleno = ' '.repeat(Math.max(this.ancho - izquierda.length - importe.length, 1));
    return this.linea(`${izquierda}${relleno}${importe}`);
  }

  separador(caracter = '-'): this {
    return this.linea(caracter.repeat(this.ancho));
  }

  /**
   * Parte un texto largo en renglones que quepan, cortando por espacios.
   * Un nombre de producto de sesenta letras, si no, se come el precio.
   */
  parrafo(texto: string, sangria = 0): this {
    const util = this.ancho - sangria;
    const palabras = texto.split(/\s+/).filter(Boolean);
    let actual = '';
    for (const palabra of palabras) {
      if (!actual) {
        actual = palabra.slice(0, util);
      } else if (actual.length + 1 + palabra.length <= util) {
        actual += ` ${palabra}`;
      } else {
        this.linea(' '.repeat(sangria) + actual);
        actual = palabra.slice(0, util);
      }
    }
    if (actual) this.linea(' '.repeat(sangria) + actual);
    return this;
  }

  /** Código de barras CODE39 con el folio, para buscar la venta después. */
  codigoDeBarras(contenido: string): this {
    const limpio = contenido.replace(/[^0-9A-Z\-. $/+%]/g, '').slice(0, 20);
    if (!limpio) return this;
    this.crudo(GS, 0x68, 60); // altura
    this.crudo(GS, 0x77, 2); // ancho del módulo
    this.crudo(GS, 0x48, 2); // el número, debajo
    this.crudo(GS, 0x6b, 4); // CODE39, terminado en NUL
    this.partes.push(Buffer.from(limpio, 'ascii'));
    return this.crudo(0x00);
  }

  /** Papel de sobra para que el corte no se lleve la última línea. */
  avanzar(lineas = 4): this {
    return this.crudo(ESC, 0x64, lineas);
  }

  /** GS V 66 · corte parcial, que deja una pestaña y no tira el ticket. */
  cortar(): this {
    return this.crudo(GS, 0x56, 66, 0);
  }

  /**
   * Pulso al cajón de dinero, que va enchufado a la impresora.
   *
   * Sólo se manda cuando el cobro fue en efectivo: un cajón que se abre solo
   * con cada tarjeta es un cajón que acaba quedándose abierto.
   */
  abrirCajon(): this {
    return this.crudo(ESC, 0x70, 0, 25, 250);
  }

  bytes(): Buffer {
    return Buffer.concat(this.partes);
  }
}
