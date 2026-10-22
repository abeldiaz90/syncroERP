"use client";
/**
 * ============================================================================
 * SyncroERP · Tesorería — movimientos bancarios
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, Plus, Search, Wallet } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Confirmacion, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Cuenta {
  id: string; nombre: string; tipo: string; numeroCuenta?: string;
  saldo: number; pendientesConciliar: number;
}

interface Movimiento {
  id: string; folio: string; fecha: string; tipo: string; origen: string;
  importe: number; saldoPosterior: number; concepto: string;
  referencia?: string; nombreTercero?: string;
  estadoConciliacion: string; cancelado: boolean;
  /**
   * El documento que lo genero, si lo genero alguno. Un movimiento con esto
   * puesto NO se cancela desde aqui: se deshace donde nacio.
   */
  tipoDocumento?: string;
  cuentaBancaria?: { nombre: string };
}

const ES_ENTRADA = (t: string) => t === 'INGRESO' || t === 'TRASPASO_ENTRADA';

const ETIQUETA_TIPO: Record<string, string> = {
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  TRASPASO_ENTRADA: 'Traspaso recibido',
  TRASPASO_SALIDA: 'Traspaso enviado',
};

export default function MovimientosTesoreriaPage() {
  const { avisar } = useAvisos();
  const hoy = isoCorto();
  const haceUnMes = isoCorto(new Date(Date.now() - 30 * 86_400_000));

  const [cuentaId, setCuentaId] = useState('');
  const [desde, setDesde] = useState(haceUnMes);
  const [hasta, setHasta] = useState(hoy);
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [traspasoAbierto, setTraspasoAbierto] = useState(false);
  const [aCancelar, setACancelar] = useState<Movimiento | null>(null);
  const [motivo, setMotivo] = useState('');

  const cuentas = useDatos<Cuenta[]>(() => api.get('/tesoreria/saldos'), []);
  const movimientos = useDatos<Movimiento[]>(
    () => api.get('/tesoreria/movimientos', {
      query: { cuentaBancariaId: cuentaId, desde, hasta, busqueda },
    }),
    [cuentaId, desde, hasta, busqueda],
  );

  const registrar = useAccion(async (datos: Record<string, unknown>) => {
    const m = await api.post<Movimiento>('/tesoreria/movimientos', datos);
    avisar(`Movimiento ${m.folio} registrado.`, 'exito');
    setModalAbierto(false);
    void movimientos.recargar();
    void cuentas.recargar();
    return m;
  });

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * EL TRASPASO QUE ESTA PANTALLA SABÍA LEER Y NO SABÍA HACER
   * --------------------------------------------------------------------------
   * `ETIQUETA_TIPO`, aquí arriba, lleva desde el principio «Traspaso recibido»
   * y «Traspaso enviado»: la pantalla sabe pintarlos. Lo que no había era cómo
   * crear uno, así que mover dinero entre dos cuentas propias se hacía con dos
   * movimientos sueltos capturados a mano.
   *
   * Y eso no es lo mismo. `POST /tesoreria/traspasos` escribe los dos
   * movimientos en UNA transacción, bloqueando las dos cuentas en orden
   * estable para que dos traspasos cruzados no se interbloqueen, y los deja
   * emparejados. Ese vínculo es lo que cuida
   * `medio-traspaso-cancelado.spec.ts`: cancelar una mitad sin la otra deja
   * dinero inventado en los libros.
   *
   * MEDIDO el 22-oct-2026 cruzando las 604 rutas del servidor contra lo que
   * piden las pantallas: era una de las setenta y seis que nadie llamaba, y de
   * las pocas que mueven dinero.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const traspasar = useAccion(async (datos: Record<string, unknown>) => {
    await api.post('/tesoreria/traspasos', datos);
    avisar('Traspaso registrado: salida y entrada quedaron emparejadas.', 'exito');
    setTraspasoAbierto(false);
    void movimientos.recargar();
    void cuentas.recargar();
  });

  const cancelar = useAccion(async (id: string, razon: string) => {
    await api.patch(`/tesoreria/movimientos/${id}/cancelar`, { motivo: razon });
    avisar('Movimiento cancelado con contrapartida.', 'exito');
    setACancelar(null);
    setMotivo('');
    void movimientos.recargar();
    void cuentas.recargar();
  });

  const saldoTotal = (cuentas.datos ?? []).reduce((s, c) => s + Number(c.saldo), 0);

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <EncabezadoPantalla
        titulo="Movimientos bancarios"
        descripcion="Entradas y salidas de efectivo por cuenta"
        acciones={
          <>
            {/*
              * Se apaga con MENOS DE DOS cuentas, no con ninguna: un traspaso
              * necesita dos lados. Con una sola, el botón sólo podía llevar a
              * «la cuenta de origen y la de destino deben ser distintas».
              */}
            <Boton
              variante="neutro"
              icono={<ArrowLeftRight className="w-3.5 h-3.5" />}
              onClick={() => setTraspasoAbierto(true)}
              disabled={(cuentas.datos?.length ?? 0) < 2}
            >
              Traspasar entre cuentas
            </Boton>
            <Boton
              variante="primario"
              icono={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setModalAbierto(true)}
              disabled={(cuentas.datos?.length ?? 0) === 0}
            >
              Registrar movimiento
            </Boton>
          </>
        }
      />

      {/* Saldos por cuenta */}
      {cuentas.cargando ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="esqueleto h-[86px] rounded-xl" />)}
        </div>
      ) : (cuentas.datos?.length ?? 0) === 0 ? (
        <Panel className="mb-5">
          <p className="text-[13px] text-slate-600">
            No hay cuentas bancarias activas. Créalas en{' '}
            <span className="font-semibold">Crédito y cobranza → Cuentas bancarias</span> antes
            de registrar movimientos.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {cuentas.datos!.map((c) => (
            <button
              key={c.id}
              onClick={() => setCuentaId(cuentaId === c.id ? '' : c.id)}
              className={`panel px-4 py-3 text-left transition-colors ${
                cuentaId === c.id ? 'ring-2 ring-cyan-400' : 'hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-cyan-600" />
                <p className="eyebrow truncate">{c.nombre}</p>
              </div>
              <p className="text-[19px] font-bold mt-1.5 cifra text-slate-900">{dinero(c.saldo)}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {c.pendientesConciliar > 0
                  ? `${c.pendientesConciliar} por conciliar`
                  : 'Todo conciliado'}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Filtros y tabla */}
      <Panel sinRelleno>
        <div className="panel-cabecera flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Entrada
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Concepto, folio o referencia"
                className="pl-8"
              />
            </div>
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" />
            <span className="text-slate-300 text-[12px]">a</span>
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" />
            {cuentaId && (
              <Boton variante="fantasma" className="btn-sm" onClick={() => setCuentaId('')}>
                Ver todas las cuentas
              </Boton>
            )}
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            Saldo total: <span className="font-semibold text-slate-900">{dinero(saldoTotal)}</span>
          </p>
        </div>

        {movimientos.cargando ? (
          <Cargando />
        ) : movimientos.error ? (
          <ErrorPantalla mensaje={movimientos.error} onReintentar={movimientos.recargar} />
        ) : (movimientos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Sin movimientos en este periodo"
            descripcion="Amplía el rango de fechas o registra el primer movimiento de la cuenta."
            icono={<Wallet className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Cuenta</th>
                  <th className="text-right">Entrada</th>
                  <th className="text-right">Salida</th>
                  <th className="text-right">Saldo</th>
                  <th>Conciliación</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {movimientos.datos!.map((m) => {
                  const entrada = ES_ENTRADA(m.tipo);
                  return (
                    <tr key={m.id} className={m.cancelado ? 'opacity-50' : ''}>
                      <td className="cifra font-semibold text-slate-900">{m.folio}</td>
                      <td className="cifra text-slate-500">{fecha(m.fecha)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {entrada
                            ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            : <ArrowUpRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                          <span className="text-slate-800">{m.concepto}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 ml-5">
                          {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                          {m.referencia ? ` · ${m.referencia}` : ''}
                          {m.cancelado ? ' · cancelado' : ''}
                        </p>
                      </td>
                      <td className="text-slate-500">{m.cuentaBancaria?.nombre ?? '—'}</td>
                      <td className="text-right cifra text-emerald-700">
                        {entrada ? dinero(m.importe) : ''}
                      </td>
                      <td className="text-right cifra text-rose-600">
                        {!entrada ? dinero(m.importe) : ''}
                      </td>
                      <td className="text-right cifra font-semibold text-slate-900">
                        {dinero(m.saldoPosterior)}
                      </td>
                      <td>
                        <Distintivo tono={m.estadoConciliacion === 'CONCILIADO' ? 'exito' : 'neutro'}>
                          {m.estadoConciliacion === 'CONCILIADO' ? 'Conciliado' : 'Pendiente'}
                        </Distintivo>
                      </td>
                      <td>
                        {/*
                          * El boton solo para los movimientos REGISTRADOS A
                          * MANO. Cancelar escribe una contrapartida en
                          * tesoreria y no toca el documento que origino el
                          * movimiento: cancelar aqui el de un pago a proveedor
                          * devolvia el saldo al banco y dejaba la orden de
                          * compra diciendo que esta pagada, sin ninguna
                          * pantalla donde se vea la diferencia. El servidor ya
                          * lo niega; ofrecer el boton igual seria mandar a
                          * alguien a un no.
                          */}
                        {!m.cancelado && m.estadoConciliacion !== 'CONCILIADO' && (
                          m.tipoDocumento ? (
                            <span
                              className="text-xs text-slate-400"
                              title={`Lo genero un documento (${m.tipoDocumento}). Se deshace donde se creo: cancelarlo aqui dejaria ese documento diciendo que el dinero si se movio.`}
                            >
                              del documento
                            </span>
                          ) : (
                            <button
                              onClick={() => setACancelar(m)}
                              className="btn btn-fantasma btn-sm btn-icono"
                              title="Cancelar movimiento"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalTraspaso
        abierto={traspasoAbierto}
        cuentas={cuentas.datos ?? []}
        guardando={traspasar.ejecutando}
        onCerrar={() => setTraspasoAbierto(false)}
        onGuardar={(d) => void traspasar.ejecutar(d)}
      />

      <ModalNuevoMovimiento
        abierto={modalAbierto}
        cuentas={cuentas.datos ?? []}
        guardando={registrar.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void registrar.ejecutar(d)}
      />

      <Modal
        abierto={!!aCancelar}
        onCerrar={() => { setACancelar(null); setMotivo(''); }}
        titulo="Cancelar movimiento"
        descripcion={`${aCancelar?.folio} · ${dinero(aCancelar?.importe)}`}
        ancho={440}
        pie={
          <>
            <Boton variante="neutro" onClick={() => { setACancelar(null); setMotivo(''); }}>
              Volver
            </Boton>
            <Boton
              variante="peligro"
              disabled={!motivo.trim()}
              cargando={cancelar.ejecutando}
              onClick={() => void cancelar.ejecutar(aCancelar!.id, motivo)}
            >
              Cancelar movimiento
            </Boton>
          </>
        }
      >
        <p className="text-[13px] text-slate-600 mb-3.5 leading-relaxed">
          El movimiento no se borra: se genera una contrapartida por el mismo importe,
          de modo que el saldo se corrige y la operación original queda en la bitácora.
        </p>
        <Campo etiqueta="Motivo de la cancelación" requerido>
          <Entrada
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Capturado en la cuenta equivocada"
            autoFocus
          />
        </Campo>
      </Modal>
    </div>
  );
}

type CuentaContableSimple = {
  id: string;
  numeroCuenta: string;
  nombre: string;
  permiteMovimientoManual?: boolean;
};

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevoMovimiento({
  abierto, cuentas, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  cuentas: Cuenta[];
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    cuentaBancariaId: '', fecha: isoCorto(), tipo: 'INGRESO',
    importe: '', concepto: '', referencia: '', origen: 'MANUAL', nombreTercero: '',
    cuentaContrapartidaId: '',
  });
  /*
   * Un alta manual de tesorería ahora genera póliza. La contrapartida no se
   * puede inferir —un ingreso puede ser una aportación, un préstamo o un cobro
   * extraordinario— así que la elige quien captura.
   */
  const [cuentasContables, setCuentasContables] = useState<CuentaContableSimple[]>([]);
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
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
    api.get<CuentaContableSimple[]>('/finanzas/cuentas-contables', {
      query: { soloAfectables: true },
    })
      .then((datos) => { if (vivo) setCuentasContables(Array.isArray(datos) ? datos : []); })
      .catch(() => { if (vivo) setCuentasContables([]); });
    return () => { vivo = false; };
  }, [abierto]);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.cuentaBancariaId) e.cuentaBancariaId = 'Elige la cuenta afectada.';
    if (!form.concepto.trim()) e.concepto = 'Describe el movimiento.';
    if (!form.cuentaContrapartidaId) {
      e.cuentaContrapartidaId = 'Indica contra qué cuenta contable se registra.';
    }
    const imp = parseFloat(form.importe);
    if (!imp || imp <= 0) e.importe = 'El importe debe ser mayor que cero.';

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({ ...form, importe: imp });
  };

  const cuenta = cuentas.find((c) => c.id === form.cuentaBancariaId);
  const importe = parseFloat(form.importe || '0');
  const esSalida = form.tipo === 'EGRESO';
  const dejaEnRojo = cuenta && esSalida && importe > cuenta.saldo;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar movimiento"
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Registrar</Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <Campo
            etiqueta="Cuenta" requerido error={errores.cuentaBancariaId}
            ayuda={cuenta ? `Saldo actual: ${dinero(cuenta.saldo)}` : undefined}
          >
            <Seleccion
              value={form.cuentaBancariaId}
              onChange={(e) => cambiar('cuentaBancariaId', e.target.value)}
              error={!!errores.cuentaBancariaId}
            >
              <option value="">Elige una…</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} · {dinero(c.saldo)}</option>
              ))}
            </Seleccion>
          </Campo>
        </div>

        <Campo
          etiqueta="Contrapartida contable"
          requerido
          error={errores.cuentaContrapartidaId}
          ayuda="El movimiento genera póliza: indica contra qué cuenta se registra en el mayor."
        >
          <Seleccion
            value={form.cuentaContrapartidaId}
            onChange={(e) => cambiar('cuentaContrapartidaId', e.target.value)}
            error={!!errores.cuentaContrapartidaId}
          >
            <option value="">Elige una…</option>
            {cuentasContables
              .filter((c) => c.permiteMovimientoManual !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.numeroCuenta} · {c.nombre}</option>
              ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Tipo" requerido>
          <Seleccion value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </Seleccion>
        </Campo>

        <Campo etiqueta="Fecha" requerido>
          <Entrada type="date" value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
        </Campo>

        <Campo etiqueta="Importe" requerido error={errores.importe}>
          <Entrada
            type="number" step="0.01" min="0"
            value={form.importe}
            onChange={(e) => cambiar('importe', e.target.value)}
            error={!!errores.importe}
            placeholder="0.00"
          />
        </Campo>

        <Campo etiqueta="Origen">
          <Seleccion value={form.origen} onChange={(e) => cambiar('origen', e.target.value)}>
            <option value="MANUAL">Captura manual</option>
            <option value="VENTA">Venta</option>
            <option value="COBRANZA">Cobranza</option>
            <option value="PAGO_PROVEEDOR">Pago a proveedor</option>
            <option value="NOMINA">Nómina</option>
            <option value="COMISION_BANCARIA">Comisión bancaria</option>
            <option value="IMPUESTO">Impuesto</option>
          </Seleccion>
        </Campo>

        <div className="col-span-2">
          <Campo etiqueta="Concepto" requerido error={errores.concepto}>
            <Entrada
              value={form.concepto}
              onChange={(e) => cambiar('concepto', e.target.value)}
              error={!!errores.concepto}
              placeholder="Pago de factura A-1042"
            />
          </Campo>
        </div>

        <Campo etiqueta="Referencia" ayuda="Folio del banco, cheque o transferencia">
          <Entrada value={form.referencia} onChange={(e) => cambiar('referencia', e.target.value)} />
        </Campo>

        <Campo etiqueta="Tercero">
          <Entrada
            value={form.nombreTercero}
            onChange={(e) => cambiar('nombreTercero', e.target.value)}
            placeholder="Quién paga o cobra"
          />
        </Campo>

        {dejaEnRojo && (
          <div className="col-span-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Este egreso deja la cuenta en {dinero(cuenta!.saldo - importe)}. Puedes continuar,
            pero revisa que sea correcto.
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * ============================================================================
 * Traspasar entre cuentas propias
 * ----------------------------------------------------------------------------
 * Sin contrapartida contable, a diferencia de un movimiento suelto: el dinero
 * no sale de la empresa, cambia de cuenta. Las dos partidas las arma el
 * servidor y se emparejan entre sí.
 *
 * LO QUE SE DICE ANTES DE PULSAR. El servidor comprueba que las cuentas sean
 * distintas, que estén activas y que haya saldo; las tres respuestas son
 * negativas correctas y ninguna debería llegar a darse desde aquí. Una
 * pantalla que deja pulsar para que el servidor diga que no es un botón que
 * lleva a un no, que es lo que este proyecto lleva meses quitando.
 * ============================================================================
 */
function ModalTraspaso({
  abierto, cuentas, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  cuentas: Cuenta[];
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    origenId: '', destinoId: '', importe: '', fecha: isoCorto(), concepto: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  /* Al abrirlo otra vez no se arrastra lo de la vez anterior. */
  useEffect(() => {
    if (abierto) {
      setForm({ origenId: '', destinoId: '', importe: '', fecha: isoCorto(), concepto: '' });
      setErrores({});
    }
  }, [abierto]);

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const origen = cuentas.find((c) => c.id === form.origenId);
  const destino = cuentas.find((c) => c.id === form.destinoId);
  const importe = parseFloat(form.importe || '0');
  const sinSaldo = !!origen && importe > 0 && importe > Number(origen.saldo);

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.origenId) e.origenId = 'Elige de qué cuenta sale.';
    if (!form.destinoId) e.destinoId = 'Elige a qué cuenta entra.';
    if (form.origenId && form.origenId === form.destinoId) {
      e.destinoId = 'Tiene que ser una cuenta distinta de la de origen.';
    }
    if (!importe || importe <= 0) e.importe = 'El importe debe ser mayor que cero.';
    /*
     * El saldo se comprueba aquí y también en el servidor, que es quien manda:
     * entre que esta pantalla leyó los saldos y alguien pulsa, otro pudo haber
     * sacado dinero de esa cuenta. Aquí se evita el viaje; allá se evita el
     * descubierto.
     */
    if (sinSaldo) e.importe = `La cuenta de origen tiene ${dinero(origen!.saldo)}.`;
    if (form.concepto.trim().length < 3) e.concepto = 'Describe el traspaso.';

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({ ...form, concepto: form.concepto.trim(), importe });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Traspasar entre cuentas"
      descripcion="El dinero no sale de la empresa: cambia de cuenta. Se registran las dos partidas, emparejadas."
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Traspasar</Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Campo
          etiqueta="Sale de" requerido error={errores.origenId}
          ayuda={origen ? `Saldo actual: ${dinero(origen.saldo)}` : undefined}
        >
          <Seleccion
            value={form.origenId}
            onChange={(e) => cambiar('origenId', e.target.value)}
            error={!!errores.origenId}
          >
            <option value="">Elige una…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} · {dinero(c.saldo)}</option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Entra en" requerido error={errores.destinoId}
          ayuda={destino ? `Saldo actual: ${dinero(destino.saldo)}` : undefined}
        >
          {/*
            * La cuenta de origen NO se ofrece como destino. El servidor lo
            * rechaza —y hace bien—, pero ofrecerla sería enseñar una opción
            * cuyo único final es una negativa.
            */}
          <Seleccion
            value={form.destinoId}
            onChange={(e) => cambiar('destinoId', e.target.value)}
            error={!!errores.destinoId}
          >
            <option value="">Elige una…</option>
            {cuentas
              .filter((c) => c.id !== form.origenId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} · {dinero(c.saldo)}</option>
              ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Importe" requerido error={errores.importe}>
          <Entrada
            type="number" step="0.01" min="0"
            value={form.importe}
            onChange={(e) => cambiar('importe', e.target.value)}
            error={!!errores.importe}
            placeholder="0.00"
          />
        </Campo>

        <Campo etiqueta="Fecha" requerido>
          <Entrada type="date" value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
        </Campo>

        <div className="col-span-2">
          <Campo etiqueta="Concepto" requerido error={errores.concepto}>
            <Entrada
              value={form.concepto}
              onChange={(e) => cambiar('concepto', e.target.value)}
              error={!!errores.concepto}
              placeholder="Fondeo de la caja chica"
            />
          </Campo>
        </div>

        {origen && destino && importe > 0 && !sinSaldo && (
          <div className="col-span-2 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
            {origen.nombre} quedará en <strong>{dinero(Number(origen.saldo) - importe)}</strong> y{' '}
            {destino.nombre} en <strong>{dinero(Number(destino.saldo) + importe)}</strong>.
          </div>
        )}
      </div>
    </Modal>
  );
}
