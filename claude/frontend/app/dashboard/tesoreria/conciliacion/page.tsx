"use client";
/**
 * ============================================================================
 * SyncroERP · Tesorería — conciliación bancaria
 * ----------------------------------------------------------------------------
 * El reporte de conciliación es el corazón de la pantalla, no un anexo: lo
 * primero que se ve es si cuadra y, si no, exactamente por qué. Las partidas
 * en tránsito y los cargos no registrados están arriba porque son la
 * explicación de la diferencia, no un detalle secundario.
 *
 * La carga del estado de cuenta acepta pegar directamente desde Excel: nadie
 * va a capturar 200 renglones a mano.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { CheckCheck, ClipboardPaste, FileSpreadsheet, Lock, Scale } from 'lucide-react';

import { api, ApiError } from '@/lib/api';
import { dinero, fecha, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Cuenta { id: string; nombre: string; saldo: number }

interface Reporte {
  periodo: string;
  saldoSegunBanco: number;
  saldoSegunLibros: number;
  depositosEnTransito: number;
  chequesEnTransito: number;
  cargosNoRegistrados: number;
  abonosNoRegistrados: number;
  saldoConciliado: number;
  diferencia: number;
  cuadra: boolean;
  /* Cuadra Y no queda ninguna línea del banco sin explicar. Ver el comentario
     de `reporteConciliacion` en el backend: con cero emparejamientos los dos
     ajustes se cancelan y la diferencia da cero sin haber conciliado nada. */
  listoParaCerrar?: boolean;
  pendientes?: { lineasDelBanco: number; movimientosEnTransito: number };
  detalle: {
    enTransito: Array<{ id: string; folio: string; fecha: string; concepto: string; importe: number; tipo: string }>;
    noRegistrados: Array<{ id: string; fecha: string; descripcion: string; referencia?: string; cargo: number; abono: number }>;
  };
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function ConciliacionPage() {
  const { avisar } = useAvisos();
  const ahora = new Date();
  const anterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

  const [cuentaId, setCuentaId] = useState('');
  const [ejercicio, setEjercicio] = useState(anterior.getFullYear());
  const [mes, setMes] = useState(anterior.getMonth() + 1);
  const [estadoCuentaId, setEstadoCuentaId] = useState('');
  const [modalCarga, setModalCarga] = useState(false);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cerrada, setCerrada] = useState(false);

  const cuentas = useDatos<Cuenta[]>(() => api.get('/tesoreria/saldos'), []);

  /*
   * Al elegir cuenta y periodo se busca la conciliación que ya exista. Antes el
   * id sólo vivía en este estado de React: al recargar la pantalla —o al volver
   * al día siguiente, que es lo normal en una conciliación— el trabajo hecho
   * desaparecía de la vista, el tablero decía «Carga el estado de cuenta para
   * empezar» con las líneas ya en la base, y volver a pulsar «Cargar» sólo
   * podía duplicarlas.
   */
  useEffect(() => {
    let vivo = true;
    setEstadoCuentaId('');
    setReporte(null);
    setCerrada(false);
    if (!cuentaId) return;
    void api
      .get<{ id: string; estado: string } | null>('/tesoreria/conciliacion', {
        query: { cuentaBancariaId: cuentaId, ejercicio, mes },
      })
      .then((e) => {
        if (!vivo || !e?.id) return;
        setEstadoCuentaId(e.id);
        setCerrada(e.estado === 'CERRADA');
        return api
          .get<Reporte>(`/tesoreria/conciliacion/${e.id}/reporte`)
          .then((r) => { if (vivo) setReporte(r); });
      })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [cuentaId, ejercicio, mes]);

  const cargar = useAccion(async (datos: Record<string, unknown>) => {
    const e = await api.post<{ id: string }>('/tesoreria/conciliacion/estados-cuenta', datos);
    setEstadoCuentaId(e.id);
    setCerrada(false);
    setModalCarga(false);
    avisar('Estado de cuenta cargado y cuadrado.', 'exito');
    return e;
  });

  const conciliar = useAccion(async () => {
    const r = await api.post<{ emparejadas: number; lineasSinConciliar: number; ambiguas: unknown[]; mensaje?: string }>(
      `/tesoreria/conciliacion/${estadoCuentaId}/automatica`,
      { ventanaDias: 5 },
    );
    avisar(
      r.mensaje ?? `${r.emparejadas} movimientos conciliados automáticamente.`,
      r.ambiguas.length ? 'alerta' : 'exito',
    );
    await verReporte.ejecutar();
    return r;
  });

  /*
   * Cerrar es lo que el cierre mensual esta esperando: su control de bancos
   * cuenta las conciliaciones CERRADAS del periodo. Hasta hoy no habia forma de
   * cerrar ninguna —el backend nunca escribia ese estado—, asi que el control
   * bloqueaba todos los meses. El boton solo aparece cuando el reporte cuadra,
   * porque el servidor rechaza cerrar con diferencia y ofrecer un boton que
   * siempre falla es peor que no ofrecerlo.
   */
  const cerrarConciliacion = useAccion(async () => {
    const r = await api.patch<{ mensaje: string }>(
      `/tesoreria/conciliacion/${estadoCuentaId}/cerrar`,
      {},
    );
    setCerrada(true);
    avisar(r.mensaje, 'exito');
    return r;
  });

  const verReporte = useAccion(async () => {
    const r = await api.get<Reporte>(`/tesoreria/conciliacion/${estadoCuentaId}/reporte`);
    setReporte(r);
    return r;
  });

  /*
   * Emparejar a mano lo que la conciliación automática no se atreve a decidir.
   * El endpoint existía desde siempre y no lo llamaba ninguna pantalla: con
   * cuatro cobros de $120 el mismo día, la automática los declara ambiguos
   * —y hace bien— y sin esta tabla no había manera de resolverlos. Un
   * emparejador que se rinde y no deja terminar a mano es un emparejador que
   * no sirve.
   */
  const [emparejando, setEmparejando] = useState('');
  const [eleccion, setEleccion] = useState<Record<string, string>>({});

  const emparejar = async (lineaId: string) => {
    const movimientoId = eleccion[lineaId];
    if (!movimientoId) {
      avisar('Elige con cuál de tus movimientos corresponde esta línea.', 'alerta');
      return;
    }
    setEmparejando(lineaId);
    try {
      await api.post('/tesoreria/conciliacion/manual', { lineaId, movimientoId });
      avisar('Línea emparejada.', 'exito');
      await verReporte.ejecutar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo emparejar.', 'error');
    } finally {
      setEmparejando('');
    }
  };

  /** Los movimientos nuestros que podrían ser esa línea: mismo signo e importe. */
  const candidatos = (l: { cargo: number; abono: number }) => {
    const esCargo = Number(l.cargo) > 0;
    const importe = esCargo ? Number(l.cargo) : Number(l.abono);
    return (reporte?.detalle.enTransito ?? []).filter((m) => {
      const salida = m.tipo === 'EGRESO' || m.tipo === 'TRASPASO_SALIDA';
      return salida === esCargo && Math.abs(Number(m.importe) - importe) < 0.01;
    });
  };

  const pendientesBanco =
    reporte?.pendientes?.lineasDelBanco ?? reporte?.detalle.noRegistrados.length ?? 0;
  const listoParaCerrar =
    reporte?.listoParaCerrar ?? (Boolean(reporte?.cuadra) && pendientesBanco === 0);

  const anios = Array.from({ length: 4 }, (_, i) => ahora.getFullYear() - 2 + i);

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Conciliación bancaria"
        descripcion="Compara tus movimientos contra el estado de cuenta del banco"
      />

      {/* Selección de periodo */}
      <Panel titulo="Cuenta y periodo" className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Campo etiqueta="Cuenta bancaria">
              <Seleccion value={cuentaId} onChange={(e) => { setCuentaId(e.target.value); setReporte(null); setEstadoCuentaId(''); }}>
                <option value="">Elige una…</option>
                {(cuentas.datos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} · {dinero(c.saldo)}</option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="w-36">
            <Campo etiqueta="Mes">
              <Seleccion value={mes} onChange={(e) => { setMes(Number(e.target.value)); setReporte(null); }}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Seleccion>
            </Campo>
          </div>

          <div className="w-28">
            <Campo etiqueta="Ejercicio">
              <Seleccion value={ejercicio} onChange={(e) => { setEjercicio(Number(e.target.value)); setReporte(null); }}>
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </Seleccion>
            </Campo>
          </div>

          <Boton
            variante="neutro"
            icono={<FileSpreadsheet className="w-3.5 h-3.5" />}
            onClick={() => setModalCarga(true)}
            disabled={!cuentaId}
          >
            Cargar estado de cuenta
          </Boton>

          {estadoCuentaId && (
            <>
              <Boton
                variante="primario"
                icono={<CheckCheck className="w-3.5 h-3.5" />}
                onClick={() => void conciliar.ejecutar()}
                cargando={conciliar.ejecutando}
              >
                Conciliar automáticamente
              </Boton>
              <Boton
                variante="neutro"
                icono={<Scale className="w-3.5 h-3.5" />}
                onClick={() => void verReporte.ejecutar()}
                cargando={verReporte.ejecutando}
              >
                Ver reporte
              </Boton>
            </>
          )}
        </div>

        {(cargar.error || conciliar.error || verReporte.error || cerrarConciliacion.error) && (
          <p className="text-[12.5px] text-rose-600 mt-3 font-medium">
            {cargar.error || conciliar.error || verReporte.error || cerrarConciliacion.error}
          </p>
        )}
      </Panel>

      {/* Reporte */}
      {!reporte ? (
        <Panel sinRelleno>
          <SinDatos
            titulo="Carga el estado de cuenta para empezar"
            descripcion="Elige la cuenta y el periodo, pega los movimientos del banco desde Excel y deja que el sistema empareje lo que pueda."
            icono={<Scale className="w-5 h-5" />}
          />
        </Panel>
      ) : (
        <>
          {/* Veredicto */}
          <div
            className="panel p-4 mb-4"
            style={{ borderLeft: `3px solid ${listoParaCerrar ? '#059669' : '#e11d48'}` }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[15px] font-bold text-slate-900">
                  {!reporte.cuadra
                    ? `Hay una diferencia de ${dinero(Math.abs(reporte.diferencia))}`
                    : pendientesBanco > 0
                      ? `Quedan ${pendientesBanco} movimiento(s) del banco sin explicar`
                      : 'La conciliación cuadra'}
                </p>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  {!reporte.cuadra
                    ? 'Revisa las partidas de abajo: suelen ser movimientos capturados con importe distinto o que faltan por registrar.'
                    : pendientesBanco > 0
                      ? 'La diferencia da cero porque cada operación está contada en los dos lados a la vez. Empareja abajo cada línea del banco con tu movimiento: mientras queden líneas sin explicar, la conciliación no está hecha.'
                      : `Periodo ${reporte.periodo}. El saldo conciliado coincide con tus libros.`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Distintivo tono={listoParaCerrar ? 'exito' : 'peligro'}>
                  {listoParaCerrar ? 'Conciliado' : reporte.cuadra ? 'Sin emparejar' : 'Con diferencia'}
                </Distintivo>
                {listoParaCerrar &&
                  (cerrada ? (
                    <Distintivo tono="exito">Cerrada</Distintivo>
                  ) : (
                    <Boton
                      variante="primario"
                      icono={<Lock className="w-3.5 h-3.5" />}
                      onClick={() => void cerrarConciliacion.ejecutar()}
                      cargando={cerrarConciliacion.ejecutando}
                    >
                      Cerrar conciliación del periodo
                    </Boton>
                  ))}
              </div>
            </div>
          </div>

          {/* Aritmética de la conciliación */}
          <Panel titulo="Cómo se llega al saldo conciliado" className="mb-4">
            <div className="max-w-lg space-y-1.5">
              <FilaAritmetica etiqueta="Saldo según el banco" valor={reporte.saldoSegunBanco} />
              <FilaAritmetica etiqueta="Más: depósitos en tránsito" valor={reporte.depositosEnTransito} signo="+" />
              <FilaAritmetica etiqueta="Menos: cheques en tránsito" valor={reporte.chequesEnTransito} signo="−" />
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-[13px] font-bold text-slate-900">Saldo conciliado</span>
                <span className="text-[15px] font-bold text-slate-900 cifra">
                  {dinero(reporte.saldoConciliado)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2.5">
                <span className="text-[12.5px] text-slate-500">Saldo según tus libros</span>
                <span className="text-[12.5px] text-slate-700 cifra">{dinero(reporte.saldoSegunLibros)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-slate-700">Diferencia</span>
                <span
                  className="text-[13px] font-bold cifra"
                  style={{ color: reporte.cuadra ? '#059669' : '#e11d48' }}
                >
                  {dinero(reporte.diferencia)}
                </span>
              </div>
            </div>
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* En tránsito */}
            <Panel
              sinRelleno
              titulo="Registrado por ti, aún no en el banco"
              accion={
                <span className="text-[11.5px] text-slate-400 cifra">
                  {reporte.detalle.enTransito.length}
                </span>
              }
            >
              {reporte.detalle.enTransito.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
                  Nada pendiente. Todos tus movimientos aparecen en el estado de cuenta.
                </p>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th className="text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.detalle.enTransito.map((m) => (
                      <tr key={m.folio}>
                        <td className="cifra font-semibold text-slate-900">{m.folio}</td>
                        <td className="cifra text-slate-500">{fecha(m.fecha)}</td>
                        <td className="text-slate-700">{m.concepto}</td>
                        <td className="text-right cifra">{dinero(m.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            {/* No registrados */}
            <Panel
              sinRelleno
              titulo="En el banco, sin registrar por ti"
              accion={
                <span className="text-[11.5px] text-slate-400 cifra">
                  {reporte.detalle.noRegistrados.length}
                </span>
              }
            >
              {reporte.detalle.noRegistrados.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
                  Nada pendiente. Tienes registrado todo lo que reporta el banco.
                </p>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Descripción</th>
                      <th className="text-right">Cargo</th>
                      <th className="text-right">Abono</th>
                      <th>Emparejar con</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.detalle.noRegistrados.map((l, i) => {
                      const opciones = candidatos(l);
                      return (
                      <tr key={l.id ?? i}>
                        <td className="cifra text-slate-500">{fecha(l.fecha)}</td>
                        <td className="text-slate-700">{l.descripcion}</td>
                        <td className="text-right cifra text-rose-600">
                          {Number(l.cargo) > 0 ? dinero(l.cargo) : ''}
                        </td>
                        <td className="text-right cifra text-emerald-700">
                          {Number(l.abono) > 0 ? dinero(l.abono) : ''}
                        </td>
                        <td>
                          {opciones.length === 0 ? (
                            <span className="text-[11.5px] text-slate-400">
                              Ninguno de tus movimientos coincide: regístralo en Movimientos bancarios.
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                className="text-[12px] border border-slate-200 rounded-lg px-2 py-1"
                                value={eleccion[l.id] ?? ''}
                                onChange={(e) => setEleccion((p) => ({ ...p, [l.id]: e.target.value }))}
                              >
                                <option value="">Elige…</option>
                                {opciones.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {fecha(m.fecha)} · {m.concepto}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={emparejando === l.id}
                                onClick={() => void emparejar(l.id)}
                                className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {emparejando === l.id ? '…' : 'Emparejar'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}

      <ModalCargaEstado
        abierto={modalCarga}
        cuentaId={cuentaId}
        ejercicio={ejercicio}
        mes={mes}
        guardando={cargar.ejecutando}
        onCerrar={() => setModalCarga(false)}
        onGuardar={(d) => void cargar.ejecutar(d)}
      />
    </div>
  );
}

function FilaAritmetica({
  etiqueta, valor, signo,
}: { etiqueta: string; valor: number; signo?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-slate-600">{etiqueta}</span>
      <span className="text-[12.5px] text-slate-800 cifra">
        {signo && <span className="text-slate-400 mr-1">{signo}</span>}
        {dinero(valor)}
      </span>
    </div>
  );
}

/* ── Carga del estado de cuenta ───────────────────────────────────────────── */

interface LineaCapturada {
  fecha: string; descripcion: string; referencia?: string; cargo: number; abono: number;
}

/**
 * Convierte lo pegado desde Excel en líneas.
 * Formato esperado, separado por tabulaciones:
 *   fecha · descripción · referencia · cargo · abono
 */
function interpretarPegado(texto: string): { lineas: LineaCapturada[]; ignoradas: number } {
  const lineas: LineaCapturada[] = [];
  let ignoradas = 0;

  for (const cruda of texto.split(/\r?\n/)) {
    if (!cruda.trim()) continue;

    const cols = cruda.split('\t').map((c) => c.trim());
    if (cols.length < 3) { ignoradas++; continue; }

    const [f, desc, ref, cargo, abono] = cols;

    // Acepta dd/mm/aaaa y aaaa-mm-dd
    let iso = f;
    const conBarras = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (conBarras) {
      iso = `${conBarras[3]}-${conBarras[2].padStart(2, '0')}-${conBarras[1].padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { ignoradas++; continue; }

    const aNum = (v?: string) => {
      const n = parseFloat((v ?? '').replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? Math.abs(n) : 0;
    };

    lineas.push({
      fecha: iso,
      descripcion: desc || 'Sin descripción',
      referencia: ref || undefined,
      cargo: aNum(cargo),
      abono: aNum(abono),
    });
  }

  return { lineas, ignoradas };
}

function ModalCargaEstado({
  abierto, cuentaId, ejercicio, mes, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  cuentaId: string;
  ejercicio: number;
  mes: number;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [saldoInicial, setSaldoInicial] = useState('');
  const [saldoFinal, setSaldoFinal] = useState('');
  const [pegado, setPegado] = useState('');
  const [error, setError] = useState('');

  const { lineas, ignoradas } = interpretarPegado(pegado);

  const sumaCargos = lineas.reduce((s, l) => s + l.cargo, 0);
  const sumaAbonos = lineas.reduce((s, l) => s + l.abono, 0);
  const calculado = parseFloat(saldoInicial || '0') + sumaAbonos - sumaCargos;
  const declarado = parseFloat(saldoFinal || '0');
  const cuadra = Math.abs(calculado - declarado) < 0.01;

  /*
   * Un mes sin movimientos en el banco es normal —una cuenta dormida, un mes
   * anterior al arranque— y hasta hoy no se podia cargar: el boton exigia al
   * menos una linea. Como el cierre mensual pide conciliacion cerrada de cada
   * cuenta activa, esa cuenta bloqueaba el mes para siempre.
   *
   * Se permite, pero se dice: solo cuando el saldo no se movio, y el boton
   * cambia de texto para que nadie lo haga creyendo que pego algo.
   */
  const mesSinMovimientos =
    lineas.length === 0 && !!saldoFinal && !pegado.trim() && cuadra;

  const enviar = () => {
    if (!lineas.length && !mesSinMovimientos) {
      setError(
        pegado.trim()
          ? 'No se entendió ningún movimiento de lo que pegaste.'
          : 'Pega los movimientos del banco, o captura el mismo saldo inicial y final si el mes no tuvo movimientos.',
      );
      return;
    }
    if (!saldoFinal) { setError('Captura el saldo final que reporta el banco.'); return; }
    if (!cuadra) {
      setError(
        `Los movimientos no llegan al saldo final. Con lo pegado da ${dinero(calculado)} ` +
        `y declaraste ${dinero(declarado)}.`,
      );
      return;
    }

    setError('');
    onGuardar({
      cuentaBancariaId: cuentaId,
      ejercicio, mes,
      saldoInicialBanco: parseFloat(saldoInicial || '0'),
      saldoFinalBanco: declarado,
      lineas,
    });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cargar estado de cuenta"
      descripcion={`${MESES[mes - 1]} de ${ejercicio}`}
      ancho={720}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton
            variante="primario"
            onClick={enviar}
            cargando={guardando}
            disabled={(!lineas.length && !mesSinMovimientos) || !cuadra}
          >
            {lineas.length > 0
              ? `Cargar ${lineas.length} movimientos`
              : mesSinMovimientos
                ? 'Cargar mes sin movimientos'
                : 'Cargar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta="Saldo inicial del banco" ayuda="El del cierre del mes anterior">
            <Entrada
              type="number" step="0.01"
              value={saldoInicial}
              onChange={(e) => { setSaldoInicial(e.target.value); setError(''); }}
              placeholder="0.00"
            />
          </Campo>
          <Campo etiqueta="Saldo final del banco" requerido>
            <Entrada
              type="number" step="0.01"
              value={saldoFinal}
              onChange={(e) => { setSaldoFinal(e.target.value); setError(''); }}
              placeholder="0.00"
            />
          </Campo>
        </div>

        <div>
          <label className="etiqueta-campo flex items-center gap-1.5">
            <ClipboardPaste className="w-3 h-3" />
            Movimientos del banco
          </label>
          <textarea
            className="campo font-mono text-[11.5px]"
            style={{ minHeight: 160 }}
            value={pegado}
            onChange={(e) => { setPegado(e.target.value); setError(''); }}
            placeholder={
              'Pega directamente desde Excel. Una línea por movimiento:\n' +
              'fecha ⇥ descripción ⇥ referencia ⇥ cargo ⇥ abono\n\n' +
              '01/03/2026\tPago proveedor ACME\t4471\t12500.00\t\n' +
              '03/03/2026\tDepósito cliente\t\t\t8900.00'
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Acepta fechas dd/mm/aaaa o aaaa-mm-dd. Los símbolos de moneda y las comas se ignoran.
          </p>
        </div>

        {/* Cuadre en vivo */}
        {lineas.length > 0 && (
          <div
            className="rounded-lg px-3.5 py-3 text-[12.5px]"
            style={{
              background: cuadra ? '#ecfdf5' : '#fffbeb',
              border: `1px solid ${cuadra ? '#a7f3d0' : '#fde68a'}`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-700">
                {lineas.length} movimientos interpretados
                {ignoradas > 0 && (
                  <span className="text-amber-700"> · {ignoradas} líneas ignoradas</span>
                )}
              </span>
              <span className="cifra font-semibold" style={{ color: cuadra ? '#047857' : '#b45309' }}>
                {cuadra ? 'Cuadra' : `Difiere ${dinero(calculado - declarado)}`}
              </span>
            </div>
            <div className="flex gap-4 mt-1.5 text-[11.5px] text-slate-500 cifra">
              <span>Cargos {dinero(sumaCargos)}</span>
              <span>Abonos {dinero(sumaAbonos)}</span>
              <span>Resultado {dinero(calculado)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-[12.5px] text-rose-600 font-medium">{error}</p>
        )}
      </div>
    </Modal>
  );
}
