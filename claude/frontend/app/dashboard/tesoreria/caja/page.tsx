'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';

type CuentaCaja = {
  id: string;
  nombre: string;
  tipo: 'CAJA' | 'BANCO' | 'TPV';
  activo: boolean;
};

/**
 * Lo que devuelve `GET /credito/cuentas-bancarias/para-cobro`: nombre y tipo,
 * sin CLABE ni número de cuenta. Ya viene filtrado a las activas, así que no
 * trae `activo`.
 */
type CuentaParaCobro = {
  id: string;
  nombre: string;
  tipo: 'CAJA' | 'BANCO' | 'TPV';
  esPorDefecto?: boolean;
};

type Turno = {
  id: string;
  cuentaCajaId: string;
  estado: 'ABIERTO' | 'CERRADO';
  fondoInicial: number;
  totalEntradas: number;
  totalSalidas: number;
  efectivoEsperado: number;
  efectivoContado?: number | null;
  diferencia?: number | null;
  fechaApertura: string;
  /** `null` cuando el servidor no pudo resolverlo. Nunca el uuid en crudo. */
  usuarioAperturaNombre?: string | null;
  cuentaCajaNombre?: string | null;
  fechaCierre?: string | null;
};

type CuentaContable = {
  id: string;
  numeroCuenta: string;
  nombre: string;
  tipo?: string;
  permiteMovimientoManual?: boolean;
};

type Movimiento = {
  id: string;
  naturaleza: 'ENTRADA' | 'SALIDA';
  tipo: string;
  importe: number;
  concepto: string;
  referencia?: string | null;
  fechaCreacion: string;
};

type ResumenTurno = {
  turno: Turno;
  resumenPorTipo: Array<{
    tipo: string;
    naturaleza: 'ENTRADA' | 'SALIDA';
    importe: number;
  }>;
};

