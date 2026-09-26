"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaCorta } from '@/lib/fechas';
import {
  User, FileText, RefreshCw,
  AlertCircle, CheckCircle2
} from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

interface ICliente { id: string; nombre: string; rfc?: string; email?: string; telefono?: string; }
interface IMovimiento {
  fecha: string; tipo: 'VENTA' | 'ABONO';
  folio: string; descripcion: string;
  cargo: number; abono: number; saldo: number;
}
interface IEstadoCuenta {
  cliente: ICliente;
  periodo: { desde: string | null; hasta: string | null };
  saldoAnterior: number;
  totalCargos: number;
  totalAbonos: number;
  saldoActual: number;
  movimientos: IMovimiento[];
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const fmtFecha = (s: string) =>
  fechaCorta(s);

const HOY = new Date();
const DESDE = new Date(HOY.getFullYear(), HOY.getMonth(), 1).toISOString().split('T')[0];
const HASTA = HOY.toISOString().split('T')[0];

const COLUMNAS_EC = [
  { key: 'fecha', label: 'Fecha', fmt: (v: string) => new Date(v + 'T12:00:00').toLocaleDateString('es-MX') },
  { key: 'tipo', label: 'Tipo', fmt: (v: string) => v === 'VENTA' ? 'Venta' : 'Abono' },
  { key: 'folio', label: 'Folio' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cargo', label: 'Cargo', fmt: (v: number) => v > 0 ? '$' + Number(v).toFixed(2) : '' },
  { key: 'abono', label: 'Abono', fmt: (v: number) => v > 0 ? '$' + Number(v).toFixed(2) : '' },
  { key: 'saldo', label: 'Saldo', fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function EstadoCuentaClientePage() {
  const [clientes, setClientes] = useState<ICliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [desde, setDesde] = useState(DESDE);
  const [hasta, setHasta] = useState(HASTA);
  const [datos, setDatos] = useState<IEstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(false);
  /*
    Un reporte que no se pudo consultar no es un reporte en cero. `if (r.ok)`
    sin `else` presentaba cualquier fallo —un 403, el backend reiniciándose—
    como un periodo sin movimiento, que es la conclusión contraria.
  */
  const [error, setError] = useState('');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h = () => ({ Authorization: `Bearer ${tok()}` });

  useEffect(() => {
    if (busqueda.length < 2) { setClientes([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/clientes?filtro=${encodeURIComponent(busqueda)}`, { headers: h() });
      if (r.ok) { const d = await r.json(); setClientes(Array.isArray(d) ? d : d.clientes ?? []); }
      else { setClientes([]); setError('No se pudo buscar clientes.'); }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    const params = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
    try {
      const r = await fetch(`${api}/credito/estado-cuenta/${clienteId}?${params}`, { headers: h() });
      if (r.ok) { setDatos(await r.json()); setError(''); }
      else {
        setDatos(null);
        setError(r.status === 403
          ? 'Tu perfil no incluye el estado de cuenta.'
          : 'No se pudo consultar el estado de cuenta de este cliente.');
      }
    } catch {
      setDatos(null);
      setError('No hay conexión con el servidor.');
    }
    setCargando(false);
  }, [clienteId, desde, hasta]);

  useEffect(() => { if (clienteId) cargar(); }, [cargar]);

  const seleccionarCliente = (c: ICliente) => {
    setClienteId(c.id); setBusqueda(c.nombre); setClientes([]);
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reportes</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <FileText className="w-8 h-8 text-indigo-500" /> Estado de Cuenta
          </h1>
          <p className="text-slate-500 text-sm mt-1">Ventas, abonos y saldo pendiente por cliente.</p>
        </div>
        {datos && (
          <button onClick={() => window.print()}>
            🖨 Imprimir
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-64 relative">
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Cliente</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={busqueda}
                onChange={e => { setBusqueda(e.target.value); if (!e.target.value) { setClienteId(''); setDatos(null); } }}
                placeholder="Buscar por nombre o RFC..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              {clientes.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                  {clientes.map(c => (
                    <li key={c.id} onMouseDown={() => seleccionarCliente(c)}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{c.nombre}</p>
                        {c.rfc && <p className="text-xs font-mono text-slate-400">{c.rfc}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={cargar} disabled={!clienteId || cargando}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm text-sm">
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Consultar
          </button>
        </div>
      </div>

      {!clienteId && (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <User className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <p className="font-bold text-xl text-slate-600">Selecciona un cliente</p>
          <p className="text-slate-400 text-sm mt-1">Busca por nombre o RFC para ver su estado de cuenta.</p>
        </div>
      )}

      {clienteId && cargando && (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Generando estado de cuenta...</p>
        </div>
      )}

      {datos && !cargando && (
        <div className="space-y-5">
          {/* Header reporte */}
          <div className="bg-slate-900 text-white rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Estado de Cuenta</p>
                <h2 className="text-2xl font-black">{datos.cliente.nombre}</h2>
                <div className="flex gap-4 mt-2 text-sm text-slate-400">
                  {datos.cliente.rfc && <span className="font-mono">{datos.cliente.rfc}</span>}
                  {datos.cliente.email && <span>{datos.cliente.email}</span>}
                  {datos.cliente.telefono && <span>{datos.cliente.telefono}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-1">Período</p>
                <p className="text-sm font-bold">
                  {datos.periodo.desde ? fmtFecha(datos.periodo.desde) : 'Inicio'} —{' '}
                  {datos.periodo.hasta ? fmtFecha(datos.periodo.hasta) : 'Hoy'}
                </p>
                <p className="text-xs text-slate-400 mt-2">Generado: {new Date().toLocaleDateString('es-MX')}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Saldo anterior', val: datos.saldoAnterior, cls: 'border-slate-200', txt: 'text-slate-700' },
              { label: 'Total cargos', val: datos.totalCargos, cls: 'border-rose-100', txt: 'text-rose-600' },
              { label: 'Total abonos', val: datos.totalAbonos, cls: 'border-emerald-100', txt: 'text-emerald-600' },
              {
                label: 'Saldo actual', val: datos.saldoActual,
                cls: datos.saldoActual > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50',
                txt: datos.saldoActual > 0 ? 'text-amber-700' : 'text-emerald-700'
              },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-2xl border-2 p-4 shadow-sm ${k.cls}`}>
                <p className="text-xs font-bold uppercase text-slate-400 mb-1">{k.label}</p>
                <p className={`text-xl font-black ${k.txt}`}>{fmt$(k.val)}</p>
              </div>
            ))}
          </div>

          {/* Movimientos */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Movimientos</p>
              <p className="text-xs text-slate-400">{datos.movimientos.length} registros</p>
            </div>
            {datos.movimientos.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-semibold">Sin movimientos en el período</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs uppercase text-slate-500 font-bold">
                      <th className="px-5 py-3 text-left">Fecha</th>
                      <th className="px-5 py-3 text-left">Tipo</th>
                      <th className="px-5 py-3 text-left">Folio</th>
                      <th className="px-5 py-3 text-left">Descripción</th>
                      <th className="px-5 py-3 text-right text-rose-500">Cargo</th>
                      <th className="px-5 py-3 text-right text-emerald-500">Abono</th>
                      <th className="px-5 py-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {datos.saldoAnterior > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase">Saldo anterior</td>
                        <td className="px-5 py-2 text-right font-black text-slate-700 font-mono text-xs">{fmt$(datos.saldoAnterior)}</td>
                      </tr>
                    )}
                    {datos.movimientos.map((m, i) => (
                      <tr key={i} className={`hover:bg-slate-50 transition-colors ${m.tipo === 'ABONO' ? 'bg-emerald-50/30' : ''}`}>
                        <td className="px-5 py-3 text-slate-500 text-xs">{fmtFecha(m.fecha)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.tipo === 'VENTA' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {m.tipo === 'VENTA' ? 'Venta' : 'Abono'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-indigo-600 text-xs font-bold">{m.folio}</td>
                        <td className="px-5 py-3 text-slate-600 text-xs max-w-xs truncate">{m.descripcion}</td>
                        <td className="px-5 py-3 text-right font-mono text-rose-600 text-xs font-bold">{m.cargo > 0 ? fmt$(m.cargo) : ''}</td>
                        <td className="px-5 py-3 text-right font-mono text-emerald-600 text-xs font-bold">{m.abono > 0 ? fmt$(m.abono) : ''}</td>
                        <td className="px-5 py-3 text-right font-mono font-black text-xs">
                          <span className={m.saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmt$(m.saldo)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                    <tr>
                      <td colSpan={4} className="px-5 py-3 text-right text-xs font-black uppercase text-slate-500 tracking-widest">Totales</td>
                      <td className="px-5 py-3 text-right font-black font-mono text-rose-700">{fmt$(datos.totalCargos)}</td>
                      <td className="px-5 py-3 text-right font-black font-mono text-emerald-700">{fmt$(datos.totalAbonos)}</td>
                      <td className="px-5 py-3 text-right font-black font-mono text-lg">
                        <span className={datos.saldoActual > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmt$(datos.saldoActual)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {datos.saldoActual > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800">Saldo pendiente de pago</p>
                <p className="text-sm text-amber-700 mt-1">El cliente tiene <strong>{fmt$(datos.saldoActual)}</strong> pendiente.</p>
              </div>
            </div>
          ) : datos.movimientos.length > 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <p className="font-semibold text-emerald-800">Cliente al corriente — sin saldo pendiente</p>
            </div>
          ) : null}
        </div>
      )}

      <style>{`@media print { @page { margin: 10mm; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  );
}
