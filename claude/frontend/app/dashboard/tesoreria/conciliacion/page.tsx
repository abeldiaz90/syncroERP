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

import { useState } from 'react';
import { CheckCheck, ClipboardPaste, FileSpreadsheet, Lock, Scale } from 'lucide-react';

import { api } from '@/lib/api';
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
  detalle: {
    enTransito: Array<{ folio: string; fecha: string; concepto: string; importe: number; tipo: string }>;
    noRegistrados: Array<{ fecha: string; descripcion: string; cargo: number; abono: number }>;
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
            style={{ borderLeft: `3px solid ${reporte.cuadra ? '#059669' : '#e11d48'}` }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[15px] font-bold text-slate-900">
                  {reporte.cuadra
                    ? 'La conciliación cuadra'
                    : `Hay una diferencia de ${dinero(Math.abs(reporte.diferencia))}`}
                </p>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  {reporte.cuadra
                    ? `Periodo ${reporte.periodo}. El saldo conciliado coincide con tus libros.`
                    : 'Revisa las partidas de abajo: suelen ser movimientos capturados con importe distinto o que faltan por registrar.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Distintivo tono={reporte.cuadra ? 'exito' : 'peligro'}>
                  {reporte.cuadra ? 'Conciliado' : 'Con diferencia'}
                </Distintivo>
                {reporte.cuadra &&
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
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.detalle.noRegistrados.map((l, i) => (
                      <tr key={i}>
                        <td className="cifra text-slate-500">{fecha(l.fecha)}</td>
                        <td className="text-slate-700">{l.descripcion}</td>
                        <td className="text-right cifra text-rose-600">
                          {Number(l.cargo) > 0 ? dinero(l.cargo) : ''}
                        </td>
                        <td className="text-right cifra text-emerald-700">
                          {Number(l.abono) > 0 ? dinero(l.abono) : ''}
                        </td>
                      </tr>
                    ))}
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
