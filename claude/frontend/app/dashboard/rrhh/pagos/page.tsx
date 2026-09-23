'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, conPermiso } from '@/lib/api';
import { dinero } from '@/lib/format';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Periodo = { id:string; numero:number; ejercicio:number; totalNeto:number; estado:string };
/* El catalogo devuelve `numeroCuenta`; `codigo` no existe en la respuesta. */
type Cuenta = { id:string; numeroCuenta?:string; codigo?:string; nombre?:string };
const claveDe = (c: Cuenta) => c.numeroCuenta ?? c.codigo ?? '';
type Aplicacion = { metodo:string; monto:number; referencia:string; cuentaFinancieraId:string; moneda:string; tipoCambio:number };
type Pago = { estado:string; totalPeriodo:number; totalAplicado:number; saldo:number; polizaPagoId?:string; aplicaciones?:Aplicacion[] };

const nueva = (): Aplicacion => ({ metodo:'TRANSFERENCIA', monto:0, referencia:'', cuentaFinancieraId:'', moneda:'MXN', tipoCambio:1 });
function lista<T>(x: unknown): T[] { if (Array.isArray(x)) return x as T[]; if (x && typeof x === 'object' && Array.isArray((x as {data?:unknown}).data)) return (x as {data:T[]}).data; return []; }

