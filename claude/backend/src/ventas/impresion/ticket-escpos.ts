import { Ticket } from './escpos';

/**
 * ============================================================================
 * El ticket de venta, en bytes
 * ----------------------------------------------------------------------------
 * QUÉ SE IMPRIME Y POR QUÉ
 *
 * Un ticket no es la venta entera en papel. Es lo que el cliente necesita para
 * reclamar y lo que el negocio necesita para que no le reclamen de más:
 *
 *   · Quién vendió (nombre, RFC, domicilio) y cuándo.
 *   · Qué se llevó, a qué precio, y cuánto se cobró.
 *   · Con qué pagó, cuánto entregó y cuánto se le devolvió.
 *   · El folio, también en código de barras, para encontrar la venta sin
 *     teclear. El día que alguien vuelve con un ticket arrugado, eso es la
 *     diferencia entre un minuto y diez.
 *
 * LO QUE NO ES
 *
 * No es un CFDI. Un ticket no ampara nada ante el SAT y decirlo en el papel
 * evita la discusión en el mostrador: va impreso, no se deja a la costumbre.
 *
 * LA REIMPRESIÓN VA MARCADA
 *
 * Un ticket reimpreso que no se distingue del original es un cheque en blanco:
 * sirve para cobrar dos veces una devolución. Desde la segunda copia, el papel
 * lo dice en grande.
 *
 * EL ANCHO MANDA
 *
 * Todo se arma contra `ancho` —32 caracteres en papel de 58 mm, 48 en 80 mm—
 * y nada se escribe a ojo. Por eso el mismo código sirve para las dos y por eso
 * se puede comprobar contando columnas, sin enchufar nada.
 * ============================================================================
 */

export interface RenglonTicket {
  nombre: string;
  sku?: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
  subtotal: number;
}

export interface DatosTicket {
  empresa: {
    nombreComercial: string;
    rfc?: string | null;
    direccion?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    codigoPostal?: string | null;
    telefono?: string | null;
  };
  folio: number | string;
  fecha: Date;
  cajero?: string | null;
  cliente?: { nombre: string; rfc?: string | null } | null;
  renglones: RenglonTicket[];
  subtotal: number;
  descuento: number;
  impuestoTotal: number;
  total: number;
  metodoPago: string;
  montoRecibido?: number | null;
  cambio?: number | null;
  saldoFavorAplicado?: number;
  notas?: string | null;
  /** Mensaje del negocio al pie: «Gracias por su compra», horarios, etc. */
  pie?: string | null;
  /** Desde la segunda impresión del mismo ticket. */
  reimpresion?: boolean;
  /** 32 (58 mm) o 48 (80 mm). */
  ancho?: number;
  /** El cajón sólo se abre con efectivo; ver `escpos.ts`. */
  abrirCajon?: boolean;
}

const METODOS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  MSI_BANCO: 'Meses sin intereses',
  CREDITO_30D: 'Credito 30 dias',
  CREDITO_60D: 'Credito 60 dias',
  CREDITO_90D: 'Credito 90 dias',
  MENSUALIDADES: 'Pago en plazos',
};

/** Importe con dos decimales y separador de miles, sin el símbolo. */
export function importe(n: number): string {
  return (n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fechaYHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

/** Cantidad sin decimales cuando es entera: «2» se lee mejor que «2.000». */
function cantidad(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

export function armarTicket(datos: DatosTicket): Buffer {
  const t = new Ticket(datos.ancho ?? 48);
  const { empresa } = datos;

  t.iniciar().alinear('centro');

  t.doble(true).negrita(true).linea(empresa.nombreComercial || 'Ticket de venta');
  t.doble(false).negrita(false);

  if (empresa.rfc) t.linea(`RFC: ${empresa.rfc}`);
  const domicilio = [empresa.direccion, empresa.ciudad, empresa.estado]
    .filter(Boolean)
    .join(', ');
  if (domicilio) t.parrafo(domicilio);
  if (empresa.codigoPostal) t.linea(`C.P. ${empresa.codigoPostal}`);
  if (empresa.telefono) t.linea(`Tel. ${empresa.telefono}`);

  if (datos.reimpresion) {
    t.linea();
    t.doble(true).negrita(true).linea('* REIMPRESION *').doble(false).negrita(false);
  }

  t.separador('=');
  t.alinear('izquierda');
  t.renglon(`Ticket #${datos.folio}`, fechaYHora(datos.fecha));
  if (datos.cajero) t.linea(`Atendio: ${datos.cajero}`);
  if (datos.cliente?.nombre) {
    t.parrafo(`Cliente: ${datos.cliente.nombre}`);
    if (datos.cliente.rfc) t.linea(`RFC: ${datos.cliente.rfc}`);
  }
  t.separador();

  for (const r of datos.renglones) {
    t.parrafo(r.sku ? `${r.sku} ${r.nombre}` : r.nombre);
    const detalle = `${cantidad(r.cantidad)} x ${importe(r.precioUnitario)}`;
    t.renglon(`  ${detalle}`, importe(r.subtotal));
    if (r.descuento && r.descuento > 0) {
      t.renglon('  Descuento', `-${importe(r.descuento)}`);
    }
  }

  t.separador();
  t.renglon('Subtotal', importe(datos.subtotal));
  if (datos.descuento > 0) t.renglon('Descuento', `-${importe(datos.descuento)}`);
  if (datos.impuestoTotal > 0) t.renglon('IVA', importe(datos.impuestoTotal));
  if (datos.saldoFavorAplicado && datos.saldoFavorAplicado > 0) {
    t.renglon('Saldo a favor aplicado', `-${importe(datos.saldoFavorAplicado)}`);
  }

  t.negrita(true).doble(true).renglon('TOTAL', importe(datos.total)).doble(false);
  t.negrita(false);

  t.separador();
  t.renglon('Forma de pago', METODOS[datos.metodoPago] ?? datos.metodoPago);
  if (datos.montoRecibido !== null && datos.montoRecibido !== undefined) {
    t.renglon('Recibido', importe(datos.montoRecibido));
    const cambio = datos.cambio ?? datos.montoRecibido - datos.total;
    if (cambio >= 0) {
      t.negrita(true).renglon('Cambio', importe(cambio)).negrita(false);
    } else {
      /*
       * Pasa cuando el catálogo tenía otro precio y el importe final subió.
       * La pantalla ya lo avisa; el papel también, porque es lo que se lleva
       * el cliente.
       */
      t.negrita(true).renglon('FALTA POR COBRAR', importe(-cambio)).negrita(false);
    }
  }

  if (datos.notas) {
    t.separador();
    t.parrafo(datos.notas);
  }

  t.separador('=');
  t.alinear('centro');
  t.linea('Este ticket no es un comprobante fiscal.');
  t.linea('Solicite su factura con este folio.');
  if (datos.pie) {
    t.linea();
    t.parrafo(datos.pie);
  }

  t.linea();
  t.codigoDeBarras(String(datos.folio));

  t.avanzar(4).cortar();
  if (datos.abrirCajon) t.abrirCajon();

  return t.bytes();
}
