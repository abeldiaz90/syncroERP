// app/configuracion-inicial/page.tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Landmark, Sparkles, SlidersHorizontal, Check, Loader2,
  ArrowRight, ShieldCheck, X, BookOpen,
} from 'lucide-react';

// Las 7 cuentas que se precargan — solo para mostrarlas al usuario
const CUENTAS_PREVIEW = [
  { num: '110-01', nombre: 'Caja General',            tipo: 'ACTIVO'  },
  { num: '130-01', nombre: 'Inventario de Mercancías', tipo: 'ACTIVO'  },
  { num: '210-01', nombre: 'Proveedores',             tipo: 'PASIVO'  },
  { num: '208-01', nombre: 'IVA Trasladado',          tipo: 'PASIVO'  },
  { num: '401-01', nombre: 'Ventas Nacionales',       tipo: 'INGRESO' },
  { num: '501-01', nombre: 'Costo de Ventas',         tipo: 'COSTO'   },
  { num: '601-01', nombre: 'Mermas y Pérdidas',       tipo: 'GASTO'   },
];

const TIPO_COLOR: Record<string, string> = {
  ACTIVO:  'bg-blue-50 text-blue-700',
  PASIVO:  'bg-amber-50 text-amber-700',
  INGRESO: 'bg-emerald-50 text-emerald-700',
  COSTO:   'bg-purple-50 text-purple-700',
  GASTO:   'bg-rose-50 text-rose-700',
};

export default function ConfiguracionInicialPage() {
  const router = useRouter();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').trim();
  const tok = () => localStorage.getItem('syncro_token') ?? '';

  const [cargando, setCargando] = useState(false);
  const [listo, setListo]       = useState(false);
  const [error, setError]       = useState('');
  const [resumen, setResumen]   = useState<{ creadas: number; yaExistian: number } | null>(null);

  const configurarAutomatico = async () => {
    setError('');
    setCargando(true);
    try {
      const r = await fetch(`${api}/finanzas/cuentas-contables/precargar-estandar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok()}`,
        },
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        if (r.status === 401) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
        throw new Error(d?.message || `Error al configurar (HTTP ${r.status})`);
      }
      setResumen({ creadas: d.creadas ?? 0, yaExistian: d.yaExistian ?? 0 });
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión con el servidor');
    }
    setCargando(false);
  };

  const irManual = () => router.push('/dashboard/finanzas/cuentas-contables'); // ⚠️ ajusta a tu ruta real
  const continuar = () => router.push('/dashboard'); // ⚠️ ajusta a tu ruta real de panel

  // ── Pantalla de éxito ──────────────────────────────────────────────────
  if (listo) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-10 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldCheck className="w-10 h-10 text-emerald-600"/>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Contabilidad lista</h2>
        <p className="text-slate-500 text-sm mb-6">
          {resumen && resumen.creadas > 0
            ? `Se crearon ${resumen.creadas} cuentas contables base.`
            : 'Tus cuentas contables ya estaban configuradas.'}
          {resumen && resumen.yaExistian > 0 && ` (${resumen.yaExistian} ya existían y se conservaron.)`}
          {' '}Ya puedes crear categorías y productos con respaldo contable.
        </p>
        <button onClick={continuar}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all">
          Ir al panel de control <ArrowRight className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );

  // ── Pantalla de elección ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-2">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-black text-xs">S</span>
        </div>
        <span className="font-bold text-slate-900">SyncroERP</span>
        <span className="ml-auto text-sm text-slate-400">Configuración contable</span>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-3xl w-full">

          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Landmark className="w-7 h-7 text-indigo-600"/>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">Configura tu contabilidad</h1>
            <p className="text-slate-500 max-w-xl mx-auto">
              Antes de registrar productos, tu ERP necesita cuentas contables. Cada venta,
              compra o ajuste de inventario generará su registro contable automáticamente.
              Elige cómo prefieres empezar:
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <X className="w-4 h-4 shrink-0"/> {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">

            {/* Opción automática (recomendada) */}
            <div className="relative rounded-2xl border-2 border-indigo-500 bg-white p-6 shadow-lg shadow-indigo-100 flex flex-col">
              <div className="absolute -top-3 left-6 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                ⭐ Recomendado
              </div>
              <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-indigo-600"/>
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">Configuración automática</h3>
              <p className="text-sm text-slate-500 mb-4 flex-1">
                Creamos por ti un catálogo de cuentas estándar listo para operar.
                Ideal si no manejas contabilidad — puedes ajustarlo después.
              </p>

              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1.5 max-h-52 overflow-auto">
                {CUENTAS_PREVIEW.map(c => (
                  <div key={c.num} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400 w-14 shrink-0">{c.num}</span>
                    <span className="text-slate-700 flex-1">{c.nombre}</span>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${TIPO_COLOR[c.tipo]}`}>{c.tipo}</span>
                  </div>
                ))}
              </div>

              <button onClick={configurarAutomatico} disabled={cargando}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-60">
                {cargando
                  ? <><Loader2 className="w-4 h-4 animate-spin"/> Configurando…</>
                  : <><Check className="w-4 h-4"/> Crear cuentas automáticamente</>}
              </button>
            </div>

            {/* Opción manual */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 flex flex-col">
              <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                <SlidersHorizontal className="w-6 h-6 text-slate-600"/>
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">Configurar manualmente</h3>
              <p className="text-sm text-slate-500 mb-4 flex-1">
                Prefieres crear tu propio catálogo de cuentas con tu numeración y
                estructura. Recomendado si tienes contador o un plan contable propio.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 mb-4 flex items-start gap-2">
                <BookOpen className="w-4 h-4 mt-0.5 shrink-0"/>
                <span>Te llevaremos al Catálogo de Cuentas para que las crees a tu medida. Podrás volver cuando quieras.</span>
              </div>

              <button onClick={irManual} disabled={cargando}
                className="w-full flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-60">
                Ir al catálogo de cuentas <ArrowRight className="w-4 h-4"/>
              </button>
            </div>
          </div>

          <button onClick={continuar}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-6">
            Omitir por ahora (podré configurarlo después en Finanzas)
          </button>
        </div>
      </div>
    </div>
  );
}
