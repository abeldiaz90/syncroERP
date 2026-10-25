'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

import { useT } from '@/components/I18nProvider';
type Hallazgo={estado:'OK'|'ERROR'|'ADVERTENCIA';objeto:string;mensaje:string};
type R={valido:boolean;fecha:string;resumen:{errores:number;advertencias:number;tablasRevisadas:number};hallazgos:Hallazgo[]};
export default function EsquemaPage(){
  const t = useT();const [d,setD]=useState<R|null>(null);const [e,setE]=useState('');useEffect(()=>{api.get<R>('/configuracion/esquema').then(setD).catch((x:any)=>setE(x?.message||'Error al verificar esquema'));},[]);return <div className="mx-auto max-w-5xl space-y-5 p-6"><div><h1 className="text-2xl font-semibold">{t("Compatibilidad de base de datos")}</h1><p className="text-sm text-slate-500">{t("Compara el esquema real con las columnas requeridas por los flujos maduros.")}</p></div>{e&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{e}</div>}{d&&<><div className={`rounded-xl border p-5 ${d.valido?'border-emerald-200 bg-emerald-50':'border-red-200 bg-red-50'}`}><div className="text-lg font-semibold">{d.valido?t("Esquema compatible"):t("Se requieren correcciones de esquema")}</div><div className="text-sm">{t("{n0} errores · {n1} tablas revisadas", { n0: d.resumen.errores, n1: d.resumen.tablasRevisadas })}</div></div><div className="space-y-2">{d.hallazgos.length===0?<div className="rounded-xl border bg-white p-6">{t("No se encontraron diferencias requeridas.")}</div>:d.hallazgos.map((h,i)=><div key={i} className="rounded-xl border bg-white p-4"><div className="font-medium text-red-700">{h.objeto}</div><div className="text-sm text-slate-600">{t(h.mensaje)}</div></div>)}</div></>}</div>}
