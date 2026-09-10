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
import { api, ApiError } from '@/lib/api';

type CuentaCaja = {
  id: string;
  nombre: string;
  tipo: 'CAJA' | 'BANCO' | 'TPV';
  activo: boolean;
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

export default function CajaPage() {
  const [cuentas, setCuentas] = useState<CuentaCaja[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>('');
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
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
  const [observaciones, setObservaciones] = useState('');

  const turno = useMemo(
    () => turnos.find((item) => item.id === seleccionado) ?? turnos[0] ?? null,
    [seleccionado, turnos],
  );

  const nombreCaja = useCallback(
    (cuentaId: string) => cuentas.find((cuenta) => cuenta.id === cuentaId)?.nombre ?? 'Caja',
    [cuentas],
  );

  const cargarDetalle = useCallback(async (turnoId: string) => {
    const [resumenTurno, lista] = await Promise.all([
      api.get<ResumenTurno>(`/caja/turnos/${turnoId}/resumen`),
      api.get<Movimiento[]>(`/caja/turnos/${turnoId}/movimientos`),
    ]);
    setResumen(resumenTurno);
    setMovimientos(lista);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setAviso(null);
    try {
      const [listaCuentas, abiertos, contables] = await Promise.all([
        api.get<CuentaCaja[]>('/credito/cuentas-bancarias'),
        api.get<Turno[]>('/caja/turnos/abiertos'),
        api.get<CuentaContable[]>('/finanzas/cuentas-contables').catch(() => []),
      ]);
      setCuentasContables(
        (Array.isArray(contables) ? contables : []).filter(
          (cuenta) => cuenta.permiteMovimientoManual !== false,
        ),
      );
      const cajas = listaCuentas.filter((cuenta) => cuenta.activo && cuenta.tipo === 'CAJA');
      setCuentas(cajas);
      setTurnos(abiertos);
      setCuentaNueva((actual) =>
        cajas.some((cuenta) => cuenta.id === actual) ? actual : cajas[0]?.id || '',
      );
      setSeleccionado((actual) =>
        abiertos.some((item) => item.id === actual) ? actual : abiertos[0]?.id || '',
      );
      if (!abiertos.length) {
        setResumen(null);
        setMovimientos([]);
      }
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
  }, [turno?.id, cargarDetalle]);

  async function ejecutar(accion: () => Promise<unknown>, texto: string) {
    setProcesando(true);
    setAviso(null);
    try {
      await accion();
      setAviso({ texto, ok: true });
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
    const ok = await ejecutar(
      () => api.post(`/caja/turnos/${turno.id}/cerrar`, {
        efectivoContado: Number(conteo),
        observaciones: observaciones.trim() || undefined,
      }),
      'El corte y arqueo quedaron cerrados.',
    );
    if (ok) {
      setConteo('');
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

      {!cuentas.length ? (
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
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Abrir caja
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="flex gap-2 overflow-x-auto pb-1">
            {turnos.map((item) => (
              <button key={item.id} type="button" onClick={() => setSeleccionado(item.id)} className={`min-w-56 rounded-xl border p-3 text-left transition ${turno?.id === item.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <p className="text-sm font-semibold text-slate-900">{nombreCaja(item.cuentaCajaId)}</p>
                <p className="mt-1 text-xs text-slate-500">Abierta {new Date(item.fechaApertura).toLocaleString('es-MX')}</p>
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
                    {movimientos.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(item.fechaCreacion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${item.naturaleza === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{item.tipo.replaceAll('_', ' ')}</span></td>
                        <td className="px-4 py-3 text-slate-700">{item.concepto}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${item.naturaleza === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.naturaleza === 'ENTRADA' ? '+' : '−'}{moneda.format(Number(item.importe))}</td>
                      </tr>
                    ))}
                    {!movimientos.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">El turno todavía no tiene movimientos.</td></tr>}
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
                <p className="text-xs text-slate-500">
                  Un retiro puede ser un depósito al banco, un gasto o una entrega a dirección, y cada caso afecta una cuenta distinta. El movimiento se refleja en el turno, en Tesorería y en la contabilidad.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={procesando} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"><ArrowDownCircle className="h-4 w-4" /> Entrada</button>
                  <button disabled={procesando} type="button" onClick={() => void registrarManual('retiro')} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white disabled:opacity-50"><ArrowUpCircle className="h-4 w-4" /> Retiro</button>
                </div>
              </form>

              <form onSubmit={cerrar} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-700" /><h2 className="font-semibold text-slate-950">Corte y arqueo</h2></div>
                <p className="text-sm text-slate-500">Cuenta físicamente el efectivo. Una diferencia exige observaciones.</p>
                <input value={conteo} onChange={(e) => setConteo(e.target.value)} aria-label="Efectivo contado" type="number" min="0" step="0.01" placeholder="Efectivo contado" className="h-10 w-full rounded-lg border border-slate-200 px-3" required />
                <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} aria-label="Observaciones del arqueo" placeholder="Observaciones del arqueo" maxLength={500} className="min-h-24 w-full rounded-lg border border-slate-200 p-3" />
                <button disabled={procesando} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"><LockKeyhole className="h-4 w-4" /> Cerrar turno</button>
              </form>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
