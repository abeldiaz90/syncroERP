"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, CheckCircle2, AlertCircle, X,
  BookOpen, Save, RefreshCw, Calculator
} from 'lucide-react';

interface ICuentaContable {
  id: string; numeroCuenta: string; nombre: string; tipo: string;
}
interface ILinea {
  id: number; cuentaId: string; cuentaNombre: string;
  cargo: number; abono: number; referencia: string;
}

const TIPOS = [
  { value: 'DIARIO',  label: 'Diario',  prefix: 'DI', color: '#6366f1' },
  { value: 'INGRESO', label: 'Ingreso', prefix: 'IN', color: '#059669' },
  { value: 'EGRESO',  label: 'Egreso',  prefix: 'EG', color: '#ef4444' },
];

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

export default function PolizaManualPage() {
  const router = useRouter();
  const [cuentas, setCuentas]     = useState<ICuentaContable[]>([]);
  const [tipo, setTipo]           = useState('DIARIO');
  const [fecha, setFecha]         = useState(new Date().toISOString().split('T')[0]);
  const [concepto, setConcepto]   = useState('');
  const [lineas, setLineas]       = useState<ILinea[]>([
    { id: 1, cuentaId: '', cuentaNombre: '', cargo: 0, abono: 0, referencia: '' },
    { id: 2, cuentaId: '', cuentaNombre: '', cargo: 0, abono: 0, referencia: '' },
  ]);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [filtro, setFiltro]       = useState('');
  const [lineaActiva, setLineaActiva] = useState<number | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });
  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    (async () => {
      const r = await fetch(`${api}/finanzas/cuentas-contables`, { headers: h() });
      if (r.ok) setCuentas(await r.json());
    })();
  }, []);

  const totalDebe  = lineas.reduce((s, l) => s + Number(l.cargo), 0);
  const totalHaber = lineas.reduce((s, l) => s + Number(l.abono), 0);
  const diferencia = Math.abs(totalDebe - totalHaber);
  const cuadrada   = diferencia < 0.01 && totalDebe > 0;

  const cuentasFiltradas = cuentas.filter(c =>
    c.numeroCuenta.toLowerCase().includes(filtro.toLowerCase()) ||
    c.nombre.toLowerCase().includes(filtro.toLowerCase())
  ).slice(0, 20);

  const agregarLinea = () => {
    const maxId = Math.max(...lineas.map(l => l.id), 0);
    setLineas(prev => [...prev, { id: maxId + 1, cuentaId: '', cuentaNombre: '', cargo: 0, abono: 0, referencia: '' }]);
  };

  const eliminarLinea = (id: number) => {
    if (lineas.length <= 2) return;
    setLineas(prev => prev.filter(l => l.id !== id));
  };

  const actualizarLinea = (id: number, campo: keyof ILinea, valor: any) => {
    setLineas(prev => prev.map(l => l.id === id ? { ...l, [campo]: valor } : l));
  };

  const seleccionarCuenta = (lineaId: number, cuenta: ICuentaContable) => {
    actualizarLinea(lineaId, 'cuentaId', cuenta.id);
    actualizarLinea(lineaId, 'cuentaNombre', `${cuenta.numeroCuenta} — ${cuenta.nombre}`);
    setLineaActiva(null);
    setFiltro('');
  };

  const guardar = async () => {
    if (!concepto.trim()) { toast$('Escribe el concepto de la póliza', false); return; }
    if (!cuadrada) { toast$('La póliza no está cuadrada (Debe ≠ Haber)', false); return; }
    const lineasValidas = lineas.filter(l => l.cuentaId && (l.cargo > 0 || l.abono > 0));
    if (lineasValidas.length < 2) { toast$('Necesitas al menos 2 partidas válidas', false); return; }

    setGuardando(true);
    const r = await fetch(`${api}/finanzas/polizas/manual`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        tipo, fecha, concepto,
        partidas: lineasValidas.map(l => ({
          cuentaContableId: l.cuentaId,
          cargo:     Number(l.cargo),
          abono:     Number(l.abono),
          referencia: l.referencia || concepto.substring(0, 50),
        })),
      }),
    });
    setGuardando(false);
    if (r.ok) {
      const data = await r.json();
      toast$(`Póliza ${data.folio} guardada correctamente`);
      setTimeout(() => router.push('/dashboard/finanzas/polizas'), 1500);
    } else {
      const e = await r.json().catch(() => ({}));
      toast$(e.message ?? 'Error al guardar', false);
    }
  };

  const tipoInfo = TIPOS.find(t => t.value === tipo) ?? TIPOS[0];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-500"/> Nueva Póliza Manual
          </h1>
          <p className="text-slate-500 text-sm mt-1">Registra asientos contables que no se generan automáticamente.</p>
        </div>
        <button onClick={() => router.back()}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
          <X className="w-4 h-4"/>
        </button>
      </div>

      {/* Encabezado de la póliza */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Tipo */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Tipo de póliza</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  className={`py-2 rounded-xl border-2 text-xs font-bold transition-all ${tipo === t.value ? 'text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  style={tipo === t.value ? { background: t.color, borderColor: t.color } : {}}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>

          {/* Folio (automático) */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Folio</label>
            <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono text-slate-500 flex items-center gap-2">
              <span style={{ color: tipoInfo.color }}>{tipoInfo.prefix}</span>
              <span>-{new Date().getFullYear()}-</span>
              <span className="text-slate-400">####</span>
              <span className="ml-auto text-[10px] text-slate-400">Asignado al guardar</span>
            </div>
          </div>
        </div>

        {/* Concepto */}
        <div className="mt-4">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Concepto</label>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
            placeholder="Ej: Pago de renta agosto 2026, Pago de luz CFE, Ajuste contable..."
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
      </div>

      {/* Partidas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Partidas contables</p>
          <button onClick={agregarLinea}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors">
            <Plus className="w-3.5 h-3.5"/> Agregar línea
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase text-slate-500 font-bold">
                <th className="px-4 py-3 text-left w-10">#</th>
                <th className="px-4 py-3 text-left">Cuenta contable</th>
                <th className="px-4 py-3 text-right w-36">Cargo (Debe)</th>
                <th className="px-4 py-3 text-right w-36">Abono (Haber)</th>
                <th className="px-4 py-3 text-left w-48">Referencia</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((linea, idx) => (
                <tr key={linea.id} className="hover:bg-slate-50 transition-colors relative">
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{idx + 1}</td>

                  {/* Selector de cuenta */}
                  <td className="px-4 py-3 relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={lineaActiva === linea.id ? filtro : linea.cuentaNombre}
                        onChange={e => { setFiltro(e.target.value); setLineaActiva(linea.id); }}
                        onFocus={() => { setLineaActiva(linea.id); setFiltro(''); }}
                        onBlur={() => setTimeout(() => setLineaActiva(null), 200)}
                        placeholder="Buscar cuenta..."
                        className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${linea.cuentaId ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-mono font-bold' : 'border-slate-200 bg-white'}`}
                      />
                      {lineaActiva === linea.id && filtro && cuentasFiltradas.length > 0 && (
                        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                          {cuentasFiltradas.map(c => (
                            <li key={c.id}
                              onMouseDown={() => seleccionarCuenta(linea.id, c)}
                              className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                              <span className="font-mono font-bold text-indigo-600 text-xs">{c.numeroCuenta}</span>
                              <span className="text-slate-700 text-xs ml-2">{c.nombre}</span>
                              <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                c.tipo === 'ACTIVO' ? 'bg-blue-100 text-blue-700' :
                                c.tipo === 'PASIVO' ? 'bg-pink-100 text-pink-700' :
                                c.tipo === 'INGRESO' ? 'bg-green-100 text-green-700' :
                                c.tipo === 'COSTO' || c.tipo === 'GASTO' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{c.tipo}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </td>

                  {/* Cargo */}
                  <td className="px-4 py-3">
                    <input type="number" min="0" step="0.01"
                      value={linea.cargo || ''}
                      onChange={e => { actualizarLinea(linea.id, 'cargo', parseFloat(e.target.value) || 0); if (e.target.value) actualizarLinea(linea.id, 'abono', 0); }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
                      placeholder="0.00"
                    />
                  </td>

                  {/* Abono */}
                  <td className="px-4 py-3">
                    <input type="number" min="0" step="0.01"
                      value={linea.abono || ''}
                      onChange={e => { actualizarLinea(linea.id, 'abono', parseFloat(e.target.value) || 0); if (e.target.value) actualizarLinea(linea.id, 'cargo', 0); }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-300"
                      placeholder="0.00"
                    />
                  </td>

                  {/* Referencia */}
                  <td className="px-4 py-3">
                    <input type="text"
                      value={linea.referencia}
                      onChange={e => actualizarLinea(linea.id, 'referencia', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Ref. opcional"
                    />
                  </td>

                  {/* Eliminar */}
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => eliminarLinea(linea.id)} disabled={lineas.length <= 2}
                      className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg disabled:opacity-20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totales */}
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Totales:</td>
                <td className="px-4 py-3 text-right font-black font-mono text-blue-700">{fmt$(totalDebe)}</td>
                <td className="px-4 py-3 text-right font-black font-mono text-emerald-700">{fmt$(totalHaber)}</td>
                <td colSpan={2} className="px-4 py-3">
                  {totalDebe > 0 && (
                    <span className={`text-xs font-bold flex items-center gap-1 ${cuadrada ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {cuadrada
                        ? <><CheckCircle2 className="w-3.5 h-3.5"/> Cuadrada</>
                        : <><AlertCircle className="w-3.5 h-3.5"/> Diferencia: {fmt$(diferencia)}</>
                      }
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Ejemplos rápidos */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-5">
        <p className="text-xs font-bold uppercase text-indigo-600 mb-2">💡 Ejemplos de asientos comunes</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-indigo-700">
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-bold mb-1">Pago de renta</p>
            <p>Dr. 610-01 Gastos Admin</p>
            <p className="pl-4">Cr. 110-01 Caja</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-bold mb-1">Pago de nómina</p>
            <p>Dr. 610-01 Gastos Admin</p>
            <p className="pl-4">Cr. 110-01 Caja</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-bold mb-1">Depósito de capital</p>
            <p>Dr. 110-01 Caja</p>
            <p className="pl-4">Cr. 301-01 Capital</p>
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button onClick={() => router.back()}
          className="flex-1 py-3 text-slate-700 font-semibold hover:bg-slate-100 rounded-xl transition-colors border border-slate-200">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || !cuadrada || !concepto.trim()}
          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
          {guardando
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Guardando...</>
            : <><Save className="w-4 h-4"/> Guardar Póliza</>
          }
        </button>
      </div>

    </div>
  );
}
