// app/dashboard/hoteleria/recetas/WizardRecetas.tsx
"use client";
import { useState, useEffect } from 'react';
import { peticion } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2, Sparkles, AlertTriangle, ArrowRight, X, Wallet, FolderTree, Package } from 'lucide-react';
import { plural } from '@/lib/format';

import { useT } from '@/components/I18nProvider';
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
  const t = useT();
  const [diag, setDiag] = useState<IDiagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const cargar = async () => {
    setCargando(true);
    const r = await peticion(`/recetas/wizard/diagnostico`, { headers: h() });
    if (r.ok) setDiag(await r.json());
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const ejecutar = async (accion: string) => {
    setAccionEnCurso(accion);
    setMsg('');
    let url = '';
    let body: any = {};
    /*
     * El camino va RELATIVO: `peticion()` le pone delante la dirección de la
     * API. Dejar aquí `${api}` producía una URL con la base dos veces —y la
     * petición no salía—. Se escapó en la migración del 20-oct porque esta
     * llamada arma la ruta en una variable en lugar de pasarla escrita.
     */
    if (accion === 'crear-cuentas') url = `/recetas/wizard/crear-cuentas`;
    if (accion === 'crear-categoria') { url = `/recetas/wizard/crear-categoria`; body = { nombre: 'Insumos Bar' }; }

    if (url) {
      const r = await peticion(url, { method: 'POST', headers: h(), body: JSON.stringify(body) });
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
          <p className="font-medium text-slate-800 text-sm">{t(titulo)}</p>
        </div>
        {detalle && <p className="text-xs text-slate-500 mt-1">{t(detalle)}</p>}
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-start overflow-y-auto [&>*]:my-auto justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t("Verificación previa")}</h3>
            <p className="text-sm text-slate-500">{t("Antes de crear recetas, revisemos que todo esté listo.")}</p>
          </div>
          <button aria-label={t("Cerrar")} title={t("Cerrar")} onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {cargando ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
          ) : diag ? (
            <div className="space-y-3">
              <Item ok={diag.checks.tieneCuentaInventario} icon={Wallet}
                titulo={t("Cuenta de inventario (activo)")}
                detalle={diag.detalle.cuentaInventario ? `${diag.detalle.cuentaInventario.numero} · ${diag.detalle.cuentaInventario.nombre}` : t("No se encontró una cuenta de inventario.")}
                accion={!diag.checks.tieneCuentaInventario ? 'crear-cuentas' : null} textoAccion="Crear cuentas" />

              <Item ok={diag.checks.tieneCuentaCosto} icon={Wallet}
                titulo={t("Cuenta de costo de ventas")}
                detalle={diag.detalle.cuentaCosto ? `${diag.detalle.cuentaCosto.numero} · ${diag.detalle.cuentaCosto.nombre}` : t("No se encontró una cuenta de costo.")}
                accion={!diag.checks.tieneCuentaCosto ? 'crear-cuentas' : null} textoAccion="Crear cuentas" />

              <Item ok={diag.checks.tieneCategoriaInsumos} icon={FolderTree}
                titulo={t("Categoría para insumos")}
                detalle={diag.checks.tieneCategoriaInsumos ? t("Ya tienes una categoría para insumos.") : t("Crea una categoría \"Insumos Bar\" mapeada a tus cuentas.")}
                accion={!diag.checks.tieneCategoriaInsumos ? 'crear-categoria' : null} textoAccion={t("Crear categoría")} />

              <Item ok={diag.checks.tieneInsumos} icon={Package}
                titulo={t("Productos disponibles como insumos")}
                detalle={`${plural(diag.detalle.totalProductos, 'producto', 'productos')} en tu catálogo.`}
                accion={null} textoAccion="" />

              {!diag.checks.tieneInsumos && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  
                  {t("No tienes productos aún. Crea tus insumos (tequila, queso, pan…) en Inventario → Productos antes de armar recetas.")}
                </div>
              )}

              {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("No se pudo cargar el diagnóstico.")}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-200 rounded-lg">{t("Cerrar")}</button>
          <button onClick={onListo} disabled={!diag?.listoParaRecetas}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40">
            
            {t("Continuar a la receta")} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
