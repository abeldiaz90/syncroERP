"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, ArrowRight } from 'lucide-react';
type Hallazgo={
  codigo:string;
  severidad:'ERROR'|'ADVERTENCIA';
  titulo:string;
  cantidad:number;
  detalle:string;
  ruta?:string;
  /*
   * Hasta cinco filas que dicen QUIÉN descuadra. Antes el hallazgo era sólo un
   * número con un enlace, y desde el enlace no había forma de saber qué
   * producto o qué almacén: la pantalla de destino enseña el catálogo entero.
   * Para averiguarlo había que entrar a la base de datos a mano.
   */
  ejemplos?:Array<Record<string,unknown>>;
};
type Resultado={valido:boolean;fechaValidacion:string;resumen:{errores:number;advertencias:number;hallazgos:number};hallazgos:Hallazgo[]};
export default function IntegridadPage(){const router=useRouter();const [r,setR]=useState<Resultado|null>(null);const [error,setError]=useState('');const [cargando,setCargando]=useState(true);const cargar=async()=>{setCargando(true);setError('');try{setR(await api.get<Resultado>('/configuracion/integridad'));}catch(e){setError(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo validar la integridad.');}finally{setCargando(false)}};useEffect(()=>{cargar()},[]);return <div className="mx-auto max-w-5xl p-6 space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-500">Control preventivo</p><h1 className="text-3xl font-bold">Verificación de integridad</h1><p className="mt-1 text-slate-600">Ejecuta esta revisión después de importar, limpiar o migrar datos.</p></div><button onClick={cargar} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-white"><RefreshCw size={16}/>Volver a validar</button></div>{cargando&&<div className="rounded-xl border p-5">Revisando datos…</div>}{error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}{r&&<><section className={`rounded-2xl border p-6 ${r.valido?'border-emerald-200 bg-emerald-50':'border-red-200 bg-red-50'}`}><div className="flex items-center gap-3">{r.valido?<CheckCircle2 className="text-emerald-600" size={30}/>:<XCircle className="text-red-600" size={30}/>}<div><h2 className="text-xl font-bold">{r.valido?'Base consistente para continuar':'Se encontraron bloqueos de integridad'}</h2><p>{r.resumen.errores} errores · {r.resumen.advertencias} advertencias</p></div></div></section><div className="space-y-3">{r.hallazgos.length===0?<div className="rounded-2xl border bg-white p-6">No se encontraron hallazgos.</div>:r.hallazgos.map(h=>(
  /*
   * Era un <button> con todo dentro. Al añadir la tabla de ejemplos eso dejaba
   * una tabla dentro de un botón —HTML inválido, y un lector de pantalla lee el
   * conjunto como un solo control sin nombre—. Ahora la tarjeta es una tarjeta y
   * el botón es sólo el botón, con su texto.
   */
  <div key={h.codigo} className="w-full rounded-2xl border bg-white p-5 text-left">
    <div className="flex gap-3">
      {h.severidad==='ERROR'?<XCircle className="text-red-500 shrink-0"/>:<AlertTriangle className="text-amber-500 shrink-0"/>}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold">{h.titulo}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{h.cantidad}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">{h.detalle}</p>
        {h.ejemplos&&h.ejemplos.length>0&&(
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {Object.keys(h.ejemplos[0]).map(c=>(
                    <th key={c} className="px-3 py-2 text-left font-semibold capitalize">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.ejemplos.map((fila,i)=>(
                  <tr key={i} className="border-t border-slate-100">
                    {Object.keys(h.ejemplos![0]).map(c=>(
                      <td key={c} className="px-3 py-2 text-slate-700">{fila[c]===null||fila[c]===undefined?'—':String(fila[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {h.cantidad>h.ejemplos.length&&(
              /*
               * Decir cuántos faltan evita la lectura de que son éstos y ya:
               * quien ve cinco filas y el contador en cuarenta sabe que tiene
               * que mirar la lista completa, no sólo corregir lo que ve.
               */
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                Se muestran {h.ejemplos.length} de {h.cantidad}.
              </p>
            )}
          </div>
        )}
      </div>
      {h.ruta&&(
        <button
          onClick={()=>router.push(h.ruta!)}
          className="flex h-9 shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Abrir<ArrowRight size={14}/>
        </button>
      )}
    </div>
  </div>
))}</div></>}</div>}