const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function mensaje(error: unknown) {
  if (error instanceof ApiError) return error.mensajeParaPantalla();
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

/**
 * ============================================================================
 * Quien cobra no podía contar su propia caja
 * ----------------------------------------------------------------------------
 * MEDIDO EL 29-SEP-2026, por pantalla, con la sesión de `empleado`
 *
 * Esta pantalla pedía `GET /credito/cuentas-bancarias` —el catálogo completo,
 * con CLABE y números de cuenta—. A `empleado` ese endpoint le está VEDADO a
 * propósito y por escrito en la plantilla de permisos:
 *
 *     accionesVedadas: ['GET /credito/cuentas-bancarias']
 *     «No necesita las cuentas bancarias de la empresa […]: números de cuenta
 *      y CLABE a la vista de quien atiende al público.»
 *
 * Esa decisión es correcta. Lo que estaba mal es que esta pantalla no pedía
 * otra cosa. Resultado: el mostrador —el único rol que cobra en efectivo, y el
 * que tiene el módulo `caja` concedido— abría «Caja, corte y arqueo», leía
 * «El catálogo de cajas no está en tu perfil» y no podía ABRIR el turno, ni
 * registrar una entrada o un retiro, ni CERRARLO. El corte de caja era
 * imposible justo para quien maneja el efectivo.
 *
 * Y la salida existía desde antes: `…/para-cobro` da id, nombre y tipo y nada
 * más —es el endpoint que la plantilla ya declara irrenunciable para el
 * mostrador, porque sin él el punto de venta no puede ni elegir caja—.
 *
 * Así que la pantalla pide lo poco que necesita, no el catálogo entero. No se
 * le concede nada nuevo a nadie: se deja de exigir de más. El respaldo al
 * catálogo completo se conserva para los roles que ya lo tienen y que podrían
 * no tener el corto.
 * ============================================================================
 */
async function cargarCajas(): Promise<{ vedado: boolean; cajas: CuentaCaja[] }> {
  const corta = await conPermiso(
    api.get<CuentaParaCobro[]>('/credito/cuentas-bancarias/para-cobro'),
  );

  if (!corta.vedado) {
    const lista = Array.isArray(corta.valor) ? corta.valor : [];
    return {
      vedado: false,
      // `para-cobro` ya filtró por activas; marcarlas aquí evita que el filtro
      // de abajo las descarte por un campo que ese endpoint no envía.
      cajas: lista
        .filter((cuenta) => cuenta.tipo === 'CAJA')
        .map((cuenta) => ({ ...cuenta, activo: true })),
    };
  }

  const completa = await conPermiso(
    api.get<CuentaCaja[]>('/credito/cuentas-bancarias'),
  );
  const lista = Array.isArray(completa.valor) ? completa.valor : [];
  return {
    vedado: completa.vedado,
    cajas: lista.filter((cuenta) => cuenta.activo && cuenta.tipo === 'CAJA'),
  };
}

/**
 * ============================================================================
 * CONTAR EL CAJÓN, NO TECLEAR UN TOTAL
 * ----------------------------------------------------------------------------
 * El arqueo pedía un número: «Efectivo contado». Quien cuenta el cajón hace la
 * suma de cabeza o en el teléfono y teclea el resultado, y cualquier error de
 * esa suma se convierte en un faltante o un sobrante contabilizado a su nombre
 * —y a partir de ahí nadie puede reconstruir si faltaba dinero o faltaba un
 * cero—.
 *
 * Esto deja contar como se cuenta de verdad: por montón. El sistema suma.
 *
 * DOS CAMPOS QUE PUEDEN DECIR COSAS DISTINTAS SON PEOR QUE UNO
 *
 * Mientras el conteo por denominaciones está abierto, el total NO se puede
 * teclear: es el resultado, y se dice que lo es. Cerrarlo devuelve el campo a
 * mano, en blanco. En ningún momento hay dos cifras compitiendo por ser la
 * buena, que es justo el defecto que este arqueo existe para evitar.
 * ============================================================================
 */
const DENOMINACIONES = [
  { valor: 1000, etiqueta: '$1,000', clase: 'billete' as const },
  { valor: 500, etiqueta: '$500', clase: 'billete' as const },
  { valor: 200, etiqueta: '$200', clase: 'billete' as const },
  { valor: 100, etiqueta: '$100', clase: 'billete' as const },
  { valor: 50, etiqueta: '$50', clase: 'billete' as const },
  { valor: 20, etiqueta: '$20', clase: 'billete' as const },
  { valor: 20, etiqueta: '$20', clase: 'moneda' as const },
  { valor: 10, etiqueta: '$10', clase: 'moneda' as const },
  { valor: 5, etiqueta: '$5', clase: 'moneda' as const },
  { valor: 2, etiqueta: '$2', clase: 'moneda' as const },
  { valor: 1, etiqueta: '$1', clase: 'moneda' as const },
  { valor: 0.5, etiqueta: '50¢', clase: 'moneda' as const },
];

/** La llave de cada montón: el valor no basta, hay billete y moneda de $20. */
const llaveDe = (d: (typeof DENOMINACIONES)[number]) => `${d.clase}-${d.valor}`;

export default function CajaPage() {
  const [cuentas, setCuentas] = useState<CuentaCaja[]>([]);
  /** El catálogo de cuentas de caja no es de todos los roles que ven esta pantalla. */
  const [cuentasVedadas, setCuentasVedadas] = useState(false);
  /** El catálogo de cuentas contables no se pudo leer: no hay contra qué registrar. */
  const [contablesVedadas, setContablesVedadas] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>('');
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  /*
   * `null` mientras se lee, `[]` cuando de verdad no hay ninguno. Un cero
   * mientras se consulta no es un cero, y aquí el cero son pesos.
   */
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [cargando, setCargando] = useState(true);
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * «La entrada quedó registrada» con los números sin moverse
   * --------------------------------------------------------------------------
   * MEDIDO EN VIVO el 7-oct-2026. Se registró una entrada de $200 contra Otros
   * Ingresos. El servidor la aplicó bien —entradas 288.84 → 488.84, efectivo
   * esperado 0 → 200, cuarto movimiento en la lista—. La pantalla dijo «La
   * entrada quedó registrada.» y SIGUIÓ ENSEÑANDO ENTRADAS $288.84, ESPERADO
   * $0.00 y tres movimientos.
   *
   * La causa: `ejecutar()` llama a `cargar()`, que refresca la lista de turnos
   * abiertos, pero el resumen y los movimientos los traía un `useEffect` que
   * dependía de `turno?.id` —y el turno es el mismo, así que no volvía a
   * correr—. Y como los recuadros leen `resumen?...` antes que el turno de la
   * lista, el resumen viejo tapaba incluso los números frescos que sí habían
   * llegado.
   *
   * En una pantalla de efectivo esto no es un refresco perezoso: es un «ya
   * quedó» junto a unas cifras que dicen que no quedó. Quien lo lee lo
   * registra otra vez. Doble entrada de caja por una pantalla que no se
   * recargó.
   *
   * Ahora cada recarga incrementa esta marca, y el detalle se vuelve a leer
   * aunque el turno no cambie.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const [revision, setRevision] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  const [cuentaNueva, setCuentaNueva] = useState('');
  const [fondo, setFondo] = useState('0');
  const [movimiento, setMovimiento] = useState({ importe: '', concepto: '', referencia: '', cuentaContrapartidaId: '' });
  /*
   * Una entrada o un retiro manual ya no sólo mueven el turno: se propagan a
   * Tesorería y generan póliza. El sistema no puede adivinar la contrapartida
   * —un retiro puede ser un depósito al banco, un gasto o una entrega a la
   * dirección— así que quien captura debe elegirla.
   */
  const [cuentasContables, setCuentasContables] = useState<CuentaContable[]>([]);
  const [conteo, setConteo] = useState('');
  /** `null` = se teclea el total a mano. Un objeto = se está contando por montones. */
  const [montones, setMontones] = useState<Record<string, string> | null>(null);
  const [observaciones, setObservaciones] = useState('');

  const turno = useMemo(
    () => turnos.find((item) => item.id === seleccionado) ?? turnos[0] ?? null,
    [seleccionado, turnos],
  );

  /*
   * El total de los montones, al centavo. Se redondea a dos decimales porque
   * las monedas de 50¢ en coma flotante producen colas de céntimos que luego
   * aparecen como una diferencia de arqueo de $0.0000001.
   */
  const totalMontones = useMemo(() => {
    if (!montones) return null;
    const suma = DENOMINACIONES.reduce((acc, d) => {
      const n = Number(montones[llaveDe(d)] ?? '');
      return acc + (Number.isFinite(n) && n > 0 ? n * d.valor : 0);
    }, 0);
    return Math.round(suma * 100) / 100;
  }, [montones]);

  /** Al menos un montón tecleado. Abrir el panel no es haber contado. */
  const hayAlgunMonton = Boolean(
    montones && Object.values(montones).some((v) => v.trim() !== ''),
  );

  /*
   * Mientras se cuenta por montones, el total del arqueo ES la suma. No se
   * copia al campo: se sustituye, para que no puedan existir dos cifras
   * distintas peleando por ser la buena.
   *
   * Y mientras no se haya tecleado NINGÚN montón, no hay cifra: cadena vacía,
   * no cero. Con cero, abrir el panel para empezar a contar enseñaba al
   * instante «FALTAN $150.00» —el efectivo esperado entero— antes de haber
   * contado un solo billete. Un cero que nadie contó no es un conteo de cero,
   * y un aviso que grita desde el primer segundo se aprende a ignorar.
   */
  const contadoEfectivo = montones
    ? hayAlgunMonton
      ? String(totalMontones ?? 0)
      : ''
    : conteo;

  /*
   * El arqueo, restado en el momento. `null` mientras no haya una cifra
   * tecleada: un cero que nadie escribió no es un conteo de cero.
   */
  const arqueo = useMemo(() => {
    if (!turno || contadoEfectivo.trim() === '') return null;
    const contado = Number(contadoEfectivo);
    if (!Number.isFinite(contado)) return null;
    const esperado = Number(resumen?.turno.efectivoEsperado ?? turno.efectivoEsperado ?? 0);
    const diferencia = Math.round((contado - esperado) * 100) / 100;
    // El mismo umbral que aplica el servidor, para que no digan cosas distintas.
    return { contado, esperado, diferencia, cuadra: Math.abs(diferencia) < 0.01 };
  }, [contadoEfectivo, resumen, turno]);

  const nombreCaja = useCallback(
    (cuentaId: string) => cuentas.find((cuenta) => cuenta.id === cuentaId)?.nombre ?? 'Caja',
    [cuentas],
  );

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Los movimientos de un turno no se quedan debajo del nombre de otro
   * --------------------------------------------------------------------------
   * Con dos cajas abiertas, al pulsar la segunda pestaña el encabezado y los
   * cuatro recuadros cambiaban al instante —salen del listado, que ya está en
   * memoria— y la tabla de movimientos seguía enseñando los de la caja
   * anterior hasta que llegaba la respuesta. Durante ese segundo la pantalla
   * afirmaba que esos cobros eran de esta caja.
   *
   * En una pantalla de arqueo eso no es un parpadeo: es una lista de efectivo
   * atribuida a la caja equivocada. Se vacía primero y se dice que se está
   * leyendo.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const cargarDetalle = useCallback(async (turnoId: string) => {
    setResumen(null);
    setMovimientos(null);
    const [resumenTurno, lista] = await Promise.all([
      api.get<ResumenTurno>(`/caja/turnos/${turnoId}/resumen`),
      api.get<Movimiento[]>(`/caja/turnos/${turnoId}/movimientos`),
    ]);
    setResumen(resumenTurno);
    setMovimientos(Array.isArray(lista) ? lista : []);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    /*
     * OJO: aquí NO se borra el aviso.
     *
     * Estaba `setAviso(null)` en esta línea, y `ejecutar()` pone el aviso y
     * acto seguido llama a `cargar()` para refrescar. Resultado: el mensaje se
     * escribía y se borraba unos milisegundos después, siempre. Los cuatro
     * avisos de éxito de esta pantalla —abrir la caja, registrar una entrada,
     * registrar un retiro y cerrar el turno— no los ha visto nunca nadie. Se
     * vio al cerrar un turno con sobrante: la caja desapareció de la pantalla
     * y no quedó ni una palabra de qué había pasado con la diferencia.
     *
     * Quien empieza una acción sí limpia el aviso anterior: eso lo hace
     * `ejecutar()` al arrancar, que es donde corresponde.
     */
    try {
      /*
       * ──────────────────────────────────────────────────────────────────────
       * El catálogo de cuentas bancarias no es de todos los que ven esta
       * pantalla. `GET /credito/cuentas-bancarias` responde 403 al contador
       * —que sí tiene la caja en su menú— y, dentro de un `Promise.all`, ese
       * 403 tumbaba las otras dos llamadas: la pantalla entera en blanco con
       * «No tienes permisos suficientes», incluidos los turnos abiertos, que
       * sí puede ver. Medido el 25-sep-2026.
       *
       * Sin cuentas de caja no hay nada que arquear, así que la pantalla lo
       * dice con esas palabras en vez de dejar un vacío que parece una avería.
       * ──────────────────────────────────────────────────────────────────────
       */
      const [cajasRes, abiertos, contables] = await Promise.all([
        cargarCajas(),
        api.get<Turno[]>('/caja/turnos/abiertos'),
        /*
         * El catálogo de cuentas es de Contabilidad, y esta pantalla también la
         * abre el mostrador. Si la lectura falla —403 o red— el desplegable de
         * «¿contra qué cuenta se registra?» se quedaba VACÍO y la entrada o el
         * retiro manual no se podían registrar, sin una palabra que lo
         * explicara. Es el mismo defecto que apagaba el botón «Cobrar» en la
         * caja. Se distingue la lista vacía del fallo.
         */
      /*
       * ──────────────────────────────────────────────────────────────────
       * Una cuenta de mayor no recibe pólizas, así que no se ofrece
       * ------------------------------------------------------------------
       * El catálogo trae las 1083 cuentas del plan, y 153 de ellas son
       * cuentas de MAYOR —«100 · Activo», «101 · Caja», «600 · Gastos»—:
       * agrupan a sus hijas y no se les asienta nada. `polizas.service` lo
       * rechaza, y con razón.
       *
       * Este desplegable las ofrecía todas. El único filtro que aplicaba era
       * `permiteMovimientoManual`, y las 153 lo pasan, así que ninguna
       * quedaba fuera: elegir cualquiera de ellas era elegir un rechazo. Un
       * botón que lleva a un no.
       *
       * El servidor ya sabe hacer esta distinción —`?soloAfectables=true`, que
       * además filtra las inactivas— y tres pantallas ya se lo piden. Ésta no.
       * ──────────────────────────────────────────────────────────────────
       */
        conPermiso(
          api.get<CuentaContable[]>('/finanzas/cuentas-contables', {
            query: { soloAfectables: true },
          }),
        ),
      ]);
      setCuentasVedadas(cajasRes.vedado);
      setContablesVedadas(contables.vedado);
      const listaContables = contables.valor ?? [];
      setCuentasContables(
        (Array.isArray(listaContables) ? listaContables : []).filter(
          (cuenta) => cuenta.permiteMovimientoManual !== false,
        ),
      );
      const cajas = cajasRes.cajas;
      setCuentas(cajas);
      // Las otras tres lecturas ya se comprueban; ésta no, y de ella se llama
      // `.some` y `.length` tres líneas más abajo.
      const listaAbiertos = Array.isArray(abiertos) ? abiertos : [];
      setTurnos(listaAbiertos);
      setCuentaNueva((actual) =>
        cajas.some((cuenta) => cuenta.id === actual) ? actual : cajas[0]?.id || '',
      );
      setSeleccionado((actual) =>
        listaAbiertos.some((item) => item.id === actual) ? actual : listaAbiertos[0]?.id || '',
      );
      if (!listaAbiertos.length) {
        setResumen(null);
        setMovimientos([]);
      }
      setRevision((n) => n + 1);
    } catch (error) {
      setAviso({ texto: mensaje(error), ok: false });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (turno?.id) void cargarDetalle(turno.id).catch((error) => setAviso({ texto: mensaje(error), ok: false }));
    // `revision` está aquí a propósito: sin ella, un movimiento registrado
    // sobre el mismo turno no volvía a leer el resumen. Ver la nota de arriba.
  }, [turno?.id, revision, cargarDetalle]);

  /*
   * `texto` puede ser una frase fija o una función que MIRA LA RESPUESTA.
   *
   * Antes era siempre fija: el cierre decía «el corte y arqueo quedaron
   * cerrados» pasara lo que pasara. El servidor contesta, en cambio, si el
   * arqueo cuadró (no hay nada que contabilizar), si el faltante o el sobrante
   * ya quedó en una póliza, o si quedó pendiente porque la contabilización
   * falló. Quien cierra la caja es responsable de esa diferencia y se iba sin
   * saber cuál de las tres cosas ocurrió: la respuesta existía y la pantalla
   * la tiraba.
   */
  async function ejecutar(
    accion: () => Promise<unknown>,
    texto: string | ((respuesta: any) => string),
  ) {
    setProcesando(true);
    setAviso(null);
    try {
      const respuesta = await accion();
      setAviso({
        texto: typeof texto === 'function' ? texto(respuesta) : texto,
        ok: true,
      });
      await cargar();
      return true;
    } catch (error) {
      setAviso({ texto: mensaje(error), ok: false });
      return false;
    } finally {
      setProcesando(false);
    }
  }

  async function abrir(evento: FormEvent) {
    evento.preventDefault();
    const ok = await ejecutar(
      () => api.post('/caja/turnos/abrir', {
        cuentaCajaId: cuentaNueva,
        fondoInicial: Number(fondo),
      }),
      'La caja quedó abierta y lista para operar.',
    );
    if (ok) setFondo('0');
  }

  async function registrarManual(tipo: 'entrada' | 'retiro') {
    if (!turno) return;
    if (!movimiento.cuentaContrapartidaId) {
      setAviso({ texto: 'Elige la cuenta contra la que se registra el movimiento.', ok: false });
      return;
    }
    const ok = await ejecutar(
      () => api.post(`/caja/movimientos/${tipo}`, {
        cuentaCajaId: turno.cuentaCajaId,
        importe: Number(movimiento.importe),
        concepto: movimiento.concepto.trim(),
        referencia: movimiento.referencia.trim() || undefined,
        cuentaContrapartidaId: movimiento.cuentaContrapartidaId,
      }),
      tipo === 'entrada' ? 'La entrada quedó registrada.' : 'El retiro quedó registrado.',
    );
    if (ok) setMovimiento({ importe: '', concepto: '', referencia: '', cuentaContrapartidaId: '' });
  }

  async function cerrar(evento: FormEvent) {
    evento.preventDefault();
    if (!turno) return;
    /*
     * CERRAR SIN HABER CONTADO NADA.
     *
     * Un campo `readOnly` no lo valida el navegador, así que con el conteo por
     * montones abierto y sin teclear una sola pieza el formulario se podía
     * enviar con cero. Y cerrar con cero no es un detalle: contabiliza TODO el
     * efectivo esperado como faltante, a nombre de quien cerró, y no hay vuelta
     * atrás.
     *
     * Un cajón vacío de verdad sí se puede cerrar: basta escribir un 0 en
     * cualquier montón, que es un acto deliberado. Lo que no pasa es el envío
     * sin haber tocado nada.
     */
    if (montones && !hayAlgunMonton) {
      setAviso({
        texto:
          'Todavía no has contado ningún montón. Si el cajón está vacío, escribe 0 en alguna denominación para dejarlo dicho.',
        ok: false,
      });
      return;
    }
    const ok = await ejecutar(
      // Se manda el total que se ve en pantalla —contado o tecleado—. Nunca otro.
      () => api.post(`/caja/turnos/${turno.id}/cerrar`, {
        efectivoContado: Number(contadoEfectivo),
        observaciones: observaciones.trim() || undefined,
      }),
      (r: any) => {
        const contado = Number(contadoEfectivo);
        const esperado = Number(
          resumen?.turno.efectivoEsperado ?? turno?.efectivoEsperado ?? 0,
        );
        const diferencia = Math.round((contado - esperado) * 100) / 100;
        const base =
          Math.abs(diferencia) < 0.01
            ? `Turno cerrado. El arqueo cuadró: ${moneda.format(contado)} contados contra ${moneda.format(esperado)} esperados.`
            : diferencia < 0
              ? `Turno cerrado con un FALTANTE de ${moneda.format(Math.abs(diferencia))}.`
              : `Turno cerrado con un SOBRANTE de ${moneda.format(diferencia)}.`;
        if (Math.abs(diferencia) < 0.01) return `${base} No hay nada que contabilizar.`;
        if (r?.estadoContable === 'GENERADO') return `${base} Ya quedó registrado en una póliza.`;
        if (r?.estadoContable === 'PENDIENTE')
          return `${base} La póliza quedó PENDIENTE en la bandeja de asientos; revísala en Finanzas.`;
        return base;
      },
    );
    if (ok) {
      setConteo('');
      setMontones(null);
      setObservaciones('');
    }
  }

  if (cargando) {
    return (
      <div className="min-h-[55vh] grid place-items-center text-slate-500">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando operación de caja…
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Tesorería</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Caja, corte y arqueo</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cada venta, cobranza, reembolso, entrada y retiro en efectivo queda ligado al turno abierto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </header>

      {aviso && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {aviso.texto}
        </div>
      )}

      {cuentasVedadas ? (
        /*
         * «No hay cajas» y «no puedes ver las cajas» son dos cosas distintas, y
         * mandar a alguien a crear una cuenta que no puede ni listar es hacerle
         * perder el viaje.
         */
        <section className="rounded-2xl border border-slate-300 bg-slate-50 p-6">
          <h2 className="font-semibold text-slate-900">El catálogo de cajas no está en tu perfil</h2>
          <p className="mt-1 text-sm text-slate-700">
            Las cuentas de caja las administra Crédito y cobranza. Puedes seguir
            consultando los turnos abiertos, pero para arquear una caja necesitas
            que tu rol incluya ese catálogo.
          </p>
        </section>
      ) : !cuentas.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">Primero crea una cuenta de tipo Caja</h2>
          <p className="mt-1 text-sm text-amber-800">
            Ve a Crédito y cobranza → Cuentas bancarias, registra la caja física y relaciónala con su cuenta contable.
          </p>
        </section>
      ) : !turnos.length ? (
        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">No hay cajas abiertas</h2>
            <p className="mt-1 text-sm text-slate-500">
              El POS bloqueará cobros en efectivo hasta que exista un turno abierto para la caja elegida.
            </p>
          </div>
          <form onSubmit={abrir} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-950">Abrir turno</h2>
            <label className="block text-sm font-medium text-slate-700">
              Caja
              <select value={cuentaNueva} onChange={(e) => setCuentaNueva(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
                {cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Fondo inicial
              <input value={fondo} onChange={(e) => setFondo(e.target.value)} type="number" min="0" step="0.01" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3" required />
            </label>
            <button disabled={procesando || !cuentaNueva} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {/*
                «Abrir turno», no «Abrir caja», por dos razones. La primera es
                que el encabezado de este mismo formulario ya dice «Abrir
                turno»: el botón contradecía a su propio título.

                La segunda importa más. En Ventas hay otra acción llamada
                «Abrir caja» que abre el punto de venta —una ventana— y aquí
                abre un TURNO con su fondo inicial, que es un acto con
                consecuencia contable. Las mismas dos palabras para una ventana
                y para un movimiento de efectivo: quien aprende un significado
                lee mal el otro.
              */}
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Abrir turno
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="flex gap-2 overflow-x-auto pb-1">
            {turnos.map((item) => (
              <button key={item.id} type="button" onClick={() => setSeleccionado(item.id)} className={`min-w-56 rounded-xl border p-3 text-left transition ${turno?.id === item.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <p className="text-sm font-semibold text-slate-900">{nombreCaja(item.cuentaCajaId)}</p>
                {/*
                  Quién la abrió, no sólo cuándo. Con varias cajas abiertas a la
                  vez el nombre es lo que distingue un cajón de otro; la hora,
                  no. Y quien cierra se hace responsable de la diferencia, así
                  que conviene ver de quién era el turno antes de arquearlo.
                */}
                <p className="mt-1 text-xs text-slate-500">
                  {item.usuarioAperturaNombre
                    ? `Abierta por ${item.usuarioAperturaNombre}`
                    : 'Abierta'}
                  {' · '}
                  {new Date(item.fechaApertura).toLocaleString('es-MX')}
                </p>
              </button>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Fondo inicial', valor: turno?.fondoInicial ?? 0, icono: CircleDollarSign },
              { label: 'Entradas', valor: resumen?.turno.totalEntradas ?? turno?.totalEntradas ?? 0, icono: ArrowDownCircle },
              { label: 'Salidas', valor: resumen?.turno.totalSalidas ?? turno?.totalSalidas ?? 0, icono: ArrowUpCircle },
              { label: 'Efectivo esperado', valor: resumen?.turno.efectivoEsperado ?? turno?.efectivoEsperado ?? 0, icono: Scale },
            ].map(({ label, valor, icono: Icono }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-medium uppercase tracking-wide">{label}</span><Icono className="h-4 w-4" /></div>
                <p className="mt-2 text-xl font-bold text-slate-950">{moneda.format(Number(valor))}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-950">Movimientos del turno</h2>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3 text-right">Importe</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(movimientos ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(item.fechaCreacion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${item.naturaleza === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{item.tipo.replaceAll('_', ' ')}</span></td>
                        <td className="px-4 py-3 text-slate-700">{item.concepto}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${item.naturaleza === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.naturaleza === 'ENTRADA' ? '+' : '−'}{moneda.format(Number(item.importe))}</td>
                      </tr>
                    ))}
                    {movimientos === null ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Leyendo los movimientos de esta caja…</td></tr>
                    ) : !movimientos.length ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">El turno todavía no tiene movimientos.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <form onSubmit={(e) => { e.preventDefault(); void registrarManual('entrada'); }} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-950">Entrada o retiro manual</h2>
                <input value={movimiento.importe} onChange={(e) => setMovimiento({ ...movimiento, importe: e.target.value })} aria-label="Importe del movimiento" type="number" min="0.01" step="0.01" placeholder="Importe" className="h-10 w-full rounded-lg border border-slate-200 px-3" required />
                <input value={movimiento.concepto} onChange={(e) => setMovimiento({ ...movimiento, concepto: e.target.value })} aria-label="Concepto del movimiento" placeholder="Concepto" maxLength={300} className="h-10 w-full rounded-lg border border-slate-200 px-3" required />
                <input value={movimiento.referencia} onChange={(e) => setMovimiento({ ...movimiento, referencia: e.target.value })} aria-label="Referencia del movimiento" placeholder="Referencia opcional" maxLength={120} className="h-10 w-full rounded-lg border border-slate-200 px-3" />
                <select value={movimiento.cuentaContrapartidaId} onChange={(e) => setMovimiento({ ...movimiento, cuentaContrapartidaId: e.target.value })} aria-label="Cuenta de contrapartida" className="h-10 w-full rounded-lg border border-slate-200 px-3" required>
                  <option value="">¿Contra qué cuenta se registra?</option>
                  {cuentasContables.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.numeroCuenta} · {cuenta.nombre}</option>
                  ))}
                </select>
                {(contablesVedadas || cuentasContables.length === 0) && (
                  <p className="text-xs font-medium text-amber-700">
                    {contablesVedadas
                      ? 'El catálogo de cuentas contables no está en tu perfil, así que no hay contra qué registrar el movimiento. Lo lleva Contabilidad.'
                      : 'No hay ninguna cuenta contable que admita movimiento manual. Pídelo a Contabilidad antes de registrar entradas o retiros.'}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Un retiro puede ser un depósito al banco, un gasto o una entrega a dirección, y cada caso afecta una cuenta distinta. El movimiento se refleja en el turno, en Tesorería y en la contabilidad.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={procesando} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"><ArrowDownCircle className="h-4 w-4" /> Entrada</button>
                  <button disabled={procesando} type="button" onClick={() => void registrarManual('retiro')} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white disabled:opacity-50"><ArrowUpCircle className="h-4 w-4" /> Retiro</button>
                </div>
              </form>

              {/*
                ────────────────────────────────────────────────────────────────
                La diferencia se dice ANTES de cerrar, no después
                ----------------------------------------------------------------
                Cerrar un turno no se deshace, y si el conteo no cuadra el
                sistema levanta una póliza con el faltante o el sobrante a
                nombre de quien cerró. Esta pantalla tenía el efectivo esperado
                a dos dedos del campo y no restaba: quien contaba teclaba su
                cifra, pulsaba, y se enteraba del faltante cuando ya estaba
                hecho. Un dedo de más en el teclado era un faltante contabilizado.

                Y la letra pequeña decía «Una diferencia exige observaciones»
                siendo que el campo no era obligatorio: la regla la aplicaba el
                servidor, que contestaba con un rechazo después de pulsar. La
                regla existía; la pantalla no la ayudaba a cumplirse.

                Ahora resta en cuanto hay una cifra, dice qué va a pasar con la
                diferencia, y pide la explicación aquí.
                ────────────────────────────────────────────────────────────────
              */}
              <form onSubmit={cerrar} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-700" /><h2 className="font-semibold text-slate-950">Corte y arqueo</h2></div>
                <p className="text-sm text-slate-500">
                  Cuenta físicamente el efectivo. Cerrar el turno no se deshace.
                </p>
                {montones === null ? (
                  <>
                    <input value={conteo} onChange={(e) => setConteo(e.target.value)} aria-label="Efectivo contado" type="number" min="0" step="0.01" placeholder="Efectivo contado" className="h-10 w-full rounded-lg border border-slate-200 px-3" required />
                    <button
                      type="button"
                      onClick={() => setMontones({})}
                      className="text-[12px] font-medium text-cyan-700 hover:text-cyan-900 hover:underline"
                    >
                      Contar por denominaciones
                    </button>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-semibold text-slate-700">
                        Cuenta los montones; la suma la hace el sistema
                      </p>
                      <button
                        type="button"
                        onClick={() => { setMontones(null); setConteo(''); }}
                        className="shrink-0 text-[11.5px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
                      >
                        Teclear el total
                      </button>
                    </div>

                    {(['billete', 'moneda'] as const).map((clase) => (
                      <div key={clase} className="mt-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {clase === 'billete' ? 'Billetes' : 'Monedas'}
                        </p>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {DENOMINACIONES.filter((d) => d.clase === clase).map((d) => {
                            const llave = llaveDe(d);
                            const piezas = Number(montones[llave] ?? '');
                            const parcial = Number.isFinite(piezas) && piezas > 0 ? piezas * d.valor : 0;
                            return (
                              <label key={llave} className="block">
                                <span className="block text-[11px] font-medium text-slate-600">{d.etiqueta}</span>
                                <input
                                  value={montones[llave] ?? ''}
                                  onChange={(e) =>
                                    setMontones((previo) => ({ ...(previo ?? {}), [llave]: e.target.value }))
                                  }
                                  aria-label={`Piezas de ${d.etiqueta} en ${clase}s`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  className="mt-0.5 h-8 w-full rounded-md border border-slate-200 px-2 text-right text-[12.5px]"
                                />
                                {/* El parcial, al lado. Un montón mal tecleado se ve antes de cerrar. */}
                                <span className="block text-right text-[10.5px] text-slate-400">
                                  {parcial > 0 ? moneda.format(parcial) : '—'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-2">
                      <span className="text-[12px] font-semibold text-slate-700">Total contado</span>
                      <span className="text-[15px] font-bold text-slate-900">
                        {moneda.format(totalMontones ?? 0)}
                      </span>
                    </div>
                    {/*
                      El total, también como campo, para que quien use lector de
                      pantalla lo oiga y para que el valor enviado sea el mismo
                      que se ve. SIN `required`: un campo `readOnly` no lo valida
                      el navegador, así que ponerlo sería un control que se cree
                      puesto. Lo que de verdad impide cerrar sin haber contado
                      está en `cerrar()`, y dice por qué.
                    */}
                    <input
                      value={contadoEfectivo}
                      onChange={() => undefined}
                      aria-label="Efectivo contado"
                      type="number"
                      readOnly
                      tabIndex={-1}
                      className="sr-only"
                    />
                  </div>
                )}
                {arqueo && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      arqueo.cuadra
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <p className="font-semibold">
                      {arqueo.cuadra
                        ? `Cuadra: ${moneda.format(arqueo.contado)} contra ${moneda.format(arqueo.esperado)} esperados.`
                        : arqueo.diferencia < 0
                          ? `FALTAN ${moneda.format(Math.abs(arqueo.diferencia))}: cuentas ${moneda.format(arqueo.contado)} y se esperaban ${moneda.format(arqueo.esperado)}.`
                          : `SOBRAN ${moneda.format(arqueo.diferencia)}: cuentas ${moneda.format(arqueo.contado)} y se esperaban ${moneda.format(arqueo.esperado)}.`}
                    </p>
                    {!arqueo.cuadra && (
                      <p className="mt-1">
                        Al cerrar, esa diferencia se registra en una póliza a tu
                        nombre. Explícala abajo antes de cerrar.
                      </p>
                    )}
                  </div>
                )}
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  aria-label="Observaciones del arqueo"
                  placeholder={arqueo && !arqueo.cuadra ? 'Explica la diferencia (obligatorio)' : 'Observaciones del arqueo'}
                  maxLength={500}
                  required={Boolean(arqueo && !arqueo.cuadra)}
                  className="min-h-24 w-full rounded-lg border border-slate-200 p-3"
                />
                <button disabled={procesando} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"><LockKeyhole className="h-4 w-4" /> Cerrar turno</button>
              </form>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