export default function PagosNominaPage() {
  const search = useSearchParams();
  const [periodos,setPeriodos] = useState<Periodo[]>([]);
  const [cuentas,setCuentas] = useState<Cuenta[]>([]);
  const [periodoId,setPeriodoId] = useState(search.get('periodoId') ?? '');
  const [aplicaciones,setAplicaciones] = useState<Aplicacion[]>([nueva()]);
  const [pago,setPago] = useState<Pago|null>(null);
  const [mensaje,setMensaje] = useState<{texto:string;ok:boolean}|null>(null);
  const [guardando,setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Periodo[]>('/rrhh/nomina/periodos'),
      // Tesoreria opera esta pantalla y el catalogo de cuentas es de Finanzas:
      // su 403 no puede llevarse por delante la lista de periodos.
      conPermiso(api.get<unknown>('/finanzas/cuentas-contables', { query:{ soloAfectables:true } })),
    ]).then(([ps,cs]) => {
      setPeriodos(lista<Periodo>(ps)); setCuentas(lista<Cuenta>(cs.valor));
      if (!periodoId && lista<Periodo>(ps)[0]) setPeriodoId(lista<Periodo>(ps)[0].id);
    }).catch((e) => setMensaje({texto:e instanceof Error?e.message:'No se pudieron cargar los catálogos.',ok:false}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!periodoId) { setPago(null); return; }
    api.get<Pago>(`/rrhh/nomina-avanzada/periodos/${periodoId}/pago`)
      .then(setPago).catch(() => setPago(null));
  }, [periodoId]);

  const periodo = useMemo(() => periodos.find((p)=>p.id===periodoId),[periodos,periodoId]);
  const total = aplicaciones.reduce((s,a)=>s+Number(a.monto||0)*Number(a.tipoCambio||1),0);
  const diferencia = Number(periodo?.totalNeto ?? 0) - total;
  const errores = aplicaciones.flatMap((a,i) => {
    const r:string[]=[];
    if (a.monto<=0) r.push(`Aplicación ${i+1}: monto inválido`);
    if (['TRANSFERENCIA','CHEQUE'].includes(a.metodo) && !a.referencia.trim()) r.push(`Aplicación ${i+1}: falta referencia`);
    if (!a.cuentaFinancieraId) r.push(`Aplicación ${i+1}: selecciona cuenta financiera`);
    return r;
  });

  function actualizar(i:number, cambios:Partial<Aplicacion>) { setAplicaciones((actual)=>actual.map((a,j)=>j===i?{...a,...cambios}:a)); }

  async function registrar() {
    if (!periodo || Math.abs(diferencia)>.01 || errores.length) return;
    setGuardando(true); setMensaje(null);
    try {
      const resultado = await api.post<Pago>(`/rrhh/nomina-avanzada/periodos/${periodo.id}/pago`, {
        idempotencyKey: crypto.randomUUID(),
        aplicaciones: aplicaciones.map((a)=>({...a, referencia:a.referencia||undefined})),
      });
      setPago(resultado);
      setMensaje({texto:'Pago registrado, saldos de préstamos/obligaciones aplicados y póliza de pago generada.',ok:true});
    } catch (e) {
      setMensaje({texto:e instanceof ApiError?e.mensajeParaPantalla():e instanceof Error?e.message:'No se pudo registrar el pago.',ok:false});
    } finally { setGuardando(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Pagos y liquidación de nómina</h1><p className="text-sm text-slate-500">El pago exige aprobaciones completas, dispersión conciliada para transferencias y cuentas contables configuradas.</p></div>
    {mensaje&&<div className={`rounded-lg border p-3 text-sm ${mensaje.ok?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800'}`}>{mensaje.texto}</div>}
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <label className="text-sm font-medium">Periodo<select className="entrada mt-1 w-full" value={periodoId} onChange={(e)=>setPeriodoId(e.target.value)}><option value="">Selecciona…</option>{periodos.map((p)=><option key={p.id} value={p.id}>#{p.numero}/{p.ejercicio} · {p.estado} · {dinero(p.totalNeto)}</option>)}</select></label>
      {pago&&<div className="mt-4 grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-4"><div>Estado<br/><b>{pago.estado}</b></div><div>Total<br/><b>{dinero(pago.totalPeriodo)}</b></div><div>Aplicado<br/><b>{dinero(pago.totalAplicado)}</b></div><div>Saldo<br/><b>{dinero(pago.saldo)}</b></div></div>}
    </section>

    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Aplicaciones de pago</h2>
      {aplicaciones.map((a,i)=><div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-5">
        <label className="text-xs font-medium">Método<select className="entrada mt-1 w-full" value={a.metodo} onChange={(e)=>actualizar(i,{metodo:e.target.value})}><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>CHEQUE</option><option>COMPENSACION</option></select></label>
        <label className="text-xs font-medium">Monto<input className="entrada mt-1 w-full" type="number" min="0.01" step="0.01" value={a.monto} onChange={(e)=>actualizar(i,{monto:Number(e.target.value)})}/></label>
        <label className="text-xs font-medium">Referencia<input className="entrada mt-1 w-full" value={a.referencia} onChange={(e)=>actualizar(i,{referencia:e.target.value})}/></label>
        <label className="text-xs font-medium">Cuenta financiera
          {/*
            * 930 cuentas del catalogo SAT en un `<select>` nativo, sin el
            * numero de cuenta porque se pintaba `c.codigo` y el catalogo
            * devuelve `numeroCuenta`. Los nombres se repiten —«Bancos
            * nacionales» aparece una vez por agrupador— asi que se elegia a
            * ciegas la cuenta por la que sale el dinero. Mismo arreglo que en
            * la configuracion patronal.
            */}
          <BuscadorSeleccion
            className="mt-1"
            valor={a.cuentaFinancieraId}
            opciones={cuentas.map((c)=>({ valor:c.id, etiqueta:`${claveDe(c)} · ${c.nombre??c.id}`, busqueda:claveDe(c) }))}
            onChange={(id)=>actualizar(i,{cuentaFinancieraId:id})}
            placeholder="Buscar cuenta por número o nombre…"
          />
        </label>
        <div className="flex items-end"><button className="btn btn-secundario w-full" disabled={aplicaciones.length===1} onClick={()=>setAplicaciones((x)=>x.filter((_,j)=>j!==i))}>Quitar</button></div>
      </div>)}
      <button className="btn btn-secundario" onClick={()=>setAplicaciones((x)=>[...x,nueva()])}>Agregar forma de pago</button>
      {errores.length>0&&<ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errores.map((e)=><li key={e}>• {e}</li>)}</ul>}
      <div className="grid gap-3 border-t pt-4 md:grid-cols-3"><div>Neto autorizado<br/><b>{dinero(periodo?.totalNeto??0)}</b></div><div>Total aplicaciones<br/><b>{dinero(total)}</b></div><div>Diferencia<br/><b className={Math.abs(diferencia)<.01?'text-emerald-700':'text-red-700'}>{dinero(diferencia)}</b></div></div>
      <button className="btn btn-primario" disabled={guardando||!periodo||Math.abs(diferencia)>.01||errores.length>0||pago?.estado==='PAGADO'} onClick={()=>void registrar()}>{guardando?'Registrando…':'Registrar pago y póliza'}</button>
    </section>
  </div>;
}
