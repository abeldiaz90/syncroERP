"use client";

/**
 * ============================================================================
 * Crédito → Productos
 * ----------------------------------------------------------------------------
 * El catálogo comercial de crédito de la empresa. Antes esto eran cinco valores
 * escritos en el código del ERP y tres identificadores de Fineract capturados a
 * mano en un JSON: agregar «12 meses sin intereses» requería desplegar.
 *
 * La pantalla está organizada alrededor de una sola pregunta —«¿qué le falta a
 * esto para poder venderse?»—, que es lo que contesta la columna de la derecha.
 * Con registro externo contratado la respuesta tiene tres pasos (existir allá,
 * cuadrar, activarse); sin él, uno.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Tags, Plus, X, Edit2, RefreshCw, ShieldCheck, Power, PauseCircle,
  CheckCircle2, AlertCircle, Loader2, Calendar, Calculator, Sprout,
  Link2, Link2Off, Save,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { confirmarElegante } from '@/components/ui/dialogos';
import { PuedeCrear, PuedeEditar } from '@/app/components/ProtectedElement';

interface IProducto {
  id: string; codigo: string; nombre: string; descripcion: string|null;
  unidadPlazo: 'DIAS'|'MESES'; cadaCuantos: number;
  cuotasMinimas: number; cuotasMaximas: number;
  sinInteres: boolean; tasaInteresMensual: number; tasaEditable: boolean;
  montoMinimo: number; montoMaximo: number; moneda: string;
  estado: 'BORRADOR'|'ACTIVO'|'SUSPENDIDO';
  origen: 'ERP'|'EXTERNO';
  verificadoEn: string|null;
  resultadoVerificacion: Record<string, unknown>|null;
  tipoCreditoHeredado: string|null;
}

interface IFilaEstado {
  id: string; codigo: string; nombre: string; estado: string; origen: string;
  plazo: string; cuotas: string; tasaInteresMensual: number;
  idExterno: string|null; verificadoEn: string|null;
  vendible: boolean; falta: string|null;
}

interface IEstado { exigeCorrespondencia: boolean; productos: IFilaEstado[]; }

interface IDiferencia {
  cuota?: number; campo?: string; erp?: unknown; externo?: unknown;
}

const FORM_VACIO = {
  codigo: '', nombre: '', descripcion: '',
  unidadPlazo: 'MESES' as 'DIAS'|'MESES', cadaCuantos: '1',
  cuotasMinimas: '3', cuotasMaximas: '12',
  sinInteres: true, tasaInteresMensual: '0', tasaEditable: false,
  montoMinimo: '0', montoMaximo: '0',
};

const ESTILO_ESTADO: Record<string, string> = {
  ACTIVO:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  BORRADOR:   'bg-amber-50 text-amber-700 border-amber-200',
  SUSPENDIDO: 'bg-slate-100 text-slate-500 border-slate-200',
};

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
const n = (v: unknown) => Number(v) || 0;

export default function ProductosCreditoPage() {
  const [productos, setProductos] = useState<IProducto[]>([]);
  const [estado, setEstado]       = useState<IEstado|null>(null);
  const [cargando, setCargando]   = useState(true);
  const [ocupado, setOcupado]     = useState('');
  const [modal, setModal]         = useState(false);
  const [editando, setEditando]   = useState<IProducto|null>(null);
  const [form, setForm]           = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle]     = useState<IProducto|null>(null);
  const [aviso, setAviso]         = useState<{msg:string;ok:boolean}|null>(null);

  const decir = (msg: string, ok = true) => {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 6000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, est] = await Promise.all([
        api.get<IProducto[]>('/credito/productos'),
        api.get<IEstado>('/credito/productos/estado'),
      ]);
      setProductos(lista);
      setEstado(est);
    } catch (e) {
      decir(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo cargar el catálogo.', false);
    }
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const filaDe = (id: string) => estado?.productos.find(p => p.id === id) ?? null;

  /** Envuelve una acción del servidor: ocupa la fila, avisa y recarga. */
  const accion = async (id: string, etiqueta: string, hacer: () => Promise<unknown>) => {
    setOcupado(id + etiqueta);
    try {
      await hacer();
      await cargar();
      decir(`${etiqueta} listo.`);
    } catch (e) {
      decir(e instanceof ApiError ? e.mensajeParaPantalla() : `No se pudo ${etiqueta.toLowerCase()}.`, false);
    }
    setOcupado('');
  };

  const verificar = (p: IProducto) =>
    accion(p.id, 'Verificar', async () => {
      const r = await api.post<{ aplicable: boolean; cuadra?: boolean; diferencias?: IDiferencia[]; error?: string }>(
        `/credito/productos/${p.id}/verificar`,
      );
      if (r.aplicable === false) return;
      if (!r.cuadra) {
        // Se lanza para que el aviso salga en rojo: «no cuadra» no es un éxito
        // sólo porque la llamada haya respondido 200.
        throw new ApiError(400, r.error ?? `No cuadra con el registro externo: ${r.diferencias?.length ?? 0} diferencia(s). Abre el detalle para verlas.`);
      }
    });

  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setModal(true); };

  const abrirEdicion = (p: IProducto) => {
    setEditando(p);
    setForm({
      codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion ?? '',
      unidadPlazo: p.unidadPlazo, cadaCuantos: String(p.cadaCuantos),
      cuotasMinimas: String(p.cuotasMinimas), cuotasMaximas: String(p.cuotasMaximas),
      sinInteres: p.sinInteres, tasaInteresMensual: String(p.tasaInteresMensual),
      tasaEditable: p.tasaEditable,
      montoMinimo: String(p.montoMinimo), montoMaximo: String(p.montoMaximo),
    });
    setModal(true);
  };

  const guardar = async () => {
    setGuardando(true);
    const cuerpo = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      unidadPlazo: form.unidadPlazo,
      cadaCuantos: n(form.cadaCuantos),
      cuotasMinimas: n(form.cuotasMinimas),
      cuotasMaximas: n(form.cuotasMaximas),
      sinInteres: form.sinInteres,
      tasaInteresMensual: form.sinInteres ? 0 : n(form.tasaInteresMensual),
      tasaEditable: form.tasaEditable,
      montoMinimo: n(form.montoMinimo),
      montoMaximo: n(form.montoMaximo),
    };
    try {
      if (editando) {
        await api.patch(`/credito/productos/${editando.id}`, cuerpo);
        decir('Producto actualizado. Si cambiaste plazo o precio, hay que verificarlo otra vez.');
      } else {
        await api.post('/credito/productos', { ...cuerpo, codigo: form.codigo.trim().toUpperCase() });
        decir('Producto creado en borrador. Sincronízalo y verifícalo antes de activarlo.');
      }
      setModal(false);
      await cargar();
    } catch (e) {
      decir(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo guardar.', false);
    }
    setGuardando(false);
  };

  const exige = estado?.exigeCorrespondencia ?? false;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Tags className="w-6 h-6 text-indigo-600"/> Productos de crédito
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lo que la empresa puede vender a crédito: plazo, tasa y límites.
          </p>
          <p className="text-xs mt-2 flex items-center gap-1.5">
            {exige ? (
              <><Link2 className="w-3.5 h-3.5 text-indigo-500"/>
              <span className="text-slate-600">
                La cartera se lleva en un registro externo: cada producto debe existir allá y calcular la misma tabla antes de poder venderse.
              </span></>
            ) : (
              <><Link2Off className="w-3.5 h-3.5 text-slate-400"/>
              <span className="text-slate-600">
                Sin registro externo: el catálogo es independiente y basta activarlo.
              </span></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <PuedeCrear ruta="/credito/productos">
            <button onClick={()=>void accion('todos','Sembrar',()=>api.post('/credito/productos/sembrar'))}
              disabled={!!ocupado}
              title="Crea el catálogo inicial: 30, 60 y 90 días, meses sin intereses y mensualidades con interés."
              className="px-3 py-2 text-sm font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50">
              <Sprout className="w-4 h-4"/> Sembrar catálogo
            </button>
          </PuedeCrear>
          {exige&&(
            <PuedeEditar ruta="/credito/productos/:id">
              <button onClick={()=>void accion('todos','Sincronizar',()=>api.post('/credito/productos/sincronizar'))}
                disabled={!!ocupado}
                title="Crea allá lo que falte e importa en borrador lo que exista allá y aquí no."
                className="px-3 py-2 text-sm font-bold rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-1.5 disabled:opacity-50">
                {ocupado==='todosSincronizar'?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>} Sincronizar
              </button>
            </PuedeEditar>
          )}
          <PuedeCrear ruta="/credito/productos">
            <button onClick={abrirNuevo}
              className="px-4 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5">
              <Plus className="w-4 h-4"/> Nuevo producto
            </button>
          </PuedeCrear>
        </div>
      </div>

      {aviso&&(
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-start gap-2 ${aviso.ok?'bg-emerald-50 text-emerald-800 border border-emerald-200':'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {aviso.ok?<CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0"/>:<AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>}
          <span>{aviso.msg}</span>
        </div>
      )}

      {cargando ? (
        <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>
      ) : productos.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl">
          <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2"/>
          <p className="font-bold text-slate-600">Todavía no hay productos de crédito.</p>
          <p className="text-sm text-slate-400 mt-1">
            «Sembrar catálogo» deja los cinco de siempre listos; «Nuevo producto» crea uno a tu medida.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Producto</th>
                <th className="px-4 py-3 text-left font-bold">Plazo</th>
                <th className="px-4 py-3 text-left font-bold">Cuotas</th>
                <th className="px-4 py-3 text-right font-bold">Tasa</th>
                <th className="px-4 py-3 text-right font-bold">Importe</th>
                <th className="px-4 py-3 text-left font-bold">Estado</th>
                {exige&&<th className="px-4 py-3 text-left font-bold">Externo</th>}
                <th className="px-4 py-3 text-left font-bold">Para vender falta</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.map(p=>{
                const fila = filaDe(p.id);
                const trabajando = ocupado.startsWith(p.id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.cuotasMaximas>1?<Calculator className="w-4 h-4 text-slate-400"/>:<Calendar className="w-4 h-4 text-slate-400"/>}
                        <div>
                          <p className="font-bold text-slate-800">{p.nombre}</p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {p.codigo}
                            {p.origen==='EXTERNO'&&<span className="ml-2 font-sans text-indigo-500">importado</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      cada {p.cadaCuantos} {p.unidadPlazo==='MESES'?'mes(es)':'días'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.cuotasMinimas}–{p.cuotasMaximas}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.sinInteres
                        ? <span className="text-emerald-700 font-semibold">sin interés</span>
                        : <span className="font-semibold">{p.tasaInteresMensual}% mensual{p.tasaEditable&&<span className="text-[10px] text-amber-600 font-normal"> · editable</span>}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap text-xs">
                      {n(p.montoMinimo)===0&&n(p.montoMaximo)===0
                        ? 'sin límite'
                        : `${fmt(p.montoMinimo)} – ${n(p.montoMaximo)===0?'∞':fmt(p.montoMaximo)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${ESTILO_ESTADO[p.estado]}`}>
                        {p.estado}
                      </span>
                    </td>
                    {exige&&(
                      <td className="px-4 py-3 text-xs">
                        {fila?.idExterno
                          ? <span className="font-mono text-slate-600">#{fila.idExterno}</span>
                          : <span className="text-amber-600 font-semibold">sin vínculo</span>}
                        {p.verificadoEn&&<p className="text-[10px] text-emerald-600 mt-0.5">verificado</p>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs">
                      {fila?.vendible
                        ? <span className="text-emerald-700 font-bold">nada, se puede vender</span>
                        : <button onClick={()=>setDetalle(p)} className="text-left text-amber-700 hover:underline">
                            {fila?.falta ?? '—'}
                          </button>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <PuedeEditar ruta="/credito/productos/:id">
                          <button onClick={()=>abrirEdicion(p)} disabled={trabajando}
                            title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">
                            <Edit2 className="w-4 h-4"/>
                          </button>
                          {exige&&(
                            <button onClick={()=>void verificar(p)} disabled={trabajando}
                              title="Comparar la tabla de amortización con la del registro externo"
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40">
                              {ocupado===p.id+'Verificar'?<Loader2 className="w-4 h-4 animate-spin"/>:<ShieldCheck className="w-4 h-4"/>}
                            </button>
                          )}
                          {p.estado==='ACTIVO' ? (
                            <button onClick={async()=>{
                                if (await confirmarElegante(`¿Dejar de vender ${p.nombre}? Los créditos vivos no se tocan.`, { titulo:'Suspender producto' }))
                                  void accion(p.id,'Suspender',()=>api.post(`/credito/productos/${p.id}/suspender`));
                              }} disabled={trabajando}
                              title="Suspender" className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40">
                              <PauseCircle className="w-4 h-4"/>
                            </button>
                          ) : (
                            <button onClick={()=>void accion(p.id,'Activar',()=>api.post(`/credito/productos/${p.id}/activar`))}
                              disabled={trabajando}
                              title="Activar para la venta" className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40">
                              {ocupado===p.id+'Activar'?<Loader2 className="w-4 h-4 animate-spin"/>:<Power className="w-4 h-4"/>}
                            </button>
                          )}
                        </PuedeEditar>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detalle de la última verificación ── */}
      {detalle&&(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-400"/> {detalle.nombre}</h2>
              <button onClick={()=>setDetalle(null)} className="p-1.5 text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto text-sm">
              <p className="text-slate-500 mb-3">
                {filaDe(detalle.id)?.falta ?? 'El producto se puede vender.'}
              </p>
              {(() => {
                const r = detalle.resultadoVerificacion as
                  { error?: string; motivo?: string; diferencias?: IDiferencia[]; capital?: number; numeroCuotas?: number; fechaInicio?: string } | null;
                if (!r) return <p className="text-slate-400">Todavía no se ha verificado.</p>;
                return (
                  <>
                    {!!r.capital&&(
                      <p className="text-xs text-slate-400 mb-3">
                        Prueba con ${fmt(r.capital)} a {r.numeroCuotas} cuota(s) desde {r.fechaInicio}.
                      </p>
                    )}
                    {!!(r.error??r.motivo)&&(
                      <p className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{r.error ?? r.motivo}</p>
                    )}
                    {!!r.diferencias?.length&&(
                      <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold">Cuota</th>
                            <th className="px-3 py-2 text-left font-bold">Campo</th>
                            <th className="px-3 py-2 text-left font-bold">ERP</th>
                            <th className="px-3 py-2 text-left font-bold">Externo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {r.diferencias.map((d,i)=>(
                            <tr key={i}>
                              <td className="px-3 py-1.5">{d.cuota ?? '—'}</td>
                              <td className="px-3 py-1.5 font-semibold">{d.campo}</td>
                              <td className="px-3 py-1.5 font-mono">{String(d.erp)}</td>
                              <td className="px-3 py-1.5 font-mono text-rose-600">{String(d.externo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {!r.diferencias?.length&&!r.error&&!r.motivo&&(
                      <p className="text-emerald-700 font-semibold">La última verificación cuadró.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Alta y edición ── */}
      {modal&&(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold">{editando ? `Editar ${editando.codigo}` : 'Nuevo producto de crédito'}</h2>
              <button onClick={()=>setModal(false)} className="p-1.5 text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {!editando&&(
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Código</label>
                  <input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})}
                    placeholder="MSI-18"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Se usa el mismo código en los dos sistemas para que la correspondencia se vea sin consultar nada. Letras, dígitos y guiones.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre comercial</label>
                <input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}
                  placeholder="18 meses sin intereses"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Vence cada</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" max="365" value={form.cadaCuantos} onChange={e=>setForm({...form,cadaCuantos:e.target.value})}
                      className="w-20 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                    <select value={form.unidadPlazo} onChange={e=>setForm({...form,unidadPlazo:e.target.value as 'DIAS'|'MESES'})}
                      className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm">
                      <option value="DIAS">días</option>
                      <option value="MESES">meses</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Cuotas (de / a)</label>
                  <div className="flex gap-2 items-center">
                    <input type="number" min="1" max="60" value={form.cuotasMinimas} onChange={e=>setForm({...form,cuotasMinimas:e.target.value})}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                    <span className="text-slate-400">–</span>
                    <input type="number" min="1" max="60" value={form.cuotasMaximas} onChange={e=>setForm({...form,cuotasMaximas:e.target.value})}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Iguales si el plazo es fijo (1 y 1 para un solo pago).</p>
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={form.sinInteres}
                  onChange={e=>setForm({...form,sinInteres:e.target.checked, tasaInteresMensual: e.target.checked ? '0' : form.tasaInteresMensual})}
                  className="w-4 h-4 text-indigo-600 rounded"/>
                <div>
                  <p className="text-sm font-bold text-slate-800">Sin intereses</p>
                  <p className="text-xs text-slate-500">La empresa absorbe el costo financiero.</p>
                </div>
              </label>
              {!form.sinInteres&&(
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Tasa mensual (%)</label>
                    <input type="number" min="0.01" step="0.1" value={form.tasaInteresMensual} onChange={e=>setForm({...form,tasaInteresMensual:e.target.value})}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                  </div>
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer">
                    <input type="checkbox" checked={form.tasaEditable} onChange={e=>setForm({...form,tasaEditable:e.target.checked})}
                      className="w-4 h-4 text-amber-600 rounded"/>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Permitir cambiar la tasa al vender</p>
                      <p className="text-xs text-slate-600">Apágalo salvo que de verdad quieras que el cajero la mueva.</p>
                    </div>
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Importe mínimo</label>
                  <input type="number" min="0" step="0.01" value={form.montoMinimo} onChange={e=>setForm({...form,montoMinimo:e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Importe máximo</label>
                  <input type="number" min="0" step="0.01" value={form.montoMaximo} onChange={e=>setForm({...form,montoMaximo:e.target.value})}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
                  <p className="text-[11px] text-slate-400 mt-1">Cero = sin tope; el de verdad lo pone la línea del cliente.</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} rows={2}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"/>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {editando
                  ? 'Cambiar el plazo o el precio de un producto activo lo regresa a borrador: la correspondencia probada deja de ser cierta en ese momento.'
                  : exige
                    ? 'Nace en borrador. Después hay que sincronizarlo con el registro externo y verificar que las dos tablas coincidan.'
                    : 'Nace en borrador. Revísalo y actívalo para empezar a venderlo.'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button onClick={()=>setModal(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
              <button onClick={()=>void guardar()} disabled={guardando||!form.nombre.trim()||(!editando&&!form.codigo.trim())}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {guardando?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
