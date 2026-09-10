// app/dashboard/hoteleria/recetas/WizardRecetas.tsx
"use client";
import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Sparkles, AlertTriangle, ArrowRight, X, Wallet, FolderTree, Package } from 'lucide-react';

interface IDiagnostico {
  listoParaRecetas: boolean;
  checks: {
    tieneCuentaInventario: boolean;
    tieneCuentaCosto: boolean;
    tieneCategoriaInsumos: boolean;
    tieneInsumos: boolean;
  };
  detalle: {
    cuentaInventario: { numero: string; nombre: string } | null;
    cuentaCosto: { numero: string; nombre: string } | null;
    totalProductos: number;
  };
  acciones: string[];
}

// Muestra un diagnóstico de prerequisitos antes de crear recetas y ofrece
// resolver automáticamente lo que falte (cuentas, categoría).
export default function WizardRecetas({ api, h, onListo, onClose }: {
  api: string; h: () => any; onListo: () => void; onClose: () => void;
}) {
  const [diag, setDiag] = useState<IDiagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const cargar = async () => {
    setCargando(true);
    const r = await fetch(`${api}/recetas/wizard/diagnostico`, { headers: h() });
    if (r.ok) setDiag(await r.json());
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const ejecutar = async (accion: string) => {
    setAccionEnCurso(accion);
    setMsg('');
    let url = '';
    let body: any = {};
    if (accion === 'crear-cuentas') url = `${api}/recetas/wizard/crear-cuentas`;
    if (accion === 'crear-categoria') { url = `${api}/recetas/wizard/crear-categoria`; body = { nombre: 'Insumos Bar' }; }

    if (url) {
      const r = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      setMsg(d?.mensaje || (r.ok ? 'Listo' : 'Error'));
      await cargar(); // re-diagnosticar
    }
    setAccionEnCurso(null);
  };

  const Item = ({ ok, icon: Icon, titulo, detalle, accion, textoAccion }: any) => (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${ok ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="mt-0.5">
        {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <p className="font-medium text-slate-800 text-sm">{titulo}</p>
        </div>
        {detalle && <p className="text-xs text-slate-500 mt-1">{detalle}</p>}
      </div>
      {!ok && accion && (
        <button onClick={() => ejecutar(accion)} disabled={!!accionEnCurso}
          className="flex items-center gap-1 text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap">
          {accionEnCurso === accion ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {textoAccion}
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Verificación previa</h3>
            <p className="text-sm text-slate-500">Antes de crear recetas, revisemos que todo esté listo.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {cargando ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
          ) : diag ? (
            <div className="space-y-3">
              <Item ok={diag.checks.tieneCuentaInventario} icon={Wallet}
                titulo="Cuenta de inventario (activo)"
                detalle={diag.detalle.cuentaInventario ? `${diag.detalle.cuentaInventario.numero} · ${diag.detalle.cuentaInventario.nombre}` : 'No se encontró una cuenta de inventario.'}
                accion={!diag.checks.tieneCuentaInventario ? 'crear-cuentas' : null} textoAccion="Crear cuentas" />

              <Item ok={diag.checks.tieneCuentaCosto} icon={Wallet}
                titulo="Cuenta de costo de ventas"
                detalle={diag.detalle.cuentaCosto ? `${diag.detalle.cuentaCosto.numero} · ${diag.detalle.cuentaCosto.nombre}` : 'No se encontró una cuenta de costo.'}
                accion={!diag.checks.tieneCuentaCosto ? 'crear-cuentas' : null} textoAccion="Crear cuentas" />

              <Item ok={diag.checks.tieneCategoriaInsumos} icon={FolderTree}
                titulo="Categoría para insumos"
                detalle={diag.checks.tieneCategoriaInsumos ? 'Ya tienes una categoría para insumos.' : 'Crea una categoría "Insumos Bar" mapeada a tus cuentas.'}
                accion={!diag.checks.tieneCategoriaInsumos ? 'crear-categoria' : null} textoAccion="Crear categoría" />

              <Item ok={diag.checks.tieneInsumos} icon={Package}
                titulo="Productos disponibles como insumos"
                detalle={`${diag.detalle.totalProductos} producto(s) en tu catálogo.`}
                accion={null} textoAccion="" />

              {!diag.checks.tieneInsumos && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No tienes productos aún. Crea tus insumos (tequila, queso, pan…) en Inventario → Productos antes de armar recetas.
                </div>
              )}

              {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No se pudo cargar el diagnóstico.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-200 rounded-lg">Cerrar</button>
          <button onClick={onListo} disabled={!diag?.listoParaRecetas}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40">
            Continuar a la receta <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
